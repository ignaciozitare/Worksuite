// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import type { AISettings, AIProvider, AIMode } from '../../domain/entities/AI';
import { DEFAULT_SYSTEM_PROMPT } from '../../domain/entities/AI';
import type { LLMModel } from '../../domain/ports/ILLMService';
import type { Priority } from '../../domain/entities/Priority';
import type { GmailConnectionStatus } from '../../domain/entities/GmailConnection';
import type { TaskType } from '../../domain/entities/TaskType';
import { aiRepo, llmService, priorityRepo, gmailConnectionRepo, taskTypeRepo } from '../../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

export function SettingsView({ currentUser }: Props) {
  const { t } = useTranslation();
  const dialog = useDialog();
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

  // Priorities list (CRUD)
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [newPriorityName, setNewPriorityName] = useState('');
  const [newPriorityColor, setNewPriorityColor] = useState('#4f6ef7');

  // Gmail / Email Intelligence
  const [gmail, setGmail] = useState<GmailConnectionStatus | null>(null);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [gmailError, setGmailError] = useState('');

  useEffect(() => {
    (async () => {
      const [settings, prs, gmailStatus, tts] = await Promise.all([
        aiRepo.getSettings(currentUser.id),
        priorityRepo.ensureDefaults(currentUser.id),
        gmailConnectionRepo.getStatus().catch(() => ({ connection: null, oauthConfigured: false })),
        taskTypeRepo.findAll().catch(() => []),
      ]);
      if (settings) {
        setMode(settings.mode);
        setProvider(settings.provider);
        setModel(settings.model ?? '');
        setApiKey(settings.apiKey ?? '');
        setSystemPrompt(settings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
      }
      setPriorities(prs);
      setGmail(gmailStatus);
      setTaskTypes(tts);
      setLoading(false);
    })();

    // Handle OAuth callback query params (?gmail=connected|denied|error)
    const params = new URLSearchParams(window.location.search);
    const gmailFlag = params.get('gmail');
    if (gmailFlag) {
      if (gmailFlag === 'connected') {
        // Refresh status
        gmailConnectionRepo.getStatus().then(setGmail).catch(() => {});
      } else if (gmailFlag === 'denied') {
        setGmailError(t('vectorLogic.gmailDenied'));
      } else if (gmailFlag === 'error') {
        setGmailError(t('vectorLogic.gmailError'));
      }
      // Clean the URL so a refresh doesn't re-show the message
      const url = new URL(window.location.href);
      url.searchParams.delete('gmail');
      window.history.replaceState({}, '', url.toString());
    }
  }, [currentUser.id]);

  const connectGmail = async () => {
    setGmailError('');
    try {
      const url = await gmailConnectionRepo.startOAuth();
      window.location.href = url;
    } catch (err: any) {
      setGmailError(err?.message ?? String(err));
    }
  };

  const disconnectGmail = async () => {
    if (!(await dialog.confirm(t('vectorLogic.disconnectGmailConfirm'), { danger: true }))) return;
    await gmailConnectionRepo.disconnect();
    setGmail(prev => prev ? { ...prev, connection: null } : prev);
  };

  const updateGmailSettings = async (patch: {
    pollingIntervalMinutes?: number;
    confidenceThreshold?: number;
    defaultPriorityId?: string | null;
    defaultTaskTypeId?: string | null;
  }) => {
    await gmailConnectionRepo.updateSettings(patch);
    setGmail(prev => prev && prev.connection ? {
      ...prev,
      connection: {
        ...prev.connection,
        pollingIntervalMinutes: patch.pollingIntervalMinutes ?? prev.connection.pollingIntervalMinutes,
        confidenceThreshold: patch.confidenceThreshold ?? prev.connection.confidenceThreshold,
        defaultPriorityId: patch.defaultPriorityId !== undefined ? patch.defaultPriorityId : prev.connection.defaultPriorityId,
        defaultTaskTypeId: patch.defaultTaskTypeId !== undefined ? patch.defaultTaskTypeId : prev.connection.defaultTaskTypeId,
      },
    } : prev);
  };

  const addPriority = async () => {
    if (!newPriorityName.trim()) return;
    const created = await priorityRepo.create({
      userId: currentUser.id,
      name: newPriorityName.trim(),
      color: newPriorityColor,
      sortOrder: priorities.length,
    });
    setPriorities(prev => [...prev, created]);
    setNewPriorityName('');
    setNewPriorityColor('#4f6ef7');
  };

  const updatePriority = async (id: string, patch: Partial<Priority>) => {
    await priorityRepo.update(id, patch);
    setPriorities(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  const removePriority = async (id: string) => {
    if (!(await dialog.confirm(t('common.delete') + '?', { danger: true }))) return;
    await priorityRepo.remove(id);
    setPriorities(prev => prev.filter(p => p.id !== id));
  };

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

      {/* Email Intelligence — Gmail connection + settings */}
      <Section title={t('vectorLogic.emailIntelligence')}>
        {!gmail?.oauthConfigured && (
          <div style={{
            fontSize: 11, color: 'var(--amber)', padding: '8px 12px',
            background: 'rgba(245,158,11,.08)', borderRadius: 8, marginBottom: 12,
            border: '1px solid rgba(245,158,11,.2)',
          }}>
            {t('vectorLogic.gmailNotConfiguredServer')}
          </div>
        )}
        {gmailError && (
          <div style={{
            fontSize: 11, color: 'var(--red)', padding: '8px 12px',
            background: 'rgba(224,82,82,.08)', borderRadius: 8, marginBottom: 12,
          }}>{gmailError}</div>
        )}
        {!gmail?.connection ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--tx3)' }}>mail</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{t('vectorLogic.gmailNotConnected')}</div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{t('vectorLogic.gmailConnectHint')}</div>
            </div>
            <button onClick={connectGmail} disabled={!gmail?.oauthConfigured} style={btnStyle('primary')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>link</span>
              {t('vectorLogic.connectGmail')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', background: 'var(--sf3)', borderRadius: 8,
              border: '1px solid rgba(62,207,142,.25)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--green)' }}>check_circle</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{gmail.connection.email}</div>
                <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
                  {gmail.connection.lastPolledAt
                    ? `${t('vectorLogic.lastChecked')}: ${new Date(gmail.connection.lastPolledAt).toLocaleString()}`
                    : t('vectorLogic.neverPolledYet')}
                </div>
              </div>
              <button onClick={disconnectGmail} style={btnStyle('ghost')}>
                {t('vectorLogic.disconnect')}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lblStyle}>
                  {t('vectorLogic.confidenceThreshold')}: <b style={{ color: 'var(--ac)' }}>{Math.round(gmail.connection.confidenceThreshold * 100)}%</b>
                </label>
                <input type="range" min={0} max={100} step={5}
                  value={Math.round(gmail.connection.confidenceThreshold * 100)}
                  onChange={e => updateGmailSettings({ confidenceThreshold: Number(e.target.value) / 100 })}
                  style={{ width: '100%' }} />
                <p style={{ fontSize: 10, color: 'var(--tx3)', lineHeight: 1.4, marginTop: 4 }}>
                  {t('vectorLogic.confidenceThresholdHint')}
                </p>
              </div>
              <div>
                <label style={lblStyle}>{t('vectorLogic.pollingInterval')} ({t('vectorLogic.minutes')})</label>
                <input type="number" min={1} max={1440}
                  value={gmail.connection.pollingIntervalMinutes}
                  onChange={e => updateGmailSettings({ pollingIntervalMinutes: Number(e.target.value) })}
                  style={inpStyle()} />
              </div>
              <div>
                <label style={lblStyle}>{t('vectorLogic.defaultTaskType')}</label>
                <select
                  value={gmail.connection.defaultTaskTypeId ?? ''}
                  onChange={e => updateGmailSettings({ defaultTaskTypeId: e.target.value || null })}
                  style={inpStyle()}>
                  <option value="">—</option>
                  {taskTypes.map(tt => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lblStyle}>{t('vectorLogic.defaultPriority')}</label>
                <select
                  value={gmail.connection.defaultPriorityId ?? ''}
                  onChange={e => updateGmailSettings({ defaultPriorityId: e.target.value || null })}
                  style={inpStyle()}>
                  <option value="">—</option>
                  {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Priorities CRUD */}
      <Section title={t('vectorLogic.priorities')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {priorities.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', background: 'var(--sf3)', borderRadius: 8,
              border: '1px solid var(--bd)',
            }}>
              <input type="color" value={p.color}
                onChange={e => updatePriority(p.id, { color: e.target.value })}
                style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer' }} />
              <input value={p.name}
                onChange={e => setPriorities(prev => prev.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))}
                onBlur={e => updatePriority(p.id, { name: e.target.value.trim() || p.name })}
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--tx)', fontSize: 13, fontWeight: 600, outline: 'none', fontFamily: 'inherit' }} />
              {/* Icon picker — Material Symbols Outlined name (e.g. priority_high). Empty = no icon. */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', background: 'var(--sf2)', borderRadius: 6,
                border: '1px solid var(--bd)',
              }}>
                <span className="material-symbols-outlined"
                      style={{ fontSize: 14, color: p.icon ? p.color : 'var(--tx3)' }}>
                  {p.icon || 'label'}
                </span>
                <input value={p.icon ?? ''}
                  onChange={e => setPriorities(prev => prev.map(x => x.id === p.id ? { ...x, icon: e.target.value } : x))}
                  onBlur={e => updatePriority(p.id, { icon: e.target.value.trim() || null })}
                  placeholder="icon"
                  title={t('vectorLogic.priorityIconHint')}
                  style={{ width: 110, background: 'transparent', border: 'none', color: 'var(--tx)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'monospace' }}>{p.color}</span>
              <button onClick={() => removePriority(p.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', opacity: .6, display: 'flex', alignItems: 'center', padding: 4 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '.6'}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            </div>
          ))}
          {priorities.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: '12px 0', opacity: .6 }}>
              {t('vectorLogic.noneYet')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="color" value={newPriorityColor} onChange={e => setNewPriorityColor(e.target.value)}
            style={{ width: 36, height: 36, border: '1px solid var(--bd)', borderRadius: 6, cursor: 'pointer', background: 'var(--sf)' }} />
          <input value={newPriorityName} onChange={e => setNewPriorityName(e.target.value)}
            placeholder={t('vectorLogic.priorityNamePlaceholder')}
            onKeyDown={e => { if (e.key === 'Enter') addPriority(); }}
            style={inpStyle()} />
          <button onClick={addPriority} disabled={!newPriorityName.trim()} style={btnStyle('primary')}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            {t('common.add')}
          </button>
        </div>
      </Section>

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
  fontFamily: 'inherit', transition: 'all .2s',
  ...(variant === 'primary' && {
    background: 'linear-gradient(135deg, #adc6ff, #4d8eff)',
    color: '#fff',
    boxShadow: '0 2px 12px rgba(77,142,255,.3)',
  }),
  ...(variant === 'ghost' && {
    background: 'rgba(42,42,42,.8)',
    backdropFilter: 'blur(12px)',
    color: 'var(--tx3)',
    border: '1px solid var(--bd)',
  }),
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
