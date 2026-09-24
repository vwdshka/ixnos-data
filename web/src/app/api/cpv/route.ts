import { api } from "@/lib/api/client";

// The trade picker's lookup, so the browser only ever talks to the web app.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json([]);
  }
  const { data } = await api.GET("/v1/cpv", { params: { query: { q } } });
  return Response.json(data ?? [], { headers: { "Cache-Control": "public, max-age=3600" } });
}
