import { LibraryRegistry } from "../../src/compiler/LibraryRegistry";
import { SemanticValidator } from "../../src/compiler/SemanticValidator";

describe("SemanticValidator", () => {
  let registry: LibraryRegistry;
  let validator: SemanticValidator;

  beforeEach(() => {
    registry = new LibraryRegistry();
    validator = new SemanticValidator();
  });

  describe("parseSemantics", () => {
    it("should parse H5P.Flashcards semantics.json into schema", async () => {
      const metadata = await registry.fetchLibrary("H5P.Flashcards");
      const schema = validator.parseSemantics(metadata.semantics);

      expect(schema).toBeDefined();
      expect(schema.fields).toBeDefined();
      expect(schema.fields.length).toBeGreaterThan(0);

      const cardsField = schema.fields.find(f => f.name === "cards");
      expect(cardsField).toBeDefined();
      expect(cardsField.type).toBe("list");
      expect(cardsField.field).toBeDefined();
      expect(cardsField.field.type).toBe("group");
    }, 30000);

    it("should parse nested group structures correctly", async () => {
      const metadata = await registry.fetchLibrary("H5P.Flashcards");
      const schema = validator.parseSemantics(metadata.semantics);

      const cardsField = schema.fields.find(f => f.name === "cards");
      const cardGroup = cardsField.field;

      expect(cardGroup.fields).toBeDefined();
      expect(Array.isArray(cardGroup.fields)).toBe(true);

      const textField = cardGroup.fields.find(f => f.name === "text");
      expect(textField).toBeDefined();
      expect(textField.type).toBe("text");

      const imageField = cardGroup.fields.find(f => f.name === "image");
      expect(imageField).toBeDefined();
      expect(imageField.type).toBe("image");
    }, 30000);

    it("should parse library references from H5P.InteractiveBook", async () => {
      const metadata = await registry.fetchLibrary("H5P.InteractiveBook");
      const schema = validator.parseSemantics(metadata.semantics);

      const chaptersField = schema.fields.find(f => f.name === "chapters");
      expect(chaptersField).toBeDefined();
      expect(chaptersField.type).toBe("list");

      const chapterField = chaptersField.field.fields.find(f => f.name === "chapter");
      expect(chapterField).toBeDefined();
      expect(chapterField.type).toBe("library");
      expect(chapterField.options).toBeDefined();
      expect(chapterField.options).toContain("H5P.Column 1.18");
    }, 30000);
  });

  describe("validate", () => {
    it("should validate content with required fields present", async () => {
      const metadata = await registry.fetchLibrary("H5P.Flashcards");
      const schema = validator.parseSemantics(metadata.semantics);

      const validContent = {
        description: "Task description",
        cards: [
          {
            text: "What is 2+2?",
            answer: "4"
          }
        ]
      };

      const result = validator.validate(validContent, schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }, 30000);

    it("should detect missing required fields", async () => {
      const metadata = await registry.fetchLibrary("H5P.Flashcards");
      const schema = validator.parseSemantics(metadata.semantics);

      const invalidContent = {
        description: "Task description"
        // Missing required "cards" field
      };

      const result = validator.validate(invalidContent, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("cards");
    }, 30000);

    it("should detect field type mismatches", async () => {
      const metadata = await registry.fetchLibrary("H5P.Flashcards");
      const schema = validator.parseSemantics(metadata.semantics);

      const invalidContent = {
        description: "Task description",
        cards: "not-an-array" // Should be an array
      };

      const result = validator.validate(invalidContent, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].fieldPath).toContain("cards");
    }, 30000);

    it("should provide detailed error messages with field paths", async () => {
      const metadata = await registry.fetchLibrary("H5P.InteractiveBook");
      const schema = validator.parseSemantics(metadata.semantics);

      const invalidContent = {
        chapters: [
          {
            item: {
              chapter: 123 // Should be a library object
            }
          }
        ]
      };

      const result = validator.validate(invalidContent, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].fieldPath).toBeDefined();
      expect(result.errors[0].message).toBeDefined();
    }, 30000);
  });

  describe("getFieldDefinition", () => {
    it("should retrieve field definition by path", async () => {
      const metadata = await registry.fetchLibrary("H5P.Flashcards");
      const schema = validator.parseSemantics(metadata.semantics);

      const fieldDef = validator.getFieldDefinition("cards", schema);

      expect(fieldDef).toBeDefined();
      expect(fieldDef.name).toBe("cards");
      expect(fieldDef.type).toBe("list");
    }, 30000);

    it("should retrieve nested field definitions from list item groups", async () => {
      const metadata = await registry.fetchLibrary("H5P.Flashcards");
      const schema = validator.parseSemantics(metadata.semantics);

      const fieldDef = validator.getFieldDefinition("cards.text", schema);

      expect(fieldDef).toBeDefined();
      expect(fieldDef.name).toBe("text");
      expect(fieldDef.type).toBe("text");
    }, 30000);
  });
});
