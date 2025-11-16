/**
 * Integration tests for YAML parsing with AI configuration (Task 5.5.1)
 *
 * Tests YAML parsing for book-level, chapter-level, and item-level aiConfig.
 * Verifies validation, multiline customization, and backward compatibility.
 */

import { YamlInputParser } from "../../src/compiler/YamlInputParser";
import * as fsExtra from "fs-extra";
import * as path from "path";

describe("YAML AI Configuration Integration", () => {
  const parser = new YamlInputParser();
  const testYamlDir = path.join(__dirname, "..", "yaml-fixtures");

  beforeAll(async () => {
    // Create test YAML fixtures directory
    await fsExtra.ensureDir(testYamlDir);
  });

  afterAll(async () => {
    // Clean up test fixtures
    await fsExtra.remove(testYamlDir);
  });

  describe("Book-level aiConfig parsing", () => {
    it("should parse book-level aiConfig from YAML", async () => {
      const yamlPath = path.join(testYamlDir, "book-level-config.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: "Focus on visual learners"
chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Sample text"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = await parser.parse(yamlPath);

      expect(bookDef.aiConfig).toBeDefined();
      expect(bookDef.aiConfig?.targetAudience).toBe("grade-6");
      expect(bookDef.aiConfig?.tone).toBe("educational");
      expect(bookDef.aiConfig?.customization).toBe("Focus on visual learners");
    });

    it("should support multiline customization field using YAML pipe syntax", async () => {
      const yamlPath = path.join(testYamlDir, "multiline-customization.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
aiConfig:
  targetAudience: "high-school"
  tone: "academic"
  customization: |
    Focus on visual learners.
    Use analogies to explain complex concepts.
    Include real-world examples from medicine.
chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Sample text"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = await parser.parse(yamlPath);

      expect(bookDef.aiConfig?.customization).toBeDefined();
      expect(bookDef.aiConfig?.customization).toContain("Focus on visual learners.");
      expect(bookDef.aiConfig?.customization).toContain("Use analogies to explain complex concepts.");
      expect(bookDef.aiConfig?.customization).toContain("Include real-world examples from medicine.");
    });
  });

  describe("Chapter-level aiConfig parsing", () => {
    it("should parse chapter-level aiConfig and override book config", async () => {
      const yamlPath = path.join(testYamlDir, "chapter-level-config.yaml");
      const yamlContent = `
title: "Mixed Level Book"
language: "en"
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
chapters:
  - title: "Basic Chapter"
    content:
      - type: text
        text: "Basic content"
  - title: "Advanced Chapter"
    aiConfig:
      targetAudience: "college"
      tone: "academic"
    content:
      - type: text
        text: "Advanced content"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = await parser.parse(yamlPath);

      expect(bookDef.aiConfig?.targetAudience).toBe("grade-6");
      expect(bookDef.chapters[0].aiConfig).toBeUndefined();
      expect(bookDef.chapters[1].aiConfig).toBeDefined();
      expect(bookDef.chapters[1].aiConfig?.targetAudience).toBe("college");
      expect(bookDef.chapters[1].aiConfig?.tone).toBe("academic");
    });
  });

  describe("Item-level aiConfig parsing", () => {
    it("should parse item-level aiConfig and override chapter/book config", async () => {
      const yamlPath = path.join(testYamlDir, "item-level-config.yaml");
      const yamlContent = `
title: "ESL Course"
language: "en"
aiConfig:
  targetAudience: "esl-intermediate"
  tone: "educational"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Explain the water cycle"
        aiConfig:
          targetAudience: "esl-beginner"
          customization: "Use only present tense. Avoid idioms."
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = await parser.parse(yamlPath);

      expect(bookDef.aiConfig?.targetAudience).toBe("esl-intermediate");
      const aiTextItem = bookDef.chapters[0].content[0];
      expect(aiTextItem.type).toBe("ai-text");
      if (aiTextItem.type === "ai-text") {
        expect(aiTextItem.aiConfig).toBeDefined();
        expect(aiTextItem.aiConfig?.targetAudience).toBe("esl-beginner");
        expect(aiTextItem.aiConfig?.customization).toContain("Use only present tense");
      }
    });
  });

  describe("aiConfig validation", () => {
    it("should reject invalid reading level in book-level aiConfig", async () => {
      const yamlPath = path.join(testYamlDir, "invalid-reading-level.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
aiConfig:
  targetAudience: "invalid-level"
chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Sample text"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      await expect(parser.parse(yamlPath)).rejects.toThrow(/Invalid targetAudience/);
      await expect(parser.parse(yamlPath)).rejects.toThrow(/elementary, grade-6, grade-9, high-school, college, professional, esl-beginner, esl-intermediate/);
    });

    it("should reject invalid tone in book-level aiConfig", async () => {
      const yamlPath = path.join(testYamlDir, "invalid-tone.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
aiConfig:
  targetAudience: "grade-6"
  tone: "super-casual"
chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Sample text"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      await expect(parser.parse(yamlPath)).rejects.toThrow(/Invalid tone/);
      await expect(parser.parse(yamlPath)).rejects.toThrow(/educational, professional, casual, academic/);
    });

    it("should reject invalid reading level in chapter-level aiConfig", async () => {
      const yamlPath = path.join(testYamlDir, "invalid-chapter-config.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    aiConfig:
      targetAudience: "advanced"
    content:
      - type: text
        text: "Sample text"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      await expect(parser.parse(yamlPath)).rejects.toThrow(/Invalid targetAudience/);
    });

    it("should reject invalid aiConfig in item-level aiConfig", async () => {
      const yamlPath = path.join(testYamlDir, "invalid-item-config.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Test prompt"
        aiConfig:
          tone: "informal"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      await expect(parser.parse(yamlPath)).rejects.toThrow(/Invalid tone/);
    });
  });

  describe("Backward compatibility", () => {
    it("should parse YAML without aiConfig using defaults", async () => {
      const yamlPath = path.join(testYamlDir, "no-ai-config.yaml");
      const yamlContent = `
title: "Legacy Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Explain gravity"
      - type: ai-quiz
        sourceText: "Gravity is a force..."
        questionCount: 3
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = await parser.parse(yamlPath);

      // Should parse successfully without aiConfig
      expect(bookDef.aiConfig).toBeUndefined();
      expect(bookDef.chapters[0].aiConfig).toBeUndefined();
      expect(bookDef.chapters[0].content[0]).toBeDefined();
      expect(bookDef.chapters[0].content[0].type).toBe("ai-text");

      // ai-text and ai-quiz should have no aiConfig (will use defaults)
      const aiTextItem = bookDef.chapters[0].content[0];
      if (aiTextItem.type === "ai-text") {
        expect(aiTextItem.aiConfig).toBeUndefined();
      }

      const aiQuizItem = bookDef.chapters[0].content[1];
      if (aiQuizItem.type === "ai-quiz") {
        expect(aiQuizItem.aiConfig).toBeUndefined();
      }
    });
  });
});
