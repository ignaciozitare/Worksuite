// @ts-nocheck
import { useState, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { supabase } from '@/shared/lib/supabaseClient';

// ── All available export fields ───────────────────────────────────────────────
const ALL_FIELDS = [
  { id: 'date',        label: 'Fecha',        key: (w,d) => d },
  { id: 'issue',       label: 'Clave',        key: (w) => w.issue },
  { id: 'summary',     label: 'Resumen',      key: (w) => w.summary },
  { id: 'type',        label: 'Tipo',         key: (w) => w.type },
  { id: 'status',      label: 'Estado',       key: (w) => w.status || '' },
  { id: 'priority',    label: 'Prioridad',    key: (w) => w.priority || '' },
  { id: 'project',     label: 'Proyecto',     key: (w) => w.project },
  { id: 'epic',        label: 'Épica (clave)',key: (w) => w.epic || '' },
  { id: 'epicName',    label: 'Épica (nombre)',key: (w) => w.epicName || '' },
  { id: 'author',      label: 'Autor',        key: (w) => w.author },
  { id: 'started',     label: 'Hora inicio',  key: (w) => w.started || '' },
  { id: 'time',        label: 'Tiempo (texto)',key: (w) => w.time },
  { id: 'hours',       label: 'Horas (decimal)',key: (w) => (w.seconds / 3600).toFixed(2) },
  { id: 'seconds',     label: 'Segundos',     key: (w) => String(w.seconds) },
  { id: 'description', label: 'Descripción',  key: (w) => w.description || '' },
  { id: 'synced',      label: 'Sincronizado', key: (w) => w.syncedToJira ? 'Sí' : 'No' },
];

const FIELD_MAP = Object.fromEntries(ALL_FIELDS.map(f => [f.id, f]));

// Default preset
const DEFAULT_COLUMNS = ['date','issue','summary','type','project','author','started','time','hours','description'];

export interface ExportPreset {
  id: string;
  name: string;
  columns: string[];
}

interface ExportConfigModalProps {
  onClose: () => void;
  onExport: (columns: string[], filename: string) => void;
  currentUserId: string;
  initialPresets: ExportPreset[];
  onPresetsChange: (presets: ExportPreset[]) => void;
  /** Date range for display in filename hint. */
  dateFrom?: string;
  dateTo?: string;
}

export function ExportConfigModal({ onClose, onExport, currentUserId, initialPresets, onPresetsChange, dateFrom = '', dateTo = '' }: ExportConfigModalProps) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<ExportPreset[]>(initialPresets);
  const [activePresetId, setActivePresetId] = useState<string | null>(presets[0]?.id ?? null);
  const [columns, setColumns] = useState<string[]>(presets[0]?.columns ?? DEFAULT_COLUMNS);
  const [search, setSearch] = useState('');
  const [presetName, setPresetName] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [filename, setFilename] = useState('worklogs');

  const available = useMemo(() => {
    const sel = new Set(columns);
    let items = ALL_FIELDS.filter(f => !sel.has(f.id));
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(f => f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
    }
    return items;
  }, [columns, search]);

  const selectedFields = columns.map(id => FIELD_MAP[id]).filter(Boolean);

  const addColumn = (id: string) => setColumns(c => [...c, id]);
  const removeColumn = (id: string) => setColumns(c => c.filter(x => x !== id));

  // Drag reorder in selected panel
  const onDragEnd = () => {
    if (dragging === null || dragOver === null || dragging === dragOver) {
      setDragging(null); setDragOver(null); return;
    }
    const next = [...columns];
    const [moved] = next.splice(dragging, 1);
    next.splice(dragOver, 0, moved);
    setColumns(next);
    setDragging(null); setDragOver(null);
  };

  const loadPreset = (preset: ExportPreset) => {
    setActivePresetId(preset.id);
    setColumns([...preset.columns]);
  };

  const persistPresets = async (next: ExportPreset[]) => {
    setSaving(true);
    try {
      await supabase.from('users').update({ export_presets: next }).eq('id', currentUserId);
      setPresets(next);
      onPresetsChange(next);
    } catch (e) { console.error('Save presets error', e); }
    setSaving(false);
  };

  const saveAsNew = async () => {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    const id = Math.random().toString(36).slice(2, 10);
    const preset: ExportPreset = { id, name, columns: [...columns] };
    const next = [...presets, preset];
    await persistPresets(next);
    setActivePresetId(id);
    setPresetName('');
  };

  const updateCurrent = async () => {
    if (!activePresetId) return;
    const next = presets.map(p => p.id === activePresetId ? { ...p, columns: [...columns] } : p);
    await persistPresets(next);
  };

  const deletePreset = async (id: string) => {
    const next = presets.filter(p => p.id !== id);
    await persistPresets(next);
    if (activePresetId === id) {
      setActivePresetId(next[0]?.id ?? null);
      setColumns(next[0]?.columns ?? DEFAULT_COLUMNS);
    }
  };

  // Styles
  const panelStyle = {
    flex: 1, minWidth: 0, background: 'var(--sf2,#1b1b22)', borderRadius: 8,
    border: '1px solid var(--bd,#2a2a38)', display: 'flex', flexDirection: 'column',
    maxHeight: 340, overflow: 'hidden',
  };
  const headerStyle = {
    padding: '8px 10px', borderBottom: '1px solid var(--bd,#2a2a38)',
    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
  };
  const itemStyle = (active = false) => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
    borderRadius: 6, fontSize: 12, cursor: 'grab', transition: 'background .1s',
    fontFamily: 'inherit', border: 'none', width: '100%', textAlign: 'left',
    background: active ? 'rgba(79,110,247,.08)' : 'transparent',
    color: 'var(--tx,#e4e4ef)',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)',
        borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd,#2a2a38)',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx,#e4e4ef)', margin: 0, flex: 1 }}>
            Configurar exportación
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--tx3,#50506a)', fontSize: 20, lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
          {/* Presets bar */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3,#50506a)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Presets:</span>
            {presets.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button onClick={() => loadPreset(p)} style={{
                  padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', border: `1px solid ${activePresetId === p.id ? '#4f6ef7' : 'var(--bd,#2a2a38)'}`,
                  background: activePresetId === p.id ? 'rgba(79,110,247,.12)' : 'transparent',
                  color: activePresetId === p.id ? '#4f6ef7' : 'var(--tx3,#50506a)',
                }}>{p.name}</button>
                <button onClick={() => deletePreset(p.id)} style={{
                  background: 'none', border: 'none', color: 'var(--red,#e05252)', cursor: 'pointer',
                  fontSize: 11, padding: '0 2px', fontFamily: 'inherit',
                }}>×</button>
              </div>
            ))}
            {presets.length === 0 && <span style={{ fontSize: 11, color: 'var(--tx3,#50506a)' }}>Sin presets guardados</span>}
          </div>

          {/* Dual panel */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {/* Available fields */}
            <div style={panelStyle}>
              <div style={{ ...headerStyle, color: 'var(--tx3,#50506a)' }}>
                <span>Campos disponibles ({available.length})</span>
              </div>
              <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--bd,#2a2a38)' }}>
                <input placeholder="Buscar campo…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '4px 8px', fontSize: 11, fontFamily: 'inherit',
                    background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)',
                    borderRadius: 4, color: 'var(--tx,#e4e4ef)', outline: 'none' }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
                {available.map(f => (
                  <div key={f.id} onClick={() => addColumn(f.id)} style={itemStyle()}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,110,247,.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ fontSize: 10, color: 'var(--tx3,#50506a)' }}>+</span>
                    <span style={{ flex: 1 }}>{f.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--tx3,#50506a)', fontFamily: 'var(--mono)' }}>{f.id}</span>
                  </div>
                ))}
                {available.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)', textAlign: 'center', padding: 12 }}>
                    Todos seleccionados
                  </div>
                )}
              </div>
            </div>

            {/* Selected fields (reorderable) */}
            <div style={{ ...panelStyle, borderColor: '#4f6ef7' }}>
              <div style={{ ...headerStyle, color: '#4f6ef7' }}>
                <span>Columnas del export ({columns.length})</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
                {selectedFields.map((f, i) => (
                  <div key={f.id}
                    draggable
                    onDragStart={() => setDragging(i)}
                    onDragOver={e => { e.preventDefault(); setDragOver(i); }}
                    onDragEnd={onDragEnd}
                    style={{
                      ...itemStyle(true),
                      background: dragOver === i ? 'rgba(79,110,247,.2)' : 'rgba(79,110,247,.06)',
                      borderBottom: dragOver === i ? '2px solid #4f6ef7' : 'none',
                    }}
                    onMouseEnter={e => { if (dragging === null) e.currentTarget.style.background = 'rgba(239,68,68,.06)'; }}
                    onMouseLeave={e => { if (dragging === null) e.currentTarget.style.background = 'rgba(79,110,247,.06)'; }}>
                    <span style={{ fontSize: 10, color: 'var(--tx3,#50506a)', cursor: 'grab' }}>⠿</span>
                    <span style={{ flex: 1 }}>{f.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--tx3,#50506a)', fontFamily: 'var(--mono)' }}>{f.id}</span>
                    <button onClick={e => { e.stopPropagation(); removeColumn(f.id); }} style={{
                      background: 'none', border: 'none', color: 'var(--red,#e05252)',
                      cursor: 'pointer', fontSize: 12, padding: '0 4px',
                    }}>×</button>
                  </div>
                ))}
                {columns.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)', textAlign: 'center', padding: 12 }}>
                    Añade campos de la izquierda
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview row */}
          {columns.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3,#50506a)', textTransform: 'uppercase',
                letterSpacing: '.05em', marginBottom: 6 }}>Vista previa de columnas</div>
              <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--bd,#2a2a38)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead><tr>
                    {selectedFields.map(f => (
                      <th key={f.id} style={{ padding: '6px 8px', background: 'var(--sf2,#1b1b22)',
                        color: 'var(--tx3,#50506a)', fontWeight: 700, textAlign: 'left',
                        borderBottom: '1px solid var(--bd,#2a2a38)', whiteSpace: 'nowrap' }}>{f.label}</th>
                    ))}
                  </tr></thead>
                  <tbody><tr>
                    {selectedFields.map(f => (
                      <td key={f.id} style={{ padding: '4px 8px', color: 'var(--tx3,#50506a)',
                        fontStyle: 'italic', whiteSpace: 'nowrap' }}>ejemplo</td>
                    ))}
                  </tr></tbody>
                </table>
              </div>
            </div>
          )}

          {/* Filename */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3,#50506a)', textTransform: 'uppercase',
              letterSpacing: '.05em', marginBottom: 6 }}>Nombre del archivo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input value={filename} onChange={e => setFilename(e.target.value)}
                placeholder="worklogs"
                style={{ flex: 1, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
                  background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
                  borderRadius: 6, color: 'var(--tx,#e4e4ef)', outline: 'none' }} />
              <span style={{ fontSize: 11, color: 'var(--tx3,#50506a)', whiteSpace: 'nowrap' }}>
                _{dateFrom}_{dateTo}.csv
              </span>
            </div>
          </div>

          {/* Save preset controls */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={presetName} onChange={e => setPresetName(e.target.value)}
              placeholder="Nombre del preset…"
              style={{ flex: 1, minWidth: 140, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit',
                background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
                borderRadius: 6, color: 'var(--tx,#e4e4ef)', outline: 'none' }}
              onKeyDown={e => { if (e.key === 'Enter') saveAsNew(); }} />
            <button onClick={saveAsNew} disabled={saving} style={{
              background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
              borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600,
              color: 'var(--tx3,#50506a)', cursor: 'pointer', fontFamily: 'inherit',
            }}>+ Guardar como nuevo</button>
            {activePresetId && (
              <button onClick={updateCurrent} disabled={saving} style={{
                background: 'rgba(79,110,247,.1)', border: '1px solid rgba(79,110,247,.3)',
                borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600,
                color: '#4f6ef7', cursor: 'pointer', fontFamily: 'inherit',
              }}>Actualizar "{presets.find(p => p.id === activePresetId)?.name}"</button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--bd,#2a2a38)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{
            background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
            borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600,
            color: 'var(--tx3,#50506a)', cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancelar</button>
          <button onClick={() => onExport(columns, `${filename.trim() || 'worklogs'}_${dateFrom}_${dateTo}`)} disabled={columns.length === 0} style={{
            background: 'var(--ac,#4f6ef7)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 20px', fontSize: 12, fontWeight: 700,
            cursor: columns.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            opacity: columns.length ? 1 : 0.5,
          }}>↓ Exportar CSV</button>
        </div>
      </div>
    </div>
  );
}

// ── Export function using configured columns ──────────────────────────────────
export function exportWithColumns(
  worklogs: Record<string, any[]>,
  from: string, to: string,
  authorId: string | null,
  spaceKeys: string[],
  columns: string[],
  filename?: string,
) {
  // Inline filter — same logic as WorklogService.filterByRange
  const filtered: Record<string, any[]> = {};
  for (const [date, wls] of Object.entries(worklogs || {})) {
    if (date < from || date > to) continue;
    const dayWls = authorId ? wls.filter(w => w.authorId === authorId) : wls;
    if (dayWls.length) filtered[date] = dayWls;
  }
  const fields = columns.map(id => ALL_FIELDS.find(f => f.id === id)).filter(Boolean);

  const rows: string[][] = [fields.map(f => f.label)];
  for (const [date, wls] of Object.entries(filtered)) {
    for (const w of wls) {
      if (spaceKeys.length && !spaceKeys.includes(w.project)) continue;
      rows.push(fields.map(f => {
        const val = f.key(w, date);
        return typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))
          ? `"${val.replace(/"/g, '""')}"` : val;
      }));
    }
  }

  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename || `worklogs_${from}_${to}`}.csv`; a.click();
  URL.revokeObjectURL(url);
}
