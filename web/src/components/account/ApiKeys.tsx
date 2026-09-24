"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { ApiKeyView } from "@/lib/api/client";
import { createApiKey, revokeApiKey } from "@/lib/account";

const BUTTON =
  "rounded-sm border border-ink px-3 py-2 text-sm font-semibold transition-[color,background-color,transform] duration-150 ease-out hover:bg-ink hover:text-paper active:scale-[0.97]";

// A new key only ever lives in this component's state: never in a URL, a cookie or server HTML.
export function ApiKeys({ keys }: { keys: ApiKeyView[] }) {
  const t = useTranslations("ApiKeys");
  const [created, create, pending] = useActionState(createApiKey, null);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="keys-title">
      <h2 id="keys-title" className="border-b-2 border-ink pb-2 text-xl font-bold">
        {t("title")}
      </h2>
      <p className="leading-relaxed">{t("intro")}</p>

      {created?.key && (
        <div role="status" className="flex flex-col gap-2 border-2 border-accent bg-paper p-4">
          <p className="font-semibold">{t("created")}</p>
          <code className="break-all font-mono text-sm select-all">{created.key}</code>
        </div>
      )}
      {created?.error && (
        <p role="alert" className="border-2 border-ink p-3 text-sm">
          {t("limit")}
        </p>
      )}

      {keys.length > 0 && (
        <ul className="flex flex-col gap-2">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 border border-ink bg-paper p-3">
              <span className="flex flex-col">
                <span className="font-semibold">{key.name}</span>
                <span className="font-mono text-xs">
                  {key.prefix}… · {t("perMinute", { count: key.permitsPerMinute })}
                </span>
              </span>
              <details className="group">
                <summary className={`${BUTTON} cursor-pointer list-none`} aria-label={t("revokeFor", { name: key.name })}>
                  {t("revoke")}
                </summary>
                <form action={revokeApiKey} className="mt-2 flex flex-col gap-2 text-sm">
                  <input type="hidden" name="id" value={key.id} />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" required className="size-5 accent-[var(--accent)]" />
                    {t("revokeConfirm")}
                  </label>
                  <button type="submit" className="self-start rounded-sm bg-accent px-3 py-2 font-semibold text-accent-ink">
                    {t("revokeButton")}
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}

      <form action={create} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 font-mono text-xs font-bold uppercase tracking-wide">
          {t("name")}
          <input
            name="name"
            maxLength={100}
            className="min-h-11 rounded-sm border border-ink bg-paper px-3 py-2 font-sans text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <button type="submit" disabled={pending} className={`${BUTTON} min-h-11`}>
          {t("create")}
        </button>
      </form>
    </section>
  );
}
