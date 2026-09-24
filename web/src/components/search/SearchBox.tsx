import { useLocale, useTranslations } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import { CPV_DIVISIONS } from "@/lib/cpv";
import { KINDS, REGIONS } from "@/lib/regions";
import { SIGNALS, type SearchFormValues } from "@/lib/search";
import { CpvPicker } from "./CpvPicker";
import { SearchForm } from "./SearchForm";


const SORTS = ["relevance", "newest", "deadline", "amount"] as const;

const FIELD =
  "min-h-11 w-full rounded-sm border border-ink bg-paper px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink transition-colors duration-150 hover:bg-counter";
const LABEL = "flex flex-col gap-1 font-mono text-xs font-bold uppercase tracking-wide";

// A GET form: without JavaScript it's a plain form with shareable /search?q=... URLs; with it,
// next/form navigates client-side so the results placeholder shows while they load.
export function SearchBox({
  values = {},
  showFilters = false,
  large = false,
}: {
  values?: SearchFormValues;
  showFilters?: boolean;
  large?: boolean;
}) {
  const t = useTranslations("Search");
  const kind = useTranslations("Kind");
  const signal = useTranslations("Signal");
  const locale = useLocale();
  const name = (entry: { nameEl: string; nameEn: string }) => (locale === "en" ? entry.nameEn : entry.nameEl);
  const moreOpen = Boolean(values.minAmount || values.maxAmount || values.from || values.to || values.signal);
  const activeCount = (["cpv", "nuts", "kind", "minAmount", "maxAmount", "from", "to", "signal"] as const).filter((n) => values[n]).length;

  return (
    <SearchForm action={getPathname({ href: "/search", locale })} role="search" className="flex w-full flex-col gap-4">
      {values.organisation && <input type="hidden" name="organisation" value={values.organisation} />}
      <div className="flex w-full border-2 border-ink bg-paper">
        <label htmlFor="q" className="sr-only">
          {t("label")}
        </label>
        <div className="search-feed relative flex min-w-0 flex-1 items-center">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder={t("placeholder")}
            aria-keyshortcuts="/"
            className={`min-w-0 flex-1 bg-transparent px-4 text-ink placeholder:text-ink placeholder:opacity-70 focus-visible:outline-none ${large ? "py-4 text-lg sm:text-xl" : "py-3"}`}
          />
          <kbd className="search-feed-key mr-3 hidden border border-ink px-1.5 font-mono text-xs leading-5 sm:block" title={t("shortcut")}>
            /
          </kbd>
        </div>
        <button
          type="submit"
          className="shrink-0 bg-accent px-5 font-semibold text-accent-ink transition-transform duration-150 ease-out active:scale-[0.97] sm:px-7"
        >
          {t("submit")}
        </button>
      </div>
      {showFilters && (
        <>
          {/* Phones: a checkbox reveals the filters, so results come first and no script is needed. */}
          <input id="show-filters" type="checkbox" className="peer sr-only" />
          <label
            htmlFor="show-filters"
            className="flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-sm border border-ink bg-paper px-3 py-2 text-sm font-semibold peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent sm:hidden"
          >
            {t("filtersToggle", { count: activeCount })}
          </label>
          <fieldset className="hidden flex-col gap-3 peer-checked:flex sm:flex">
            <legend className="sr-only">{t("filters")}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className={LABEL}>
                <span id="cpv-label">{t("cpv")}</span>
                <CpvPicker
                  value={values.cpv}
                  divisions={CPV_DIVISIONS.map((division) => ({ code: division.code, label: name(division) }))}
                  locale={locale}
                  labelledBy="cpv-label"
                  fieldClass={FIELD}
                  labels={{ any: t("anyCpv"), noMatch: t("noCpvMatch") }}
                />
              </div>
              <label className={LABEL}>
                {t("region")}
                <select name="nuts" defaultValue={values.nuts ?? ""} className={`${FIELD} font-sans`}>
                  <option value="">{t("anyRegion")}</option>
                  {REGIONS.map((region) => (
                    <option key={region.code} value={region.code}>
                      {name(region)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={LABEL}>
                {t("kind")}
                <select name="kind" defaultValue={values.kind ?? ""} className={`${FIELD} font-sans`}>
                  <option value="">{t("anyKind")}</option>
                  {KINDS.map((value) => (
                    <option key={value} value={value}>
                      {kind(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={LABEL}>
                {t("sort")}
                <select name="sort" defaultValue={values.sort ?? ""} className={`${FIELD} font-sans`}>
                  {SORTS.map((value) => (
                    <option key={value} value={value === "relevance" ? "" : value}>
                      {t(`sort_${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <details open={moreOpen} className="group">
              <summary className="w-fit cursor-pointer font-mono text-xs font-bold uppercase tracking-wide underline underline-offset-4">
                {t("moreFilters")}
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className={LABEL}>
                  {t("minAmount")}
                  <input name="minAmount" type="number" inputMode="numeric" min={0} step="any" defaultValue={values.minAmount} className={`${FIELD} font-mono`} />
                </label>
                <label className={LABEL}>
                  {t("maxAmount")}
                  <input name="maxAmount" type="number" inputMode="numeric" min={0} step="any" defaultValue={values.maxAmount} className={`${FIELD} font-mono`} />
                </label>
                <label className={LABEL}>
                  {t("from")}
                  <input name="from" type="date" defaultValue={values.from} className={`${FIELD} font-mono`} />
                </label>
                <label className={LABEL}>
                  {t("to")}
                  <input name="to" type="date" defaultValue={values.to} className={`${FIELD} font-mono`} />
                </label>
                <label className={`${LABEL} col-span-2`}>
                  {signal("label")}
                  <select name="signal" defaultValue={values.signal ?? ""} className={`${FIELD} font-sans`}>
                    <option value="">{signal("any")}</option>
                    {SIGNALS.map((value) => (
                      <option key={value} value={value}>
                        {signal(value)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
          </fieldset>
        </>
      )}
    </SearchForm>
  );
}
