import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Next.js 16 renamed middleware.ts to proxy.ts. next-intl picks the language; this adds a
// Content-Security-Policy with a fresh nonce, so only scripts marked with it can run.
const intl = createMiddleware(routing);

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // React needs eval only for its development error overlay.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Style attributes (a slip's animation delay) can't carry a nonce.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export default function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce);
  // next-intl passes these request headers on: the layout reads the nonce, and Next.js reads
  // the policy to put the nonce on its own scripts.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  const response = intl(request);
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Pages only: not API routes, Next internals, files with an extension, or link prefetches.
  matcher: [
    {
      source: "/((?!api|_next|_vercel|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
