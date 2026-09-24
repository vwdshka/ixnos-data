import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatusSlip } from "@/components/layout/StatusSlip";
import { getMetrics, type PublicMetrics } from "@/lib/api/client";
import { alternates } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/status">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Status" });
  return { title: t("title"), description: t("intro"), alternates: alternates("/status", locale) };
}

export default async function StatusPage({ params }: PageProps<"/[locale]/status">) {
  const { locale } = await params;
  setRequestLocale(locale);
  let metrics: PublicMetrics | null = null;
  try {
    metrics = await getMetrics();
  } catch {
    // Shown as "unavailable" below: the status page must not fail with the API.
  }
  return <StatusSlip metrics={metrics} />;
}
