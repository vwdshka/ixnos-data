import { useLocale, useTranslations } from "next-intl";
import { ItemCard } from "@/components/items/ItemCard";
import { ShareButton } from "@/components/items/ShareButton";
import { TapeClear } from "@/components/tape/TapeClear";
import type { components } from "@/lib/api/schema";
import { formatEuro, intlLocale } from "@/lib/format";
import { TAPE_MAX } from "@/lib/tape";

type ItemSummary = components["schemas"]["ItemSummary"];

// The taped records and their total slip. Shared by the full site and the static edition.
export function TapeStrip({ items }: { items: ItemSummary[] }) {
  const t = useTranslations("Tape");
  const item = useTranslations("Item");
  const locale = useLocale();

  // ΚΗΜΔΗΣ amounts exclude VAT and Διαύγεια amounts include it: two totals, never one.
  const counted = items.filter((i) => !i.cancelled && !i.amountImplausible);
  const exVat = counted.filter((i) => i.amountEur != null).reduce((sum, i) => sum + (i.amountEur ?? 0), 0);
  const incVat = counted.filter((i) => i.amountEur == null && i.amountWithVatEur != null).reduce((sum, i) => sum + (i.amountWithVatEur ?? 0), 0);
  const nf = new Intl.NumberFormat(intlLocale(locale));

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="max-w-[68ch] leading-relaxed">{items.length > 0 ? t("intro") : t("empty", { max: TAPE_MAX })}</p>
      </header>

      {items.length > 0 && (
        <>
          <ol className="tape-roll flex flex-col gap-3">
            {items.map((found, index) => (
              <ItemCard key={found.sourceId} item={found} index={index} />
            ))}
          </ol>

          <div className="slip-shadow tape-join">
            <section className="slip flex flex-col gap-2 px-5 pt-5 font-mono text-sm sm:px-8" aria-label={t("total")}>
              <div className="leader">
                <span>{t("records", { count: items.length })}</span>
                <span>{nf.format(items.length)}</span>
              </div>
              <dl className="total-rule flex flex-col gap-1.5 pb-3">
                {exVat > 0 && (
                  <div className="leader text-base font-bold sm:text-lg">
                    <dt>{t("totalEx")}</dt>
                    <dd>{formatEuro(exVat, locale)}</dd>
                  </div>
                )}
                {incVat > 0 && (
                  <div className="leader text-base font-bold sm:text-lg">
                    <dt>{t("totalInc")}</dt>
                    <dd>{formatEuro(incVat, locale)}</dd>
                  </div>
                )}
              </dl>
              {exVat > 0 && incVat > 0 && <p className="font-sans leading-relaxed">{t("totalNote")}</p>}
              <div className="flex flex-wrap gap-2 pt-2 font-sans print:hidden">
                <ShareButton title={t("title")} labels={{ share: item("share"), copied: item("copied") }} />
                <TapeClear label={t("clear")} />
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
