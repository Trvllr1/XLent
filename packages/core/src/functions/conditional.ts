// Conditional aggregate functions matching Excel behavior

export function SUMIF(range: unknown[], criteria: string, sumRange?: unknown[]): number {
  const target = sumRange || range;
  let total = 0;
  for (let i = 0; i < range.length; i++) {
    if (matchesCriteria(range[i], criteria)) {
      total += toNum(target[i]);
    }
  }
  return total;
}

export function SUMIFS(sumRange: unknown[], ...pairs: unknown[]): number {
  let total = 0;
  for (let i = 0; i < sumRange.length; i++) {
    let allMatch = true;
    for (let p = 0; p < pairs.length; p += 2) {
      const criteriaRange = pairs[p] as unknown[];
      const criteria = pairs[p + 1] as string;
      if (!matchesCriteria(criteriaRange[i], criteria)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) total += toNum(sumRange[i]);
  }
  return total;
}

export function COUNTIF(range: unknown[], criteria: string): number {
  let count = 0;
  for (const val of range) {
    if (matchesCriteria(val, criteria)) count++;
  }
  return count;
}

export function COUNTIFS(...pairs: unknown[]): number {
  if (pairs.length < 2) return 0;
  const len = (pairs[0] as unknown[]).length;
  let count = 0;
  for (let i = 0; i < len; i++) {
    let allMatch = true;
    for (let p = 0; p < pairs.length; p += 2) {
      const criteriaRange = pairs[p] as unknown[];
      const criteria = pairs[p + 1] as string;
      if (!matchesCriteria(criteriaRange[i], criteria)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) count++;
  }
  return count;
}

export function AVERAGEIF(range: unknown[], criteria: string, avgRange?: unknown[]): number | string {
  const target = avgRange || range;
  let total = 0;
  let count = 0;
  for (let i = 0; i < range.length; i++) {
    if (matchesCriteria(range[i], criteria)) {
      total += toNum(target[i]);
      count++;
    }
  }
  return count === 0 ? '#DIV/0!' : total / count;
}

export function matchesCriteria(value: unknown, criteria: string): boolean {
  // Operator-prefixed criteria: ">5", "<=10", "<>0"
  const opMatch = criteria.match(/^(>=|<=|<>|>|<|=)(.+)$/);
  if (opMatch) {
    const op = opMatch[1];
    const target = parseFloat(opMatch[2]);
    const numVal = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(numVal) || isNaN(target)) return false;
    switch (op) {
      case '>': return numVal > target;
      case '<': return numVal < target;
      case '>=': return numVal >= target;
      case '<=': return numVal <= target;
      case '=': return numVal === target;
      case '<>': return numVal !== target;
    }
  }

  // Numeric equality
  const numCriteria = parseFloat(criteria);
  if (!isNaN(numCriteria) && typeof value === 'number') {
    return value === numCriteria;
  }

  // Wildcard string match (? = single char, * = any chars)
  const pattern = criteria
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${pattern}$`, 'i').test(String(value ?? ''));
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
