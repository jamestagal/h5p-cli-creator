import { YamlInputParser } from "../../src/compiler/YamlInputParser";

describe("YamlInputParser - Essay Type System Integration", () => {
  describe("ContentType union - Essay types", () => {
    it("should accept 'essay' type in YAML", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: essay
        title: "Test Essay"
        taskDescription: "Write about the water cycle"
        keywords:
          - keyword: "evaporation"
          - keyword: "condensation"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });

    it("should accept 'ai-essay' type in YAML", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-essay
        title: "Test AI Essay"
        prompt: "Create an essay question about photosynthesis"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });
  });

  describe("Type guards - Essay validation", () => {
    it("should validate essay requires taskDescription field", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: essay
        taskDescription: "Write about the water cycle"
        keywords:
          - keyword: "evaporation"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });

    it("should throw error when essay is missing taskDescription field", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: essay
        title: "Test Essay"
        keywords:
          - keyword: "test"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).toThrow(/must have a 'taskDescription' field/);
    });

    it("should validate essay requires keywords array with minimum 1 keyword", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: essay
        taskDescription: "Write an essay"
        keywords:
          - keyword: "test"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });

    it("should throw error when essay is missing keywords array", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: essay
        taskDescription: "Write an essay"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).toThrow(/must have a 'keywords' array/);
    });

    it("should validate ai-essay requires prompt field", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-essay
        prompt: "Create an essay question about climate change"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });

    it("should throw error when ai-essay is missing prompt field", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-essay
        title: "Test AI Essay"
        keywordCount: 5
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).toThrow(/must have a 'prompt' field/);
    });
  });

  describe("AnyContentItem union - Essay interfaces", () => {
    it("should parse essay content with full type information", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: essay
        title: "The Hobbit Summary"
        taskDescription: "Describe the novel The Hobbit"
        placeholderText: "In a hole in the ground..."
        keywords:
          - keyword: "Bilbo"
            points: 10
            occurrences: 3
            feedbackMissed: "Mention the main character"
          - keyword: "adventure"
            alternatives: ["quest", "journey"]
            points: 5
        behaviour:
          minimumLength: 100
          maximumLength: 500
`;

      const result = YamlInputParser.parseYamlString(yaml);
      const essayItem: any = result.chapters[0].content[0];

      expect(essayItem.type).toBe("essay");
      expect(essayItem.title).toBe("The Hobbit Summary");
      expect(essayItem.taskDescription).toBe("Describe the novel The Hobbit");
      expect(essayItem.placeholderText).toBe("In a hole in the ground...");
      expect(essayItem.keywords).toHaveLength(2);
      expect(essayItem.keywords[0].keyword).toBe("Bilbo");
      expect(essayItem.keywords[0].points).toBe(10);
      expect(essayItem.keywords[0].occurrences).toBe(3);
      expect(essayItem.keywords[1].alternatives).toEqual(["quest", "journey"]);
      expect(essayItem.behaviour.minimumLength).toBe(100);
      expect(essayItem.behaviour.maximumLength).toBe(500);
    });

    it("should parse ai-essay content with full type information", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-essay
        title: "Photosynthesis Essay"
        prompt: "Create an essay question about photosynthesis"
        keywordCount: 7
        includeAlternatives: true
        includeSampleSolution: true
        difficulty: "medium"
        minimumLength: 150
        maximumLength: 600
        aiConfig:
          targetAudience: "high-school"
          tone: "educational"
`;

      const result = YamlInputParser.parseYamlString(yaml);
      const aiEssayItem: any = result.chapters[0].content[0];

      expect(aiEssayItem.type).toBe("ai-essay");
      expect(aiEssayItem.title).toBe("Photosynthesis Essay");
      expect(aiEssayItem.prompt).toBe("Create an essay question about photosynthesis");
      expect(aiEssayItem.keywordCount).toBe(7);
      expect(aiEssayItem.includeAlternatives).toBe(true);
      expect(aiEssayItem.includeSampleSolution).toBe(true);
      expect(aiEssayItem.difficulty).toBe("medium");
      expect(aiEssayItem.minimumLength).toBe(150);
      expect(aiEssayItem.maximumLength).toBe(600);
      expect(aiEssayItem.aiConfig.targetAudience).toBe("high-school");
      expect(aiEssayItem.aiConfig.tone).toBe("educational");
    });
  });
});
