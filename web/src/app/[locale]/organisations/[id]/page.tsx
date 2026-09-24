import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";
import { ItemCard } from "@/components/items/ItemCard";
import { Link } from "@/i18n/navigation";
import { getOrganisation } from "@/lib/api/client";
import { formatEuro, intlLocale } from "@/lib/format";
import { alternates, openGraph } from "@/lib/site";
import { SpendChart } from "@/components/organisations/SpendChart";
import { TickingTotal } from "@/components/organisations/TickingTotal";

// A row label with its VAT basis on a small second line, so the leader and value stay on line one.
function Labelled({ label, basis }: { label: string; basis: string }) {
  return (
    <span className="flex flex-col">
      <span>{label}</span>
      <span className="text-xs">{basis}</span>
    </span>
  );
}

function Ledger({ title, rows }: { title: string; rows: { key: string; label: React.ReactNode; value: string }[] }) {
  return (
    <div className="tear flex flex-col gap-2 pt-4">
      <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{title}</h2>
      <dl className="flex flex-col gap-1.5 font-mono text-sm">
        {rows.map((row) => (
          <div key={row.key} className="leader">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const loadOrganisation = cache((id: string) => getOrganisation(decodeURIComponent(id)));

export async function generateMetadata({ params }: PageProps<"/[locale]/organisations/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const organisation = await loadOrganisation(id);
  if (!organisation) {
    return {};
  }
  const t = await getTranslations({ locale, namespace: "Organisation" });
  const awarded = formatEuro(organisation.awardedLast12MonthsEur, locale);
  const description = awarded ? `${t("awarded")}: ${awarded}` : undefined;
  return {
    title: organisation.nameEl,
    description,
    alternates: alternates(`/organisations/${encodeURIComponent(organisation.id)}`, locale),
    openGraph: openGraph(organisation.nameEl, description, locale),
  };
}

export default async function OrganisationPage({ params }: PageProps<"/[locale]/organisations/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const organisation = await loadOrganisation(id);
  if (!organisation) {
    notFound();
  }
  const t = await getTranslations("Organisation");
  const kind = await getTranslations("Kind");
  const signal = await getTranslations("Signal");
  const awarded = formatEuro(organisation.awardedLast12MonthsEur, locale);
  const paid = formatEuro(organisation.paidLast12MonthsEur, locale);
  const money = (amount: number) => (amount > 0 ? (formatEuro(amount, locale) ?? "") : "—");
  const counts = Object.entries(organisation.itemCounts).sort(([, a], [, b]) => b - a);
  const nf = new Intl.NumberFormat(intlLocale(locale));

  return (
    <main id="main" className="mx-auto grid w-full max-w-5xl flex-1 items-start gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="slip-shadow lg:sticky lg:top-6">
        <section className="slip flex flex-col gap-5 px-5 pt-6 sm:px-8" aria-labelledby="org-title">
          <h1 id="org-title" className="text-2xl font-bold leading-tight tracking-[-0.01em] sm:text-3xl">
            {organisation.nameEl}
          </h1>

          <dl className="tear flex flex-col gap-1.5 pt-4 font-mono text-sm">
            {organisation.taxId && (
              <div className="leader">
                <dt>{t("taxId")}</dt>
                <dd>{organisation.taxId}</dd>
              </div>
            )}
            {organisation.parent && (
              <div className="flex flex-col gap-0.5">
                <dt>{t("parent")}</dt>
                <dd className="font-sans text-base">
                  <Link href={`/organisations/${encodeURIComponent(organisation.parent.id)}`} className="underline">
                    {organisation.parent.name}
                  </Link>
                </dd>
              </div>
            )}
            {organisation.website && (
              <div className="flex flex-col gap-0.5">
                <dt>{t("website")}</dt>
                <dd className="break-all">
                  <a href={organisation.website} className="underline" rel="noopener nofollow">
                    {organisation.website}
                  </a>
                </dd>
              </div>
            )}
          </dl>

          {counts.length > 0 && (
            <div className="tear flex flex-col gap-2 pt-4">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t("activity")}</h2>
              <dl className="flex flex-col gap-1.5 font-mono text-sm">
                {counts.map(([name, count]) => (
                  <div key={name} className="leader">
                    <dt>{kind.has(name) ? kind(name) : name}</dt>
                    <dd>{nf.format(count)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Awarded (ΚΗΜΔΗΣ, without VAT) next to approved and paid (Διαύγεια, with VAT). */}
          {organisation.awardedByYear.length > 0 && (
            <p className="tear pt-4 text-sm leading-relaxed">{t("matchNote")}</p>
          )}
          <SpendChart years={organisation.awardedByYear} />
          {organisation.awardedByYear.map((year) => (
            <Ledger
              key={year.year}
              title={`${t("year")} ${year.year}`}
              rows={[
                { key: "awarded", label: <Labelled label={t("awardedRow", { count: year.awards })} basis={t("exVat")} />, value: money(year.amountEur) },
                { key: "approved", label: <Labelled label={t("approvedRow")} basis={t("incVat")} />, value: money(year.approvedEur) },
                { key: "paid", label: <Labelled label={t("paidRow")} basis={t("incVat")} />, value: money(year.paidEur) },
              ]}
            />
          ))}

          {organisation.topContractors.length > 0 && (
            <div className="tear flex flex-col gap-3 pt-4">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t("topContractors")}</h2>
              <ul className="flex flex-col gap-3">
                {organisation.topContractors.map((contractor) => (
                  <li key={contractor.name} className="flex flex-col gap-1">
                    <span className="font-semibold leading-snug">{contractor.name}</span>
                    <dl className="flex flex-col gap-1 font-mono text-sm">
                      <div className="leader">
                        <dt><Labelled label={t("awardedRow", { count: contractor.awards })} basis={t("exVat")} /></dt>
                        <dd>{money(contractor.amountEur)}</dd>
                      </div>
                      <div className="leader">
                        <dt><Labelled label={t("paidRow")} basis={t("incVat")} /></dt>
                        <dd>{money(contractor.paidEur)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {organisation.dominantSupplier && (
            <div className="tear flex flex-col gap-2 pt-4">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{t("concentration")}</h2>
              <p className="leading-relaxed">
                {t("dominantSupplier", {
                  name: organisation.dominantSupplier.name,
                  awards: organisation.dominantSupplier.awards,
                  total: organisation.dominantSupplier.totalAwards,
                  share: new Intl.NumberFormat(intlLocale(locale), { style: "percent" }).format(organisation.dominantSupplier.share),
                })}
              </p>
              <p className="text-sm leading-relaxed">{t("dominantNote")}</p>
              <Link href={{ pathname: "/how-it-works", hash: "signals" }} className="self-start text-sm underline underline-offset-4">
                {signal("learnMore")}
              </Link>
            </div>
          )}

          {(awarded || paid) && (
            <dl className="total-rule tear flex flex-col gap-3 pt-4 pb-3 font-mono">
              {awarded && (
                <div className="flex flex-col gap-1">
                  <dt className="text-sm font-bold">{t("awarded")}</dt>
                  <dd className="text-3xl font-bold">
                    <TickingTotal value={awarded} />
                  </dd>
                </div>
              )}
              {paid && (
                <div className="flex flex-col gap-1">
                  <dt className="text-sm font-bold">{t("paid")}</dt>
                  <dd className="text-3xl font-bold">
                    <TickingTotal value={paid} />
                  </dd>
                </div>
              )}
            </dl>
          )}
        </section>
      </div>

      {organisation.recentItems.length > 0 && (
        <section className="flex flex-col gap-5" aria-labelledby="recent-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
            <h2 id="recent-title" className="text-xl font-bold">
              {t("recent")}
            </h2>
            <Link
              href={{ pathname: "/search", query: { organisation: organisation.id } }}
              className="text-sm underline"
            >
              {t("all")}
            </Link>
          </div>
          <ol className="flex flex-col gap-6">
            {organisation.recentItems.map((item, index) => (
              <ItemCard key={`${item.source}:${item.sourceId}`} item={item} index={index} />
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
