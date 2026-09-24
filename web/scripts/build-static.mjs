// Builds the static edition (GitHub Pages) into out/:
//   node scripts/build-static.mjs            base path /ixnos-data (vwdshka.github.io/ixnos-data)
//   BASE_PATH= node scripts/build-static.mjs  served from the root, e.g. for a local preview
// The data files go in out/data afterwards (python -m ixnos_data_pipeline.static_site).
import { execSync } from "node:child_process";
import { copyFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = process.env.BASE_PATH ?? "/ixnos-data";
execSync("next build", {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_STATIC_SITE: "1", NEXT_PUBLIC_BASE_PATH: base },
});

// The router fetches a page's segments as flat files (__next.$d$locale.search.__PAGE__.txt), but
// the export writes nested folders (__next.$d$locale/search/__PAGE__.txt): copy each one to the
// name the router asks for, or every client-side navigation falls back to a full page load.
function flatten(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      const walk = (folder, prefix) => {
        for (const entry of readdirSync(folder)) {
          const inner = join(folder, entry);
          if (statSync(inner).isDirectory()) walk(inner, `${prefix}.${entry}`);
          else copyFileSync(inner, join(dir, `${prefix}.${entry}`));
        }
      };
      walk(path, name);
    } else if (name !== "data" && name !== "_next") {
      flatten(path);
    }
  }
}
flatten("out");

// GitHub Pages serves 404.html for any address that doesn't exist.
copyFileSync("out/el/missing/index.html", "out/404.html");
// The site's root opens the Greek edition.
writeFileSync(
  "out/index.html",
  `<!doctype html><meta charset="utf-8"><title>ixnos-data</title><meta http-equiv="refresh" content="0; url=${base}/el/"><link rel="canonical" href="${base}/el/"><a href="${base}/el/">ixnos-data</a>`,
);
// Without this, GitHub Pages runs Jekyll, which drops the _next/ folder.
writeFileSync("out/.nojekyll", "");
