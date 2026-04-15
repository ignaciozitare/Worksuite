// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { AISettings, AIProvider } from '../../domain/entities/AI';
import { DEFAULT_SYSTEM_PROMPT, MODELS } from '../../domain/entities/AI';
import { aiRepo } from '../../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

export function SettingsView({ currentUser }: Props) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [provider, setProvider] = useState<AIProvider>('anthropic');
  const [model, setModel] = useState('claude-opus-4-5');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [mcpEndpoint, setMcpEndpoint] = useState('');

  useEffect(() => {
    aiRepo.getSettings(currentUser.id).then(s => {
      if (s) {
        setSettings(s);
        setProvider(s.provider);
        setModel(s.model);
        setApiKey(s.apiKey ?? '');
        setSystemPrompt(s.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
        setMcpEndpoint(s.mcpEndpoint ?? '');
      }
      setLoading(false);
    });
  }, [currentUser.id]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await aiRepo.upsertSettings({
        userId: currentUser.id,
        provider,
        model,
        apiKey: apiKey || null,
        systemPrompt,
        mcpEndpoint: mcpEndpoint || null,
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // Update model when provider changes
  const onProviderChange = (p: AIProvider) => {
    setProvider(p);
    setModel(MODELS[p][0]);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          {t('vectorLogic.aiSettings')}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
          {t('vectorLogic.aiSettingsDesc')}
        </p>
      </div>

      {/* AI Provider card */}
      <Section title={t('vectorLogic.aiProvider')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <ProviderCard
            active={provider === 'anthropic'}
            onClick={() => onProviderChange('anthropic')}
            icon="🧠"
            name="Anthropic Claude"
            desc="Claude Opus, Sonnet, Haiku"
          />
          <ProviderCard
            active={provider === 'openai'}
            onClick={() => onProviderChange('openai')}
            icon="✨"
            name="OpenAI ChatGPT"
            desc="GPT-4o, GPT-4 Turbo"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lblStyle}>{t('vectorLogic.model')}</label>
          <select value={model} onChange={e => setModel(e.target.value)} style={inpStyle()}>
            {MODELS[provider].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lblStyle}>{t('vectorLogic.apiKey')}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              style={{ ...inpStyle(), fontFamily: 'monospace' }} />
            <button onClick={() => setShowKey(v => !v)} style={btnStyle('ghost')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {showKey ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6, lineHeight: 1.5 }}>
            {t('vectorLogic.apiKeyWarning')}
          </p>
        </div>
      </Section>

      {/* System prompt */}
      <Section title={t('vectorLogic.systemPrompt')}>
        <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
          rows={6}
          style={{ ...inpStyle(), fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
        <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6 }}>
          {t('vectorLogic.systemPromptDesc')}
        </p>
      </Section>

      {/* MCP Endpoint */}
      <Section title={t('vectorLogic.mcpEndpoint')}>
        <input value={mcpEndpoint} onChange={e => setMcpEndpoint(e.target.value)}
          placeholder="https://mcp.example.com/sse"
          style={{ ...inpStyle(), fontFamily: 'monospace' }} />
        <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6, lineHeight: 1.5 }}>
          {t('vectorLogic.mcpEndpointDesc')}
        </p>
      </Section>

      {/* Save bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <button onClick={save} disabled={saving} style={btnStyle('primary', { padding: '10px 20px' })}>
          {saving ? t('common.loading') : t('common.save')}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ {t('admin.envSaved')}</span>}
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────────── */
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

function ProviderCard({ active, onClick, icon, name, desc }: {
  active: boolean; onClick: () => void; icon: string; name: string; desc: string;
}) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
        background: active ? 'rgba(79,110,247,.08)' : 'var(--sf3)',
        border: `1px solid ${active ? 'var(--ac)' : 'var(--bd)'}`,
        borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left', transition: 'all .15s',
      }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{name}</div>
        <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{desc}</div>
      </div>
      {active && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--ac)' }}>check_circle</span>}
    </button>
  );
}

const btnStyle = (variant = 'primary', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', border: 'none',
  fontFamily: 'inherit', transition: 'all .15s',
  ...(variant === 'primary' && { background: 'var(--ac)', color: '#fff' }),
  ...(variant === 'ghost' && { background: 'var(--sf3)', color: 'var(--tx3)', border: '1px solid var(--bd)' }),
  ...extra,
});

const inpStyle = (extra = {}) => ({
  width: '100%', padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--sf)', border: '1px solid var(--bd)',
  borderRadius: 8, color: 'var(--tx)', outline: 'none', ...extra,
});

const lblStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6,
};
