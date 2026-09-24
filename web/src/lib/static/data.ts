// The static edition's data layer: reads the files pipeline/src/ixnos_data_pipeline/static_site.py
// writes (see its docstring for the layout) and answers the same questions the API does, in the
// browser. Every file is fetched once per page load and only when a page needs it.

import type { components } from "@/lib/api/schema";
import type { SearchFormValues } from "@/lib/search";
import { searchKeys } from "./greek";

type Schemas = components["schemas"];
export type ItemSummary = Schemas["ItemSummary"];
export type ItemDetail = Schemas["ItemDetail"];
export type OrganisationDetail = Schemas["OrganisationDetail"];
export type PublicMetrics = Schemas["PublicMetrics"];

type Meta = {
  generatedAt: string;
  count: number;
  shard: number;
  idBuckets: number;
  orgBuckets: number;
  kinds: string[];
  sources: string[];
  nuts: string[];
  epoch: string;
  stopTokens: string[];
};

// [sourceId, source, kind, title, authority, amountEur, amountWithVatEur, publishedAt, deadlineAt,
//  nuts, cpv codes, cancelled, signals]
type Row = [string, number, string, string, number, number | null, number | null, string, string | null, string | null, string[], 0 | 1, string[]];
type Detail = {
  d: string | null;
  si: string | null;
  st: string | null;
  en: string | null;
  co: string | null;
  sb: string | null;
  pr: string | null;
  of: number | null;
  c: [string, string, number | null, string | null][];
  l: [string, string, string, string | null, string | null][];
  u: string | null;
  sm: number[];
};

const PLAUSIBLE_MAX = 1_000_000_000;
const NONE16 = 0xffff;
const FLAGS = { cancelled: 1, single_offer: 2, near_direct_award_limit: 4, diavgeia: 8, superseded: 16, implausible: 32 };

export const DATA_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data`;

const files = new Map<string, Promise<unknown>>();

function load<T>(path: string, read: (response: Response) => Promise<T>): Promise<T> {
  let pending = files.get(path) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch(`${DATA_URL}/${path}`).then((response) => {
      if (!response.ok) {
        throw new Error(`${path}: ${response.status}`);
      }
      return read(response);
    });
    // A failed fetch isn't remembered, so the next attempt tries again.
    pending.catch(() => files.delete(path));
    files.set(path, pending);
  }
  return pending;
}

const json = <T>(path: string) => load<T>(path, (response) => response.json() as Promise<T>);
const column = (name: string) => load(`attrs/${name}.bin`, (response) => response.arrayBuffer());

/** 32-bit FNV-1a over UTF-8, as the exporter computes it to pick a file. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Record indexes stored as base64 LEB128 varints of their differences. */
export function decodePostings(encoded: string): Int32Array {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  let previous = -1;
  for (const byte of bytes) {
    value += (byte & 0x7f) * 2 ** shift;
    if (byte & 0x80) {
      shift += 7;
      continue;
    }
    previous += value;
    out.push(previous);
    value = 0;
    shift = 0;
  }
  return Int32Array.from(out);
}

export const meta = () => json<Meta>("meta.json");
const authorities = () => json<[string, string][]>("orgs.json");

function toSummary(row: Row, meta: Meta, orgs: [string, string][]): ItemSummary {
  const org = orgs[row[4]];
  return {
    sourceId: row[0],
    source: meta.sources[row[1]],
    kind: row[2],
    title: row[3],
    organisation: org ? { id: org[0], name: org[1] } : null,
    amountEur: row[5],
    amountWithVatEur: row[6],
    publishedAt: row[7],
    deadlineAt: row[8],
    nutsCode: row[9],
    cpvCodes: row[10],
    cancelled: row[11] === 1,
    signals: row[12],
    amountImplausible: row[5] != null && row[5] > PLAUSIBLE_MAX,
  };
}

async function rowsAt(indexes: number[]): Promise<Row[]> {
  const { shard } = await meta();
  const shards = await Promise.all(
    [...new Set(indexes.map((i) => Math.floor(i / shard)))].map(async (n) => [n, await json<Row[]>(`rows/${n}.json`)] as const),
  );
  const byShard = new Map(shards);
  return indexes.map((i) => byShard.get(Math.floor(i / shard))![i % shard]);
}

/** The list slips for these record indexes, in the same order. */
export async function summaries(indexes: number[]): Promise<ItemSummary[]> {
  const [m, orgs, rows] = await Promise.all([meta(), authorities(), rowsAt(indexes)]);
  return rows.map((row) => toSummary(row, m, orgs));
}

/** A record's position in the files, from its ΑΔΑΜ/ΑΔΑ. */
export async function indexOf(sourceId: string): Promise<number | undefined> {
  const m = await meta();
  const bucket = await json<Record<string, number>>(`ids/${fnv1a(sourceId) % m.idBuckets}.json`);
  return bucket[sourceId];
}

async function cpvLabel(code: string) {
  const division = await json<Record<string, [string, string]>>(`cpv/${code.slice(0, 2)}.json`).catch(() => ({}));
  const labels = (division as Record<string, [string, string]>)[code];
  return { code, labelEl: labels?.[0] ?? null, labelEn: labels?.[1] ?? null };
}

export const nutsLabels = () => json<Record<string, [string, string, number]>>("nuts.json");
export const cpvLabels = () => json<Record<string, [string, string]>>("cpv.json");

/** A record page's data: the record, and a few similar ones. */
export async function loadItem(sourceId: string): Promise<{ item: ItemDetail; similar: ItemSummary[] } | null> {
  const index = await indexOf(sourceId);
  if (index === undefined) {
    return null;
  }
  const m = await meta();
  const [summary] = await summaries([index]);
  const details = await json<Detail[]>(`details/${Math.floor(index / m.shard)}.json`);
  const detail = details[index % m.shard];
  const [cpv, nuts, similar] = await Promise.all([
    Promise.all(summary.cpvCodes.map(cpvLabel)),
    nutsLabels(),
    summaries(detail.sm),
  ]);
  const region = summary.nutsCode ? nuts[summary.nutsCode] : undefined;
  const item: ItemDetail = {
    ...summary,
    description: detail.d,
    signedOn: detail.si,
    startsOn: detail.st,
    endsOn: detail.en,
    cancelledOn: detail.co,
    supersededBy: detail.sb,
    procedure: detail.pr,
    offersReceived: detail.of,
    cpv,
    nuts: summary.nutsCode ? { code: summary.nutsCode, labelEl: region?.[0] ?? null, labelEn: region?.[1] ?? null } : null,
    contractors: detail.c.map(([name, role, amountEur, countryCode]) => ({ name, role, amountEur, countryCode })),
    links: detail.l.map(([relation, source, linked, kind, title]) => ({ relation, source, sourceId: linked, kind, title })),
    documentUrl: detail.u,
  };
  return { item, similar };
}

type OrganisationPage = Omit<OrganisationDetail, "recentItems"> & { recent: number[] };

/** An authority page's data. */
export async function loadOrganisation(id: string): Promise<OrganisationDetail | null> {
  const m = await meta();
  const bucket = await json<Record<string, OrganisationPage>>(`orgs/${fnv1a(id) % m.orgBuckets}.json`);
  const page = bucket[id];
  if (!page) {
    return null;
  }
  const { recent, ...rest } = page;
  return { ...rest, recentItems: await summaries(recent) };
}

export async function loadHome(): Promise<{ openCount: number; closing: ItemSummary[] }> {
  const home = await json<{ openCount: number; closing: number[] }>("home.json");
  return { openCount: home.openCount, closing: await summaries(home.closing) };
}

export const loadStatus = () => json<Pick<PublicMetrics, "sources" | "recentRuns"> & { updatedAt: string | null }>("status.json");

// ---- Search ----

function merge(lists: Int32Array[]): Int32Array {
  if (lists.length === 1) {
    return lists[0];
  }
  const all = new Int32Array(lists.reduce((n, list) => n + list.length, 0));
  let at = 0;
  for (const list of lists) {
    all.set(list, at);
    at += list.length;
  }
  all.sort();
  let kept = 0;
  for (let i = 0; i < all.length; i++) {
    if (i === 0 || all[i] !== all[i - 1]) {
      all[kept++] = all[i];
    }
  }
  return all.subarray(0, kept);
}

function intersect(a: Int32Array, b: Int32Array): Int32Array {
  const out = new Int32Array(Math.min(a.length, b.length));
  let i = 0;
  let j = 0;
  let n = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out[n++] = a[i];
      i++;
      j++;
    } else if (a[i] < b[j]) {
      i++;
    } else {
      j++;
    }
  }
  return out.subarray(0, n);
}

const shardOf = (token: string) => (/^[a-z0-9]{2}/.test(token) ? token.slice(0, 2) : "_");

// Greek words change their endings (φάρμακα, φαρμάκων): longer words match on their stem.
// Limit: a crude stem (the last two letters dropped); a real Greek stemmer would be closer.
const stemOf = (token: string) => (token.length >= 6 ? token.slice(0, -2) : token);

async function postings(token: string): Promise<Int32Array> {
  const index = await json<Record<string, string>>(`index/${shardOf(token)}.json`).catch(() => ({}) as Record<string, string>);
  if (token.length <= 3) {
    return index[token] ? decodePostings(index[token]) : new Int32Array();
  }
  const stem = stemOf(token);
  const lists = Object.keys(index)
    .filter((key) => key.startsWith(stem))
    .map((key) => decodePostings(index[key]));
  return lists.length > 0 ? merge(lists) : new Int32Array();
}

/** Records matching every word of the query, newest first; null when the query has no words. */
async function textMatches(q: string, stop: Set<string>): Promise<Int32Array | null> {
  const perKey = searchKeys(q)
    .map((key) => key.split(" ").filter((token) => token.length > 1 && !stop.has(token)))
    .filter((tokens) => tokens.length > 0);
  if (perKey.length === 0) {
    return null;
  }
  const results = await Promise.all(
    perKey.map(async (tokens) => {
      const lists = await Promise.all(tokens.map(postings));
      lists.sort((a, b) => a.length - b.length);
      return lists.reduce(intersect);
    }),
  );
  return merge(results);
}

const DAY = 86_400_000;
const dayNumber = (m: Meta, date: string) => Math.round((Date.parse(date) - Date.parse(m.epoch)) / DAY);

export type SearchResult = { total: number; items: ItemSummary[]; mode: "text" | "greeklish" | "identifier" | "browse" };

export async function search(values: SearchFormValues, page: number, pageSize: number): Promise<SearchResult> {
  const m = await meta();
  const q = values.q?.trim() ?? "";

  // An ΑΔΑΜ or ΑΔΑ opens that record.
  if (q && !/\s/.test(q)) {
    for (const id of new Set([q, q.toUpperCase()])) {
      const index = await indexOf(id);
      if (index !== undefined) {
        return { total: 1, items: await summaries([index]), mode: "identifier" };
      }
    }
  }

  const matches = q ? await textMatches(q, new Set(m.stopTokens)) : null;
  const need = new Set<string>(matches ? [] : ["flags"]);
  if (values.kind) need.add("kind");
  if (values.signal) need.add("flags");
  if (values.cpv) need.add("cpv");
  if (values.nuts) need.add("nuts");
  if (values.organisation) need.add("org");
  if (values.minAmount || values.maxAmount || values.sort === "amount") need.add("amount");
  if (values.from || values.to) need.add("published");
  if (values.sort === "deadline") need.add("deadline");
  const names = [...need];
  const buffers = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await column(name)] as const)));
  const flags = buffers.flags && new Uint8Array(buffers.flags);
  const kind = buffers.kind && new Uint8Array(buffers.kind);
  const cpv = buffers.cpv && new Uint32Array(buffers.cpv);
  const nuts = buffers.nuts && new Uint16Array(buffers.nuts);
  const org = buffers.org && new Uint16Array(buffers.org);
  const amount = buffers.amount && new Float32Array(buffers.amount);
  const published = buffers.published && new Uint16Array(buffers.published);
  const deadline = buffers.deadline && new Uint16Array(buffers.deadline);

  const tests: ((i: number) => boolean)[] = [];
  if (!matches) tests.push((i) => !(flags![i] & FLAGS.superseded)); // text matches never include them
  if (values.kind) {
    const k = m.kinds.indexOf(values.kind);
    tests.push((i) => kind![i] === k);
  }
  if (values.signal && values.signal in FLAGS) {
    const bit = FLAGS[values.signal as keyof typeof FLAGS];
    tests.push((i) => (flags![i] & bit) !== 0);
  }
  if (values.cpv) {
    // Limit: only a record's first CPV code is filterable here; the full site matches any.
    const digits = values.cpv.replace(/\D/g, "").slice(0, 8);
    const scale = 10 ** (8 - digits.length);
    const low = Number(digits) * scale;
    tests.push((i) => cpv![i] >= low && cpv![i] < low + scale);
  }
  if (values.nuts) {
    const allowed = new Set(m.nuts.flatMap((code, i) => (code.startsWith(values.nuts!) ? [i] : [])));
    tests.push((i) => nuts![i] !== NONE16 && allowed.has(nuts![i]));
  }
  if (values.organisation) {
    const position = (await authorities()).findIndex(([id]) => id === values.organisation);
    tests.push((i) => org![i] === position);
  }
  const min = Number(values.minAmount);
  const max = Number(values.maxAmount);
  if (values.minAmount && Number.isFinite(min)) tests.push((i) => amount![i] >= min);
  if (values.maxAmount && Number.isFinite(max)) tests.push((i) => amount![i] <= max);
  if (values.from) {
    const from = dayNumber(m, values.from);
    tests.push((i) => published![i] >= from);
  }
  if (values.to) {
    const to = dayNumber(m, values.to);
    tests.push((i) => published![i] !== 0 && published![i] <= to);
  }

  const candidates = matches ?? { length: m.count };
  const found: number[] = [];
  for (let n = 0; n < candidates.length; n++) {
    const i = matches ? matches[n] : n;
    if (tests.every((test) => test(i))) {
      found.push(i);
    }
  }

  // Newest first is the files' own order; the other sorts are the API's.
  if (values.sort === "amount") {
    const value = (i: number) => (Number.isNaN(amount![i]) || amount![i] > PLAUSIBLE_MAX ? -1 : amount![i]);
    found.sort((a, b) => value(b) - value(a) || a - b);
  } else if (values.sort === "deadline") {
    const today = dayNumber(m, new Date().toISOString().slice(0, 10));
    const rank = (i: number) => (deadline![i] === 0 ? 2 : deadline![i] < today ? 1 : 0);
    found.sort((a, b) => rank(a) - rank(b) || (rank(a) < 2 ? deadline![a] - deadline![b] : 0) || a - b);
  }

  const start = (page - 1) * pageSize;
  const items = await summaries(found.slice(start, start + pageSize));
  const mode = !q ? "browse" : /[a-z]/i.test(q) && !/[Ͱ-Ͽ]/.test(q.toLowerCase()) ? "greeklish" : "text";
  return { total: found.length, items, mode };
}
