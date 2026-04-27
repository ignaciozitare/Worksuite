import { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { Modal } from '@worksuite/ui';
import type { CloneTaskOptions } from '../../application/CloneTask';

interface Props {
  /** Title of the source task — used to pre-fill `clon - {title}`. */
  sourceTitle: string;
  /** Whether the source has any direct subtasks — toggles the visibility of
   *  the "Subtasks (recursive)" checkbox. */
  hasSubtasks: boolean;
  onClose: () => void;
  onConfirm: (opts: CloneTaskOptions) => Promise<void>;
}

/**
 * Modal opened from the kebab menu's "Clone" item. Lets the user override
 * the cloned task's title and toggle which fields to copy. Defaults match
 * the spec (Phase 5 — TaskCard ToDo + Card Menu, 2026-04-27): data, priority
 * and assignee are pre-checked; subtasks/alarms/comments are off.
 *
 * Note: alarms and comments are reserved toggles — they appear in the UI
 * for forward-compat but the use case ignores them in v1 (no alarm copy
 * flow wired here, no comment entity yet). The user still expressed which
 * preference they want and we honor it the moment the back-end gains it.
 */
export function CloneTaskModal({ sourceTitle, hasSubtasks, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(`${t('vectorLogic.cloneModalTitlePrefix')} - ${sourceTitle}`);
  const [includeSubtasks, setIncludeSubtasks] = useState(false);
  const [includeData, setIncludeData] = useState(true);
  const [includePriority, setIncludePriority] = useState(true);
  const [includeAssignee, setIncludeAssignee] = useState(true);
  const [includeAlarms, setIncludeAlarms] = useState(false);
  const [includeComments, setIncludeComments] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onConfirm({
        title: title.trim(),
        includeSubtasks,
        includeData,
        includePriority,
        includeAssignee,
        includeAlarms,
        includeComments,
      });
    } finally {
      setBusy(false);
    }
  };

  const Row = ({
    label, checked, onChange, hidden = false,
  }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    hidden?: boolean;
  }) => {
    if (hidden) return null;
    return (
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 6,
        background: 'var(--sf2)',
        cursor: 'pointer',
        fontSize: 'var(--fs-xs)',
        color: 'var(--tx)',
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        {label}
      </label>
    );
  };

  return (
    <Modal title={t('vectorLogic.cloneModalTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title input */}
        <div>
          <label style={{
            display: 'block', marginBottom: 6,
            fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.05em',
            textTransform: 'uppercase', color: 'var(--tx3)',
          }}>
            {t('vectorLogic.cloneModalTitleField')}
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
            style={{
              width: '100%', padding: '8px 10px',
              background: 'var(--sf2)', color: 'var(--tx)',
              border: '1px solid var(--bd)', borderRadius: 6,
              fontFamily: 'inherit', fontSize: 'var(--fs-xs)',
            }}
          />
        </div>

        {/* What to copy */}
        <div>
          <label style={{
            display: 'block', marginBottom: 6,
            fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.05em',
            textTransform: 'uppercase', color: 'var(--tx3)',
          }}>
            {t('vectorLogic.cloneModalWhatToCopy')}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Row label={t('vectorLogic.cloneModalIncludeSubtasks')} checked={includeSubtasks} onChange={setIncludeSubtasks} hidden={!hasSubtasks} />
            <Row label={t('vectorLogic.cloneModalIncludeData')}     checked={includeData}     onChange={setIncludeData} />
            <Row label={t('vectorLogic.cloneModalIncludePriority')} checked={includePriority} onChange={setIncludePriority} />
            <Row label={t('vectorLogic.cloneModalIncludeAssignee')} checked={includeAssignee} onChange={setIncludeAssignee} />
            <Row label={t('vectorLogic.cloneModalIncludeAlarms')}   checked={includeAlarms}   onChange={setIncludeAlarms} />
            <Row label={t('vectorLogic.cloneModalIncludeComments')} checked={includeComments} onChange={setIncludeComments} />
          </div>
        </div>

        {/* Note */}
        <div style={{
          fontSize: 'var(--fs-2xs)', color: 'var(--tx3)',
          padding: '6px 10px', background: 'var(--sf2)',
          borderRadius: 6, border: '1px solid var(--bd)',
        }}>
          {t('vectorLogic.cloneModalStartsInOpen')}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: 'var(--sf2)', color: 'var(--tx)',
              border: '1px solid var(--bd)',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 'var(--fs-xs)', fontWeight: 500,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim()}
            style={{
              padding: '8px 16px', borderRadius: 8,
              background: 'var(--ac-grad)', color: 'var(--ac-on)',
              border: 'none',
              cursor: busy || !title.trim() ? 'not-allowed' : 'pointer',
              opacity: busy || !title.trim() ? 0.6 : 1,
              fontFamily: 'inherit',
              fontSize: 'var(--fs-xs)', fontWeight: 600,
              boxShadow: '0 4px 12px var(--ac-dim)',
            }}
          >
            {t('vectorLogic.cloneModalConfirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
