"use client";

import { THEMES } from "@/lib/themes";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Colour theme" className="flex items-center gap-2">
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            aria-label={`${t.label} theme`}
            title={t.label}
            onClick={() => setTheme(t.id)}
            className={`min-h-11 min-w-11 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition-colors ${
              active ? "border-brand bg-surface-raised" : "border-border/50 bg-surface hover:border-border"
            } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
          >
            <span className="flex -space-x-1" aria-hidden="true">
              {t.swatches.map((c) => (
                <span
                  key={c}
                  className="size-4 rounded-full border border-foreground/20"
                  style={{ background: c }}
                />
              ))}
            </span>
            <span className="sr-only">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
