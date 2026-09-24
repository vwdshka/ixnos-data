import { describe, expect, it } from "vitest";
import { decodePostings, fnv1a } from "./data";

describe("static data helpers", () => {
  it("hashes like the exporter (FNV-1a test vectors)", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });

  it("reads posting lists", () => {
    // [5, 130, 131, 20000]: differences 6, 125, 1, 19869 as varints.
    const bytes = [6, 125, 1, 0x80 | 29, 0x80 | 27, 1]; // 19869 = 29 + 27·128 + 1·128²
    expect([...decodePostings(btoa(String.fromCharCode(...bytes)))]).toEqual([5, 130, 131, 20000]);
  });
});
