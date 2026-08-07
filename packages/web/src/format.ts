/** Format a value using an Excel number format string, or fall back to smart defaults. */
export function formatExcelValue(v: unknown, fmt?: string): string {
  if (v == null) return '—';
  if (typeof v !== 'number') return String(v);

  if (fmt && fmt !== 'General') {
    // Excel formats can have sections separated by ; (positive;negative;zero)
    const section = pickSection(fmt, v);

    if (section.includes('%')) {
      const decimals = countDecimals(section.replace('%', ''));
      return (v * 100).toFixed(decimals) + '%';
    }
    if (section.includes('$') || section.includes('"$"')) {
      const decimals = countDecimals(section);
      const abs = Math.abs(v).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return v < 0 ? `-$${abs}` : `$${abs}`;
    }
    if (section.includes('#') || section.includes('0')) {
      const decimals = countDecimals(section);
      const useCommas = section.includes(',');
      if (useCommas) {
        return v.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      }
      return v.toFixed(decimals);
    }
  }

  // No format — smart defaults without guessing intent
  if (Number.isInteger(v)) return v.toLocaleString();
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(v) < 0.01 && v !== 0) return v.toPrecision(4);
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function pickSection(fmt: string, v: number): string {
  const parts = fmt.split(';');
  if (parts.length === 1) return parts[0];
  if (v > 0) return parts[0];
  if (v < 0) return parts[1] || parts[0];
  return parts[2] || parts[0];
}

function countDecimals(fmt: string): number {
  const match = fmt.match(/\.([0#]+)/);
  return match ? match[1].length : 0;
}
