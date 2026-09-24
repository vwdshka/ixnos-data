import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { CPV_DIVISIONS } from "@/lib/cpv";
import { REGIONS } from "@/lib/regions";

const FEEDS = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/feeds`;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "Alerts" });
  return { title: t("title") };
}

function FeedList({ title, feeds }: { title: string; feeds: { key: string; label: string }[] }) {
  return (
    <section className="tear flex flex-col gap-2 pt-4">
      <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{title}</h2>
      <ul className="flex flex-col gap-1.5">
        {feeds.map((feed) => (
          <li key={feed.key} className="leader">
            <span>{feed.label}</span>
            <a href={`${FEEDS}/${feed.key}.xml`} className="font-mono text-sm underline" type="application/rss+xml">
              RSS
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The static edition has no accounts, so alerts are RSS feeds: everything, per trade, per region.
export default async function AlertsPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const [t, locale] = await Promise.all([getTranslations("Alerts"), getLocale()]);
  const name = (entry: { nameEl: string; nameEn: string }) => (locale === "en" ? entry.nameEn : entry.nameEl);
  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <article className="flex flex-col gap-5 border border-ink bg-paper p-5 sm:p-10">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="max-w-[68ch] leading-relaxed">{t("intro")}</p>
        <p className="text-sm">{t("copy")}</p>
        <FeedList title={t("all")} feeds={[{ key: "all", label: t("all") }]} />
        <FeedList title={t("byRegion")} feeds={REGIONS.map((r) => ({ key: `region-${r.code}`, label: name(r) }))} />
        <FeedList title={t("byTrade")} feeds={CPV_DIVISIONS.map((d) => ({ key: `cpv-${d.code}`, label: `${d.code} · ${name(d)}` }))} />
      </article>
    </main>
  );
}
