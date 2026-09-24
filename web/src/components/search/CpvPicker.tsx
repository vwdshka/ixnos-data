"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { STATIC_SITE } from "@/lib/links";
import { cpvLabels } from "@/lib/static/data";

type Option = { code: string; label: string };
type Found = { code: string; labelEl?: string | null; labelEn?: string | null };

const noSubscription = () => () => {};

// The static edition has no API: the same lookup over the published code list (codes by prefix,
// labels by every word), best matches first, as many as the API returns.
async function findCpv(query: string): Promise<Found[]> {
  const labels = await cpvLabels();
  const words = fold(query).split(/\s+/).filter(Boolean);
  const digits = query.replace(/\D/g, "");
  return Object.entries(labels)
    .filter(([code, [el, en]]) =>
      digits.length >= 2 && digits.length === query.replace(/[\s-]/g, "").length
        ? code.replace("-", "").startsWith(digits)
        : words.every((word) => fold(el).includes(word) || fold(en).includes(word)),
    )
    .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
    .slice(0, 20)
    .map(([code, [labelEl, labelEn]]) => ({ code, labelEl, labelEn }));
}

// Case, accents and final sigma ignored, as the server does.
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("ς", "σ");

// The trade filter. Without JavaScript it's the plain list of 45 divisions; with it, a combobox
// that finds any CPV code by the words people use ("καθαρισμός", "laptop") or by code.
export function CpvPicker({
  value,
  divisions,
  locale,
  labelledBy,
  fieldClass,
  labels,
}: {
  value?: string;
  divisions: Option[];
  locale: string;
  labelledBy: string;
  fieldClass: string;
  labels: { any: string; noMatch: string };
}) {
  const id = useId();
  // False while server-rendering and hydrating, true once scripts run.
  const enhanced = useSyncExternalStore(noSubscription, () => true, () => false);
  const [code, setCode] = useState(value ?? "");
  const [text, setText] = useState(divisions.find((d) => d.code === value)?.label ?? value ?? "");
  const [found, setFound] = useState<{ query: string; options: Option[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = text.trim();
  // Two letters or more, and not just the name of the division already picked.
  const searching = query.length >= 2 && query !== divisions.find((d) => d.code === code)?.label;
  // Until the server answers for exactly this text, the divisions that match it locally.
  const options = !searching
    ? divisions
    : found?.query === query
      ? found.options
      : divisions.filter((d) => fold(d.label).includes(fold(query)));

  useEffect(() => {
    if (!open || !searching) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const matches: Found[] = STATIC_SITE
          ? await findCpv(query)
          : await (await fetch(`/api/cpv?q=${encodeURIComponent(query)}`, { signal: controller.signal })).json();
        if (controller.signal.aborted) {
          return;
        }
        setFound({
          query,
          options: matches.map((m) => ({ code: m.code, label: (locale === "en" ? m.labelEn : m.labelEl) ?? m.labelEl ?? m.code })),
        });
        setActive(-1);
      } catch {
        // Aborted by the next keystroke, or offline: keep the current list.
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, searching, locale]);

  if (!enhanced) {
    return (
      <select name="cpv" defaultValue={value ?? ""} aria-labelledby={labelledBy} className={`${fieldClass} font-sans`}>
        <option value="">{labels.any}</option>
        {value && !divisions.some((d) => d.code === value) && <option value={value}>{value}</option>}
        {divisions.map((d) => (
          <option key={d.code} value={d.code}>
            {d.label}
          </option>
        ))}
      </select>
    );
  }

  const choose = (option: Option) => {
    setCode(option.code);
    setText(option.label);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input type="hidden" name="cpv" value={code} />
      <input
        role="combobox"
        aria-labelledby={labelledBy}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={labels.any}
        className={`${fieldClass} font-sans placeholder:text-ink`}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const typed = event.target.value;
          setText(typed);
          setOpen(true);
          // A typed code (or prefix) works as it is; words need a pick from the list.
          setCode(/^\d{2,8}(-\d)?$/.test(typed.trim()) ? typed.trim() : "");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((index) => (index + step + options.length) % Math.max(options.length, 1));
          } else if (event.key === "Enter" && open && active >= 0 && options[active]) {
            // Only a highlighted option: guessing the "best" match picked the wrong trade too often.
            event.preventDefault();
            choose(options[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={labelledBy}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto border border-ink bg-paper py-1 font-sans text-sm font-normal normal-case tracking-normal shadow-[0_8px_24px_var(--slip-shadow)]"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2">{labels.noMatch}</li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.code}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 ${index === active ? "bg-ink text-paper" : "hover:bg-counter"}`}
              >
                <span>{option.label}</span>
                <span className="shrink-0 font-mono text-xs">{option.code}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
