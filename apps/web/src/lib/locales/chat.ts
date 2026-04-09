type LocalePack = Record<"zh-Hans" | "zh-Hant" | "en", Record<string, string>>;

export const chatLocalePack: LocalePack = {
  "zh-Hans": {
    "notifications.title": "通知",
    "notifications.empty": "暂无通知",
    "notifications.markAllRead": "全部已读",
    "export.estimatedSize": "预计导出大小"
  },
  "zh-Hant": {
    "notifications.title": "通知",
    "notifications.empty": "暫無通知",
    "notifications.markAllRead": "全部已讀",
    "export.estimatedSize": "預估匯出大小"
  },
  en: {
    "notifications.title": "Notifications",
    "notifications.empty": "No notifications",
    "notifications.markAllRead": "Mark all read",
    "export.estimatedSize": "Estimated export size"
  }
};
