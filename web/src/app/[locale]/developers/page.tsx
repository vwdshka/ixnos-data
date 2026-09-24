import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { alternates, PUBLIC_API_URL, SITE_URL } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/developers">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Developers" });
  return { title: t("title"), description: t("intro"), alternates: alternates("/developers", locale) };
}

const EXPORTS = ["records.csv.gz", "records.jsonl.gz", "organisations.csv.gz", "manifest.json", "README.txt"];

export default async function DevelopersPage({ params }: PageProps<"/[locale]/developers">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Developers");

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <article className="flex flex-col gap-5 border border-ink bg-paper p-5 sm:p-10">
          <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
          <p className="max-w-[68ch] leading-relaxed">{t("intro")}</p>

          <section className="tear flex flex-col gap-2 pt-4">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t("apiTitle")}</h2>
            <p className="max-w-[68ch] leading-relaxed">{t("apiText")}</p>
            <p className="flex flex-wrap gap-3">
              <a href={`${PUBLIC_API_URL}/docs`} className="rounded-sm bg-accent px-4 py-2 font-semibold text-accent-ink transition-transform duration-150 ease-out active:scale-[0.97]">
                {t("docs")}
              </a>
              <a href={`${PUBLIC_API_URL}/openapi/v1.json`} className="rounded-sm border border-ink px-4 py-2 font-mono text-sm transition-[color,background-color,transform] duration-150 ease-out hover:bg-ink hover:text-paper active:scale-[0.97]">
                openapi/v1.json
              </a>
            </p>
            <pre className="overflow-x-auto border border-ink bg-counter p-3 font-mono text-xs">
              {`curl "${PUBLIC_API_URL}/v1/search?q=katharismos&nuts=EL54" \\\n  -H "X-Api-Key: ixn_…"`}
            </pre>
          </section>

          <section className="tear flex flex-col gap-2 pt-4">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t("limitsTitle")}</h2>
            <dl className="flex flex-col gap-1.5 font-mono text-sm">
              <div className="leader">
                <dt>{t("anonymous")}</dt>
                <dd>{t("perMinute", { count: 120 })}</dd>
              </div>
              <div className="leader">
                <dt>{t("withKey")}</dt>
                <dd>{t("perMinute", { count: 600 })}</dd>
              </div>
            </dl>
            <p className="max-w-[68ch] leading-relaxed">
              {t("keysText")}{" "}
              <Link href="/account" className="underline">
                {t("keysLink")}
              </Link>
            </p>
          </section>

          <section className="tear flex flex-col gap-2 pt-4">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t("exportsTitle")}</h2>
            <p className="max-w-[68ch] leading-relaxed">{t("exportsText")}</p>
            <ul className="flex flex-col gap-1 font-mono text-sm">
              {EXPORTS.map((file) => (
                <li key={file}>
                  <a href={`${SITE_URL}/exports/${file}`} className="underline">
                    {file}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="tear flex flex-col gap-2 pt-4">
            <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t("licenceTitle")}</h2>
            <p className="max-w-[68ch] leading-relaxed">{t("licenceText")}</p>
          </section>
        </article>
      </div>
    </main>
  );
}
