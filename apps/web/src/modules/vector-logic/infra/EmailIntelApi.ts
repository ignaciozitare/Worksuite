// ─────────────────────────────────────────────────────────────────────────────
// Email Intelligence — API adapters
// All calls go to /email-intel/* on the WorkSuite API. OAuth tokens and the
// Gmail API itself live server-side only.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/shared/lib/supabaseClient';
import type {
  IGmailConnectionRepo,
  IEmailRuleRepo,
  IEmailDetectionRepo,
} from '../domain/ports/IEmailIntelRepos';
import type { EmailRule, EmailRuleFilter } from '../domain/entities/EmailRule';
import type { EmailDetection, EmailDetectionStatus } from '../domain/entities/EmailDetection';
import type { GmailConnectionStatus } from '../domain/entities/GmailConnection';

const API_BASE = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  return body as T;
}

// ── Row → domain mappers ─────────────────────────────────────────────────────
function mapRule(r: any): EmailRule {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    isActive: r.is_active,
    filters: (r.filters ?? []) as EmailRuleFilter[],
    actionTaskTypeId: r.action_task_type_id,
    actionPriorityName: r.action_priority_name,
    actionAssigneeId: r.action_assignee_id,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapDetection(d: any): EmailDetection {
  return {
    id: d.id,
    userId: d.user_id,
    gmailMessageId: d.gmail_message_id,
    gmailThreadId: d.gmail_thread_id,
    gmailReceivedAt: d.gmail_received_at,
    fromEmail: d.from_email,
    fromName: d.from_name,
    subject: d.subject,
    bodySnippet: d.body_snippet,
    bodyFull: d.body_full,
    matchedRuleId: d.matched_rule_id,
    status: d.status,
    confidence: d.confidence,
    proposedTitle: d.proposed_title,
    proposedDescription: d.proposed_description,
    proposedTaskTypeId: d.proposed_task_type_id,
    proposedPriority: d.proposed_priority,
    proposedDueDate: d.proposed_due_date,
    taskId: d.task_id,
    errorMessage: d.error_message,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

// ── Gmail connection ─────────────────────────────────────────────────────────
export class GmailConnectionApi implements IGmailConnectionRepo {
  async getStatus(): Promise<GmailConnectionStatus> {
    const body = await request<{ ok: true; data: any; oauthConfigured: boolean }>('/email-intel/connection');
    return {
      oauthConfigured: body.oauthConfigured,
      connection: body.data
        ? {
            email: body.data.email,
            isActive: body.data.is_active,
            pollingIntervalMinutes: body.data.polling_interval_minutes,
            confidenceThreshold: body.data.confidence_threshold,
            defaultPriorityId: body.data.default_priority_id,
            defaultTaskTypeId: body.data.default_task_type_id,
            lastPolledAt: body.data.last_polled_at,
            createdAt: body.data.created_at,
          }
        : null,
    };
  }

  async startOAuth(): Promise<string> {
    const body = await request<{ ok: true; url: string }>('/email-intel/oauth/start');
    return body.url;
  }

  async disconnect(): Promise<void> {
    await request('/email-intel/connection', { method: 'DELETE' });
  }

  async updateSettings(patch: {
    pollingIntervalMinutes?: number;
    confidenceThreshold?: number;
    defaultPriorityId?: string | null;
    defaultTaskTypeId?: string | null;
    isActive?: boolean;
  }): Promise<void> {
    await request('/email-intel/connection/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        polling_interval_minutes: patch.pollingIntervalMinutes,
        confidence_threshold: patch.confidenceThreshold,
        default_priority_id: patch.defaultPriorityId,
        default_task_type_id: patch.defaultTaskTypeId,
        is_active: patch.isActive,
      }),
    });
  }

  async pollNow() {
    const body = await request<{ ok: true; data: any }>('/email-intel/ingest', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return body.data;
  }
}

// ── Email rules ──────────────────────────────────────────────────────────────
export class EmailRuleApi implements IEmailRuleRepo {
  async list(): Promise<EmailRule[]> {
    const body = await request<{ ok: true; data: any[] }>('/email-intel/rules');
    return body.data.map(mapRule);
  }

  async create(draft: {
    name: string;
    filters: EmailRuleFilter[];
    actionTaskTypeId?: string | null;
    actionPriorityName?: string | null;
    actionAssigneeId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<EmailRule> {
    const body = await request<{ ok: true; data: any }>('/email-intel/rules', {
      method: 'POST',
      body: JSON.stringify({
        name: draft.name,
        filters: draft.filters,
        action_task_type_id: draft.actionTaskTypeId ?? null,
        action_priority_name: draft.actionPriorityName ?? null,
        action_assignee_id: draft.actionAssigneeId ?? null,
        sort_order: draft.sortOrder ?? 0,
        is_active: draft.isActive ?? true,
      }),
    });
    return mapRule(body.data);
  }

  async update(id: string, patch: {
    name?: string;
    filters?: EmailRuleFilter[];
    actionTaskTypeId?: string | null;
    actionPriorityName?: string | null;
    actionAssigneeId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<void> {
    const dto: Record<string, unknown> = {};
    if (patch.name !== undefined) dto.name = patch.name;
    if (patch.filters !== undefined) dto.filters = patch.filters;
    if (patch.actionTaskTypeId !== undefined) dto.action_task_type_id = patch.actionTaskTypeId;
    if (patch.actionPriorityName !== undefined) dto.action_priority_name = patch.actionPriorityName;
    if (patch.actionAssigneeId !== undefined) dto.action_assignee_id = patch.actionAssigneeId;
    if (patch.sortOrder !== undefined) dto.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) dto.is_active = patch.isActive;
    await request(`/email-intel/rules/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async remove(id: string): Promise<void> {
    await request(`/email-intel/rules/${id}`, { method: 'DELETE' });
  }
}

// ── Email detections ─────────────────────────────────────────────────────────
export class EmailDetectionApi implements IEmailDetectionRepo {
  async list(status?: EmailDetectionStatus): Promise<EmailDetection[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const body = await request<{ ok: true; data: any[] }>(`/email-intel/detections${qs}`);
    return body.data.map(mapDetection);
  }

  async approve(id: string, overrides?: {
    title?: string;
    description?: string;
    taskTypeId?: string;
    priority?: string;
    dueDate?: string | null;
  }): Promise<{ taskId: string }> {
    const dto: Record<string, unknown> = {};
    if (overrides?.title !== undefined) dto.title = overrides.title;
    if (overrides?.description !== undefined) dto.description = overrides.description;
    if (overrides?.taskTypeId !== undefined) dto.task_type_id = overrides.taskTypeId;
    if (overrides?.priority !== undefined) dto.priority = overrides.priority;
    if (overrides?.dueDate !== undefined) dto.due_date = overrides.dueDate;
    const body = await request<{ ok: true; data: { task_id: string } }>(
      `/email-intel/detections/${id}/approve`,
      { method: 'POST', body: JSON.stringify(dto) },
    );
    return { taskId: body.data.task_id };
  }

  async reject(id: string): Promise<void> {
    await request(`/email-intel/detections/${id}/reject`, { method: 'POST' });
  }
}
