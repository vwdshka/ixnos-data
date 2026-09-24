import { getTranslations } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import { getItem } from "@/lib/api/client";
import { toIcs } from "@/lib/downloads";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// /calendar/{ΑΔΑΜ}.ics?lang=el: an open tender's submission deadline as a calendar event.
export async function GET(request: Request, { params }: RouteContext<"/calendar/[file]">) {
  const file = decodeURIComponent((await params).file);
  const item = file.endsWith(".ics") ? await getItem(file.slice(0, -4)) : null;
  if (!item?.deadlineAt) {
    return new Response("Not found", { status: 404 });
  }

  const locale = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "el";
  const t = await getTranslations({ locale, namespace: "Item" });
  const url = SITE_URL + getPathname({ href: `/items/${encodeURIComponent(item.sourceId)}`, locale });
  const body = toIcs({
    id: item.sourceId,
    title: t("calendarSummary", { title: item.title }),
    description: [item.organisation?.name, url].filter(Boolean).join("\n"),
    url,
    deadline: new Date(item.deadlineAt),
    reminder: t("calendarReminder", { title: item.title }),
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="deadline.ics"; filename*=UTF-8''${encodeURIComponent(item.sourceId)}.ics`,
    },
  });
}
