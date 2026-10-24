export const THEMES = [
  { id: "sunrise", label: "Sunrise", swatches: ["#ff7a50", "#f6bd3f", "#1b140f"], themeColor: "#1b140f" },
  { id: "playful", label: "Playful", swatches: ["#2ed7c3", "#bfe962", "#0a1618"], themeColor: "#0a1618" },
  { id: "pastel", label: "Pastel", swatches: ["#c7b8fc", "#ffc9a8", "#181322"], themeColor: "#181322" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "sunrise";
export const THEME_STORAGE_KEY = "khlaas-theme";

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}
