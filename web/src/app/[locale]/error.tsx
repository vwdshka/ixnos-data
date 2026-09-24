"use client";

import { useTranslations } from "next-intl";

// Shown when a page fails to render, e.g. the API is unreachable while loading a record.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Error");
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <div className="slip-shadow">
        <div className="slip flex flex-col gap-4 px-6 pt-7">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p role="alert" className="leading-relaxed">
            {t("text")}
          </p>
          <button
            type="button"
            onClick={reset}
            className="self-start rounded-sm bg-accent px-5 py-2.5 font-semibold text-accent-ink transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    </main>
  );
}
