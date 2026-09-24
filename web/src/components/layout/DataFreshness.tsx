import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDataStatus } from "@/lib/api/client";
import { formatAgo } from "@/lib/format";

// "Data updated 12 minutes ago", from the last successful ingestion run. Nothing when unknown.
export async function DataFreshness() {
  const status = await getDataStatus();
  if (!status?.updatedAt) {
    return null;
  }
  const [t, locale] = await Promise.all([getTranslations("Layout"), getLocale()]);
  return (
    <p>
      <time dateTime={status.updatedAt}>{t("updated", { ago: formatAgo(status.updatedAt, locale) })}</time>{" "}
      <Link href="/status" className="underline">
        {t("status")}
      </Link>
    </p>
  );
}
