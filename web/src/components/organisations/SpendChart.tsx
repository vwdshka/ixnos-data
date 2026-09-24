import { useLocale, useTranslations } from "next-intl";
import type { components } from "@/lib/api/schema";
import { formatEuro, intlLocale } from "@/lib/format";

type YearSpend = components["schemas"]["YearSpend"];

// Spending per year as a dot-matrix printout on the till roll: one line per year, awarded
// (ΚΗΜΔΗΣ, excl. VAT) in solid cells above paid (Διαύγεια, incl. VAT) in hatched cells, on one
// euro scale. Never stacked or summed: the two are on different VAT bases. It is a table, so
// screen readers get years and amounts; the ledgers below add approvals.
export function SpendChart({ years }: { years: YearSpend[] }) {
  const t = useTranslations("Organisation");
  const locale = useLocale();
  const sorted = [...years].sort((a, b) => b.year - a.year).slice(0, 8);
  const max = Math.max(...sorted.flatMap((y) => [y.amountEur, y.paidEur]));
  if (sorted.length === 0 || max <= 0) {
    return null;
  }

  const compact = new Intl.NumberFormat(intlLocale(locale), { notation: "compact", maximumFractionDigits: 1 });
  const series = [
    { key: "awarded", value: (y: YearSpend) => y.amountEur, label: t("stripAwarded"), cells: "dot-cells" },
    { key: "paid", value: (y: YearSpend) => y.paidEur, label: t("stripPaid"), cells: "dot-cells dot-cells-hatched" },
  ];

  return (
    <figure className="tear flex flex-col gap-3 pt-4">
      <figcaption className="flex flex-col gap-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wide">{t("stripTitle")}</span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className={`${s.cells} inline-block w-[3ch] font-mono`} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <table className="w-full border-collapse font-mono text-xs">
        <thead className="sr-only">
          <tr>
            <th scope="col">{t("year")}</th>
            <th scope="col">{t("stripTitle")}</th>
          </tr>
        </thead>
        {sorted.map((year) => (
          <tbody key={year.year} className="border-b border-dotted border-ink last:border-b-0">
            {series.map((s, index) => {
              const value = s.value(year);
              return (
                <tr key={s.key}>
                  {index === 0 && (
                    <th scope="row" rowSpan={series.length} className="w-[5ch] py-1.5 pr-2 text-left align-top font-bold">
                      {year.year}
                    </th>
                  )}
                  <td className={index === 0 ? "pt-1.5 pb-0.5" : "pt-0.5 pb-1.5"} title={`${year.year} · ${s.label}: ${formatEuro(value, locale) ?? "0"}`}>
                    <span className="flex items-center gap-2">
                      <span className="sr-only">{s.label}:</span>
                      <span className="min-w-0 flex-1" aria-hidden="true">
                        <span className={`${s.cells} block`} style={{ width: `${value > 0 ? Math.max(2, (100 * value) / max) : 0}%` }} />
                      </span>
                      <span className="w-[8ch] shrink-0 text-right tabular-nums">{value > 0 ? `${compact.format(value)} €` : "—"}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </figure>
  );
}
