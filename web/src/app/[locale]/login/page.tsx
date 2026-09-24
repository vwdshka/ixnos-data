import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requestLogin } from "@/lib/account";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Login");
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Login");
  const query = await searchParams;

  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <div>
        <div className="flex flex-col gap-5 border border-ink bg-paper p-6 sm:p-8">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="leading-relaxed">{t("intro")}</p>
          {query.expired && (
            <p role="alert" className="border-2 border-ink p-3 text-sm">
              {t("expired")}
            </p>
          )}
          {query.sent ? (
            <p role="status" className="tear pt-4 font-semibold leading-relaxed">
              {t("sent")}
            </p>
          ) : (
            <form action={requestLogin} className="flex flex-col gap-3">
              <label htmlFor="email" className="font-mono text-xs font-bold uppercase tracking-wide">
                {t("email")}
              </label>
              <div className="flex w-full border-2 border-ink bg-paper">
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base focus-visible:outline-offset-[-4px]"
                />
                <button
                  type="submit"
                  className="shrink-0 bg-accent px-5 font-semibold text-accent-ink transition-transform duration-150 ease-out active:scale-[0.97]"
                >
                  {t("submit")}
                </button>
              </div>
              {query.invalid && (
                <p role="alert" className="text-sm">
                  {t("invalid")}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
