// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { AISettings, AIProvider, AIMode } from '../../domain/entities/AI';
import { DEFAULT_SYSTEM_PROMPT } from '../../domain/entities/AI';
import type { LLMModel } from '../../domain/ports/ILLMService';
import { aiRepo, llmService } from '../../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

export function SettingsView({ currentUser }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [mode, setMode] = useState<AIMode>('embedded');
  const [provider, setProvider] = useState<AIProvider>('google');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);

  // Dynamic model list
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');

  useEffect(() => {
    aiRepo.getSettings(currentUser.id).then(s => {
      if (s) {
        setMode(s.mode);
        setProvider(s.provider);
        setModel(s.model ?? '');
        setApiKey(s.apiKey ?? '');
        setSystemPrompt(s.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
      }
      setLoading(false);
    });
  }, [currentUser.id]);

  const save = async () => {
    setSaving(true);
    try {
      await aiRepo.upsertSettings({
        userId: currentUser.id,
        mode,
        provider,
        model: model || null,
        apiKey: apiKey || null,
        systemPrompt,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Force reload so the sidebar / chat tab updates with the new mode
      setTimeout(() => window.location.reload(), 600);
    } finally {
      setSaving(false);
    }
  };

  const onProviderChange = (p: AIProvider) => {
    setProvider(p);
    setModel('');
    setModels([]);
    setModelsError('');
  };

  const loadModels = async () => {
    if (!apiKey) { setModelsError(t('vectorLogic.needApiKey')); return; }
    setLoadingModels(true);
    setModelsError('');
    try {
      const list = await llmService.listModels(provider, apiKey);
      setModels(list);
      if (list.length > 0 && !list.find(m => m.id === model)) {
        setModel(list[0].id);
      }
    } catch (err: any) {
      setModelsError(err.message ?? String(err));
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
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

      {/* Mode toggle */}
      <Section title={t('vectorLogic.aiMode')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ModeCard
            active={mode === 'embedded'}
            onClick={() => setMode('embedded')}
            icon="forum"
            title={t('vectorLogic.modeEmbedded')}
            desc={t('vectorLogic.modeEmbeddedDesc')}
          />
          <ModeCard
            active={mode === 'external'}
            onClick={() => setMode('external')}
            icon="hub"
            title={t('vectorLogic.modeExternal')}
            desc={t('vectorLogic.modeExternalDesc')}
          />
        </div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 12, lineHeight: 1.5 }}>
          {mode === 'embedded' ? t('vectorLogic.modeEmbeddedHint') : t('vectorLogic.modeExternalHint')}
        </p>
      </Section>

      {/* Provider config — only relevant in embedded mode */}
      {mode === 'embedded' && (
        <>
          <Section title={t('vectorLogic.aiProvider')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <ProviderCard
                active={provider === 'google'}
                onClick={() => onProviderChange('google')}
                icon="✦"
                name="Google Gemini"
                desc={t('vectorLogic.providerGoogleDesc')}
                badge={t('vectorLogic.providerFreeTier')}
              />
              <ProviderCard
                active={provider === 'anthropic'}
                onClick={() => onProviderChange('anthropic')}
                icon="🧠"
                name="Anthropic Claude"
                desc={t('vectorLogic.providerAnthropicDesc')}
              />
              <ProviderCard
                active={provider === 'openai'}
                onClick={() => onProviderChange('openai')}
                icon="✨"
                name="OpenAI ChatGPT"
                desc={t('vectorLogic.providerOpenaiDesc')}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lblStyle}>{t('vectorLogic.apiKey')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder={
                    provider === 'anthropic' ? 'sk-ant-...' :
                    provider === 'openai' ? 'sk-...' :
                    'AIza...'
                  }
                  style={{ ...inpStyle(), fontFamily: 'monospace' }} />
                <button onClick={() => setShowKey(v => !v)} style={btnStyle('ghost')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {showKey ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6, lineHeight: 1.5 }}>
                {provider === 'google' && (
                  <>
                    {t('vectorLogic.providerGoogleHelp')}{' '}
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)' }}>
                      Google AI Studio
                    </a>
                  </>
                )}
                {provider === 'anthropic' && (
                  <>
                    {t('vectorLogic.providerAnthropicHelp')}{' '}
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)' }}>
                      Anthropic Console
                    </a>
                  </>
                )}
                {provider === 'openai' && (
                  <>
                    {t('vectorLogic.providerOpenaiHelp')}{' '}
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ac)' }}>
                      OpenAI Platform
                    </a>
                  </>
                )}
              </p>
            </div>

            <div>
              <label style={lblStyle}>{t('vectorLogic.model')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={model} onChange={e => setModel(e.target.value)} style={inpStyle()} disabled={models.length === 0}>
                  {models.length === 0 ? (
                    <option value="">{t('vectorLogic.loadModelsFirst')}</option>
                  ) : (
                    models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                  )}
                </select>
                <button onClick={loadModels} disabled={loadingModels || !apiKey} style={btnStyle('primary')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {loadingModels ? 'hourglass_empty' : 'download'}
                  </span>
                  {loadingModels ? t('common.loading') : t('vectorLogic.loadModels')}
                </button>
              </div>
              {modelsError && (
                <p style={{ fontSize: 10, color: 'var(--red)', marginTop: 6, lineHeight: 1.5, fontFamily: 'monospace', wordBreak: 'break-word' }}>
                  ⚠ {modelsError}
                </p>
              )}
              {models.length > 0 && !modelsError && (
                <p style={{ fontSize: 10, color: 'var(--green)', marginTop: 6 }}>
                  ✓ {models.length} {t('vectorLogic.modelsAvailable')}
                </p>
              )}
            </div>
          </Section>

          <Section title={t('vectorLogic.systemPrompt')}>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
              rows={6}
              style={{ ...inpStyle(), fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
            <p style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6 }}>
              {t('vectorLogic.systemPromptDesc')}
            </p>
          </Section>
        </>
      )}

      {/* External mode — point user to MCP Access tab */}
      {mode === 'external' && (
        <Section title={t('vectorLogic.modeExternal')}>
          <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.6 }}>
            {t('vectorLogic.modeExternalSetup')}
          </p>
        </Section>
      )}

      {/* Save */}
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

function ModeCard({ active, onClick, icon, title, desc }: {
  active: boolean; onClick: () => void; icon: string; title: string; desc: string;
}) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 18px',
        background: active ? 'rgba(79,110,247,.08)' : 'var(--sf3)',
        border: `1px solid ${active ? 'var(--ac)' : 'var(--bd)'}`,
        borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left', transition: 'all .15s',
      }}>
      <span className="material-symbols-outlined" style={{ fontSize: 24, color: active ? 'var(--ac)' : 'var(--tx3)', marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
      </div>
      {active && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--ac)' }}>check_circle</span>}
    </button>
  );
}

function ProviderCard({ active, onClick, icon, name, desc, badge }: {
  active: boolean; onClick: () => void; icon: string; name: string; desc: string; badge?: string;
}) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '14px 14px',
        background: active ? 'rgba(79,110,247,.08)' : 'var(--sf3)',
        border: `1px solid ${active ? 'var(--ac)' : 'var(--bd)'}`,
        borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left', transition: 'all .15s', position: 'relative',
      }}>
      {badge && (
        <span style={{
          position: 'absolute', top: 8, right: 8, fontSize: 8, fontWeight: 700,
          padding: '2px 6px', borderRadius: 3, background: 'rgba(62,207,142,.15)',
          color: 'var(--green)', letterSpacing: '.05em', textTransform: 'uppercase',
        }}>{badge}</span>
      )}
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{name}</div>
      <div style={{ fontSize: 10, color: 'var(--tx3)', lineHeight: 1.3 }}>{desc}</div>
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
