import { useState } from "react";
import { useI18n } from "../lib/i18n";
import { api } from "../lib/api";

export type Member = {
  user_id: string;
  email?: string;
  role: string;
  joined_at?: string;
};

type Props = {
  projectId: string;
  members: Member[];
  currentUserId?: string;
  isOwner?: boolean;
  onUpdate?: () => void;
};

export function TeamManager({ projectId, members, currentUserId, isOwner, onUpdate }: Props) {
  const { t } = useI18n();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<"coder" | "reviewer" | "guest" | "admin">("coder");

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setInviteError("Invalid email"); return; }
    if (members.length >= 10) { setInviteError("Max 10 members"); return; }
    setInviting(true);
    setInviteError("");
    setInviteSuccess("");
    try {
      await api.addMember(projectId, { email, role: inviteRole });
      setInviteEmail("");
      setInviteSuccess(`Invited ${email}`);
      onUpdate?.();
    } catch (e: any) {
      setInviteError(e.message ?? t("common.error"));
    } finally {
      setInviting(false);
    }
  };

  const remove = async (userId: string) => {
    if (userId === currentUserId) return;
    setRemoving(userId);
    try {
      await api.removeMember(projectId, userId);
      onUpdate?.();
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Member list */}
      <div>
        {members.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>{t("settings.teamEmpty")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {members.map((m) => (
              <div key={m.user_id} style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.65rem 0.75rem",
                background: "var(--surface-raised)",
                borderRadius: "8px"
              }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "50%",
                  background: `hsl(${Math.abs(hashCode(m.user_id)) % 360}, 60%, 50%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 700, fontSize: "0.85rem", flexShrink: 0
                }}>
                  {(m.email ?? m.user_id).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.email ?? m.user_id}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {m.role === "owner" ? t("auth.role.owner") : t("auth.role.coder")}
                    {m.joined_at && ` · ${new Date(m.joined_at).toLocaleDateString()}`}
                  </div>
                </div>
                {m.user_id === currentUserId && (
                  <span style={{ fontSize: "0.72rem", background: "var(--accent)", color: "#fff", borderRadius: "4px", padding: "0.1rem 0.4rem" }}>You</span>
                )}
                {isOwner && m.role !== "owner" && m.user_id !== currentUserId && (
                  <button
                    className="btn sm"
                    onClick={() => remove(m.user_id)}
                    disabled={removing === m.user_id}
                    style={{ color: "#ef4444", flexShrink: 0 }}
                  >
                    {removing === m.user_id ? "…" : t("common.remove")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite form */}
      {isOwner && members.length < 10 && (
        <div>
          <label style={{ fontWeight: 500, display: "block", marginBottom: "0.4rem" }}>{t("settings.inviteEmail")}</label>
          <div style={{ marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Role</label>
            <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)} style={{ width: "100%", marginTop: 4 }}>
              <option value="coder">Coder</option>
              <option value="reviewer">Reviewer</option>
              <option value="guest">Guest (read-only)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              className="input"
              type="email"
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite()}
              style={{ flex: 1 }}
            />
            <button className="btn primary" onClick={invite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? "…" : t("settings.inviteAdd")}
            </button>
          </div>
          {inviteError && <p style={{ color: "#ef4444", fontSize: "0.82rem", marginTop: "0.3rem" }}>{inviteError}</p>}
          {inviteSuccess && <p style={{ color: "#22c55e", fontSize: "0.82rem", marginTop: "0.3rem" }}>{inviteSuccess}</p>}
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
            {members.length}/10 members
          </p>
        </div>
      )}
    </div>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
