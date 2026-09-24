import type { Metadata } from "next";
import { Commissioner, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SearchShortcut } from "@/components/layout/SearchShortcut";
import { Footer, Header } from "@/components/layout/SiteChrome";
import { THEME_INIT_SCRIPT } from "@/components/layout/theme";
import { routing } from "@/i18n/routing";
import "../globals.css";

// The static edition's layout (GitHub Pages): the full site's layout without what needs a
// server per request (the theme cookie, the CSP nonce).

const commissioner = Commissioner({ variable: "--font-commissioner", subsets: ["greek", "latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["greek", "latin"] });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { children: React.ReactNode; params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: { default: t("title"), template: `%s · ${t("title")}` }, description: t("description") };
}

export default async function StaticLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <html lang={locale} className={`${commissioner.variable} ${jetbrains.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <NextIntlClientProvider>
          <SearchShortcut />
          <Header />
          {children}
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
