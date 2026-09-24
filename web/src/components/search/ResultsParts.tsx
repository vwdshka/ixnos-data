import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pageWindow } from "@/lib/search";

// Pieces of the search results, shared by the full site (rendered on the server) and the static
// edition (rendered in the browser).

const PAGER =
  "rounded-sm border border-ink bg-paper px-3 py-2 no-underline transition-colors duration-150 hover:bg-ink hover:text-paper";

// No results, printed as what it is: a receipt with nothing on it.
export function EmptyReceipt({ text, items, total, amount }: { text: string; items: string; total: string; amount: string }) {
  return (
    <div className="slip-shadow print-in mx-auto w-full max-w-sm">
      <div role="status" className="slip flex flex-col gap-3 px-6 pt-5 font-mono text-sm">
        <div className="leader">
          <span>{items}</span>
          <span>0</span>
        </div>
        <div className="total-rule leader pb-2 text-lg font-bold">
          <span>{total}</span>
          <span>{amount}</span>
        </div>
        <p className="font-sans text-base leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

// While results load: a slip feeding out of the printer, the print head's cursor blinking.
export function SearchLoading() {
  const t = useTranslations("Search");
  return (
    <section aria-busy="true" className="flex flex-col gap-6">
      <div role="status" className="flex flex-col gap-1 border-b-2 border-ink pb-3">
        <p className="text-2xl font-bold">{t("loading")}</p>
        <p className="late font-mono text-sm">{t("slowHint")}</p>
      </div>
      <div className="flex flex-col" aria-hidden="true">
        <div className="printer-slot" />
        <div className="printer-paper overflow-hidden px-3">
          <div className="slip-shadow printer-feed">
            <div className="slip flex flex-col gap-2.5 px-5 pt-4 font-mono text-xs">
              <p className="font-bold tracking-[0.2em]">
                {t("printing")}
                <span className="printer-cursor" />
              </p>
              <span className="printed-line w-40" />
              <span className="printed-line w-3/4" />
              <span className="printed-line w-1/2" />
              <span className="tear mt-1 block pt-2">
                <span className="printed-line ml-auto w-24" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Previous / numbered pages / next.
export function Pager({ page, pages, href }: { page: number; pages: number; href: (page: number) => { pathname: "/search"; query: Record<string, string> } }) {
  const t = useTranslations("Search");
  if (pages <= 1) {
    return null;
  }
  return (
    <nav className="flex items-center justify-between gap-4 font-mono text-sm" aria-label={t("pagination")}>
      {page > 1 ? <Link href={href(page - 1)} className={PAGER}>{t("previous")}</Link> : <span />}
      <span className="sm:hidden">{t("page", { page, pages })}</span>
      <ol className="hidden items-center gap-1.5 sm:flex">
        {pageWindow(page, pages).map((n, i) =>
          n === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1">…</li>
          ) : (
            <li key={n}>
              {n === page ? (
                <span aria-current="page" className="inline-flex min-w-10 justify-center rounded-sm bg-ink px-3 py-2 text-paper">{n}</span>
              ) : (
                <Link href={href(n)} aria-label={t("page", { page: n, pages })} className={`${PAGER} inline-flex min-w-10 justify-center`}>{n}</Link>
              )}
            </li>
          ),
        )}
      </ol>
      {page < pages ? <Link href={href(page + 1)} className={PAGER}>{t("next")}</Link> : <span />}
    </nav>
  );
}
