// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PollInboxForUser — orchestrates the end-to-end email → task pipeline for a
// single user. Idempotent: duplicates are prevented at the DB level by the
// unique (user_id, gmail_message_id) constraint.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IGmailConnectionRepo,
  IEmailRuleRepo,
  IEmailDetectionRepo,
} from '../../domain/emailIntel/IEmailIntelRepos.js';
import type { ILLMService } from '../../domain/ai/ILLMService.js';
import { GmailProvider } from '../../infrastructure/gmail/GmailProvider.js';
import { GmailOAuthService } from '../../infrastructure/gmail/GmailOAuthService.js';
import { decryptToken, encryptToken } from '../../infrastructure/gmail/tokenCrypto.js';
import { matchEmailAgainstRules } from './MatchEmailAgainstRules.js';
import { extractTaskFromEmail } from './ExtractTaskFromEmail.js';

export interface PollResult {
  user_id: string;
  email: string;
  listed: number;
  new: number;
  matched: number;
  auto_created: number;
  queued: number;
  failed: number;
  skipped_not_configured: boolean;
  error?: string;
}

interface Deps {
  supabase: SupabaseClient;
  gmailConnectionRepo: IGmailConnectionRepo;
  emailRuleRepo: IEmailRuleRepo;
  emailDetectionRepo: IEmailDetectionRepo;
  oauthService: GmailOAuthService;
  llm: ILLMService;
  gmail: GmailProvider;
}

export async function pollInboxForUser(userId: string, deps: Deps): Promise<PollResult> {
  const {
    supabase, gmailConnectionRepo, emailRuleRepo, emailDetectionRepo, oauthService, llm, gmail,
  } = deps;

  const result: PollResult = {
    user_id: userId, email: '', listed: 0, new: 0, matched: 0,
    auto_created: 0, queued: 0, failed: 0, skipped_not_configured: false,
  };

  const conn = await gmailConnectionRepo.findByUserId(userId);
  if (!conn || !conn.is_active) {
    result.skipped_not_configured = true;
    return result;
  }
  result.email = conn.email;

  // 1. Refresh access token if needed
  let accessToken = conn.access_token ? decryptToken(conn.access_token) : null;
  const isExpired = !conn.token_expires_at || new Date(conn.token_expires_at).getTime() < Date.now() + 60_000;
  if (isExpired) {
    try {
      const fresh = await oauthService.refreshAccessToken(decryptToken(conn.refresh_token));
      accessToken = fresh.access_token;
      await gmailConnectionRepo.upsert({
        user_id: conn.user_id,
        email: conn.email,
        refresh_token: conn.refresh_token, // keep encrypted as-is
        access_token: encryptToken(fresh.access_token),
        token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
        is_active: true,
        polling_interval_minutes: conn.polling_interval_minutes,
        confidence_threshold: conn.confidence_threshold,
        default_priority_id: conn.default_priority_id,
        default_task_type_id: conn.default_task_type_id,
        last_polled_at: conn.last_polled_at,
        last_message_timestamp: conn.last_message_timestamp,
      });
    } catch (err) {
      result.error = `Token refresh failed: ${(err as Error).message}`;
      return result;
    }
  }
  if (!accessToken) {
    result.error = 'No access token available';
    return result;
  }

  // 2. List new messages since last check
  const rules = await emailRuleRepo.list(userId);
  if (rules.filter(r => r.is_active).length === 0) {
    // Still advance last_polled_at so we record the attempt
    await gmailConnectionRepo.updateSettings(userId, { last_polled_at: new Date().toISOString() });
    return result;
  }

  let ids: string[] = [];
  try {
    ids = await gmail.listMessagesSince(accessToken, conn.last_message_timestamp, 25);
    result.listed = ids.length;
  } catch (err) {
    result.error = (err as Error).message;
    return result;
  }

  if (ids.length === 0) {
    await gmailConnectionRepo.updateSettings(userId, { last_polled_at: new Date().toISOString() });
    return result;
  }

  // Catalogs (task types + priorities) for LLM extraction
  const [taskTypesRes, prioritiesRes, aiSettingsRes] = await Promise.all([
    supabase.from('vl_task_types').select('id, name, workflow_id'),
    supabase.from('vl_priorities').select('name').eq('user_id', userId),
    supabase.from('vl_ai_settings').select('provider, model, api_key').eq('user_id', userId).maybeSingle(),
  ]);
  const taskTypes = (taskTypesRes.data ?? []) as Array<{ id: string; name: string; workflow_id: string | null }>;
  const priorities = (prioritiesRes.data ?? []) as Array<{ name: string }>;
  const aiSettings = aiSettingsRes.data as { provider?: string; model?: string; api_key?: string } | null;

  const canExtract = Boolean(aiSettings?.provider && aiSettings?.model && aiSettings?.api_key);

  let latestTs: Date | null = conn.last_message_timestamp ? new Date(conn.last_message_timestamp) : null;

  for (const id of ids) {
    try {
      // Skip already-processed (idempotency safety net beyond the unique constraint)
      const { data: existing } = await supabase
        .from('vl_email_detections')
        .select('id')
        .eq('user_id', userId)
        .eq('gmail_message_id', id)
        .maybeSingle();
      if (existing) continue;

      result.new += 1;
      const email = await gmail.fetchMessage(accessToken, id);

      // Advance watermark
      const ts = new Date(email.receivedAt);
      if (!latestTs || ts > latestTs) latestTs = ts;

      // Match rules
      const matched = matchEmailAgainstRules(email, rules as any);
      if (!matched) continue;
      result.matched += 1;

      // Extract via LLM (if user has AI configured). If not, queue as pending_review.
      let extracted: Awaited<ReturnType<typeof extractTaskFromEmail>> | null = null;
      let extractionError: string | null = null;
      if (canExtract) {
        try {
          extracted = await extractTaskFromEmail({
            email,
            taskTypes,
            priorities,
            llm,
            provider: aiSettings!.provider as any,
            model: aiSettings!.model!,
            apiKey: aiSettings!.api_key!,
          });
        } catch (err) {
          extractionError = (err as Error).message;
        }
      }

      // Apply rule action overrides (they win over AI)
      const finalTaskTypeId = matched.action_task_type_id
        ?? extracted?.task_type_id
        ?? conn.default_task_type_id
        ?? null;
      const finalPriority = matched.action_priority_name
        ?? extracted?.priority
        ?? (conn.default_priority_id
          ? priorities.find(p => (p as any).id === conn.default_priority_id)?.name ?? null
          : null);
      const finalAssigneeId = matched.action_assignee_id ?? userId;

      // Decide: auto-create or queue for review?
      const confidence = extracted?.confidence ?? 0;
      const threshold = conn.confidence_threshold;
      const canAutoCreate =
        extracted?.is_actionable === true &&
        confidence >= threshold &&
        !!finalTaskTypeId;

      const title = extracted?.is_actionable ? (extracted.title || email.subject || 'Untitled')
        : (email.subject || 'Untitled');
      const description = extracted?.description ?? '';

      if (!extracted && !extractionError) {
        // No extraction attempted (no AI key) → queue
        const { error } = await supabase.from('vl_email_detections').insert({
          user_id: userId,
          gmail_message_id: email.messageId,
          gmail_thread_id: email.threadId,
          gmail_received_at: email.receivedAt,
          from_email: email.fromEmail,
          from_name: email.fromName,
          subject: email.subject,
          body_snippet: email.snippet,
          body_full: email.bodyText.slice(0, 20000),
          matched_rule_id: matched.id,
          status: 'pending_review',
          confidence: null,
          proposed_title: email.subject,
          proposed_description: '',
          proposed_task_type_id: finalTaskTypeId,
          proposed_priority: finalPriority,
          proposed_due_date: null,
        });
        if (error) { result.failed += 1; continue; }
        result.queued += 1;
        continue;
      }

      if (extractionError || !extracted) {
        const { error } = await supabase.from('vl_email_detections').insert({
          user_id: userId,
          gmail_message_id: email.messageId,
          gmail_thread_id: email.threadId,
          gmail_received_at: email.receivedAt,
          from_email: email.fromEmail,
          from_name: email.fromName,
          subject: email.subject,
          body_snippet: email.snippet,
          body_full: email.bodyText.slice(0, 20000),
          matched_rule_id: matched.id,
          status: 'failed',
          error_message: extractionError ?? 'Unknown extraction error',
        });
        if (error) { result.failed += 1; continue; }
        result.failed += 1;
        continue;
      }

      if (!extracted.is_actionable) {
        // Email matched the rule but LLM says it's not a task — reject silently.
        await supabase.from('vl_email_detections').insert({
          user_id: userId,
          gmail_message_id: email.messageId,
          gmail_thread_id: email.threadId,
          gmail_received_at: email.receivedAt,
          from_email: email.fromEmail,
          from_name: email.fromName,
          subject: email.subject,
          body_snippet: email.snippet,
          body_full: email.bodyText.slice(0, 20000),
          matched_rule_id: matched.id,
          status: 'rejected',
          confidence: confidence,
          proposed_title: title,
          proposed_description: description,
          proposed_task_type_id: finalTaskTypeId,
          proposed_priority: finalPriority,
          proposed_due_date: extracted.due_date,
        });
        continue;
      }

      if (canAutoCreate) {
        // Resolve initial state
        const tt = taskTypes.find(t => t.id === finalTaskTypeId);
        let initialStateId: string | null = null;
        if (tt?.workflow_id) {
          const { data: states } = await supabase
            .from('vl_workflow_states')
            .select('state_id, is_initial, vl_states!inner(category)')
            .eq('workflow_id', tt.workflow_id);
          const ws = (states ?? []) as any[];
          initialStateId =
            ws.find(s => s.vl_states?.category === 'OPEN')?.state_id ??
            ws.find(s => s.is_initial)?.state_id ??
            ws[0]?.state_id ?? null;
        }

        const { data: task, error: taskErr } = await supabase.from('vl_tasks').insert({
          task_type_id: finalTaskTypeId,
          state_id: initialStateId,
          title,
          data: description ? { description } : {},
          assignee_id: finalAssigneeId,
          priority: finalPriority,
          sort_order: 0,
          created_by: userId,
          gmail_message_id: email.messageId,
          gmail_thread_id: email.threadId,
          created_by_ai: true,
        }).select().single();

        if (taskErr || !task) {
          await supabase.from('vl_email_detections').insert({
            user_id: userId,
            gmail_message_id: email.messageId,
            gmail_thread_id: email.threadId,
            gmail_received_at: email.receivedAt,
            from_email: email.fromEmail,
            from_name: email.fromName,
            subject: email.subject,
            body_snippet: email.snippet,
            body_full: email.bodyText.slice(0, 20000),
            matched_rule_id: matched.id,
            status: 'failed',
            error_message: taskErr?.message ?? 'Task create failed',
            confidence,
            proposed_title: title,
            proposed_description: description,
            proposed_task_type_id: finalTaskTypeId,
            proposed_priority: finalPriority,
            proposed_due_date: extracted.due_date,
          });
          result.failed += 1;
          continue;
        }

        await supabase.from('vl_email_detections').insert({
          user_id: userId,
          gmail_message_id: email.messageId,
          gmail_thread_id: email.threadId,
          gmail_received_at: email.receivedAt,
          from_email: email.fromEmail,
          from_name: email.fromName,
          subject: email.subject,
          body_snippet: email.snippet,
          body_full: email.bodyText.slice(0, 20000),
          matched_rule_id: matched.id,
          status: 'auto_created',
          confidence,
          proposed_title: title,
          proposed_description: description,
          proposed_task_type_id: finalTaskTypeId,
          proposed_priority: finalPriority,
          proposed_due_date: extracted.due_date,
          task_id: task.id,
        });
        result.auto_created += 1;
      } else {
        // Below threshold → queue for human review
        await supabase.from('vl_email_detections').insert({
          user_id: userId,
          gmail_message_id: email.messageId,
          gmail_thread_id: email.threadId,
          gmail_received_at: email.receivedAt,
          from_email: email.fromEmail,
          from_name: email.fromName,
          subject: email.subject,
          body_snippet: email.snippet,
          body_full: email.bodyText.slice(0, 20000),
          matched_rule_id: matched.id,
          status: 'pending_review',
          confidence,
          proposed_title: title,
          proposed_description: description,
          proposed_task_type_id: finalTaskTypeId,
          proposed_priority: finalPriority,
          proposed_due_date: extracted.due_date,
        });
        result.queued += 1;
      }
    } catch (err) {
      result.failed += 1;
    }
  }

  // Update watermark
  await gmailConnectionRepo.updateSettings(userId, {
    last_polled_at: new Date().toISOString(),
    last_message_timestamp: latestTs ? latestTs.toISOString() : conn.last_message_timestamp ?? undefined,
  });

  return result;
}
