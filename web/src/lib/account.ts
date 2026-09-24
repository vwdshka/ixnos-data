"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { api, type SavedSearchRequest } from "@/lib/api/client";

// Server actions for accounts. The session token never reaches client JavaScript: it lives in
// an HTTP-only cookie and is forwarded to the API as a bearer token.

const COOKIE = "ixnos_data_session";

async function session(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

async function authed() {
  const token = await session();
  return token ? { headers: { Authorization: `Bearer ${token}` } } : null;
}

export async function signIn(token: string): Promise<boolean> {
  const { data } = await api.POST("/v1/auth/verify", { body: { token } });
  if (!data) {
    return false;
  }
  (await cookies()).set(COOKIE, data.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(data.expiresAt),
  });
  return true;
}

export async function requestLogin(formData: FormData) {
  const locale = await getLocale();
  const email = String(formData.get("email") ?? "");
  const { response } = await api.POST("/v1/auth/login", { body: { email, locale } });
  redirect({ href: { pathname: "/login", query: { [response.ok ? "sent" : "invalid"]: "1" } }, locale });
}

export async function getAccount() {
  const auth = await authed();
  if (!auth) {
    return null;
  }
  const { data } = await api.GET("/v1/me", auth);
  return data ?? null;
}

export async function saveSearch(formData: FormData) {
  const locale = await getLocale();
  const auth = await authed();
  if (!auth) {
    redirect({ href: "/login", locale });
    return;
  }
  const text = (name: string) => String(formData.get(name) ?? "").trim() || null;
  const amount = (name: string) => {
    const value = Number(text(name));
    return Number.isFinite(value) && text(name) ? value : null;
  };
  const body: SavedSearchRequest = {
    name: null,
    q: text("q"),
    kind: text("kind"),
    cpv: text("cpv"),
    nuts: text("nuts"),
    minAmount: amount("minAmount"),
    maxAmount: amount("maxAmount"),
  };
  await api.POST("/v1/me/saved-searches", { ...auth, body });
  redirect({ href: { pathname: "/account", query: { saved: "1" } }, locale });
}

export async function deleteSearch(formData: FormData) {
  const auth = await authed();
  if (auth) {
    await api.DELETE("/v1/me/saved-searches/{id}", { ...auth, params: { path: { id: String(formData.get("id")) } } });
  }
  redirect({ href: "/account", locale: await getLocale() });
}

export async function setDigest(formData: FormData) {
  const auth = await authed();
  const frequency = String(formData.get("frequency"));
  if (auth) {
    await api.PUT("/v1/me/digest", { ...auth, body: { frequency } });
  }
  redirect({ href: "/account", locale: await getLocale() });
}

export async function signOut() {
  const auth = await authed();
  if (auth) {
    await api.POST("/v1/me/logout", auth);
  }
  (await cookies()).delete(COOKIE);
  redirect({ href: "/", locale: await getLocale() });
}

export async function deleteAccount() {
  const auth = await authed();
  if (auth) {
    await api.DELETE("/v1/me", auth);
  }
  (await cookies()).delete(COOKIE);
  redirect({ href: { pathname: "/", query: { deleted: "1" } }, locale: await getLocale() });
}

export async function getApiKeys() {
  const auth = await authed();
  if (!auth) {
    return [];
  }
  const { data } = await api.GET("/v1/me/api-keys", auth);
  return data ?? [];
}

/** Used with useActionState: returns the new key once, or an error when the limit is reached. */
export async function createApiKey(
  _: { key?: string; error?: boolean } | null,
  formData: FormData,
): Promise<{ key?: string; error?: boolean }> {
  const auth = await authed();
  if (!auth) {
    return { error: true };
  }
  const name = String(formData.get("name") ?? "").trim() || null;
  const { data } = await api.POST("/v1/me/api-keys", { ...auth, body: { name } });
  revalidatePath("/[locale]/account", "page");
  return data ? { key: data.key } : { error: true };
}

export async function revokeApiKey(formData: FormData) {
  const auth = await authed();
  if (auth) {
    await api.DELETE("/v1/me/api-keys/{id}", { ...auth, params: { path: { id: String(formData.get("id")) } } });
  }
  redirect({ href: "/account", locale: await getLocale() });
}

