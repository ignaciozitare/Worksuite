// @ts-nocheck
import { memo, useState, useEffect, useRef } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { Handle, Position } from '@xyflow/react';
import type { StateCategory } from '../../domain/entities/State';

const CAT_COLORS: Record<StateCategory, string> = {
  BACKLOG: 'var(--tx3)',
  OPEN: 'var(--amber)',
  IN_PROGRESS: 'var(--ac)',
  DONE: 'var(--green)',
};

interface StateNodeData {
  label: string;
  category: StateCategory;
  color: string | null;
  isInitial: boolean;
  onRename?: (newName: string) => void;
  onDelete?: () => void;
}

function StateNodeComponent({ data, selected }: { data: StateNodeData; selected?: boolean }) {
  const { t } = useTranslation();
  const catColor = CAT_COLORS[data.category] ?? 'var(--tx3)';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.label);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync local state when data.label changes externally
  useEffect(() => { setName(data.label); }, [data.label]);

  // Focus the input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== data.label && data.onRename) {
      data.onRename(name.trim());
    } else {
      setName(data.label);
    }
  };

  // Handles on all four sides so connections can come out from anywhere.
  // Each side has both a source and a target handle stacked on top of each
  // other so a single visual dot can act as either.
  const handleStyle = {
    background: 'var(--ac)',
    width: 10, height: 10, border: '2px solid var(--sf)',
    transition: 'transform .15s, background .15s',
  } as const;

  return (
    <div style={{
      background: 'var(--sf2)',
      border: `1px solid ${selected ? 'var(--ac)' : 'var(--bd)'}`,
      borderTop: `3px solid ${data.color || catColor}`,
      borderRadius: 10,
      padding: 0,
      minWidth: 200,
      fontFamily: "'Inter',sans-serif",
      boxShadow: selected
        ? `0 0 0 1px var(--ac), 0 4px 32px rgba(79,110,247,.25)`
        : '0 4px 20px rgba(0,0,0,.3)',
      transition: 'box-shadow .2s, border-color .2s',
    }}>
      {/* Handles — all four sides, both source and target */}
      <Handle id="t-target" type="target" position={Position.Top} style={{ ...handleStyle, top: -6 }} />
      <Handle id="t-source" type="source" position={Position.Top} style={{ ...handleStyle, top: -6 }} />
      <Handle id="b-target" type="target" position={Position.Bottom} style={{ ...handleStyle, bottom: -6 }} />
      <Handle id="b-source" type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -6 }} />
      <Handle id="l-target" type="target" position={Position.Left} style={{ ...handleStyle, left: -6 }} />
      <Handle id="l-source" type="source" position={Position.Left} style={{ ...handleStyle, left: -6 }} />
      <Handle id="r-target" type="target" position={Position.Right} style={{ ...handleStyle, right: -6 }} />
      <Handle id="r-source" type="source" position={Position.Right} style={{ ...handleStyle, right: -6 }} />

      {/* Header — double-click to edit name */}
      <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: data.color || catColor, flexShrink: 0,
        }} />
        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setName(data.label); setEditing(false); }
            }}
            style={{
              flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--tx)',
              background: 'var(--sf3)', border: '1px solid var(--ac)',
              borderRadius: 4, padding: '2px 6px', outline: 'none',
              fontFamily: 'inherit', minWidth: 0,
            }} />
        ) : (
          <span style={{
            fontSize: 14, fontWeight: 700, color: 'var(--tx)', flex: 1,
            cursor: 'text', userSelect: 'none',
          }}>{data.label}</span>
        )}
        {data.isInitial && (
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: 'rgba(245,158,11,.15)', color: 'var(--amber)',
            letterSpacing: '.05em', textTransform: 'uppercase',
          }}>{t('vectorLogic.badgeInitial')}</span>
        )}
      </div>

      {/* Category badge */}
      <div style={{ padding: '0 14px 8px' }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
          color: catColor, opacity: .8,
        }}>{t(`vectorLogic.category${data.category.charAt(0) + data.category.slice(1).toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`)}</span>
      </div>

      {/* Hint */}
      <div style={{
        padding: '6px 14px', borderTop: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 9, color: 'var(--tx3)', opacity: .6,
      }}>
        <span>{t('vectorLogic.clickToRename')}</span>
        {data.onDelete && (
          <button onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)',
              fontSize: 14, opacity: .5, transition: 'opacity .15s',
              padding: 0, lineHeight: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '.5'}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

export const StateNode = memo(StateNodeComponent);
