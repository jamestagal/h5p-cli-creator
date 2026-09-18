import { describe, it, expect } from "vitest";
import { ActivityBase, ItemBase, Provenance, TextPage, ImagePage, SCHEMA_VERSION } from "../src/index.js";

describe("base schemas", () => {
  it("fills defaults for language, schemaVersion and provenance arrays", () => {
    const parsed = ActivityBase.parse({ id: "a1", title: "T" });
    expect(parsed.language).toBe("en");
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.provenance).toBeUndefined();
  });

  it("provenance defaults empty id arrays", () => {
    expect(Provenance.parse({})).toEqual({ conceptIds: [], evidenceIds: [], criteriaIds: [] });
  });

  it("rejects an empty id", () => {
    expect(() => ActivityBase.parse({ id: "", title: "T" })).toThrow();
  });

  it("ItemBase keeps provenance through parsing and requires an id", () => {
    const item = ItemBase.parse({ id: "c1", provenance: { conceptIds: ["k1"], evidenceIds: ["e1"] } });
    expect(item.provenance).toEqual({ conceptIds: ["k1"], evidenceIds: ["e1"], criteriaIds: [] });
    expect(() => ItemBase.parse({ provenance: {} })).toThrow();
  });

  it("pages: text requires html, image requires assetId and alt", () => {
    expect(TextPage.parse({ type: "text", title: "Intro", html: "<p>hi</p>" }).type).toBe("text");
    expect(() => ImagePage.parse({ type: "image", title: "Pic" })).toThrow();
    expect(ImagePage.parse({ type: "image", title: "Pic", assetId: "img-1", alt: "A pic" }).alt).toBe("A pic");
  });
});
