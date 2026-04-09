import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Item = { id: string; label: string; to: string };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const nav = useNavigate();

  const items = useMemo<Item[]>(
    () => [
      { id: "home", label: "Home", to: "/" },
      { id: "projects", label: "Projects", to: "/projects" },
      { id: "login", label: "Login", to: "/login" }
    ],
    []
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((x) => x.label.toLowerCase().includes(s) || x.to.includes(s));
  }, [items, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="command-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          className="input"
          autoFocus
          placeholder="Jump to…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul style={{ listStyle: "none", margin: "8px 0 0", maxHeight: 280, overflow: "auto" }}>
          {filtered.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                className="btn"
                style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4 }}
                onClick={() => {
                  nav(it.to);
                  setOpen(false);
                  setQ("");
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>⌘K / Ctrl+K</p>
      </div>
    </div>
  );
}
