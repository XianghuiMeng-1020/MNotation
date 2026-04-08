import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { api } from "../lib/api";

export type Message = {
  message_id?: string;
  user_id?: string;
  content: string;
  message_type?: string;
  created_at?: string;
  item_id?: string;
};

type Props = {
  projectId: string;
  itemId?: string;
  messages: Message[];
  onSend?: (content: string) => Promise<void>;
  className?: string;
};

function initials(userId: string): string {
  const parts = userId.replace(/^email:/, "").split(/[@._-]/);
  return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

function avatarColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (Math.imul(31, h) + userId.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 55%, 50%)`;
}

export function ChatPanel({ projectId, itemId, messages, onSend, className = "" }: Props) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"chat" | "notes">(itemId ? "notes" : "chat");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [noteMessages, setNoteMessages] = useState<Message[]>([]);

  useEffect(() => {
    setChatMessages(messages.filter((m) => !m.item_id));
    setNoteMessages(messages.filter((m) => m.item_id));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, noteMessages, activeTab]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      if (onSend) {
        await onSend(content);
      } else {
        await api.postMessage(projectId, {
          content,
          message_type: activeTab === "notes" ? "note" : "chat",
          item_id: activeTab === "notes" ? itemId : undefined
        });
        const newMsg: Message = { content, created_at: new Date().toISOString(), message_type: activeTab === "notes" ? "note" : "chat" };
        if (activeTab === "notes") {
          setNoteMessages((prev) => [...prev, newMsg]);
        } else {
          setChatMessages((prev) => [...prev, newMsg]);
        }
      }
      setText("");
    } finally {
      setSending(false);
    }
  };

  const displayMessages = activeTab === "chat" ? chatMessages : noteMessages;

  return (
    <div className={`card ${className}`} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "320px", padding: 0, overflow: "hidden" }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)" }}>
        {(["chat", "notes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "0.6rem",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? "var(--accent)" : "var(--text-muted)",
              transition: "all 0.15s"
            }}
          >
            {tab === "chat" ? t("chat.tabProject") : t("chat.tabItem")}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {displayMessages.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "1.5rem 0", fontSize: "0.85rem" }}>
            {t("chat.noMessages")}
          </div>
        ) : (
          displayMessages.map((m, i) => {
            const isSystem = m.message_type === "system" || m.message_type === "suggestion";
            return (
              <div key={m.message_id ?? i} style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-start",
                padding: isSystem ? "0.5rem" : "0",
                background: isSystem ? "rgba(99,102,241,0.06)" : "transparent",
                borderRadius: isSystem ? "6px" : "0",
                borderLeft: isSystem ? "3px solid var(--accent)" : "none"
              }}>
                {!isSystem && m.user_id && (
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "50%",
                    background: avatarColor(m.user_id),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: "0.65rem", fontWeight: 700, flexShrink: 0
                  }}>
                    {initials(m.user_id)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!isSystem && m.user_id && (
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.15rem" }}>
                      {m.user_id.replace(/^email:/, "")}
                      {m.created_at && ` · ${new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                  )}
                  {isSystem && (
                    <div style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 600, marginBottom: "0.15rem" }}>
                      {m.message_type === "suggestion" ? t("chat.suggestion") : t("chat.system")}
                    </div>
                  )}
                  <div style={{ fontSize: "0.88rem", lineHeight: 1.5, wordBreak: "break-word" }}>{m.content}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "0.5rem 0.75rem", borderTop: "1px solid var(--border-color)", display: "flex", gap: "0.4rem" }}>
        <input
          className="input"
          placeholder={t("chat.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
          style={{ flex: 1, padding: "0.45rem 0.7rem", fontSize: "0.88rem" }}
        />
        <button
          className="btn primary sm"
          onClick={send}
          disabled={sending || !text.trim()}
        >
          {t("chat.send")}
        </button>
      </div>
    </div>
  );
}
