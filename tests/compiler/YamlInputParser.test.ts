import { YamlInputParser } from "../../src/compiler/YamlInputParser";
import * as path from "path";

describe("YamlInputParser - Blanks Type System Integration", () => {
  describe("ContentType union - Blanks type aliases", () => {
    it("should accept 'blanks' type in YAML", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: blanks
        title: "Test Blanks"
        sentences:
          - text: "The sky is {blank}."
            blanks:
              - answer: "blue"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });

    it("should accept 'fill-in-the-blanks' type alias in YAML", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: fill-in-the-blanks
        title: "Test Blanks"
        questions:
          - "The sky is *blue*."
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });

    it("should accept 'ai-blanks' type in YAML", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-blanks
        title: "Test AI Blanks"
        prompt: "Create fill-in-the-blank sentences about the solar system"
        sentenceCount: 5
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });

    it("should accept 'ai-fill-in-the-blanks' type alias in YAML", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-fill-in-the-blanks
        title: "Test AI Blanks"
        prompt: "Create fill-in-the-blank sentences about planets"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });
  });

  describe("Type guards - Blanks validation", () => {
    it("should validate blanks with sentences format", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: blanks
        sentences:
          - text: "The sky is {blank}."
            blanks:
              - answer: "blue"
`;

      const result = YamlInputParser.parseYamlString(yaml);
      expect(result.chapters[0].content[0]).toHaveProperty("sentences");
      expect(result.chapters[0].content[0]).not.toHaveProperty("questions");
    });

    it("should validate blanks with questions format", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: blanks
        questions:
          - "The sky is *blue*."
`;

      const result = YamlInputParser.parseYamlString(yaml);
      expect(result.chapters[0].content[0]).toHaveProperty("questions");
      expect(result.chapters[0].content[0]).not.toHaveProperty("sentences");
    });

    it("should throw error when blanks has neither sentences nor questions", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: blanks
        title: "Test Blanks"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).toThrow(/must have either 'sentences' or 'questions'/);
    });

    it("should throw error when blanks has both sentences and questions", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: blanks
        sentences:
          - text: "Test {blank}"
            blanks:
              - answer: "word"
        questions:
          - "Test *word*"
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).toThrow(/cannot have both 'sentences' and 'questions'/);
    });

    it("should validate ai-blanks requires prompt field", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-blanks
        prompt: "Create fill-in-the-blank sentences"
        sentenceCount: 5
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).not.toThrow();
    });

    it("should throw error when ai-blanks is missing prompt field", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-blanks
        title: "Test AI Blanks"
        sentenceCount: 5
`;

      expect(() => {
        YamlInputParser.parseYamlString(yaml);
      }).toThrow(/must have a 'prompt' field/);
    });
  });

  describe("AnyContentItem union - Blanks interfaces", () => {
    it("should parse blanks content with full type information", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: blanks
        title: "Norwegian Berries"
        taskDescription: "Fill in the missing words"
        sentences:
          - text: "Blueberries are {blank} colored berries."
            blanks:
              - answer: "blue"
                tip: "Think about the name"
          - text: "{blank} are orange berries."
            blanks:
              - answer: ["Cloudberries", "Cloud berries"]
        behaviour:
          caseSensitive: false
          acceptSpellingErrors: true
`;

      const result = YamlInputParser.parseYamlString(yaml);
      const blanksItem: any = result.chapters[0].content[0];

      expect(blanksItem.type).toBe("blanks");
      expect(blanksItem.title).toBe("Norwegian Berries");
      expect(blanksItem.taskDescription).toBe("Fill in the missing words");
      expect(blanksItem.sentences).toHaveLength(2);
      expect(blanksItem.sentences[0].blanks[0].answer).toBe("blue");
      expect(blanksItem.sentences[0].blanks[0].tip).toBe("Think about the name");
      expect(blanksItem.sentences[1].blanks[0].answer).toEqual(["Cloudberries", "Cloud berries"]);
      expect(blanksItem.behaviour.caseSensitive).toBe(false);
      expect(blanksItem.behaviour.acceptSpellingErrors).toBe(true);
    });

    it("should parse ai-blanks content with full type information", () => {
      const yaml = `
title: "Test Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-blanks
        title: "Solar System Quiz"
        prompt: "Create fill-in-the-blank sentences about planets"
        sentenceCount: 8
        blanksPerSentence: 2
        difficulty: "medium"
        aiConfig:
          targetAudience: "grade-6"
          tone: "educational"
`;

      const result = YamlInputParser.parseYamlString(yaml);
      const aiBlanksItem: any = result.chapters[0].content[0];

      expect(aiBlanksItem.type).toBe("ai-blanks");
      expect(aiBlanksItem.title).toBe("Solar System Quiz");
      expect(aiBlanksItem.prompt).toBe("Create fill-in-the-blank sentences about planets");
      expect(aiBlanksItem.sentenceCount).toBe(8);
      expect(aiBlanksItem.blanksPerSentence).toBe(2);
      expect(aiBlanksItem.difficulty).toBe("medium");
      expect(aiBlanksItem.aiConfig.targetAudience).toBe("grade-6");
      expect(aiBlanksItem.aiConfig.tone).toBe("educational");
    });
  });
});
