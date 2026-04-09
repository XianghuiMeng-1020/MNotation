type LocalePack = Record<"zh-Hans" | "zh-Hant" | "en", Record<string, string>>;

export const adminLocalePack: LocalePack = {
  "zh-Hans": {
    "admin.title": "管理后台",
    "admin.config": "配置",
    "admin.perMemberProgress": "成员进度",
    "admin.timeAnalysis": "时间分析"
  },
  "zh-Hant": {
    "admin.title": "管理後台",
    "admin.config": "配置",
    "admin.perMemberProgress": "成員進度",
    "admin.timeAnalysis": "時間分析"
  },
  en: {
    "admin.title": "Admin Dashboard",
    "admin.config": "Configuration",
    "admin.perMemberProgress": "Per-member Progress",
    "admin.timeAnalysis": "Time Analysis"
  }
};
