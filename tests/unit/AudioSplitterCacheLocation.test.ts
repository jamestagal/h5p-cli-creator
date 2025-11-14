/**
 * Unit tests for AudioSplitter cache directory organization
 *
 * Tests cache directory organization feature:
 * - Audio segments created in correct cache location (.youtube-cache/{VIDEO_ID}/audio-segments/)
 * - Segment naming remains sequential (page1.mp3, page2.mp3)
 * - Cache deletion removes audio segments
 *
 * YouTube Extraction Improvements - Task Group 1
 */

import * as path from "path";
import * as fsExtra from "fs-extra";
import { AudioSplitter } from "../../src/services/AudioSplitter";

// Mock child_process to simulate ffmpeg execution
jest.mock("child_process", () => ({
  exec: jest.fn()
}));

const childProcess = require("child_process");
const { promisify } = require("util");

describe("AudioSplitter - Cache Directory Organization", () => {
  const testVideoId = "TEST_VIDEO_ID";
  const testCacheDir = path.join(process.cwd(), ".youtube-cache", testVideoId, "audio-segments");
  const testAudioPath = path.join(process.cwd(), "test-audio.mp3");

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock exec to simulate successful ffmpeg execution AND create output files
    childProcess.exec.mockImplementation((command: string, callback: Function) => {
      // Extract output path from ffmpeg command
      const outputMatch = command.match(/"([^"]+\.mp3)"$/);
      if (outputMatch) {
        const outputPath = outputMatch[1];
        // Create the output file asynchronously
        fsExtra.ensureFile(outputPath)
          .then(() => fsExtra.writeFile(outputPath, "mock audio segment"))
          .then(() => callback(null, { stdout: "", stderr: "" }))
          .catch((err) => callback(err));
      } else {
        callback(null, { stdout: "", stderr: "" });
      }
    });

    // Clean up test directories
    await fsExtra.remove(path.join(process.cwd(), ".youtube-cache", testVideoId));
  });

  afterEach(async () => {
    // Clean up test directories
    await fsExtra.remove(path.join(process.cwd(), ".youtube-cache", testVideoId));
    await fsExtra.remove(testAudioPath);
  });

  describe("Custom cache directory path", () => {
    it("should create audio segments in video-specific cache directory", async () => {
      // Create AudioSplitter with video-specific cache directory
      const splitter = new AudioSplitter(testCacheDir);

      // Create a mock audio file
      await fsExtra.ensureFile(testAudioPath);
      await fsExtra.writeFile(testAudioPath, "mock audio content");

      // Split audio into segments
      const segments = [
        { pageNumber: 1, startTime: 0, endTime: 30 },
        { pageNumber: 2, startTime: 30, endTime: 60 }
      ];

      const result = await splitter.splitAudio(testAudioPath, segments, 60);

      // Verify segments were created in correct directory
      expect(result).toHaveLength(2);
      expect(result[0].filePath).toBe(path.join(testCacheDir, "page1.mp3"));
      expect(result[1].filePath).toBe(path.join(testCacheDir, "page2.mp3"));

      // Verify directory was created
      expect(await fsExtra.pathExists(testCacheDir)).toBe(true);
    });

    it("should maintain sequential naming (page1.mp3, page2.mp3) in cache directory", async () => {
      const splitter = new AudioSplitter(testCacheDir);

      // Create a mock audio file
      await fsExtra.ensureFile(testAudioPath);
      await fsExtra.writeFile(testAudioPath, "mock audio content");

      // Split audio into 5 segments
      const segments = [
        { pageNumber: 1, startTime: 0, endTime: 10 },
        { pageNumber: 2, startTime: 10, endTime: 20 },
        { pageNumber: 3, startTime: 20, endTime: 30 },
        { pageNumber: 4, startTime: 30, endTime: 40 },
        { pageNumber: 5, startTime: 40, endTime: 50 }
      ];

      const result = await splitter.splitAudio(testAudioPath, segments, 50);

      // Verify sequential naming
      expect(result).toHaveLength(5);
      expect(result[0].filePath).toContain("page1.mp3");
      expect(result[1].filePath).toContain("page2.mp3");
      expect(result[2].filePath).toContain("page3.mp3");
      expect(result[3].filePath).toContain("page4.mp3");
      expect(result[4].filePath).toContain("page5.mp3");

      // Verify all paths point to cache directory
      result.forEach(segment => {
        expect(segment.filePath).toContain(testCacheDir);
      });
    });

    it("should return correct output directory path", () => {
      const splitter = new AudioSplitter(testCacheDir);
      expect(splitter.getOutputDirectory()).toBe(testCacheDir);
    });
  });

  describe("Cache deletion", () => {
    it("should remove all audio segments when cache directory is deleted", async () => {
      const splitter = new AudioSplitter(testCacheDir);

      // Create a mock audio file
      await fsExtra.ensureFile(testAudioPath);
      await fsExtra.writeFile(testAudioPath, "mock audio content");

      // Split audio into segments
      const segments = [
        { pageNumber: 1, startTime: 0, endTime: 30 },
        { pageNumber: 2, startTime: 30, endTime: 60 }
      ];

      await splitter.splitAudio(testAudioPath, segments, 60);

      // Verify segments exist
      expect(await fsExtra.pathExists(path.join(testCacheDir, "page1.mp3"))).toBe(true);
      expect(await fsExtra.pathExists(path.join(testCacheDir, "page2.mp3"))).toBe(true);

      // Delete entire cache directory
      const videoCacheDir = path.join(process.cwd(), ".youtube-cache", testVideoId);
      await fsExtra.remove(videoCacheDir);

      // Verify segments are removed
      expect(await fsExtra.pathExists(testCacheDir)).toBe(false);
      expect(await fsExtra.pathExists(path.join(testCacheDir, "page1.mp3"))).toBe(false);
      expect(await fsExtra.pathExists(path.join(testCacheDir, "page2.mp3"))).toBe(false);
    });
  });

  describe("Backward compatibility", () => {
    it("should use default directory when no path provided", () => {
      const splitter = new AudioSplitter();
      const expectedDefault = path.join(process.cwd(), "audio-segments");
      expect(splitter.getOutputDirectory()).toBe(expectedDefault);
    });

    it("should accept absolute paths", () => {
      const absolutePath = "/tmp/test-audio-segments";
      const splitter = new AudioSplitter(absolutePath);
      expect(splitter.getOutputDirectory()).toBe(absolutePath);
    });
  });
});
