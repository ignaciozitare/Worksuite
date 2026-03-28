// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { supabase }                          from '@/shared/lib/supabaseClient';
import { TimelineCard, Modal, ConfirmModal, Btn } from '@worksuite/ui';
import type { TimelineItem }                  from '@worksuite/ui';
import type { Environment }                   from '../domain/entities/Environment';
import type { Reservation, Repository, EnvPolicy } from '../domain/entities/Reservation';
import { SupabaseEnvironmentRepo }            from '../infra/supabase/SupabaseEnvironmentRepo';
import { SupabaseReservationRepo }            from '../infra/supabase/SupabaseReservationRepo';
import { GetEnvironments }                    from '../domain/useCases/GetEnvironments';
import { GetReservations }                    from '../domain/useCases/GetReservations';
import { UpsertReservation }                  from '../domain/useCases/UpsertReservation';
import { UpdateReservationStatus }            from '../domain/useCases/UpdateReservationStatus';

// ── Repos & use-cases (inicializados fuera del componente) ───────────────────
const envRepo  = new SupabaseEnvironmentRepo(supabase);
const resRepo  = new SupabaseReservationRepo(supabase);
const getEnvs  = new GetEnvironments(envRepo);
const getRes   = new GetReservations(resRepo);
const upsertUC = new UpsertReservation(resRepo);
const statusUC = new UpdateReservationStatus(resRepo);

// ── Status → TimelineItemStatus ──────────────────────────────────────────────
const STATUS_MAP = {
  Reserved:        'pending',
  InUse:           'running',
  Completed:       'done',
  Cancelled:       'cancelled',
  PolicyViolation: 'failed',
};

const CAT_COLOR = {
  DEV:     '#a78bfa',
  PRE:     '#fbbf24',
  STAGING: '#22d3ee',
};

const CAT_BG = {
  DEV:     'rgba(124,58,237,.15)',
  PRE:     'rgba(180,83,9,.15)',
  STAGING: 'rgba(14,116,144,.15)',
};

function fmtDt(iso) {
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}
function durH(s, e) {
  return ((new Date(e).getTime() - new Date(s).getTime()) / 3_600_000).toFixed(1);
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function isJira(k) { return /^[A-Z][A-Z0-9]+-\d+$/.test(k.trim()); }

// ── Reservation → TimelineItem ────────────────────────────────────────────────
function toTimelineItem(res, env) {
  const envName = env?.name ?? res.environmentId;
  const dur     = durH(res.plannedStart, res.plannedEnd);
  return {
    id:          res.id,
    title:       res.jiraIssueKeys.join(', ') || '—',
    description: res.description ?? undefined,
    status:      STATUS_MAP[res.status] ?? 'pending',
    date:        res.plannedStart,
    badge:       envName + ' · ' + dur + 'h',
    meta:        fmtDt(res.plannedStart) + ' → ' + fmtDt(res.plannedEnd),
  };
}

// ── Jira tag input ─────────────────────────────────────────────────────────────
function JiraTagInput({ value, onChange }) {
  const [draft, setDraft] = useState('');
  const [err,   setErr]   = useState('');

  const add = (raw) => {
    const key = raw.trim().toUpperCase();
    if (!key) return;
    if (!isJira(key)) { setErr('Formato inválido. Usa PROYECTO-123'); return; }
    if (value.includes(key)) { setErr('Ya añadida'); return; }
    onChange([...value, key]);
    setDraft('');
    setErr('');
  };

  return (
    <div>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 10px',
          background: 'var(--ws-surface-2)', border: '1px solid var(--ws-border)',
          borderRadius: 8, cursor: 'text', minHeight: 40 }}
        onClick={() => document.getElementById('jira-tag-input')?.focus()}
      >
        {value.map(k => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', background: 'rgba(124,58,237,.15)', color: '#a78bfa',
            borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }}>
            {k}
            <span onClick={() => onChange(value.filter(v => v !== k))}
              style={{ cursor: 'pointer', opacity: .7 }}>×</span>
          </span>
        ))}
        <input
          id="jira-tag-input"
          value={draft}
          onChange={e => { setDraft(e.target.value.toUpperCase()); setErr(''); }}
          onKeyDown={e => {
            if (['Enter', 'Tab', ',', ' '].includes(e.key)) { e.preventDefault(); add(draft); }
            if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => { if (draft.trim()) add(draft); }}
          placeholder={value.length ? '' : 'PROJ-123 → Enter'}
          style={{ background: 'transparent', border: 'none', outline: 'none',
            fontSize: 12, color: 'var(--ws-text)', fontFamily: 'monospace',
            flex: 1, minWidth: 120 }}
        />
      </div>
      {err && <p style={{ fontSize: 11, color: 'var(--ws-red)', marginTop: 3 }}>⚠ {err}</p>}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({ filter, setFilter, search, setSearch, onNew }) {
  const tabs = [
    { id: 'all',    label: 'Todas' },
    { id: 'active', label: 'Activas' },
    { id: 'mine',   label: 'Mis reservas' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
      borderBottom: '1px solid var(--ws-border)', background: 'var(--ws-surface)', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 2, background: 'var(--ws-surface-2)',
        border: '1px solid var(--ws-border)', borderRadius: 8, padding: 3 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            style={{ padding: '4px 12px', fontSize: 12, fontWeight: filter === t.id ? 600 : 400,
              borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: filter === t.id ? 'var(--ws-surface)' : 'transparent',
              color: filter === t.id ? 'var(--ws-text)' : 'var(--ws-text-3)',
              boxShadow: filter === t.id ? '0 1px 3px rgba(0,0,0,.15)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>
      <input
        placeholder="Buscar Jira, entorno…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ padding: '6px 10px', fontSize: 12, background: 'var(--ws-surface-2)',
          border: '1px solid var(--ws-border)', borderRadius: 8, color: 'var(--ws-text)',
          outline: 'none', width: 200, fontFamily: 'inherit' }}
      />
      <div style={{ marginLeft: 'auto' }}>
        <Btn variant="primary" size="sm" onClick={onNew}>+ Nueva reserva</Btn>
      </div>
    </div>
  );
}

// ── Reservation form ──────────────────────────────────────────────────────────
function ReservationForm({ res, envs, repos, allRes, policy, currentUser, onSave, onClose }) {
  const isEdit  = !!res;
  const isAdmin = currentUser?.role === 'admin';
  const [envId, setEnvId] = useState(res?.environmentId ?? '');
  const [jiras, setJiras] = useState(res?.jiraIssueKeys ?? []);
  const [desc,  setDesc]  = useState(res?.description ?? '');
  const [start, setStart] = useState(res?.plannedStart ? res.plannedStart.slice(0, 16) : '');
  const [end,   setEnd]   = useState(res?.plannedEnd   ? res.plannedEnd.slice(0, 16)   : '');
  const [rids,  setRids]  = useState(res?.selectedRepositoryIds ?? []);
  const [error, setError] = useState('');
  const selEnv = envs.find(e => e.id === envId);

  const submit = () => {
    if (!envId)          { setError('Selecciona un entorno.'); return; }
    if (!jiras.length)   { setError('Añade al menos una clave Jira.'); return; }
    if (!start || !end)  { setError('Inicio y fin son obligatorios.'); return; }

    const draft = {
      id:                    res?.id ?? uid(),
      environmentId:         envId,
      reservedByUserId:      res?.reservedByUserId ?? currentUser?.id,
      jiraIssueKeys:         jiras,
      description:           desc.trim() || null,
      plannedStart:          new Date(start).toISOString(),
      plannedEnd:            new Date(end).toISOString(),
      status:                res?.status ?? (new Date(start) <= new Date() ? 'InUse' : 'Reserved'),
      selectedRepositoryIds: rids,
      usageSession:          res?.usageSession ?? null,
      policyFlags:           { exceedsMaxDuration: false },
    };

    const validationError = upsertUC.validate(
      draft, allRes, selEnv?.maxReservationDuration ?? 999, policy, isAdmin,
    );
    if (validationError) { setError(validationError); return; }
    onSave(draft);
  };

  const inputStyle = { width: '100%', padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
    background: 'var(--ws-surface-2)', border: '1px solid var(--ws-border)',
    borderRadius: 8, color: 'var(--ws-text)', outline: 'none' };

  return (
    <Modal title={isEdit ? 'Editar reserva' : 'Nueva reserva'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)',
            textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
            Entorno
          </label>
          <select value={envId} onChange={e => setEnvId(e.target.value)} style={inputStyle}>
            <option value="">Selecciona entorno…</option>
            {envs.filter(e => !e.isArchived && (isAdmin || !e.isLocked)).map(e => (
              <option key={e.id} value={e.id}>
                {e.isLocked ? '🔒 ' : ''}{e.name} ({e.category}) — max {e.maxReservationDuration}h
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)',
            textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
            Claves Jira
          </label>
          <JiraTagInput value={jiras} onChange={setJiras} />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)',
            textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
            Descripción <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
          </label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
            style={{ ...inputStyle, resize: 'vertical' }} placeholder="Propósito de la reserva…" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)',
              textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
              Inicio
            </label>
            <input type="datetime-local" value={start}
              onChange={e => setStart(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)',
              textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
              Fin
            </label>
            <input type="datetime-local" value={end}
              onChange={e => setEnd(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {repos.filter(r => !r.isArchived).length > 0 && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)',
              textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 8 }}>
              Repositorios
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {repos.filter(r => !r.isArchived).map(r => (
                <button key={r.id}
                  onClick={() => setRids(p => p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id])}
                  style={{ padding: '4px 10px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all .15s',
                    background: rids.includes(r.id) ? 'rgba(124,58,237,.15)' : 'var(--ws-surface-2)',
                    color:      rids.includes(r.id) ? '#a78bfa'               : 'var(--ws-text-3)',
                    border:     rids.includes(r.id) ? '1px solid #a78bfa'     : '1px solid var(--ws-border)' }}>
                  📦 {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(248,113,113,.1)',
            border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, fontSize: 12, color: 'var(--ws-red)' }}>
            ⛔ {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8,
          borderTop: '1px solid var(--ws-border)', marginTop: 4 }}>
          <Btn variant="ghost"   size="sm" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={submit}>{isEdit ? 'Actualizar' : 'Crear'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Reservation detail ────────────────────────────────────────────────────────
function ReservationDetail({ res, envs, repos, users, currentUser, onClose, onEdit, onCheckIn, onCheckOut, onCancel, onAddBranch }) {
  const env      = envs.find(e => e.id === res.environmentId);
  const isOwner  = currentUser?.id === res.reservedByUserId;
  const isAdmin  = currentUser?.role === 'admin';
  const owner    = users?.find(u => u.id === res.reservedByUserId);
  const [branch, setBranch] = useState('');
  const [showB,  setShowB]  = useState(false);

  const canEdit   = (isOwner || isAdmin) && ['Reserved', 'PolicyViolation', 'InUse'].includes(res.status);
  const canCI     = isOwner && res.status === 'Reserved';
  const canCO     = isOwner && res.status === 'InUse';
  const canCancel = (isOwner || isAdmin) && ['Reserved', 'InUse', 'PolicyViolation'].includes(res.status);
  const repoNames = (res.selectedRepositoryIds ?? [])
    .map(id => repos.find(r => r.id === id)?.name).filter(Boolean);

  return (
    <Modal title="Detalle de reserva" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {env && (
            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: CAT_BG[env.category] ?? 'var(--ws-surface-2)',
              color: CAT_COLOR[env.category] ?? 'var(--ws-text-3)' }}>
              {env.category}
            </span>
          )}
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ws-text)' }}>{env?.name}</span>
        </div>

        {/* Jira keys */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(res.jiraIssueKeys ?? []).map(k => (
            <span key={k} style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12,
              fontFamily: 'monospace', background: 'rgba(124,58,237,.15)', color: '#a78bfa' }}>
              {k}
            </span>
          ))}
        </div>

        {res.description && (
          <p style={{ fontSize: 13, color: 'var(--ws-text-3)', lineHeight: 1.5 }}>{res.description}</p>
        )}

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
          {[
            ['Responsable', owner?.name ?? owner?.email ?? '—'],
            ['Duración',    durH(res.plannedStart, res.plannedEnd) + 'h'],
            ['Inicio',      fmtDt(res.plannedStart)],
            ['Fin',         fmtDt(res.plannedEnd)],
            ...(res.usageSession ? [
              ['Inicio real', fmtDt(res.usageSession.actual_start)],
              ['Fin real',    res.usageSession.actual_end ? fmtDt(res.usageSession.actual_end) : '—'],
            ] : []),
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)',
                textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{l}</div>
              <div style={{ color: 'var(--ws-text)' }}>{v}</div>
            </div>
          ))}
        </div>

        {repoNames.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {repoNames.map(n => (
              <span key={n} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12,
                background: 'var(--ws-surface-2)', color: 'var(--ws-text-3)' }}>📦 {n}</span>
            ))}
          </div>
        )}

        {(res.usageSession?.branches ?? []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {res.usageSession.branches.map(b => (
              <span key={b} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12,
                fontFamily: 'monospace', background: 'rgba(124,58,237,.12)', color: '#a78bfa' }}>
                {b}
              </span>
            ))}
          </div>
        )}

        {/* Add branch */}
        {res.status === 'InUse' && isOwner && (
          <div>
            {showB ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={branch} onChange={e => setBranch(e.target.value)} autoFocus
                  placeholder="nombre-rama"
                  style={{ flex: 1, padding: '6px 10px', fontSize: 12, fontFamily: 'monospace',
                    background: 'var(--ws-surface-2)', border: '1px solid var(--ws-border)',
                    borderRadius: 8, color: 'var(--ws-text)', outline: 'none' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && branch.trim()) {
                      onAddBranch(branch.trim()); setBranch(''); setShowB(false);
                    }
                  }}
                />
                <Btn variant="primary" size="sm"
                  onClick={() => { if (branch.trim()) { onAddBranch(branch.trim()); setBranch(''); setShowB(false); } }}>
                  Añadir
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => setShowB(false)}>×</Btn>
              </div>
            ) : (
              <Btn variant="outline" size="sm" onClick={() => setShowB(true)}>+ Añadir rama</Btn>
            )}
          </div>
        )}

        {env?.url && (
          <a href={env.url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 14px', background: 'var(--ws-accent)', color: '#fff',
              borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            🔗 Acceder al entorno
          </a>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8,
          paddingTop: 12, borderTop: '1px solid var(--ws-border)' }}>
          {canEdit   && <Btn variant="primary" size="sm" onClick={() => onEdit(res)}>✏️ Editar</Btn>}
          {canCI     && <Btn variant="success" size="sm" onClick={onCheckIn}>▶ Iniciar</Btn>}
          {canCO     && <Btn variant="warn"    size="sm" onClick={onCheckOut}>⏹ Finalizar</Btn>}
          {canCancel && <Btn variant="danger"  size="sm" onClick={onCancel}>✕ Cancelar</Btn>}
          <div style={{ marginLeft: 'auto' }}>
            <Btn variant="ghost" size="sm" onClick={onClose}>Cerrar</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────
export function EnvironmentsView({ currentUser, wsUsers }) {
  const [envs,   setEnvs]   = useState([]);
  const [res,    setRes]    = useState([]);
  const [repos,  setRepos]  = useState([]);
  const [policy, setPolicy] = useState({
    bookingWindowDays: 30, minDurationHours: 0.5, allowPastStart: true,
    businessHoursOnly: false, businessHoursStart: 8, businessHoursEnd: 20,
  });
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('active');
  const [search,  setSearch]  = useState('');
  const [form,    setForm]    = useState(null);   // null | 'new' | Reservation
  const [detail,  setDetail]  = useState(null);
  const [confirm, setConfirm] = useState(null);   // null | { message, onConfirm }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, { reservations, repositories, policy: pol }] = await Promise.all([
        getEnvs.execute(),
        getRes.execute(),
      ]);
      setEnvs(e);
      setRes(reservations);
      setRepos(repositories);
      setPolicy(pol);
    } catch (err) {
      console.error('[EnvironmentsView] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Filtrado ────────────────────────────────────────────────────────────────
  const visible = res.filter(r => {
    if (filter === 'active' && !['Reserved', 'InUse', 'PolicyViolation'].includes(r.status)) return false;
    if (filter === 'mine'   && r.reservedByUserId !== currentUser?.id) return false;
    if (search) {
      const q   = search.toLowerCase();
      const env = envs.find(e => e.id === r.environmentId);
      if (!r.jiraIssueKeys.some(k => k.toLowerCase().includes(q)) &&
          !(env?.name ?? '').toLowerCase().includes(q) &&
          !(r.description ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.plannedStart).getTime() - new Date(a.plannedStart).getTime());

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSave = async (draft) => {
    await upsertUC.execute(draft);
    setRes(prev => {
      const idx = prev.findIndex(r => r.id === draft.id);
      return idx >= 0 ? prev.map(r => r.id === draft.id ? draft : r) : [...prev, draft];
    });
    setForm(null);
  };

  const patchLocal = (id, patch) =>
    setRes(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));

  const handleCheckIn = async (r) => {
    const session = { actual_start: new Date().toISOString(), actual_end: null, branches: [] };
    await statusUC.checkIn(r.id);
    patchLocal(r.id, { status: 'InUse', usageSession: session });
    setDetail(null);
  };

  const handleCheckOut = async (r) => {
    await statusUC.checkOut(r.id, r);
    patchLocal(r.id, { status: 'Completed' });
    setDetail(null);
  };

  const handleCancel = (r) => {
    setConfirm({
      message: '¿Seguro que quieres cancelar esta reserva?',
      onConfirm: async () => {
        await statusUC.cancel(r.id);
        patchLocal(r.id, { status: 'Cancelled' });
        setDetail(null);
      },
    });
  };

  const handleAddBranch = async (r, branch) => {
    await statusUC.addBranch(r.id, branch, r);
    const branches = [...(r.usageSession?.branches ?? []), branch];
    const session  = { ...r.usageSession, branches };
    patchLocal(r.id, { usageSession: session });
    setDetail(d => d?.id === r.id ? { ...d, usageSession: session } : d);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <FilterBar
        filter={filter} setFilter={setFilter}
        search={search} setSearch={setSearch}
        onNew={() => setForm('new')}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ws-text-3)', fontSize: 13 }}>
            Cargando reservas…
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ws-text-3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              No hay reservas{filter !== 'all' ? ' en este filtro' : ''}
            </div>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')}
                style={{ marginTop: 12, background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--ws-accent)', fontSize: 13, fontFamily: 'inherit' }}>
                Ver todas →
              </button>
            )}
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 760 }}>
            {visible.map(r => {
              const env  = envs.find(e => e.id === r.environmentId);
              const item = toTimelineItem(r, env);
              return (
                <TimelineCard key={r.id} item={item} onClick={() => setDetail(r)} />
              );
            })}
          </div>
        )}
      </div>

      {/* Form modal */}
      {form && (
        <ReservationForm
          res={form === 'new' ? null : form}
          envs={envs} repos={repos} allRes={res}
          policy={policy} currentUser={currentUser}
          onSave={handleSave}
          onClose={() => setForm(null)}
        />
      )}

      {/* Detail modal */}
      {detail && (
        <ReservationDetail
          res={detail} envs={envs} repos={repos} users={wsUsers ?? []}
          currentUser={currentUser}
          onClose={() => setDetail(null)}
          onEdit={r => { setDetail(null); setForm(r); }}
          onCheckIn={() => handleCheckIn(detail)}
          onCheckOut={() => handleCheckOut(detail)}
          onCancel={() => handleCancel(detail)}
          onAddBranch={b => handleAddBranch(detail, b)}
        />
      )}

      {/* Confirm modal — API correcta: onCancel en lugar de onClose */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          confirmLabel="Confirmar"
          danger
          onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
