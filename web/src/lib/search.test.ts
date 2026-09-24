import { describe, expect, it } from "vitest";
import { pageWindow } from "./search";

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the ends and the neighbours, with gaps between", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, null, 20]);
    expect(pageWindow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pageWindow(20, 20)).toEqual([1, null, 19, 20]);
  });

  it("fills a one-page gap with the page", () => {
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
  });
});
