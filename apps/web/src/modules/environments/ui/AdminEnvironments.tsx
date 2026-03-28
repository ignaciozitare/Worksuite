// @ts-nocheck
import { useState, useEffect } from 'react';
import { supabase }            from '../../../shared/lib/supabaseClient';
import { Btn, Modal }          from '@worksuite/ui';
import type { Environment }    from '../domain/entities/Environment';
import type { Repository, EnvPolicy } from '../domain/entities/Reservation';
import { SupabaseEnvironmentRepo } from '../infra/supabase/SupabaseEnvironmentRepo';
import { SupabaseReservationRepo } from '../infra/supabase/SupabaseReservationRepo';

const envRepo = new SupabaseEnvironmentRepo(supabase);
const resRepo = new SupabaseReservationRepo(supabase);

const CAT_COLORS = {
  DEV:     { bg: 'rgba(124,58,237,.15)', text: '#a78bfa' },
  PRE:     { bg: 'rgba(180,83,9,.15)',   text: '#fbbf24' },
  STAGING: { bg: 'rgba(14,116,144,.15)', text: '#22d3ee' },
};

const INPUT = {
  width: '100%', padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--ws-surface-2)', border: '1px solid var(--ws-border)',
  borderRadius: 8, color: 'var(--ws-text)', outline: 'none',
} as const;

// ── Environments admin ────────────────────────────────────────────────────────
export function AdminEnvEnvironments() {
  const [envs, setEnvs]   = useState<Environment[]>([]);
  const [form, setForm]   = useState<Environment | 'new' | null>(null);

  useEffect(() => { envRepo.getAll().then(setEnvs); }, []);

  const save = async (e: Environment) => {
    if (envs.find(x => x.id === e.id)) {
      await envRepo.update(e);
      setEnvs(p => p.map(x => x.id === e.id ? e : x));
    } else {
      const created = await envRepo.create(e);
      setEnvs(p => [...p, created]);
    }
    setForm(null);
  };

  const toggle = async (env: Environment, field: 'isLocked' | 'isArchived') => {
    const updated = { ...env, [field]: !env[field] };
    await envRepo.update(updated);
    setEnvs(p => p.map(x => x.id === env.id ? updated : x));
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ws-text)' }}>
          Entornos ({envs.filter(e => !e.isArchived).length} activos)
        </span>
        <Btn variant="primary" size="sm" onClick={() => setForm('new')}>+ Nuevo</Btn>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {envs.map(env => {
          const cc = CAT_COLORS[env.category] ?? CAT_COLORS.DEV;
          return (
            <div key={env.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', background: 'var(--ws-surface-2)',
              borderRadius: 10, border: '1px solid var(--ws-border)', opacity: env.isArchived ? .5 : 1 }}>
              <div style={{ width: 4, height: 32, borderRadius: 2,
                background: env.color ?? cc.text, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ws-text)' }}>{env.name}</span>
                  <span style={{ background: cc.bg, color: cc.text,
                    padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600 }}>{env.category}</span>
                  {env.isLocked   && <span style={{ fontSize: 9, color: 'var(--ws-deploy)', fontWeight: 700 }}>🔒 BLOQUEADO</span>}
                  {env.isArchived && <span style={{ fontSize: 9, color: 'var(--ws-text-3)' }}>Archivado</span>}
                </div>
                <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>
                  Max {env.maxReservationDuration}h{env.url ? ' · ' + env.url : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Btn variant="ghost" size="sm" onClick={() => toggle(env, 'isLocked')}>
                  {env.isLocked ? '🔓' : '🔒'}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => setForm(env)}>✏️</Btn>
                {!env.isArchived && (
                  <Btn variant="danger" size="sm" onClick={() => toggle(env, 'isArchived')}>Archivar</Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {form && (
        <EnvFormModal
          env={form === 'new' ? null : form}
          onSave={save}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

function EnvFormModal({ env, onSave, onClose }: { env: Environment | null; onSave: (e: Environment) => void; onClose: () => void }) {
  const [name, setName]  = useState(env?.name ?? '');
  const [cat,  setCat]   = useState(env?.category ?? 'DEV');
  const [max,  setMax]   = useState(env?.maxReservationDuration ?? 8);
  const [url,  setUrl]   = useState(env?.url ?? '');
  const [err,  setErr]   = useState('');

  const submit = () => {
    if (!name.trim()) { setErr('Nombre requerido'); return; }
    onSave({
      id: env?.id ?? '',
      name: name.trim(), category: cat as any,
      maxReservationDuration: Number(max) || 8,
      url: url.trim() || null, color: env?.color ?? null,
      isLocked: env?.isLocked ?? false, isArchived: env?.isArchived ?? false,
    });
  };

  return (
    <Modal title={env ? 'Editar entorno' : 'Nuevo entorno'} onClose={onClose}>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>Nombre</label>
          <input style={INPUT} value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="DEV-03" autoFocus />
          {err && <p style={{ fontSize: 11, color: 'var(--ws-red)', marginTop: 3 }}>⚠ {err}</p>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>Categoría</label>
            <select style={INPUT} value={cat} onChange={e => setCat(e.target.value)}>
              <option value="DEV">DEV</option>
              <option value="PRE">PRE</option>
              <option value="STAGING">STAGING</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>Max duración (h)</label>
            <input type="number" style={INPUT} value={max} onChange={e => setMax(Number(e.target.value))} min={1} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>URL (opcional)</label>
          <input style={INPUT} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://dev.example.com" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost"   size="sm" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={submit}>{env ? 'Actualizar' : 'Crear'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Repositories admin ────────────────────────────────────────────────────────
export function AdminEnvRepositories() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [show,  setShow]  = useState(false);
  const [name,  setName]  = useState('');
  const [err,   setErr]   = useState('');

  useEffect(() => { resRepo.getRepositories().then(setRepos); }, []);

  const create = async () => {
    if (!name.trim()) { setErr('Nombre requerido'); return; }
    const created = await resRepo.createRepository({ name: name.trim(), isArchived: false });
    setRepos(p => [...p, created]);
    setName(''); setShow(false); setErr('');
  };

  const archive = async (r: Repository) => {
    await resRepo.updateRepository({ ...r, isArchived: true });
    setRepos(p => p.map(x => x.id === r.id ? { ...x, isArchived: true } : x));
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ws-text)' }}>
          Repositorios ({repos.filter(r => !r.isArchived).length} activos)
        </span>
        <Btn variant="primary" size="sm" onClick={() => setShow(true)}>+ Nuevo</Btn>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {repos.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
            background: 'var(--ws-surface-2)', borderRadius: 8, border: '1px solid var(--ws-border)',
            opacity: r.isArchived ? .5 : 1 }}>
            <span style={{ fontSize: 13, color: 'var(--ws-text)' }}>📦 {r.name}</span>
            {!r.isArchived && <Btn variant="danger" size="sm" onClick={() => archive(r)}>×</Btn>}
          </div>
        ))}
      </div>
      {show && (
        <Modal title="Nuevo repositorio" onClose={() => { setShow(false); setErr(''); }}>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input style={INPUT} value={name} onChange={e => { setName(e.target.value); setErr(''); }}
              placeholder="frontend-app" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') create(); }} />
            {err && <p style={{ fontSize: 11, color: 'var(--ws-red)' }}>⚠ {err}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost"   size="sm" onClick={() => setShow(false)}>Cancelar</Btn>
              <Btn variant="primary" size="sm" onClick={create}>Crear</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Policy admin ──────────────────────────────────────────────────────────────
export function AdminEnvPolicy() {
  const [pol,   setPol]   = useState<EnvPolicy>({
    bookingWindowDays: 30, minDurationHours: 0.5, allowPastStart: true,
    businessHoursOnly: false, businessHoursStart: 8, businessHoursEnd: 20,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => { resRepo.getPolicy().then(setPol); }, []);

  const save = async () => {
    await resRepo.savePolicy(pol);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid var(--ws-border)' }}>
      <span style={{ fontSize: 13, color: 'var(--ws-text-3)' }}>{label}</span>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: 520 }}>
      <Row label="Ventana de reserva (días)">
        <input type="number" style={{ ...INPUT, width: 80, textAlign: 'center' }}
          value={pol.bookingWindowDays} onChange={e => setPol(p => ({ ...p, bookingWindowDays: Number(e.target.value) }))} min={1} />
      </Row>
      <Row label="Duración mínima (horas)">
        <input type="number" style={{ ...INPUT, width: 80, textAlign: 'center' }} step={0.5}
          value={pol.minDurationHours} onChange={e => setPol(p => ({ ...p, minDurationHours: Number(e.target.value) }))} min={0} />
      </Row>
      <Row label="Permitir inicio en el pasado">
        <input type="checkbox" checked={pol.allowPastStart}
          onChange={e => setPol(p => ({ ...p, allowPastStart: e.target.checked }))}
          style={{ width: 18, height: 18, cursor: 'pointer' }} />
      </Row>
      <Row label="Solo horario laboral">
        <input type="checkbox" checked={pol.businessHoursOnly}
          onChange={e => setPol(p => ({ ...p, businessHoursOnly: e.target.checked }))}
          style={{ width: 18, height: 18, cursor: 'pointer' }} />
      </Row>
      {pol.businessHoursOnly && <>
        <Row label="Hora inicio">
          <input type="number" style={{ ...INPUT, width: 80, textAlign: 'center' }}
            value={pol.businessHoursStart} onChange={e => setPol(p => ({ ...p, businessHoursStart: Number(e.target.value) }))} min={0} max={23} />
        </Row>
        <Row label="Hora fin">
          <input type="number" style={{ ...INPUT, width: 80, textAlign: 'center' }}
            value={pol.businessHoursEnd} onChange={e => setPol(p => ({ ...p, businessHoursEnd: Number(e.target.value) }))} min={0} max={23} />
        </Row>
      </>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <Btn variant="primary" size="sm" onClick={save}>Guardar política</Btn>
        {saved && <span style={{ fontSize: 12, color: 'var(--ws-green)' }}>✓ Guardado</span>}
      </div>
    </div>
  );
}
