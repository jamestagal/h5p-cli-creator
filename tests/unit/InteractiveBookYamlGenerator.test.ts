/**
 * Unit tests for InteractiveBookYamlGenerator service.
 *
 * Tests cover:
 * - Page 0 generation (YouTube embed + accordion with transcript)
 * - Story page generation (image + audio + bilingual text)
 * - Collapsible translation HTML formatting
 * - YAML structure validation
 *
 * Phase 2: YouTube Story Extraction for Interactive Books
 */

import { InteractiveBookYamlGenerator } from "../../src/services/InteractiveBookYamlGenerator";
import { StoryPageData } from "../../src/models/StoryPageData";
import { StoryConfig } from "../../src/models/StoryConfig";
import * as fsExtra from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";

describe("InteractiveBookYamlGenerator", () => {
  let generator: InteractiveBookYamlGenerator;
  const testOutputDir = path.join(process.cwd(), "test-output");

  beforeEach(() => {
    generator = new InteractiveBookYamlGenerator();
  });

  afterEach(async () => {
    // Clean up test output directory
    if (await fsExtra.pathExists(testOutputDir)) {
      await fsExtra.remove(testOutputDir);
    }
  });

  describe("generateIntroPage", () => {
    it("should generate YouTube embed page with responsive iframe", () => {
      const videoUrl = "https://www.youtube.com/watch?v=Y8M9RJ_4C7E";
      const fullTranscript = "Xin chào. Đây là câu chuyện của tôi.";

      const introPage = generator.generateIntroPage(videoUrl, fullTranscript);

      // Check structure
      expect(introPage).toHaveProperty("title");
      expect(introPage).toHaveProperty("content");
      expect(Array.isArray(introPage.content)).toBe(true);

      // Check YouTube embed
      const videoContent = introPage.content.find((item: any) => item.type === "text");
      expect(videoContent).toBeDefined();
      expect(videoContent.text).toContain("iframe");
      expect(videoContent.text).toContain("Y8M9RJ_4C7E");

      // Check accordion with transcript
      const accordionContent = introPage.content.find((item: any) => item.type === "accordion");
      expect(accordionContent).toBeDefined();
      expect(accordionContent.panels).toBeDefined();
      expect(accordionContent.panels[0].content).toContain(fullTranscript);
    });
  });

  describe("generateStoryPage", () => {
    it("should generate story page with image, audio, and bilingual text", () => {
      const pageData: StoryPageData = {
        pageNumber: 1,
        title: "Page 1",
        startTime: 0,
        endTime: 30,
        vietnameseText: "Con mèo đi chơi trong vườn.",
        englishTranslation: "The cat went to play in the garden.",
        audioPath: "../audio-segments/page1.mp3",
        imagePath: "../assets/placeholder-image.png",
        isPlaceholder: true,
        transcriptSegments: []
      };

      const storyPage = generator.generateStoryPage(pageData);

      // Check structure
      expect(storyPage).toHaveProperty("title", "Page 1");
      expect(storyPage).toHaveProperty("content");
      expect(Array.isArray(storyPage.content)).toBe(true);
      expect(storyPage.content).toHaveLength(3); // image, audio, text

      // Check image content
      const imageContent = storyPage.content.find((item: any) => item.type === "image");
      expect(imageContent).toBeDefined();
      expect(imageContent.path).toBe("../assets/placeholder-image.png");

      // Check audio content
      const audioContent = storyPage.content.find((item: any) => item.type === "audio");
      expect(audioContent).toBeDefined();
      expect(audioContent.path).toBe("../audio-segments/page1.mp3");

      // Check text content with collapsible translation
      const textContent = storyPage.content.find((item: any) => item.type === "text");
      expect(textContent).toBeDefined();
      expect(textContent.text).toContain("Con mèo đi chơi trong vườn.");
      expect(textContent.text).toContain("The cat went to play in the garden.");
      expect(textContent.text).toContain("<details>");
      expect(textContent.text).toContain("<summary>");
    });
  });

  describe("formatCollapsibleTranslation", () => {
    it("should format Vietnamese text with collapsible English translation", () => {
      const vietnamese = "Tôi yêu học tiếng Việt.";
      const english = "I love learning Vietnamese.";

      const formatted = generator.formatCollapsibleTranslation(vietnamese, english);

      // Check Vietnamese text is visible
      expect(formatted).toContain(vietnamese);

      // Check HTML details element structure
      expect(formatted).toContain("<details>");
      expect(formatted).toContain("<summary><strong>English</strong></summary>");
      expect(formatted).toContain("<p><em>" + english + "</em></p>");
      expect(formatted).toContain("</details>");
    });
  });

  describe("generateYaml", () => {
    it("should generate valid Interactive Book YAML structure", async () => {
      const config: StoryConfig = {
        title: "Test Story",
        language: "vi",
        source: {
          type: "youtube",
          url: "https://www.youtube.com/watch?v=Y8M9RJ_4C7E"
        },
        translation: {
          enabled: true,
          targetLanguage: "en",
          style: "collapsible"
        },
        pages: [
          {
            title: "Video Introduction",
            type: "youtube-intro",
            includeTranscript: true
          },
          {
            title: "Page 1",
            startTime: "00:00",
            endTime: "00:30",
            placeholder: true
          }
        ]
      };

      const pages: StoryPageData[] = [
        {
          pageNumber: 1,
          title: "Page 1",
          startTime: 0,
          endTime: 30,
          vietnameseText: "Văn bản tiếng Việt.",
          englishTranslation: "Vietnamese text.",
          audioPath: "../audio-segments/page1.mp3",
          imagePath: "../assets/placeholder-image.png",
          isPlaceholder: true,
          transcriptSegments: []
        }
      ];

      const fullTranscript = "Văn bản tiếng Việt.";
      const outputPath = path.join(testOutputDir, "test-story.yaml");

      await generator.generateYaml(config, pages, fullTranscript, outputPath);

      // Verify file was created
      expect(await fsExtra.pathExists(outputPath)).toBe(true);

      // Parse and validate YAML structure
      const yamlContent = await fsExtra.readFile(outputPath, "utf-8");
      const parsed: any = yaml.load(yamlContent);

      expect(parsed).toHaveProperty("title", "Test Story");
      expect(parsed).toHaveProperty("language", "vi");
      expect(parsed).toHaveProperty("chapters");
      expect(Array.isArray(parsed.chapters)).toBe(true);
      expect(parsed.chapters).toHaveLength(2); // Intro page + 1 story page

      // Validate intro page structure
      const introChapter = parsed.chapters[0];
      expect(introChapter.content).toBeDefined();
      expect(Array.isArray(introChapter.content)).toBe(true);

      // Validate story page structure
      const storyChapter = parsed.chapters[1];
      expect(storyChapter.title).toBe("Page 1");
      expect(storyChapter.content).toBeDefined();
      expect(Array.isArray(storyChapter.content)).toBe(true);
      expect(storyChapter.content.length).toBe(3); // image, audio, text
    });
  });
});
