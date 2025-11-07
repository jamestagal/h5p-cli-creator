import { ContentBuilder } from "../../src/compiler/ContentBuilder";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";
import { SemanticValidator } from "../../src/compiler/SemanticValidator";
import { LibraryRegistry } from "../../src/compiler/LibraryRegistry";
import { H5pMultipleChoiceContent } from "../../src/ai/types";
import * as path from "path";

describe("ContentBuilder", () => {
  let registry: LibraryRegistry;
  let validator: SemanticValidator;

  beforeAll(async () => {
    registry = new LibraryRegistry();
    validator = new SemanticValidator();

    // Fetch H5P.InteractiveBook to get its semantics
    await registry.fetchLibrary("H5P.InteractiveBook");
  }, 60000);

  describe("Book Creation", () => {
    test("should create a book with title and language", () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("My Test Book", "en");

      const content = builder.build();

      expect(content.bookCover).toBeDefined();
      expect(content.chapters).toBeDefined();
      expect(content.chapters).toEqual([]);
    });

    test("should support method chaining", () => {
      const builder = new ContentBuilder(registry, validator);
      const result = builder.createBook("My Book", "en");

      expect(result).toBe(builder);
    });
  });

  describe("Chapter Creation", () => {
    test("should add a chapter with text page", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("My Book", "en");

      const chapter = builder.addChapter("Chapter 1");
      chapter.addTextPage("Introduction", "Welcome to chapter 1");

      const content = builder.build();

      expect(content.chapters).toHaveLength(1);
      expect(content.chapters[0].library).toBe("H5P.Column 1.18");
      expect(content.chapters[0].metadata.title).toBe("Chapter 1");
      expect(content.chapters[0].params.content).toHaveLength(1);

      const textContent = content.chapters[0].params.content[0].content;
      expect(textContent.library).toBe("H5P.AdvancedText 1.1");
      expect(textContent.params.text).toContain("Introduction");
      expect(textContent.params.text).toContain("Welcome to chapter 1");
    });

    test("should add a chapter with image page", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("My Book", "en");

      const testImagePath = path.join(__dirname, "../test-image.jpg");
      const chapter = builder.addChapter("Chapter 2");
      await chapter.addImagePage("Test Image", testImagePath, "A test image");

      const content = builder.build();
      const mediaFiles = builder.getMediaFiles();

      expect(content.chapters).toHaveLength(1);
      expect(content.chapters[0].params.content).toHaveLength(1);

      const imageContent = content.chapters[0].params.content[0].content;
      expect(imageContent.library).toBe("H5P.Image 1.1");
      expect(imageContent.params.alt).toBe("A test image");
      expect(mediaFiles.length).toBeGreaterThan(0);
    });

    test("should add a chapter with audio page", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("My Book", "en");

      const testAudioPath = path.join(__dirname, "../test-audio.mp3");
      const chapter = builder.addChapter("Chapter 3");
      await chapter.addAudioPage("Test Audio", testAudioPath);

      const content = builder.build();
      const mediaFiles = builder.getMediaFiles();

      expect(content.chapters).toHaveLength(1);
      expect(content.chapters[0].params.content).toHaveLength(1);

      const audioContent = content.chapters[0].params.content[0].content;
      expect(audioContent.library).toBe("H5P.Audio 1.5");
      expect(mediaFiles.length).toBeGreaterThan(0);
    });

    test("should add a chapter with quiz questions", () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("My Book", "en");

      // Create mock quiz content
      const quizContent: H5pMultipleChoiceContent[] = [
        {
          library: "H5P.MultipleChoice 1.16",
          params: {
            question: "What is photosynthesis?",
            answers: [
              {
                text: "Process plants use to make food",
                correct: true,
                tipsAndFeedback: {
                  tip: "",
                  chosenFeedback: "Correct! Well done."
                }
              },
              {
                text: "Animal respiration",
                correct: false,
                tipsAndFeedback: {
                  tip: "",
                  chosenFeedback: "Incorrect. Try again."
                }
              }
            ],
            behaviour: {
              enableRetry: true,
              enableSolutionsButton: true,
              type: "auto"
            }
          },
          metadata: {
            contentType: "Multiple Choice",
            license: "U",
            title: "Quiz Question 1"
          }
        }
      ];

      const chapter = builder.addChapter("Quiz Chapter");
      chapter.addQuizPage(quizContent);

      const content = builder.build();

      expect(content.chapters).toHaveLength(1);
      expect(content.chapters[0].params.content).toHaveLength(1);

      const quizItem = content.chapters[0].params.content[0].content;
      expect(quizItem.library).toBe("H5P.MultipleChoice 1.16");
      expect(quizItem.params.question).toBe("What is photosynthesis?");
      expect(quizItem.params.answers).toHaveLength(2);
      expect(quizItem.params.answers[0].correct).toBe(true);
    });
  });

  describe("Multi-Chapter Books", () => {
    test("should build book with multiple chapters and mixed content", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Complete Story Book", "en");

      // Chapter 1: Text only
      const chapter1 = builder.addChapter("Introduction");
      chapter1.addTextPage("Welcome", "This is the introduction");

      // Chapter 2: Text and image
      const chapter2 = builder.addChapter("Chapter with Image");
      chapter2.addTextPage("Visual Content", "Here is an image");
      const testImagePath = path.join(__dirname, "../test-image.jpg");
      await chapter2.addImagePage("Illustration", testImagePath, "Chapter illustration");

      // Chapter 3: Audio
      const chapter3 = builder.addChapter("Audio Chapter");
      const testAudioPath = path.join(__dirname, "../test-audio.mp3");
      await chapter3.addAudioPage("Listen Here", testAudioPath);

      const content = builder.build();

      expect(content.chapters).toHaveLength(3);
      expect(content.chapters[0].metadata.title).toBe("Introduction");
      expect(content.chapters[1].metadata.title).toBe("Chapter with Image");
      expect(content.chapters[2].metadata.title).toBe("Audio Chapter");

      // Chapter 1 should have 1 text item
      expect(content.chapters[0].params.content).toHaveLength(1);

      // Chapter 2 should have 2 items (text + image)
      expect(content.chapters[1].params.content).toHaveLength(2);

      // Chapter 3 should have 1 audio item
      expect(content.chapters[2].params.content).toHaveLength(1);
    });
  });

  describe("Nested Content Structure", () => {
    test("should generate correct H5P.Column wrapper structure", () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Test Book", "en");

      const chapter = builder.addChapter("Test Chapter");
      chapter.addTextPage("Title", "Content");

      const content = builder.build();
      const chapterStructure = content.chapters[0];

      expect(chapterStructure).toHaveProperty("library", "H5P.Column 1.18");
      expect(chapterStructure).toHaveProperty("params");
      expect(chapterStructure.params).toHaveProperty("content");
      expect(chapterStructure).toHaveProperty("metadata");
      expect(chapterStructure.metadata).toHaveProperty("contentType", "Column");
      expect(chapterStructure.metadata).toHaveProperty("license", "U");
    });

    test("should format text content with proper HTML", () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Test Book", "en");

      const chapter = builder.addChapter("Test");
      chapter.addTextPage("My Title", "Paragraph 1\n\nParagraph 2");

      const content = builder.build();
      const textParams = content.chapters[0].params.content[0].content.params;

      expect(textParams.text).toContain("<h2>My Title</h2>");
      expect(textParams.text).toContain("<p>Paragraph 1</p>");
      expect(textParams.text).toContain("<p>Paragraph 2</p>");
    });
  });

  describe("Validation", () => {
    test("should validate content structure automatically on build", () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Valid Book", "en");

      const chapter = builder.addChapter("Chapter 1");
      chapter.addTextPage("Title", "Text");

      // Should not throw
      expect(() => builder.build()).not.toThrow();
    });

    test("should provide validation result", () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Test Book", "en");

      const chapter = builder.addChapter("Chapter 1");
      chapter.addTextPage("Title", "Text");

      const result = builder.validate();

      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });

  describe("Media File Tracking", () => {
    test("should track all media files added", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Media Book", "en");

      const testImagePath = path.join(__dirname, "../test-image.jpg");
      const testAudioPath = path.join(__dirname, "../test-audio.mp3");

      const chapter1 = builder.addChapter("Chapter 1");
      await chapter1.addImagePage("Image", testImagePath, "Alt text");

      const chapter2 = builder.addChapter("Chapter 2");
      await chapter2.addAudioPage("Audio", testAudioPath);

      const mediaFiles = builder.getMediaFiles();

      expect(mediaFiles.length).toBe(2);
      expect(mediaFiles.some(f => f.filename.startsWith("images/"))).toBe(true);
      expect(mediaFiles.some(f => f.filename.startsWith("audios/"))).toBe(true);
    });
  });
});
