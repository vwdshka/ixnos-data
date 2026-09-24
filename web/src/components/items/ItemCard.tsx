import { useLocale, useTranslations } from "next-intl";
import { SignalBadges } from "@/components/items/SignalBadges";
import { Stage } from "@/components/items/Stage";
import { VoidStamp } from "@/components/items/VoidStamp";
import { Link } from "@/i18n/navigation";
import { recordHref, organisationHref } from "@/lib/links";
import type { ItemSummary } from "@/lib/api/client";
import { daysUntil, formatDate, formatDateTime, formatEuro } from "@/lib/format";

// Built for scanning: stage and date, who, what, then one line with the deadline and the amount.
export function ItemCard({ item, index = 0 }: { item: ItemSummary; index?: number }) {
  const t = useTranslations("Item");
  const locale = useLocale();
  // Διαύγεια states amounts with VAT only; ΚΗΜΔΗΣ without.
  const withVat = item.amountEur == null && item.amountWithVatEur != null;
  const amount = formatEuro(item.amountEur ?? item.amountWithVatEur, locale);
  const days = item.cancelled ? null : daysUntil(item.deadlineAt);
  const deadline = formatDateTime(item.deadlineAt, locale);

  return (
    <li className="slip-shadow print-in" style={{ "--i": index } as React.CSSProperties}>
      <article className="slip flex flex-col gap-2 px-4 pt-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <Stage kind={item.kind} />
          <span className="font-mono text-xs">{formatDate(item.publishedAt, locale)}</span>
        </div>

        {item.cancelled && <VoidStamp id={`void-card-${index}`} word={t("void")} label={t("cancelled")} />}

        <div className="flex flex-col gap-0.5">
          {item.organisation && (
            <Link
              href={organisationHref(item.organisation.id)}
              className="text-sm font-semibold no-underline hover:underline"
            >
              {item.organisation.name}
            </Link>
          )}
          <h2 className="text-base font-medium leading-snug sm:text-lg">
            <Link href={recordHref(item.sourceId)} className="no-underline hover:underline">
              {item.title}
            </Link>
          </h2>
        </div>

        <SignalBadges signals={item.signals} />

        {(amount || deadline) && (
          <dl className="tear flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-2 font-mono text-sm">
            {deadline && (
              <div className={days !== null ? "font-bold text-accent" : undefined}>
                <dt className="sr-only">{t("closes")}</dt>
                <dd>
                  {days !== null ? t("daysLeft", { days }) : t("closed")} · <span className="whitespace-nowrap">{deadline}</span>
                </dd>
              </div>
            )}
            {amount && (
              <div className="ml-auto text-right">
                <dt className="sr-only">{t(withVat ? "amountWithVat" : "amountShort")}</dt>
                <dd>
                  <span className="font-bold">{amount}</span>{" "}
                  <span className="text-xs">{t(withVat ? "incVat" : "exVat")}</span>
                  {item.amountImplausible && <span className="block font-sans text-xs">{t("implausible")}</span>}
                </dd>
              </div>
            )}
          </dl>
        )}
      </article>
    </li>
  );
}
