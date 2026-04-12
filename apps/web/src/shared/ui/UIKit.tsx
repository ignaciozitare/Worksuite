// @ts-nocheck
import React, { useState } from 'react';
import {
  Avatar, Badge, StatBox, Divider, Chip,
  Modal, ConfirmModal,
  GanttTimeline,
  StatusManager,
  DualPanelPicker,
  DateRangePicker,
  BugIcon,
} from '@worksuite/ui';
import { NotificationsBell } from './NotificationsBell';
import { UserMenu } from './UserMenu';
import type { NotificationPort, Notification } from '../domain/ports/NotificationPort';
import '../../WorkSuiteApp.css';

// In-memory fake repo for the UI Kit demo (no Supabase calls)
const demoNotifications: Notification[] = [
  { id: '1', tipo: 'warning', titulo: 'Reminder', mensaje: 'You have 2h of incomplete clock-ins.', leida: false, link: '/chrono?view=incompletos', createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
  { id: '2', tipo: 'info',    titulo: 'Welcome',  mensaje: 'Your account is now active.',          leida: true,  link: null, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
];
const demoRepo: NotificationPort = {
  listByUser: async () => demoNotifications,
  markAsRead: async () => undefined,
};

// Error boundary to prevent one broken component from crashing the page
class SafeRender extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 12, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>
        Error rendering component: {this.state.error?.message || 'Unknown'}
      </div>
    );
    return this.props.children;
  }
}

const Section = ({ title, description, children }) => (
  <div style={{ marginBottom: 40 }}>
    <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx,#e4e4ef)', marginBottom: 4, borderBottom: '1px solid var(--bd,#2a2a38)', paddingBottom: 8 }}>{title}</h2>
    {description && <p style={{ fontSize: 12, color: 'var(--tx3,#50506a)', marginBottom: 14 }}>{description}</p>}
    <div style={{ padding: '16px 0' }}><SafeRender>{children}</SafeRender></div>
  </div>
);

const Row = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3,#50506a)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const Code = ({ children }) => (
  <code style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--sf2,#1b1b22)', color: '#a78bfa', fontFamily: 'monospace' }}>{children}</code>
);

export function UIKit() {
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [dualSelected, setDualSelected] = useState(['apple', 'banana']);
  const [statuses, setStatuses] = useState([
    { id: '1', name: 'Backlog', color: '#6b7280', bg_color: '#6b728020', border: '#6b728066', ord: 0, status_category: 'backlog' },
    { id: '2', name: 'In Progress', color: '#f59e0b', bg_color: '#f59e0b20', border: '#f59e0b66', ord: 1, status_category: 'in_progress' },
    { id: '3', name: 'Done', color: '#22c55e', bg_color: '#22c55e20', border: '#22c55e66', ord: 2, status_category: 'done' },
  ]);

  const ganttBars = [
    { id: '1', label: 'Release v1.0', startDate: '2026-04-01', endDate: '2026-04-10', color: '#4f6ef7', bgColor: 'rgba(79,110,247,.15)', status: 'active', meta: '5 tickets' },
    { id: '2', label: 'Release v1.1', startDate: '2026-04-08', endDate: '2026-04-18', color: '#22c55e', bgColor: 'rgba(34,197,94,.15)', status: 'planned', meta: '3 tickets' },
    { id: '3', label: 'Hotfix', startDate: '2026-04-05', endDate: '2026-04-07', color: '#ef4444', bgColor: 'rgba(239,68,68,.15)', status: 'done', meta: '1 ticket' },
  ];

  const dualItems = [
    { value: 'apple', label: 'Apple' }, { value: 'banana', label: 'Banana' },
    { value: 'cherry', label: 'Cherry' }, { value: 'date', label: 'Date' },
    { value: 'elderberry', label: 'Elderberry' }, { value: 'fig', label: 'Fig' },
    { value: 'grape', label: 'Grape' }, { value: 'honeydew', label: 'Honeydew' },
  ];

  return (
    <div style={{ background: 'var(--bg,#0d0d10)', color: 'var(--tx,#e4e4ef)', minHeight: '100vh', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--tx,#e4e4ef)', marginBottom: 4 }}>
            @worksuite/ui
          </h1>
          <p style={{ fontSize: 14, color: 'var(--tx3,#50506a)' }}>
            Component library — {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <Badge color="accent">14 componentes</Badge>
            <Badge color="purple">packages/ui</Badge>
            <Badge color="green">Dark + Light</Badge>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* ══ DESIGN SYSTEM — CARBON LOGIC (STITCH) ══════════════ */}
        {/* ══════════════════════════════════════════════════════════ */}
        <div style={{ marginBottom: 60, padding: '32px', background: '#0e0e0e', borderRadius: 12, border: '1px solid rgba(66,71,83,0.15)' }}>
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4d8eff', textTransform: 'uppercase', letterSpacing: '0.2em' }}>The Philosophy</span>
            <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: '#e5e2e1', marginTop: 4 }}>Kinetic Monolithism</h2>
            <p style={{ color: '#c2c6d6', marginTop: 8, fontSize: 14, maxWidth: 600, lineHeight: 1.6 }}>
              Carbon Logic rejects traditional structural lines. We use <span style={{ color: '#4d8eff' }}>Tonal Layering</span> to create focus. The UI feels carved from a single block of dark material, with light and data emerging from depth.
            </p>
          </div>

          {/* ── Tonal Depth Palette ── */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 18, fontWeight: 500, color: '#e5e2e1', marginBottom: 8 }}>Tonal Depth</h3>
            <p style={{ fontSize: 12, color: '#8c909f', marginBottom: 16 }}>Defining the palette of the Monolith.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
              {[
                { name: 'Background', hex: '#131313', bg: '#131313' },
                { name: 'Void', hex: '#0E0E0E', bg: '#0e0e0e' },
                { name: 'Elevated', hex: '#1C1B1B', bg: '#1c1b1b' },
                { name: 'Electric Blue', hex: '#4D8EFF', bg: 'linear-gradient(135deg, #adc6ff, #4d8eff)' },
                { name: 'Secondary', hex: '#4AE176', bg: 'linear-gradient(135deg, #4ae176, #00b954)' },
                { name: 'Tertiary', hex: '#DDB7FF', bg: 'linear-gradient(135deg, #ddb7ff, #b76dff)' },
              ].map(c => (
                <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ height: 80, borderRadius: 8, background: c.bg, border: '1px solid rgba(66,71,83,0.1)' }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#e5e2e1' }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: '#8c909f', fontFamily: 'monospace' }}>{c.hex}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Typography ── */}
          <div style={{ marginBottom: 32, padding: 24, background: '#1c1b1b', borderRadius: 8, border: '1px solid rgba(66,71,83,0.15)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 500, color: '#e5e2e1', marginBottom: 16 }}>Editorial Typography</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4d8eff', textTransform: 'uppercase', letterSpacing: '0.3em', display: 'block', marginBottom: 8 }}>Display (Semi-Bold -0.02em)</span>
                <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: '-0.02em', color: '#e5e2e1' }}>Hyper Precise.</div>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4d8eff', textTransform: 'uppercase', letterSpacing: '0.3em', display: 'block', marginBottom: 8 }}>Headline (Medium -0.01em)</span>
                <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em', color: '#e5e2e1' }}>The future of technical logistics.</div>
              </div>
              <div style={{ display: 'flex', gap: 32 }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#4d8eff', textTransform: 'uppercase', letterSpacing: '0.3em', display: 'block', marginBottom: 4 }}>Label (Bold)</span>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#e5e2e1' }}>META DATA 102.4</div>
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#4d8eff', textTransform: 'uppercase', letterSpacing: '0.3em', display: 'block', marginBottom: 4 }}>Body (Regular)</span>
                  <div style={{ fontSize: 14, fontWeight: 400, color: '#c2c6d6' }}>Readable text for dark backgrounds.</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Buttons ── */}
          <div style={{ marginBottom: 32, padding: 24, background: '#1c1b1b', borderRadius: 8, border: '1px solid rgba(66,71,83,0.15)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'rgba(77,142,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>Radiant Controls — Buttons</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button style={{ width: '100%', background: 'linear-gradient(135deg, #adc6ff, #4d8eff)', color: '#00285d', fontWeight: 700, padding: '12px 0', borderRadius: 8, border: 'none', fontSize: 14, boxShadow: '0 0 20px rgba(77,142,255,0.15)', cursor: 'pointer' }}>Primary Default</button>
                <button style={{ width: '100%', background: 'linear-gradient(135deg, #adc6ff, #4d8eff)', color: '#00285d', fontWeight: 700, padding: '12px 0', borderRadius: 8, border: 'none', fontSize: 14, opacity: 0.9, transform: 'scale(0.98)', cursor: 'pointer' }}>Primary Active</button>
                <button style={{ width: '100%', background: 'rgba(42,42,42,0.4)', color: 'rgba(194,198,214,0.4)', fontWeight: 700, padding: '12px 0', borderRadius: 8, border: 'none', fontSize: 14, cursor: 'not-allowed' }}>Primary Disabled</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button style={{ width: '100%', background: '#2a2a2a', color: '#e5e2e1', fontWeight: 500, padding: '12px 0', borderRadius: 8, border: 'none', fontSize: 14, cursor: 'pointer' }}>Secondary</button>
                <button style={{ width: '100%', background: 'transparent', color: '#c2c6d6', fontWeight: 500, padding: '12px 0', borderRadius: 8, border: '1px solid rgba(66,71,83,0.3)', fontSize: 14, cursor: 'pointer' }}>Ghost Action</button>
                <button style={{ width: '100%', background: 'linear-gradient(135deg, #4ae176, #00b954)', color: '#00285d', fontWeight: 700, padding: '12px 0', borderRadius: 8, border: 'none', fontSize: 14, cursor: 'pointer' }}>Approve</button>
              </div>
            </div>
          </div>

          {/* ── Semantic Chips ── */}
          <div style={{ marginBottom: 32, padding: 24, background: '#1c1b1b', borderRadius: 8, border: '1px solid rgba(66,71,83,0.15)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'rgba(77,142,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Semantic Chips</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 12px', background: 'rgba(77,142,255,0.1)', color: '#adc6ff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: 9999 }}>Active Node</span>
              <span style={{ padding: '4px 12px', background: 'rgba(74,225,118,0.1)', color: '#4ae176', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: 9999 }}>On Track</span>
              <span style={{ padding: '4px 12px', background: 'rgba(255,180,171,0.1)', color: '#ffb4ab', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: 9999 }}>Warning</span>
              <span style={{ padding: '4px 12px', background: 'rgba(221,183,255,0.1)', color: '#ddb7ff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: 9999 }}>Synchronizing</span>
            </div>
          </div>

          {/* ── Iconography ── */}
          <div style={{ padding: 32, background: '#0e0e0e', borderRadius: 8 }}>
            <h3 style={{ fontSize: 18, fontWeight: 500, color: '#e5e2e1', marginBottom: 4 }}>Iconography</h3>
            <p style={{ fontSize: 12, color: '#8c909f', marginBottom: 20 }}>Material Symbols Outlined — weight 300, filled on interaction.</p>
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20 }}>
              {['dashboard','monitoring','terminal','layers','database','hub','rocket_launch','developer_board','schedule','group','warning','settings'].map(icon => (
                <div key={icon} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#c2c6d6', fontFamily: 'Material Symbols Outlined', fontVariationSettings: "'FILL' 0, 'wght' 300" }}>{icon}</span>
                  <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>{icon}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Btn ─────────────────────────────────────────────────── */}
        <Section title="Btn" description="Botón principal con variantes, tamaños y estado loading. Usa style como string inline (zero-dependency CSS).">
          <Row label="Variantes">
            {[
              { v: 'primary', bg: 'var(--ws-accent,#6366f1)', c: '#fff', bd: 'none' },
              { v: 'ghost', bg: 'var(--ws-surface-2,#1e2438)', c: 'var(--ws-text-2,#94a3b8)', bd: '1px solid var(--ws-border)' },
              { v: 'success', bg: 'var(--ws-green-bg)', c: 'var(--ws-green,#4ade80)', bd: '1px solid rgba(74,222,128,.3)' },
              { v: 'warn', bg: 'var(--ws-amber-bg)', c: 'var(--ws-amber,#fbbf24)', bd: '1px solid rgba(251,191,36,.3)' },
              { v: 'danger', bg: 'var(--ws-red-bg)', c: 'var(--ws-red,#f87171)', bd: '1px solid rgba(248,113,113,.3)' },
              { v: 'outline', bg: 'transparent', c: 'var(--ws-accent,#6366f1)', bd: '1px solid var(--ws-accent,#6366f1)' },
            ].map(b => (
              <button key={b.v} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, fontWeight: 600, fontSize: 13, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit', background: b.bg, color: b.c, border: b.bd }}>{b.v}</button>
            ))}
          </Row>
          <Row label="Tamaños (sm / md / lg)">
            {[{s:'sm',f:11,p:'4px 11px'},{s:'md',f:13,p:'8px 16px'},{s:'lg',f:14,p:'10px 20px'}].map(b=>(
              <button key={b.s} style={{display:'inline-flex',alignItems:'center',gap:5,borderRadius:8,fontWeight:600,fontSize:b.f,padding:b.p,cursor:'pointer',fontFamily:'inherit',background:'var(--ws-accent,#6366f1)',color:'#fff',border:'none'}}>{b.s}</button>
            ))}
          </Row>
          <Row label="Import"><Code>{'import { Btn } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── Avatar ──────────────────────────────────────────────── */}
        <Section title="Avatar" description="Iniciales circulares con color configurable.">
          <Row label="Variantes">
            <Avatar initials="IZ" name="Ignacio Zitare" />
            <Avatar initials="JD" color="#ef4444" />
            <Avatar initials="AB" color="#22c55e" size={40} />
            <Avatar initials="XY" color="#f59e0b" size={24} />
          </Row>
          <Row label="Import"><Code>{'import { Avatar } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── Badge ───────────────────────────────────────────────── */}
        <Section title="Badge" description="Etiquetas de estado con colores semánticos.">
          <Row label="Colores">
            <Badge color="accent">Accent</Badge>
            <Badge color="green">Green</Badge>
            <Badge color="red">Red</Badge>
            <Badge color="amber">Amber</Badge>
            <Badge color="purple">Purple</Badge>
            <Badge color="blue">Blue</Badge>
            <Badge color="gray">Gray</Badge>
          </Row>
          <Row label="Import"><Code>{'import { Badge } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── Chip ────────────────────────────────────────────────── */}
        <Section title="Chip" description="Chips compactos para tags y filtros.">
          <Row label="Ejemplo">
            <Chip>Default chip</Chip>
          </Row>
          <Row label="Import"><Code>{'import { Chip } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── StatBox ─────────────────────────────────────────────── */}
        <Section title="StatBox" description="Caja de estadística con label y valor.">
          <Row label="Ejemplo">
            <StatBox label="Total horas" value="142.5h" />
            <StatBox label="Releases" value="8" />
            <StatBox label="Bugs abiertos" value="3" />
          </Row>
          <Row label="Import"><Code>{'import { StatBox } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── Divider ─────────────────────────────────────────────── */}
        <Section title="Divider" description="Línea separadora horizontal.">
          <div>Contenido arriba</div>
          <Divider />
          <div>Contenido abajo</div>
          <Row label="Import"><Code>{'import { Divider } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── Modal ───────────────────────────────────────────────── */}
        <Section title="Modal + ConfirmModal" description="Overlays modales para formularios y confirmaciones.">
          <Row label="Ejemplo">
            <button onClick={() => setModal(true)} style={{padding:'8px 16px',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit',background:'var(--ws-accent,#6366f1)',color:'#fff',border:'none'}}>Abrir Modal</button>
            <button onClick={() => setConfirm(true)} style={{padding:'8px 16px',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit',background:'var(--ws-red-bg,rgba(248,113,113,.12))',color:'var(--ws-red,#f87171)',border:'1px solid rgba(248,113,113,.3)'}}>Abrir ConfirmModal</button>
          </Row>
          {modal && (
            <Modal title="Modal de ejemplo" onClose={() => setModal(false)}>
              <p style={{ color: 'var(--tx3)', fontSize: 13 }}>Contenido del modal. Haz click fuera o en ✕ para cerrar.</p>
              <div style={{ marginTop: 12 }}><button onClick={() => setModal(false)} style={{padding:'8px 16px',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit',background:'var(--ws-accent,#6366f1)',color:'#fff',border:'none'}}>Aceptar</button></div>
            </Modal>
          )}
          {confirm && (
            <ConfirmModal
              message="Esta acción no se puede deshacer. ¿Continuar?"
              onConfirm={() => { setConfirm(false); alert('Confirmado!'); }}
              onCancel={() => setConfirm(false)}
            />
          )}
          <Row label="Import"><Code>{'import { Modal, ConfirmModal } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── DateRangePicker ─────────────────────────────────────── */}
        <Section title="DateRangePicker" description="Selector de rango de fechas con calendario popover. Bordes dorados. Soporta showTime y maxDurationHours.">
          <Row label="Con hora (Environments)">
            <div style={{ width: 400 }}>
              <DateRangePicker
                startValue={dateStart}
                endValue={dateEnd}
                onChange={(s, e) => { setDateStart(s); setDateEnd(e); }}
                maxDurationHours={48}
                showTime={true}
                labels={{ start: 'Inicio', end: 'Fin' }}
              />
            </div>
          </Row>
          <Row label="Solo fecha (Deploy Planner)">
            <div style={{ width: 300 }}>
              <DateRangePicker
                startValue=""
                endValue=""
                onChange={() => {}}
                showTime={false}
                labels={{ start: 'Start', end: 'End' }}
              />
            </div>
          </Row>
          <Row label="Import"><Code>{'import { DateRangePicker } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── DualPanelPicker ─────────────────────────────────────── */}
        <Section title="DualPanelPicker" description="Selector dual-panel con drag & drop. Click o arrastra items entre paneles. Dedup automático.">
          <DualPanelPicker
            label="Frutas favoritas"
            allItems={dualItems}
            selected={dualSelected}
            onAdd={v => setDualSelected(s => [...s, v])}
            onRemove={v => setDualSelected(s => s.filter(x => x !== v))}
          />
          <Row label="Import"><Code>{'import { DualPanelPicker } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── StatusManager ───────────────────────────────────────── */}
        <Section title="StatusManager" description="CRUD + drag-reorder de estados. Presentacional — el consumer pasa callbacks de persistencia.">
          <StatusManager
            statuses={statuses}
            categories={[
              { value: 'backlog', label: 'Backlog' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'done', label: 'Done' },
            ]}
            defaultCategory="backlog"
            labels={{ title: 'Estados de ejemplo', hint: 'Arrastra para reordenar', newStatus: 'Nuevo estado', placeholder: 'Nombre…' }}
            onCreate={async (draft) => {
              const created = { ...draft, id: Math.random().toString(36).slice(2), ord: statuses.length };
              setStatuses(s => [...s, created]);
              return created;
            }}
            onUpdate={async (id, patch) => setStatuses(s => s.map(x => x.id === id ? { ...x, ...patch } : x))}
            onDelete={async (id) => setStatuses(s => s.filter(x => x.id !== id))}
            onReorder={async () => {}}
            onChange={setStatuses}
          />
          <Row label="Import"><Code>{'import { StatusManager } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── GanttTimeline ───────────────────────────────────────── */}
        <Section title="GanttTimeline" description="Chart Gantt interactivo con zoom, drag, groups. Usado en Deploy Planner y Environments.">
          <div style={{ border: '1px solid var(--bd,#2a2a38)', borderRadius: 8, overflow: 'hidden' }}>
            <GanttTimeline bars={ganttBars} onBarClick={(id) => alert(`Clicked: ${id}`)} />
          </div>
          <Row label="Import"><Code>{'import { GanttTimeline } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── BugIcon ─────────────────────────────────────────────── */}
        <Section title="BugIcon" description="Icono SVG de bug estilo circuit-board. Usado en Deploy Planner para contadores de bugs y subtareas.">
          <Row label="Tamaños y colores">
            <BugIcon size={12} color="#ef4444" />
            <BugIcon size={16} color="#ef4444" />
            <BugIcon size={24} color="#ef4444" />
            <BugIcon size={32} color="#ef4444" />
            <BugIcon size={24} color="#22c55e" />
            <BugIcon size={24} color="#4f6ef7" />
            <BugIcon size={24} color="#f59e0b" />
          </Row>
          <Row label="En contexto">
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
              <BugIcon size={12} color="#ef4444" /> 3/5
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
              <BugIcon size={12} color="#22c55e" /> 5/5
            </span>
          </Row>
          <Row label="Import"><Code>{'import { BugIcon } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── TimerBar ────────────────────────────────────────────── */}
        <Section title="TimerBar" description="Barra de progreso temporal con controles de moderador. Usada en RetroBoard para fases temporizadas. Usa Btn internamente (style-as-string).">
          <Row label="Preview">
            <div style={{ width: '100%', padding: '10px 16px', background: 'var(--sf2,#1b1b22)', borderRadius: 8, border: '1px solid var(--bd,#2a2a38)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#4ade80', fontFamily: 'monospace' }}>03:00</span>
                <div style={{ flex: 1 }}>
                  <div style={{ background: 'var(--sf,#141418)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: '60%', height: '100%', background: '#4ade80', borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)', marginTop: 4 }}>Duration: 5 min</div>
                </div>
                <button style={{ padding: '4px 11px', borderRadius: 8, fontWeight: 600, fontSize: 11, background: 'rgba(74,222,128,.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,.3)', cursor: 'pointer', fontFamily: 'inherit' }}>Start</button>
              </div>
            </div>
          </Row>
          <Row label="Props">
            <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)' }}>timer, setTimer, running, setRunning, isMod, phaseMins, setPhaseMins, onNext?, nextLabel?</div>
          </Row>
          <Row label="Import"><Code>{'import { TimerBar } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── JiraTicketSearch / JiraTicketPicker ──────────────────── */}
        <Section title="JiraTicketSearch + JiraTicketPicker" description="Componentes de búsqueda y selección de tickets Jira. Requieren datos reales (no renderizables sin backend).">
          <Row label="JiraTicketSearch">
            <div style={{ padding: '12px 16px', background: 'var(--sf2,#1b1b22)', borderRadius: 8, border: '1px solid var(--bd,#2a2a38)', fontSize: 12, color: 'var(--tx3,#50506a)' }}>
              Autocomplete de tickets Jira — requiere callback <Code>onSearch</Code> conectado al API
            </div>
          </Row>
          <Row label="JiraTicketPicker">
            <div style={{ padding: '12px 16px', background: 'var(--sf2,#1b1b22)', borderRadius: 8, border: '1px solid var(--bd,#2a2a38)', fontSize: 12, color: 'var(--tx3,#50506a)' }}>
              Lista pre-cargada + multiselect — requiere array de <Code>tickets</Code> del API
            </div>
          </Row>
          <Row label="Import"><Code>{'import { JiraTicketSearch, JiraTicketPicker } from "@worksuite/ui"'}</Code></Row>
        </Section>

        {/* ── App shell components (apps/web/src/shared/ui) ───────── */}
        <div style={{ marginTop: 60, marginBottom: 20, padding: '12px 16px', background: 'var(--sf2,#1b1b22)', borderRadius: 8, border: '1px solid var(--bd,#2a2a38)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx,#e4e4ef)', marginBottom: 4 }}>Shell components</h2>
          <p style={{ fontSize: 12, color: 'var(--tx3,#50506a)' }}>
            Top-level layout components used by the WorkSuite shell. Located in <Code>apps/web/src/shared/ui/</Code> (not in <Code>packages/ui</Code> because they depend on app-level state like routing and auth).
          </p>
        </div>

        {/* ── NotificationsBell ───────────────────────────────────── */}
        <Section title="NotificationsBell" description="Bell icon with unread badge + slide-in panel rendered via portal. Receives a NotificationPort via DI so it can be wired to any backend (Supabase, REST, fake repo for tests).">
          <Row label="Demo (in-memory repo, 2 notifications, 1 unread)">
            <NotificationsBell userId="demo-user" repo={demoRepo} />
          </Row>
          <Row label="Props">
            <Code>{'userId: string'}</Code>
            <Code>{'repo: NotificationPort'}</Code>
          </Row>
          <Row label="Import"><Code>{"import { NotificationsBell } from '@/shared/ui/NotificationsBell'"}</Code></Row>
        </Section>

        {/* ── UserMenu ────────────────────────────────────────────── */}
        <Section title="UserMenu" description="Avatar + name button with dropdown menu (Profile / Settings / Log out). Closes on outside click. Logout is the last item, separated and red.">
          <Row label="Demo">
            <UserMenu
              user={{ id: 'demo', name: 'Ignacio Zitare', email: 'ignacio@example.com', avatar: 'IZ' }}
              onLogout={() => alert('Logout clicked')}
            />
          </Row>
          <Row label="Props">
            <Code>{'user: { id, name, email, avatar }'}</Code>
            <Code>{'onLogout: () => void'}</Code>
          </Row>
          <Row label="Import"><Code>{"import { UserMenu } from '@/shared/ui/UserMenu'"}</Code></Row>
        </Section>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--bd,#2a2a38)', paddingTop: 20, marginTop: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: 'var(--tx3,#50506a)' }}>
            @worksuite/ui — packages/ui/src/components/ — {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
