import { setRequestLocale } from "next-intl/server";
import { HomeHero } from "@/components/home/HomeHero";
import { StaticHome } from "@/components/static/StaticPages";

export default async function StaticHomePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 py-12 sm:px-6 sm:py-20">
      <HomeHero />
      <StaticHome />
    </main>
  );
}
