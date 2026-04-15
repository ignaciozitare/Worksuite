// @ts-nocheck
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useTranslation } from '@worksuite/i18n';
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
  onConfigure?: () => void;
  onDelete?: () => void;
}

function StateNodeComponent({ data }: { data: StateNodeData }) {
  const { t } = useTranslation();
  const catColor = CAT_COLORS[data.category] ?? 'var(--tx3)';

  return (
    <div style={{
      background: 'var(--sf2)',
      border: `1px solid var(--bd)`,
      borderTop: `2px solid ${data.color || catColor}`,
      borderRadius: 10,
      padding: 0,
      minWidth: 200,
      fontFamily: "'Inter',sans-serif",
      boxShadow: '0 4px 24px rgba(0,0,0,.3)',
      transition: 'box-shadow .2s',
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: 'var(--ac)', width: 8, height: 8, border: '2px solid var(--sf)' }} />

      {/* Header */}
      <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: data.color || catColor, flexShrink: 0,
        }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', flex: 1 }}>{data.label}</span>
        {data.isInitial && (
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: 'rgba(245,158,11,.15)', color: 'var(--amber)',
            letterSpacing: '.05em', textTransform: 'uppercase',
          }}>INITIAL</span>
        )}
      </div>

      {/* Category badge */}
      <div style={{ padding: '0 14px 6px' }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
          color: catColor, opacity: .8,
        }}>{data.category}</span>
      </div>

      {/* Actions */}
      <div style={{
        padding: '8px 14px', borderTop: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={data.onConfigure} style={{
          background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 6,
          padding: '4px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', letterSpacing: '.05em', textTransform: 'uppercase',
        }}>{t('vectorLogic.configure')}</button>
        {data.onDelete && (
          <button onClick={data.onDelete} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)',
            fontSize: 14, opacity: .5, transition: 'opacity .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '.5'}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
          </button>
        )}
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: 'var(--ac)', width: 8, height: 8, border: '2px solid var(--sf)' }} />
    </div>
  );
}

export const StateNode = memo(StateNodeComponent);
