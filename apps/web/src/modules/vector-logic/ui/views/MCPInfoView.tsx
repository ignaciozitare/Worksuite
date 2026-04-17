// @ts-nocheck
import { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { getSessionToken } from '../../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

const API_BASE = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const MCP_URL = `${API_BASE}/mcp/sse`;

export function MCPInfoView({ currentUser }: Props) {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState('');

  const loadToken = async () => {
    const accessToken = await getSessionToken();
    if (accessToken) setToken(accessToken);
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const claudeDesktopConfig = `{
  "mcpServers": {
    "vector-logic": {
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${token || '<YOUR_TOKEN>'}"
      }
    }
  }
}`;

  const claudeCodeCommand = `claude mcp add --transport sse vector-logic ${MCP_URL} --header "Authorization: Bearer ${token || '<YOUR_TOKEN>'}"`;

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          {t('vectorLogic.mcpAccess')}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 6, lineHeight: 1.6, maxWidth: 680 }}>
          {t('vectorLogic.mcpDesc')}
        </p>
      </div>

      {/* Available tools */}
      <Section title={t('vectorLogic.mcpToolsAvailable')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { name: 'list_workflows', desc: t('vectorLogic.toolListWorkflows') },
            { name: 'list_states', desc: t('vectorLogic.toolListStates') },
            { name: 'list_task_types', desc: t('vectorLogic.toolListTaskTypes') },
            { name: 'list_tasks', desc: t('vectorLogic.toolListTasks') },
            { name: 'create_task', desc: t('vectorLogic.toolCreateTask') },
            { name: 'update_task', desc: t('vectorLogic.toolUpdateTask') },
            { name: 'move_task_to_state', desc: t('vectorLogic.toolMoveTask') },
            { name: 'delete_task', desc: t('vectorLogic.toolDeleteTask') },
          ].map(tool => (
            <div key={tool.name} style={{
              background: 'var(--sf3)', borderRadius: 8, padding: '10px 14px',
              borderLeft: '3px solid var(--ac)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)', fontFamily: 'monospace', marginBottom: 4 }}>
                {tool.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.4 }}>{tool.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Endpoint */}
      <Section title={t('vectorLogic.mcpEndpoint')}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <code style={codeStyle}>{MCP_URL}</code>
          <button onClick={() => copy(MCP_URL, 'url')} style={btnStyle('ghost')}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {copied === 'url' ? 'check' : 'content_copy'}
            </span>
          </button>
        </div>
      </Section>

      {/* Auth token */}
      <Section title={t('vectorLogic.mcpAuthToken')}>
        {!token ? (
          <button onClick={loadToken} style={btnStyle('primary')}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>key</span>
            {t('vectorLogic.mcpGenerateToken')}
          </button>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <code style={{ ...codeStyle, wordBreak: 'break-all', flex: 1 }}>{token}</code>
              <button onClick={() => copy(token, 'token')} style={btnStyle('ghost')}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {copied === 'token' ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'var(--amber)', marginTop: 6, lineHeight: 1.4 }}>
              {t('vectorLogic.mcpTokenWarning')}
            </p>
          </div>
        )}
      </Section>

      {/* Claude Desktop setup */}
      <Section title={t('vectorLogic.mcpClaudeDesktop')}>
        <ol style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.7, paddingLeft: 18, marginBottom: 12 }}>
          <li>{t('vectorLogic.mcpStepDesktop1')}</li>
          <li>{t('vectorLogic.mcpStepDesktop2')} <code style={inlineCode}>claude_desktop_config.json</code></li>
          <li>{t('vectorLogic.mcpStepDesktop3')}</li>
          <li>{t('vectorLogic.mcpStepDesktop4')}</li>
        </ol>
        <div style={{ position: 'relative' }}>
          <pre style={preStyle}>{claudeDesktopConfig}</pre>
          <button onClick={() => copy(claudeDesktopConfig, 'desktop')}
            style={{ ...btnStyle('ghost'), position: 'absolute', top: 8, right: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {copied === 'desktop' ? 'check' : 'content_copy'}
            </span>
          </button>
        </div>
      </Section>

      {/* Claude Code setup */}
      <Section title={t('vectorLogic.mcpClaudeCode')}>
        <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 10 }}>
          {t('vectorLogic.mcpClaudeCodeDesc')}
        </p>
        <div style={{ position: 'relative' }}>
          <pre style={preStyle}>{claudeCodeCommand}</pre>
          <button onClick={() => copy(claudeCodeCommand, 'code')}
            style={{ ...btnStyle('ghost'), position: 'absolute', top: 8, right: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {copied === 'code' ? 'check' : 'content_copy'}
            </span>
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 12,
      padding: 20, marginBottom: 16,
    }}>
      <h3 style={{
        fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase',
        letterSpacing: '.08em', marginBottom: 14,
      }}>{title}</h3>
      {children}
    </div>
  );
}

const btnStyle = (variant = 'primary', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', border: 'none',
  fontFamily: 'inherit', transition: 'all .15s',
  ...(variant === 'primary' && { background: 'var(--ac)', color: '#fff' }),
  ...(variant === 'ghost' && { background: 'var(--sf3)', color: 'var(--tx3)', border: '1px solid var(--bd)' }),
  ...extra,
});

const codeStyle = {
  display: 'block', padding: '10px 14px', background: 'var(--sf)', border: '1px solid var(--bd)',
  borderRadius: 8, fontSize: 12, fontFamily: 'monospace', color: 'var(--tx)', flex: 1,
};

const inlineCode = {
  padding: '1px 6px', background: 'var(--sf3)', borderRadius: 3, fontFamily: 'monospace',
  fontSize: 11, color: 'var(--tx)',
};

const preStyle = {
  padding: '14px 16px', background: 'var(--sf)', border: '1px solid var(--bd)',
  borderRadius: 8, fontSize: 11, fontFamily: 'monospace', color: 'var(--tx)',
  overflow: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0,
};
