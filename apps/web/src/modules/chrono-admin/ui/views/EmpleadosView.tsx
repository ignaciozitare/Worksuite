// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';
import type { IEmpleadoConfigRepository } from '../../domain/ports/IEmpleadoConfigRepository';
import type { IFichaEmpleadoRepository } from '../../domain/ports/IFichaEmpleadoRepository';
import type { EmpleadoResumen, EstadoPresencia } from '../../domain/entities/EmpleadoResumen';
import type { EmpleadoConfig } from '../../domain/entities/EmpleadoConfig';
import type { IEquipoRepository } from '../../domain/ports/IEquipoRepository';
import type { Equipo } from '../../domain/entities/Equipo';
import { FichaEmpleadoDrawer } from './FichaEmpleadoDrawer';
import { CHRONO_THEME as T } from '../../../chrono/shared/theme';

import { CHRONO_ADMIN_COLORS as C } from '../../shared/adminColors';

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
  equipoRepo: IEquipoRepository;
  fichaEmpleadoRepo: IFichaEmpleadoRepository;
  users: any[];
}

export function EmpleadosView({ fichajeRepo, empleadoConfigRepo, equipoRepo, fichaEmpleadoRepo, users }: Props) {
  const { t } = useTranslation();
  const [equipo, setEquipo] = useState<EmpleadoResumen[]>([]);
  const [configs, setConfigs] = useState<EmpleadoConfig[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [resumenMes, setResumenMes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [filterEquipo, setFilterEquipo] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ horasJornadaMinutos: number | null; diasVacaciones: number | null; jornadaDias: string[] }>({ horasJornadaMinutos: null, diasVacaciones: null, jornadaDias: [] });
  const [saving, setSaving] = useState(false);
  const [fichaUserId, setFichaUserId] = useState<string | null>(null);

  const mesActual = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [equipoData, configData, resumenData, equiposData] = await Promise.all([
        fichajeRepo.getEquipoHoy(),
        empleadoConfigRepo.getAll(),
        fichajeRepo.getResumenPorEmpleado(mesActual),
        equipoRepo.getAll(),
      ]);
      setEquipo(equipoData);
      setConfigs(configData);
      setEquipos(equiposData);
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
  // Helper: get team name for a user
  const getUserTeam = useCallback((userId: string): string => {
    const team = equipos.find(eq => eq.miembros.some(m => m.userId === userId));
    return team?.nombre ?? '';
  }, [equipos]);

  // Helper: get user role
  const getUserRole = useCallback((userId: string): string => {
    const u = users.find(u => u.id === userId);
    return u?.role ?? 'user';
  }, [users]);

  const filtered = useMemo(() => {
    let list = equipo;
    if (filter === 'complete') list = list.filter(e => e.fichajesIncompletos === 0 && e.estadoHoy !== 'sin_fichar');
    else if (filter === 'incomplete') list = list.filter(e => e.fichajesIncompletos > 0);
    else if (filter === 'vacation') list = list.filter(e => e.estadoHoy === 'vacaciones');
    if (filterEquipo) list = list.filter(e => getUserTeam(e.userId) === filterEquipo);
    if (filterRole) list = list.filter(e => getUserRole(e.userId) === filterRole);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.nombre.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
    }
    return list;
  }, [equipo, filter, filterEquipo, filterRole, search, getUserTeam, getUserRole]);

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
        <select value={filterEquipo} onChange={e => setFilterEquipo(e.target.value)}
          style={{
            background: T.color.surfaceLow, border: `1px solid ${T.color.surfaceHigh}`,
            borderRadius: T.radius.md, padding: '7px 12px',
            color: T.color.text, fontSize: 12, fontFamily: T.font.body,
          }}>
          <option value="">{t('chronoAdmin.equipos')}: {t('chronoAdmin.todos')}</option>
          {equipos.map(eq => <option key={eq.id} value={eq.nombre}>{eq.nombre}</option>)}
        </select>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          style={{
            background: T.color.surfaceLow, border: `1px solid ${T.color.surfaceHigh}`,
            borderRadius: T.radius.md, padding: '7px 12px',
            color: T.color.text, fontSize: 12, fontFamily: T.font.body,
          }}>
          <option value="">Rol: {t('chronoAdmin.todos')}</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
        <div style={{ flex: 1 }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('chronoAdmin.buscarEmpleado')}
          style={{
            background: T.color.surfaceLow, border: `1px solid ${T.color.surfaceHigh}`,
            borderRadius: T.radius.md, padding: '8px 12px',
            color: T.color.text, fontSize: 13, width: 240, outline: 'none',
            fontFamily: T.font.body,
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
        <div className="ch-card" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
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
                <th style={{ padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.equipos')}
                </th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.estado')}
                </th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.jornada')}
                </th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.fichaTitle')}
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
                      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, fontSize: 11, color: C.txDim }}>
                        {getUserTeam(emp.userId) || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'center' }}>
                        <span className="ch-badge" style={{ background: badge.bg, color: badge.color, fontSize: 10, padding: '3px 8px' }}>
                          {t(STATUS_I18N[emp.estadoHoy] ?? 'chronoAdmin.sinFicharLabel')}
                        </span>
                      </td>
                      <td className="mono" style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'center', fontSize: 11, color: C.txDim }}>
                        {cfg ? `${(cfg.horasJornadaMinutos ?? 480) / 60}h · ${(cfg.jornadaDias ?? []).join('')}` : t('chronoAdmin.sinConfigurar')}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'center' }}>
                        <button
                          className="ch-btn ch-btn-ghost"
                          onClick={e => { e.stopPropagation(); setFichaUserId(emp.userId); }}
                          style={{ fontSize: 11, padding: '4px 10px' }}
                        >
                          {t('chronoAdmin.fichaVerFicha')}
                        </button>
                      </td>
                    </tr>

                    {/* ── Inline config editor ─── */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{ padding: '16px 24px', borderBottom: `1px solid ${C.bd}`, background: C.sfHover }}>
                          <div className="fade-in" style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                            {/* Horas jornada */}
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 10, color: C.txMuted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                {t('chronoAdmin.horasJornada')} ({t('chronoAdmin.enMinutos')})
                              </label>
                              <input
                                type="number"
                                value={editDraft.horasJornadaMinutos ?? ''}
                                onChange={e => setEditDraft(prev => ({ ...prev, horasJornadaMinutos: e.target.value ? Number(e.target.value) : null }))}
                                style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '8px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none', fontFamily: "'IBM Plex Mono',monospace" }}
                              />
                            </div>

                            {/* Dias vacaciones */}
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 10, color: C.txMuted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                {t('chronoAdmin.diasVacaciones')}
                              </label>
                              <input
                                type="number"
                                value={editDraft.diasVacaciones ?? ''}
                                onChange={e => setEditDraft(prev => ({ ...prev, diasVacaciones: e.target.value ? Number(e.target.value) : null }))}
                                style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '8px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none', fontFamily: "'IBM Plex Mono',monospace" }}
                              />
                            </div>

                            {/* Jornada dias */}
                            <div>
                              <label style={{ fontSize: 10, color: C.txMuted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                {t('chronoAdmin.jornadaDias')}
                              </label>
                              <div style={{ display: 'flex', gap: 3 }}>
                                {DIAS_SEMANA.map(dia => (
                                  <button key={dia} onClick={() => toggleDia(dia)} style={{
                                    width: 32, height: 34, borderRadius: 6, fontSize: 11, fontWeight: 600,
                                    border: editDraft.jornadaDias.includes(dia) ? `1px solid ${C.amber}` : `1px solid ${C.bd}`,
                                    background: editDraft.jornadaDias.includes(dia) ? C.amberGlow : C.sf,
                                    color: editDraft.jornadaDias.includes(dia) ? C.amber : C.txMuted,
                                    cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                                  }}>{dia}</button>
                                ))}
                              </div>
                            </div>

                            {/* Save */}
                            <button className="ch-btn ch-btn-amber" onClick={() => handleSave(emp.userId)} disabled={saving}
                              style={{ height: 34, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {saving ? '...' : t('chronoAdmin.guardar')}
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

      {fichaUserId && (() => {
        const emp = equipo.find(e => e.userId === fichaUserId);
        return emp ? (
          <FichaEmpleadoDrawer
            userId={emp.userId}
            userName={emp.nombre}
            userEmail={emp.email}
            fichaRepo={fichaEmpleadoRepo}
            onClose={() => setFichaUserId(null)}
          />
        ) : null;
      })()}
    </div>
  );
}
