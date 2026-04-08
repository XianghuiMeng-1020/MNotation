import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export type Notification = {
  notification_id: string;
  project_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  meta_json?: string;
  is_read: number;
  created_at: string;
};

export function useNotifications(projectId: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const refresh = useCallback(() => {
    if (!projectId) return;
    api.getNotifications(projectId)
      .then((r: any) => setNotifications(r.notifications ?? []))
      .catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    refresh();
    // Poll every 30 seconds
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, setNotifications, unreadCount, refresh };
}
