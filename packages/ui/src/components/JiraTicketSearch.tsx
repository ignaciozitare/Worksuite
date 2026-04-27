import { useState, useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JiraIssueOption {
  key: string;
  fields?: {
    summary?: string;
    issuetype?: { name?: string };
  } & Record<string, any>;
  summary?: string;
  issueType?: string;
}

export interface JiraTicketSearchProps {
  /** Selected Jira issue keys */
  value: string[];
  /**
   * Called whenever the selection changes.
   * @param keys        Current list of selected issue keys
   * @param fullIssues  Full issue objects for the selected keys (may be empty
   *                    for keys that were already selected before this mount).
   */
  onChange: (keys: string[], fullIssues: JiraIssueOption[]) => void;
  /**
   * Search callback — the consumer decides how to talk to Jira.
   * Typically backed by @worksuite/jira-service.
   */
  search: (query: string) => Promise<JiraIssueOption[]>;
  placeholder?: string;
  placeholderMore?: string;
  /** Minimum query length before firing the search (default: 2) */
  minChars?: number;
  /** Debounce in ms (default: 300) */
  debounceMs?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * JiraTicketSearch — autocomplete-style picker for Jira issues.
 *
 * Dependency-injected: the consumer provides a `search(query)` function,
 * so this component is agnostic of transport/auth.
 *
 * Rendering uses WorkSuite CSS variables (`--sf`, `--bd`, `--tx`, `--tx3`, `--ac`).
 */
export function JiraTicketSearch({
  value,
  onChange,
  search,
  placeholder = 'Search Jira tickets…',
  placeholderMore = 'Search more tickets…',
  minChars = 2,
  debounceMs = 300,
}: JiraTicketSearchProps) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<JiraIssueOption[]>([]);
  const [loading, setLoading]     = useState(false);
  const [showDrop, setShowDrop]   = useState(false);
  const [ticketMap, setTicketMap] = useState<Record<string, JiraIssueOption>>({});
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef                   = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < minChars) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const issues = await search(query.trim());
        setResults(issues);
        setShowDrop(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[JiraTicketSearch] search error', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const selectTicket = (issue: JiraIssueOption) => {
    const key = issue.key;
    if (value.includes(key)) return;
    const newMap = { ...ticketMap, [key]: issue };
    setTicketMap(newMap);
    const newKeys = [...value, key];
    onChange(newKeys, newKeys.map(k => newMap[k]).filter(Boolean) as JiraIssueOption[]);
    setQuery('');
    setResults([]);
    setShowDrop(false);
  };

  const removeTicket = (key: string) => {
    const newKeys = value.filter(k => k !== key);
    const newMap = { ...ticketMap };
    delete newMap[key];
    setTicketMap(newMap);
    onChange(newKeys, newKeys.map(k => newMap[k]).filter(Boolean) as JiraIssueOption[]);
  };

  const getSummary = (key: string) => {
    const t = ticketMap[key];
    return t?.fields?.summary ?? t?.summary ?? '';
  };

  const inputWrapStyle: React.CSSProperties = {
    display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 40, cursor: 'text',
    width: 'auto', padding: '6px 10px', fontSize: 'var(--fs-xs)', fontFamily: 'inherit',
    background: 'var(--sf2)', border: '1px solid var(--bd)',
    borderRadius: 8, color: 'var(--tx)', outline: 'none',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Selected chips */}
      <div style={inputWrapStyle}>
        {value.map(k => (
          <span key={k} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
            background: 'rgba(124,58,237,.15)', color: '#a78bfa', borderRadius: 6,
            fontSize: 'var(--fs-xs)', fontFamily: 'monospace', maxWidth: 260, overflow: 'hidden',
          }}>
            <strong>{k}</strong>
            {getSummary(k) && (
              <span style={{
                fontSize: 'var(--fs-2xs)', opacity: .8, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160,
              }}>{getSummary(k)}</span>
            )}
            <span onClick={() => removeTicket(k)}
              style={{ cursor: 'pointer', opacity: .7, flexShrink: 0 }}>×</span>
          </span>
        ))}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (results.length) setShowDrop(true); }}
          placeholder={value.length ? placeholderMore : placeholder}
          style={{
            background: 'transparent', border: 'none', outline: 'none', fontSize: 'var(--fs-xs)',
            color: 'var(--tx)', fontFamily: 'inherit', flex: 1, minWidth: 140,
          }}
        />
        {loading && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>…</span>}
      </div>

      {/* Results dropdown */}
      {showDrop && results.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 50,
          background: 'var(--sf)', border: '1px solid var(--bd)',
          borderRadius: 8, maxHeight: 240, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,.5)',
        }}>
          {results.map(issue => {
            const key = issue.key;
            const summary = issue.fields?.summary ?? issue.summary ?? '';
            const type = issue.fields?.issuetype?.name ?? issue.issueType ?? '';
            const alreadySelected = value.includes(key);
            return (
              <div key={key}
                onClick={() => !alreadySelected && selectTicket(issue)}
                style={{
                  padding: '8px 12px',
                  cursor: alreadySelected ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-xs)',
                  borderBottom: '1px solid var(--bd)',
                  opacity: alreadySelected ? .5 : 1,
                  background: alreadySelected ? 'rgba(124,58,237,.05)' : 'transparent',
                }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>{key}</span>
                {type && (
                  <span style={{
                    fontSize: 'var(--fs-2xs)', padding: '1px 6px', borderRadius: 4,
                    background: 'var(--sf2)', color: 'var(--tx3)', flexShrink: 0,
                  }}>{type}</span>
                )}
                <span style={{
                  color: 'var(--tx)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{summary}</span>
                {alreadySelected && (
                  <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-2xs)', color: 'var(--tx3)' }}>Added</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
