import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ItemCard } from "@/components/items/ItemCard";
import { HomeHero } from "@/components/home/HomeHero";
import { Link } from "@/i18n/navigation";
import { type ItemSummary, searchItems } from "@/lib/api/client";
import { alternates } from "@/lib/site";

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
      <HomeHero />

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
