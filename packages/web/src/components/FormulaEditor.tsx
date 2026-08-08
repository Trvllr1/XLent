import { useMemo, useRef, useState } from 'react';
import { tokenizeFormula, formulaTokenClass } from './formulaTokenizer.js';
import { functionPrefixAt, suggestFunctions, type FunctionSignature } from './formulaFunctions.js';

interface FormulaEditorProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  ariaLabel?: string;
}

export function FormulaEditor({ value, onChange, onFocus, onBlur, placeholder, disabled, rows = 3, ariaLabel }: FormulaEditorProps) {
  const tokens = useMemo(() => tokenizeFormula(value), [value]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(value.length);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const prefix = useMemo(() => functionPrefixAt(value, caret), [value, caret]);
  const suggestions = useMemo(
    () => (dismissed || !prefix ? [] : suggestFunctions(prefix.prefix)),
    [dismissed, prefix],
  );
  const open = suggestions.length > 0;
  const active: FunctionSignature | undefined = suggestions[Math.min(activeIndex, suggestions.length - 1)];

  const syncCaret = () => {
    const element = textareaRef.current;
    if (element && element.selectionStart !== caret) setCaret(element.selectionStart);
  };

  const accept = (fn: FunctionSignature) => {
    if (!prefix) return;
    const next = `${value.slice(0, prefix.start)}${fn.name}(${value.slice(caret)}`;
    const nextCaret = prefix.start + fn.name.length + 1;
    onChange(next);
    setDismissed(true);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(nextCaret, nextCaret));
  };

  const handleChange = (next: string) => {
    setDismissed(false);
    setActiveIndex(0);
    onChange(next);
    requestAnimationFrame(syncCaret);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if ((event.key === 'Tab' || event.key === 'Enter') && active) {
      event.preventDefault();
      accept(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDismissed(true);
    }
  };

  const highlighted = useMemo(() => {
    let last = 0;
    const parts: Array<{ text: string; className?: string; key: number }> = [];
    let key = 0;
    for (const token of tokens) {
      if (token.start > last) parts.push({ text: value.slice(last, token.start), key: key++ });
      parts.push({ text: token.value, className: formulaTokenClass(token.type), key: key++ });
      last = token.start + token.value.length;
    }
    if (last < value.length) parts.push({ text: value.slice(last), key: key++ });
    return parts;
  }, [tokens, value]);

  return (
    <div className="relative">
      <div className="relative rounded border border-slate-700 bg-slate-950 font-mono text-xs">
        <pre aria-hidden className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-all p-2 text-transparent" style={{ minHeight: `${rows * 1.5}rem` }}>
          {highlighted.map((part) => part.className ? <span key={part.key} className={part.className}>{part.text}</span> : part.text)}
        </pre>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onSelect={syncCaret}
          onClick={syncCaret}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          aria-label={ariaLabel}
          aria-expanded={open}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={open ? 'formula-function-suggestions' : undefined}
          spellCheck={false}
          className="relative w-full resize-none bg-transparent p-2 text-slate-100 caret-emerald-400 outline-none placeholder:text-slate-600"
          style={{ minHeight: `${rows * 1.5}rem` }}
        />
      </div>
      {open && (
        <div id="formula-function-suggestions" role="listbox" aria-label="Supported functions" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded border border-slate-700 bg-slate-900 shadow-xl">
          {suggestions.map((fn, index) => (
            <button
              key={fn.name}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => { event.preventDefault(); accept(fn); }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-[11px] ${index === activeIndex ? 'bg-emerald-950/60 text-emerald-200' : 'text-slate-300'}`}
            >
              <span className="shrink-0 font-mono font-semibold text-blue-300">{fn.name}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-slate-400">{fn.signature}</span>
              <span className="shrink-0 text-[9px] uppercase tracking-wider text-slate-600">{fn.category}</span>
            </button>
          ))}
          {active && (
            <p className="border-t border-slate-800 bg-slate-950/80 px-2 py-1 text-[10px] text-slate-400">
              <span className="font-mono text-slate-300">{active.signature}</span> — {active.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
