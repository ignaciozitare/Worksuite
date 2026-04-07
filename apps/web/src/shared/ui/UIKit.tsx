// @ts-nocheck
import { useState } from 'react';
import {
  Btn, Avatar, Badge, StatBox, Divider, Chip,
  Modal, ConfirmModal,
  GanttTimeline,
  TimerBar,
  StatusManager,
  DualPanelPicker,
  DateRangePicker,
} from '@worksuite/ui';

const Section = ({ title, description, children }) => (
  <div style={{ marginBottom: 40 }}>
    <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx,#e4e4ef)', marginBottom: 4, borderBottom: '1px solid var(--bd,#2a2a38)', paddingBottom: 8 }}>{title}</h2>
    {description && <p style={{ fontSize: 12, color: 'var(--tx3,#50506a)', marginBottom: 14 }}>{description}</p>}
    <div style={{ padding: '16px 0' }}>{children}</div>
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

        {/* ── Btn ─────────────────────────────────────────────────── */}
        <Section title="Btn" description="Botón principal con variantes, tamaños y estado loading.">
          <Row label="Variantes">
            <Btn variant="primary">Primary</Btn>
            <Btn variant="ghost">Ghost</Btn>
            <Btn variant="success">Success</Btn>
            <Btn variant="warn">Warn</Btn>
            <Btn variant="danger">Danger</Btn>
            <Btn variant="outline">Outline</Btn>
          </Row>
          <Row label="Tamaños">
            <Btn size="sm">Small</Btn>
            <Btn size="md">Medium</Btn>
            <Btn size="lg">Large</Btn>
          </Row>
          <Row label="Loading">
            <Btn loading>Guardando…</Btn>
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
            <Btn variant="primary" onClick={() => setModal(true)}>Abrir Modal</Btn>
            <Btn variant="danger" onClick={() => setConfirm(true)}>Abrir ConfirmModal</Btn>
          </Row>
          {modal && (
            <Modal title="Modal de ejemplo" onClose={() => setModal(false)}>
              <p style={{ color: 'var(--tx3)', fontSize: 13 }}>Contenido del modal. Haz click fuera o en ✕ para cerrar.</p>
              <div style={{ marginTop: 12 }}><Btn variant="primary" onClick={() => setModal(false)}>Aceptar</Btn></div>
            </Modal>
          )}
          {confirm && (
            <ConfirmModal
              title="¿Confirmar acción?"
              message="Esta acción no se puede deshacer."
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

        {/* ── TimerBar ────────────────────────────────────────────── */}
        <Section title="TimerBar" description="Barra de progreso temporal.">
          <TimerBar />
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
