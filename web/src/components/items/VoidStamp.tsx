// A rubber stamp in the one ink: slightly turned, with the uneven edges and gaps of a real
// stamp (an SVG filter roughens the outline and a noise mask drops out specks of ink).
// `id` keeps the filter and mask ids unique when several stamps share a page.
export function VoidStamp({ id, word, date, label, large = false }: { id: string; word: string; date?: string | null; label: string; large?: boolean }) {
  const width = large ? 176 : 112;
  const height = large ? (date ? 72 : 52) : 36;
  return (
    <span className="inline-flex -rotate-6 self-start text-ink" style={{ lineHeight: 0 }}>
      <span className="sr-only">{label}</span>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
        <defs>
          <filter id={`${id}-rough`} x="-5%" y="-10%" width="110%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={large ? 2.4 : 1.6} />
          </filter>
          <mask id={`${id}-wear`}>
            <rect width={width} height={height} fill="white" />
            <filter id={`${id}-specks`}>
              <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="3" />
              <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 1.2" />
            </filter>
            <rect width={width} height={height} filter={`url(#${id}-specks)`} />
          </mask>
        </defs>
        <g filter={`url(#${id}-rough)`} mask={`url(#${id}-wear)`} fill="none" stroke="currentColor">
          <rect x="1.5" y="1.5" width={width - 3} height={height - 3} strokeWidth={large ? 3 : 2} />
          <rect x={large ? 6 : 4.5} y={large ? 6 : 4.5} width={width - (large ? 12 : 9)} height={height - (large ? 12 : 9)} strokeWidth="1" />
          <text
            x={width / 2}
            y={large ? (date ? 34 : 35) : 24}
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            className="font-mono font-bold"
            fontSize={large ? 26 : 15}
            letterSpacing={large ? 5 : 3}
          >
            {word}
          </text>
          {large && date && (
            <text x={width / 2} y="56" textAnchor="middle" fill="currentColor" stroke="none" className="font-mono" fontSize="12" letterSpacing="1.5">
              {date}
            </text>
          )}
        </g>
      </svg>
    </span>
  );
}
