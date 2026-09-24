import { getTranslations } from "next-intl/server";
import { getOrganisation } from "@/lib/api/client";
import { formatEuro } from "@/lib/format";
import { OG_SIZE, slipImage } from "@/lib/og";

export const alt = "ixnos-data";
export const size = OG_SIZE;
export const contentType = "image/png";

// An authority's link preview: a statement slip with its awards over the last 12 months.
export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const [organisation, t, tape] = await Promise.all([
    getOrganisation(decodeURIComponent(id)),
    getTranslations({ locale, namespace: "Organisation" }),
    getTranslations({ locale, namespace: "Tape" }),
  ]);
  if (!organisation) {
    return slipImage({ head: "ixnos-data", meta: "", label: "404", title: id });
  }
  const awarded = formatEuro(organisation.awardedLast12MonthsEur, locale);
  return slipImage({
    head: organisation.nameEl,
    meta: organisation.taxId ? `${t("taxId")} ${organisation.taxId}` : "",
    label: t("activity").toUpperCase(),
    title: t("awarded"),
    total: awarded ? { label: tape("total"), value: awarded } : null,
  });
}
