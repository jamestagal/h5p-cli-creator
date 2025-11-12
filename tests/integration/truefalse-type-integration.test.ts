/**
 * Integration tests for TrueFalse type system integration (Task 4.1)
 *
 * Tests YAML parsing validation for "truefalse" and "ai-truefalse" content types.
 * Verifies both type identifiers and their aliases are recognized.
 */

import { YamlInputParser } from "../../src/compiler/YamlInputParser";
import * as fsExtra from "fs-extra";
import * as path from "path";

describe("TrueFalse Type Integration", () => {
  const testYamlDir = path.join(__dirname, "..", "yaml-fixtures");

  beforeAll(async () => {
    // Create test YAML fixtures directory
    await fsExtra.ensureDir(testYamlDir);
  });

  afterAll(async () => {
    // Clean up test fixtures
    await fsExtra.remove(testYamlDir);
  });

  describe("Manual TrueFalse type validation", () => {
    it("should validate 'truefalse' type with required fields", async () => {
      const yamlPath = path.join(testYamlDir, "truefalse-valid.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: truefalse
        question: "Oslo is the capital of Norway"
        correct: true
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = YamlInputParser.parseYamlFile(yamlPath);

      expect(bookDef).toBeDefined();
      if (!("chapters" in bookDef)) throw new Error("Expected BookDefinition");      expect(bookDef.chapters[0].content[0].type).toBe("truefalse");
      const tfItem = bookDef.chapters[0].content[0] as any;
      expect(tfItem.question).toBe("Oslo is the capital of Norway");
      expect(tfItem.correct).toBe(true);
    });

    it("should validate 'true-false' type alias", async () => {
      const yamlPath = path.join(testYamlDir, "true-false-alias.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: true-false
        question: "The Earth is flat"
        correct: false
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = YamlInputParser.parseYamlFile(yamlPath);

      expect(bookDef).toBeDefined();
      if (!("chapters" in bookDef)) throw new Error("Expected BookDefinition");      expect(bookDef.chapters[0].content[0].type).toBe("true-false");
      const tfItem = bookDef.chapters[0].content[0] as any;
      expect(tfItem.question).toBe("The Earth is flat");
      expect(tfItem.correct).toBe(false);
    });

    it("should reject truefalse without question field", async () => {
      const yamlPath = path.join(testYamlDir, "truefalse-no-question.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: truefalse
        correct: true
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      expect(() => YamlInputParser.parseYamlFile(yamlPath)).toThrow(/must have 'question' field/);
    });

    it("should reject truefalse without correct field", async () => {
      const yamlPath = path.join(testYamlDir, "truefalse-no-correct.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: truefalse
        question: "Test question"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      expect(() => YamlInputParser.parseYamlFile(yamlPath)).toThrow(/must have 'correct' field/);
    });

    it("should reject truefalse with non-boolean correct field", async () => {
      const yamlPath = path.join(testYamlDir, "truefalse-invalid-correct.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: truefalse
        question: "Test question"
        correct: "yes"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      expect(() => YamlInputParser.parseYamlFile(yamlPath)).toThrow(/must have 'correct' field \(boolean\)/);
    });
  });

  describe("AI TrueFalse type validation", () => {
    it("should validate 'ai-truefalse' type with required fields", async () => {
      const yamlPath = path.join(testYamlDir, "ai-truefalse-valid.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-truefalse
        prompt: "Create true/false questions about planets"
        questionCount: 5
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = YamlInputParser.parseYamlFile(yamlPath);

      expect(bookDef).toBeDefined();
      if (!("chapters" in bookDef)) throw new Error("Expected BookDefinition");      expect(bookDef.chapters[0].content[0].type).toBe("ai-truefalse");
      const aiTfItem = bookDef.chapters[0].content[0] as any;
      expect(aiTfItem.prompt).toBe("Create true/false questions about planets");
      expect(aiTfItem.questionCount).toBe(5);
    });

    it("should validate 'ai-true-false' type alias", async () => {
      const yamlPath = path.join(testYamlDir, "ai-true-false-alias.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-true-false
        prompt: "Create questions about the solar system"
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      const bookDef = YamlInputParser.parseYamlFile(yamlPath);

      expect(bookDef).toBeDefined();
      if (!("chapters" in bookDef)) throw new Error("Expected BookDefinition");      expect(bookDef.chapters[0].content[0].type).toBe("ai-true-false");
      const aiTfItem = bookDef.chapters[0].content[0] as any;
      expect(aiTfItem.prompt).toBe("Create questions about the solar system");
    });

    it("should reject ai-truefalse without prompt field", async () => {
      const yamlPath = path.join(testYamlDir, "ai-truefalse-no-prompt.yaml");
      const yamlContent = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-truefalse
        questionCount: 5
`;
      await fsExtra.writeFile(yamlPath, yamlContent);

      expect(() => YamlInputParser.parseYamlFile(yamlPath)).toThrow(/must have a 'prompt' field/);
    });
  });
});
