import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Link previews (Viber, Facebook, LinkedIn, Slack) as the slip itself: a receipt on the counter,
// printed in the one ink, with the magenta end-of-roll stripe along the bottom.

export const OG_SIZE = { width: 1200, height: 630 };

const COUNTER = "#e6e6e1";
const PAPER = "#fbfbf8";
const INK = "#141414";
const ACCENT = "#b8154f";

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700 }[]> | null = null;

function loadFonts() {
  const file = (name: string) => readFile(join(process.cwd(), "assets/fonts", name));
  fonts ??= Promise.all([
    file("Commissioner-Regular.ttf").then((data) => ({ name: "Commissioner", data, weight: 400 as const })),
    file("Commissioner-Bold.ttf").then((data) => ({ name: "Commissioner", data, weight: 700 as const })),
    file("JetBrainsMono-Regular.ttf").then((data) => ({ name: "JetBrains Mono", data, weight: 400 as const })),
    file("JetBrainsMono-Bold.ttf").then((data) => ({ name: "JetBrains Mono", data, weight: 700 as const })),
  ]);
  return fonts;
}

export type SlipImage = {
  head: string; // the authority, printed like a shop's name
  meta: string; // source and identifier, or kind of page
  label: string; // stage, e.g. ΠΡΟΚΗΡΥΞΗ
  title: string;
  total?: { label: string; value: string } | null;
  flag?: string | null; // an open deadline, in the accent
};

function clip(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

const mono = { fontFamily: "JetBrains Mono" };

// The serrated bottom edge, as the slips on the site have.
function TornEdge({ width }: { width: number }) {
  const tooth = 14;
  const points = [`0,0`];
  for (let x = 0; x <= width; x += tooth) {
    points.push(`${x},0`, `${x + tooth / 2},${tooth / 2}`);
  }
  points.push(`${width},0`);
  return (
    <svg width={width} height={tooth / 2} viewBox={`0 0 ${width} ${tooth / 2}`} style={{ display: "flex" }}>
      <polygon points={points.join(" ")} fill={PAPER} />
    </svg>
  );
}

function Dashes({ width }: { width: number }) {
  return (
    <svg width={width} height={2} viewBox={`0 0 ${width} 2`} style={{ display: "flex" }}>
      <line x1="0" y1="1" x2={width} y2="1" stroke={INK} strokeWidth="2" strokeDasharray="8 6" />
    </svg>
  );
}

export async function slipImage(slip: SlipImage) {
  const width = 820;
  const inner = width - 96;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: COUNTER, fontFamily: "Commissioner", color: INK }}>
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 64, top: 44, transform: "rotate(-1.2deg)" }}>
          <div style={{ display: "flex", flexDirection: "column", width, background: PAPER, padding: "40px 48px 28px", gap: 18, boxShadow: "0 10px 24px rgba(20,20,20,0.14)" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, ...mono }}>
              <div style={{ fontSize: 24, fontWeight: 700, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>{clip(slip.head, 60)}</div>
              <div style={{ fontSize: 18 }}>{slip.meta}</div>
            </div>
            <Dashes width={inner} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...mono, fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>
              <span>{slip.label}</span>
              {slip.flag && <span style={{ color: ACCENT }}>{slip.flag}</span>}
            </div>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.5 }}>{clip(slip.title, 110)}</div>
            {slip.total && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                <Dashes width={inner} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", ...mono, paddingTop: 10, paddingBottom: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{slip.total.label}</span>
                  <span style={{ fontSize: 44, fontWeight: 700 }}>{slip.total.value}</span>
                </div>
                {/* The double rule under a total (the renderer has no double borders). */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", height: 2, background: INK }} />
                  <div style={{ display: "flex", height: 2, background: INK }} />
                </div>
              </div>
            )}
          </div>
          <TornEdge width={width} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", right: 56, bottom: 64, alignItems: "flex-end", gap: 6, ...mono }}>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>ixnos-data</div>
        </div>
        <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, height: 14, background: ACCENT }} />
      </div>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}
