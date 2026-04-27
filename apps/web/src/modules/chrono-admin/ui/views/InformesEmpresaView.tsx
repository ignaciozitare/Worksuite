// @ts-nocheck
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';
import type { IAdminVacacionRepository } from '../../domain/ports/IAdminVacacionRepository';
import type { IJiraResumenRepository } from '../../domain/ports/IJiraResumenRepository';
import type { ResumenMes } from '../../../chrono/domain/entities/Fichaje';

import { CHRONO_ADMIN_COLORS as C } from '../../shared/adminColors';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function fmtH(min: number | null): string { if (min == null) return '—'; const h = Math.floor(min / 60); const m = min % 60; return `${h}h ${String(m).padStart(2,'0')}m`; }
function mesStr(y: number, m: number): string { return `${y}-${String(m + 1).padStart(2, '0')}`; }

type ReportTab = 'monthly' | 'vacaciones' | 'jira' | 'bolsa';

interface Props {
  fichajeRepo: IAdminFichajeRepository;
  vacacionRepo: IAdminVacacionRepository;
  jiraRepo: IJiraResumenRepository;
}

export function InformesEmpresaView({ fichajeRepo, vacacionRepo, jiraRepo }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ReportTab>('monthly');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const mes = mesStr(year, month);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const TABS: { id: ReportTab; label: string; icon: string }[] = [
    { id: 'monthly', label: t('chronoAdmin.informeMensual') || 'Monthly', icon: 'bar_chart' },
    { id: 'vacaciones', label: t('chronoAdmin.informeVacaciones') || 'Time Off', icon: 'beach_access' },
    { id: 'jira', label: t('chronoAdmin.jiraTitle') || 'Jira', icon: 'link' },
    { id: 'bolsa', label: t('chronoAdmin.informeBolsa') || 'Hours Bank', icon: 'account_balance_wallet' },
  ];

  return (
    <div className="fade-in">
      {/* Month selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <button className="ch-btn ch-btn-ghost" onClick={prevMonth} style={{ padding: '6px 12px' }}>‹</button>
        <span className="mono" style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: C.amber, minWidth: 140, textAlign: 'center' }}>
          {MONTHS[month]} {year}
        </span>
        <button className="ch-btn ch-btn-ghost" onClick={nextMonth} style={{ padding: '6px 12px' }}>›</button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 3 }}>
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 'var(--fs-xs)', fontWeight: tab === tb.id ? 600 : 400,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
              background: tab === tb.id ? C.amber : 'transparent',
              color: tab === tb.id ? '#000' : C.txDim,
            }}><span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)', verticalAlign: 'middle' }}>{tb.icon}</span> {tb.label}</button>
          ))}
        </div>
      </div>

      {tab === 'monthly' && <MonthlyReport fichajeRepo={fichajeRepo} mes={mes} />}
      {tab === 'vacaciones' && <VacacionesReport vacacionRepo={vacacionRepo} year={year} />}
      {tab === 'jira' && <JiraReport jiraRepo={jiraRepo} mes={mes} />}
      {tab === 'bolsa' && <BolsaReport fichajeRepo={fichajeRepo} mes={mes} />}
    </div>
  );
}

/* ─── Bar chart component (simple SVG) ──────────────────────────────────── */
function BarChart({ data, labelKey, valueKey, color, maxHeight = 160 }: { data: any[]; labelKey: string; valueKey: string; color: string; maxHeight?: number }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const barW = Math.max(24, Math.min(60, Math.floor(600 / data.length)));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: maxHeight, padding: '0 4px' }}>
      {data.map((d, i) => {
        const pct = (d[valueKey] || 0) / maxVal;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: barW }}>
            <span className="mono" style={{ fontSize: 'var(--fs-2xs)', color: C.txDim }}>{d[valueKey] ? fmtH(d[valueKey]) : '—'}</span>
            <div style={{ width: '80%', height: `${Math.max(2, pct * (maxHeight - 30))}px`, background: color, borderRadius: '3px 3px 0 0', transition: 'height .3s' }} />
            <span className="mono" style={{ fontSize: 'var(--fs-2xs)', color: C.txMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: barW }}>{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Stat card ─────────────────────────────────────────────────────────── */
function Stat({ label, value, color = C.amber, icon = '' }: { label: string; value: string; color?: string; icon?: any }) {
  return (
    <div className="ch-stat" style={{ '--accent': color }}>
      {icon && <div style={{ fontSize: 'var(--fs-body)', marginBottom: 6 }}>{icon}</div>}
      <div className="mono" style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 'var(--fs-2xs)', color: C.txMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
    </div>
  );
}

/* ─── CSV export helper ─────────────────────────────────────────────────── */
function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ═══ Monthly Report ══════════════════════════════════════════════════════ */
function MonthlyReport({ fichajeRepo, mes }: { fichajeRepo: IAdminFichajeRepository; mes: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ userId: string; userName: string; resumen: ResumenMes }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fichajeRepo.getResumenPorEmpleado(mes).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [mes]);

  const totals = useMemo(() => ({
    empleados: data.length,
    horas: data.reduce((s, d) => s + d.resumen.minutosTotales, 0),
    extra: data.reduce((s, d) => s + d.resumen.minutosExtra, 0),
    incompletos: data.reduce((s, d) => s + d.resumen.incompletos, 0),
  }), [data]);

  const exportCSV = () => {
    const rows = [
      ['Empleado', 'Días trabajados', 'Horas totales', 'Horas extra', 'Incompletos'],
      ...data.map(d => [
        `"${d.userName}"`,
        String(d.resumen.diasTrabajados),
        fmtH(d.resumen.minutosTotales),
        fmtH(d.resumen.minutosExtra),
        String(d.resumen.incompletos),
      ]),
    ];
    downloadCSV(rows, `informe_mensual_${mes}.csv`);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.txDim }}>Loading...</div>;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <Stat icon={<span className="material-symbols-outlined">group</span>} label={t('chronoAdmin.totalEmpleados')} value={String(totals.empleados)} />
        <Stat icon={<span className="material-symbols-outlined">schedule</span>} label={t('chronoAdmin.horasTotales')} value={fmtH(totals.horas)} />
        <Stat icon={<span className="material-symbols-outlined">trending_up</span>} label="Extra" value={fmtH(totals.extra)} color={totals.extra >= 0 ? C.green : C.red} />
        <Stat icon={<span className="material-symbols-outlined">warning</span>} label={t('chronoAdmin.incompletos')} value={String(totals.incompletos)} color={totals.incompletos > 0 ? C.red : C.green} />
      </div>

      {/* Chart */}
      <div className="ch-card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 'var(--fs-2xs)', color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
          {t('chronoAdmin.horasTotales')} / {t('chronoAdmin.empleado')}
        </div>
        <BarChart data={data.map(d => ({ label: d.userName.split(' ')[0], value: d.resumen.minutosTotales }))} labelKey="label" valueKey="value" color={C.amber} />
      </div>

      {/* Table */}
      <div className="ch-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 420px)', marginBottom: 16 }}>
        <table>
          <thead><tr>
            <th>{t('chronoAdmin.empleado')}</th>
            <th style={{ textAlign: 'right' }}>{t('chronoAdmin.dias')}</th>
            <th style={{ textAlign: 'right' }}>{t('chronoAdmin.horasTotales')}</th>
            <th style={{ textAlign: 'right' }}>Extra</th>
            <th style={{ textAlign: 'right' }}>{t('chronoAdmin.incompletos')}</th>
          </tr></thead>
          <tbody>
            {data.map(d => (
              <tr key={d.userId}>
                <td style={{ fontWeight: 600 }}>{d.userName}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{d.resumen.diasTrabajados}</td>
                <td className="mono" style={{ textAlign: 'right', color: C.amber }}>{fmtH(d.resumen.minutosTotales)}</td>
                <td className="mono" style={{ textAlign: 'right', color: d.resumen.minutosExtra >= 0 ? C.green : C.red }}>{fmtH(d.resumen.minutosExtra)}</td>
                <td className="mono" style={{ textAlign: 'right', color: d.resumen.incompletos > 0 ? C.red : C.txDim }}>{d.resumen.incompletos}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: C.txMuted, padding: 30 }}>{t('chronoAdmin.sinDatos')}</td></tr>}
          </tbody>
        </table>
      </div>

      <button className="ch-btn ch-btn-amber" onClick={exportCSV}>⬇ Export CSV</button>
    </div>
  );
}

/* ═══ Vacaciones Report ═══════════════════════════════════════════════════ */
function VacacionesReport({ vacacionRepo, year }: { vacacionRepo: IAdminVacacionRepository; year: number }) {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    vacacionRepo.getTodas({ anyo: year }).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [year]);

  const statusColor = { pendiente: C.amber, aprobado: C.green, rechazado: C.red, cancelado: C.txDim };

  const exportCSV = () => {
    const rows = [
      ['Empleado', 'Tipo', 'Desde', 'Hasta', 'Días', 'Estado'],
      ...data.map(d => [
        `"${d.userName}"`, d.tipo, d.fechaInicio, d.fechaFin, String(d.diasHabiles), d.estado,
      ]),
    ];
    downloadCSV(rows, `vacaciones_${year}.csv`);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.txDim }}>Loading...</div>;

  // Group by status for chart
  const byStatus = {};
  data.forEach(d => { byStatus[d.estado] = (byStatus[d.estado] || 0) + d.diasHabiles; });

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <Stat icon={<span className="material-symbols-outlined">description</span>} label="Total solicitudes" value={String(data.length)} />
        <Stat icon={<span className="material-symbols-outlined">check_circle</span>} label="Aprobadas" value={String(data.filter(d => d.estado === 'aprobado').length)} color={C.green} />
        <Stat icon={<span className="material-symbols-outlined">pending</span>} label="Pendientes" value={String(data.filter(d => d.estado === 'pendiente').length)} color={C.amber} />
        <Stat icon={<span className="material-symbols-outlined">event_available</span>} label="Días aprobados" value={String(data.filter(d => d.estado === 'aprobado').reduce((s, d) => s + d.diasHabiles, 0))} color={C.blue} />
      </div>

      {/* Chart */}
      <div className="ch-card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 'var(--fs-2xs)', color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
          Días por estado
        </div>
        <BarChart
          data={Object.entries(byStatus).map(([status, dias]) => ({ label: status, value: dias }))}
          labelKey="label" valueKey="value" color={C.blue}
        />
      </div>

      {/* Table */}
      <div className="ch-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 420px)', marginBottom: 16 }}>
        <table>
          <thead><tr>
            <th>{t('chronoAdmin.empleado')}</th>
            <th>{t('chronoAdmin.tipo')}</th>
            <th>{t('chronoAdmin.desde')}</th>
            <th>{t('chronoAdmin.hasta')}</th>
            <th style={{ textAlign: 'right' }}>{t('chronoAdmin.dias')}</th>
            <th>{t('chronoAdmin.estado')}</th>
          </tr></thead>
          <tbody>
            {data.map(d => (
              <tr key={d.id}>
                <td style={{ fontWeight: 600 }}>{d.userName}</td>
                <td>{d.tipo}</td>
                <td className="mono">{d.fechaInicio}</td>
                <td className="mono">{d.fechaFin}</td>
                <td className="mono" style={{ textAlign: 'right', color: C.amber }}>{d.diasHabiles}</td>
                <td><span className="ch-badge" style={{ background: `${statusColor[d.estado]}20`, color: statusColor[d.estado] }}>{d.estado}</span></td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: C.txMuted, padding: 30 }}>{t('chronoAdmin.sinDatos')}</td></tr>}
          </tbody>
        </table>
      </div>

      <button className="ch-btn ch-btn-amber" onClick={exportCSV}>⬇ Export CSV</button>
    </div>
  );
}

/* ═══ Jira Report ════════════════════════════════════════════════════════= */
function JiraReport({ jiraRepo, mes }: { jiraRepo: IJiraResumenRepository; mes: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    jiraRepo.getResumenMes(mes).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [mes]);

  const totals = useMemo(() => ({
    jira: data.reduce((s, d) => s + d.minutosJira, 0),
    fichaje: data.reduce((s, d) => s + d.minutosFichaje, 0),
    deficit: data.filter(d => d.diferencia < 0).length,
  }), [data]);

  const exportCSV = () => {
    const rows = [
      ['Empleado', 'Email', 'Horas Jira', 'Horas Fichaje', 'Diferencia', 'Proyectos'],
      ...data.map(d => [
        `"${d.nombre}"`, d.email, fmtH(d.minutosJira), fmtH(d.minutosFichaje), fmtH(d.diferencia),
        `"${d.proyectos.map(p => `${p.key}:${fmtH(p.minutos)}`).join(', ')}"`,
      ]),
    ];
    downloadCSV(rows, `jira_vs_fichaje_${mes}.csv`);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.txDim }}>Loading...</div>;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        <Stat icon={<span className="material-symbols-outlined">link</span>} label={t('chronoAdmin.totalHorasJira')} value={fmtH(totals.jira)} color={C.blue} />
        <Stat icon={<span className="material-symbols-outlined">schedule</span>} label={t('chronoAdmin.totalHorasFichaje')} value={fmtH(totals.fichaje)} color={C.amber} />
        <Stat icon={<span className="material-symbols-outlined">warning</span>} label={t('chronoAdmin.empleadosConDeficit')} value={String(totals.deficit)} color={totals.deficit > 0 ? C.red : C.green} />
      </div>

      {/* Chart — comparison bars */}
      <div className="ch-card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 'var(--fs-2xs)', color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
          Jira vs Fichaje / {t('chronoAdmin.empleado')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map(d => {
            const maxMin = Math.max(d.minutosJira, d.minutosFichaje, 1);
            return (
              <div key={d.userId}>
                <div style={{ fontSize: 'var(--fs-2xs)', color: C.txDim, marginBottom: 4 }}>{d.nombre}</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 8, borderRadius: 4, background: C.bd, overflow: 'hidden', marginBottom: 2 }}>
                      <div style={{ height: '100%', width: `${(d.minutosJira / maxMin) * 100}%`, background: C.blue, borderRadius: 4 }} />
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: C.bd, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(d.minutosFichaje / maxMin) * 100}%`, background: C.amber, borderRadius: 4 }} />
                    </div>
                  </div>
                  <div className="mono" style={{ width: 80, textAlign: 'right', fontSize: 'var(--fs-2xs)', color: d.diferencia >= 0 ? C.green : C.red }}>
                    {d.diferencia >= 0 ? '+' : ''}{fmtH(d.diferencia)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 'var(--fs-2xs)', color: C.txDim }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 4, borderRadius: 2, background: C.blue }} />Jira</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 4, borderRadius: 2, background: C.amber }} />Fichaje</span>
        </div>
      </div>

      {/* Table */}
      <div className="ch-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 420px)', marginBottom: 16 }}>
        <table>
          <thead><tr>
            <th>{t('chronoAdmin.empleado')}</th>
            <th style={{ textAlign: 'right' }}>{t('chronoAdmin.horasJira')}</th>
            <th style={{ textAlign: 'right' }}>{t('chronoAdmin.horasFichaje')}</th>
            <th style={{ textAlign: 'right' }}>{t('chronoAdmin.diferencia')}</th>
            <th>{t('chronoAdmin.proyectos')}</th>
          </tr></thead>
          <tbody>
            {data.map(d => (
              <>
                <tr key={d.userId} onClick={() => setExpanded(expanded === d.userId ? null : d.userId)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{d.nombre}</td>
                  <td className="mono" style={{ textAlign: 'right', color: C.blue }}>{fmtH(d.minutosJira)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: C.amber }}>{fmtH(d.minutosFichaje)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: d.diferencia >= 0 ? C.green : C.red }}>
                    {d.diferencia >= 0 ? '+' : ''}{fmtH(d.diferencia)}
                  </td>
                  <td style={{ fontSize: 'var(--fs-2xs)', color: C.txDim }}>{d.proyectos.map(p => p.key).join(', ') || '—'}</td>
                </tr>
                {expanded === d.userId && d.proyectos.length > 0 && (
                  <tr key={`${d.userId}-detail`}>
                    <td colSpan={5} style={{ background: C.sfHover, padding: '10px 24px' }}>
                      <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                        {d.proyectos.map(p => (
                          <div key={p.key} style={{ padding: '8px 12px', background: C.bg, borderRadius: 6, border: `1px solid ${C.bd}` }}>
                            <div className="mono" style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: C.blue }}>{p.key}</div>
                            <div className="mono" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: C.amber, marginTop: 2 }}>{fmtH(p.minutos)}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {data.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: C.txMuted, padding: 30 }}>{t('chronoAdmin.sinDatos')}</td></tr>}
          </tbody>
        </table>
      </div>

      <button className="ch-btn ch-btn-amber" onClick={exportCSV}>⬇ Export CSV</button>
    </div>
  );
}

/* ═══ Bolsa de Horas Report ══════════════════════════════════════════════ */
function BolsaReport({ fichajeRepo, mes }: { fichajeRepo: IAdminFichajeRepository; mes: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ userId: string; userName: string; resumen: ResumenMes }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fichajeRepo.getResumenPorEmpleado(mes).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [mes]);

  const exportCSV = () => {
    const rows = [
      ['Empleado', 'Horas Extra', 'Días trabajados'],
      ...data.map(d => [`"${d.userName}"`, fmtH(d.resumen.minutosExtra), String(d.resumen.diasTrabajados)]),
    ];
    downloadCSV(rows, `bolsa_horas_${mes}.csv`);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.txDim }}>Loading...</div>;

  return (
    <div>
      {/* Chart */}
      <div className="ch-card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 'var(--fs-2xs)', color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
          Saldo horas extra / {t('chronoAdmin.empleado')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map(d => {
            const max = Math.max(...data.map(x => Math.abs(x.resumen.minutosExtra)), 1);
            const pct = Math.abs(d.resumen.minutosExtra) / max * 100;
            const isPos = d.resumen.minutosExtra >= 0;
            return (
              <div key={d.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 100, fontSize: 'var(--fs-2xs)', color: C.txDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.userName}</span>
                <div style={{ flex: 1, height: 12, background: C.bd, borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: isPos ? C.green : C.red, borderRadius: 6, transition: 'width .3s' }} />
                </div>
                <span className="mono" style={{ width: 70, textAlign: 'right', fontSize: 'var(--fs-2xs)', color: isPos ? C.green : C.red }}>
                  {isPos ? '+' : ''}{fmtH(d.resumen.minutosExtra)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="ch-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 420px)', marginBottom: 16 }}>
        <table>
          <thead><tr>
            <th>{t('chronoAdmin.empleado')}</th>
            <th style={{ textAlign: 'right' }}>{t('chronoAdmin.dias')}</th>
            <th style={{ textAlign: 'right' }}>{t('chronoAdmin.horasTotales')}</th>
            <th style={{ textAlign: 'right' }}>Extra/Déficit</th>
          </tr></thead>
          <tbody>
            {data.map(d => (
              <tr key={d.userId}>
                <td style={{ fontWeight: 600 }}>{d.userName}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{d.resumen.diasTrabajados}</td>
                <td className="mono" style={{ textAlign: 'right', color: C.amber }}>{fmtH(d.resumen.minutosTotales)}</td>
                <td className="mono" style={{ textAlign: 'right', color: d.resumen.minutosExtra >= 0 ? C.green : C.red }}>
                  {d.resumen.minutosExtra >= 0 ? '+' : ''}{fmtH(d.resumen.minutosExtra)}
                </td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: C.txMuted, padding: 30 }}>{t('chronoAdmin.sinDatos')}</td></tr>}
          </tbody>
        </table>
      </div>

      <button className="ch-btn ch-btn-amber" onClick={exportCSV}>⬇ Export CSV</button>
    </div>
  );
}
