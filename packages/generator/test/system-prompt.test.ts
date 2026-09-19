import { describe, it, expect } from "vitest";
import { buildSystemPrompt, READING_LEVELS, TONES, GROUNDING_RULES } from "../src/prompts/system.js";

describe("system prompt", () => {
  it("carries the reading level, tone, language and grounding rules", () => {
    const p = buildSystemPrompt({ readingLevel: "professional", tone: "educational", language: "en" });
    expect(p).toContain("READING LEVEL: PROFESSIONAL");
    expect(p).toContain(READING_LEVELS.professional.vocabulary);
    expect(p).toContain(TONES.educational);
    expect(p).toContain(GROUNDING_RULES);
    expect(p).toContain("CONTENT LANGUAGE: English (en)");
    expect(p).not.toContain("INSTRUCTIONAL LANGUAGE");
  });
  it("adds instructional language and customisation only when given", () => {
    const p = buildSystemPrompt({ readingLevel: "esl-intermediate", tone: "casual", language: "vi", instructionalLanguage: "en", customisation: "Use construction-site examples." });
    expect(p).toContain("INSTRUCTIONAL LANGUAGE: English (en)");
    expect(p).toContain("ADDITIONAL CUSTOMISATION:\nUse construction-site examples.");
  });
  it("is stable for identical config (cache prefix)", () => {
    const a = buildSystemPrompt({ readingLevel: "grade-9", tone: "academic", language: "en" });
    const b = buildSystemPrompt({ readingLevel: "grade-9", tone: "academic", language: "en" });
    expect(a).toBe(b);
  });
});
