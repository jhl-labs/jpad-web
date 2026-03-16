export const AI_EVENTS = {
  AUTOCOMPLETE: "ai:autocomplete",
  ACTION: "ai:action",
  OPEN_PANEL: "ai:open-panel",
  EXECUTE_ACTION: "ai:execute-action",
  INLINE_ACTION: "ai:inline-action",
} as const;

export const SIDEBAR_EVENTS = {
  REFRESH: "sidebar:refresh",
} as const;

export const ZEN_EVENTS = {
  TOGGLE: "zen:toggle",
  EXIT: "zen:exit",
} as const;
