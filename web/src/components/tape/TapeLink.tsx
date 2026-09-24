"use client";

import { useSyncExternalStore } from "react";
import { NavLink } from "@/components/layout/NavLink";
import { readTape, serverTape, subscribeTape, tapeHref } from "@/lib/tape";

// "Tape (2)" in the header, only while the tape has records.
export function TapeLink({ label }: { label: string }) {
  const tape = useSyncExternalStore(subscribeTape, readTape, serverTape);
  if (tape.length === 0) {
    return null;
  }
  return <NavLink href={tapeHref(tape)}>{label.replace("{count}", String(tape.length))}</NavLink>;
}
