import { getTranslations } from "next-intl/server";
import { getItem } from "@/lib/api/client";
import { daysUntil, formatEuro } from "@/lib/format";
import { OG_SIZE, slipImage } from "@/lib/og";

export const alt = "ixnos-data";
export const size = OG_SIZE;
export const contentType = "image/png";

const SOURCE_NAMES: Record<string, string> = { khmdhs: "ΚΗΜΔΗΣ", diavgeia: "Διαύγεια" };

// The record's link preview: its slip, with the amount and an open deadline.
export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [item, kind, t] = await Promise.all([
    getItem(decodeURIComponent(id)),
    getTranslations({ locale, namespace: "Kind" }),
    getTranslations({ locale, namespace: "Item" }),
  ]);
  if (!item) {
    return slipImage({ head: "ixnos-data", meta: "", label: "404", title: id });
  }
  const withVat = item.amountEur == null && item.amountWithVatEur != null;
  const amount = item.amountImplausible ? null : formatEuro(item.amountEur ?? item.amountWithVatEur, locale);
  const days = item.cancelled ? null : daysUntil(item.deadlineAt);
  return slipImage({
    head: item.organisation?.name ?? SOURCE_NAMES[item.source] ?? item.source,
    meta: `${SOURCE_NAMES[item.source] ?? item.source} · ${item.sourceId}`,
    label: (kind.has(item.kind) ? kind(item.kind) : item.kind).toUpperCase(),
    title: item.title,
    total: amount ? { label: t(withVat ? "incVat" : "exVat").toUpperCase(), value: amount } : null,
    flag: item.cancelled ? t("void") : days !== null ? (days > 0 ? t("daysLeft", { days }) : t("today")).toUpperCase() : null,
  });
}
