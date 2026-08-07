import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface CellSelection {
  modelId: string;
  cellId: string;
  label: string;
  value: unknown;
  format?: string;
  formula?: string;
  role?: string;
  fanOut?: number;
  fanIn?: number;
  sourceCell?: { sheet: string; ref: string };
}

interface SelectionContextValue {
  selection: CellSelection | null;
  select: (sel: CellSelection) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue>({
  selection: null,
  select: () => {},
  clear: () => {},
});

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const select = useCallback((sel: CellSelection) => setSelection(sel), []);
  const clear = useCallback(() => setSelection(null), []);
  const value = useMemo(() => ({ selection, select, clear }), [selection, select, clear]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  return useContext(SelectionContext);
}
