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
      style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: 'var(--dp-sf)', border: '1px solid var(--dp-bd)', borderRadius: 8, padding: '14px 16px', width: 264, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}
    >
      <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--dp-tx3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>Generador de versión</div>

      {/* Current → next */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 10px', background: 'var(--dp-sf2)', borderRadius: 6, border: '1px solid var(--dp-bd)' }}>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--dp-tx3)', fontFamily: 'monospace' }}>{currentStr}</span>
        <span style={{ color: 'var(--dp-tx3)' }}>→</span>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--dp-primary)', fontFamily: 'monospace' }}>{previewStr}</span>
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
                flex: 1, padding: '7px 0', borderRadius: 5, fontSize: 'var(--fs-2xs)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${bumpIdx === i ? 'var(--dp-primary)' : 'var(--dp-bd)'}`,
                background: bumpIdx === i ? 'rgba(77,142,255,.12)' : 'transparent',
                color: bumpIdx === i ? 'var(--dp-primary)' : 'var(--dp-tx3)', transition: 'all .12s',
              }}
            >
              {seg.name}<br />
              <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 400, opacity: .75 }}>
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
          style={{ flex: 1, background: 'linear-gradient(135deg,#adc6ff,#4d8eff)', border: 'none', borderRadius: 8, padding: '7px', fontSize: 'var(--fs-2xs)', fontWeight: 700, color: '#00285d', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 0 12px rgba(77,142,255,.3)' }}
        >
          Usar {previewStr}
        </button>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: '1px solid var(--dp-bd)', borderRadius: 5, padding: '7px 10px', fontSize: 'var(--fs-2xs)', color: 'var(--dp-tx3)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
