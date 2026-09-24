import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";
import { ReceiptFoot, ReceiptHead } from "@/components/items/Receipt";
import { ShareButton } from "@/components/items/ShareButton";
import { SignalBadges } from "@/components/items/SignalBadges";
import { VoidStamp } from "@/components/items/VoidStamp";
import { PinButton } from "@/components/tape/PinButton";
import { CHAIN, Chain, Stage, stepOf } from "@/components/items/Stage";
import { getPathname, Link } from "@/i18n/navigation";
import { getItem, type ItemDetail, type ItemSummary, searchItems } from "@/lib/api/client";
import { codeLabel, daysUntil, formatDate, formatDateTime, formatEuro } from "@/lib/format";
import { alternates, openGraph, SITE_URL } from "@/lib/site";

// Metadata and the page both need the record; fetch it once per request.
const loadItem = cache((id: string) => getItem(decodeURIComponent(id)));

const SOURCE_NAMES: Record<string, string> = { khmdhs: "ΚΗΜΔΗΣ", diavgeia: "Διαύγεια" };

// The same CPV class (first five digits) and stage, newest first. Nothing when search is slow
// or down: it's an extra, not the page.
async function similarTo(item: ItemDetail): Promise<{ cpv: string; items: ItemSummary[] } | null> {
  const code = item.cpv[0]?.code;
  if (!code) {
    return null;
  }
  const cpv = code.slice(0, 5);
  const outcome = await searchItems({ cpv, kind: [item.kind], sort: "newest", pageSize: 6 }).catch(() => null);
  if (!outcome?.ok) {
    return null;
  }
  const items = outcome.result.items.filter((other) => other.sourceId !== item.sourceId).slice(0, 5);
  return items.length > 0 ? { cpv, items } : null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/items/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const item = await loadItem(id);
  if (!item) {
    return {};
  }
  // What a shared link's preview shows.
  const summary = [item.organisation?.name, formatEuro(item.amountEur, locale), item.description]
    .filter(Boolean)
    .join(" · ");
  const description = summary.length > 200 ? `${summary.slice(0, 199)}…` : summary;
  return {
    title: item.title,
    description,
    alternates: alternates(`/items/${encodeURIComponent(item.sourceId)}`, locale),
    openGraph: { ...openGraph(item.title, description, locale), type: "article" },
  };
}

// A paperclip over the join of two slips, drawn in the ink.
function Paperclip() {
  return (
    <svg viewBox="0 0 16 44" className="absolute -top-4 left-2.5 h-12 w-auto text-ink" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M5 30V9a3.5 3.5 0 0 1 7 0v25a5.5 5.5 0 0 1-11 0V6.5A5.5 5.5 0 0 1 12.5 5" transform="translate(1.5 2)" />
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="tear flex flex-col gap-3 pt-5">
      <h2 className="font-mono text-xs font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

type ItemLink = ItemDetail["links"][number];

// A linked record we hold opens here; a Διαύγεια decision we don't opens at the source.
function LinkedRecord({ link, relation, notInIxnosData }: { link: ItemLink; relation: string; notInIxnosData: string }) {
  if (link.kind) {
    return (
      <>
        <Stage kind={link.kind} />
        <Link href={`/items/${encodeURIComponent(link.sourceId)}`} className="underline">
          {link.title ?? link.sourceId}
        </Link>
      </>
    );
  }
  return (
    <>
      <span className="font-mono text-xs font-bold uppercase tracking-wide">{relation}</span>
      {link.source === "diavgeia" ? (
        <a
          href={`https://diavgeia.gov.gr/decision/view/${encodeURIComponent(link.sourceId)}`}
          className="self-start font-mono text-sm underline"
        >
          {link.sourceId}
        </a>
      ) : (
        <span className="text-sm">
          <span className="font-mono">{link.sourceId}</span> · {notInIxnosData}
        </span>
      )}
    </>
  );
}

export default async function ItemPage({ params }: PageProps<"/[locale]/items/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const item = await loadItem(id);
  if (!item) {
    notFound();
  }
  const t = await getTranslations("Item");
  const signal = await getTranslations("Signal");
  const similar = await similarTo(item);
  const amount = formatEuro(item.amountEur, locale);
  const amountWithVat = formatEuro(item.amountWithVatEur, locale);
  const period = [formatDate(item.startsOn, locale), formatDate(item.endsOn, locale)].filter(Boolean).join(" – ");
  const days = item.cancelled ? null : daysUntil(item.deadlineAt);
  // Chain relations are shown in the chain itself; the rest (amendments, decisions) below it.
  const onChain = stepOf(item.kind) !== undefined;
  const otherLinks = onChain
    ? item.links.filter((link) => !(CHAIN as readonly string[]).includes(link.relation))
    : item.links;

  const facts: [string, string | null][] = [
    [t("published"), formatDate(item.publishedAt, locale)],
    [t("signed"), formatDate(item.signedOn, locale)],
    [t("deadline"), formatDateTime(item.deadlineAt, locale)],
    [t("period"), period || null],
    [t("region"), item.nuts ? codeLabel(item.nuts, locale) : null],
    [t("procedure"), item.procedure ?? null],
    [t("offers"), item.offersReceived != null ? String(item.offersReceived) : null],
  ];

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      {item.supersededBy && (
        // The correction, clipped on top of the decision it replaced.
        <div className="relative z-10 -mb-9 mr-4 self-end rotate-2 sm:mr-10">
          <div className="slip-shadow">
            <p className="slip flex flex-col gap-1 pt-3 pr-4 pl-9 font-mono text-xs">
              <span aria-hidden="true" className="font-bold tracking-wide">
                {t("supersededShort")}
              </span>
              <span className="sr-only">{t("superseded")}</span>
              <Link href={`/items/${encodeURIComponent(item.supersededBy)}`} className="text-sm underline">
                {item.supersededBy}
              </Link>
            </p>
          </div>
          <Paperclip />
        </div>
      )}
      <div className="slip-shadow relative">
        <article className={`slip flex flex-col gap-5 px-5 sm:px-10 ${item.supersededBy ? "pt-14 sm:pt-12" : "pt-6 sm:pt-9"}`}>
          <ReceiptHead
            source={SOURCE_NAMES[item.source] ?? item.source}
            sourceId={item.sourceId}
            name={
              item.organisation && (
                <Link href={`/organisations/${encodeURIComponent(item.organisation.id)}`} className="no-underline hover:underline">
                  {item.organisation.name}
                </Link>
              )
            }
          />
          <header className="tear flex flex-col gap-4 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Stage kind={item.kind} />
              <span className="font-mono text-xs">{formatDate(item.publishedAt, locale)}</span>
            </div>
            {item.cancelled && (
              <VoidStamp
                id="void-record"
                large
                word={t("void")}
                date={formatDate(item.cancelledOn, locale)}
                label={t("voidLabel", { date: formatDate(item.cancelledOn, locale) ?? "" })}
              />
            )}
            <h1 className="text-2xl font-bold leading-tight tracking-[-0.01em] sm:text-3xl">{item.title}</h1>
          </header>

          {days !== null && (
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1 border-2 border-accent p-4 text-accent">
              <p className="font-mono text-6xl leading-none font-bold sm:text-7xl">
                {days > 0 ? days : t("today")}
              </p>
              <p className="pb-1 font-mono text-sm font-bold uppercase leading-snug">
                {days > 0 && (
                  <>
                    {t("daysUnit", { days })}
                    <br />
                  </>
                )}
                {t("untilDeadline")}
              </p>
            </div>
          )}
          {days !== null && (
            <a
              href={`/calendar/${encodeURIComponent(item.sourceId)}.ics?lang=${locale}`}
              download
              className="-mt-2 inline-flex min-h-11 items-center gap-2 self-start rounded-sm border border-ink px-3 py-2 text-sm font-semibold no-underline transition-colors duration-150 hover:bg-ink hover:text-paper"
            >
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="3" y="4.5" width="14" height="12.5" rx="1" />
                <path d="M3 8.5h14M7 2.5v4M13 2.5v4M10 11v4M8 13h4" strokeLinecap="round" />
              </svg>
              {t("addToCalendar")}
            </a>
          )}

          <dl className="tear flex flex-col gap-1.5 pt-5 font-mono text-sm">
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="leader">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>

          {(amount || amountWithVat) && (
            <dl className="total-rule tear flex flex-col gap-1.5 pt-4 pb-3 font-mono">
              {amount && (
                <div className="leader text-lg font-bold sm:text-xl">
                  <dt className="uppercase">{t("amount")}</dt>
                  <dd>{amount}</dd>
                </div>
              )}
              {item.amountImplausible && (
                <p className="font-sans text-sm leading-relaxed">{t("implausibleNote")}</p>
              )}
              {amountWithVat && (
                <div className="leader text-sm">
                  <dt>{t("amountWithVat")}</dt>
                  <dd>{amountWithVat}</dd>
                </div>
              )}
            </dl>
          )}

          {item.signals && item.signals.length > 0 && (
            <Section title={signal("title")}>
              <SignalBadges signals={item.signals} />
              <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
                {item.signals.map((name) => (
                  <li key={name} className="max-w-[68ch]">
                    {signal.has(`${name}_note`) ? signal(`${name}_note`) : name}
                  </li>
                ))}
              </ul>
              <Link href={{ pathname: "/how-it-works", hash: "signals" }} className="self-start text-sm underline underline-offset-4">
                {signal("learnMore")}
              </Link>
            </Section>
          )}

          {item.description && (
            <Section title={t("description")}>
              <p className="max-w-[68ch] leading-relaxed whitespace-pre-line">{item.description}</p>
            </Section>
          )}

          {item.cpv.length > 0 && (
            <Section title={t("cpv")}>
              <ul className="flex flex-col gap-1.5">
                {item.cpv.map((cpv) => (
                  <li key={cpv.code} className="grid grid-cols-[11ch_1fr] gap-3">
                    <Link
                      href={{ pathname: "/search", query: { cpv: cpv.code } }}
                      className="font-mono text-sm underline"
                      aria-label={t("cpvSearch", { code: cpv.code })}
                    >
                      {cpv.code}
                    </Link>
                    <span>{codeLabel(cpv, locale)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {item.contractors.length > 0 && (
            <Section title={t("contractors")}>
              <ul className="flex flex-col gap-2">
                {item.contractors.map((contractor) => (
                  <li
                    key={`${contractor.name}:${contractor.role}`}
                    className={contractor.amountEur != null ? "leader" : undefined}
                  >
                    <span>
                      <span className="font-semibold">{contractor.name}</span>{" "}
                      <span className="font-mono text-xs uppercase">{t(`role_${contractor.role}`)}</span>
                    </span>
                    {contractor.amountEur != null && (
                      <span className="font-mono text-sm font-bold">{formatEuro(contractor.amountEur, locale)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {onChain && (
            <Section title={t("chain")}>
              <Chain kind={item.kind} links={item.links} />
            </Section>
          )}

          {similar && (
            <Section title={t("similar")}>
              <ul className="flex flex-col gap-2.5">
                {similar.items.map((other) => (
                  <li key={other.sourceId} className="flex flex-col gap-0.5">
                    <Link href={`/items/${encodeURIComponent(other.sourceId)}`} className="leading-snug underline">
                      {other.title}
                    </Link>
                    <span className="font-mono text-xs">
                      {[other.organisation?.name, formatDate(other.publishedAt, locale), formatEuro(other.amountEur ?? other.amountWithVatEur, locale)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href={{ pathname: "/search", query: { cpv: similar.cpv, kind: item.kind, sort: "newest" } }}
                className="self-start text-sm underline underline-offset-4 print:hidden"
              >
                {t("similarAll")}
              </Link>
            </Section>
          )}

          {otherLinks.length > 0 && (
            <Section title={t("links")}>
              <ul className="flex flex-col gap-3">
                {otherLinks.map((link) => (
                  <li key={`${link.relation}:${link.sourceId}`} className="flex flex-col gap-1">
                    <LinkedRecord
                      link={link}
                      relation={t.has(`relation_${link.relation}`) ? t(`relation_${link.relation}`) : link.relation}
                      notInIxnosData={t("notInIxnosData")}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <footer className="tear flex flex-col items-center gap-4 pt-5 text-center font-mono text-xs leading-relaxed">
            <div className="flex flex-wrap justify-center gap-2 print:hidden">
              {item.documentUrl && (
                <a
                  href={item.documentUrl}
                  className="inline-flex min-h-11 items-center rounded-sm border border-ink px-3 py-2 font-sans text-sm font-semibold no-underline transition-colors duration-150 hover:bg-ink hover:text-paper"
                  rel="noopener"
                >
                  {t("document")}
                </a>
              )}
              <ShareButton title={item.title} labels={{ share: t("share"), copied: t("copied") }} />
              <PinButton sourceId={item.sourceId} labels={{ pin: t("pin"), unpin: t("unpin"), view: t.raw("tapeView") }} />
            </div>
            <div className="tear self-stretch pt-5">
              <ReceiptFoot
                url={SITE_URL + getPathname({ href: `/items/${encodeURIComponent(item.sourceId)}`, locale })}
                sourceId={item.sourceId}
                labels={{ thanks: t("receiptThanks"), number: t("receiptNumber"), scan: t("receiptScan"), qr: t("receiptQr") }}
              />
            </div>
            <p>{t("source", { source: SOURCE_NAMES[item.source] ?? item.source })}</p>
          </footer>
        </article>
      </div>
    </main>
  );
}
