import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// NEXT_PUBLIC_STATIC_SITE=1 builds the static edition for GitHub Pages instead: plain files, no
// server. Its routes are the `*.static.tsx` files beside the full site's; everything that needs a
// server (the API, accounts, route handlers, the proxy) is left out simply by not matching.
const staticSite = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

const nextConfig: NextConfig = staticSite
  ? {
      output: "export",
      basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
      trailingSlash: true,
      pageExtensions: ["static.tsx", "static.ts"],
      images: { unoptimized: true },
      // Its generated route types know only the static routes, so the full site's pages would
      // fail the check; `pnpm typecheck` (and CI) checks every file against the full site.
      typescript: { ignoreBuildErrors: true },
    }
  : { output: "standalone" };

export default withNextIntl(nextConfig);
