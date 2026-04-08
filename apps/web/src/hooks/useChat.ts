import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function useChat(projectId: string) {
  const [messages, setMessages] = useState<any[]>([]);
  useEffect(() => {
    if (!projectId) return;
    api.getMessages(projectId).then((r: any) => setMessages(r.messages ?? [])).catch(() => undefined);
  }, [projectId]);
  return { messages, setMessages };
}
