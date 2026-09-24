import { describe, expect, it } from "vitest";
import cases from "../../../../contracts/text-normalisation/cases.json";
import { normalise, searchKeys } from "./greek";

describe("the shared Greek text cases", () => {
  it.each(cases.normalise)("normalise: $why", ({ input, expected }) => {
    expect(normalise(input)).toBe(expected);
  });

  it.each(cases.search_keys)("search keys: $why", ({ input, expected }) => {
    expect(searchKeys(input)).toEqual(expected);
  });
});
