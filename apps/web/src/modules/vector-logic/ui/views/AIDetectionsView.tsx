// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import type { EmailDetection } from '../../domain/entities/EmailDetection';
import { gmailThreadUrl } from '../../domain/entities/EmailDetection';
import type { TaskType } from '../../domain/entities/TaskType';
import type { Priority } from '../../domain/entities/Priority';
import { emailDetectionRepo, taskTypeRepo, priorityRepo, gmailConnectionRepo } from '../../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

type Tab = 'pending_review' | 'auto_created' | 'approved' | 'rejected' | 'failed';

export function AIDetectionsView({ currentUser }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('pending_review');
  const [detections, setDetections] = useState<EmailDetection[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmailDetection | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const load = async (status: Tab) => {
    setLoading(true);
    try {
      const list = await emailDetectionRepo.list(status);
      setDetections(list);
    } catch (err) { console.error('[Detections]', err); setDetections([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    (async () => {
      const [tts, ps, conn] = await Promise.all([
        taskTypeRepo.findAll(),
        priorityRepo.ensureDefaults(currentUser.id),
        gmailConnectionRepo.getStatus(),
      ]);
      setTaskTypes(tts);
      setPriorities(ps);
      setConnected(conn.connection !== null);
      await load(tab);
    })();
  }, []);

  useEffect(() => { load(tab); }, [tab]);

  const counts = useMemo(() => {
    // Best-effort counts from the current page — a dedicated count endpoint
    // could be added later if the list grows beyond a page.
    return { [tab]: detections.length };
  }, [detections, tab]);

  const approve = async (d: EmailDetection, overrides?: any) => {
    await emailDetectionRepo.approve(d.id, overrides);
    setDetections(prev => prev.filter(x => x.id !== d.id));
    setSelected(null);
  };

  const reject = async (d: EmailDetection) => {
    await emailDetectionRepo.reject(d.id);
    setDetections(prev => prev.filter(x => x.id !== d.id));
    setSelected(null);
  };

  if (connected === false) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', color: 'var(--tx3)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .25, display: 'block', marginBottom: 12 }}>mail</span>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6, color: 'var(--tx)' }}>
          {t('vectorLogic.noGmailConnected')}
        </div>
        <div style={{ fontSize: 12, opacity: .7 }}>
          {t('vectorLogic.noGmailConnectedHint')}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
            {t('vectorLogic.aiDetections')}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
            {t('vectorLogic.aiDetectionsDesc')}
          </p>
        </div>
        <PollNowButton onComplete={() => load(tab)} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {([
          { id: 'pending_review', icon: 'schedule', label: t('vectorLogic.tabPending') },
          { id: 'auto_created',   icon: 'bolt',     label: t('vectorLogic.tabAutoCreated') },
          { id: 'approved',       icon: 'check',    label: t('vectorLogic.tabApproved') },
          { id: 'rejected',       icon: 'close',    label: t('vectorLogic.tabRejected') },
          { id: 'failed',         icon: 'error',    label: t('vectorLogic.tabFailed') },
        ] as const).map(x => {
          const active = tab === x.id;
          return (
            <button key={x.id} onClick={() => setTab(x.id as Tab)}
              style={{
                background: active ? 'var(--ac)' : 'transparent',
                color: active ? '#fff' : 'var(--tx3)',
                border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: active ? 600 : 400,
                fontSize: 11, padding: '6px 12px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{x.icon}</span>
              {x.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--tx3)' }}>{t('common.loading')}</div>
      ) : detections.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tx3)', background: 'var(--sf2)', borderRadius: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .25, display: 'block', marginBottom: 12 }}>inbox</span>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{t('vectorLogic.noDetections')}</div>
          <div style={{ fontSize: 11, opacity: .7 }}>{t('vectorLogic.noDetectionsHint')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {detections.map(d => (
            <div key={d.id} onClick={() => setSelected(d)}
              style={{
                background: 'var(--sf2)', borderRadius: 12, padding: '14px 16px',
                border: '1px solid var(--bd)', cursor: 'pointer',
                transition: 'all .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--ac)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--bd)'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.proposedTitle ?? d.subject ?? t('vectorLogic.noSubject')}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>{d.fromName || d.fromEmail}</span>
                    <span style={{ opacity: .5 }}>•</span>
                    <span>{new Date(d.gmailReceivedAt).toLocaleString()}</span>
                    {d.confidence !== null && (
                      <>
                        <span style={{ opacity: .5 }}>•</span>
                        <ConfidenceBadge value={d.confidence} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DetectionDetail
          detection={selected}
          taskTypes={taskTypes}
          priorities={priorities}
          canAct={tab === 'pending_review'}
          onApprove={approve}
          onReject={reject}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? 'var(--green)' : pct >= 65 ? 'var(--amber)' : 'var(--red)';
  return (
    <span style={{
      padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
      background: `${color}1a`, color, letterSpacing: '.03em',
    }}>{pct}%</span>
  );
}

function DetectionDetail({ detection, taskTypes, priorities, canAct, onApprove, onReject, onClose }: {
  detection: EmailDetection;
  taskTypes: TaskType[];
  priorities: Priority[];
  canAct: boolean;
  onApprove: (d: EmailDetection, overrides?: any) => Promise<void>;
  onReject: (d: EmailDetection) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [title, setTitle] = useState(detection.proposedTitle ?? detection.subject ?? '');
  const [description, setDescription] = useState(detection.proposedDescription ?? '');
  const [taskTypeId, setTaskTypeId] = useState(detection.proposedTaskTypeId ?? '');
  const [priority, setPriority] = useState(detection.proposedPriority ?? '');
  const [dueDate, setDueDate] = useState(detection.proposedDueDate ?? '');
  const [busy, setBusy] = useState(false);

  const doApprove = async () => {
    if (!taskTypeId) { await dialog.alert(t('vectorLogic.missingTaskType'), { icon: 'warning' }); return; }
    setBusy(true);
    try {
      await onApprove(detection, {
        title: title.trim(),
        description,
        taskTypeId,
        priority: priority || undefined,
        dueDate: dueDate || null,
      });
    } finally { setBusy(false); }
  };

  const doReject = async () => {
    if (!(await dialog.confirm(t('vectorLogic.rejectDetectionConfirm'), { danger: true }))) return;
    setBusy(true);
    try { await onReject(detection); } finally { setBusy(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 16,
        width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--ac)' }}>mail</span>
          <h3 style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>
            {detection.subject ?? t('vectorLogic.noSubject')}
          </h3>
          <a href={gmailThreadUrl(detection.gmailThreadId)} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: 'var(--ac)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            {t('vectorLogic.openInGmail')} <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
          </a>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--tx3)', display: 'flex', gap: 12 }}>
            <span><b>{t('vectorLogic.from')}:</b> {detection.fromName ? `${detection.fromName} <${detection.fromEmail}>` : detection.fromEmail}</span>
            <span><b>{t('vectorLogic.received')}:</b> {new Date(detection.gmailReceivedAt).toLocaleString()}</span>
          </div>

          {detection.bodySnippet && (
            <div style={{
              background: 'var(--sf2)', padding: 12, borderRadius: 8, fontSize: 12,
              color: 'var(--tx2)', maxHeight: 160, overflowY: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {detection.bodySnippet}
            </div>
          )}

          <div style={{ height: 1, background: 'var(--bd)' }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {t('vectorLogic.proposedTask')}
          </div>

          <div>
            <label style={lblStyle}>{t('vectorLogic.taskTitle')}</label>
            <input value={title} onChange={e => setTitle(e.target.value)} disabled={!canAct} style={inpStyle} />
          </div>

          <div>
            <label style={lblStyle}>{t('vectorLogic.description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={!canAct}
              rows={4} style={{ ...inpStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={lblStyle}>{t('vectorLogic.taskType')}</label>
              <select value={taskTypeId} onChange={e => setTaskTypeId(e.target.value)} disabled={!canAct} style={inpStyle}>
                <option value="">—</option>
                {taskTypes.map(tt => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>{t('vectorLogic.priority')}</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} disabled={!canAct} style={inpStyle}>
                <option value="">—</option>
                {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>{t('vectorLogic.dueDate')}</label>
              <input type="date" value={dueDate ?? ''} onChange={e => setDueDate(e.target.value)} disabled={!canAct} style={inpStyle} />
            </div>
          </div>

          {detection.status === 'failed' && detection.errorMessage && (
            <div style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(224,82,82,.08)', padding: 10, borderRadius: 6, fontFamily: 'monospace' }}>
              {detection.errorMessage}
            </div>
          )}
        </div>

        {canAct && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--bd)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={doReject} disabled={busy} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(224,82,82,.08)', color: 'var(--red)', border: '1px solid rgba(224,82,82,.2)',
              fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              {t('vectorLogic.reject')}
            </button>
            <button onClick={doApprove} disabled={busy} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'var(--green)', color: '#fff', border: 'none',
              fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
              {busy ? t('common.loading') : t('vectorLogic.approveAndCreate')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PollNowButton({ onComplete }: { onComplete: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await gmailConnectionRepo.pollNow();
      if (r.skipped_not_configured) {
        setResult(t('vectorLogic.pollSkippedNotConnected'));
      } else if (r.error) {
        setResult(r.error);
      } else {
        const msg = `${t('vectorLogic.pollListed')}: ${r.listed} · ${t('vectorLogic.pollAutoCreated')}: ${r.auto_created} · ${t('vectorLogic.pollQueued')}: ${r.queued}`;
        setResult(msg);
        await onComplete();
      }
    } catch (err: any) {
      setResult(err?.message ?? String(err));
    } finally {
      setBusy(false);
      setTimeout(() => setResult(null), 5000);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {result && <span style={{ fontSize: 10, color: 'var(--tx3)', maxWidth: 260, textAlign: 'right' }}>{result}</span>}
      <button onClick={run} disabled={busy}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: busy ? 'wait' : 'pointer', border: 'none',
          fontFamily: 'inherit', background: 'var(--ac)', color: '#fff',
        }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{busy ? 'hourglass_empty' : 'refresh'}</span>
        {busy ? t('common.loading') : t('vectorLogic.pollNow')}
      </button>
    </div>
  );
}

const inpStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
  color: 'var(--tx)', outline: 'none',
} as const;

const lblStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5,
} as const;
