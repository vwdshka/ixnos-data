import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { ApiKeys } from "@/components/account/ApiKeys";
import { deleteAccount, deleteSearch, getAccount, getApiKeys, setDigest, signOut } from "@/lib/account";
import { CPV_DIVISIONS } from "@/lib/cpv";
import { formatEuro } from "@/lib/format";
import { REGIONS } from "@/lib/regions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account");
  return { title: t("title"), robots: { index: false } };
}

const BUTTON =
  "rounded-sm border border-ink px-3 py-2 text-sm font-semibold transition-colors duration-150 hover:bg-ink hover:text-paper";

export default async function AccountPage({ params, searchParams }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const account = await getAccount();
  if (!account) {
    redirect({ href: "/login", locale });
    return null;
  }
  const t = await getTranslations("Account");
  const kind = await getTranslations("Kind");
  const saved = (await searchParams).saved;
  const name = (list: ReadonlyArray<{ code: string; nameEl: string; nameEn: string }>, code: string | null) => {
    const entry = list.find((e) => e.code === code);
    return entry ? (locale === "en" ? entry.nameEn : entry.nameEl) : code;
  };

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
          <p className="font-mono text-sm">{account.email}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className={BUTTON}>
            {t("signOut")}
          </button>
        </form>
      </div>

      {saved && (
        <p role="status" className="border-2 border-ink bg-paper p-4 font-semibold">
          {t("saved")}
        </p>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="searches-title">
        <h2 id="searches-title" className="border-b-2 border-ink pb-2 text-xl font-bold">
          {t("searches")}
        </h2>
        <p className="leading-relaxed">{t("digestNote")}</p>
        <form action={setDigest} className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-mono text-xs font-bold uppercase tracking-wide">{t("digestLabel")}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(["daily", "weekly", "paused"] as const).map((frequency) => (
                <label key={frequency} className="inline-flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="frequency"
                    value={frequency}
                    defaultChecked={account.digestFrequency === frequency}
                    className="size-5 accent-[var(--ink)]"
                  />
                  {t(`digest_${frequency}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className={BUTTON}>
            {t("digestSave")}
          </button>
        </form>
        {account.savedSearches.length === 0 ? (
          <p className="border border-dashed border-ink bg-paper p-5 leading-relaxed">{t("none")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {account.savedSearches.map((search) => {
              const filters = [
                search.kind && kind(search.kind),
                search.cpv && name(CPV_DIVISIONS, search.cpv),
                search.nuts && name(REGIONS, search.nuts),
                search.minAmount != null && `≥ ${formatEuro(search.minAmount, locale)}`,
                search.maxAmount != null && `≤ ${formatEuro(search.maxAmount, locale)}`,
              ].filter(Boolean);
              const query = Object.fromEntries(
                Object.entries({ q: search.q, kind: search.kind, cpv: search.cpv, nuts: search.nuts,
                  minAmount: search.minAmount, maxAmount: search.maxAmount })
                  .filter(([, v]) => v != null)
                  .map(([k, v]) => [k, String(v)]),
              );
              return (
                <li key={search.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3 border border-ink bg-paper p-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link href={{ pathname: "/search", query }} className="font-semibold underline">
                        {search.name}
                      </Link>
                      {filters.length > 0 && <p className="font-mono text-xs">{filters.join(" · ")}</p>}
                    </div>
                    <form action={deleteSearch}>
                      <input type="hidden" name="id" value={search.id} />
                      <button type="submit" className={BUTTON} aria-label={t("stopFor", { name: search.name })}>
                        {t("stop")}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ApiKeys keys={await getApiKeys()} />

      <details className="tear pt-5">
        <summary className="w-fit cursor-pointer font-semibold underline underline-offset-4">{t("deleteTitle")}</summary>
        <form action={deleteAccount} className="mt-3 flex flex-col gap-3">
          <p className="leading-relaxed">{t("deleteText")}</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" required className="size-5 accent-[var(--accent)]" />
            {t("deleteConfirm")}
          </label>
          <button type="submit" className="self-start rounded-sm bg-accent px-5 py-2.5 font-semibold text-accent-ink">
            {t("deleteButton")}
          </button>
        </form>
      </details>
    </main>
  );
}
