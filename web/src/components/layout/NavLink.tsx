"use client";

import { Link, usePathname } from "@/i18n/navigation";

// A header link that marks the page you're on, for sight and for screen readers.
type Href = "/search" | "/account" | "/alerts" | { pathname: "/tape"; query: Record<string, string> };

export function NavLink({ href, children }: { href: Href; children: React.ReactNode }) {
  const current = usePathname().startsWith(typeof href === "string" ? href : href.pathname);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="rounded-sm px-1.5 py-2 font-medium underline-offset-4 hover:underline aria-[current=page]:underline aria-[current=page]:decoration-2 min-[360px]:px-2 sm:px-3"
    >
      {children}
    </Link>
  );
}
