"use client";

import { useRouter } from "@/i18n/navigation";
import { writeTape } from "@/lib/tape";

export function TapeClear({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        writeTape([]);
        router.push("/tape");
      }}
      className="inline-flex min-h-11 items-center rounded-sm border border-ink px-3 py-2 font-sans text-sm font-semibold transition-colors duration-150 hover:bg-ink hover:text-paper"
    >
      {label}
    </button>
  );
}
