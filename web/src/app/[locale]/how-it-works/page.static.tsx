import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export { default } from "./page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "Help" });
  return { title: t("title") };
}
