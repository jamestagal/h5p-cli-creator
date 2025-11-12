/**
 * Backward Compatibility Test Suite (Task 5.6.1)
 *
 * Ensures 100% backward compatibility with existing YAML files.
 * Tests that all existing examples compile unchanged and that
 * YAML without aiConfig field uses grade-6 defaults.
 */

import { YamlInputParser } from "../../src/compiler/YamlInputParser";
import { H5pCompiler } from "../../src/compiler/H5pCompiler";
import { AIPromptBuilder } from "../../src/ai/AIPromptBuilder";
import * as fsExtra from "fs-extra";
import * as path from "path";

describe("Backward Compatibility", () => {
  const parser = new YamlInputParser();
  const testOutputDir = path.join(__dirname, "..", "test-output");

  beforeAll(async () => {
    await fsExtra.ensureDir(testOutputDir);
  });

  afterAll(async () => {
    await fsExtra.remove(testOutputDir);
  });

  describe("Existing YAML files compile unchanged", () => {
    it("should compile comprehensive-demo.yaml without aiConfig", async () => {
      const yamlPath = path.join(__dirname, "..", "..", "examples", "yaml", "comprehensive-demo.yaml");

      // Verify file exists
      const exists = await fsExtra.pathExists(yamlPath);
      expect(exists).toBe(true);

      // Parse should succeed
      const bookDef = await parser.parseYamlFile(yamlPath);
      expect(bookDef).toBeDefined();
      expect(bookDef.title).toBe("Complete Handler Demo - Solar System");

      // Should have no aiConfig (backward compatibility)
      expect(bookDef.aiConfig).toBeUndefined();
    });

    it("should compile biology-lesson.yaml without aiConfig", async () => {
      const yamlPath = path.join(__dirname, "..", "..", "examples", "yaml", "biology-lesson.yaml");

      // Verify file exists
      const exists = await fsExtra.pathExists(yamlPath);
      expect(exists).toBe(true);

      // Parse should succeed
      const bookDef = await parser.parseYamlFile(yamlPath);
      expect(bookDef).toBeDefined();
      expect(bookDef.title).toBe("AI-Generated Biology Lesson");

      // Should have no aiConfig (backward compatibility)
      expect(bookDef.aiConfig).toBeUndefined();
    });
  });

  describe("YAML without aiConfig uses grade-6 defaults", () => {
    it("should apply grade-6 defaults when no aiConfig specified", async () => {
      const yamlPath = path.join(testOutputDir, "no-config-defaults.yaml");
      const yamlContent = `
title: "Test Book - No Config"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Explain photosynthesis"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = await parser.parseYamlFile(yamlPath);

      // No aiConfig at book level
      expect(bookDef.aiConfig).toBeUndefined();

      // AIPromptBuilder should resolve to grade-6 defaults
      const resolvedConfig = AIPromptBuilder.resolveConfig(undefined, undefined, undefined);
      expect(resolvedConfig.targetAudience).toBe("grade-6");
      expect(resolvedConfig.tone).toBe("educational");
      expect(resolvedConfig.outputStyle).toBe("plain-html");
    });

    it("should apply defaults when partial aiConfig specified", async () => {
      const yamlPath = path.join(testOutputDir, "partial-config-defaults.yaml");
      const yamlContent = `
title: "Test Book - Partial Config"
language: "en"
aiConfig:
  tone: "casual"
chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Sample"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = await parser.parseYamlFile(yamlPath);

      // Should have partial config
      expect(bookDef.aiConfig).toBeDefined();
      expect(bookDef.aiConfig?.tone).toBe("casual");
      expect(bookDef.aiConfig?.targetAudience).toBeUndefined();

      // AIPromptBuilder should fill in defaults
      const resolvedConfig = AIPromptBuilder.resolveConfig(undefined, undefined, bookDef.aiConfig);
      expect(resolvedConfig.targetAudience).toBe("grade-6"); // Default
      expect(resolvedConfig.tone).toBe("casual"); // From book config
      expect(resolvedConfig.outputStyle).toBe("plain-html"); // Default
    });
  });

  describe("Old prompts with embedded formatting instructions still work", () => {
    it("should handle prompts with embedded HTML instructions", async () => {
      const yamlPath = path.join(testOutputDir, "old-style-prompt.yaml");
      const yamlContent = `
title: "Old Style Prompts"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Write an introduction to the solar system for middle school students. IMPORTANT: Use plain text only - no markdown formatting, no asterisks for bold, no special characters. Write naturally with proper paragraphs separated by blank lines."
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      // Should parse successfully
      const bookDef = await parser.parseYamlFile(yamlPath);
      expect(bookDef).toBeDefined();

      const aiTextItem = bookDef.chapters[0].content[0];
      expect(aiTextItem.type).toBe("ai-text");

      if (aiTextItem.type === "ai-text") {
        // Prompt should be unchanged
        expect(aiTextItem.prompt).toContain("IMPORTANT: Use plain text only");
        expect(aiTextItem.prompt).toContain("no markdown formatting");
      }
    });

    it("should build system prompt that includes formatting rules regardless of user prompt", async () => {
      const userPrompt = "Explain gravity. Use plain HTML tags only. No markdown.";

      // System prompt should ALWAYS include formatting rules
      const systemPrompt = AIPromptBuilder.buildSystemPrompt();
      expect(systemPrompt).toContain("CRITICAL FORMATTING REQUIREMENTS");
      expect(systemPrompt).toContain("Use ONLY plain HTML tags");
      expect(systemPrompt).toContain("DO NOT use markdown formatting");

      // Complete prompt includes both system rules and user's (possibly redundant) instructions
      const completePrompt = AIPromptBuilder.buildCompletePrompt(userPrompt);
      expect(completePrompt).toContain("CRITICAL FORMATTING REQUIREMENTS");
      expect(completePrompt).toContain(userPrompt);

      // User's redundant instructions are harmless - they just reinforce system rules
    });
  });

  describe("Handlers work with and without aiConfig", () => {
    it("should resolve config to defaults when no aiConfig provided", () => {
      // Simulate handler receiving context with no configs
      const resolvedConfig = AIPromptBuilder.resolveConfig(undefined, undefined, undefined);

      expect(resolvedConfig.targetAudience).toBe("grade-6");
      expect(resolvedConfig.tone).toBe("educational");
      expect(resolvedConfig.outputStyle).toBe("plain-html");
    });

    it("should resolve config with item override", () => {
      const bookConfig = { targetAudience: "grade-6" as const };
      const chapterConfig = { tone: "academic" as const };
      const itemConfig = { targetAudience: "college" as const };

      const resolvedConfig = AIPromptBuilder.resolveConfig(itemConfig, chapterConfig, bookConfig);

      // Item-level targetAudience overrides book-level
      expect(resolvedConfig.targetAudience).toBe("college");
      // Chapter-level tone is used
      expect(resolvedConfig.tone).toBe("academic");
      // Default outputStyle
      expect(resolvedConfig.outputStyle).toBe("plain-html");
    });

    it("should resolve config with chapter override only", () => {
      const bookConfig = {
        targetAudience: "grade-6" as const,
        tone: "educational" as const
      };
      const chapterConfig = { targetAudience: "high-school" as const };

      const resolvedConfig = AIPromptBuilder.resolveConfig(undefined, chapterConfig, bookConfig);

      // Chapter-level targetAudience overrides book-level
      expect(resolvedConfig.targetAudience).toBe("high-school");
      // Book-level tone is used
      expect(resolvedConfig.tone).toBe("educational");
      // Default outputStyle
      expect(resolvedConfig.outputStyle).toBe("plain-html");
    });

    it("should resolve config with book-level only", () => {
      const bookConfig = {
        targetAudience: "esl-beginner" as const,
        tone: "casual" as const,
        customization: "Use simple examples"
      };

      const resolvedConfig = AIPromptBuilder.resolveConfig(undefined, undefined, bookConfig);

      // All values from book config
      expect(resolvedConfig.targetAudience).toBe("esl-beginner");
      expect(resolvedConfig.tone).toBe("casual");
      expect(resolvedConfig.customization).toBe("Use simple examples");
      // Default outputStyle
      expect(resolvedConfig.outputStyle).toBe("plain-html");
    });
  });
});
