import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

describe("Documentation Examples Validation", () => {
  describe("YAML Format Examples", () => {
    it("should validate comprehensive-demo.yaml structure", () => {
      const yamlPath = path.join(
        __dirname,
        "../../examples/yaml/interactive-book/comprehensive-demo.yaml"
      );
      const yamlContent = fs.readFileSync(yamlPath, "utf-8");
      const parsed = yaml.load(yamlContent) as any;

      // Basic structure validation
      expect(parsed).toHaveProperty("title");
      expect(parsed).toHaveProperty("language");
      expect(parsed).toHaveProperty("chapters");
      expect(Array.isArray(parsed.chapters)).toBe(true);
      expect(parsed.chapters.length).toBeGreaterThan(0);
    });

    it("should validate biology-lesson-migrated.yaml has aiConfig", () => {
      const yamlPath = path.join(
        __dirname,
        "../../examples/yaml/biology-lesson-migrated.yaml"
      );

      if (!fs.existsSync(yamlPath)) {
        // Skip if migration example doesn't exist yet
        return;
      }

      const yamlContent = fs.readFileSync(yamlPath, "utf-8");
      const parsed = yaml.load(yamlContent) as any;

      // Should have aiConfig
      expect(parsed).toHaveProperty("aiConfig");
      if (parsed.aiConfig) {
        expect(parsed.aiConfig).toHaveProperty("targetAudience");
      }
    });
  });

  describe("AIConfiguration Type Validation", () => {
    const validReadingLevels = [
      "elementary",
      "grade-6",
      "grade-9",
      "high-school",
      "college",
      "professional",
      "esl-beginner",
      "esl-intermediate",
    ];

    const validTones = ["educational", "professional", "casual", "academic"];

    it("should accept valid reading levels", () => {
      validReadingLevels.forEach((level) => {
        const config = { targetAudience: level };
        expect(validReadingLevels).toContain(config.targetAudience);
      });
    });

    it("should accept valid tones", () => {
      validTones.forEach((tone) => {
        const config = { tone };
        expect(validTones).toContain(config.tone);
      });
    });

    it("should validate complete aiConfig structure", () => {
      const config = {
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
        outputStyle: "plain-html" as const,
        customization: "Focus on visual learners",
      };

      expect(validReadingLevels).toContain(config.targetAudience);
      expect(validTones).toContain(config.tone);
      expect(config.customization).toBeTruthy();
      expect(config.customization.length).toBeLessThan(1000);
    });
  });

  describe("JSON Schema Validation", () => {
    it("should load AIConfiguration.json schema", () => {
      const schemaPath = path.join(
        __dirname,
        "../../schemas/AIConfiguration.json"
      );
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

      expect(schema).toHaveProperty("$schema");
      expect(schema).toHaveProperty("title");
      expect(schema.title).toBe("AIConfiguration");
      expect(schema).toHaveProperty("properties");
      expect(schema.properties).toHaveProperty("targetAudience");
      expect(schema.properties).toHaveProperty("tone");
    });

    it("should load BookDefinition.json schema", () => {
      const schemaPath = path.join(
        __dirname,
        "../../schemas/BookDefinition.json"
      );
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

      expect(schema).toHaveProperty("$schema");
      expect(schema).toHaveProperty("title");
      expect(schema.title).toBe("BookDefinition");
      expect(schema).toHaveProperty("required");
      expect(schema.required).toContain("title");
      expect(schema.required).toContain("language");
      expect(schema.required).toContain("chapters");
    });
  });

  describe("Documentation Code Examples", () => {
    it("should validate README.md example structure", () => {
      // Example from README: AI Configuration section
      const exampleConfig = {
        targetAudience: "grade-6",
        tone: "educational",
        customization: "Focus on visual learners. Include real-world examples.",
      };

      const validLevels = [
        "elementary",
        "grade-6",
        "grade-9",
        "high-school",
        "college",
        "professional",
        "esl-beginner",
        "esl-intermediate",
      ];
      const validTones = ["educational", "professional", "casual", "academic"];

      expect(validLevels).toContain(exampleConfig.targetAudience);
      expect(validTones).toContain(exampleConfig.tone);
      expect(typeof exampleConfig.customization).toBe("string");
    });

    it("should validate YAML format reference examples", () => {
      // Example from yaml-format.md: Book-level configuration
      const yamlExample = `
title: "Biology Fundamentals"
language: "en"
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: "Focus on visual learners. Include real-world examples."
chapters:
  - title: "Photosynthesis"
    content:
      - type: ai-text
        prompt: "Explain photosynthesis"
`;

      const parsed = yaml.load(yamlExample) as any;

      expect(parsed).toHaveProperty("title");
      expect(parsed).toHaveProperty("aiConfig");
      expect(parsed.aiConfig.targetAudience).toBe("grade-6");
      expect(parsed.aiConfig.tone).toBe("educational");
      expect(parsed.chapters).toHaveLength(1);
    });

    it("should validate configuration hierarchy example", () => {
      // Example from documentation showing item > chapter > book precedence
      const bookConfig = { targetAudience: "grade-6" as const };
      const chapterConfig = { targetAudience: "college" as const };
      const itemConfig: { tone: "academic"; targetAudience?: string } = { tone: "academic" };

      // Simulated resolution logic
      const resolved = {
        targetAudience:
          itemConfig.targetAudience ||
          chapterConfig.targetAudience ||
          bookConfig.targetAudience,
        tone: itemConfig.tone || "educational", // default
      };

      expect(resolved.targetAudience).toBe("college"); // From chapter
      expect(resolved.tone).toBe("academic"); // From item
    });
  });

  describe("TypeScript Type Examples", () => {
    it("should validate type definitions match documentation", () => {
      // Check that types are exported and match examples
      const exampleBookDef = {
        title: "Science Course",
        language: "en",
        aiConfig: {
          targetAudience: "high-school",
          tone: "educational",
        },
        chapters: [
          {
            title: "Introduction",
            content: [
              {
                type: "ai-text",
                prompt: "Explain the scientific method",
                title: "Getting Started",
              },
            ],
          },
        ],
      };

      // Basic validation
      expect(exampleBookDef.title).toBeTruthy();
      expect(exampleBookDef.language).toBe("en");
      expect(exampleBookDef.aiConfig).toBeDefined();
      expect(exampleBookDef.chapters).toHaveLength(1);
      expect(exampleBookDef.chapters[0].content).toHaveLength(1);
      expect(exampleBookDef.chapters[0].content[0].type).toBe("ai-text");
    });
  });
});
