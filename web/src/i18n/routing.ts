import { defineRouting } from "next-intl/routing";

// Greek is the default and has no URL prefix (/search); English lives under /en/... .
// Records stay in Greek in both: only the interface is translated. The static edition has no
// server to pick a language, so both have a prefix there (/el/search).
export const routing = defineRouting({
  locales: ["el", "en"],
  defaultLocale: "el",
  localePrefix: process.env.NEXT_PUBLIC_STATIC_SITE === "1" ? "always" : "as-needed",
});
