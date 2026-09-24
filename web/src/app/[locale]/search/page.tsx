import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ItemCard } from "@/components/items/ItemCard";
import { ActiveFilters } from "@/components/search/ActiveFilters";
import { SearchBox } from "@/components/search/SearchBox";
import { Link } from "@/i18n/navigation";
import { saveSearch } from "@/lib/account";
import { ApiError, type SearchOutcome, searchItems } from "@/lib/api/client";
import { formatEuro } from "@/lib/format";
import { pageWindow, readSearchValues, searchQueryString, type SearchFormValues, toSearchParams } from "@/lib/search";

const PAGE_SIZE = 20;
// Matches the limit in search.csv/route.ts.
const CSV_LIMIT = 1000;

const PAGER =
  "rounded-sm border border-ink bg-paper px-3 py-2 no-underline transition-colors duration-150 hover:bg-ink hover:text-paper";

// No results, printed as what it is: a receipt with nothing on it.
function EmptyReceipt({ text, items, total, amount }: { text: string; items: string; total: string; amount: string }) {
  return (
    <div className="slip-shadow print-in mx-auto w-full max-w-sm">
      <div role="status" className="slip flex flex-col gap-3 px-6 pt-5 font-mono text-sm">
        <div className="leader">
          <span>{items}</span>
          <span>0</span>
        </div>
        <div className="total-rule leader pb-2 text-lg font-bold">
          <span>{total}</span>
          <span>{amount}</span>
        </div>
        <p className="font-sans text-base leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="border border-dashed border-ink bg-paper p-5 leading-relaxed">
      {children}
    </p>
  );
}

type Query = Record<string, string | string[] | undefined>;

// Feed readers find the RSS feed of the search on the page itself.
export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/search">): Promise<Metadata> {
  const { locale } = await params;
  const query: Query = await searchParams;
  const values = readSearchValues((name) => query[name]);
  const t = await getTranslations("Search");
  return {
    title: values.q ? `${values.q} – ${t("label")}` : t("label"),
    robots: { index: false },
    alternates: { types: { "application/rss+xml": [{ url: feedHref(values, locale), title: t("rssTitle") }] } },
  };
}

const feedHref = (values: SearchFormValues, locale: string) => `/feed.xml?${searchQueryString({ ...values, sort: undefined })}&lang=${locale}`;
const csvHref = (values: SearchFormValues, locale: string) => `/search.csv?${searchQueryString(values)}&lang=${locale}`;

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query: Query = await searchParams;
  const values = readSearchValues((name) => query[name]);
  const page = Math.max(1, Number([query.page].flat()[0]) || 1);

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <SearchBox values={values} showFilters />
      {/* Keyed by the query, so every new search shows the placeholder while results load. */}
      <Suspense key={JSON.stringify([values, page])} fallback={<ResultsLoading />}>
        <Results values={values} page={page} locale={locale} />
      </Suspense>
    </main>
  );
}

async function ResultsLoading() {
  const t = await getTranslations("Search");
  return (
    <section aria-busy="true" className="flex flex-col gap-6">
      <div role="status" className="flex flex-col gap-1 border-b-2 border-ink pb-3">
        <p className="text-2xl font-bold">{t("loading")}</p>
        <p className="late font-mono text-sm">{t("slowHint")}</p>
      </div>
      {/* The printer at work: a slip feeding out of the slot, the print head's cursor blinking. */}
      <div className="flex flex-col" aria-hidden="true">
        <div className="printer-slot" />
        <div className="printer-paper overflow-hidden px-3">
          <div className="slip-shadow printer-feed">
            <div className="slip flex flex-col gap-2.5 px-5 pt-4 font-mono text-xs">
              <p className="font-bold tracking-[0.2em]">
                {t("printing")}
                <span className="printer-cursor" />
              </p>
              <span className="printed-line w-40" />
              <span className="printed-line w-3/4" />
              <span className="printed-line w-1/2" />
              <span className="tear mt-1 block pt-2">
                <span className="printed-line ml-auto w-24" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

async function Results({ values, page, locale }: { values: SearchFormValues; page: number; locale: string }) {
  const t = await getTranslations("Search");

  let outcome: SearchOutcome | null = null;
  let timedOut = false;
  try {
    outcome = await searchItems(toSearchParams(values, page, PAGE_SIZE));
  } catch (error) {
    // Either the web app stopped waiting, or the database cancelled the query (the API's 503).
    timedOut =
      (error instanceof DOMException && error.name === "TimeoutError") || (error instanceof ApiError && error.status === 503);
  }

  if (outcome === null) {
    return <Notice>{t(timedOut ? "timeout" : "unavailable")}</Notice>;
  }
  if (!outcome.ok) {
    return (
      <div role="alert" className="border-2 border-ink bg-paper p-4">
        <p className="font-semibold">{t("invalid")}</p>
        <ul className="mt-1 list-disc pl-6">
          {Object.entries(outcome.errors).map(([name, messages]) => (
            <li key={name}>
              {t.has(name) ? t(name as "kind") : name}: {messages.join(" ")}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const result = outcome.result;
  const pages = Math.ceil(result.total / result.pageSize);
  const pageHref = (target: number) => ({
    pathname: "/search" as const,
    query: { ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)), page: String(target) },
  });
  const modeNote =
    result.mode === "greeklish" ? t("greeklish") : result.mode === "identifier" ? t("identifier")
    : result.mode === "tax_id" ? t("taxId") : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 border-b-2 border-ink pb-3">
        <div role="status" className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold leading-tight">
            {t(result.totalCapped ? "resultsCapped" : "results", { total: result.total })}{" "}
            {values.q && t("resultsFor", { query: values.q })}
          </h1>
          {modeNote && <p className="font-mono text-sm">{modeNote}</p>}
        </div>
        <ActiveFilters values={values} organisationName={result.items[0]?.organisation?.name} />
        {(values.q || values.cpv || values.nuts || values.kind) && (
          <form action={saveSearch} className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {(["q", "kind", "cpv", "nuts", "minAmount", "maxAmount"] as const).map(
              (name) => values[name] && <input key={name} type="hidden" name={name} value={values[name]} />,
            )}
            <button
              type="submit"
              className="rounded-sm border border-ink bg-paper px-3 py-2 text-sm font-semibold transition-colors duration-150 hover:bg-ink hover:text-paper"
            >
              {t("save")}
            </button>
            {(values.organisation || values.from || values.to) && <p className="text-sm">{t("saveNote")}</p>}
          </form>
        )}
        {result.items.length > 0 && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs font-bold uppercase tracking-wide">
            <a href={feedHref(values, locale)} className="underline underline-offset-4" title={t("rssTitle")}>
              {t("rss")}
            </a>
            <a href={csvHref(values, locale)} className="underline underline-offset-4" download>
              {t("csv", { count: Math.min(result.total, CSV_LIMIT) })}
            </a>
          </p>
        )}
      </div>
      {result.items.length === 0 ? (
        <EmptyReceipt text={t("noResults")} items={t("emptyItems")} total={t("emptyTotal")} amount={formatEuro(0, locale) ?? "0 €"} />
      ) : (
        <ol className="flex flex-col gap-4">
          {result.items.map((item, index) => (
            <ItemCard key={`${item.source}:${item.sourceId}`} item={item} index={index} />
          ))}
        </ol>
      )}
      {pages > 1 && (
        <nav className="flex items-center justify-between gap-4 font-mono text-sm" aria-label={t("pagination")}>
          {page > 1 ? <Link href={pageHref(page - 1)} className={PAGER}>{t("previous")}</Link> : <span />}
          <span className="sm:hidden">{t("page", { page, pages })}</span>
          <ol className="hidden items-center gap-1.5 sm:flex">
            {pageWindow(page, pages).map((n, i) =>
              n === null ? (
                <li key={`gap-${i}`} aria-hidden="true" className="px-1">…</li>
              ) : (
                <li key={n}>
                  {n === page ? (
                    <span aria-current="page" className="inline-flex min-w-10 justify-center rounded-sm bg-ink px-3 py-2 text-paper">{n}</span>
                  ) : (
                    <Link href={pageHref(n)} aria-label={t("page", { page: n, pages })} className={`${PAGER} inline-flex min-w-10 justify-center`}>{n}</Link>
                  )}
                </li>
              ),
            )}
          </ol>
          {page < pages ? <Link href={pageHref(page + 1)} className={PAGER}>{t("next")}</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
