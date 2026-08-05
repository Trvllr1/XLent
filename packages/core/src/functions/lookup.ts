// Lookup functions matching Excel behavior

export type CellGrid = (unknown)[][];

export function VLOOKUP(lookupValue: unknown, tableArray: CellGrid, colIndex: number, rangeLookup = true): unknown {
  if (colIndex < 1 || colIndex > (tableArray[0]?.length ?? 0)) return '#REF!';

  if (rangeLookup) {
    // Approximate match — binary search on sorted first column
    let lastMatch = -1;
    for (let i = 0; i < tableArray.length; i++) {
      const cell = tableArray[i][0];
      if (compare(cell, lookupValue) <= 0) lastMatch = i;
      else break;
    }
    if (lastMatch === -1) return '#N/A';
    return tableArray[lastMatch][colIndex - 1];
  } else {
    // Exact match
    for (let i = 0; i < tableArray.length; i++) {
      if (isEqual(tableArray[i][0], lookupValue)) return tableArray[i][colIndex - 1];
    }
    return '#N/A';
  }
}

export function HLOOKUP(lookupValue: unknown, tableArray: CellGrid, rowIndex: number, rangeLookup = true): unknown {
  if (tableArray.length === 0) return '#REF!';
  if (rowIndex < 1 || rowIndex > tableArray.length) return '#REF!';

  const headerRow = tableArray[0];
  if (rangeLookup) {
    let lastMatch = -1;
    for (let i = 0; i < headerRow.length; i++) {
      if (compare(headerRow[i], lookupValue) <= 0) lastMatch = i;
      else break;
    }
    if (lastMatch === -1) return '#N/A';
    return tableArray[rowIndex - 1][lastMatch];
  } else {
    for (let i = 0; i < headerRow.length; i++) {
      if (isEqual(headerRow[i], lookupValue)) return tableArray[rowIndex - 1][i];
    }
    return '#N/A';
  }
}

export function INDEX(array: CellGrid, rowNum: number, colNum = 1): unknown {
  if (rowNum < 1 || rowNum > array.length) return '#REF!';
  if (colNum < 1 || colNum > (array[0]?.length ?? 0)) return '#REF!';
  return array[rowNum - 1][colNum - 1];
}

export function MATCH(lookupValue: unknown, lookupArray: unknown[], matchType = 1): number | string {
  if (matchType === 0) {
    // Exact match
    for (let i = 0; i < lookupArray.length; i++) {
      if (isEqual(lookupArray[i], lookupValue)) return i + 1;
    }
    return '#N/A';
  } else if (matchType === 1) {
    // Largest value ≤ lookup (array sorted ascending)
    let lastMatch = -1;
    for (let i = 0; i < lookupArray.length; i++) {
      if (compare(lookupArray[i], lookupValue) <= 0) lastMatch = i;
      else break;
    }
    return lastMatch >= 0 ? lastMatch + 1 : '#N/A';
  } else {
    // Smallest value ≥ lookup (array sorted descending)
    let lastMatch = -1;
    for (let i = 0; i < lookupArray.length; i++) {
      if (compare(lookupArray[i], lookupValue) >= 0) lastMatch = i;
      else break;
    }
    return lastMatch >= 0 ? lastMatch + 1 : '#N/A';
  }
}

export function XLOOKUP(
  lookupValue: unknown,
  lookupArray: unknown[],
  returnArray: unknown[],
  ifNotFound: unknown = '#N/A',
  matchMode = 0,
  _searchMode = 1,
): unknown {
  if (matchMode === 0) {
    // Exact match
    for (let i = 0; i < lookupArray.length; i++) {
      if (isEqual(lookupArray[i], lookupValue)) return returnArray[i];
    }
    return ifNotFound;
  } else if (matchMode === -1) {
    // Exact or next smaller
    let bestIdx = -1;
    for (let i = 0; i < lookupArray.length; i++) {
      if (compare(lookupArray[i], lookupValue) <= 0) {
        if (bestIdx === -1 || compare(lookupArray[i], lookupArray[bestIdx]) > 0) bestIdx = i;
      }
    }
    return bestIdx >= 0 ? returnArray[bestIdx] : ifNotFound;
  } else {
    // Exact or next larger
    let bestIdx = -1;
    for (let i = 0; i < lookupArray.length; i++) {
      if (compare(lookupArray[i], lookupValue) >= 0) {
        if (bestIdx === -1 || compare(lookupArray[i], lookupArray[bestIdx]) < 0) bestIdx = i;
      }
    }
    return bestIdx >= 0 ? returnArray[bestIdx] : ifNotFound;
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function isEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}
