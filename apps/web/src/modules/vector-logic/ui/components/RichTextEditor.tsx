// @ts-nocheck
import { useRef, useEffect } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/**
 * Lightweight contenteditable rich-text editor with a small toolbar.
 * Uses the legacy `document.execCommand` API which is the simplest way to
 * get bold/italic/lists working in plain DOM without bringing in a heavy
 * editor framework like TipTap.
 *
 * The HTML is sanitized by trusting only a small allowlist of tags rendered
 * via dangerouslySetInnerHTML in the read-only side. For the editable side,
 * we rely on browser sanitization of execCommand.
 */
export function RichTextEditor({ value, onChange, placeholder, minHeight = 120 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Initial paint and external value sync: only update when value changes
  // from outside (avoid clobbering caret on every keystroke).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value ?? '')) {
      ref.current.innerHTML = value ?? '';
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
    ref.current?.focus();
  };

  const onInput = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  return (
    <div style={{
      background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px',
        background: 'var(--sf3)', borderBottom: '1px solid var(--bd)',
      }}>
        <ToolButton title="Bold" onClick={() => exec('bold')} icon="format_bold" />
        <ToolButton title="Italic" onClick={() => exec('italic')} icon="format_italic" />
        <ToolButton title="Underline" onClick={() => exec('underline')} icon="format_underlined" />
        <ToolButton title="Strikethrough" onClick={() => exec('strikeThrough')} icon="strikethrough_s" />
        <Sep />
        <ToolButton title="Heading" onClick={() => exec('formatBlock', 'H3')} icon="title" />
        <ToolButton title="Quote" onClick={() => exec('formatBlock', 'BLOCKQUOTE')} icon="format_quote" />
        <ToolButton title="Code" onClick={() => exec('formatBlock', 'PRE')} icon="code" />
        <Sep />
        <ToolButton title="Bulleted list" onClick={() => exec('insertUnorderedList')} icon="format_list_bulleted" />
        <ToolButton title="Numbered list" onClick={() => exec('insertOrderedList')} icon="format_list_numbered" />
        <Sep />
        <ToolButton title="Link" onClick={() => {
          const url = prompt('URL:');
          if (url) exec('createLink', url);
        }} icon="link" />
        <ToolButton title="Clear formatting" onClick={() => exec('removeFormat')} icon="format_clear" />
      </div>

      {/* Editable area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        data-placeholder={placeholder ?? ''}
        style={{
          padding: '10px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--tx)',
          outline: 'none', minHeight, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
      />
      <style>{`
        [contenteditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: var(--tx3);
          opacity: .5;
          pointer-events: none;
        }
        [contenteditable] h3 { font-size: 16px; font-weight: 700; margin: 8px 0 4px; }
        [contenteditable] blockquote {
          border-left: 3px solid var(--bd2); padding-left: 12px; margin: 6px 0;
          color: var(--tx2); font-style: italic;
        }
        [contenteditable] pre {
          background: var(--sf3); padding: 8px 12px; border-radius: 4px;
          font-family: monospace; font-size: 12px; margin: 6px 0;
        }
        [contenteditable] ul, [contenteditable] ol { padding-left: 24px; margin: 4px 0; }
        [contenteditable] a { color: var(--ac); text-decoration: underline; }
      `}</style>
    </div>
  );
}

function ToolButton({ title, onClick, icon }: { title: string; onClick: () => void; icon: string }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault() /* keep selection */}
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '4px 6px', borderRadius: 4, color: 'var(--tx2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit', transition: 'all .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--sf2)'; e.currentTarget.style.color = 'var(--tx)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--tx2)'; }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 16, background: 'var(--bd)', margin: '0 4px' }} />;
}
