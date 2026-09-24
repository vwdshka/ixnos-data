"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Link, usePathname } from "@/i18n/navigation";

function SwitchLink({ query }: { query: Record<string, string> }) {
  const t = useTranslations("Layout");
  const other = useLocale() === "el" ? "en" : "el";
  return (
    <Link
      href={{ pathname: usePathname(), query }}
      locale={other}
      hrefLang={other}
      lang={other}
      aria-label={t("otherLocaleLabel")}
      className="rounded-sm px-2 py-2 font-mono text-sm font-bold uppercase underline-offset-4 hover:underline"
    >
      {other}
    </Link>
  );
}

function WithQuery() {
  return <SwitchLink query={Object.fromEntries(useSearchParams())} />;
}

/** The same page in the other language, query string included once the client has it. */
export function LocaleSwitch() {
  return (
    <Suspense fallback={<SwitchLink query={{}} />}>
      <WithQuery />
    </Suspense>
  );
}
