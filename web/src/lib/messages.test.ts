import { describe, expect, it } from "vitest";
import el from "../../messages/el.json";
import en from "../../messages/en.json";

function keys(messages: object, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe("messages", () => {
  it("English has exactly the Greek keys", () => {
    expect(keys(en).sort()).toEqual(keys(el).sort());
  });
});
