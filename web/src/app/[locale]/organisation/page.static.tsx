import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { StaticOrganisation } from "@/components/static/StaticPages";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return (
    <Suspense>
      <StaticOrganisation />
    </Suspense>
  );
}
