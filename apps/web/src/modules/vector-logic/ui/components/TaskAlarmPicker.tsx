// @ts-nocheck
import { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { TaskAlarm } from '../../domain/entities/TaskAlarm';
import { taskAlarmRepo } from '../../container';

interface Props {
  taskId: string;
  userId: string;
  onCreated: (alarm: TaskAlarm) => void;
  onClose: () => void;
}

const ADVANCE_OPTIONS: Array<{ value: number; labelKey: string }> = [
  { value: 0,    labelKey: 'vectorLogic.alarmAdvance.exactly' },
  { value: 15,   labelKey: 'vectorLogic.alarmAdvance.15min' },
  { value: 30,   labelKey: 'vectorLogic.alarmAdvance.30min' },
  { value: 60,   labelKey: 'vectorLogic.alarmAdvance.1hour' },
  { value: 120,  labelKey: 'vectorLogic.alarmAdvance.2hours' },
  { value: 1440, labelKey: 'vectorLogic.alarmAdvance.1day' },
];

/**
 * Minimal alarm creator. Uses native date + time inputs — the Dev Agent
 * will replace these with the Jira Tracker datepicker once the shared
 * component is extracted.
 */
export function TaskAlarmPicker({ taskId, userId, onCreated, onClose }: Props) {
  const { t } = useTranslation();
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('09:00');
  const [advance, setAdvance] = useState<number>(0);
  const [repetitions, setRepetitions] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!date) return;
    setBusy(true);
    try {
      const triggerAt = new Date(`${date}T${time}:00`).toISOString();
      const alarm = await taskAlarmRepo.create({
        taskId,
        userId,
        triggerAt,
        advanceMinutes: advance,
        repetitions,
      });
      onCreated(alarm);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 16,
        width: '100%', maxWidth: 420, padding: 20, display: 'flex',
        flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--amber)' }}>
            alarm
          </span>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>
            {t('vectorLogic.addAlarm')}
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
          <div>
            <label style={lblStyle}>{t('vectorLogic.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={lblStyle}>{t('vectorLogic.time')}</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inpStyle} />
          </div>
        </div>

        <div>
          <label style={lblStyle}>{t('vectorLogic.advanceNotice')}</label>
          <select value={advance} onChange={(e) => setAdvance(Number(e.target.value))} style={inpStyle}>
            {ADVANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
          </select>
        </div>

        <div>
          <label style={lblStyle}>{t('vectorLogic.repetitions')}</label>
          <input
            type="number" min={1} max={100} value={repetitions}
            onChange={(e) => setRepetitions(Math.max(1, Math.min(100, Number(e.target.value))))}
            style={inpStyle}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button onClick={onClose} style={ghostBtn}>{t('common.cancel')}</button>
          <button onClick={submit} disabled={!date || busy} style={primaryBtn}>
            {busy ? t('common.loading') : t('vectorLogic.createAlarm')}
          </button>
        </div>
      </div>
    </div>
  );
}

const lblStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase' as const, letterSpacing: '.05em', display: 'block', marginBottom: 5,
};
const inpStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
  color: 'var(--tx)', outline: 'none',
};
const primaryBtn = {
  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
  background: 'linear-gradient(135deg, #adc6ff, #4d8eff)', color: '#fff',
};
const ghostBtn = {
  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', border: '1px solid var(--bd)', fontFamily: 'inherit',
  background: 'var(--sf2)', color: 'var(--tx)',
};
