import { useTranslations } from "next-intl";

// Neutral labels, drawn in ink like every other fact: a signal is something to check, not a verdict.
export function SignalBadges({ signals }: { signals?: string[] | null }) {
  const t = useTranslations("Signal");
  if (!signals?.length) {
    return null;
  }
  return (
    <ul aria-label={t("title")} className="flex flex-wrap gap-1.5">
      {signals.map((signal) => (
        <li key={signal} className="border border-dashed border-ink px-1.5 py-0.5 font-mono text-[0.6875rem] font-bold uppercase tracking-wide">
          {t.has(signal) ? t(signal) : signal}
        </li>
      ))}
    </ul>
  );
}
