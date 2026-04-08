import { useCallback, useEffect, useRef, useState } from "react";

export type ToastItem = { id: number; msg: string; kind: "success" | "error" | "warn" };
let toastSeq = 0;

export function useToast() {
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => () => timeoutsRef.current.forEach(clearTimeout), []);
  const showToast = useCallback((msg: string, kind: ToastItem["kind"] = "success", durationMs = 2500) => {
    const id = toastSeq++;
    setToasts((prev) => [...prev, { id, msg, kind }]);
    const tid = setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), durationMs);
    timeoutsRef.current.push(tid);
  }, []);
  return { toasts, showToast };
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 9999 }}>
      {toasts.map((t) => (
        <div key={t.id} className="card" style={{ marginTop: 8, borderColor: t.kind === "error" ? "#fca5a5" : undefined }}>{t.msg}</div>
      ))}
    </div>
  );
}
