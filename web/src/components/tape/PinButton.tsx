"use client";

import { useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { readTape, serverTape, subscribeTape, TAPE_MAX, tapeHref, writeTape } from "@/lib/tape";

const BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-sm border border-ink px-3 py-2 font-sans text-sm font-semibold transition-colors duration-150 hover:bg-ink hover:text-paper aria-pressed:bg-ink aria-pressed:text-paper";

// Put this record on the tape, or take it off; once the tape has records, a link to it.
export function PinButton({ sourceId, labels }: { sourceId: string; labels: { pin: string; unpin: string; view: string } }) {
  const tape = useSyncExternalStore(subscribeTape, readTape, serverTape);
  const pinned = tape.includes(sourceId);
  const full = !pinned && tape.length >= TAPE_MAX;

  return (
    <>
      <button
        type="button"
        aria-pressed={pinned}
        disabled={full}
        onClick={() => writeTape(pinned ? tape.filter((id) => id !== sourceId) : [...tape, sourceId])}
        className={`${BUTTON} disabled:cursor-not-allowed disabled:border-dashed`}
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M3 7.5l2-2 2 2 2-2 2 2 2-2 2 2 2-2v7l-2 2-2-2-2 2-2-2-2 2-2-2-2 2z" strokeLinejoin="round" />
        </svg>
        {pinned ? labels.unpin : labels.pin}
      </button>
      {tape.length > 0 && (
        <Link href={tapeHref(tape)} className="inline-flex min-h-11 items-center px-1 font-sans text-sm underline underline-offset-4">
          {labels.view.replace("{count}", String(tape.length))}
        </Link>
      )}
    </>
  );
}
