'use client';

/**
 * UmlautKeyboard — a compact row of buttons for inserting German special characters.
 * Works by inserting at the cursor position in a given <input> or <textarea> ref.
 */

interface UmlautKeyboardProps {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onInsert?: (char: string) => void; // optional callback so parent can sync state
}

const UMLAUTS = ['ä', 'ö', 'ü', 'ß'];

export function UmlautKeyboard({ inputRef, onInsert }: UmlautKeyboardProps) {
  const insert = (char: string) => {
    const el = inputRef.current;
    if (!el) return;

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const newVal = before + char + after;

    // Use native input value setter so React sees the change
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeInputValueSetter?.call(el, newVal);
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Restore cursor after inserted character
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + char.length, start + char.length);
    });

    onInsert?.(char);
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap',
      }}
    >
      {UMLAUTS.map((ch) => (
        <button
          key={ch}
          type="button"
          onMouseDown={(e) => {
            // Prevent blur on input
            e.preventDefault();
            insert(ch);
          }}
          style={{
            padding: '5px 9px',
            borderRadius: 7,
            border: '1.5px solid var(--border-default)',
            background: 'var(--bg-elevated)',
            color: 'var(--accent-600)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.12s ease',
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.1)';
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-elevated)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}