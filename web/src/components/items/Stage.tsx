import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { recordHref } from "@/lib/links";
import type { ItemDetail } from "@/lib/api/client";

// The procurement chain a ΚΗΜΔΗΣ record sits on. Διαύγεια decisions (commitments, spending
// approvals) sit beside it rather than on it, so they show their kind without a step.
export const CHAIN = ["request", "notice", "award", "contract", "payment"] as const;
const STEP_OF: Record<string, number> = {
  request: 0,
  notice: 1,
  award: 2,
  final_award: 2,
  contract: 3,
  payment: 4,
};

export function stepOf(kind: string): number | undefined {
  return STEP_OF[kind];
}

function Square({ filled, current }: { filled: boolean; current: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 border border-ink ${filled ? "bg-ink" : ""} ${current ? "outline outline-1 outline-offset-1 outline-ink" : ""}`}
    />
  );
}

// The record's kind and, for procurement records, which of the five steps it is. Only its own
// square is filled: earlier steps may never have happened (a direct award has no tender).
export function Stage({ kind }: { kind: string }) {
  const t = useTranslations("Kind");
  const item = useTranslations("Item");
  const label = t.has(kind) ? t(kind) : kind;
  const step = stepOf(kind);
  const chain = step === undefined ? null : item("chainStep", { step: step + 1, chain: CHAIN.map((name) => t(name)).join(" → ") });

  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wide">
      {chain && (
        <span className="flex gap-0.5" title={chain}>
          {CHAIN.map((name, index) => (
            <Square key={name} filled={index === step} current={index === step} />
          ))}
          <span className="sr-only">{chain}</span>
        </span>
      )}
      <span>{label}</span>
    </span>
  );
}

type RecordLink = ItemDetail["links"][number];

/**
 * The whole chain on a record's slip. A step is filled only when a record backs it (this one, or
 * a linked one); the rest show a dash, because the source doesn't say whether they happened.
 */
export function Chain({ kind, links }: { kind: string; links: RecordLink[] }) {
  const t = useTranslations("Kind");
  const item = useTranslations("Item");
  const current = stepOf(kind);
  if (current === undefined) {
    return null;
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {CHAIN.map((name, index) => {
        const link = links.find((candidate) => candidate.relation === name);
        const isCurrent = index === current;
        return (
          <li key={name} className="grid grid-cols-[1.25rem_1fr] items-baseline gap-x-2 sm:grid-cols-[1.25rem_minmax(0,9rem)_1fr]">
            <Square filled={isCurrent || link !== undefined} current={isCurrent} />
            <span className={`font-mono text-xs uppercase tracking-wide ${isCurrent ? "font-bold" : ""}`}>
              {index + 1}. {t(name)}
            </span>
            <span className="col-start-2 min-w-0 text-sm sm:col-start-3">
              {isCurrent ? (
                <span className="font-semibold">{item("thisRecord")}</span>
              ) : link?.kind ? (
                <Link href={recordHref(link.sourceId)} className="underline">
                  {link.title ?? link.sourceId}
                </Link>
              ) : link ? (
                <>
                  <span className="font-mono">{link.sourceId}</span> · {item("notInIxnosData")}
                </>
              ) : (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">{item("unknownStep")}</span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
