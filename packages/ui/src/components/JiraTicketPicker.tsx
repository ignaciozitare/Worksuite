import { useState, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JiraTicketOption {
  key:       string;
  summary?:  string;
  issueType?: string;
  status?:   string;
  /** Optional pre-extracted repos — only used to render a preview. */
  repos?:    string[];
  /** Raw issue fields if needed by downstream consumers. */
  fields?:   Record<string, any>;
}

export interface JiraTicketPickerProps {
  /** Pre-fetched list of tickets (already filtered by admin config). */
  tickets: JiraTicketOption[];
  /** Selected issue keys. */
  value: string[];
  /** Called whenever the selection changes, with the full list of selected tickets. */
  onChange: (keys: string[], selectedTickets: JiraTicketOption[]) => void;
  /** Optional loading flag to show a spinner in place of the list. */
  loading?: boolean;
  /** Labels (for i18n). Consumer passes localized strings. */
  labels?: {
    searchPlaceholder?: string;
    empty?:             string;
    loading?:           string;
    selected?:          string;
    noMatches?:         string;
  };
  /** Max items shown in the list (default: 50). */
  maxVisible?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * JiraTicketPicker — hybrid list + search selector.
 *
 * Expects the caller to pass a pre-fetched list of candidate tickets.
 * Renders a search input + scrollable list; click toggles selection.
 * Allows multiple selections.
 *
 * Dependency-injected: transport and filtering logic (which tickets are
 * candidates) live in the consumer.
 */
export function JiraTicketPicker({
  tickets,
  value,
  onChange,
  loading = false,
  labels = {},
  maxVisible = 50,
}: JiraTicketPickerProps) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(t =>
      t.key.toLowerCase().includes(q) ||
      (t.summary ?? '').toLowerCase().includes(q) ||
      (t.issueType ?? '').toLowerCase().includes(q),
    );
  }, [tickets, query]);

  const visible = filtered.slice(0, maxVisible);

  const toggle = (ticket: JiraTicketOption) => {
    const next = selected.has(ticket.key)
      ? value.filter(k => k !== ticket.key)
      : [...value, ticket.key];
    const ticketsByKey = Object.fromEntries(tickets.map(t => [t.key, t]));
    const selectedFull = next.map(k => ticketsByKey[k]).filter(Boolean) as JiraTicketOption[];
    onChange(next, selectedFull);
  };

  const removeSelected = (key: string) => {
    const next = value.filter(k => k !== key);
    const ticketsByKey = Object.fromEntries(tickets.map(t => [t.key, t]));
    const selectedFull = next.map(k => ticketsByKey[k]).filter(Boolean) as JiraTicketOption[];
    onChange(next, selectedFull);
  };

  const selectedTickets = value
    .map(k => tickets.find(t => t.key === k))
    .filter(Boolean) as JiraTicketOption[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Selected chips */}
      {selectedTickets.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6,
          background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
          borderRadius: 6,
        }}>
          {selectedTickets.map(t => (
            <span key={t.key} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
              background: 'rgba(124,58,237,.15)', color: '#a78bfa', borderRadius: 6,
              fontSize: 11, fontFamily: 'monospace', maxWidth: 260, overflow: 'hidden',
            }}>
              <strong>{t.key}</strong>
              {t.summary && (
                <span style={{
                  fontSize: 10, opacity: .8, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150,
                }}>{t.summary}</span>
              )}
              <span
                onClick={() => removeSelected(t.key)}
                style={{ cursor: 'pointer', opacity: .7, flexShrink: 0, padding: '0 2px' }}
              >×</span>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={labels.searchPlaceholder ?? 'Search…'}
        style={{
          width: '100%', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
          background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
          borderRadius: 6, color: 'var(--tx,#e4e4ef)', outline: 'none',
        }}
      />

      {/* List */}
      <div style={{
        maxHeight: 240, overflowY: 'auto',
        background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
        borderRadius: 6,
      }}>
        {loading ? (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--tx3,#50506a)' }}>
            {labels.loading ?? 'Loading…'}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--tx3,#50506a)' }}>
            {query.trim()
              ? (labels.noMatches ?? 'No matches')
              : (labels.empty ?? 'No tickets available')}
          </div>
        ) : visible.map(t => {
          const isSelected = selected.has(t.key);
          return (
            <div
              key={t.key}
              onClick={() => toggle(t)}
              style={{
                padding: '8px 12px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 8, fontSize: 12,
                borderBottom: '1px solid var(--bd,#2a2a38)',
                background: isSelected ? 'rgba(124,58,237,.08)' : 'transparent',
                transition: 'background .1s',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,.03)'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                readOnly
                style={{ flexShrink: 0, cursor: 'pointer' }}
              />
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>{t.key}</span>
              {t.issueType && (
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--sf,#141418)', color: 'var(--tx3,#50506a)', flexShrink: 0,
                }}>{t.issueType}</span>
              )}
              {t.status && (
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 4,
                  background: 'rgba(34,197,94,.1)', color: '#22c55e', flexShrink: 0,
                }}>{t.status}</span>
              )}
              <span style={{
                color: 'var(--tx,#e4e4ef)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>{t.summary ?? ''}</span>
            </div>
          );
        })}
        {filtered.length > maxVisible && (
          <div style={{
            padding: '6px 12px', fontSize: 10, color: 'var(--tx3,#50506a)',
            textAlign: 'center', fontStyle: 'italic',
          }}>
            +{filtered.length - maxVisible} more… refine search
          </div>
        )}
      </div>

      {/* Selected counter */}
      {selected.size > 0 && (
        <div style={{ fontSize: 10, color: 'var(--tx3,#50506a)' }}>
          {labels.selected ?? 'Selected'}: {selected.size}
        </div>
      )}
    </div>
  );
}
