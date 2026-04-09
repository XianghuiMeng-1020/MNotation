type LocalePack = Record<"zh-Hans" | "zh-Hant" | "en", Record<string, string>>;

export const labelingLocalePack: LocalePack = {
  "zh-Hans": {
    "labeling.keyboardHint": "快捷键：左箭头撤销上一次标注",
    "llm.customRemaining": "自定义提示剩余次数",
    "llm.promptSource": "提示来源"
  },
  "zh-Hant": {
    "labeling.keyboardHint": "快捷鍵：左方向鍵可復原上一筆標註",
    "llm.customRemaining": "自訂提示剩餘次數",
    "llm.promptSource": "提示來源"
  },
  en: {
    "labeling.keyboardHint": "Shortcut: press Left Arrow to undo last label",
    "llm.customRemaining": "Custom prompt remaining",
    "llm.promptSource": "Prompt source"
  }
};
