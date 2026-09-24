import { useLocale, useTranslations } from "next-intl";
import type { components } from "@/lib/api/schema";
import { formatAgo, formatDateTime, intlLocale } from "@/lib/format";

type PublicMetrics = components["schemas"]["PublicMetrics"];

const SOURCE_NAMES: Record<string, string> = { khmdhs: "ΚΗΜΔΗΣ", diavgeia: "Διαύγεια" };

function Ledger({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className="tear flex flex-col gap-2 pt-4">
      <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{title}</h2>
      <dl className="flex flex-col gap-1.5 font-mono text-sm tabular-nums">
        {rows.map(([label, value]) => (
          <div key={label} className="leader">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// The status slip: per source, how fresh the data is, and the latest ingestion runs. The static
// edition has no accounts, so it passes the metrics without the usage figures.
export function StatusSlip({ metrics }: { metrics: PublicMetrics | Pick<PublicMetrics, "sources" | "recentRuns"> | null }) {
  const t = useTranslations("Status");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(intlLocale(locale));
  const lag = (minutes: number) =>
    minutes < 120 ? t("minutes", { count: Math.round(minutes) })
    : minutes < 48 * 60 ? t("hours", { count: Math.round(minutes / 60) })
    : t("days", { count: Math.round(minutes / 1440) });

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="slip-shadow">
        <article className="slip flex flex-col gap-5 px-5 pt-6 pb-2 sm:px-10 sm:pt-9">
          <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
          <p className="max-w-[68ch] leading-relaxed">{t("intro")}</p>
          {!metrics ? (
            <p className="border-2 border-ink px-3 py-2 font-semibold">{t("unavailable")}</p>
          ) : (
            <>
              {metrics.sources.map((source) => (
                <Ledger
                  key={source.source}
                  title={SOURCE_NAMES[source.source] ?? source.source}
                  rows={[
                    [t("records"), nf.format(source.records)],
                    [t("updated"), source.updatedAt ? formatAgo(source.updatedAt, locale) : "—"],
                    [t("lag"), source.lagMinutes != null ? lag(source.lagMinutes) : "—"],
                    [t("runs"), t("runsValue", { succeeded: source.runsSucceeded, total: source.runsTotal })],
                  ]}
                />
              ))}
              {"users" in metrics && (
                <Ledger
                  title={t("usage")}
                  rows={[
                    [t("users"), nf.format(metrics.users)],
                    [t("savedSearches"), nf.format(metrics.savedSearches)],
                    [t("alerts"), nf.format(metrics.alertsLast7Days)],
                    [t("apiKeys"), nf.format(metrics.apiKeys)],
                  ]}
                />
              )}
              {metrics.recentRuns.length > 0 && (
                <section className="tear flex flex-col gap-2 pt-4">
                  <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t("recentRuns")}</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] font-mono text-xs tabular-nums">
                      <thead>
                        <tr className="border-b border-ink text-left">
                          <th className="py-1 pr-3 font-bold">{t("started")}</th>
                          <th className="py-1 pr-3 font-bold">{t("source")}</th>
                          <th className="py-1 pr-3 font-bold">{t("result")}</th>
                          <th className="py-1 pr-3 text-right font-bold">{t("fetched")}</th>
                          <th className="py-1 pr-3 text-right font-bold">{t("new")}</th>
                          <th className="py-1 text-right font-bold">{t("duration")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.recentRuns.map((run) => (
                          <tr key={`${run.source}:${run.startedAt}`} className="border-b border-dotted border-ink">
                            <td className="py-1 pr-3 whitespace-nowrap">{formatDateTime(run.startedAt, locale)}</td>
                            <td className="py-1 pr-3">{SOURCE_NAMES[run.source] ?? run.source} · {run.mode}</td>
                            <td className={`py-1 pr-3 ${run.status === "succeeded" ? "" : "font-bold text-accent"}`}>
                              {t.has(`status_${run.status}`) ? t(`status_${run.status}`) : run.status}
                            </td>
                            <td className="py-1 pr-3 text-right">{nf.format(run.fetched)}</td>
                            <td className="py-1 pr-3 text-right">{nf.format(run.inserted)}</td>
                            <td className="py-1 text-right">{run.durationSeconds != null ? `${nf.format(Math.round(run.durationSeconds))} s` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </article>
      </div>
    </main>
  );
}
