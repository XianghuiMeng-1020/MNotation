import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { IrrSnapshot } from "../components/IrrDashboard";

export function useIrr(projectId: string) {
  const [irr, setIrr] = useState<IrrSnapshot | null>(null);
  const [history, setHistory] = useState<IrrSnapshot[]>([]);
  const [calculating, setCalculating] = useState(false);

  const load = useCallback(() => {
    if (!projectId) return;
    api.getLatestIrr(projectId).then((r: any) => setIrr(r ?? null)).catch(() => setIrr(null));
    api.getIrrHistory(projectId).then((r: any) => setHistory(r.snapshots ?? [])).catch(() => setHistory([]));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const calculate = useCallback(async () => {
    if (!projectId) return;
    setCalculating(true);
    try {
      const res = await api.calculateIrr(projectId) as any;
      setIrr(res);
      load();
    } finally {
      setCalculating(false);
    }
  }, [projectId, load]);

  return { irr, history, calculating, calculate, refresh: load };
}
