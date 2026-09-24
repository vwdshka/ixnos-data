"use client";

import { useTranslations } from "next-intl";
import { THEME_STORAGE_KEY, themeCookie } from "./theme";

function toggleTheme() {
  const root = document.documentElement;
  const current =
    root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  document.cookie = themeCookie(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Private windows may refuse storage; the switch still applies to this page.
  }
}

export function ThemeToggle() {
  const t = useTranslations("Layout");
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t("theme")}
      title={t("theme")}
      className="grid size-10 place-items-center rounded-sm border border-ink transition-transform duration-150 ease-out hover:bg-ink hover:text-paper active:scale-[0.96]"
    >
      <svg className="theme-icon-light size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
      </svg>
      <svg className="theme-icon-dark size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
