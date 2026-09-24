import { useTranslations } from "next-intl";
import { DataFreshness } from "@/components/layout/DataFreshness";
import { LocaleSwitch } from "@/components/layout/LocaleSwitch";
import { NavLink } from "@/components/layout/NavLink";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { TapeLink } from "@/components/tape/TapeLink";
import { StaticFreshness } from "@/components/static/StaticPages";
import { Link } from "@/i18n/navigation";
import { STATIC_SITE } from "@/lib/links";

export function Header() {
  const t = useTranslations("Layout");
  return (
    <header className="border-b border-ink bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10 focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-ink"
      >
        {t("skip")}
      </a>
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
        <Link href="/" className="font-mono text-xl font-bold tracking-tight no-underline">
          {t("home")}
        </Link>
        <div className="flex flex-wrap items-center sm:gap-2">
          <NavLink href="/search">{t("search")}</NavLink>
          <NavLink href={STATIC_SITE ? "/alerts" : "/account"}>{t("alerts")}</NavLink>
          <TapeLink label={t.raw("tape")} />
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  const t = useTranslations("Layout");
  return (
    <footer className="mt-auto border-t border-ink bg-paper">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-sm leading-relaxed sm:px-6">
        <p>{t("notOfficial")}</p>
        {STATIC_SITE ? <StaticFreshness /> : <DataFreshness />}
        <p>
          {t("sourcesLabel")}{" "}
          <a href="https://cerpp.eprocurement.gov.gr/khmdhs-opendata/help" className="underline">ΚΗΜΔΗΣ</a>
          {" · "}
          <a href="https://diavgeia.gov.gr" className="underline">Διαύγεια</a>
          {" · "}
          <a href="https://creativecommons.org/licenses/by/4.0/" className="underline">CC BY 4.0</a>
        </p>
        <p>
          <a href="https://github.com/vwdshka/ixnos-data" className="underline">
            {t("code")}
          </a>{" "}
          · AGPL-3.0 ·{" "}
          <Link href="/how-it-works" className="underline">
            {t("help")}
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="underline">
            {t("privacy")}
          </Link>
          {!STATIC_SITE && (
            <>
              {" "}
              ·{" "}
              <Link href="/developers" className="underline">
                {t("developers")}
              </Link>
            </>
          )}
        </p>
      </div>
      <div className="h-1.5 bg-accent" aria-hidden="true" />
    </footer>
  );
}
