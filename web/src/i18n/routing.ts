import { defineRouting } from "next-intl/routing";

// Greek is the default and has no URL prefix (/search); English lives under /en/... .
// Records stay in Greek in both: only the interface is translated.
export const routing = defineRouting({
  locales: ["el", "en"],
  defaultLocale: "el",
  localePrefix: "as-needed",
});
