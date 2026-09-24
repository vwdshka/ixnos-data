import { useTranslations } from "next-intl";
import { SearchBox } from "@/components/search/SearchBox";
import { Link } from "@/i18n/navigation";

const EXAMPLES = ["προμήθεια φαρμάκων", "υπηρεσίες καθαρισμού", "katharismos", "πυροσβεστήρες"];

// The home page's opening: name, tagline, search box and example searches.
export function HomeHero() {
  const t = useTranslations("Home");
  return (
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
  );
}
