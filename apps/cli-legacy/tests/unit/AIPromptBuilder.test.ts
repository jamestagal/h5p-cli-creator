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

/**
 * Unit tests for Language Prompt Injection (Task Group 3)
 * Tests multi-language AI content generation features
 */
describe("AIPromptBuilder - Language Prompt Injection", () => {
  describe("CONTENT LANGUAGE injection", () => {
    test("should inject CONTENT LANGUAGE instruction when targetLanguage specified", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi"
      });

      expect(prompt).toContain("CONTENT LANGUAGE:");
      expect(prompt).toContain("Vietnamese (vi)");
      expect(prompt).toContain("Generate all educational content");
      expect(prompt).toContain("questions, answers, explanations");
      expect(prompt).toContain("Do not translate content to other languages");
    });

    test("should resolve language name from ISO code", () => {
      const frenchPrompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "fr"
      });

      expect(frenchPrompt).toContain("French (fr)");

      const germanPrompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "de"
      });

      expect(germanPrompt).toContain("German (de)");
    });

    test("should not inject CONTENT LANGUAGE when targetLanguage not specified", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({});

      expect(prompt).not.toContain("CONTENT LANGUAGE:");
    });
  });

  describe("INSTRUCTIONAL LANGUAGE injection", () => {
    test("should inject INSTRUCTIONAL LANGUAGE when it differs from targetLanguage", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi",
        instructionalLanguage: "en"
      });

      expect(prompt).toContain("INSTRUCTIONAL LANGUAGE:");
      expect(prompt).toContain("English (en)");
      expect(prompt).toContain("task instructions, directions, and scaffolding text");
      expect(prompt).toContain("quiz instructions, activity directions");
    });

    test("should NOT inject INSTRUCTIONAL LANGUAGE when it equals targetLanguage", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi",
        instructionalLanguage: "vi" // Same as target
      });

      expect(prompt).not.toContain("INSTRUCTIONAL LANGUAGE:");
    });

    test("should NOT inject INSTRUCTIONAL LANGUAGE when not specified (monolingual mode)", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi"
        // No instructionalLanguage specified
      });

      expect(prompt).not.toContain("INSTRUCTIONAL LANGUAGE:");
    });
  });

  describe("TRANSLATIONS instruction injection", () => {
    test("should inject TRANSLATIONS instruction when includeTranslations=true", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi",
        includeTranslations: true
      });

      expect(prompt).toContain("TRANSLATIONS:");
      expect(prompt).toContain("Include English translations");
      expect(prompt).toContain("Vietnamese terms");
      expect(prompt).toContain("Format: 'Term (translation)'");
    });

    test("should NOT inject TRANSLATIONS instruction when includeTranslations=false", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi",
        includeTranslations: false
      });

      expect(prompt).not.toContain("TRANSLATIONS:");
    });

    test("should NOT inject TRANSLATIONS instruction when not specified", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi"
      });

      expect(prompt).not.toContain("TRANSLATIONS:");
    });
  });

  describe("Language instruction ordering", () => {
    test("should inject CONTENT LANGUAGE after TONE section", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi",
        tone: "educational"
      });

      const toneIndex = prompt.indexOf("TONE: EDUCATIONAL");
      const contentLangIndex = prompt.indexOf("CONTENT LANGUAGE:");

      expect(contentLangIndex).toBeGreaterThan(toneIndex);
    });

    test("should inject INSTRUCTIONAL LANGUAGE after CONTENT LANGUAGE", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi",
        instructionalLanguage: "en"
      });

      const contentLangIndex = prompt.indexOf("CONTENT LANGUAGE:");
      const instructionalLangIndex = prompt.indexOf("INSTRUCTIONAL LANGUAGE:");

      expect(instructionalLangIndex).toBeGreaterThan(contentLangIndex);
    });

    test("should inject TRANSLATIONS after INSTRUCTIONAL LANGUAGE", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetLanguage: "vi",
        instructionalLanguage: "en",
        includeTranslations: true
      });

      const instructionalLangIndex = prompt.indexOf("INSTRUCTIONAL LANGUAGE:");
      const translationsIndex = prompt.indexOf("TRANSLATIONS:");

      expect(translationsIndex).toBeGreaterThan(instructionalLangIndex);
    });
  });
});

/**
 * Unit tests for Language Configuration Cascade (Task Group 3)
 * Tests resolveConfig() language field cascading
 */
describe("AIPromptBuilder - Language Configuration Cascade", () => {
  describe("targetLanguage cascade", () => {
    test("should cascade targetLanguage from item > chapter > book", () => {
      const itemConfig: AIConfiguration = { targetLanguage: "vi" };
      const chapterConfig: AIConfiguration = { targetLanguage: "fr" };
      const bookConfig: AIConfiguration = { targetLanguage: "de" };

      const resolved = AIPromptBuilder.resolveConfig(
        itemConfig,
        chapterConfig,
        bookConfig
      );

      expect(resolved.targetLanguage).toBe("vi"); // Item wins
    });

    test("should fall back to chapter targetLanguage when item not specified", () => {
      const chapterConfig: AIConfiguration = { targetLanguage: "fr" };
      const bookConfig: AIConfiguration = { targetLanguage: "de" };

      const resolved = AIPromptBuilder.resolveConfig(
        undefined,
        chapterConfig,
        bookConfig
      );

      expect(resolved.targetLanguage).toBe("fr"); // Chapter wins
    });

    test("should fall back to book targetLanguage when item and chapter not specified", () => {
      const bookConfig: AIConfiguration = { targetLanguage: "de" };

      const resolved = AIPromptBuilder.resolveConfig(
        undefined,
        undefined,
        bookConfig
      );

      expect(resolved.targetLanguage).toBe("de"); // Book wins
    });

    test("should return undefined when targetLanguage not specified at any level", () => {
      const resolved = AIPromptBuilder.resolveConfig();

      expect(resolved.targetLanguage).toBeUndefined();
    });
  });

  describe("instructionalLanguage cascade", () => {
    test("should cascade instructionalLanguage from item > chapter > book", () => {
      const itemConfig: AIConfiguration = { instructionalLanguage: "en" };
      const chapterConfig: AIConfiguration = { instructionalLanguage: "fr" };
      const bookConfig: AIConfiguration = { instructionalLanguage: "de" };

      const resolved = AIPromptBuilder.resolveConfig(
        itemConfig,
        chapterConfig,
        bookConfig
      );

      expect(resolved.instructionalLanguage).toBe("en"); // Item wins
    });

    test("should return undefined when instructionalLanguage not specified (defaults to targetLanguage)", () => {
      const resolved = AIPromptBuilder.resolveConfig();

      expect(resolved.instructionalLanguage).toBeUndefined();
    });
  });

  describe("includeTranslations cascade", () => {
    test("should cascade includeTranslations from item > chapter > book", () => {
      const itemConfig: AIConfiguration = { includeTranslations: true };
      const chapterConfig: AIConfiguration = { includeTranslations: false };
      const bookConfig: AIConfiguration = { includeTranslations: false };

      const resolved = AIPromptBuilder.resolveConfig(
        itemConfig,
        chapterConfig,
        bookConfig
      );

      expect(resolved.includeTranslations).toBe(true); // Item wins
    });

    test("should default to false when includeTranslations not specified", () => {
      const resolved = AIPromptBuilder.resolveConfig();

      expect(resolved.includeTranslations).toBe(false);
    });
  });

  describe("mixed language and non-language config cascade", () => {
    test("should cascade both language and non-language fields independently", () => {
      const itemConfig: AIConfiguration = { targetLanguage: "vi" };
      const chapterConfig: AIConfiguration = { tone: "academic", instructionalLanguage: "en" };
      const bookConfig: AIConfiguration = { targetAudience: "college", includeTranslations: true };

      const resolved = AIPromptBuilder.resolveConfig(
        itemConfig,
        chapterConfig,
        bookConfig
      );

      expect(resolved.targetLanguage).toBe("vi"); // From item
      expect(resolved.instructionalLanguage).toBe("en"); // From chapter
      expect(resolved.includeTranslations).toBe(true); // From book
      expect(resolved.tone).toBe("academic"); // From chapter
      expect(resolved.targetAudience).toBe("college"); // From book
    });
  });
});
