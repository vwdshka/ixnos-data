import { NextResponse } from "next/server";
import { getPathname } from "@/i18n/navigation";
import { signIn } from "@/lib/account";

// The link in the sign-in email: exchange its token for a session cookie, then go to the account.
export async function GET(request: Request, { params }: RouteContext<"/[locale]/login/verify">) {
  const { locale } = await params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ok = token !== "" && (await signIn(token));
  const target = ok
    ? getPathname({ href: "/account", locale })
    : getPathname({ href: { pathname: "/login", query: { expired: "1" } }, locale });
  return NextResponse.redirect(new URL(target, request.url), 303);
}
