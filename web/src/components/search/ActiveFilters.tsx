import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CPV_DIVISIONS } from "@/lib/cpv";
import { formatDate, formatEuro } from "@/lib/format";
import { REGIONS } from "@/lib/regions";
import type { SearchFormValues } from "@/lib/search";

const FILTERS = ["cpv", "nuts", "kind", "signal", "organisation", "minAmount", "maxAmount", "from", "to"] as const;
type Filter = (typeof FILTERS)[number];

// What the results are narrowed by, each removable in one click. Also the way out of an empty result.
export function ActiveFilters({ values, organisationName }: { values: SearchFormValues; organisationName?: string }) {
  const t = useTranslations("Search");
  const kind = useTranslations("Kind");
  const signal = useTranslations("Signal");
  const locale = useLocale();
  const active = FILTERS.filter((name) => values[name]);
  if (active.length === 0) {
    return null;
  }

  const name = (entry: { nameEl: string; nameEn: string }) => (locale === "en" ? entry.nameEn : entry.nameEl);
  const label = (filter: Filter, value: string): string => {
    switch (filter) {
      case "cpv": {
        const division = CPV_DIVISIONS.find((d) => d.code === value);
        return division ? name(division) : `CPV ${value}`;
      }
      case "nuts": {
        const region = REGIONS.find((r) => r.code === value);
        return region ? name(region) : value;
      }
      case "kind":
        return kind.has(value) ? kind(value) : value;
      case "signal":
        return signal.has(value) ? signal(value) : value;
      case "organisation":
        return organisationName ?? value;
      case "minAmount":
        return t("chipMin", { amount: formatEuro(Number(value), locale) ?? value });
      case "maxAmount":
        return t("chipMax", { amount: formatEuro(Number(value), locale) ?? value });
      case "from":
        return t("chipFrom", { date: formatDate(value, locale) ?? value });
      case "to":
        return t("chipTo", { date: formatDate(value, locale) ?? value });
    }
  };
  const without = (...names: string[]) => ({
    pathname: "/search" as const,
    query: Object.fromEntries(Object.entries(values).filter(([key, value]) => value && !names.includes(key))) as Record<
      string,
      string
    >,
  });

  return (
    <div role="group" aria-label={t("activeFilters")} className="flex flex-wrap items-center gap-2">
      {active.map((filter) => {
        const text = label(filter, values[filter]!);
        return (
          <Link
            key={filter}
            href={without(filter)}
            aria-label={t("removeFilter", { filter: text })}
            className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-sm border border-ink bg-paper px-2.5 py-1 text-sm no-underline transition-colors duration-150 hover:bg-ink hover:text-paper"
          >
            <span className="truncate">{text}</span>
            <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </Link>
        );
      })}
      {active.length > 1 && (
        <Link href={without(...FILTERS)} className="px-1 font-mono text-xs font-bold uppercase tracking-wide underline underline-offset-4">
          {t("clearFilters")}
        </Link>
      )}
    </div>
  );
}
