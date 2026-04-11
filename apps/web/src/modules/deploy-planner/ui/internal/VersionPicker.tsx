/**
 * VersionPicker — semver bump popover used inside ReleaseCard.
 *
 * Parses the highest existing release number, lets the user pick which
 * segment to bump (major/minor/patch or whatever the admin configured),
 * and previews the next version. On confirm it fires onSelect(nextVer).
 *
 * Extracted from DeployPlanner.tsx — pure presentational, no external deps.
 */
import { useState } from 'react';
import type { VersionCfg } from './types';

interface VersionPickerProps {
  versionCfg: VersionCfg | null;
  allReleaseNumbers: string[];
  onSelect: (version: string) => void;
  onClose: () => void;
}

const DEFAULT_CFG: VersionCfg = {
  prefix: 'v',
  separator: '.',
  segments: [
    { name: 'major', value: 1 },
    { name: 'minor', value: 0 },
    { name: 'patch', value: 0 },
  ],
};

export function VersionPicker({ versionCfg, allReleaseNumbers, onSelect, onClose }: VersionPickerProps) {
  const cfg = versionCfg ?? DEFAULT_CFG;
  const sep  = cfg.separator || '.';
  const pre  = cfg.prefix || 'v';
  const segs = cfg.segments.length > 0 ? cfg.segments : DEFAULT_CFG.segments;

  // Parse a version string into an array of numbers
  const parseVer = (str: string): number[] | null => {
    if (!str) return null;
    const clean = str.startsWith(pre) ? str.slice(pre.length) : str;
    const parts = clean.split(sep).map(n => parseInt(n, 10));
    return parts.every(n => !isNaN(n)) && parts.length === segs.length ? parts : null;
  };

  // Find the highest version across all existing releases
  const baseline: number[] = segs.map(s => s.value || 0);
  const current = allReleaseNumbers.reduce<number[]>((max, numStr) => {
    const parts = parseVer(numStr);
    if (!parts) return max;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i] ?? 0;
      const m = max[i] ?? 0;
      if (p > m) return parts;
      if (p < m) return max;
    }
    return max;
  }, baseline);

  const currentStr = pre + current.join(sep);

  // Which segment to bump (default: last = patch)
  const [bumpIdx, setBumpIdx] = useState(segs.length - 1);

  // Compute the preview by bumping selected segment and resetting lower ones
  const preview = current.map((val, i) => {
    if (i === bumpIdx) return val + 1;
    if (i > bumpIdx) return 0;
    return val;
  });
  const previewStr = pre + preview.join(sep);

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: 'var(--dp-sf,#0b0f18)', border: '1px solid var(--dp-bd,#1e293b)', borderRadius: 8, padding: '14px 16px', width: 264, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dp-tx3,#475569)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>Generador de versión</div>

      {/* Current → next */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 10px', background: 'var(--dp-sf2,#07090f)', borderRadius: 6, border: '1px solid var(--dp-bd,#1e293b)' }}>
        <span style={{ fontSize: 12, color: 'var(--dp-tx3,#475569)', fontFamily: 'monospace' }}>{currentStr}</span>
        <span style={{ color: 'var(--dp-tx3,#334155)' }}>→</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>{previewStr}</span>
      </div>

      {/* Segment selectors */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
        {segs.map((seg, i) => {
          const currentVal = current[i] ?? 0;
          return (
            <button
              key={seg.name}
              onClick={() => setBumpIdx(i)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${bumpIdx === i ? '#38bdf8' : 'var(--dp-bd,#1e293b)'}`,
                background: bumpIdx === i ? 'rgba(56,189,248,.15)' : 'transparent',
                color: bumpIdx === i ? '#38bdf8' : 'var(--dp-tx3,#64748b)', transition: 'all .12s',
              }}
            >
              {seg.name}<br />
              <span style={{ fontSize: 8, fontWeight: 400, opacity: .75 }}>
                {bumpIdx === i
                  ? `${currentVal} → ${currentVal + 1}`
                  : i > bumpIdx ? '→ 0' : `${currentVal}`}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => onSelect(previewStr)}
          style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)', border: 'none', borderRadius: 5, padding: '7px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Usar {previewStr}
        </button>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: '1px solid var(--dp-bd,#1e293b)', borderRadius: 5, padding: '7px 10px', fontSize: 11, color: 'var(--dp-tx3,#64748b)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
