// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// HotDesk — Admin panel (tab-based layout matching Vector Logic pattern)
// Tabs: Settings | Blueprints | Blocked Seats | Assignments
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { supabase } from '../lib/api';
import { SupabaseBuildingRepo } from '../infra/SupabaseBuildingRepo';
import { SupabaseHotDeskAdminRepo } from '../infra/SupabaseHotDeskAdminRepo';
import { SupabaseConfigRepository } from '../../modules/hotdesk/infra/SupabaseConfigRepository';
import { AdminBlueprint } from './AdminBlueprint';
import { BlueprintHDMap } from '../../modules/hotdesk/ui/BlueprintHDMap';
import { MiniCalendar } from '../ui/MiniCalendar';
import { TODAY } from '../lib/constants';
import { fmtMonthYear } from '../lib/utils';
import { DeskType, SeatStatusEnum as SeatStatus } from '../../modules/hotdesk/domain/entities/constants';
import { ReservationService } from '../../modules/hotdesk/domain/services/ReservationService';
import { SEATS } from '../../modules/hotdesk/domain/entities/seats';

const buildingRepo = new SupabaseBuildingRepo(supabase);
const hotdeskAdminRepo = new SupabaseHotDeskAdminRepo(supabase);
const configRepo = new SupabaseConfigRepository();

type Tab = 'settings' | 'blueprints' | 'assignments';

// ─── Settings Tab ────────────────────────────────────────────────────────────
function SettingsTab() {
  const { t } = useTranslation();
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    configRepo.getConfig().then(setConfig).catch(e => console.error('[SettingsTab]', e));
  }, []);

  const save = async (patch) => {
    setSaving(true);
    try {
      await configRepo.updateConfig(patch);
      setConfig(c => ({ ...c, ...patch }));
      setMsg(t('admin.hotdeskSaved'));
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      console.error(e);
      setMsg(t('admin.hotdeskSaveError'));
    }
    setSaving(false);
  };

  if (!config) return <div style={{ padding: 24, color: 'var(--tx3)', fontSize: 'var(--fs-xs)' }}>{t('admin.hotdeskLoading')}</div>;

  const ROLES = ['admin', 'user', 'manager', 'viewer'];

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {msg && <div style={{ padding: '8px 14px', borderRadius: 6, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', color: 'var(--green)', fontSize: 'var(--fs-xs)', fontWeight: 500 }}>{msg}</div>}

      {/* Require booking confirmation */}
      <div className="a-card" style={{ marginBottom: 0 }}>
        <div className="a-ct">{t('admin.hotdeskConfirmationToggle')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={config.confirmationEnabled}
              onChange={e => save({ confirmationEnabled: e.target.checked })}
              style={{ accentColor: 'var(--ac)' }} />
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx)' }}>{t('admin.hotdeskRequireConfirmation')}</span>
          </label>
        </div>
      </div>

      {/* Confirmation deadline */}
      <div className="a-card" style={{ marginBottom: 0 }}>
        <div className="a-ct">{t('admin.hotdeskDeadlineLabel')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input className="a-inp" type="number" min={5} max={240} step={5}
            value={config.confirmationDeadlineMinutes}
            onChange={e => save({ confirmationDeadlineMinutes: Math.max(5, +e.target.value) })}
            style={{ width: 80, fontSize: 'var(--fs-xs)', padding: '6px 10px' }} />
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx3)' }}>{t('admin.hotdeskMinutes')}</span>
        </div>
      </div>

      {/* Business day start */}
      <div className="a-card" style={{ marginBottom: 0 }}>
        <div className="a-ct">{t('admin.hotdeskBusinessStart')}</div>
        <input className="a-inp" type="time"
          value={config.businessDayStart}
          onChange={e => save({ businessDayStart: e.target.value })}
          style={{ width: 120, fontSize: 'var(--fs-xs)', padding: '6px 10px' }} />
      </div>

      {/* Auto-release */}
      <div className="a-card" style={{ marginBottom: 0 }}>
        <div className="a-ct">{t('admin.hotdeskAutoRelease')}</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={config.autoReleaseEnabled}
            onChange={e => save({ autoReleaseEnabled: e.target.checked })}
            style={{ accentColor: 'var(--ac)' }} />
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx)' }}>{t('admin.hotdeskAutoReleaseDesc')}</span>
        </label>
      </div>

      {/* Max booking days ahead */}
      <div className="a-card" style={{ marginBottom: 0 }}>
        <div className="a-ct">{t('admin.hotdeskMaxBookingDays')}</div>
        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', marginBottom: 8 }}>{t('admin.hotdeskMaxBookingDaysDesc')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input className="a-inp" type="number" min={1} max={90} step={1}
            value={config.maxBookingDays}
            onChange={e => save({ maxBookingDays: Math.max(1, Math.min(90, +e.target.value)) })}
            style={{ width: 80, fontSize: 'var(--fs-xs)', padding: '6px 10px' }} />
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx3)' }}>{t('admin.hotdeskDays')}</span>
        </div>
      </div>

      {/* Exempt roles */}
      <div className="a-card" style={{ marginBottom: 0 }}>
        <div className="a-ct">{t('admin.hotdeskExemptRoles')}</div>
        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', marginBottom: 8 }}>{t('admin.hotdeskExemptRolesDesc')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ROLES.map(role => {
            const active = (config.exemptRoles || []).includes(role);
            return (
              <button key={role}
                onClick={() => {
                  const next = active
                    ? config.exemptRoles.filter(r => r !== role)
                    : [...(config.exemptRoles || []), role];
                  save({ exemptRoles: next });
                }}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 'var(--fs-xs)', fontWeight: active ? 600 : 400,
                  border: `1px solid ${active ? 'var(--ac)' : 'var(--bd)'}`,
                  background: active ? 'rgba(77,142,255,.12)' : 'var(--sf2)',
                  color: active ? 'var(--ac2)' : 'var(--tx2)',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                }}>
                {role}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Blocked Seats Tab ───────────────────────────────────────────────────────
function BlockedSeatsTab() {
  const { t } = useTranslation();
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newSeatId, setNewSeatId] = useState('');
  const [newReason, setNewReason] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await hotdeskAdminRepo.getBlockedSeats();
      setBlocked(data);
    } catch (e) {
      console.error('[BlockedSeatsTab]', e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleBlock = async () => {
    if (!newSeatId.trim()) return;
    try {
      await hotdeskAdminRepo.blockSeat(newSeatId.trim(), newReason.trim());
      setNewSeatId('');
      setNewReason('');
      setMsg(t('admin.hotdeskSeatBlocked'));
      setTimeout(() => setMsg(''), 3000);
      load();
    } catch (e) {
      console.error(e);
      setMsg(t('admin.hotdeskSaveError'));
    }
  };

  const handleUnblock = async (seatId) => {
    try {
      await hotdeskAdminRepo.unblockSeat(seatId);
      setMsg(t('admin.hotdeskSeatUnblocked'));
      setTimeout(() => setMsg(''), 3000);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {msg && <div style={{ padding: '8px 14px', borderRadius: 6, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', color: 'var(--green)', fontSize: 'var(--fs-xs)', fontWeight: 500 }}>{msg}</div>}

      {/* Add blocked seat */}
      <div className="a-card" style={{ marginBottom: 0 }}>
        <div className="a-ct">{t('admin.hotdeskBlockSeat')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="a-inp" placeholder={t('admin.hotdeskSeatIdPlaceholder')} value={newSeatId}
            onChange={e => setNewSeatId(e.target.value)}
            style={{ fontSize: 'var(--fs-xs)', padding: '6px 10px' }} />
          <input className="a-inp" placeholder={t('admin.hotdeskBlockReasonPlaceholder')} value={newReason}
            onChange={e => setNewReason(e.target.value)}
            style={{ fontSize: 'var(--fs-xs)', padding: '6px 10px' }} />
          <button className="b-sub" onClick={handleBlock} disabled={!newSeatId.trim()}
            style={{ alignSelf: 'flex-start', padding: '6px 16px', fontSize: 'var(--fs-xs)' }}>
            {t('admin.hotdeskBlockBtn')}
          </button>
        </div>
      </div>

      {/* Current blocked seats */}
      <div className="a-card" style={{ marginBottom: 0 }}>
        <div className="a-ct">{t('admin.hotdeskBlockedList')}</div>
        {loading ? (
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx3)', padding: 8 }}>{t('admin.hotdeskLoading')}</div>
        ) : blocked.length === 0 ? (
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx3)', padding: 8 }}>{t('admin.hotdeskNoBlockedSeats')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {blocked.map(seat => (
              <div key={seat.seat_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: 'rgba(239,68,68,.06)',
                border: '1px solid rgba(239,68,68,.15)', borderRadius: 6,
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: 'var(--red)', minWidth: 50 }}>
                  {seat.seat_id}
                </span>
                <span style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--tx2)' }}>
                  {seat.blocked_reason || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('admin.hotdeskNoReason')}</span>}
                </span>
                <button onClick={() => handleUnblock(seat.seat_id)}
                  style={{ background: 'none', border: '1px solid rgba(239,68,68,.2)', borderRadius: 4, color: 'var(--red)', cursor: 'pointer', fontSize: 'var(--fs-2xs)', padding: '3px 10px', fontFamily: 'inherit' }}>
                  {t('admin.hotdeskUnblock')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Assignments Tab (with block/unblock merged) ────────────────────────────
function AssignmentsTab({ hd, setHd, users, theme }) {
  const { t, locale } = useTranslation();
  const lang = locale;
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [selBldg, setSelBldg] = useState(null);
  const [selFloor, setSelFloor] = useState(null);
  const [selSeat, setSelSeat] = useState(null);
  const [selUser, setSelUser] = useState('');
  const [asFixed, setAsFixed] = useState(false);
  const [asBlocked, setAsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [selDates, setSelDates] = useState([]);
  const [yr, sYr] = useState(new Date().getFullYear());
  const [mo, sMo] = useState(new Date().getMonth());
  const [blocked, setBlocked] = useState([]);
  const [msg, setMsg] = useState('');
  const CELL = 52, PAD = 14, LH = 18;
  const hotdeskUsers = users.filter(u => u.deskType === DeskType.HOTDESK || u.deskType === DeskType.FIXED);

  // Load blocked seats
  const loadBlocked = async () => {
    try {
      const data = await hotdeskAdminRepo.getBlockedSeats();
      setBlocked(data);
    } catch (e) {
      console.error('[AssignmentsTab] loadBlocked', e);
    }
  };

  useEffect(() => { loadBlocked(); }, []);

  useEffect(() => {
    buildingRepo.findAllBuildings()
      .then(data => { if (data) { setBuildings(data); if (data[0]) setSelBldg(data[0]); } });
  }, []);

  useEffect(() => {
    if (!selBldg) { setFloors([]); setSelFloor(null); return; }
    buildingRepo.findBlueprints(selBldg.id)
      .then(data => { if (data) { setFloors(data); setSelFloor(data[0] || null); } });
  }, [selBldg?.id]);

  function getSeatsForItem(item) {
    if (item.shape === 'circle') {
      const { x, y, w, h } = item, cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2 - PAD - CELL / 2;
      const n = Math.max(1, Math.floor(2 * Math.PI * Math.max(R, 1) / (CELL + 8)));
      const pfx = ((item.prefix || item.label || 'A').replace(/\s/g, '').slice(0, 3) || 'A').toUpperCase();
      return Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI - Math.PI / 2; return { id: pfx + (i + 1) }; });
    }
    const { x, y, w, h } = item, cols = Math.max(1, Math.floor((w - PAD * 2) / CELL)), rows = Math.max(1, Math.floor((h - PAD * 2 - LH) / CELL));
    const pfx = ((item.prefix || item.label || 'A').replace(/\s/g, '').slice(0, 3) || 'A').toUpperCase();
    let n = 1; return Array.from({ length: cols * rows }, () => { const s = { id: pfx + n }; n++; return s; });
  }

  const seats = useMemo(() => {
    const items = (() => { try { return Array.isArray(selFloor?.layout) ? selFloor.layout : []; } catch { return []; } })();
    if (!items.length) return SEATS.map(s => ({ ...s }));
    const result = [];
    items.forEach(item => {
      if (item.type !== 'desk' && item.type !== 'circle') return;
      const dis = item.disabled || [];
      getSeatsForItem(item).forEach(s => { if (!dis.includes(s.id)) result.push(s); });
    });
    return result;
  }, [selFloor?.id]);

  const confirmAssign = async () => {
    if (!selSeat) return;
    // Block seat
    if (asBlocked) {
      try {
        await hotdeskAdminRepo.blockSeat(selSeat, blockReason.trim());
        setMsg(t('admin.hotdeskSeatBlocked'));
        setTimeout(() => setMsg(''), 3000);
        loadBlocked();
      } catch (e) {
        console.error(e);
        setMsg(t('admin.hotdeskSaveError'));
      }
      setSelSeat(null); setSelUser(''); setSelDates([]); setAsFixed(false); setAsBlocked(false); setBlockReason('');
      return;
    }
    if (!selUser) return;
    const usr = users.find(u => u.id === selUser);
    if (asFixed) {
      setHd(h => ({ ...h, fixed: { ...h.fixed, [selSeat]: usr?.name || selUser }, reservations: h.reservations.filter(r => r.seatId !== selSeat) }));
      await hotdeskAdminRepo.upsertFixedAssignment(selSeat, selUser, usr?.name || selUser);
    } else {
      if (!selDates.length) return;
      setHd(h => ({ ...h, reservations: [...h.reservations.filter(r => !selDates.includes(r.date) || r.seatId !== selSeat), ...selDates.map(date => ({ seatId: selSeat, date, userId: selUser, userName: usr?.name || selUser }))] }));
      const rows = selDates.map(d => ({ id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, seat_id: selSeat, user_id: selUser, user_name: usr?.name || selUser, date: d }));
      await hotdeskAdminRepo.upsertReservations(rows);
    }
    setSelSeat(null); setSelUser(''); setSelDates([]); setAsFixed(false); setAsBlocked(false); setBlockReason('');
  };

  const handleUnblock = async (seatId) => {
    try {
      await hotdeskAdminRepo.unblockSeat(seatId);
      setMsg(t('admin.hotdeskSeatUnblocked'));
      setTimeout(() => setMsg(''), 3000);
      loadBlocked();
    } catch (e) {
      console.error(e);
    }
  };

  const removeFixed = async (sid) => {
    setHd(h => { const f = { ...h.fixed }; delete f[sid]; return { ...h, fixed: f }; });
    await hotdeskAdminRepo.removeFixedAssignment(sid);
  };

  const occupiedForSeat = selSeat ? hd.reservations.filter(r => r.seatId === selSeat).map(r => r.date) : [];

  const isBlocked = (seatId) => blocked.some(b => b.seat_id === seatId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflow: 'hidden' }}>
      {msg && <div style={{ padding: '8px 14px', borderRadius: 6, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', color: 'var(--green)', fontSize: 'var(--fs-xs)', fontWeight: 500, flexShrink: 0 }}>{msg}</div>}

      {/* Building + Floor selectors */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {buildings.length > 0 ? <>
          <select className="a-inp" style={{ width: 'auto', fontSize: 'var(--fs-xs)', padding: '5px 10px' }}
            value={selBldg?.id || ''} onChange={e => { const b = buildings.find(x => x.id === e.target.value); setSelBldg(b || null); }}>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="a-inp" style={{ width: 'auto', fontSize: 'var(--fs-xs)', padding: '5px 10px' }}
            value={selFloor?.id || ''} onChange={e => { const fl = floors.find(x => x.id === e.target.value); setSelFloor(fl || null); setSelSeat(null); }}>
            {floors.map(fl => <option key={fl.id} value={fl.id}>{fl.floor_name}</option>)}
          </select>
          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>{seats.length} {t('hotdesk.seatsTotal')}</span>
        </> : (
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx3)' }}>{t('admin.hotdeskNoBuildings')}</div>
        )}
      </div>

      {/* Main layout: map 60%, controls 40% */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Floor map — 60% */}
        <div style={{ flex: '0 0 60%', minWidth: 0 }}>
          <div style={{ height: '100%', minHeight: 350 }}>
            {selFloor ? <BlueprintHDMap
              hd={hd}
              blueprint={selFloor}
              currentUser={{ id: '' }}
              onSeat={sid => { setSelSeat(sid); setSelDates([]); setSelUser(''); setAsFixed(false); setAsBlocked(false); setBlockReason(''); }}
              highlightSeat={selSeat}
              theme={theme}
            /> : <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 'var(--fs-xs)' }}>{t('hotdesk.selectBuildingFloor')}</div>}
          </div>
        </div>

        {/* Right: seat config panel — 40% */}
        <div style={{ flex: '0 0 40%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
          {/* Seat grid */}
          <div>
            <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 8 }}>{t('admin.selectSeat').toUpperCase()}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {seats.map(seat => {
                const st = ReservationService.statusOf(seat.id, TODAY, hd.fixed, hd.reservations);
                const isSel = selSeat === seat.id;
                const isBl = isBlocked(seat.id);
                return (
                  <button key={seat.id}
                    onClick={() => { setSelSeat(seat.id); setSelDates([]); setSelUser(''); setAsFixed(false); setAsBlocked(false); setBlockReason(''); }}
                    style={{
                      width: 46, height: 36,
                      border: `1px solid ${isSel ? 'var(--ac)' : isBl ? 'rgba(245,158,11,.4)' : st === SeatStatus.FIXED ? 'rgba(239,68,68,.4)' : st === SeatStatus.OCCUPIED ? 'rgba(59,130,246,.35)' : 'var(--bd)'}`,
                      borderRadius: 'var(--r)',
                      background: isSel ? 'var(--glow)' : isBl ? 'rgba(245,158,11,.08)' : st === SeatStatus.FIXED ? 'rgba(239,68,68,.06)' : st === SeatStatus.OCCUPIED ? 'rgba(59,130,246,.06)' : 'var(--sf2)',
                      color: isSel ? 'var(--ac2)' : isBl ? 'var(--amber)' : st === SeatStatus.FIXED ? 'var(--red)' : st === SeatStatus.OCCUPIED ? 'var(--ac2)' : 'var(--tx2)',
                      cursor: 'pointer', fontSize: 'var(--fs-2xs)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2, padding: '2px 3px', transition: 'var(--ease)'
                    }}>
                    {seat.id}
                    {isBl && <div style={{ fontSize: 'var(--fs-2xs)', lineHeight: 1, marginTop: 1, color: 'var(--amber)' }}>blocked</div>}
                    {!isBl && hd.fixed[seat.id] && <div style={{ fontSize: 'var(--fs-2xs)', lineHeight: 1, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hd.fixed[seat.id].split(' ')[0].slice(0, 5)}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fixed seats summary */}
          {Object.keys(hd.fixed).length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>{t('hotdesk.fixed')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(hd.fixed).map(([sid, uname]) => (
                  <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--r)', fontSize: 'var(--fs-2xs)' }}>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 700, fontSize: 'var(--fs-2xs)' }}>{sid}</span>
                    <span style={{ color: 'var(--tx2)' }}>{uname}</span>
                    <button onClick={() => removeFixed(sid)} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 'var(--fs-xs)', padding: '0 2px', lineHeight: 1 }}>x</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Blocked seats summary */}
          {blocked.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>{t('admin.hotdeskBlockedList')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {blocked.map(seat => (
                  <div key={seat.seat_id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', background: 'rgba(245,158,11,.06)',
                    border: '1px solid rgba(245,158,11,.15)', borderRadius: 'var(--r)', fontSize: 'var(--fs-2xs)',
                  }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', minWidth: 40 }}>{seat.seat_id}</span>
                    <span style={{ flex: 1, fontSize: 'var(--fs-2xs)', color: 'var(--tx2)' }}>
                      {seat.blocked_reason || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('admin.hotdeskNoReason')}</span>}
                    </span>
                    <button onClick={() => handleUnblock(seat.seat_id)}
                      style={{ background: 'none', border: '1px solid rgba(245,158,11,.2)', borderRadius: 4, color: 'var(--amber)', cursor: 'pointer', fontSize: 'var(--fs-2xs)', padding: '2px 8px', fontFamily: 'inherit' }}>
                      {t('admin.hotdeskUnblock')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seat config panel */}
          {selSeat ? (
            <div className="a-card" style={{ marginBottom: 0, flexShrink: 0 }}>
              <div className="a-ct">{t('admin.assignSeat')} — <span style={{ color: 'var(--ac2)', fontFamily: 'var(--mono)' }}>{selSeat}</span>
                <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 400, color: 'var(--tx3)', marginLeft: 8 }}>
                  {isBlocked(selSeat) ? t('admin.hotdeskBlockedTab') : hd.fixed[selSeat] ? t('hotdesk.fixed') + ': ' + hd.fixed[selSeat] : hd.reservations.find(r => r.seatId === selSeat && r.date === TODAY)?.userName || t('hotdesk.free')}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Mode selector: Assign / Block */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setAsBlocked(false); }} style={{
                    flex: 1, padding: '7px 0', borderRadius: 'var(--r)', fontSize: 'var(--fs-xs)', fontWeight: !asBlocked ? 600 : 400,
                    border: `1px solid ${!asBlocked ? 'var(--ac)' : 'var(--bd)'}`,
                    background: !asBlocked ? 'var(--glow)' : 'var(--sf2)',
                    color: !asBlocked ? 'var(--ac2)' : 'var(--tx3)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {t('admin.confirmAssign')}
                  </button>
                  <button onClick={() => { setAsBlocked(true); setAsFixed(false); setSelUser(''); }} style={{
                    flex: 1, padding: '7px 0', borderRadius: 'var(--r)', fontSize: 'var(--fs-xs)', fontWeight: asBlocked ? 600 : 400,
                    border: `1px solid ${asBlocked ? 'var(--amber)' : 'var(--bd)'}`,
                    background: asBlocked ? 'rgba(245,158,11,.1)' : 'var(--sf2)',
                    color: asBlocked ? 'var(--amber)' : 'var(--tx3)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {t('admin.hotdeskBlockBtn')}
                  </button>
                </div>

                {asBlocked ? (
                  <>
                    <input className="a-inp" placeholder={t('admin.hotdeskBlockReasonPlaceholder')} value={blockReason}
                      onChange={e => setBlockReason(e.target.value)}
                      style={{ fontSize: 'var(--fs-xs)', padding: '6px 10px' }} />
                  </>
                ) : (
                  <>
                    <select className="a-inp" value={selUser} onChange={e => setSelUser(e.target.value)} style={{ cursor: 'pointer' }}>
                      <option value="">— {t('hotdesk.selectUser')} —</option>
                      {hotdeskUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <div onClick={() => setAsFixed(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--sf2)', borderRadius: 'var(--r)', border: `1px solid ${asFixed ? 'rgba(239,68,68,.3)' : 'var(--bd)'}`, cursor: 'pointer' }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, background: asFixed ? 'var(--red)' : 'transparent', border: `2px solid ${asFixed ? 'var(--red)' : 'var(--bd2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {asFixed && <span style={{ color: 'var(--sf)', fontSize: 'var(--fs-2xs)', fontWeight: 700 }}>ok</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: asFixed ? 'var(--red)' : 'var(--tx2)', fontWeight: asFixed ? 600 : 400 }}>{t('admin.asFixed')}</div>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>{t('admin.asFixedHint')}</div>
                      </div>
                    </div>
                    {!asFixed && (
                      <div>
                        <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>{t('hotdesk.selectDates')}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <button className="n-arr" onClick={() => mo === 0 ? (sMo(11), sYr(y => y - 1)) : sMo(m => m - 1)}>&#8249;</button>
                          <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: 'var(--ac2)' }}>{fmtMonthYear(yr, mo, 'en')}</span>
                          <button className="n-arr" onClick={() => mo === 11 ? (sMo(0), sYr(y => y + 1)) : sMo(m => m + 1)}>&#8250;</button>
                        </div>
                        <MiniCalendar year={yr} month={mo} lang={lang} selectedDates={selDates} onToggleDate={d => setSelDates(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])} occupiedDates={occupiedForSeat} />
                        {selDates.length > 0 && <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--green)', marginTop: 6 }}>{selDates.length} {t('hotdesk.selectDates')}</div>}
                      </div>
                    )}
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="b-cancel" onClick={() => { setSelSeat(null); setSelUser(''); setSelDates([]); setAsBlocked(false); setBlockReason(''); }}>{t('hotdesk.cancel')}</button>
                  <button className="b-sub" onClick={confirmAssign} disabled={asBlocked ? false : (!selUser || (!asFixed && selDates.length === 0))}>
                    {asBlocked ? t('admin.hotdeskBlockBtn') : asFixed ? t('admin.asFixed') : t('admin.confirmAssign') + ' (' + selDates.length + ')'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 16, background: 'var(--sf2)', borderRadius: 'var(--r2)', border: '1px solid var(--bd)', color: 'var(--tx3)', fontSize: 'var(--fs-xs)', textAlign: 'center' }}>
              {t('admin.selectSeat')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main AdminHotDesk (tab shell) ───────────────────────────────────────────
function AdminHotDesk({ hd, setHd, users, theme = "dark" }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('settings');

  const TABS: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'settings',    label: t('admin.hotdeskSettingsTab'),    icon: 'settings' },
    { id: 'blueprints',  label: t('admin.hotdeskBlueprintsTab'),  icon: 'map' },
    { id: 'assignments', label: t('admin.hotdeskAssignmentsTab'), icon: 'event_seat' },
  ];

  return (
    <div className="ahd" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`
        .ahd-tabs {
          display: flex; gap: 2px;
          padding: 14px 20px 0;
          border-bottom: 1px solid var(--bd);
          flex-shrink: 0;
          overflow-x: auto;
        }
        .ahd-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 16px;
          border: none; background: transparent; color: var(--tx3);
          border-bottom: 2px solid transparent;
          font-family: inherit; font-size: 13px; font-weight: 500;
          cursor: pointer;
          letter-spacing: .01em;
          transition: all .15s;
          white-space: nowrap;
        }
        .ahd-tab:hover { color: var(--tx); }
        .ahd-tab.active {
          color: var(--ac);
          border-bottom-color: var(--ac);
          font-weight: 600;
        }
        .ahd-tab .material-symbols-outlined { font-size: 18px; }
        .ahd-content {
          flex: 1; min-height: 0;
          overflow: auto;
          padding: 24px 28px;
          display: flex; flex-direction: column;
        }
      `}</style>

      <div className="ahd-tabs">
        {TABS.map(x => (
          <button key={x.id}
            className={`ahd-tab${tab === x.id ? ' active' : ''}`}
            onClick={() => setTab(x.id)}>
            <span className="material-symbols-outlined">{x.icon}</span>
            {x.label}
          </button>
        ))}
      </div>

      <div className="ahd-content">
        {tab === 'settings'    && <SettingsTab />}
        {tab === 'blueprints'  && <AdminBlueprint />}
        {tab === 'assignments' && <AssignmentsTab hd={hd} setHd={setHd} users={users} theme={theme} />}
      </div>
    </div>
  );
}

export { AdminHotDesk };
