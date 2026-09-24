"use client";

import { type MouseEvent, useState } from "react";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Tearing the slip off the roll: the slip gives a short tug and a strip of paper falls away
// under its serrated edge. Only movement, so it is skipped when motion is reduced.
function tearOff(slip: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const strip = document.createElement("div");
  strip.className = "torn-strip";
  strip.setAttribute("aria-hidden", "true");
  slip.append(strip);
  slip.animate(
    [{ transform: "none" }, { transform: "translateY(-5px) rotate(-0.35deg)", offset: 0.3 }, { transform: "none" }],
    { duration: 320, easing: EASE },
  );
  strip
    .animate(
      [
        { transform: "none", opacity: 1 },
        { transform: "translateY(28px) rotate(4deg)", opacity: 0 },
      ],
      { duration: 480, easing: "cubic-bezier(0.4, 0, 1, 1)", delay: 60, fill: "both" },
    )
    .finished.finally(() => strip.remove());
}

// The phone's share sheet where there is one, otherwise copy the link.
export function ShareButton({ title, labels }: { title: string; labels: { share: string; copied: string } }) {
  const [copied, setCopied] = useState(false);

  async function share(event: MouseEvent<HTMLButtonElement>) {
    const slip = event.currentTarget.closest<HTMLElement>(".slip-shadow");
    if (slip) {
      tearOff(slip);
    }
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Closed the share sheet: nothing to do.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-ink px-3 py-2 font-sans text-sm font-semibold transition-colors duration-150 hover:bg-ink hover:text-paper"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M8.5 11.5l3-3M7 9.5l-1.5 1.5a2.5 2.5 0 003.5 3.5L10.5 13M13 10.5l1.5-1.5A2.5 2.5 0 0011 5.5L9.5 7" strokeLinecap="round" />
      </svg>
      <span aria-live="polite">{copied ? labels.copied : labels.share}</span>
    </button>
  );
}
