// Server errors to Sentry through its HTTP envelope endpoint, without the SDK: the web app only
// needs "an error happened on this route", not tracing or session replay. Off unless
// IXNOS_DATA_SENTRY_DSN is set. Sends no request headers, cookies or query strings.

type Dsn = { url: string; auth: string; dsn: string };

export function parseDsn(dsn: string | undefined): Dsn | null {
  const match = dsn ? /^(https?):\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(dsn) : null;
  if (!match) {
    return null;
  }
  const [, protocol, key, host, project] = match;
  return {
    url: `${protocol}://${host}/api/${project}/envelope/`,
    auth: `Sentry sentry_version=7, sentry_key=${key}, sentry_client=ixnos-data-web/1`,
    dsn: dsn!,
  };
}

export function envelope(target: Dsn, error: unknown, path: string, method: string): string {
  const eventId = crypto.randomUUID().replaceAll("-", "");
  const err = error instanceof Error ? error : new Error(String(error));
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    server_name: "web",
    transaction: path.split("?")[0],
    tags: { digest },
    request: { method, url: path.split("?")[0] },
    exception: { values: [{ type: err.name, value: err.message, stacktrace: { frames: [] } }] },
    extra: { stack: err.stack },
  };
  return [JSON.stringify({ event_id: eventId, dsn: target.dsn }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
}

export async function report(error: unknown, path: string, method: string): Promise<void> {
  const target = parseDsn(process.env.IXNOS_DATA_SENTRY_DSN);
  if (!target) {
    return;
  }
  try {
    await fetch(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": target.auth },
      body: envelope(target, error, path, method),
    });
  } catch {
    // Never let error reporting become an error.
  }
}
