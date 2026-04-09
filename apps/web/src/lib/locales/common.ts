type LocalePack = Record<"zh-Hans" | "zh-Hant" | "en", Record<string, string>>;

export const commonLocalePack: LocalePack = {
  "zh-Hans": {
    "common.show": "显示",
    "common.hide": "隐藏"
  },
  "zh-Hant": {
    "common.show": "顯示",
    "common.hide": "隱藏"
  },
  en: {
    "common.show": "Show",
    "common.hide": "Hide"
  }
};
