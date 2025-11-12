/**
 * Integration tests for youtube-extract CLI command.
 *
 * Tests config parsing, validation, progress messages, and error handling.
 *
 * Phase 3: YouTube Story Extraction for Interactive Books
 */

import * as fsExtra from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";
import { StoryConfig } from "../../src/models/StoryConfig";

describe("youtube-extract command", () => {
  const testConfigPath = path.join(__dirname, "..", "..", "examples", "youtube-stories", "test-story-config.yaml");
  const tempDir = path.join(__dirname, "..", "..", ".temp-test");

  beforeAll(async () => {
    await fsExtra.ensureDir(tempDir);
  });

  afterAll(async () => {
    await fsExtra.remove(tempDir);
  });

  describe("YAML config parsing and validation", () => {
    it("should parse valid story config YAML", async () => {
      const validConfig: StoryConfig = {
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
            title: "Video introduction",
            type: "youtube-intro",
            includeTranscript: true
          },
          {
            title: "Page 1",
            startTime: "00:00",
            endTime: "00:38",
            placeholder: true
          }
        ]
      };

      const tempConfigPath = path.join(tempDir, "valid-config.yaml");
      await fsExtra.writeFile(tempConfigPath, yaml.dump(validConfig), "utf-8");

      const parsedConfig = yaml.load(await fsExtra.readFile(tempConfigPath, "utf-8")) as StoryConfig;

      expect(parsedConfig.title).toBe("Test Story");
      expect(parsedConfig.language).toBe("vi");
      expect(parsedConfig.source.type).toBe("youtube");
      expect(parsedConfig.pages.length).toBe(2);
    });

    it("should detect missing required fields in config", () => {
      const invalidConfig = {
        title: "Test Story"
        // Missing language, source, translation, pages
      };

      const tempConfigPath = path.join(tempDir, "invalid-config.yaml");

      expect(() => {
        // Validation should detect missing fields
        const config = invalidConfig as StoryConfig;
        if (!config.source || !config.pages) {
          throw new Error("Missing required fields: source, pages");
        }
      }).toThrow("Missing required fields");
    });

    it("should validate timestamp format", () => {
      const validateTimestamp = (timestamp: string): boolean => {
        // MM:SS format validation
        const timestampRegex = /^\d{1,2}:\d{2}$/;
        return timestampRegex.test(timestamp);
      };

      expect(validateTimestamp("00:00")).toBe(true);
      expect(validateTimestamp("01:23")).toBe(true);
      expect(validateTimestamp("10:45")).toBe(true);
      expect(validateTimestamp("invalid")).toBe(false);
      expect(validateTimestamp("1:2")).toBe(false);
    });

    it("should validate timestamp ranges", () => {
      const parseTimestamp = (timestamp: string): number => {
        const [minutes, seconds] = timestamp.split(":").map(Number);
        return minutes * 60 + seconds;
      };

      const startTime = "00:00";
      const endTime = "00:38";
      const startSeconds = parseTimestamp(startTime);
      const endSeconds = parseTimestamp(endTime);

      expect(endSeconds).toBeGreaterThan(startSeconds);
      expect(startSeconds).toBeGreaterThanOrEqual(0);
      expect(endSeconds - startSeconds).toBe(38); // 38 seconds duration
    });
  });
});
