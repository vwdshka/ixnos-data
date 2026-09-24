import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { alternates } from "@/lib/site";
import { SIGNALS } from "@/lib/search";

export async function generateMetadata({ params }: PageProps<"/[locale]/how-it-works">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Help" });
  return { title: t("title"), description: t("intro"), alternates: alternates("/how-it-works", locale) };
}

// Each section has an anchor, so record and organisation pages can link to the part they need.
const SECTIONS = ["sources", "stages", "codes", "amounts", "search", "corrections"] as const;

export default async function HowItWorksPage({ params }: PageProps<"/[locale]/how-it-works">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Help");
  const signal = await getTranslations("Signal");
  const organisation = await getTranslations("Organisation");

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <article className="flex flex-col gap-5 border border-ink bg-paper p-5 sm:p-10">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="max-w-[68ch] leading-relaxed">{t("intro")}</p>
        {SECTIONS.map((section) => (
          <section key={section} id={section} className="tear flex scroll-mt-6 flex-col gap-2 pt-4">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t(`${section}Title`)}</h2>
            <p className="max-w-[68ch] leading-relaxed whitespace-pre-line">{t(`${section}Text`)}</p>
          </section>
        ))}
        <section id="signals" className="tear flex scroll-mt-6 flex-col gap-3 pt-4">
          <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t("signalsTitle")}</h2>
          <p className="max-w-[68ch] leading-relaxed">{t("signalsText")}</p>
          <dl className="flex flex-col gap-3">
            {SIGNALS.map((name) => (
              <div key={name} className="flex flex-col gap-1">
                <dt className="font-semibold">{signal(name)}</dt>
                <dd className="max-w-[68ch] leading-relaxed">{signal(`${name}_note`)}</dd>
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <dt className="font-semibold">{organisation("concentration")}</dt>
              <dd className="max-w-[68ch] leading-relaxed">{t("concentrationText")}</dd>
            </div>
          </dl>
        </section>
      </article>
    </main>
  );
}
