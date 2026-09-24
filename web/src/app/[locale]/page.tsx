import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ItemCard } from "@/components/items/ItemCard";
import { SearchBox } from "@/components/search/SearchBox";
import { Link } from "@/i18n/navigation";
import { type ItemSummary, searchItems } from "@/lib/api/client";
import { alternates } from "@/lib/site";

const EXAMPLES = ["προμήθεια φαρμάκων", "υπηρεσίες καθαρισμού", "katharismos", "πυροσβεστήρες"];

// The newest tenders; until notices are loaded, the newest records of any kind.
async function latestItems(): Promise<ItemSummary[]> {
  try {
    const notices = await searchItems({ kind: ["notice"], page: 1, pageSize: 3 });
    if (notices.ok && notices.result.items.length > 0) {
      return notices.result.items;
    }
    const any = await searchItems({ page: 1, pageSize: 3 });
    return any.ok ? any.result.items : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  return { alternates: alternates("/", (await params).locale) };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection(); // Render per request: the roll shows what was published last.
  const t = await getTranslations("Home");
  const items = await latestItems();

  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 py-12 sm:px-6 sm:py-20">
      <section className="flex flex-col gap-6" aria-labelledby="home-title">
        {/* Plain text, not a logo: the name may still change. */}
        <p className="self-start border-b border-dashed border-ink pb-3 font-mono text-4xl font-bold tracking-tight sm:text-6xl">
          ixnos-data
        </p>
        <h1 id="home-title" className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-7xl">
          {t("tagline")}
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed sm:text-xl">{t("intro")}</p>
        <SearchBox large />
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-xs font-bold uppercase tracking-wide">{t("examples")}</span>
          {EXAMPLES.map((example) => (
            <Link
              key={example}
              href={{ pathname: "/search", query: { q: example } }}
              className="rounded-sm border border-ink bg-paper px-2.5 py-1 no-underline transition-colors duration-150 hover:bg-ink hover:text-paper"
            >
              {example}
            </Link>
          ))}
        </p>
      </section>

      {items.length > 0 && (
        <section className="flex flex-col gap-5" aria-labelledby="latest-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
            <h2 id="latest-title" className="text-xl font-bold">
              {t("latest")}
            </h2>
            <Link href="/search" className="text-sm underline">
              {t("allLatest")}
            </Link>
          </div>
          <ol className="grid items-start gap-6 md:grid-cols-3">
            {items.map((item, index) => (
              <ItemCard key={`${item.source}:${item.sourceId}`} item={item} index={index} />
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
