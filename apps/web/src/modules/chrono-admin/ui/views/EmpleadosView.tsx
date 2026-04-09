// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';
import type { IEmpleadoConfigRepository } from '../../domain/ports/IEmpleadoConfigRepository';
import type { EmpleadoResumen, EstadoPresencia } from '../../domain/entities/EmpleadoResumen';
import type { EmpleadoConfig } from '../../domain/entities/EmpleadoConfig';

const C = { amber:'#f59e0b', amberDim:'#92400e', amberGlow:'rgba(245,158,11,0.12)', tx:'#e8e8e8', txDim:'#888', txMuted:'#555', green:'#10b981', greenDim:'rgba(16,185,129,0.15)', red:'#ef4444', redDim:'rgba(239,68,68,0.15)', blue:'#3b82f6', blueDim:'rgba(59,130,246,0.15)', orange:'#f97316', purple:'#a855f7', sf:'#161616', sfHover:'#1e1e1e', bd:'#2a2a2a', bg:'#0d0d0d' };

type FilterKey = 'all' | 'complete' | 'incomplete' | 'vacation';

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const STATUS_BADGE: Record<EstadoPresencia, { bg: string; color: string }> = {
  oficina:     { bg: C.greenDim, color: C.green },
  teletrabajo: { bg: C.blueDim, color: C.blue },
  vacaciones:  { bg: 'rgba(168,85,247,0.15)', color: C.purple },
  medico:      { bg: 'rgba(249,115,22,0.15)', color: C.orange },
  ausente:     { bg: C.redDim, color: C.red },
  sin_fichar:  { bg: '#1e1e1e', color: C.txMuted },
};

const STATUS_I18N: Record<EstadoPresencia, string> = {
  oficina: 'chronoAdmin.oficina', teletrabajo: 'chronoAdmin.teletrabajoLabel',
  vacaciones: 'chronoAdmin.vacacionesLabel', medico: 'chronoAdmin.medicoLabel',
  ausente: 'chronoAdmin.ausente', sin_fichar: 'chronoAdmin.sinFicharLabel',
};

function fmtHours(min: number | null): string {
  if (min == null) return '0h 00m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

interface Props {
  fichajeRepo: IAdminFichajeRepository;
  empleadoConfigRepo: IEmpleadoConfigRepository;
  users: any[];
}

export function EmpleadosView({ fichajeRepo, empleadoConfigRepo, users }: Props) {
  const { t } = useTranslation();
  const [equipo, setEquipo] = useState<EmpleadoResumen[]>([]);
  const [configs, setConfigs] = useState<EmpleadoConfig[]>([]);
  const [resumenMes, setResumenMes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ horasJornadaMinutos: number | null; diasVacaciones: number | null; jornadaDias: string[] }>({ horasJornadaMinutos: null, diasVacaciones: null, jornadaDias: [] });
  const [saving, setSaving] = useState(false);

  const mesActual = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [equipoData, configData, resumenData] = await Promise.all([
        fichajeRepo.getEquipoHoy(),
        empleadoConfigRepo.getAll(),
        fichajeRepo.getResumenPorEmpleado(mesActual),
      ]);
      setEquipo(equipoData);
      setConfigs(configData);
      const map: Record<string, number> = {};
      resumenData.forEach(r => { map[r.userId] = r.resumen.minutosTotales; });
      setResumenMes(map);
    } catch (err) {
      console.error('Error loading empleados:', err);
    } finally {
      setLoading(false);
    }
  }, [fichajeRepo, empleadoConfigRepo, mesActual]);

  useEffect(() => { load(); }, [load]);

  /* ── Filter + search ─── */
  const filtered = useMemo(() => {
    let list = equipo;
    if (filter === 'complete') list = list.filter(e => e.fichajesIncompletos === 0 && e.estadoHoy !== 'sin_fichar');
    else if (filter === 'incomplete') list = list.filter(e => e.fichajesIncompletos > 0);
    else if (filter === 'vacation') list = list.filter(e => e.estadoHoy === 'vacaciones');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.nombre.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
    }
    return list;
  }, [equipo, filter, search]);

  const filterButtons: { key: FilterKey; label: string }[] = [
    { key: 'all', label: t('chronoAdmin.filtroTodos') },
    { key: 'complete', label: t('chronoAdmin.filtroCompleto') },
    { key: 'incomplete', label: t('chronoAdmin.filtroIncompleto') },
    { key: 'vacation', label: t('chronoAdmin.filtroVacaciones') },
  ];

  /* ── Expand / edit ─── */
  function handleExpand(userId: string) {
    if (expandedId === userId) { setExpandedId(null); return; }
    setExpandedId(userId);
    const cfg = configs.find(c => c.userId === userId);
    setEditDraft({
      horasJornadaMinutos: cfg?.horasJornadaMinutos ?? 480,
      diasVacaciones: cfg?.diasVacaciones ?? 22,
      jornadaDias: cfg?.jornadaDias ?? ['L', 'M', 'X', 'J', 'V'],
    });
  }

  async function handleSave(userId: string) {
    setSaving(true);
    try {
      await empleadoConfigRepo.upsert(userId, editDraft);
      setExpandedId(null);
      await load();
    } catch (err) {
      console.error('Error saving config:', err);
    } finally {
      setSaving(false);
    }
  }

  function toggleDia(dia: string) {
    setEditDraft(prev => ({
      ...prev,
      jornadaDias: prev.jornadaDias.includes(dia) ? prev.jornadaDias.filter(d => d !== dia) : [...prev.jornadaDias, dia],
    }));
  }

  return (
    <div className="fade-in">
      {/* ── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('chronoAdmin.empleadosTitle')}</div>
          <div style={{ fontSize: 12, color: C.txDim, marginTop: 2 }}>{t('chronoAdmin.empleadosSubtitle')}</div>
        </div>
        <button className="ch-btn ch-btn-ghost" onClick={load}>
          ↻ {t('chronoAdmin.recargar')}
        </button>
      </div>

      {/* ── Filter bar ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {filterButtons.map(fb => (
          <button
            key={fb.key}
            className={filter === fb.key ? 'ch-btn ch-btn-amber' : 'ch-btn ch-btn-ghost'}
            onClick={() => setFilter(fb.key)}
            style={{ fontSize: 12 }}
          >
            {fb.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('chronoAdmin.buscarEmpleado')}
          style={{
            background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 12px',
            color: C.tx, fontSize: 13, width: 220, outline: 'none',
          }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.txDim, fontSize: 13 }}>
          {t('chronoAdmin.cargando')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="ch-card" style={{ textAlign: 'center', padding: '40px 0', color: C.txDim }}>
          {t('chronoAdmin.sinDatos')}
        </div>
      ) : (
        <div className="ch-card" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.empleado')}
                </th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.email')}
                </th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.horasHoy')}
                </th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.horasMes')}
                </th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.estado')}
                </th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.jornada')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => {
                const badge = STATUS_BADGE[emp.estadoHoy] ?? STATUS_BADGE.sin_fichar;
                const cfg = configs.find(c => c.userId === emp.userId);
                const isExpanded = expandedId === emp.userId;
                return (
                  <Fragment key={emp.userId}>
                    <tr
                      onClick={() => handleExpand(emp.userId)}
                      style={{ cursor: 'pointer', transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.sfHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: `linear-gradient(135deg,${C.amberDim},#78350f)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, color: C.amber, fontFamily: "'IBM Plex Mono',monospace", fontSize: 13,
                          }}>
                            {emp.nombre.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{emp.nombre}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, fontSize: 12, color: C.txDim }}>{emp.email}</td>
                      <td className="mono" style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'right', fontSize: 14, fontWeight: 600, color: C.amber }}>{fmtHours(emp.minutosHoy)}</td>
                      <td className="mono" style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'right', fontSize: 14, fontWeight: 600, color: C.tx }}>{fmtHours(resumenMes[emp.userId] ?? null)}</td>
                      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'center' }}>
                        <span className="ch-badge" style={{ background: badge.bg, color: badge.color, fontSize: 10, padding: '3px 8px' }}>
                          {t(STATUS_I18N[emp.estadoHoy] ?? 'chronoAdmin.sinFicharLabel')}
                        </span>
                      </td>
                      <td className="mono" style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'center', fontSize: 11, color: C.txDim }}>
                        {cfg ? `${(cfg.horasJornadaMinutos ?? 480) / 60}h · ${(cfg.jornadaDias ?? []).join('')}` : t('chronoAdmin.sinConfigurar')}
                      </td>
                    </tr>

                    {/* ── Inline config editor ─── */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ padding: '16px 24px', borderBottom: `1px solid ${C.bd}`, background: C.sfHover }}>
                          <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 16, alignItems: 'end' }}>
                            {/* Horas jornada */}
                            <div>
                              <label style={{ fontSize: 11, color: C.txMuted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                {t('chronoAdmin.horasJornada')}
                              </label>
                              <input
                                type="number"
                                value={editDraft.horasJornadaMinutos ?? ''}
                                onChange={e => setEditDraft(prev => ({ ...prev, horasJornadaMinutos: e.target.value ? Number(e.target.value) : null }))}
                                style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none', fontFamily: "'IBM Plex Mono',monospace" }}
                              />
                              <div style={{ fontSize: 10, color: C.txMuted, marginTop: 2 }}>{t('chronoAdmin.enMinutos')}</div>
                            </div>

                            {/* Dias vacaciones */}
                            <div>
                              <label style={{ fontSize: 11, color: C.txMuted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                {t('chronoAdmin.diasVacaciones')}
                              </label>
                              <input
                                type="number"
                                value={editDraft.diasVacaciones ?? ''}
                                onChange={e => setEditDraft(prev => ({ ...prev, diasVacaciones: e.target.value ? Number(e.target.value) : null }))}
                                style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none', fontFamily: "'IBM Plex Mono',monospace" }}
                              />
                            </div>

                            {/* Jornada dias */}
                            <div>
                              <label style={{ fontSize: 11, color: C.txMuted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                {t('chronoAdmin.jornadaDias')}
                              </label>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {DIAS_SEMANA.map(dia => (
                                  <button
                                    key={dia}
                                    onClick={() => toggleDia(dia)}
                                    style={{
                                      width: 30, height: 30, borderRadius: 6, fontSize: 11, fontWeight: 600,
                                      border: editDraft.jornadaDias.includes(dia) ? `1px solid ${C.amber}` : `1px solid ${C.bd}`,
                                      background: editDraft.jornadaDias.includes(dia) ? C.amberGlow : C.sf,
                                      color: editDraft.jornadaDias.includes(dia) ? C.amber : C.txMuted,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {dia}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Save */}
                            <button
                              className="ch-btn ch-btn-amber"
                              onClick={() => handleSave(emp.userId)}
                              disabled={saving}
                              style={{ height: 36, fontSize: 12 }}
                            >
                              {saving ? t('chronoAdmin.guardando') : t('chronoAdmin.guardar')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
