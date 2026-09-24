// Load test for the public API: a mix of searches, record pages, organisation pages and the
// status line, like visitors browsing. Run with k6 (see README.md next to this file).
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const HEADERS = __ENV.API_KEY ? { "X-Api-Key": __ENV.API_KEY } : {};

// Real queries: common and rare words, Greeklish, typos, filters.
const SEARCHES = [
  "q=καθαρισμός", "q=φάρμακα", "q=katharismos", "q=promithia farmakon", "q=σχολικά γεύματα",
  "q=ασφαλτόστρωση", "q=anavathmisi", "q=προμηθια καυσιμων", "q=λογισμικό&kind=notice",
  "cpv=45&nuts=EL3&sort=newest", "cpv=33&sort=deadline", "kind=award&minAmount=100000&sort=amount",
  "nuts=EL543&sort=newest", "q=συντήρηση&cpv=50", "signal=single_offer", "sort=newest",
];

export const options = {
  scenarios: {
    browsing: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: Number(__ENV.VUS || 20) },
        { duration: __ENV.HOLD || "1m", target: Number(__ENV.VUS || 20) },
        { duration: "15s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{page:search}": ["p(95)<2500"],
    "http_req_duration{page:item}": ["p(95)<500"],
    "http_req_duration{page:organisation}": ["p(95)<1000"],
    "http_req_duration{page:status}": ["p(95)<200"],
  },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Record and organisation identifiers to visit, taken from the newest records.
export function setup() {
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const response = http.get(`${BASE}/v1/search?sort=newest&pageSize=50&page=${page}`, { headers: HEADERS });
    items.push(...response.json("items"));
  }
  return {
    items: items.map((item) => item.sourceId),
    organisations: [...new Set(items.map((item) => item.organisation && item.organisation.id).filter(Boolean))],
  };
}

function get(path, page) {
  const response = http.get(`${BASE}${path}`, { headers: HEADERS, tags: { page } });
  check(response, { [`${page} ok`]: (r) => r.status === 200 });
}

export default function (data) {
  // A search with a random page, so the output cache doesn't answer everything. COLD=1 also
  // varies the page size, so every search reaches the database.
  const size = __ENV.COLD ? `&pageSize=${10 + Math.floor(Math.random() * 40)}` : "";
  get(`/v1/search?${encodeURI(pick(SEARCHES))}&page=${1 + Math.floor(Math.random() * 3)}${size}`, "search");
  sleep(1);
  get(`/v1/items/${encodeURIComponent(pick(data.items))}`, "item");
  sleep(1);
  if (Math.random() < 0.3) {
    get(`/v1/organisations/${encodeURIComponent(pick(data.organisations))}`, "organisation");
  }
  get("/v1/status", "status");
  sleep(1 + Math.random() * 2);
}
