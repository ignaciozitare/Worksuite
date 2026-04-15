// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { AISettings, AIConversation, AIMessage, AIRule } from '../../domain/entities/AI';
import type { TaskType } from '../../domain/entities/TaskType';
import type { ToolDefinition, ChatMessage } from '../../domain/ports/ILLMService';
import { aiRepo, llmService, taskTypeRepo, taskRepo, stateRepo } from '../../container';

interface Props {
  currentUser: { id: string; name?: string; email: string; [k: string]: unknown };
}

export function ChatView({ currentUser }: Props) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConv, setActiveConv] = useState<AIConversation | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [rules, setRules] = useState<AIRule[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [s, convs, tts, rs] = await Promise.all([
        aiRepo.getSettings(currentUser.id),
        aiRepo.listConversations(currentUser.id),
        taskTypeRepo.findAll(),
        aiRepo.listRules(currentUser.id),
      ]);
      setSettings(s);
      setConversations(convs);
      setTaskTypes(tts);
      setRules(rs);
      if (convs.length > 0) selectConversation(convs[0]);
    })();
  }, [currentUser.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectConversation = async (conv: AIConversation) => {
    setActiveConv(conv);
    const msgs = await aiRepo.listMessages(conv.id);
    setMessages(msgs);
  };

  const newConversation = async () => {
    const conv = await aiRepo.createConversation(currentUser.id, null);
    setConversations(prev => [conv, ...prev]);
    setActiveConv(conv);
    setMessages([]);
  };

  const deleteConversation = async (id: string) => {
    await aiRepo.deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConv?.id === id) {
      setActiveConv(null);
      setMessages([]);
    }
  };

  // Build tools for LLM: create_task
  const buildTools = (): ToolDefinition[] => [
    {
      name: 'create_task',
      description: 'Create a new task in the Vector Logic workspace. The task will be placed in the initial OPEN state of its task type workflow.',
      input_schema: {
        type: 'object',
        properties: {
          task_type_name: {
            type: 'string',
            description: `One of: ${taskTypes.map(t => t.name).join(', ') || '(no task types configured)'}`,
          },
          title: { type: 'string', description: 'Short, actionable title for the task' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          notes: { type: 'string', description: 'Optional longer description or context' },
        },
        required: ['task_type_name', 'title'],
      },
    },
    {
      name: 'list_task_types',
      description: 'List all available task types in Vector Logic',
      input_schema: { type: 'object', properties: {} },
    },
  ];

  // Execute a tool call
  const executeTool = async (name: string, args: any): Promise<string> => {
    if (name === 'list_task_types') {
      return JSON.stringify(taskTypes.map(t => ({ id: t.id, name: t.name, icon: t.icon })));
    }
    if (name === 'create_task') {
      const tt = taskTypes.find(x => x.name.toLowerCase() === String(args.task_type_name).toLowerCase());
      if (!tt) return JSON.stringify({ error: `Task type "${args.task_type_name}" not found` });
      if (!tt.workflowId) return JSON.stringify({ error: `Task type "${tt.name}" has no workflow assigned` });

      const wfStates = await stateRepo.findByWorkflow(tt.workflowId);
      const initial = wfStates.find(ws => ws.isInitial) ?? wfStates.find(ws => ws.state?.category === 'OPEN') ?? wfStates[0];
      if (!initial) return JSON.stringify({ error: 'Workflow has no states' });

      const task = await taskRepo.create({
        taskTypeId: tt.id,
        stateId: initial.stateId,
        title: args.title,
        data: args.notes ? { notes: args.notes } : {},
        assigneeId: null,
        priority: args.priority ?? 'medium',
        createdBy: currentUser.id,
      });
      return JSON.stringify({ success: true, task_id: task.id, title: task.title });
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    if (!settings || !settings.apiKey) {
      setError(t('vectorLogic.configureAiFirst'));
      return;
    }
    setError('');
    setSending(true);

    // Ensure we have a conversation
    let conv = activeConv;
    if (!conv) {
      conv = await aiRepo.createConversation(currentUser.id, input.slice(0, 40));
      setConversations(prev => [conv!, ...prev]);
      setActiveConv(conv);
    }

    // Persist user message
    const userMsg = await aiRepo.appendMessage({
      conversationId: conv.id,
      role: 'user',
      content: input.trim(),
      toolCalls: null,
    });
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    // Build full system prompt with rules
    const rulesText = rules.filter(r => r.isActive)
      .map(r => `- ${r.name}: ${r.description}`)
      .join('\n');
    const sysPrompt = (settings.systemPrompt ?? '') +
      (rulesText ? `\n\nActive automation rules:\n${rulesText}` : '') +
      `\n\nAvailable task types: ${taskTypes.map(t => t.name).join(', ') || 'none'}`;

    try {
      // Build chat history (all messages in this conversation)
      const history: ChatMessage[] = [...messages, userMsg].map(m => ({
        role: m.role as any,
        content: m.content,
      }));

      let response = await llmService.chat(
        settings.provider,
        settings.model,
        settings.apiKey,
        sysPrompt,
        history,
        buildTools(),
      );

      // Handle tool calls (may loop if multiple rounds needed)
      let safety = 0;
      while (response.toolCalls.length > 0 && safety < 5) {
        safety++;
        // Append assistant message with tool_use
        const asstMsg = await aiRepo.appendMessage({
          conversationId: conv.id,
          role: 'assistant',
          content: response.content + '\n\n' + response.toolCalls.map(tc =>
            `🔧 Using tool: ${tc.name}(${JSON.stringify(tc.arguments)})`
          ).join('\n'),
          toolCalls: response.toolCalls,
        });
        setMessages(prev => [...prev, asstMsg]);

        // Execute tools and collect results
        const toolResults: ChatMessage[] = [];
        for (const tc of response.toolCalls) {
          const result = await executeTool(tc.name, tc.arguments);
          const toolMsg = await aiRepo.appendMessage({
            conversationId: conv.id,
            role: 'tool',
            content: `Result for ${tc.name}: ${result}`,
            toolCalls: null,
          });
          setMessages(prev => [...prev, toolMsg]);
          toolResults.push({ role: 'tool', content: `Tool ${tc.name} returned: ${result}`, tool_call_id: tc.id });
        }

        // Re-query LLM with tool results
        history.push({ role: 'assistant', content: response.content, tool_calls: response.toolCalls });
        history.push(...toolResults);

        response = await llmService.chat(
          settings.provider,
          settings.model,
          settings.apiKey,
          sysPrompt,
          history,
          buildTools(),
        );
      }

      // Final assistant message
      if (response.content) {
        const finalMsg = await aiRepo.appendMessage({
          conversationId: conv.id,
          role: 'assistant',
          content: response.content,
          toolCalls: null,
        });
        setMessages(prev => [...prev, finalMsg]);
      }
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 0 }}>
      {/* Conversations sidebar */}
      <aside style={{
        width: 240, minWidth: 240, background: 'var(--sf)', borderRight: '1px solid var(--bd)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 12px' }}>
          <button onClick={newConversation} style={{
            width: '100%', background: 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            {t('vectorLogic.newChat')}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {conversations.map(c => (
            <div key={c.id}
              onClick={() => selectConversation(c)}
              style={{
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                background: activeConv?.id === c.id ? 'rgba(79,110,247,.08)' : 'transparent',
                border: `1px solid ${activeConv?.id === c.id ? 'var(--ac)' : 'transparent'}`,
                marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => { if (activeConv?.id !== c.id) e.currentTarget.style.background = 'var(--sf2)'; }}
              onMouseLeave={e => { if (activeConv?.id !== c.id) e.currentTarget.style.background = 'transparent'; }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>chat</span>
              <span style={{ fontSize: 12, color: 'var(--tx)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title || t('vectorLogic.untitledChat')}
              </span>
              <button onClick={e => { e.stopPropagation(); deleteConversation(c.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', opacity: .4, fontFamily: 'inherit' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: '16px 0', opacity: .5 }}>
              {t('vectorLogic.noConversations')}
            </div>
          )}
        </div>
      </aside>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--bd)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--ac)' }}>smart_toy</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>
              {settings?.provider === 'anthropic' ? 'Claude' : 'ChatGPT'} · {settings?.model ?? '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
              {settings?.apiKey ? t('vectorLogic.connected') : t('vectorLogic.notConfigured')}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tx3)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .2, display: 'block', marginBottom: 12 }}>smart_toy</span>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t('vectorLogic.startChat')}</div>
              <div style={{ fontSize: 11, maxWidth: 420, margin: '0 auto', lineHeight: 1.5 }}>
                {t('vectorLogic.chatHint')}
              </div>
            </div>
          ) : (
            messages.map(m => <MessageBubble key={m.id} msg={m} />)
          )}
          <div ref={endRef} />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 16px', margin: '0 20px 10px', background: 'rgba(224,82,82,.1)',
            border: '1px solid rgba(224,82,82,.3)', borderRadius: 8, fontSize: 12, color: 'var(--red)',
          }}>{error}</div>
        )}

        {/* Input */}
        <div style={{ padding: '12px 20px 20px', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t('vectorLogic.typeMessage')} rows={1}
              style={{
                flex: 1, padding: '10px 14px', fontSize: 13, fontFamily: 'inherit',
                background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 10,
                color: 'var(--tx)', outline: 'none', resize: 'none', minHeight: 42, maxHeight: 200,
              }} />
            <button onClick={send} disabled={sending || !input.trim()}
              style={{
                background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 10,
                padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: sending || !input.trim() ? .4 : 1, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {sending ? 'hourglass_empty' : 'send'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Message Bubble ─────────────────────────────────────────────────────── */
function MessageBubble({ msg }: { msg: AIMessage }) {
  const isUser = msg.role === 'user';
  const isTool = msg.role === 'tool';

  if (isTool) {
    return (
      <div style={{
        padding: '8px 12px', marginBottom: 14, background: 'rgba(62,207,142,.06)',
        border: '1px solid rgba(62,207,142,.2)', borderRadius: 8,
        fontSize: 11, fontFamily: 'monospace', color: 'var(--tx2)', maxWidth: '80%',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', letterSpacing: '.08em', marginBottom: 4 }}>
          TOOL RESULT
        </div>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', marginBottom: 14,
      justifyContent: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        maxWidth: '75%',
        padding: '10px 14px',
        background: isUser ? 'var(--ac)' : 'var(--sf2)',
        color: isUser ? '#fff' : 'var(--tx)',
        borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
        fontSize: 13, lineHeight: 1.5,
        border: isUser ? 'none' : '1px solid var(--bd)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  );
}
