import type { Metadata } from "next";
import { Commissioner, JetBrains_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import Script from "next/script";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SearchShortcut } from "@/components/layout/SearchShortcut";
import { Footer, Header } from "@/components/layout/SiteChrome";
import { THEME_COOKIE, THEME_INIT_SCRIPT } from "@/components/layout/theme";
import { routing } from "@/i18n/routing";
import { openGraph, SITE_URL } from "@/lib/site";
import "../globals.css";

// Commissioner, by a Greek type designer, for text; JetBrains Mono for codes, amounts and
// dates. Both cover Greek, including accented capitals.
const commissioner = Commissioner({
  variable: "--font-commissioner",
  subsets: ["greek", "latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["greek", "latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    openGraph: openGraph(t("title"), t("description"), locale),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const theme = cookieStore.get(THEME_COOKIE)?.value;
  // Set per request by proxy.ts; the Content-Security-Policy only lets scripts with it run.
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  return (
    // The theme script may set data-theme before hydration, so React must not compare it.
    <html
      lang={locale}
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      className={`${commissioner.variable} ${jetbrains.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/* In the initial HTML, before any page code, so the theme is set before the first paint. */}
        <Script id="theme-init" strategy="beforeInteractive" nonce={nonce}>
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
