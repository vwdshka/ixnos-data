import "server-only";
import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export const SITE_URL = process.env.IXNOS_DATA_SITE_URL ?? "http://localhost:3000";

// Same origin in production: Caddy routes /v1 to the API.
export const PUBLIC_API_URL = process.env.IXNOS_DATA_PUBLIC_API_URL ?? SITE_URL;

type Href = Parameters<typeof getPathname>[0]["href"];

export function alternates(href: Href, locale: string): Metadata["alternates"] {
  return {
    canonical: getPathname({ href, locale }),
    languages: Object.fromEntries(routing.locales.map((l) => [l, getPathname({ href, locale: l })])),
  };
}

export function openGraph(title: string, description: string | undefined, locale: string): Metadata["openGraph"] {
  return { title, description, siteName: "ixnos-data", locale: locale === "en" ? "en_GB" : "el_GR", type: "website" };
}
