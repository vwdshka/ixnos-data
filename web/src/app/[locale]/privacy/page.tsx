import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { alternates } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: t("title"), alternates: alternates("/privacy", locale) };
}

const SECTIONS = ["stored", "use", "records", "delete", "contact"] as const;

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Privacy");

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <article className="flex flex-col gap-5 border border-ink bg-paper p-5 sm:p-10">
          <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
          <p className="max-w-[68ch] leading-relaxed">{t("intro")}</p>
          {SECTIONS.map((section) => (
            <section key={section} className="tear flex flex-col gap-2 pt-4">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t(`${section}Title`)}</h2>
              <p className="max-w-[68ch] leading-relaxed">{t(`${section}Text`)}</p>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
