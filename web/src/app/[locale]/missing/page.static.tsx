import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import NotFound from "../not-found";

// Copied to 404.html after the build: GitHub Pages shows it for any address that doesn't exist.
export const metadata: Metadata = { robots: { index: false } };

export default async function Missing({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <NotFound />;
}
