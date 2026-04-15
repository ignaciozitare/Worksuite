// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Vector Logic MCP Server
//
// Exposes Vector Logic data and operations as tools that any MCP client
// (Claude Desktop, Claude Code, Cursor, etc.) can invoke. The user talks to
// Claude in their native client using their existing subscription — no API
// keys needed. Claude calls these tools when it needs to read or modify
// Vector Logic state.
//
// Transport: HTTP via Server-Sent Events (SSE), wired up in mcpRoutes.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export class VectorLogicMCPServer {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Builds a fresh McpServer instance with all Vector Logic tools registered.
   * A new server is created per session because MCP clients hold a stateful
   * connection and we want to scope context (e.g. authenticated user) to the
   * current request.
   */
  buildServer(userId: string): McpServer {
    const sb = this.supabase;
    const server = new McpServer({
      name: 'vector-logic',
      version: '1.0.0',
    });

    // ── list_workflows ────────────────────────────────────────────────────
    server.tool(
      'list_workflows',
      'List all workflows defined in Vector Logic. A workflow is a state machine that defines the lifecycle of a task type (e.g. Bug → Triage → In Progress → QA → Done).',
      {},
      async () => {
        const { data, error } = await sb.from('vl_workflows').select('id, name, description, is_published, created_at').order('created_at', { ascending: false });
        if (error) return errorResult(error.message);
        return ok(data);
      },
    );

    // ── list_states ───────────────────────────────────────────────────────
    server.tool(
      'list_states',
      'List all states (with their categories OPEN, BACKLOG, IN_PROGRESS, DONE) for a given workflow. Pass the workflow id returned by list_workflows.',
      { workflow_id: z.string().describe('The workflow id') },
      async ({ workflow_id }) => {
        const { data, error } = await sb
          .from('vl_workflow_states')
          .select('id, state_id, position_x, position_y, is_initial, state:vl_states(id, name, category, color)')
          .eq('workflow_id', workflow_id);
        if (error) return errorResult(error.message);
        return ok(data);
      },
    );

    // ── list_task_types ───────────────────────────────────────────────────
    server.tool(
      'list_task_types',
      'List all task types defined in Vector Logic. Each task type has a name, an optional icon, an assigned workflow, and a schema (custom fields).',
      {},
      async () => {
        const { data, error } = await sb
          .from('vl_task_types')
          .select('id, name, icon, workflow_id, schema, created_at, updated_at')
          .order('name');
        if (error) return errorResult(error.message);
        return ok(data);
      },
    );

    // ── list_tasks ────────────────────────────────────────────────────────
    server.tool(
      'list_tasks',
      'List tasks. Optionally filter by task_type_id, state_id, or assignee_id. Returns title, current state, priority, and custom data fields.',
      {
        task_type_id: z.string().optional().describe('Filter by task type'),
        state_id: z.string().optional().describe('Filter by current state'),
        assignee_id: z.string().optional().describe('Filter by assignee user id'),
        limit: z.number().int().min(1).max(200).optional().describe('Max number of results (default 50)'),
      },
      async ({ task_type_id, state_id, assignee_id, limit }) => {
        let query = sb
          .from('vl_tasks')
          .select('id, task_type_id, state_id, title, data, assignee_id, priority, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(limit ?? 50);
        if (task_type_id) query = query.eq('task_type_id', task_type_id);
        if (state_id) query = query.eq('state_id', state_id);
        if (assignee_id) query = query.eq('assignee_id', assignee_id);
        const { data, error } = await query;
        if (error) return errorResult(error.message);
        return ok(data);
      },
    );

    // ── create_task ───────────────────────────────────────────────────────
    server.tool(
      'create_task',
      'Create a new task. The task is placed in the initial OPEN state of the task type\'s workflow. Use list_task_types to find the task_type_id.',
      {
        task_type_id: z.string().describe('The task type id'),
        title: z.string().describe('Short, actionable title'),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('Task priority (default: medium)'),
        notes: z.string().optional().describe('Optional longer description or context'),
        assignee_id: z.string().optional().describe('Optional user id to assign'),
      },
      async ({ task_type_id, title, priority, notes, assignee_id }) => {
        const { data: tt, error: ttErr } = await sb
          .from('vl_task_types')
          .select('id, workflow_id')
          .eq('id', task_type_id)
          .single();
        if (ttErr || !tt) return errorResult(`Task type not found: ${task_type_id}`);
        if (!tt.workflow_id) return errorResult(`Task type "${task_type_id}" has no workflow assigned. Use list_workflows + the assignment manager UI to link one.`);

        const { data: wfStates, error: wsErr } = await sb
          .from('vl_workflow_states')
          .select('state_id, is_initial, state:vl_states(category)')
          .eq('workflow_id', tt.workflow_id);
        if (wsErr) return errorResult(wsErr.message);
        const initial =
          wfStates?.find((ws: any) => ws.is_initial) ??
          wfStates?.find((ws: any) => ws.state?.category === 'OPEN') ??
          wfStates?.[0];
        if (!initial) return errorResult('Workflow has no states configured');

        const { data, error } = await sb
          .from('vl_tasks')
          .insert({
            task_type_id,
            state_id: (initial as any).state_id,
            title,
            data: notes ? { notes } : {},
            assignee_id: assignee_id ?? null,
            priority: priority ?? 'medium',
            created_by: userId,
          })
          .select()
          .single();
        if (error) return errorResult(error.message);
        return ok(data);
      },
    );

    // ── update_task ───────────────────────────────────────────────────────
    server.tool(
      'update_task',
      'Update fields on an existing task. Only the fields you pass are updated.',
      {
        task_id: z.string().describe('The task id'),
        title: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        assignee_id: z.string().nullable().optional(),
        data: z.record(z.string(), z.unknown()).optional().describe('Custom schema field values, merged into the existing data JSONB'),
      },
      async ({ task_id, title, priority, assignee_id, data: patchData }) => {
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (title !== undefined) update.title = title;
        if (priority !== undefined) update.priority = priority;
        if (assignee_id !== undefined) update.assignee_id = assignee_id;
        if (patchData !== undefined) {
          // Merge with existing data
          const { data: existing } = await sb.from('vl_tasks').select('data').eq('id', task_id).single();
          update.data = { ...(existing?.data ?? {}), ...patchData };
        }
        const { data, error } = await sb.from('vl_tasks').update(update).eq('id', task_id).select().single();
        if (error) return errorResult(error.message);
        return ok(data);
      },
    );

    // ── move_task_to_state ────────────────────────────────────────────────
    server.tool(
      'move_task_to_state',
      'Move a task to a different state in its workflow. Use list_states to find valid state ids for the workflow.',
      {
        task_id: z.string().describe('The task id'),
        state_id: z.string().describe('The target state id'),
      },
      async ({ task_id, state_id }) => {
        const { data, error } = await sb
          .from('vl_tasks')
          .update({ state_id, updated_at: new Date().toISOString() })
          .eq('id', task_id)
          .select()
          .single();
        if (error) return errorResult(error.message);
        return ok(data);
      },
    );

    // ── delete_task ───────────────────────────────────────────────────────
    server.tool(
      'delete_task',
      'Permanently delete a task. This cannot be undone.',
      { task_id: z.string().describe('The task id') },
      async ({ task_id }) => {
        const { error } = await sb.from('vl_tasks').delete().eq('id', task_id);
        if (error) return errorResult(error.message);
        return ok({ deleted: true, id: task_id });
      },
    );

    // ── get_active_rules ──────────────────────────────────────────────────
    server.tool(
      'get_active_rules',
      'Get the user\'s active business rules in natural language. Apply these rules whenever creating or updating tasks (e.g. "always set priority high if title contains urgent").',
      {},
      async () => {
        const { data, error } = await sb
          .from('vl_ai_rules')
          .select('name, description')
          .eq('user_id', userId)
          .eq('is_active', true);
        if (error) return errorResult(error.message);
        return ok(data);
      },
    );

    return server;
  }
}

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}
