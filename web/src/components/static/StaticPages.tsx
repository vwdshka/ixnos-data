"use client";

// The static edition's pages (GitHub Pages). Each reads its data in the browser (lib/static/data)
// and renders the same components the full site renders on the server.

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import NotFound from "@/app/[locale]/not-found";
import { ItemCard } from "@/components/items/ItemCard";
import { ItemReceipt } from "@/components/items/ItemReceipt";
import { StatusSlip } from "@/components/layout/StatusSlip";
import { OrganisationStatement } from "@/components/organisations/OrganisationStatement";
import { ActiveFilters } from "@/components/search/ActiveFilters";
import { EmptyReceipt, Pager, SearchLoading } from "@/components/search/ResultsParts";
import { SearchBox } from "@/components/search/SearchBox";
import { TapeStrip } from "@/components/tape/TapeStrip";
import { Link } from "@/i18n/navigation";
import { formatAgo, formatEuro } from "@/lib/format";
import { indexOf, loadHome, loadItem, loadOrganisation, loadStatus, search, summaries } from "@/lib/static/data";
import { readSearchValues } from "@/lib/search";
import { readTapeIds } from "@/lib/tape";
import { useLoad } from "./useLoad";

const PAGE_SIZE = 20;
const MAIN = "mx-auto flex w-full flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12";

function Loading() {
  const t = useTranslations("Static");
  return (
    <p role="status" className="font-mono text-sm">
      {t("loading")}
    </p>
  );
}

function Failed() {
  const t = useTranslations("Static");
  return (
    <p role="alert" className="border border-dashed border-ink bg-paper p-5 leading-relaxed">
      {t("failed")}
    </p>
  );
}

function useTitle(title: string | undefined) {
  useEffect(() => {
    if (title) {
      document.title = `${title} · ixnos-data`;
    }
  }, [title]);
}

export function StaticHome() {
  const t = useTranslations("Home");
  const loaded = useLoad("home", loadHome);
  if (loaded.status !== "done" || loaded.data.closing.length === 0) {
    return null;
  }
  const { openCount, closing } = loaded.data;
  return (
    <section className="flex flex-col gap-5" aria-labelledby="closing-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
        <h2 id="closing-title" className="text-xl font-bold">
          {t("closing")} <span className="font-mono text-sm font-normal">· {t("openCount", { count: openCount })}</span>
        </h2>
        <Link href={{ pathname: "/search", query: { kind: "notice", sort: "deadline" } }} className="text-sm underline">
          {t("allOpen")}
        </Link>
      </div>
      <ol className="grid items-start gap-6 md:grid-cols-3">
        {closing.slice(0, 6).map((item, index) => (
          <ItemCard key={item.sourceId} item={item} index={index} />
        ))}
      </ol>
    </section>
  );
}

export function StaticSearch() {
  const params = useSearchParams();
  const t = useTranslations("Search");
  const note = useTranslations("Static");
  const locale = useLocale();
  const values = readSearchValues((name) => params.get(name));
  const page = Math.max(1, Number(params.get("page")) || 1);
  const key = params.toString();
  const loaded = useLoad(key, () => search(values, page, PAGE_SIZE));
  useTitle(values.q ? `${values.q} – ${t("label")}` : t("label"));

  let results: React.ReactNode;
  if (loaded.status === "loading") {
    results = <SearchLoading />;
  } else if (loaded.status === "failed") {
    results = <Failed />;
  } else {
    const result = loaded.data;
    const pages = Math.ceil(result.total / PAGE_SIZE);
    const pageHref = (target: number) => ({
      pathname: "/search" as const,
      query: { ...Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]))), page: String(target) },
    });
    const modeNote = result.mode === "greeklish" ? t("greeklish") : result.mode === "identifier" ? t("identifier") : null;
    results = (
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 border-b-2 border-ink pb-3">
          <div role="status" className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold leading-tight">
              {t("results", { total: result.total })} {values.q && t("resultsFor", { query: values.q })}
            </h1>
            {modeNote && <p className="font-mono text-sm">{modeNote}</p>}
          </div>
          <ActiveFilters values={values} organisationName={result.items[0]?.organisation?.name} />
          {values.q && <p className="max-w-[68ch] text-sm leading-relaxed">{note("searchNote")}</p>}
        </div>
        {result.items.length === 0 ? (
          <EmptyReceipt text={t("noResults")} items={t("emptyItems")} total={t("emptyTotal")} amount={formatEuro(0, locale) ?? "0 €"} />
        ) : (
          <ol className="flex flex-col gap-4">
            {result.items.map((item, index) => (
              <ItemCard key={item.sourceId} item={item} index={index} />
            ))}
          </ol>
        )}
        <Pager page={page} pages={pages} href={pageHref} />
      </section>
    );
  }

  return (
    <main id="main" className={`${MAIN} max-w-3xl gap-8`}>
      <SearchBox key={key} values={values} showFilters />
      {results}
    </main>
  );
}

export function StaticRecord() {
  const id = useSearchParams().get("id") ?? "";
  const loaded = useLoad(id, () => loadItem(id));
  useTitle(loaded.status === "done" ? loaded.data?.item.title : undefined);
  if (loaded.status === "loading") {
    return (
      <main id="main" className={`${MAIN} max-w-3xl`}>
        <Loading />
      </main>
    );
  }
  if (loaded.status === "done" && !loaded.data) {
    return <NotFound />;
  }
  return (
    <main id="main" className={`${MAIN} max-w-3xl`}>
      {loaded.status === "failed" ? (
        <Failed />
      ) : (
        <ItemReceipt
          item={loaded.data!.item}
          similar={
            loaded.data!.similar.length > 0 && loaded.data!.item.cpv[0]
              ? { cpv: loaded.data!.item.cpv[0].code.slice(0, 5), items: loaded.data!.similar }
              : null
          }
          qrUrl={window.location.href}
          calendar={false}
        />
      )}
    </main>
  );
}

export function StaticOrganisation() {
  const id = useSearchParams().get("id") ?? "";
  const loaded = useLoad(id, () => loadOrganisation(id));
  useTitle(loaded.status === "done" ? loaded.data?.nameEl : undefined);
  if (loaded.status !== "done") {
    return (
      <main id="main" className={`${MAIN} max-w-3xl`}>
        {loaded.status === "loading" ? <Loading /> : <Failed />}
      </main>
    );
  }
  return loaded.data ? <OrganisationStatement organisation={loaded.data} /> : <NotFound />;
}

export function StaticStatus() {
  const loaded = useLoad("status", loadStatus);
  if (loaded.status === "loading") {
    return (
      <main id="main" className={`${MAIN} max-w-3xl`}>
        <Loading />
      </main>
    );
  }
  return <StatusSlip metrics={loaded.status === "done" ? loaded.data : null} />;
}

export function StaticTape() {
  const ids = readTapeIds(useSearchParams().get("ids"));
  const loaded = useLoad(ids.join(","), async () => {
    const found = await Promise.all(ids.map(indexOf));
    return summaries(found.filter((index): index is number => index !== undefined));
  });
  return (
    <main id="main" className={`${MAIN} max-w-3xl gap-8`}>
      {loaded.status === "loading" ? <Loading /> : loaded.status === "failed" ? <Failed /> : <TapeStrip items={loaded.data} />}
    </main>
  );
}

// "Data updated 12 minutes ago" in the footer, from the last refresh.
export function StaticFreshness() {
  const t = useTranslations("Layout");
  const locale = useLocale();
  const loaded = useLoad("status", loadStatus);
  if (loaded.status !== "done" || !loaded.data.updatedAt) {
    return null;
  }
  return (
    <p>
      <time dateTime={loaded.data.updatedAt}>{t("updated", { ago: formatAgo(loaded.data.updatedAt, locale) })}</time>{" "}
      <Link href="/status" className="underline">
        {t("status")}
      </Link>
    </p>
  );
}
