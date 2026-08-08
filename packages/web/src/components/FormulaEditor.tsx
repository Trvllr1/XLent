import { useMemo } from 'react';
import { tokenizeFormula, formulaTokenClass } from './formulaTokenizer.js';

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
    <div className="relative rounded border border-slate-700 bg-slate-950 font-mono text-xs">
      <pre aria-hidden className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-all p-2 text-transparent" style={{ minHeight: `${rows * 1.5}rem` }}>
        {highlighted.map((part) => part.className ? <span key={part.key} className={part.className}>{part.text}</span> : part.text)}
      </pre>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        aria-label={ariaLabel}
        spellCheck={false}
        className="relative w-full resize-none bg-transparent p-2 text-slate-100 caret-emerald-400 outline-none placeholder:text-slate-600"
        style={{ minHeight: `${rows * 1.5}rem` }}
      />
    </div>
  );
}
