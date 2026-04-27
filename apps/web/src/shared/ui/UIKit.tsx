// @ts-nocheck
import React, { useState } from 'react';
import {
  Avatar, Badge, StatBox, Divider, Chip,
  Btn,
  Modal, ConfirmModal,
  GanttTimeline,
  StatusManager,
  DualPanelPicker,
  DateRangePicker,
  MultiSelectDropdown,
  UserAvatar,
  BugIcon,
  Card,
} from '@worksuite/ui';
import { useTranslation } from '@worksuite/i18n';
import { NotificationsBell } from './NotificationsBell';
import { UserMenu } from './UserMenu';
import { AppSwitcher } from './AppSwitcher';
import type { NotificationPort, Notification } from '../domain/ports/NotificationPort';
import '../../WorkSuiteApp.css';

/* ─── Demo data ───────────────────────────────────────────────────────────── */

const demoNotifications: Notification[] = [
  { id: '1', tipo: 'warning', titulo: 'Reminder', mensaje: 'You have 2h of incomplete clock-ins.', leida: false, link: '/chrono?view=incompletos', createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
  { id: '2', tipo: 'info',    titulo: 'Welcome',  mensaje: 'Your account is now active.',          leida: true,  link: null, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
];
const demoRepo: NotificationPort = {
  listByUser: async () => demoNotifications,
  markAsRead: async () => undefined,
};

/* ─── Layout helpers ──────────────────────────────────────────────────────── */

class SafeRender extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 12, background: 'var(--red-dim)', border: '1px solid rgba(224,82,82,.3)', borderRadius: 8, fontSize: 'var(--fs-xs)', color: 'var(--red)' }}>
        Error: {this.state.error?.message || 'Unknown'}
      </div>
    );
    return this.props.children;
  }
}

const Section = ({ id, title, description, usedIn, duplicates, children }) => (
  <div id={id} style={{ marginBottom: 48, scrollMarginTop: 80 }}>
    <h2 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--tx)', marginBottom: 2 }}>{title}</h2>
    {description && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx3)', marginBottom: 8 }}>{description}</p>}
    {usedIn && (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', lineHeight: '18px' }}>Used in:</span>
        {usedIn.map(m => <span key={m} style={{ fontSize: 'var(--fs-2xs)', padding: '1px 7px', borderRadius: 3, background: 'var(--glow)', color: 'var(--ac2)', fontWeight: 600 }}>{m}</span>)}
      </div>
    )}
    {duplicates && (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.08em', lineHeight: '18px' }}>Duplicates:</span>
        {duplicates.map(d => <span key={d} style={{ fontSize: 'var(--fs-2xs)', padding: '1px 7px', borderRadius: 3, background: 'var(--amber-dim)', color: 'var(--amber)', fontWeight: 600 }}>{d}</span>)}
      </div>
    )}
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--bd)' }}><SafeRender>{children}</SafeRender></div>
  </div>
);

const Row = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const Code = ({ children }) => (
  <code style={{ fontSize: 'var(--fs-2xs)', padding: '2px 6px', borderRadius: 4, background: 'var(--sf2)', color: 'var(--purple)', fontFamily: 'var(--mono)' }}>{children}</code>
);

const Swatch = ({ token, value }: { token: string; value: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 8, background: 'var(--sf2)', borderRadius: 6, minWidth: 80 }}>
    <div style={{ width: 32, height: 32, borderRadius: 6, background: value, border: '1px solid var(--bd)' }} />
    <code style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac2)', fontFamily: 'var(--mono)' }}>{token}</code>
    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{value}</span>
  </div>
);

/* ─── TOC ─────────────────────────────────────────────────────────────────── */

const TOC_ITEMS = [
  { id: 'tonal',      label: 'Tonal Depth' },
  { id: 'typography', label: 'Typography' },
  { id: 'tokens',     label: 'CSS Tokens' },
  { id: 'icons',      label: 'Icons' },
  { id: 'btn',        label: 'Btn' },
  { id: 'gradient-btns', label: 'Gradient Buttons' },
  { id: 'glass-btns', label: 'Glass Buttons' },
  { id: 'glow-btns',  label: 'Glow & Pulse' },
  { id: 'css-btns',   label: 'CSS Buttons' },
  { id: 'badge',      label: 'Badge' },
  { id: 'chip',       label: 'Chip' },
  { id: 'css-chips',  label: 'CSS Chips' },
  { id: 'card',       label: 'Card' },
  { id: 'css-cards',  label: 'CSS Cards' },
  { id: 'avatar',     label: 'Avatar' },
  { id: 'statbox',    label: 'StatBox' },
  { id: 'inputs',     label: 'Form Inputs' },
  { id: 'modal',      label: 'Modal' },
  { id: 'css-modal',  label: 'CSS Modal' },
  { id: 'sidebar',    label: 'Sidebars' },
  { id: 'table',      label: 'Tables' },
  { id: 'datepicker', label: 'DateRangePicker' },
  { id: 'dualpanel',  label: 'DualPanelPicker' },
  { id: 'msd',        label: 'MultiSelectDropdown' },
  { id: 'useravatar', label: 'UserAvatar' },
  { id: 'statusmgr',  label: 'StatusManager' },
  { id: 'gantt',      label: 'GanttTimeline' },
  { id: 'bugicon',    label: 'BugIcon' },
  { id: 'minical',    label: 'MiniCalendar' },
  { id: 'kanban',     label: 'Kanban Board' },
  { id: 'ticket-card', label: 'Ticket Cards' },
  { id: 'export-config', label: 'Export Config' },
  { id: 'calendar',   label: 'Calendar Views' },
  { id: 'geo',        label: 'Geolocation' },
  { id: 'expandable-table', label: 'Expandable Table' },
  { id: 'icon-variants', label: 'Icon Variants' },
  { id: 'status-cards', label: 'Status-Colored Cards' },
  { id: 'bento-cards', label: 'Bento Stat Cards' },
  { id: 'charts',     label: 'Charts & Graphs' },
  { id: 'hotdesk',    label: 'HotDesk' },
  { id: 'shell',      label: 'Shell Components' },
];

/* ─── Main ────────────────────────────────────────────────────────────────── */

export function UIKit() {
  const { t } = useTranslation();
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [dualSelected, setDualSelected] = useState(['apple', 'banana']);
  const [msdSelected, setMsdSelected] = useState<string[]>(['apple', 'cherry']);
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
    <div style={{ background: 'var(--bg)', color: 'var(--tx)', minHeight: '100vh', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>

        {/* ══ HEADER ══════════════════════════════════════════════════════ */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ac)', boxShadow: '0 0 10px var(--ac)' }} />
            <h1 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--tx)', letterSpacing: '-0.02em' }}>
              WorkSuite UI Kit
            </h1>
          </div>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx3)' }}>
            Carbon Logic (Stitch) Design System — Living Brandbook
          </p>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <Badge color="accent">@worksuite/ui</Badge>
            <Badge color="purple">Carbon Logic</Badge>
            <Badge color="green">Dark + Light</Badge>
          </div>
        </div>

        {/* ══ TABLE OF CONTENTS ═══════════════════════════════════════════ */}
        <div style={{ marginBottom: 40, padding: 16, background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)' }}>
          <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 10 }}>Index</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {TOC_ITEMS.map(item => (
              <a key={item.id} href={`#${item.id}`} style={{ fontSize: 'var(--fs-2xs)', padding: '3px 10px', borderRadius: 4, background: 'var(--sf2)', color: 'var(--tx2)', textDecoration: 'none', fontWeight: 500, transition: 'var(--ease)' }}>
                {item.label}
              </a>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ══ DESIGN SYSTEM FOUNDATIONS ═══════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em', marginBottom: 20 }}>Foundations</div>

        {/* ── Tonal Depth ── */}
        <Section id="tonal" title="Tonal Depth" description="Carbon Logic uses tonal layering instead of borders. Hierarchy comes from surface depth and glow.">
          <Row label="Surfaces">
            <Swatch token="--bg" value="#0d0d10" />
            <Swatch token="--sf-lowest" value="#0e0e0e" />
            <Swatch token="--sf" value="#141418" />
            <Swatch token="--sf-low" value="#1c1b1b" />
            <Swatch token="--sf2" value="#1b1b22" />
            <Swatch token="--sf3" value="#21212c" />
            <Swatch token="--sf-bright" value="#3a3939" />
          </Row>
          <Row label="Accents">
            <Swatch token="--ac" value="#4f6ef7" />
            <Swatch token="--ac2" value="#7b93ff" />
            <Swatch token="--ac-strong" value="#4d8eff" />
            <Swatch token="--green" value="#3ecf8e" />
            <Swatch token="--amber" value="#f5a623" />
            <Swatch token="--red" value="#e05252" />
            <Swatch token="--purple" value="#b57cf6" />
          </Row>
          <Row label="Text">
            <Swatch token="--tx" value="#e4e4ef" />
            <Swatch token="--tx2" value="#8888a8" />
            <Swatch token="--tx3" value="#50506a" />
          </Row>
          <Row label="Borders">
            <Swatch token="--bd" value="#2a2a38" />
            <Swatch token="--bd2" value="#383850" />
          </Row>
          <Row label="Semantic dim (backgrounds)">
            <Swatch token="--ac-dim" value="rgba(77,142,255,.12)" />
            <Swatch token="--green-dim" value="rgba(74,225,118,.12)" />
            <Swatch token="--red-dim" value="rgba(255,180,171,.12)" />
            <Swatch token="--amber-dim" value="rgba(245,158,11,.12)" />
            <Swatch token="--purple-dim" value="rgba(221,183,255,.12)" />
            <Swatch token="--glow" value="rgba(79,110,247,.12)" />
          </Row>
        </Section>

        {/* ── Typography ── */}
        <Section id="typography" title="Typography" description="Inter font family. Never use pure #FFFFFF for text.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 20, background: 'var(--sf)', borderRadius: 8 }}>
            <div>
              <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em' }}>Display — Semi-Bold 600, -0.02em</span>
              <div style={{ fontSize: 'var(--fs-display)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--tx)', marginTop: 4 }}>Hyper Precise.</div>
            </div>
            <div>
              <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em' }}>Headline — Medium 500, -0.01em</span>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--tx)', marginTop: 4 }}>Technical logistics platform.</div>
            </div>
            <div style={{ display: 'flex', gap: 40 }}>
              <div>
                <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em' }}>Title — Medium 500, 0.01em</span>
                <div style={{ fontSize: 'var(--fs-body)', fontWeight: 500, letterSpacing: '0.01em', color: 'var(--tx)', marginTop: 4 }}>Section heading</div>
              </div>
              <div>
                <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em' }}>Body — Regular 400, 0.01em</span>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 400, letterSpacing: '0.01em', color: 'var(--tx2)', marginTop: 4 }}>Readable body text for dark backgrounds.</div>
              </div>
              <div>
                <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em' }}>Label — Bold 700, ALL-CAPS</span>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx)', marginTop: 4 }}>META DATA 102.4</div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Tokens ── */}
        <Section id="tokens" title="CSS Tokens" description="All variables defined in WorkSuiteApp.css. Dark values shown — light overrides in [data-theme='light'].">
          <Row label="Usage">
            <Code>{'var(--bg), var(--sf), var(--ac), var(--tx), var(--bd), var(--r), var(--r2), var(--ease), var(--shadow)'}</Code>
          </Row>
          <Row label="Radius">
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 40, height: 40, background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <code style={{ fontSize: 'var(--fs-2xs)', color: 'var(--ac2)', fontFamily: 'var(--mono)' }}>--r: 5px</code>
                <code style={{ fontSize: 'var(--fs-2xs)', color: 'var(--ac2)', fontFamily: 'var(--mono)' }}>--r2: 8px</code>
              </div>
              <div style={{ width: 40, height: 40, background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 'var(--r2)' }} />
            </div>
          </Row>
        </Section>

        {/* ── Icons ── */}
        <Section id="icons" title="Icons" description="Material Symbols Outlined — weight 300, filled on interaction. Never use emojis.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
            {['dashboard','monitoring','terminal','layers','database','hub','rocket_launch','developer_board','schedule','group','warning','settings','assignment','event_seat','replay','dns','timer','insights','login','bolt','apartment','map','calendar_month','search'].map(icon => (
              <div key={icon} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 2px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-lg)', color: 'var(--tx2)' }}>{icon}</span>
                <span style={{ fontSize: 'var(--fs-2xs)', fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>{icon}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ══ COMPONENTS — @worksuite/ui ═════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em', marginTop: 40, marginBottom: 20 }}>Components — @worksuite/ui</div>

        {/* ── Btn ── */}
        <Section id="btn" title="Btn" description="Primary button component with variants, sizes, and loading state."
          usedIn={['None yet — available for adoption']}
          duplicates={['.btn-p (primary)', '.btn-g (ghost)', '.btn-exp (export)', '.btn-log (log)', '.b-sub (submit)', '.b-cancel (cancel)', 'RBtn (retro)', '.ch-btn-* (chrono)']}>
          <Row label="Variants">
            <Btn variant="primary">Primary</Btn>
            <Btn variant="ghost">Ghost</Btn>
            <Btn variant="success">Success</Btn>
            <Btn variant="warn">Warn</Btn>
            <Btn variant="danger">Danger</Btn>
            <Btn variant="outline">Outline</Btn>
          </Row>
          <Row label="Sizes">
            <Btn size="sm">Small</Btn>
            <Btn size="md">Medium</Btn>
            <Btn size="lg">Large</Btn>
          </Row>
          <Row label="States">
            <Btn loading>Loading</Btn>
            <Btn disabled>Disabled</Btn>
            <Btn full>Full width</Btn>
          </Row>
          <Row label="Import"><Code>{"import { Btn } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── Gradient Buttons ── */}
        <Section id="gradient-btns" title="Gradient Buttons" description="Primary CTAs across modules. linear-gradient(135deg) + glow shadow. This is the Carbon Logic standard for primary actions."
          usedIn={['hotdesk (.hd-btn-green, .hd-btn-primary)', 'chrono (.ch-btn-amber, .ch-btn-green, .ch-btn-red)', 'deploy-planner (Add Release, VersionPicker)']}>
          <Row label="Primary (blue gradient + glow)">
            <button style={{ background: 'linear-gradient(135deg, var(--ac2), var(--ac))', color: 'var(--ac-on)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px var(--ac-dim)', fontFamily: 'inherit' }}>Primary Action</button>
            <button style={{ background: 'linear-gradient(135deg, var(--ac2), var(--ac))', color: 'var(--ac-on)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px var(--ac-dim)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)' }}>add</span> Add Release
            </button>
          </Row>
          <Row label="Success (green gradient + glow)">
            <button style={{ background: 'linear-gradient(135deg, var(--green), var(--green-strong))', color: 'var(--ac-on)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px var(--green-dim)', fontFamily: 'inherit' }}>Approve</button>
            <button style={{ background: 'linear-gradient(135deg, var(--green), var(--green-strong))', color: 'var(--ac-on)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px var(--green-dim)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)' }}>login</span> Check In
            </button>
          </Row>
          <Row label="Danger (red gradient + glow)">
            <button style={{ background: 'linear-gradient(135deg, var(--danger), var(--danger-strong))', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px var(--red-dim)', fontFamily: 'inherit' }}>Reject</button>
            <button style={{ background: 'linear-gradient(135deg, var(--danger), var(--danger-strong))', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px var(--red-dim)', fontFamily: 'inherit' }}>Cancel Reservation</button>
          </Row>
          <Row label="Purple (tertiary gradient + glow)">
            <button style={{ background: 'linear-gradient(135deg, var(--tertiary), var(--purple-strong))', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px var(--purple-dim)', fontFamily: 'inherit' }}>Delegate</button>
          </Row>
          <Row label="Pattern">
            <Code>{"background: 'linear-gradient(135deg, var(--ac2), var(--ac))'"}</Code>
            <Code>{"boxShadow: '0 4px 20px var(--ac-dim)'"}</Code>
          </Row>
          <Row label="Files">
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)', lineHeight: 1.8 }}>
              <div><Code>modules/hotdesk/ui/HDReserveModal.tsx</Code> — btnPrimary, btnGreen, btnDanger, btnPurple</div>
              <div><Code>modules/hotdesk/ui/HDMapView.tsx</Code> — .hd-btn-green, .hd-btn-primary</div>
              <div><Code>modules/chrono/ui/ChronoPage.tsx</Code> — .ch-btn-amber, .ch-btn-green, .ch-btn-red</div>
              <div><Code>modules/deploy-planner/ui/DeployPlanner.tsx</Code> — Add Release CTA</div>
              <div><Code>modules/deploy-planner/ui/internal/VersionPicker.tsx</Code> — Generate version</div>
            </div>
          </Row>
        </Section>

        {/* ── Glass Buttons ── */}
        <Section id="glass-btns" title="Glass Buttons (Glassmorphism)" description="Secondary/ghost buttons with backdrop-filter blur. Semi-transparent surface + frosted glass effect."
          usedIn={['hotdesk (.hd-btn-ghost)', 'chrono (.ch-btn-ghost)', 'chrono-admin (.ch-btn-ghost)']}>
          <Row label="Glass ghost button">
            <div style={{ padding: 20, background: 'linear-gradient(135deg, var(--ac), var(--purple))', borderRadius: 8 }}>
              <button style={{ background: 'rgba(58,57,57,0.5)', color: 'var(--tx2)', border: '1px solid rgba(42,42,56,0.3)', borderRadius: 6, padding: '9px 18px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', fontFamily: 'inherit', letterSpacing: '.05em', textTransform: 'uppercase' as const }}>Cancel</button>
              <span style={{ width: 8 }} />
              <button style={{ background: 'rgba(58,57,57,0.5)', color: 'var(--tx2)', border: '1px solid rgba(42,42,56,0.3)', borderRadius: 6, padding: '9px 18px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', fontFamily: 'inherit', marginLeft: 8 }}>Secondary</button>
            </div>
          </Row>
          <Row label="Glass navigation arrows">
            <div style={{ display: 'flex', gap: 6, padding: 16, background: 'var(--sf)', borderRadius: 8 }}>
              {['chevron_left', 'chevron_right'].map(icon => (
                <button key={icon} style={{ background: 'rgba(58,57,57,0.5)', border: '1px solid rgba(42,42,56,0.3)', borderRadius: 6, width: 28, height: 28, fontSize: 'var(--fs-body)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx2)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)' }}>{icon}</span>
                </button>
              ))}
            </div>
          </Row>
          <Row label="Glass floating card (container)">
            <div style={{ position: 'relative', padding: 24, background: 'var(--bg)', borderRadius: 8 }}>
              <div style={{ background: 'var(--sf)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--sf-bright)', borderRadius: 10, padding: '12px 16px', maxWidth: 220 }}>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>Floating Card</div>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>backdrop-filter: blur(16px)</div>
              </div>
            </div>
          </Row>
          <Row label="Pattern">
            <Code>{"background: 'rgba(58,57,57,0.5)'"}</Code>
            <Code>{"backdropFilter: 'blur(8px)'"}</Code>
          </Row>
        </Section>

        {/* ── Glow / Pulse Buttons ── */}
        <Section id="glow-btns" title="Glow & Pulse Buttons" description="Buttons with animated glow effects. The green check-in button pulses continuously."
          usedIn={['hotdesk (check-in pulse-green)', 'chrono (pulse-green)', 'deploy-planner (hover glow)']}>
          <Row label="Green pulsing glow (check-in)">
            <div style={{ padding: 20, background: 'var(--sf)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
              <style>{`
                @keyframes uikit-pulse{0%{box-shadow:0 4px 24px var(--green-dim),0 0 0 0 rgba(74,225,118,.5)}70%{box-shadow:0 4px 24px var(--green-dim),0 0 0 16px rgba(74,225,118,0)}100%{box-shadow:0 4px 24px var(--green-dim),0 0 0 0 rgba(74,225,118,0)}}
              `}</style>
              <button style={{ background: 'linear-gradient(135deg, var(--green), var(--green-strong))', color: 'var(--ac-on)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, animation: 'uikit-pulse 2s cubic-bezier(.215,.61,.355,1) infinite' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)' }}>login</span> Check In
              </button>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>animation: hdPulse 2s infinite</span>
            </div>
          </Row>
          <Row label="Hover drop-shadow glow (Deploy Planner)">
            <button
              style={{ background: 'linear-gradient(135deg, var(--ac2), var(--ac))', color: 'var(--ac-on)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px var(--ac-dim)', transition: 'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.filter = 'drop-shadow(0 0 12px var(--ac-dim))'; }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
            >
              Hover me for glow
            </button>
          </Row>
          <Row label="Pattern">
            <Code>{"@keyframes hdPulse{0%{box-shadow:0 0 0 0 rgba(74,225,118,.5)}...}"}</Code>
            <Code>{".pulse-green{animation:hdPulse 2s cubic-bezier(.215,.61,.355,1) infinite}"}</Code>
          </Row>
        </Section>

        {/* ── CSS Buttons ── */}
        <Section id="css-btns" title="CSS Buttons (WorkSuiteApp.css)" description="Flat button classes used across modules. Candidates for migration to gradient Btn variants."
          usedIn={['jira-tracker', 'chrono', 'hotdesk', 'admin', 'deploy-planner']}>
          <Row label=".btn-p — Primary">
            <button className="btn-p" style={{ width: 'auto', padding: '8px 16px' }}>Primary</button>
          </Row>
          <Row label=".btn-g — Ghost">
            <button className="btn-g">Ghost</button>
          </Row>
          <Row label=".btn-exp — Export (green)">
            <button className="btn-exp" style={{ width: 'auto' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)' }}>download</span> Export
            </button>
          </Row>
          <Row label=".btn-log — Log action (blue glow)">
            <button className="btn-log">
              <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)' }}>add</span> Log
            </button>
          </Row>
          <Row label=".b-sub / .b-cancel / .b-danger — Modal actions">
            <button className="b-cancel">Cancel</button>
            <button className="b-sub">Submit</button>
            <button className="b-danger">Danger</button>
          </Row>
        </Section>

        {/* ── Badge ── */}
        <Section id="badge" title="Badge" description="Semantic status labels with color variants."
          usedIn={['deploy-planner (status)', 'chrono (alerts)']}
          duplicates={['.s-b (status badge CSS)', '.r-tag (role tag)', '.an-badge (admin nav)', 'RPriBadge/RRoleBadge (retro)']}>
          <Row label="Colors">
            <Badge color="accent">Accent</Badge>
            <Badge color="green">Green</Badge>
            <Badge color="red">Red</Badge>
            <Badge color="amber">Amber</Badge>
            <Badge color="purple">Purple</Badge>
            <Badge color="blue">Blue</Badge>
            <Badge color="gray">Gray</Badge>
          </Row>
          <Row label="Import"><Code>{"import { Badge } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── Chip ── */}
        <Section id="chip" title="Chip" description="Compact tags for filters and toggles."
          usedIn={['None yet']}
          duplicates={['.chip (CSS)', '.pill (filter pills)', '.t-pill (time pill)']}>
          <Row label="States">
            <Chip>Default</Chip>
            <Chip active>Active</Chip>
            <Chip onClick={() => {}}>Clickable</Chip>
          </Row>
          <Row label="Import"><Code>{"import { Chip } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── CSS Chips ── */}
        <Section id="css-chips" title="CSS Chips & Pills (WorkSuiteApp.css)" description="Inline status indicators used across modules."
          usedIn={['jira-tracker', 'chrono', 'hotdesk']}>
          <Row label=".chip — Stats chip">
            <span className="chip"><strong>142.5</strong> hours</span>
            <span className="chip"><strong>8</strong> releases</span>
          </Row>
          <Row label=".pill — Filter pill">
            <span className="pill">All</span>
            <span className="pill on">Active</span>
          </Row>
          <Row label=".s-b — Status badge">
            <span className="s-b s-todo">Todo</span>
            <span className="s-b s-prog">In Progress</span>
            <span className="s-b s-done">Done</span>
          </Row>
          <Row label=".r-tag — Role tags">
            <span className="r-tag r-admin">Admin</span>
            <span className="r-tag r-user">User</span>
          </Row>
        </Section>

        {/* ── Card ── */}
        <Section id="card" title="Card" description="Surface container: default (accent line), stat (glow), glass (blur)."
          usedIn={['UIKit demo']}
          duplicates={['.a-card (admin)', '.hd-card (hotdesk)', '.wlc (worklog card)', 'inline cards in chrono/deploy-planner']}>
          <Row label="Default + custom accent">
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', width: '100%' }}>
              <Card style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--tx)' }}>Default Card</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx3)', marginTop: 6 }}>Top accent line, tonal bg, 8px radius.</div>
              </Card>
              <Card accent="var(--green)" style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--tx)' }}>Green Accent</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx3)', marginTop: 6 }}>Custom accent color on top edge.</div>
              </Card>
            </div>
          </Row>
          <Row label="Stat (radial glow)">
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', width: '100%' }}>
              <Card variant="stat" style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx3)' }}>Hours</div>
                <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--tx)', marginTop: 4 }}>142.5h</div>
              </Card>
              <Card variant="stat" accent="var(--green)" style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx3)' }}>Releases</div>
                <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--green)', marginTop: 4 }}>8</div>
              </Card>
              <Card variant="stat" accent="var(--red)" style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx3)' }}>Bugs</div>
                <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--red)', marginTop: 4 }}>3</div>
              </Card>
            </div>
          </Row>
          <Row label="Glass (backdrop blur)">
            <div style={{ position: 'relative', padding: 20, borderRadius: 10, background: 'linear-gradient(135deg, var(--ac), var(--purple))', overflow: 'hidden' }}>
              <Card variant="glass" style={{ maxWidth: 260 }}>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--tx)' }}>Glass Card</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx2)', marginTop: 6 }}>Semi-transparent + backdrop blur.</div>
              </Card>
            </div>
          </Row>
          <Row label="Import"><Code>{"import { Card } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── CSS Cards ── */}
        <Section id="css-cards" title="CSS Cards (WorkSuiteApp.css)" description="Card patterns from existing modules."
          usedIn={['admin', 'hotdesk', 'jira-tracker']}>
          <Row label=".a-card — Admin card">
            <div className="a-card" style={{ maxWidth: 300 }}>
              <div className="a-ct">Admin Card Title</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx2)' }}>Content inside an admin section card.</div>
            </div>
          </Row>
          <Row label=".hd-card — HotDesk card">
            <div className="hd-card" style={{ maxWidth: 300 }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--tx)' }}>HotDesk Card</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx2)', marginTop: 6 }}>Map container, legend wrapper.</div>
            </div>
          </Row>
          <Row label=".wlc — Worklog card">
            <div className="wlc" style={{ maxWidth: 400 }}>
              <span className="wlk">PROJ-123</span>
              <span className="wls">Implement auth flow</span>
              <div className="wlr">
                <span className="wlt">2h 30m</span>
                <span className="wlm">Yesterday</span>
              </div>
            </div>
          </Row>
        </Section>

        {/* ── Avatar ── */}
        <Section id="avatar" title="Avatar" description="Circular initials with configurable color and size."
          usedIn={['topbar (CSS .avatar)', 'UserMenu']}
          duplicates={['.avatar (CSS class in WorkSuiteApp.css)']}>
          <Row label="Variants">
            <Avatar initials="IZ" name="Ignacio Zitare" />
            <Avatar initials="JD" color="var(--red)" />
            <Avatar initials="AB" color="var(--green)" size={40} />
            <Avatar initials="XY" color="var(--amber)" size={24} />
          </Row>
          <Row label="Import"><Code>{"import { Avatar } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── StatBox ── */}
        <Section id="statbox" title="StatBox" description="Metric display box with label, value, and optional icon."
          usedIn={['None yet']}
          duplicates={['ChronoStatCard (chrono)', '.ch-stat classes (chrono CSS)', 'inline stat cards in deploy-planner']}>
          <Row label="Examples">
            <StatBox label="Total hours" value="142.5h" />
            <StatBox label="Releases" value="8" color="var(--green)" />
            <StatBox label="Open bugs" value="3" color="var(--red)" />
          </Row>
          <Row label="Import"><Code>{"import { StatBox } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── Form Inputs ── */}
        <Section id="inputs" title="Form Inputs (CSS)" description="Input classes defined in WorkSuiteApp.css."
          usedIn={['jira-tracker (.fi)', 'admin (.a-inp)', 'modals (.mi)', 'all modules']}>
          <Row label=".fi — Standard input">
            <input className="fi" placeholder="Standard input (.fi)" style={{ maxWidth: 260 }} readOnly />
            <select className="fi" style={{ maxWidth: 160 }}><option>Select (.fi)</option></select>
          </Row>
          <Row label=".mi — Modal input">
            <input className="mi" placeholder="Modal input (.mi)" style={{ maxWidth: 260 }} readOnly />
            <input className="mi err" placeholder="Error state (.mi.err)" style={{ maxWidth: 260 }} readOnly />
          </Row>
          <Row label=".a-inp — Admin input">
            <input className="a-inp" placeholder="Admin input (.a-inp)" style={{ maxWidth: 260 }} readOnly />
          </Row>
          <Row label="Labels">
            <div className="fr" style={{ maxWidth: 260 }}>
              <label className="fl">Label (.fl)</label>
              <input className="mi" placeholder="With label" readOnly />
              <span className="fh">Hint text (.fh)</span>
              <span className="em">Error message (.em)</span>
            </div>
          </Row>
        </Section>

        {/* ── Modal (packages/ui) ── */}
        <Section id="modal" title="Modal + ConfirmModal" description="Overlay modals from @worksuite/ui. Now aligned with project variables."
          usedIn={['None yet — available for adoption']}
          duplicates={['.ov + .mb + .mh + .mf (CSS modal system used by all modules)']}>
          <Row label="Actions">
            <Btn variant="primary" onClick={() => setModal(true)}>Open Modal</Btn>
            <Btn variant="danger" onClick={() => setConfirm(true)}>Open ConfirmModal</Btn>
          </Row>
          {modal && (
            <Modal title="Example Modal" onClose={() => setModal(false)}>
              <p style={{ color: 'var(--tx2)', fontSize: 'var(--fs-xs)' }}>This is the @worksuite/ui Modal component. Click outside or the X to close.</p>
              <div style={{ marginTop: 12 }}><Btn onClick={() => setModal(false)}>Accept</Btn></div>
            </Modal>
          )}
          {confirm && (
            <ConfirmModal
              message="This action cannot be undone. Continue?"
              onConfirm={() => { setConfirm(false); }}
              onCancel={() => setConfirm(false)}
              danger
            />
          )}
          <Row label="Import"><Code>{"import { Modal, ConfirmModal } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── CSS Modal ── */}
        <Section id="css-modal" title="CSS Modal System (WorkSuiteApp.css)" description="The modal system currently used by all modules. Classes: .ov, .mb, .mh, .mt, .mc, .mbody, .mf"
          usedIn={['jira-tracker', 'hotdesk', 'chrono', 'deploy-planner', 'environments', 'admin']}>
          <Row label="Structure">
            <div style={{ position: 'relative', maxWidth: 400, width: '100%' }}>
              <div className="mb" style={{ position: 'relative' }}>
                <div className="mh">
                  <span className="mt">Modal Title (.mt)</span>
                  <button className="mc">✕</button>
                </div>
                <div className="mbody">
                  <div className="fr">
                    <label className="fl">Field label</label>
                    <input className="mi" placeholder="Modal input" readOnly />
                  </div>
                </div>
                <div className="mf">
                  <button className="b-cancel">Cancel</button>
                  <button className="b-sub">Submit</button>
                </div>
              </div>
            </div>
          </Row>
          <Row label="Classes">
            <Code>.ov</Code> <Code>.mb</Code> <Code>.mh</Code> <Code>.mt</Code> <Code>.mc</Code> <Code>.mbody</Code> <Code>.mf</Code>
          </Row>
        </Section>

        {/* ── Sidebars ── */}
        <Section id="sidebar" title="Sidebars (CSS)" description="Sidebar implementations across the project. Each module has its own — this is the main duplication area."
          usedIn={['jira-tracker (.sb)', 'admin (.admin-nav)', 'chrono (inline)', 'environments (.ev-sidebar)', 'vector-logic (.vl-sidebar)', 'hotdesk (inline)', 'deploy-planner (TaskSidebar)']}>
          <Row label=".sb — JiraTracker sidebar (248px)">
            <div style={{ width: 248, background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 6, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="sb-lbl">Filters <span className="sb-cnt">3</span></div>
              <div className="sb-s">
                <input className="fi" placeholder="Search..." readOnly />
              </div>
            </div>
          </Row>
          <Row label=".admin-nav — Admin sidebar (196px)">
            <div style={{ width: 196, background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 6, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="admin-nav-t">Admin Panel</div>
              <button className="an-btn active">
                <span className="an-icon material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)' }}>group</span>
                Users
              </button>
              <button className="an-btn">
                <span className="an-icon material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)' }}>settings</span>
                Settings
                <span className="an-badge">3</span>
              </button>
            </div>
          </Row>
          <Row label="All sidebar implementations">
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)', lineHeight: 1.8 }}>
              <div><Code>.sb</Code> JiraTracker filter sidebar — 248px, CSS classes</div>
              <div><Code>.admin-nav</Code> Admin shell nav — 196px, CSS classes</div>
              <div><Code>inline</Code> ChronoPage — ~70 lines, inline styles</div>
              <div><Code>.ev-sidebar</Code> Environments left nav — ~85 lines, CSS classes</div>
              <div><Code>.vl-sidebar</Code> VectorLogic nav — ~45 lines, CSS classes</div>
              <div><Code>inline</Code> HDMapView — ~20 lines, inline styles</div>
              <div><Code>TaskSidebar</Code> DeployPlanner — 468 lines, inline styles, drag-and-drop, search</div>
              <div><Code>RecentTasksSidebar</Code> JiraTracker — 77 lines, inline styles, drag-and-drop</div>
            </div>
          </Row>
        </Section>

        {/* ── Tables ── */}
        <Section id="table" title="Tables (CSS)" description="Table styles from WorkSuiteApp.css."
          usedIn={['jira-tracker (th/td)', 'admin (.ut)', 'hotdesk (.hd-tbl)']}>
          <Row label="Default table (th/td)">
            <table style={{ maxWidth: 500 }}>
              <thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Hours</th></tr></thead>
              <tbody>
                <tr><td><span className="ik">PROJ-1</span></td><td><span className="ism">Auth flow</span></td><td><span className="s-b s-prog">In Progress</span></td><td><span className="hc">2h</span></td></tr>
                <tr><td><span className="ik">PROJ-2</span></td><td><span className="ism">Fix deploy</span></td><td><span className="s-b s-done">Done</span></td><td><span className="hc">1h</span></td></tr>
              </tbody>
            </table>
          </Row>
        </Section>

        {/* ── Divider ── */}
        <Section id="divider" title="Divider" description="Simple separator line."
          usedIn={['Available']}>
          <div style={{ padding: '8px 0' }}>
            <div style={{ color: 'var(--tx2)', fontSize: 'var(--fs-xs)', marginBottom: 4 }}>Content above</div>
            <Divider />
            <div style={{ color: 'var(--tx2)', fontSize: 'var(--fs-xs)', marginTop: 4 }}>Content below</div>
          </div>
          <Row label="Import"><Code>{"import { Divider } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ══ COMPLEX COMPONENTS ═════════════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em', marginTop: 40, marginBottom: 20 }}>Complex Components — @worksuite/ui</div>

        {/* ── DateRangePicker ── */}
        <Section id="datepicker" title="DateRangePicker" description="Date range selector with calendar popover. Supports showTime and maxDurationHours."
          usedIn={['chrono', 'environments', 'deploy-planner']}>
          <Row label="With time">
            <div style={{ width: 400 }}>
              <DateRangePicker startValue={dateStart} endValue={dateEnd} onChange={(s, e) => { setDateStart(s); setDateEnd(e); }} maxDurationHours={48} showTime labels={{ start: 'Start', end: 'End' }} />
            </div>
          </Row>
          <Row label="Date only">
            <div style={{ width: 300 }}>
              <DateRangePicker startValue="" endValue="" onChange={() => {}} showTime={false} labels={{ start: 'Start', end: 'End' }} />
            </div>
          </Row>
          <Row label="Import"><Code>{"import { DateRangePicker } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── DualPanelPicker ── */}
        <Section id="dualpanel" title="DualPanelPicker" description="Dual-panel selector with click or drag between panels."
          usedIn={['environments']}>
          <DualPanelPicker label="Favorite fruits" allItems={dualItems} selected={dualSelected} onAdd={v => setDualSelected(s => [...s, v])} onRemove={v => setDualSelected(s => s.filter(x => x !== v))} />
          <Row label="Import"><Code>{"import { DualPanelPicker } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── MultiSelectDropdown ── */}
        <Section id="msd" title="MultiSelectDropdown" description="Compact dropdown for picking many items, with optional internal search and a max-selections cap."
          usedIn={['vector-logic']}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <MultiSelectDropdown
              triggerLabel="Fruits"
              triggerIcon="nutrition"
              items={dualItems.map(it => ({ id: it.value, label: it.label }))}
              selectedIds={msdSelected}
              onToggle={(id) => setMsdSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])}
              searchable
              searchPlaceholder="Search fruit…"
              maxSelections={4}
              maxReachedTooltip="Already 4 selected"
              emptyText="No fruits"
              noMatchesText="No matches"
            />
          </div>
          <Row label="Import"><Code>{"import { MultiSelectDropdown } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── UserAvatar ── */}
        <Section id="useravatar" title="UserAvatar" description="Renders a user's avatar from initials, an uploaded photo URL, or a preset gradient. Falls back to initials when no avatarUrl is set."
          usedIn={['profile', 'admin', 'topbar', 'vector-logic']}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <UserAvatar user={{ name: 'Ignacio Zitare' }} size={48} />
            <UserAvatar user={{ name: 'Ainhoa Solis', avatarUrl: 'preset:purple' }} size={48} />
            <UserAvatar user={{ name: 'Carlos Ruiz',  avatarUrl: 'preset:green' }} size={48} />
            <UserAvatar user={{ name: 'Elena Martínez', avatarUrl: 'preset:amber' }} size={48} />
            <UserAvatar user={{ name: 'Dev User', avatarUrl: 'preset:teal' }} size={48} />
          </div>
          <Row label="Import"><Code>{"import { UserAvatar } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── StatusManager ── */}
        <Section id="statusmgr" title="StatusManager" description="CRUD + drag-reorder for statuses. Presentational — consumer provides persistence callbacks."
          usedIn={['environments']}>
          <StatusManager
            statuses={statuses}
            categories={[{ value: 'backlog', label: 'Backlog' }, { value: 'in_progress', label: 'In Progress' }, { value: 'done', label: 'Done' }]}
            defaultCategory="backlog"
            labels={{ title: 'Example Statuses', hint: 'Drag to reorder', newStatus: 'New status', placeholder: 'Name...' }}
            onCreate={async (draft) => { const created = { ...draft, id: Math.random().toString(36).slice(2), ord: statuses.length }; setStatuses(s => [...s, created]); return created; }}
            onUpdate={async (id, patch) => setStatuses(s => s.map(x => x.id === id ? { ...x, ...patch } : x))}
            onDelete={async (id) => setStatuses(s => s.filter(x => x.id !== id))}
            onReorder={async () => {}}
            onChange={setStatuses}
          />
          <Row label="Import"><Code>{"import { StatusManager } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── GanttTimeline ── */}
        <Section id="gantt" title="GanttTimeline" description="Interactive Gantt chart with zoom, drag, and groups."
          usedIn={['deploy-planner', 'environments']}>
          <div style={{ border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
            <GanttTimeline bars={ganttBars} onBarClick={(id) => alert(`Clicked: ${id}`)} />
          </div>
          <Row label="Import"><Code>{"import { GanttTimeline } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ── BugIcon ── */}
        <Section id="bugicon" title="BugIcon" description="SVG bug icon. Circuit-board style."
          usedIn={['deploy-planner']}>
          <Row label="Sizes and colors">
            <BugIcon size={12} color="var(--red)" />
            <BugIcon size={16} color="var(--red)" />
            <BugIcon size={24} color="var(--red)" />
            <BugIcon size={24} color="var(--green)" />
            <BugIcon size={24} color="var(--ac)" />
            <BugIcon size={24} color="var(--amber)" />
          </Row>
          <Row label="Import"><Code>{"import { BugIcon } from '@worksuite/ui'"}</Code></Row>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ══ MODULE-SPECIFIC PATTERNS ════════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em', marginTop: 40, marginBottom: 20 }}>Module Patterns — Reusable designs from modules</div>

        {/* ── Mini Calendar ── */}
        <Section id="minical" title="MiniCalendar" description="Compact month calendar for date selection. Supports disabled dates (weekends, past, occupied) and multi-select."
          usedIn={['hotdesk (seat reservation)']}>
          <Row label="Demo">
            <div style={{ width: 260, padding: 12, background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)' }}>
              <div className="mini-cal">
                <div className="mini-day-grid">
                  {['L','M','X','J','V','S','D'].map(d => <div key={d} className="mini-dh">{d}</div>)}
                  {[...Array(2)].map((_, i) => <div key={'e'+i} />)}
                  {Array.from({length: 28}, (_, i) => i + 1).map(d => {
                    const isWe = ((d + 1) % 7) >= 5;
                    const isSel = d === 10 || d === 11 || d === 12;
                    const isOcc = d === 15 || d === 16;
                    let cls = 'mini-day ';
                    if (isWe) cls += 'dis';
                    else if (isSel) cls += 'sel';
                    else if (isOcc) cls += 'occ';
                    else cls += 'avail';
                    return <div key={d} className={cls}>{d}</div>;
                  })}
                </div>
              </div>
            </div>
          </Row>
          <Row label="States">
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="mini-day avail" style={{ width: 28, textAlign: 'center' }}>5</div>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Available</span>
              <div className="mini-day sel" style={{ width: 28, textAlign: 'center' }}>10</div>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Selected</span>
              <div className="mini-day occ" style={{ width: 28, textAlign: 'center' }}>15</div>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Occupied</span>
              <div className="mini-day dis" style={{ width: 28, textAlign: 'center' }}>6</div>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Disabled</span>
            </div>
          </Row>
          <Row label="Import"><Code>{"import { MiniCalendar } from '@/shared/ui/MiniCalendar'"}</Code></Row>
        </Section>

        {/* ── Kanban Board Pattern ── */}
        <Section id="kanban" title="Kanban Board" description="Column-based drag-and-drop board. Two implementations exist — consider extracting shared base."
          usedIn={['vector-logic (KanbanView, 945 lines)', 'retro (RetroBoard, 1196 lines)', 'deploy-planner (release columns)']}
          duplicates={['KanbanView.tsx (vector-logic)', 'RetroBoard.tsx (retro — action items kanban)']}>
          <Row label="Column pattern">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, width: '100%' }}>
              {[
                { title: 'BACKLOG', color: 'var(--tx3)', count: 3 },
                { title: 'IN PROGRESS', color: 'var(--amber)', count: 2 },
                { title: 'REVIEW', color: 'var(--ac)', count: 1 },
                { title: 'DONE', color: 'var(--green)', count: 4 },
              ].map(col => (
                <div key={col.title} style={{ background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 10px', borderBottom: '2px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: col.color }} />
                    <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: col.color }}>{col.title}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{col.count}</span>
                  </div>
                  <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {Array.from({length: Math.min(col.count, 2)}).map((_, i) => (
                      <div key={i} style={{ padding: '8px 10px', background: 'var(--sf2)', borderRadius: 6, border: '1px solid var(--bd)', fontSize: 'var(--fs-2xs)', color: 'var(--tx2)' }}>
                        <div style={{ fontWeight: 600, color: 'var(--tx)', marginBottom: 2 }}>Task {i + 1}</div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--ac2)', fontFamily: 'var(--mono)' }}>PROJ-{100 + i}</span>
                          <span style={{ marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%', background: 'var(--ac)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-2xs)', color: '#fff', fontWeight: 700 }}>IZ</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Row>
          <Row label="Files">
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)', lineHeight: 1.8 }}>
              <div><Code>modules/vector-logic/ui/views/KanbanView.tsx</Code> — 945 lines, full DnD, filters, sort</div>
              <div><Code>modules/retro/ui/RetroBoard.tsx</Code> — 1196 lines, action items kanban, priority badges</div>
              <div><Code>modules/deploy-planner/ui/DeployPlanner.tsx</Code> — Release columns with ticket DnD</div>
            </div>
          </Row>
        </Section>

        {/* ── Deploy Planner Ticket Card ── */}
        <Section id="ticket-card" title="Ticket Card (Deploy Planner)" description="Draggable Jira ticket card with type icon, status chip, and assignment indicator. Used in TaskSidebar and release columns."
          usedIn={['deploy-planner (TaskSidebar, ReleaseCard)']}>
          <Row label="Ticket cards">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
              {[
                { key: 'PROJ-101', summary: 'Fix auth timeout', type: 'bug_report', status: 'In Progress', statusColor: 'var(--amber)', statusBg: 'rgba(245,158,11,.1)' },
                { key: 'PROJ-102', summary: 'Add export to CSV', type: 'auto_stories', status: 'Done', statusColor: 'var(--green)', statusBg: 'rgba(62,207,142,.1)' },
                { key: 'PROJ-103', summary: 'Upgrade dependencies', type: 'task_alt', status: 'Backlog', statusColor: 'var(--tx3)', statusBg: 'rgba(140,144,159,.08)' },
              ].map(t => (
                <div key={t.key} style={{ padding: '8px 10px', background: 'var(--sf2)', borderRadius: 6, border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)', color: t.type === 'bug_report' ? 'var(--red)' : 'var(--tx3)' }}>{t.type}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.summary}</div>
                    <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--ac2)', fontFamily: 'var(--mono)', marginTop: 1 }}>{t.key}</div>
                  </div>
                  <span style={{ fontSize: 'var(--fs-2xs)', padding: '2px 6px', borderRadius: 3, background: t.statusBg, color: t.statusColor, fontWeight: 600 }}>{t.status}</span>
                </div>
              ))}
            </div>
          </Row>
          <Row label="With drag highlight (drop zone active)">
            <div style={{ padding: '8px 10px', background: 'var(--glow)', borderRadius: 6, border: '1px solid var(--ac)', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 0 12px rgba(79,110,247,.2)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)', color: 'var(--ac2)' }}>task_alt</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: 'var(--tx)' }}>Drop here to assign</div>
              </div>
            </div>
          </Row>
          <Row label="Atoms">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(77,142,255,.12)', border: '1px solid rgba(77,142,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-md)', color: 'var(--ac-strong)' }}>hub</span>
                </div>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>DeployPlannerIcon</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--fs-2xs)', padding: '2px 7px', borderRadius: 3, background: 'var(--sf2)', border: '1px solid var(--bd)', color: 'var(--tx3)' }}>frontend-app</span>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>RepoChip</span>
              </div>
            </div>
          </Row>
          <Row label="Files">
            <Code>modules/deploy-planner/ui/internal/TaskSidebar.tsx</Code>
            <Code>modules/deploy-planner/ui/internal/ReleaseCard.tsx</Code>
            <Code>modules/deploy-planner/ui/internal/atoms.tsx</Code>
          </Row>
        </Section>

        {/* ── Export Config ── */}
        <Section id="export-config" title="Export Config Modal (JiraTracker)" description="Column picker with dual-panel drag-reorder, presets, and filename config for CSV export."
          usedIn={['jira-tracker']}>
          <Row label="Pattern (simplified)">
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <div style={{ flex: 1, background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Available fields</div>
                <input className="fi" placeholder="Search fields..." readOnly style={{ marginBottom: 8 }} />
                {['Issue Key', 'Summary', 'Status', 'Assignee', 'Story Points', 'Labels'].map(f => (
                  <div key={f} style={{ padding: '5px 8px', fontSize: 'var(--fs-2xs)', color: 'var(--tx2)', cursor: 'pointer', borderRadius: 4, marginBottom: 2 }}>{f}</div>
                ))}
              </div>
              <div style={{ flex: 1, background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Selected (drag to reorder)</div>
                {['Issue Key', 'Summary', 'Hours'].map((f, i) => (
                  <div key={f} style={{ padding: '5px 8px', fontSize: 'var(--fs-2xs)', color: 'var(--tx)', background: 'var(--glow)', borderRadius: 4, marginBottom: 4, border: '1px solid rgba(79,110,247,.2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)', color: 'var(--tx3)' }}>drag_indicator</span>
                    {f}
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>✕</span>
                  </div>
                ))}
              </div>
            </div>
          </Row>
          <Row label="File"><Code>modules/jira-tracker/ui/ExportConfigModal.tsx</Code> — 336 lines</Row>
        </Section>

        {/* ── Calendar Views ── */}
        <Section id="calendar" title="Calendar Views (JiraTracker)" description="Month and week calendar with worklog data, drag-drop, and stats. Supports day click and worklog creation."
          usedIn={['jira-tracker (CalendarView)']}>
          <Row label="Month grid pattern (.cgrid + .cc cells)">
            <div style={{ width: '100%' }}>
              <div className="cgrid">
                {['L','M','X','J','V','S','D'].map(d => <div key={d} className="cdh">{d}</div>)}
                {Array.from({length: 7}).map((_, i) => {
                  const day = i + 14;
                  const isToday = i === 2;
                  const hasData = i === 1 || i === 3 || i === 4;
                  return (
                    <div key={i} className={`cc ${isToday ? 'today' : ''} ${hasData ? 'has-d' : ''}`} style={{ minHeight: 70 }}>
                      <div className="ctop">
                        <span className="cday">{day}</span>
                        <span className="cadd">+</span>
                      </div>
                      {hasData && <div className="chrs">3<span>h</span></div>}
                      {hasData && <div className="cdots"><span className="cdot">PROJ-10</span></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </Row>
          <Row label="Drag-over state">
            <div className="cc drag-over" style={{ minHeight: 70, width: 120 }}>
              <div className="ctop"><span className="cday">18</span></div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--ac2)', textAlign: 'center', marginTop: 8 }}>Drop here</div>
            </div>
          </Row>
          <Row label="File"><Code>modules/jira-tracker/ui/CalendarView.tsx</Code> — 326 lines, month + week views</Row>
        </Section>

        {/* ── Geolocation Widget ── */}
        <Section id="geo" title="Geolocation Widget (Chrono)" description="Shows current time, date, and reverse-geocoded city name from browser location."
          usedIn={['chrono (DashboardView)']}>
          <Row label="Pattern">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--tx)', fontFamily: 'var(--mono)' }}>14:32</div>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Domingo, 20 abril</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'var(--bd)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)', color: 'var(--ac2)' }}>location_on</span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx2)' }}>Madrid, Spain</span>
              </div>
            </div>
          </Row>
          <Row label="File"><Code>modules/chrono/ui/views/DashboardView.tsx</Code> — geolocation + reverse geocode via IGeoLocationService</Row>
        </Section>

        {/* ── Expandable Table ── */}
        <Section id="expandable-table" title="Expandable Table (Chrono Admin)" description="Filterable table with inline expandable rows for editing. Supports search, team filter, role filter."
          usedIn={['chrono-admin (EmpleadosView)']}>
          <Row label="Pattern">
            <div style={{ width: '100%', background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr><th>Name</th><th>Team</th><th>Hours/day</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="ism">Ignacio Zitare</span></td>
                    <td><span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)' }}>Engineering</span></td>
                    <td><span className="hc">8h</span></td>
                    <td><span className="s-b s-done">Complete</span></td>
                    <td><span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)', color: 'var(--tx3)', cursor: 'pointer' }}>expand_more</span></td>
                  </tr>
                  <tr>
                    <td colSpan={5} style={{ padding: '12px 14px', background: 'var(--sf2)', borderBottom: '1px solid var(--bd)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div className="fr"><label className="fl">Hours/day</label><input className="mi" defaultValue="8" style={{ width: 60 }} readOnly /></div>
                        <div className="fr"><label className="fl">Vacation days</label><input className="mi" defaultValue="22" style={{ width: 60 }} readOnly /></div>
                        <div className="fr"><label className="fl">Schedule</label><input className="mi" defaultValue="L-V" readOnly /></div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Row>
          <Row label="File"><Code>modules/chrono-admin/ui/views/EmpleadosView.tsx</Code> — 390 lines</Row>
        </Section>

        {/* ── Icons with Color Variants ── */}
        <Section id="icon-variants" title="Icons — Semantic Color Variants" description="Material Symbols used with semantic colors across the app. These are the standard color mappings.">
          <Row label="By semantic meaning">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, width: '100%' }}>
              {[
                { icon: 'check_circle', color: 'var(--green)', label: 'Success' },
                { icon: 'warning', color: 'var(--amber)', label: 'Warning' },
                { icon: 'error', color: 'var(--red)', label: 'Error' },
                { icon: 'info', color: 'var(--ac)', label: 'Info' },
                { icon: 'schedule', color: 'var(--purple)', label: 'Time' },
                { icon: 'person', color: 'var(--tx2)', label: 'Neutral' },
              ].map(i => (
                <div key={i.icon} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 10, background: 'var(--sf)', borderRadius: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-lg)', color: i.color }}>{i.icon}</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', fontWeight: 600 }}>{i.label}</span>
                  <code style={{ fontSize: 'var(--fs-2xs)', color: i.color, fontFamily: 'var(--mono)' }}>{i.icon}</code>
                </div>
              ))}
            </div>
          </Row>
          <Row label="Jira issue types (Deploy Planner)">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { icon: 'bug_report', color: 'var(--red)', label: 'Bug' },
                { icon: 'auto_stories', color: 'var(--green)', label: 'Story' },
                { icon: 'task_alt', color: 'var(--ac)', label: 'Task' },
                { icon: 'bolt', color: 'var(--purple)', label: 'Epic' },
                { icon: 'subdirectory_arrow_right', color: 'var(--tx3)', label: 'Sub-task' },
                { icon: 'trending_up', color: 'var(--amber)', label: 'Improvement' },
              ].map(i => (
                <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)', color: i.color }}>{i.icon}</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)' }}>{i.label}</span>
                </div>
              ))}
            </div>
          </Row>
          <Row label="Module branding icons">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { icon: 'assignment', color: 'var(--ac-strong)', label: 'Jira Tracker' },
                { icon: 'event_seat', color: 'var(--green)', label: 'HotDesk' },
                { icon: 'replay', color: 'var(--purple)', label: 'Retro' },
                { icon: 'rocket_launch', color: 'var(--amber)', label: 'Deploy' },
                { icon: 'dns', color: 'var(--ac2)', label: 'Environments' },
                { icon: 'hub', color: 'var(--ac-strong)', label: 'Vector Logic' },
                { icon: 'timer', color: 'var(--ac-strong)', label: 'Chrono' },
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--sf)', borderRadius: 6, border: '1px solid var(--bd)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-md)', color: m.color }}>{m.icon}</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: 'var(--tx2)' }}>{m.label}</span>
                </div>
              ))}
            </div>
          </Row>
        </Section>

        {/* ── Status-Colored Cards (borderLeft) ── */}
        <Section id="status-cards" title="Status-Colored Cards" description="Cards with a left border that changes color based on status. Used across deploy-planner, environments, chrono, and retro."
          usedIn={['deploy-planner (ReleaseCard)', 'environments (EnvironmentsView)', 'chrono (alerts)', 'retro (team selector)', 'deploy-planner (DeployTimeline)']}>
          <Row label="Release cards — borderLeft changes by status">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', width: '100%' }}>
              {[
                { status: 'Planned', color: '#6b7280', bg: 'rgba(107,114,128,.12)' },
                { status: 'In Progress', color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
                { status: 'Ready', color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
                { status: 'Deployed', color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
                { status: 'Rollback', color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
              ].map(s => (
                <div key={s.status} style={{
                  width: 160,
                  padding: '12px 14px',
                  background: 'var(--sf)',
                  borderRadius: 8,
                  border: '1px solid var(--bd)',
                  borderLeft: `3px solid ${s.color}`,
                  boxShadow: `0 0 0 1px ${s.color}18`,
                }}>
                  <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--tx)', marginBottom: 4 }}>v2.1.0</div>
                  <span style={{ fontSize: 'var(--fs-2xs)', padding: '2px 6px', borderRadius: 3, background: s.bg, color: s.color, fontWeight: 600 }}>{s.status}</span>
                </div>
              ))}
            </div>
          </Row>
          <Row label="Drag-over state (card accepts drop)">
            <div style={{
              width: 180,
              padding: '12px 14px',
              background: 'rgba(79,110,247,.08)',
              borderRadius: 8,
              border: '1px dashed var(--ac)',
              borderLeft: '3px solid var(--ac)',
              transform: 'scale(1.015)',
            }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--tx)' }}>v2.1.0</div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--ac2)', marginTop: 4 }}>Drop ticket here</div>
            </div>
          </Row>
          <Row label="Environment cards — borderLeft by category">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { env: 'DEV-01', cat: 'DEV', color: '#a78bfa' },
                { env: 'PRE-01', cat: 'PRE', color: '#fbbf24' },
                { env: 'STG-01', cat: 'STAGING', color: '#22d3ee' },
              ].map(e => (
                <div key={e.env} style={{
                  width: 140,
                  padding: '10px 12px',
                  background: 'var(--sf)',
                  borderRadius: 6,
                  border: '1px solid var(--bd)',
                  borderLeft: `4px solid ${e.color}`,
                }}>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--tx)' }}>{e.env}</div>
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', marginTop: 2 }}>{e.cat}</div>
                </div>
              ))}
            </div>
          </Row>
          <Row label="Alert card — borderLeft by severity">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 320 }}>
              {[
                { msg: '2 incomplete clock-ins', color: 'var(--red)', icon: 'warning' },
                { msg: 'Hours exceeded this week', color: 'var(--amber)', icon: 'schedule' },
                { msg: 'Vacation approved', color: 'var(--green)', icon: 'check_circle' },
              ].map((a, i) => (
                <div key={i} style={{ padding: '8px 12px', background: 'var(--sf)', borderRadius: 6, border: '1px solid var(--bd)', borderLeft: `3px solid ${a.color}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)', color: a.color }}>{a.icon}</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)' }}>{a.msg}</span>
                </div>
              ))}
            </div>
          </Row>
          <Row label="Pattern">
            <Code>{'borderLeft: `3px solid ${statusConfig.color}`'}</Code>
            <Code>{'boxShadow: `0 0 0 1px ${statusConfig.color}18`'}</Code>
          </Row>
        </Section>

        {/* ── ChronoStatCard / Bento cards ── */}
        <Section id="bento-cards" title="Bento Stat Cards (Chrono)" description="Metric cards with radial glow, icon, value, optional progress bar and sparkline. Accent color drives the entire card theme."
          usedIn={['chrono (DashboardView)', 'chrono (VacacionesView)']}
          duplicates={['StatBox (@worksuite/ui) — simpler version', 'inline stat cards in deploy-planner Metrics']}>
          <Row label="Accent-driven stat cards">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, width: '100%' }}>
              {[
                { label: 'TODAY', value: '6h 45m', accent: 'var(--amber)', icon: 'schedule', pct: 84 },
                { label: 'THIS WEEK', value: '32h', accent: 'var(--ac)', icon: 'date_range', pct: 80 },
                { label: 'HOURS BANK', value: '+12.5h', accent: 'var(--green)', icon: 'account_balance_wallet', pct: 0 },
                { label: 'VACATION', value: '14 days', accent: 'var(--purple)', icon: 'flight', pct: 0 },
              ].map(c => (
                <div key={c.label} style={{ position: 'relative', padding: 16, background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle, ${c.accent}22 0%, transparent 70%)` }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: `${c.accent}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-sm)', color: c.accent }}>{c.icon}</span>
                    </div>
                    <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)' }}>{c.label}</span>
                  </div>
                  <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: c.accent }}>{c.value}</div>
                  {c.pct > 0 && (
                    <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: 'var(--sf3)' }}>
                      <div style={{ width: `${c.pct}%`, height: '100%', borderRadius: 2, background: c.accent }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Row>
          <Row label="With sparkline bars">
            <div style={{ width: 200, padding: 16, background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)' }}>
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 6 }}>LAST 7 DAYS</div>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--ac)', marginBottom: 8 }}>38.2h</div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 24 }}>
                {[60, 80, 45, 90, 100, 30, 70].map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${v}%`, borderRadius: 2, background: 'var(--ac)', opacity: 0.3 + (v / 100) * 0.7 }} />
                ))}
              </div>
            </div>
          </Row>
          <Row label="File"><Code>modules/chrono/ui/components/ChronoStatCard.tsx</Code> — 236 lines</Row>
        </Section>

        {/* ── Charts & Graphs ── */}
        <Section id="charts" title="Charts & Graphs" description="Data visualization patterns used across modules."
          usedIn={['deploy-planner (Metrics)', 'chrono (DashboardView, VacacionesView)', 'hotdesk (OfficeSVG)']}>
          <Row label="Bar chart — monthly releases (Deploy Planner)">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, padding: '8px 12px', background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)' }}>
              {[
                { month: 'Jan', count: 3 },
                { month: 'Feb', count: 5 },
                { month: 'Mar', count: 2 },
                { month: 'Apr', count: 7 },
                { month: 'May', count: 4 },
                { month: 'Jun', count: 6 },
              ].map(m => (
                <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                  <div style={{ width: '100%', height: `${(m.count / 7) * 60}px`, background: 'var(--ac)', borderRadius: '3px 3px 0 0', opacity: 0.7 + (m.count / 7) * 0.3 }} />
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>{m.month}</span>
                </div>
              ))}
            </div>
          </Row>
          <Row label="Horizontal bar chart — ticket types">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 300, padding: '12px 14px', background: 'var(--sf)', borderRadius: 8, border: '1px solid var(--bd)' }}>
              {[
                { type: 'Bug', count: 12, color: 'var(--amber)', max: 20 },
                { type: 'Story', count: 20, color: 'var(--green)', max: 20 },
                { type: 'Task', count: 8, color: 'var(--ac)', max: 20 },
                { type: 'Epic', count: 3, color: 'var(--purple)', max: 20 },
              ].map(t => (
                <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)', width: 40, textAlign: 'right' }}>{t.type}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--sf3)' }}>
                    <div style={{ width: `${(t.count / t.max) * 100}%`, height: '100%', borderRadius: 3, background: t.color }} />
                  </div>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', fontFamily: 'var(--mono)', width: 20 }}>{t.count}</span>
                </div>
              ))}
            </div>
          </Row>
          <Row label="Progress bar with color change (Timer)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 300 }}>
              {[
                { label: '> 60s (green)', pct: 80, color: 'var(--green)' },
                { label: '20-60s (amber)', pct: 45, color: 'var(--amber)' },
                { label: '< 20s (red)', pct: 15, color: 'var(--red)' },
              ].map(p => (
                <div key={p.label}>
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', marginBottom: 2 }}>{p.label}</div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--sf3)' }}>
                    <div style={{ width: `${p.pct}%`, height: '100%', borderRadius: 3, background: p.color, transition: 'width 0.3s' }} />
                  </div>
                </div>
              ))}
            </div>
          </Row>
          <Row label="Stacked bar — vacation distribution">
            <div style={{ width: 300 }}>
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 4 }}>22 vacation days</div>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: '36%', background: 'var(--amber)' }} title="Enjoyed: 8" />
                <div style={{ width: '18%', background: 'var(--green)' }} title="Approved: 4" />
                <div style={{ width: '46%', background: 'var(--ac)' }} title="Available: 10" />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--amber)' }}>Enjoyed 8</span>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--green)' }}>Approved 4</span>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--ac)' }}>Available 10</span>
              </div>
            </div>
          </Row>
          <Row label="Files">
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx2)', lineHeight: 1.8 }}>
              <div><Code>modules/deploy-planner/ui/internal/Metrics.tsx</Code> — bar charts, type distribution, repo counts</div>
              <div><Code>modules/chrono/ui/components/ChronoStatCard.tsx</Code> — progress bar + sparkline</div>
              <div><Code>modules/chrono/ui/views/VacacionesView.tsx</Code> — stacked vacation bar</div>
              <div><Code>packages/ui/src/components/TimerBar.tsx</Code> — timer progress with color change</div>
              <div><Code>packages/ui/src/components/GanttTimeline.tsx</Code> — gantt bars with status colors</div>
              <div><Code>modules/hotdesk/ui/OfficeSVG.tsx</Code> — SVG office map with animated seat states</div>
            </div>
          </Row>
        </Section>

        {/* ── HotDesk Seat Grid + Table ── */}
        <Section id="hotdesk" title="HotDesk Components" description="Seat grid for reservation modal, cell states for the reservation table, and map seat indicators."
          usedIn={['hotdesk (HDReserveModal, HDTableView, BlueprintHDMap)']}>
          <Row label=".seat-grid + .seat-btn">
            <div className="seat-grid" style={{ maxWidth: 300 }}>
              <div className="seat-btn">A-01</div>
              <div className="seat-btn sel">A-02</div>
              <div className="seat-btn is-occ">A-03</div>
              <div className="seat-btn is-fixed">A-04</div>
              <div className="seat-btn">A-05</div>
              <div className="seat-btn">A-06</div>
            </div>
          </Row>
          <Row label=".hd-cell states (table view)">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="hd-cell free" style={{ width: 30, height: 30 }}><div className="hd-cell-dot free" /></div>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Free</span>
              <div className="hd-cell occ" style={{ width: 30, height: 30 }}><div className="hd-cell-dot occ" /></div>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Occupied</span>
              <div className="hd-cell fx" style={{ width: 30, height: 30 }}><div className="hd-cell-dot fx" /></div>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Fixed</span>
              <div className="hd-cell mine" style={{ width: 30, height: 30 }}><div className="hd-cell-dot mine" /></div>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Mine</span>
            </div>
          </Row>
          <Row label="Legend (.hd-legend)">
            <div className="hd-legend">
              <div className="hd-leg"><div className="hd-leg-dot" style={{ background: 'var(--seat-free)' }} />Free</div>
              <div className="hd-leg"><div className="hd-leg-dot" style={{ background: 'var(--seat-occ)' }} />Occupied</div>
              <div className="hd-leg"><div className="hd-leg-dot" style={{ background: 'var(--seat-fixed)' }} />Fixed</div>
              <div className="hd-leg"><div className="hd-leg-dot" style={{ background: 'var(--amber)' }} />Mine</div>
            </div>
          </Row>
          <Row label="Files">
            <Code>modules/hotdesk/ui/HDTableView.tsx</Code>
            <Code>modules/hotdesk/ui/BlueprintHDMap.tsx</Code>
            <Code>modules/hotdesk/ui/HDReserveModal.tsx</Code>
          </Row>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ══ SHELL COMPONENTS ══════════════════════════════════════════ */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <div id="shell" style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.2em', marginTop: 40, marginBottom: 20 }}>Shell Components — apps/web/src/shared/ui/</div>

        {/* ── NotificationsBell ── */}
        <Section id="notif" title="NotificationsBell" description="Bell icon with unread badge + slide-in panel. Receives NotificationPort via DI."
          usedIn={['topbar (WorkSuiteApp)']}>
          <Row label="Demo (in-memory, 2 notifications)">
            <NotificationsBell userId="demo-user" repo={demoRepo} />
          </Row>
          <Row label="Import"><Code>{"import { NotificationsBell } from '@/shared/ui/NotificationsBell'"}</Code></Row>
        </Section>

        {/* ── UserMenu ── */}
        <Section id="usermenu" title="UserMenu" description="Avatar + dropdown menu (Profile / Settings / Log out)."
          usedIn={['topbar (WorkSuiteApp)']}>
          <Row label="Demo">
            <UserMenu user={{ id: 'demo', name: 'Ignacio Zitare', email: 'ignacio@example.com', avatar: 'IZ' }} onLogout={() => {}} />
          </Row>
          <Row label="Import"><Code>{"import { UserMenu } from '@/shared/ui/UserMenu'"}</Code></Row>
        </Section>

        {/* ── AppSwitcher ── */}
        <Section id="appswitcher" title="AppSwitcher" description="Module navigation switcher in the top bar."
          usedIn={['topbar (WorkSuiteApp)']}>
          <Row label="Demo">
            <AppSwitcher currentMod="deploy" userModules={['jt', 'hd', 'retro', 'deploy', 'envtracker', 'vector-logic', 'chrono', 'chrono-admin']} onNavigate={() => {}} />
          </Row>
          <Row label="Import"><Code>{"import { AppSwitcher } from '@/shared/ui/AppSwitcher'"}</Code></Row>
        </Section>

        {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
        <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 20, marginTop: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>
            WorkSuite UI Kit — Carbon Logic (Stitch) — {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
