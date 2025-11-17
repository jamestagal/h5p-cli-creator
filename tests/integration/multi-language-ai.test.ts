/**
 * Multi-Language AI Content Generation Integration Test Suite (Task Group 6)
 *
 * Tests the new multi-language features:
 * - targetLanguage configuration (content in target language)
 * - instructionalLanguage configuration (beginner scaffolding)
 * - includeTranslations configuration (bilingual content)
 * - Configuration cascade (book > chapter > item)
 * - Backward compatibility (legacy configs without language fields)
 * - Auto-detection from BookDefinition.language
 */

import { YamlInputParser } from "../../src/compiler/YamlInputParser";
import { AIPromptBuilder } from "../../src/ai/AIPromptBuilder";
import { LanguageUtils } from "../../src/ai/LanguageUtils";
import * as fsExtra from "fs-extra";
import * as path from "path";

describe("Multi-Language AI Content Generation", () => {
  const testOutputDir = path.join(__dirname, "..", "test-output", "multi-language");

  beforeAll(async () => {
    await fsExtra.ensureDir(testOutputDir);
  });

  afterAll(async () => {
    await fsExtra.remove(testOutputDir);
  });

  describe("Vietnamese story with beginner scaffolding (English instructions)", () => {
    it("should configure Vietnamese content with English instructions", async () => {
      const yamlPath = path.join(testOutputDir, "vietnamese-beginner.yaml");
      const yamlContent = `
title: "Peter learns Trời ơi!"
language: vi

aiConfig:
  targetLanguage: "vi"
  instructionalLanguage: "en"
  includeTranslations: true

chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Write a short story about Peter learning Vietnamese greetings"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = YamlInputParser.parse(yamlPath);

      // Verify language configuration
      expect(bookDef.language).toBe("vi");
      expect(bookDef.aiConfig).toBeDefined();
      expect(bookDef.aiConfig?.targetLanguage).toBe("vi");
      expect(bookDef.aiConfig?.instructionalLanguage).toBe("en");
      expect(bookDef.aiConfig?.includeTranslations).toBe(true);
    });

    it("should generate system prompt with Vietnamese content and English instructions", async () => {
      const config = {
        targetLanguage: "vi",
        instructionalLanguage: "en",
        includeTranslations: true,
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
        outputStyle: "plain-html" as const
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      // Should include content language instruction in Vietnamese
      expect(systemPrompt).toContain("CONTENT LANGUAGE");
      expect(systemPrompt).toContain("Vietnamese");
      expect(systemPrompt).toContain("(vi)");
      expect(systemPrompt).toContain("educational content");
      expect(systemPrompt).toContain("questions, answers, explanations");

      // Should include instructional language instruction in English
      expect(systemPrompt).toContain("INSTRUCTIONAL LANGUAGE");
      expect(systemPrompt).toContain("English");
      expect(systemPrompt).toContain("(en)");
      expect(systemPrompt).toContain("task instructions");
      expect(systemPrompt).toContain("directions");

      // Should include translation instruction
      expect(systemPrompt).toContain("TRANSLATIONS");
      expect(systemPrompt).toContain("English translations");
      expect(systemPrompt).toContain("parentheses");
      expect(systemPrompt).toContain("Vietnamese terms");
    });
  });

  describe("French story with full immersion (monolingual)", () => {
    it("should configure French content without instructional language", async () => {
      const yamlPath = path.join(testOutputDir, "french-immersion.yaml");
      const yamlContent = `
title: "Histoire Française"
language: fr

aiConfig:
  targetLanguage: "fr"
  includeTranslations: false

chapters:
  - title: "Chapitre 1"
    content:
      - type: ai-text
        prompt: "Écrivez une histoire sur la culture française"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = YamlInputParser.parse(yamlPath);

      // Verify language configuration
      expect(bookDef.language).toBe("fr");
      expect(bookDef.aiConfig).toBeDefined();
      expect(bookDef.aiConfig?.targetLanguage).toBe("fr");
      expect(bookDef.aiConfig?.instructionalLanguage).toBeUndefined();
      expect(bookDef.aiConfig?.includeTranslations).toBe(false);
    });

    it("should generate system prompt with monolingual French", async () => {
      const config = {
        targetLanguage: "fr",
        includeTranslations: false,
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
        outputStyle: "plain-html" as const
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      // Should include content language instruction in French
      expect(systemPrompt).toContain("CONTENT LANGUAGE");
      expect(systemPrompt).toContain("French");
      expect(systemPrompt).toContain("(fr)");

      // Should NOT include separate instructional language (defaults to French)
      expect(systemPrompt).not.toContain("INSTRUCTIONAL LANGUAGE");

      // Should NOT include translation instruction
      expect(systemPrompt).not.toContain("TRANSLATIONS");
      expect(systemPrompt).not.toContain("English translations");
    });
  });

  describe("Configuration cascade behavior", () => {
    it("should cascade targetLanguage from book to chapter to item", async () => {
      const bookConfig = { targetLanguage: "vi" };
      const chapterConfig = undefined;
      const itemConfig = undefined;

      const resolvedConfig = AIPromptBuilder.resolveConfig(itemConfig, chapterConfig, bookConfig);

      expect(resolvedConfig.targetLanguage).toBe("vi");
    });

    it("should allow chapter-level override of book-level targetLanguage", async () => {
      const bookConfig = { targetLanguage: "vi" };
      const chapterConfig = { targetLanguage: "fr" };
      const itemConfig = undefined;

      const resolvedConfig = AIPromptBuilder.resolveConfig(itemConfig, chapterConfig, bookConfig);

      expect(resolvedConfig.targetLanguage).toBe("fr");
    });

    it("should allow item-level override of chapter and book targetLanguage", async () => {
      const bookConfig = { targetLanguage: "vi" };
      const chapterConfig = { targetLanguage: "fr" };
      const itemConfig = { targetLanguage: "de" };

      const resolvedConfig = AIPromptBuilder.resolveConfig(itemConfig, chapterConfig, bookConfig);

      expect(resolvedConfig.targetLanguage).toBe("de");
    });

    it("should cascade instructionalLanguage independently of targetLanguage", async () => {
      const bookConfig = {
        targetLanguage: "vi",
        instructionalLanguage: "en"
      };
      const chapterConfig = undefined;
      const itemConfig = undefined;

      const resolvedConfig = AIPromptBuilder.resolveConfig(itemConfig, chapterConfig, bookConfig);

      expect(resolvedConfig.targetLanguage).toBe("vi");
      expect(resolvedConfig.instructionalLanguage).toBe("en");
    });

    it("should cascade includeTranslations from book level", async () => {
      const bookConfig = {
        targetLanguage: "vi",
        includeTranslations: true
      };
      const chapterConfig = undefined;
      const itemConfig = undefined;

      const resolvedConfig = AIPromptBuilder.resolveConfig(itemConfig, chapterConfig, bookConfig);

      expect(resolvedConfig.includeTranslations).toBe(true);
    });
  });

  describe("Auto-detection from BookDefinition.language", () => {
    it("should detect Vietnamese from book language when targetLanguage not specified", async () => {
      const yamlPath = path.join(testOutputDir, "auto-detect-vietnamese.yaml");
      const yamlContent = `
title: "Vietnamese Story"
language: vi

chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Write a story"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = YamlInputParser.parse(yamlPath);

      // Book language is set
      expect(bookDef.language).toBe("vi");
      // No aiConfig specified
      expect(bookDef.aiConfig).toBeUndefined();

      // Handlers should use book.language as fallback for targetLanguage
      // This is tested at the handler level in handler integration tests
    });

    it("should not auto-detect when targetLanguage is explicitly set", async () => {
      const yamlPath = path.join(testOutputDir, "explicit-override.yaml");
      const yamlContent = `
title: "English Content in Vietnamese Package"
language: vi

aiConfig:
  targetLanguage: "en"

chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Write a story in English"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = YamlInputParser.parse(yamlPath);

      // Book language is Vietnamese
      expect(bookDef.language).toBe("vi");
      // But targetLanguage explicitly set to English
      expect(bookDef.aiConfig?.targetLanguage).toBe("en");

      const resolvedConfig = AIPromptBuilder.resolveConfig(undefined, undefined, bookDef.aiConfig);
      expect(resolvedConfig.targetLanguage).toBe("en");
    });
  });

  describe("Invalid language code handling", () => {
    it("should accept unknown language codes with warning", async () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const languageName = LanguageUtils.getLanguageName("xyz");

      // Should return code as-is
      expect(languageName).toBe("xyz");

      // Should log warning
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown language code:")
      );

      consoleSpy.mockRestore();
    });

    it("should not block generation with invalid language codes", async () => {
      const yamlPath = path.join(testOutputDir, "invalid-language.yaml");
      const yamlContent = `
title: "Test Book"
language: en

aiConfig:
  targetLanguage: "xyz"

chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Sample"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      // Should parse successfully despite invalid language code
      const bookDef = YamlInputParser.parse(yamlPath);
      expect(bookDef).toBeDefined();
      expect(bookDef.aiConfig?.targetLanguage).toBe("xyz");
    });
  });

  describe("Backward compatibility", () => {
    it("should work with configs without new language fields", async () => {
      const yamlPath = path.join(testOutputDir, "legacy-config.yaml");
      const yamlContent = `
title: "Legacy Book"
language: en

aiConfig:
  targetAudience: "grade-6"
  tone: "educational"

chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Sample"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = YamlInputParser.parse(yamlPath);

      // Should parse successfully
      expect(bookDef).toBeDefined();
      expect(bookDef.aiConfig?.targetAudience).toBe("grade-6");
      expect(bookDef.aiConfig?.tone).toBe("educational");

      // New fields should be undefined
      expect(bookDef.aiConfig?.targetLanguage).toBeUndefined();
      expect(bookDef.aiConfig?.instructionalLanguage).toBeUndefined();
      expect(bookDef.aiConfig?.includeTranslations).toBeUndefined();
    });

    it("should generate default English content when no language specified", async () => {
      const config = AIPromptBuilder.resolveConfig(undefined, undefined, undefined);

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      // Should NOT include language-specific instructions
      expect(systemPrompt).not.toContain("CONTENT LANGUAGE");
      expect(systemPrompt).not.toContain("INSTRUCTIONAL LANGUAGE");
      expect(systemPrompt).not.toContain("TRANSLATIONS");

      // Should include default formatting rules
      expect(systemPrompt).toContain("CRITICAL FORMATTING REQUIREMENTS");
    });

    it("should not break existing Vietnamese demo without new fields", async () => {
      const yamlPath = path.join(__dirname, "..", "..", "examples", "yaml", "interactive-book", "vietnamese-story-demo.yaml");

      const exists = await fsExtra.pathExists(yamlPath);
      expect(exists).toBe(true);

      const bookDef = YamlInputParser.parse(yamlPath);
      expect(bookDef).toBeDefined();
      expect(bookDef.language).toBe("vi");

      // Old Vietnamese demo doesn't have new language fields
      expect(bookDef.aiConfig?.targetLanguage).toBeUndefined();
      expect(bookDef.aiConfig?.instructionalLanguage).toBeUndefined();
      expect(bookDef.aiConfig?.includeTranslations).toBeUndefined();
    });
  });

  describe("Bilingual content with translations", () => {
    it("should enable translations for Vietnamese learners", async () => {
      const config = {
        targetLanguage: "vi",
        instructionalLanguage: "en",
        includeTranslations: true,
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
        outputStyle: "plain-html" as const
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      expect(systemPrompt).toContain("TRANSLATIONS");
      expect(systemPrompt).toContain("English translations in parentheses");
      expect(systemPrompt).toContain("Vietnamese terms");
      expect(systemPrompt).toContain("Term (translation)");
    });

    it("should not enable translations for English content", async () => {
      const config = {
        targetLanguage: "en",
        includeTranslations: true, // Should be ignored for English
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
        outputStyle: "plain-html" as const
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      // Should NOT include translation instructions for English content
      expect(systemPrompt).not.toContain("TRANSLATIONS");
    });

    it("should disable translations when includeTranslations is false", async () => {
      const config = {
        targetLanguage: "vi",
        instructionalLanguage: "en",
        includeTranslations: false,
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
        outputStyle: "plain-html" as const
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      expect(systemPrompt).not.toContain("TRANSLATIONS");
      expect(systemPrompt).not.toContain("English translations");
    });
  });

  describe("Multiple language examples", () => {
    it("should support German content generation", async () => {
      const config = {
        targetLanguage: "de",
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
        outputStyle: "plain-html" as const
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      expect(systemPrompt).toContain("CONTENT LANGUAGE");
      expect(systemPrompt).toContain("German");
      expect(systemPrompt).toContain("(de)");
    });

    it("should support Spanish content generation", async () => {
      const config = {
        targetLanguage: "es",
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
        outputStyle: "plain-html" as const
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      expect(systemPrompt).toContain("CONTENT LANGUAGE");
      expect(systemPrompt).toContain("Spanish");
      expect(systemPrompt).toContain("(es)");
    });

    it("should support Japanese content generation", async () => {
      const config = {
        targetLanguage: "ja",
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
        outputStyle: "plain-html" as const
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      expect(systemPrompt).toContain("CONTENT LANGUAGE");
      expect(systemPrompt).toContain("Japanese");
      expect(systemPrompt).toContain("(ja)");
    });
  });
});
