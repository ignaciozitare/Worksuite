// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IEquipoRepository } from '../../domain/ports/IEquipoRepository';
import type { Equipo } from '../../domain/entities/Equipo';

import { CHRONO_ADMIN_COLORS as C } from '../../shared/adminColors';

interface Props {
  equipoRepo: IEquipoRepository;
  users: any[];
}

export function EquiposView({ equipoRepo, users }: Props) {
  const { t } = useTranslation();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTeam, setNewTeam] = useState({ nombre: '', descripcion: '', managerId: '' });
  const [creating, setCreating] = useState(false);
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [editTeamDraft, setEditTeamDraft] = useState({ nombre: '', descripcion: '', managerId: '' });
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bookingZonesDraft, setBookingZonesDraft] = useState<Record<string, string>>({});
  const [savingZones, setSavingZones] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await equipoRepo.getAll();
      setEquipos(data);
    } catch (err) {
      console.error('Error loading equipos:', err);
    } finally {
      setLoading(false);
    }
  }, [equipoRepo]);

  useEffect(() => { load(); }, [load]);

  /* ── Create team ─── */
  async function handleCreate() {
    if (!newTeam.nombre.trim()) return;
    setCreating(true);
    try {
      await equipoRepo.create(newTeam.nombre.trim(), newTeam.descripcion.trim() || undefined, newTeam.managerId || undefined);
      setNewTeam({ nombre: '', descripcion: '', managerId: '' });
      setShowNewForm(false);
      await load();
    } catch (err) {
      console.error('Error creating team:', err);
    } finally {
      setCreating(false);
    }
  }

  /* ── Delete team ─── */
  async function handleDelete(id: string) {
    try {
      await equipoRepo.delete(id);
      setConfirmDeleteId(null);
      setExpandedId(null);
      await load();
    } catch (err) {
      console.error('Error deleting team:', err);
    }
  }

  /* ── Remove member ─── */
  async function handleRemoveMember(equipoId: string, userId: string) {
    try {
      await equipoRepo.removeMiembro(equipoId, userId);
      await load();
    } catch (err) {
      console.error('Error removing member:', err);
    }
  }

  /* ── Add member ─── */
  async function handleAddMember(equipoId: string, userId: string) {
    try {
      await equipoRepo.addMiembro(equipoId, userId);
      setAddMemberSearch('');
      await load();
    } catch (err) {
      console.error('Error adding member:', err);
    }
  }

  /* ── Available users for adding (not already in team) ─── */
  function getAvailableUsers(equipo: Equipo) {
    const memberIds = new Set(equipo.miembros.map(m => m.userId));
    let available = users.filter(u => !memberIds.has(u.id));
    if (addMemberSearch.trim()) {
      const q = addMemberSearch.toLowerCase();
      available = available.filter(u =>
        (u.name || u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }
    return available.slice(0, 8);
  }

  function getUserName(userId: string | null): string {
    if (!userId) return '—';
    const u = users.find(u => u.id === userId);
    return u?.name || u?.full_name || u?.email || userId.slice(0, 8);
  }

  return (
    <div className="fade-in">
      {/* ── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('chronoAdmin.equiposTitle')}</div>
          <div style={{ fontSize: 12, color: C.txDim, marginTop: 2 }}>{t('chronoAdmin.equiposSubtitle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ch-btn ch-btn-ghost" onClick={load}>
            ↻ {t('chronoAdmin.recargar')}
          </button>
          <button className="ch-btn ch-btn-amber" onClick={() => setShowNewForm(!showNewForm)}>
            + {t('chronoAdmin.nuevoEquipo')}
          </button>
        </div>
      </div>

      {/* ── New team form ─── */}
      {showNewForm && (
        <div className="ch-card fade-in" style={{ marginBottom: 20, padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{t('chronoAdmin.crearEquipo')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 14, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 11, color: C.txMuted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t('chronoAdmin.nombreEquipo')}
              </label>
              <input
                type="text"
                value={newTeam.nombre}
                onChange={e => setNewTeam(p => ({ ...p, nombre: e.target.value }))}
                placeholder={t('chronoAdmin.nombreEquipoPlaceholder')}
                style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.txMuted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t('chronoAdmin.descripcion')}
              </label>
              <input
                type="text"
                value={newTeam.descripcion}
                onChange={e => setNewTeam(p => ({ ...p, descripcion: e.target.value }))}
                placeholder={t('chronoAdmin.descripcionPlaceholder')}
                style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.txMuted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t('chronoAdmin.manager')}
              </label>
              <select
                value={newTeam.managerId}
                onChange={e => setNewTeam(p => ({ ...p, managerId: e.target.value }))}
                style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none' }}
              >
                <option value="">{t('chronoAdmin.seleccionarManager')}</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.full_name || u.email}</option>
                ))}
              </select>
            </div>
            <button
              className="ch-btn ch-btn-amber"
              onClick={handleCreate}
              disabled={creating || !newTeam.nombre.trim()}
              style={{ height: 36, fontSize: 12 }}
            >
              {creating ? t('chronoAdmin.creando') : t('chronoAdmin.crear')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.txDim, fontSize: 13 }}>
          {t('chronoAdmin.cargando')}
        </div>
      ) : equipos.length === 0 ? (
        <div className="ch-card" style={{ textAlign: 'center', padding: '40px 0', color: C.txDim }}>
          {t('chronoAdmin.sinEquipos')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {equipos.map(equipo => {
            const isExpanded = expandedId === equipo.id;
            return (
              <div key={equipo.id} className="ch-card fade-in" style={{ overflow: 'hidden' }}>
                {/* ── Team header ─── */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : equipo.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', transition: 'background .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.sfHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Team icon */}
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: C.amberGlow,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, color: C.amber, fontFamily: "'IBM Plex Mono',monospace", fontSize: 16,
                  }}>
                    {equipo.nombre.charAt(0).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{equipo.nombre}</div>
                    {equipo.descripcion && (
                      <div style={{ fontSize: 12, color: C.txDim, marginTop: 2 }}>{equipo.descripcion}</div>
                    )}
                  </div>

                  {/* Manager */}
                  <div style={{ textAlign: 'right', marginRight: 16 }}>
                    <div style={{ fontSize: 10, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('chronoAdmin.manager')}</div>
                    <div style={{ fontSize: 12, color: C.tx, marginTop: 2 }}>{getUserName(equipo.managerId)}</div>
                  </div>

                  {/* Member count */}
                  <div style={{ textAlign: 'center' }}>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: C.amber }}>{equipo.miembros.length}</div>
                    <div style={{ fontSize: 10, color: C.txMuted, textTransform: 'uppercase' }}>{t('chronoAdmin.miembros')}</div>
                  </div>

                  {/* Edit + Delete */}
                  <button className="ch-btn ch-btn-ghost" onClick={e => { e.stopPropagation(); setEditingTeam(editingTeam === equipo.id ? null : equipo.id); setEditTeamDraft({ nombre: equipo.nombre, descripcion: equipo.descripcion || '', managerId: equipo.managerId || '' }); }} style={{ fontSize: 11, padding: '4px 10px' }}>✏️</button>
                  <button className="ch-btn ch-btn-ghost" onClick={e => { e.stopPropagation(); if (confirm(t('chronoAdmin.confirmarEliminar'))) handleDelete(equipo.id); }} style={{ fontSize: 11, padding: '4px 10px', color: C.red, borderColor: `${C.red}44` }}>🗑</button>

                  {/* Chevron */}
                  <div style={{ fontSize: 14, color: C.txMuted, transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▼</div>
                </div>

                {/* ── Edit team inline ─── */}
                {editingTeam === equipo.id && (
                  <div className="fade-in" style={{ borderTop: `1px solid ${C.bd}`, padding: '14px 20px', background: C.sfHover }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: C.txMuted, display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('chronoAdmin.nombreEquipo')}</label>
                        <input type="text" value={editTeamDraft.nombre} onChange={e => setEditTeamDraft(p => ({ ...p, nombre: e.target.value }))} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: C.txMuted, display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('chronoAdmin.descripcion')}</label>
                        <input type="text" value={editTeamDraft.descripcion} onChange={e => setEditTeamDraft(p => ({ ...p, descripcion: e.target.value }))} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: C.txMuted, display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.08em' }}>{t('chronoAdmin.manager')}</label>
                        <select value={editTeamDraft.managerId} onChange={e => setEditTeamDraft(p => ({ ...p, managerId: e.target.value }))} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.tx, fontSize: 13, width: '100%', outline: 'none' }}>
                          <option value="">{t('chronoAdmin.seleccionarManager')}</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                        </select>
                      </div>
                      <button className="ch-btn ch-btn-amber" style={{ height: 34, fontSize: 12 }} onClick={async () => { await equipoRepo.update(equipo.id, { nombre: editTeamDraft.nombre, descripcion: editTeamDraft.descripcion || null, managerId: editTeamDraft.managerId || null }); setEditingTeam(null); load(); }}>{t('chronoAdmin.guardar')}</button>
                    </div>
                  </div>
                )}

                {/* ── Expanded members ─── */}
                {isExpanded && (
                  <div className="fade-in" style={{ borderTop: `1px solid ${C.bd}`, padding: '16px 20px' }}>
                    {/* Members list */}
                    {equipo.miembros.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: C.txDim, fontSize: 12 }}>
                        {t('chronoAdmin.sinMiembros')}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                        {equipo.miembros.map(m => (
                          <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, background: C.sf }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: `linear-gradient(135deg,${C.amberDim},#78350f)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 700, color: C.amber, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
                            }}>
                              {m.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.nombre}</div>
                              <div style={{ fontSize: 11, color: C.txDim }}>{m.email}</div>
                            </div>
                            <button
                              className="ch-btn ch-btn-ghost"
                              onClick={() => handleRemoveMember(equipo.id, m.userId)}
                              style={{ fontSize: 11, color: C.red, padding: '4px 10px' }}
                            >
                              {t('chronoAdmin.quitar')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add member */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                        {t('chronoAdmin.agregarMiembro')}
                      </div>
                      <input
                        type="text"
                        value={addMemberSearch}
                        onChange={e => setAddMemberSearch(e.target.value)}
                        placeholder={t('chronoAdmin.buscarUsuario')}
                        style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '7px 10px', color: C.tx, fontSize: 13, width: 280, outline: 'none', marginBottom: 6 }}
                      />
                      {addMemberSearch.trim() && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {getAvailableUsers(equipo).map(u => (
                            <div
                              key={u.id}
                              onClick={() => handleAddMember(equipo.id, u.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                borderRadius: 6, background: C.sf, cursor: 'pointer', transition: 'background .15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = C.sfHover)}
                              onMouseLeave={e => (e.currentTarget.style.background = C.sf)}
                            >
                              <span style={{ fontSize: 12, fontWeight: 500 }}>{u.name || u.full_name || u.email}</span>
                              <span style={{ fontSize: 11, color: C.txDim }}>{u.email}</span>
                              <div style={{ flex: 1 }} />
                              <span style={{ fontSize: 11, color: C.green }}>+ {t('chronoAdmin.agregar')}</span>
                            </div>
                          ))}
                          {getAvailableUsers(equipo).length === 0 && (
                            <div style={{ fontSize: 12, color: C.txDim, padding: '8px 0' }}>{t('chronoAdmin.sinResultados')}</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Booking zone restrictions */}
                    <div style={{ borderTop: `1px solid ${C.bd}`, paddingTop: 14, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: C.txMuted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, fontWeight: 600 }}>
                        {t('chronoAdmin.bookingZonesTitle')}
                      </div>
                      <div style={{ fontSize: 12, color: C.txDim, marginBottom: 10 }}>
                        {t('chronoAdmin.bookingZonesHelp')}
                      </div>
                      <textarea
                        value={bookingZonesDraft[equipo.id] ?? equipo.allowedBookingZones ?? ''}
                        onChange={e => setBookingZonesDraft(prev => ({ ...prev, [equipo.id]: e.target.value }))}
                        placeholder={t('chronoAdmin.bookingZonesPlaceholder')}
                        rows={3}
                        style={{
                          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6,
                          padding: '8px 10px', color: C.tx, fontSize: 12, width: '100%',
                          outline: 'none', resize: 'vertical', fontFamily: "'IBM Plex Mono',monospace",
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                        {bookingZonesDraft[equipo.id] !== undefined && bookingZonesDraft[equipo.id] !== (equipo.allowedBookingZones ?? '') && (
                          <button
                            className="ch-btn ch-btn-ghost"
                            onClick={() => setBookingZonesDraft(prev => { const next = { ...prev }; delete next[equipo.id]; return next; })}
                            style={{ fontSize: 11, padding: '4px 12px' }}
                          >
                            {t('chronoAdmin.cancelar')}
                          </button>
                        )}
                        <button
                          className="ch-btn ch-btn-amber"
                          disabled={savingZones === equipo.id || bookingZonesDraft[equipo.id] === undefined || bookingZonesDraft[equipo.id] === (equipo.allowedBookingZones ?? '')}
                          onClick={async () => {
                            setSavingZones(equipo.id);
                            try {
                              const val = (bookingZonesDraft[equipo.id] ?? '').trim();
                              await equipoRepo.update(equipo.id, { allowedBookingZones: val || null });
                              setBookingZonesDraft(prev => { const next = { ...prev }; delete next[equipo.id]; return next; });
                              await load();
                            } catch (err) {
                              console.error('Error saving booking zones:', err);
                            } finally {
                              setSavingZones(null);
                            }
                          }}
                          style={{ fontSize: 11, padding: '4px 12px' }}
                        >
                          {savingZones === equipo.id ? t('chronoAdmin.guardando') : t('chronoAdmin.guardarZonas')}
                        </button>
                      </div>
                    </div>

                    {/* Delete team */}
                    <div style={{ borderTop: `1px solid ${C.bd}`, paddingTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      {confirmDeleteId === equipo.id ? (
                        <>
                          <span style={{ fontSize: 12, color: C.red, alignSelf: 'center', marginRight: 8 }}>
                            {t('chronoAdmin.confirmarEliminar')}
                          </span>
                          <button className="ch-btn ch-btn-ghost" onClick={() => setConfirmDeleteId(null)} style={{ fontSize: 11 }}>
                            {t('chronoAdmin.cancelar')}
                          </button>
                          <button
                            className="ch-btn ch-btn-ghost"
                            onClick={() => handleDelete(equipo.id)}
                            style={{ fontSize: 11, color: C.red, borderColor: C.red }}
                          >
                            {t('chronoAdmin.eliminar')}
                          </button>
                        </>
                      ) : (
                        <button
                          className="ch-btn ch-btn-ghost"
                          onClick={() => setConfirmDeleteId(equipo.id)}
                          style={{ fontSize: 11, color: C.red }}
                        >
                          {t('chronoAdmin.eliminarEquipo')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
