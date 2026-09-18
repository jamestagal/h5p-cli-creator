import { describe, it, expect } from "vitest";
import { createIdFactory } from "../src/ids.js";

describe("deterministic ids", () => {
  it("is stable for the same activity, revision and path", () => {
    const a = createIdFactory("act-1", 3).subContentId("answers/0");
    const b = createIdFactory("act-1", 3).subContentId("answers/0");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("changes with revision and with path", () => {
    expect(createIdFactory("act-1", 3).subContentId("x")).not.toBe(createIdFactory("act-1", 4).subContentId("x"));
    expect(createIdFactory("act-1", 3).subContentId("x")).not.toBe(createIdFactory("act-1", 3).subContentId("y"));
  });
  it("scoped factories keep the root id and revision", () => {
    const root = createIdFactory("book-1", 2);
    const child = root.scope("chapters/0/items/1");
    expect(child.subContentId("questions/0")).toBe(root.subContentId("chapters/0/items/1/questions/0"));
    expect(child.subContentId("questions/0")).not.toBe(createIdFactory("book-2", 2).scope("chapters/0/items/1").subContentId("questions/0"));
    expect(child.subContentId("questions/0")).not.toBe(createIdFactory("book-1", 3).scope("chapters/0/items/1").subContentId("questions/0"));
  });
});
