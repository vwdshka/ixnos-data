import { qrPath } from "@/lib/qr";

// The parts of a real till slip around a record: the shop's name at the top, and at the bottom
// the thank-you line, a QR code and the receipt number. Greek receipts carry a QR code too.

export function ReceiptHead({ name, source, sourceId }: { name?: React.ReactNode; source: string; sourceId: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center font-mono text-xs uppercase leading-snug tracking-wide">
      {name && <div className="max-w-[40ch] text-sm font-bold text-balance">{name}</div>}
      <div>
        {source} · {sourceId}
      </div>
    </div>
  );
}

export function ReceiptFoot({
  url,
  sourceId,
  labels,
}: {
  url: string;
  sourceId: string;
  labels: { thanks: string; number: string; scan: string; qr: string };
}) {
  const { size, d } = qrPath(url);
  return (
    <div className="flex flex-col items-center gap-3 text-center font-mono text-xs leading-relaxed">
      <p className="font-bold tracking-[0.2em]" aria-hidden="true">
        * * * {labels.thanks} * * *
      </p>
      <p className="sr-only">{labels.thanks}</p>
      <figure className="flex flex-col items-center gap-1.5">
        {/* Dark on light in both themes, with the standard quiet zone: some phone scanners
            can't read an inverted code. */}
        <svg viewBox={`-4 -4 ${size + 8} ${size + 8}`} className="size-28" role="img" aria-label={labels.qr} shapeRendering="crispEdges">
          <rect x="-4" y="-4" width={size + 8} height={size + 8} fill="#fbfbf8" />
          <path d={d} fill="#141414" />
        </svg>
        <figcaption>{labels.scan}</figcaption>
      </figure>
      <p>
        {labels.number} <span className="font-bold">{sourceId}</span>
      </p>
    </div>
  );
}
