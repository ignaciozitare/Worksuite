// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IJiraResumenRepository } from '../../domain/ports/IJiraResumenRepository';
import type { INotificacionRepository } from '../../domain/ports/INotificacionRepository';
import type { EmpleadoJiraResumen } from '../../domain/entities/JiraResumen';

const C = { amber:'#f59e0b', amberDim:'#92400e', amberGlow:'rgba(245,158,11,0.12)', tx:'#e8e8e8', txDim:'#888', txMuted:'#555', green:'#10b981', greenDim:'rgba(16,185,129,0.15)', red:'#ef4444', redDim:'rgba(239,68,68,0.15)', blue:'#3b82f6', blueDim:'rgba(59,130,246,0.15)', orange:'#f97316', purple:'#a855f7', sf:'#161616', sfHover:'#1e1e1e', bd:'#2a2a2a', bg:'#0d0d0d' };

function fmtHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function getMesLabel(mes: string): string {
  const [y, m] = mes.split('-');
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

function shiftMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Props {
  jiraRepo: IJiraResumenRepository;
  notifRepo: INotificacionRepository;
}

export function JiraView({ jiraRepo, notifRepo }: Props) {
  const { t } = useTranslation();

  const mesInicial = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const [mes, setMes] = useState(mesInicial);
  const [data, setData] = useState<EmpleadoJiraResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jiraRepo.getResumenMes(mes);
      setData(res);
    } catch (err) {
      console.error('Error loading Jira resumen:', err);
    } finally {
      setLoading(false);
    }
  }, [jiraRepo, mes]);

  useEffect(() => { load(); }, [load]);

  /* ── Summary stats ─── */
  const totalJira = data.reduce((s, e) => s + e.minutosJira, 0);
  const totalFichaje = data.reduce((s, e) => s + e.minutosFichaje, 0);
  const empleadosConDeficit = data.filter(e => e.diferencia < 0).length;

  const summaryStats = [
    { label: t('chronoAdmin.totalHorasJira'), value: fmtHours(totalJira), accent: C.blue },
    { label: t('chronoAdmin.totalHorasFichaje'), value: fmtHours(totalFichaje), accent: C.amber },
    { label: t('chronoAdmin.empleadosConDeficit'), value: empleadosConDeficit, accent: C.red },
  ];

  /* ── Send reminder ─── */
  async function handleSendReminder(emp: EmpleadoJiraResumen) {
    setSendingId(emp.userId);
    try {
      await notifRepo.enviar(emp.userId, {
        tipo: 'warning',
        titulo: t('chronoAdmin.reminderTitle'),
        mensaje: t('chronoAdmin.reminderMessage', { nombre: emp.nombre, horas: fmtHours(Math.abs(emp.diferencia)) }),
      });
    } catch (err) {
      console.error('Error sending reminder:', err);
    } finally {
      setSendingId(null);
    }
  }

  async function handleSendAll() {
    const deficits = data.filter(e => e.diferencia < 0);
    if (deficits.length === 0) return;
    setSendingAll(true);
    try {
      await notifRepo.enviarMasivo(
        deficits.map(e => e.userId),
        {
          tipo: 'warning',
          titulo: t('chronoAdmin.reminderTitle'),
          mensaje: t('chronoAdmin.reminderBulkMessage'),
        },
      );
    } catch (err) {
      console.error('Error sending bulk reminders:', err);
    } finally {
      setSendingAll(false);
    }
  }

  return (
    <div className="fade-in">
      {/* ── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('chronoAdmin.jiraTitle')}</div>
          <div style={{ fontSize: 12, color: C.txDim, marginTop: 2 }}>{t('chronoAdmin.jiraSubtitle')}</div>
        </div>
        <button className="ch-btn ch-btn-ghost" onClick={load}>
          ↻ {t('chronoAdmin.recargar')}
        </button>
      </div>

      {/* ── Month selector ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="ch-btn ch-btn-ghost" onClick={() => setMes(shiftMes(mes, -1))} style={{ fontSize: 14, padding: '6px 12px' }}>
          ◀
        </button>
        <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: C.amber, textTransform: 'capitalize', minWidth: 160, textAlign: 'center' }}>
          {getMesLabel(mes)}
        </div>
        <button className="ch-btn ch-btn-ghost" onClick={() => setMes(shiftMes(mes, 1))} style={{ fontSize: 14, padding: '6px 12px' }}>
          ▶
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="ch-btn ch-btn-amber"
          onClick={handleSendAll}
          disabled={sendingAll || empleadosConDeficit === 0}
          style={{ fontSize: 12 }}
        >
          {sendingAll ? t('chronoAdmin.enviando') : t('chronoAdmin.enviarTodosRecordatorios')}
        </button>
      </div>

      {/* ── Summary stats ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
        {summaryStats.map(s => (
          <div key={s.label} className="ch-card" style={{ padding: '16px 18px' }}>
            <div className="mono" style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.1em', textTransform: 'uppercase' }}>
              {s.label}
            </div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: s.accent, marginTop: 4 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.txDim, fontSize: 13 }}>
          {t('chronoAdmin.cargando')}
        </div>
      ) : data.length === 0 ? (
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
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.horasJira')}
                </th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.horasFichaje')}
                </th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.diferencia')}
                </th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.proyectos')}
                </th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.bd}` }}>
                  {t('chronoAdmin.acciones')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map(emp => {
                const isExpanded = expandedId === emp.userId;
                const diffColor = emp.diferencia >= 0 ? C.amber : C.red;
                const diffBg = emp.diferencia >= 0 ? C.amberGlow : C.redDim;
                return (
                  <Fragment key={emp.userId}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : emp.userId)}
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
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{emp.nombre}</div>
                            <div style={{ fontSize: 11, color: C.txDim }}>{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="mono" style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'right', fontSize: 14, fontWeight: 600, color: C.blue }}>
                        {fmtHours(emp.minutosJira)}
                      </td>
                      <td className="mono" style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'right', fontSize: 14, fontWeight: 600, color: C.amber }}>
                        {fmtHours(emp.minutosFichaje)}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'right' }}>
                        <span className="ch-badge mono" style={{ background: diffBg, color: diffColor, fontSize: 12, padding: '3px 10px', fontWeight: 600 }}>
                          {emp.diferencia >= 0 ? '+' : ''}{fmtHours(emp.diferencia)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, fontSize: 12, color: C.txDim }}>
                        {emp.proyectos.map(p => p.key).join(', ') || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: `1px solid ${C.bd}`, textAlign: 'center' }}>
                        {emp.diferencia < 0 && (
                          <button
                            className="ch-btn ch-btn-ghost"
                            onClick={e => { e.stopPropagation(); handleSendReminder(emp); }}
                            disabled={sendingId === emp.userId}
                            style={{ fontSize: 11, padding: '4px 10px', color: C.orange }}
                          >
                            {sendingId === emp.userId ? t('chronoAdmin.enviando') : t('chronoAdmin.enviarRecordatorio')}
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* ── Expanded project breakdown ─── */}
                    {isExpanded && emp.proyectos.length > 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '12px 24px 16px 56px', borderBottom: `1px solid ${C.bd}`, background: C.sfHover }}>
                          <div className="fade-in">
                            <div style={{ fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
                              {t('chronoAdmin.desglose')}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {emp.proyectos.map(p => (
                                <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', borderRadius: 6, background: C.sf }}>
                                  <span className="ch-badge" style={{ background: C.blueDim, color: C.blue, fontSize: 10, padding: '2px 8px', fontWeight: 600 }}>
                                    {p.key}
                                  </span>
                                  <span style={{ flex: 1, fontSize: 12, color: C.tx }}>{p.name}</span>
                                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>{fmtHours(p.minutos)}</span>
                                </div>
                              ))}
                            </div>
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
