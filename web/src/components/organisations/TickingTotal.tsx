"use client";

import { useEffect, useRef } from "react";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// A total that rolls into place like a till's mechanical counter, digit wheels settling from
// right to left, the first time it scrolls into view. The final figure is what the server
// renders, so without JavaScript (or with reduced motion) it simply shows.
export function TickingTotal({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }
        observer.disconnect();
        const wheels = [...root.querySelectorAll<HTMLElement>("[data-digit]")];
        wheels.forEach((wheel, index) => {
          const digit = Number(wheel.dataset.digit);
          const fromRight = wheels.length - 1 - index;
          // Every wheel turns at least once, the leftmost the longest, like a real counter.
          wheel.animate(
            [{ transform: "translateY(0)" }, { transform: `translateY(${-(10 + digit)}em)` }],
            { duration: 700 + fromRight * 90, easing: EASE, fill: "backwards" },
          );
        });
      },
      { threshold: 0.6 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={ref} className="inline-flex">
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex">
        {[...value].map((char, index) =>
          /\d/.test(char) ? (
            <span key={index} className="inline-block h-[1em] overflow-hidden leading-none">
              {/* Two turns of the wheel (0–9, 0–9), resting on this digit in the second. */}
              <span data-digit={char} className="flex flex-col" style={{ transform: `translateY(${-(10 + Number(char))}em)` }}>
                {"01234567890123456789".split("").map((d, i) => (
                  <span key={i} className="h-[1em]">
                    {d}
                  </span>
                ))}
              </span>
            </span>
          ) : (
            <span key={index} className="leading-none whitespace-pre">
              {char}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
