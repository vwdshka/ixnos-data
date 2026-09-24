import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";
import { OrganisationStatement } from "@/components/organisations/OrganisationStatement";
import { getOrganisation } from "@/lib/api/client";
import { formatEuro } from "@/lib/format";
import { alternates, openGraph } from "@/lib/site";

const loadOrganisation = cache((id: string) => getOrganisation(decodeURIComponent(id)));

export async function generateMetadata({ params }: PageProps<"/[locale]/organisations/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const organisation = await loadOrganisation(id);
  if (!organisation) {
    return {};
  }
  const t = await getTranslations({ locale, namespace: "Organisation" });
  const awarded = formatEuro(organisation.awardedLast12MonthsEur, locale);
  const description = awarded ? `${t("awarded")}: ${awarded}` : undefined;
  return {
    title: organisation.nameEl,
    description,
    alternates: alternates(`/organisations/${encodeURIComponent(organisation.id)}`, locale),
    openGraph: openGraph(organisation.nameEl, description, locale),
  };
}

export default async function OrganisationPage({ params }: PageProps<"/[locale]/organisations/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const organisation = await loadOrganisation(id);
  if (!organisation) {
    notFound();
  }
  return <OrganisationStatement organisation={organisation} />;
}
