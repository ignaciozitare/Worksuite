// @ts-nocheck
import { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';

interface Props {
  value: string;
  onChange: (icon: string) => void;
  size?: number;
}

/**
 * Curated icon library from Material Symbols Outlined. The full library is
 * 3000+ icons, this is a hand-picked subset of icons useful for task types
 * and project entities. The user clicks the trigger button to open a
 * popover grid and pick one.
 */
const ICONS = [
  // Generic
  'task_alt', 'check_circle', 'radio_button_unchecked', 'flag', 'priority_high',
  'star', 'bookmark', 'label', 'category', 'inventory_2',
  // Bug / quality
  'bug_report', 'pest_control', 'warning', 'error', 'verified',
  // Feature / build
  'lightbulb', 'rocket_launch', 'auto_awesome', 'construction', 'build',
  'extension', 'api', 'memory', 'precision_manufacturing', 'developer_mode',
  // Code
  'code', 'terminal', 'integration_instructions', 'commit', 'merge',
  'fork_right', 'pull_request', 'difference', 'data_object', 'schema',
  // Design / UI
  'design_services', 'palette', 'brush', 'draw', 'color_lens',
  'view_quilt', 'dashboard', 'view_kanban', 'view_timeline', 'view_module',
  // Docs / content
  'description', 'article', 'edit_note', 'edit_document', 'book',
  'menu_book', 'auto_stories', 'sticky_note_2', 'note',
  // People / collaboration
  'person', 'group', 'groups', 'support_agent', 'forum', 'chat',
  'mark_unread_chat_alt', 'rate_review', 'reviews',
  // Time
  'schedule', 'event', 'calendar_month', 'calendar_today', 'today',
  'history', 'hourglass_top', 'av_timer', 'timer',
  // Money
  'payments', 'sell', 'shopping_cart', 'receipt_long', 'request_quote',
  'attach_money', 'savings', 'credit_card',
  // Communication
  'mail', 'send', 'inbox', 'outbox', 'drafts', 'forward_to_inbox',
  // Analytics
  'analytics', 'monitoring', 'insights', 'trending_up', 'leaderboard',
  'pie_chart', 'bar_chart', 'show_chart',
  // Security
  'lock', 'security', 'shield', 'gpp_good', 'admin_panel_settings',
  'verified_user', 'fingerprint', 'vpn_key',
  // Storage / data
  'database', 'storage', 'cloud', 'folder', 'snippet_folder', 'topic',
  // Misc
  'flash_on', 'bolt', 'whatshot', 'campaign', 'megaphone',
  'celebration', 'workspace_premium', 'military_tech', 'emoji_events',
];

export function IconPicker({ value, onChange, size = 24 }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = search
    ? ICONS.filter(i => i.toLowerCase().includes(search.toLowerCase()))
    : ICONS;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: size + 16, height: size + 16, borderRadius: 8,
          background: 'var(--sf3)', border: '1px solid var(--bd)',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--ac)', fontFamily: 'inherit',
          transition: 'all .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--ac)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--bd)'}>
        <span className="material-symbols-outlined" style={{ fontSize: size }}>
          {value || 'add'}
        </span>
      </button>

      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
          />
          {/* Popover grid */}
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 101,
            width: 320, maxHeight: 360, overflow: 'hidden',
            background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 12,
            boxShadow: '0 16px 48px rgba(0,0,0,.5)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: 10, borderBottom: '1px solid var(--bd)' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
                placeholder={t('vectorLogic.searchIcons')}
                style={{
                  width: '100%', padding: '6px 10px', fontSize: 12, fontFamily: 'inherit',
                  background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
                  color: 'var(--tx)', outline: 'none',
                }} />
            </div>
            <div style={{
              flex: 1, overflowY: 'auto', padding: 8,
              display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4,
            }}>
              {filtered.map(name => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => { onChange(name); setOpen(false); }}
                  style={{
                    width: 34, height: 34, borderRadius: 6,
                    background: value === name ? 'rgba(79,110,247,.15)' : 'transparent',
                    border: value === name ? '1px solid var(--ac)' : '1px solid transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                    color: value === name ? 'var(--ac)' : 'var(--tx2)',
                    fontFamily: 'inherit', transition: 'all .12s',
                  }}
                  onMouseEnter={e => { if (value !== name) { e.currentTarget.style.background = 'var(--sf2)'; e.currentTarget.style.color = 'var(--tx)'; } }}
                  onMouseLeave={e => { if (value !== name) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx2)'; } }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: '20px 0' }}>
                  No icons match "{search}"
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
