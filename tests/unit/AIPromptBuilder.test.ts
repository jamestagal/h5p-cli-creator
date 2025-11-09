import { AIPromptBuilder } from "../../src/ai/AIPromptBuilder";
import { AIConfiguration } from "../../src/compiler/types";

/**
 * Unit tests for AIPromptBuilder
 * Tests Task Group 5.2: Reading Level Presets
 * Tests Task Group 5.3: AIPromptBuilder Service
 */
describe("AIPromptBuilder - Reading Level Presets", () => {
  describe("Reading level preset retrieval", () => {
    test("should retrieve elementary preset", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "elementary"
      });

      expect(prompt).toContain("READING LEVEL: ELEMENTARY");
      expect(prompt).toContain("8-12 words");
      expect(prompt).toContain("simple, everyday vocabulary");
    });

    test("should retrieve grade-6 preset", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "grade-6"
      });

      expect(prompt).toContain("READING LEVEL: GRADE-6");
      expect(prompt).toContain("12-15 words");
      expect(prompt).toContain("grade-appropriate vocabulary");
    });

    test("should retrieve grade-9 preset", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "grade-9"
      });

      expect(prompt).toContain("READING LEVEL: GRADE-9");
      expect(prompt).toContain("15-20 words");
      expect(prompt).toContain("broader vocabulary");
    });

    test("should retrieve high-school preset", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "high-school"
      });

      expect(prompt).toContain("READING LEVEL: HIGH-SCHOOL");
      expect(prompt).toContain("18-25 words");
      expect(prompt).toContain("advanced vocabulary");
    });

    test("should retrieve college preset", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "college"
      });

      expect(prompt).toContain("READING LEVEL: COLLEGE");
      expect(prompt).toContain("academic");
      expect(prompt).toContain("discipline-specific");
    });

    test("should retrieve professional preset", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "professional"
      });

      expect(prompt).toContain("READING LEVEL: PROFESSIONAL");
      expect(prompt).toContain("concise");
      expect(prompt).toContain("industry");
    });

    test("should retrieve esl-beginner preset", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "esl-beginner"
      });

      expect(prompt).toContain("READING LEVEL: ESL-BEGINNER");
      expect(prompt).toContain("5-8 words");
      expect(prompt).toContain("common, high-frequency vocabulary");
    });

    test("should retrieve esl-intermediate preset", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "esl-intermediate"
      });

      expect(prompt).toContain("READING LEVEL: ESL-INTERMEDIATE");
      expect(prompt).toContain("10-15 words");
      expect(prompt).toContain("Expand vocabulary"); // Fixed: match actual implementation
    });
  });

  describe("Default preset fallback", () => {
    test("should default to grade-6 when no config provided", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt();

      expect(prompt).toContain("READING LEVEL: GRADE-6");
      expect(prompt).toContain("12-15 words");
    });

    test("should default to grade-6 when config is empty object", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({});

      expect(prompt).toContain("READING LEVEL: GRADE-6");
    });
  });

  describe("Preset structure validation", () => {
    test("should include sentenceLength guidance", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "elementary"
      });

      // Should contain sentence length guidance
      expect(prompt).toMatch(/sentence/i);
      expect(prompt).toContain("8-12 words");
    });

    test("should include vocabulary guidance", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "grade-6"
      });

      // Should contain vocabulary guidance
      expect(prompt).toMatch(/vocabulary/i);
    });

    test("should include style guidance", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "professional"
      });

      // Should contain style guidance
      expect(prompt).toMatch(/tone|style/i);
    });

    test("should include examples guidance", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "esl-beginner"
      });

      // Should contain examples/context guidance
      expect(prompt).toMatch(/example|context/i);
    });
  });

  describe("Tone presets", () => {
    test("should include educational tone", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        tone: "educational"
      });

      expect(prompt).toContain("TONE: EDUCATIONAL");
      expect(prompt).toContain("instructional");
    });

    test("should include professional tone", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        tone: "professional"
      });

      expect(prompt).toContain("TONE: PROFESSIONAL");
      expect(prompt).toContain("concise");
    });

    test("should include casual tone", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        tone: "casual"
      });

      expect(prompt).toContain("TONE: CASUAL");
      expect(prompt).toContain("conversational");
    });

    test("should include academic tone", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        tone: "academic"
      });

      expect(prompt).toContain("TONE: ACADEMIC");
      expect(prompt).toContain("scholarly");
    });

    test("should default to educational tone when not specified", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt();

      expect(prompt).toContain("TONE: EDUCATIONAL");
    });
  });
});

describe("AIPromptBuilder - Service Methods", () => {
  describe("buildSystemPrompt()", () => {
    test("should always include formatting rules", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt();

      expect(prompt).toContain("CRITICAL FORMATTING REQUIREMENTS");
      expect(prompt).toContain("plain HTML");
      expect(prompt).toContain("<p>, <h2>, <strong>, <em>");
      expect(prompt).toContain("DO NOT use markdown");
    });

    test("should combine reading level and tone", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "college",
        tone: "academic"
      });

      expect(prompt).toContain("READING LEVEL: COLLEGE");
      expect(prompt).toContain("TONE: ACADEMIC");
    });
  });

  describe("buildCompletePrompt()", () => {
    test("should combine system prompt and user prompt", () => {
      const userPrompt = "Explain photosynthesis";
      const completePrompt = AIPromptBuilder.buildCompletePrompt(userPrompt);

      expect(completePrompt).toContain("CRITICAL FORMATTING REQUIREMENTS");
      expect(completePrompt).toContain("READING LEVEL: GRADE-6");
      expect(completePrompt).toContain("Explain photosynthesis");
    });

    test("should include customization when provided", () => {
      const userPrompt = "Explain gravity";
      const config: AIConfiguration = {
        customization: "Focus on visual learners. Use analogies."
      };

      const completePrompt = AIPromptBuilder.buildCompletePrompt(userPrompt, config);

      expect(completePrompt).toContain("Explain gravity");
      expect(completePrompt).toContain("ADDITIONAL CUSTOMIZATION");
      expect(completePrompt).toContain("Focus on visual learners");
      expect(completePrompt).toContain("Use analogies");
    });

    test("should omit customization section when not provided", () => {
      const userPrompt = "Explain gravity";
      const completePrompt = AIPromptBuilder.buildCompletePrompt(userPrompt);

      expect(completePrompt).not.toContain("ADDITIONAL CUSTOMIZATION");
    });

    test("should handle empty customization string", () => {
      const userPrompt = "Explain gravity";
      const config: AIConfiguration = {
        customization: ""
      };

      const completePrompt = AIPromptBuilder.buildCompletePrompt(userPrompt, config);

      expect(completePrompt).not.toContain("ADDITIONAL CUSTOMIZATION");
    });
  });

  describe("resolveConfig()", () => {
    test("should use defaults when no config provided", () => {
      const resolved = AIPromptBuilder.resolveConfig();

      expect(resolved.targetAudience).toBe("grade-6");
      expect(resolved.tone).toBe("educational");
      expect(resolved.outputStyle).toBe("plain-html");
    });

    test("should prioritize item over chapter over book", () => {
      const itemConfig: AIConfiguration = { targetAudience: "college" };
      const chapterConfig: AIConfiguration = { targetAudience: "high-school" };
      const bookConfig: AIConfiguration = { targetAudience: "grade-6" };

      const resolved = AIPromptBuilder.resolveConfig(
        itemConfig,
        chapterConfig,
        bookConfig
      );

      expect(resolved.targetAudience).toBe("college");
    });

    test("should merge configs from different levels", () => {
      const itemConfig: AIConfiguration = { targetAudience: "college" };
      const chapterConfig: AIConfiguration = { tone: "academic" };
      const bookConfig: AIConfiguration = { customization: "Focus on examples" };

      const resolved = AIPromptBuilder.resolveConfig(
        itemConfig,
        chapterConfig,
        bookConfig
      );

      expect(resolved.targetAudience).toBe("college");
      expect(resolved.tone).toBe("academic");
      expect(resolved.customization).toBe("Focus on examples");
    });

    test("should fall back to chapter config when item config missing", () => {
      const chapterConfig: AIConfiguration = { targetAudience: "high-school" };
      const bookConfig: AIConfiguration = { targetAudience: "grade-6" };

      const resolved = AIPromptBuilder.resolveConfig(
        undefined,
        chapterConfig,
        bookConfig
      );

      expect(resolved.targetAudience).toBe("high-school");
    });

    test("should fall back to book config when chapter and item missing", () => {
      const bookConfig: AIConfiguration = { targetAudience: "elementary" };

      const resolved = AIPromptBuilder.resolveConfig(
        undefined,
        undefined,
        bookConfig
      );

      expect(resolved.targetAudience).toBe("elementary");
    });

    test("should handle partial configs", () => {
      const itemConfig: AIConfiguration = { tone: "professional" };

      const resolved = AIPromptBuilder.resolveConfig(itemConfig);

      expect(resolved.targetAudience).toBe("grade-6"); // default
      expect(resolved.tone).toBe("professional");
      expect(resolved.outputStyle).toBe("plain-html"); // default
    });
  });
});
