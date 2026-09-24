"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

function focusSearchBox(): boolean {
  const box = document.getElementById("q");
  if (!(box instanceof HTMLInputElement)) {
    return false;
  }
  box.focus();
  // Cursor at the end, not the text selected: typing adds to the search instead of replacing it.
  box.setSelectionRange(box.value.length, box.value.length);
  return true;
}

// Press / anywhere (outside a text field) to type a search: the page's search box, or the
// search page on pages without one.
export function SearchShortcut() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      ) {
        return;
      }
      event.preventDefault();
      if (focusSearchBox()) {
        return;
      }
      router.push("/search");
      // Focus the box as soon as the search page has rendered it.
      const started = Date.now();
      const wait = () => {
        if (!focusSearchBox() && Date.now() - started < 3000) {
          requestAnimationFrame(wait);
        }
      };
      requestAnimationFrame(wait);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
