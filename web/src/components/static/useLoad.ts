"use client";

import { useEffect, useState } from "react";

export type Loaded<T> = { status: "loading" } | { status: "failed" } | { status: "done"; data: T };

/** Runs `load` whenever `key` changes; an answer for an older key is dropped. */
export function useLoad<T>(key: string, load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{ key: string; loaded: Loaded<T> }>({ key, loaded: { status: "loading" } });

  useEffect(() => {
    let current = true;
    load().then(
      (data) => current && setState({ key, loaded: { status: "done", data } }),
      () => current && setState({ key, loaded: { status: "failed" } }),
    );
    return () => {
      current = false;
    };
    // `load` is a new function each render; `key` is what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state.loaded : { status: "loading" };
}
