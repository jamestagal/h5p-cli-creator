/**
 * InteractiveBookYamlGenerator generates Interactive Book YAML from extracted story data.
 *
 * Responsibilities:
 * - Generate YouTube intro page (video embed + transcript accordion)
 * - Generate story pages (image + audio + bilingual text)
 * - Format collapsible translations using HTML details element
 * - Write well-formatted YAML to disk
 *
 * Phase 2: YouTube Story Extraction for Interactive Books
 */

import * as fsExtra from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";
import { StoryPageData } from "../models/StoryPageData";
import { StoryConfig } from "../models/StoryConfig";

/**
 * YAML chapter structure for Interactive Book
 */
interface YamlChapter {
  title: string;
  content: YamlContentItem[];
}

/**
 * YAML content item (can be text, image, audio, video, accordion, etc.)
 */
interface YamlContentItem {
  type: string;
  text?: string;
  path?: string;
  url?: string;
  title?: string;
  panels?: AccordionPanel[];
}

/**
 * Accordion panel structure
 */
interface AccordionPanel {
  title: string;
  content: string;
}

/**
 * InteractiveBookYamlGenerator generates Interactive Book YAML files.
 *
 * Features:
 * - YouTube embed page with responsive iframe
 * - Story pages with image, audio, and bilingual text
 * - Collapsible English translations using HTML details element
 * - Proper YAML formatting with multi-line text blocks
 */
export class InteractiveBookYamlGenerator {
  /**
   * Generates complete Interactive Book YAML from story data.
   *
   * Structure:
   * - Page 0: YouTube embed + transcript accordion
   * - Pages 1-N: Story pages with image, audio, and bilingual text
   *
   * @param config Story configuration from user YAML
   * @param pages Array of story page data with translations
   * @param fullTranscript Complete video transcript for accordion
   * @param outputPath Output file path for generated YAML
   */
  public async generateYaml(
    config: StoryConfig,
    pages: StoryPageData[],
    fullTranscript: string,
    outputPath: string
  ): Promise<void> {
    const chapters: YamlChapter[] = [];

    // Generate intro page (page 0)
    const introPage = this.generateIntroPage(config.source.url, fullTranscript);
    chapters.push(introPage);

    // Generate story pages (pages 1-N)
    for (const page of pages) {
      const storyPage = this.generateStoryPage(page);
      chapters.push(storyPage);
    }

    // Build complete YAML structure
    const yamlData = {
      title: config.title,
      language: config.language,
      chapters
    };

    // Write YAML to file
    await this.writeYamlFile(yamlData, outputPath);
  }

  /**
   * Generates YouTube intro page (page 0).
   *
   * Includes:
   * - H5P.Video YouTube embed (proper H5P.Video library, not iframe HTML)
   * - H5P.Accordion with full transcript
   *
   * @param videoUrl YouTube video URL
   * @param fullTranscript Complete video transcript
   * @returns YAML chapter for intro page
   */
  public generateIntroPage(videoUrl: string, fullTranscript: string): YamlChapter {
    return {
      title: "Video Introduction",
      content: [
        {
          type: "video",
          url: videoUrl,
          title: "Video Introduction"
        },
        {
          type: "accordion",
          panels: [
            {
              title: "Video Transcript",
              content: fullTranscript
            }
          ]
        }
      ]
    };
  }

  /**
   * Generates a story page with image, audio, and bilingual text.
   *
   * Content order:
   * 1. Image (placeholder or custom)
   * 2. Audio segment
   * 3. Text (Vietnamese + collapsible English)
   *
   * @param pageData Story page data with translations
   * @returns YAML chapter for story page
   */
  public generateStoryPage(pageData: StoryPageData): YamlChapter {
    const content: YamlContentItem[] = [];

    // Add image with alt text
    content.push({
      type: "image",
      path: pageData.imagePath,
      alt: pageData.isPlaceholder ? "Story illustration" : pageData.title
    } as any);

    // Add audio
    content.push({
      type: "audio",
      path: pageData.audioPath
    });

    // Add Vietnamese text (plain text, no HTML)
    content.push({
      type: "text",
      text: pageData.vietnameseText
    });

    // Add English translation as accordion (if available)
    if (pageData.englishTranslation && pageData.englishTranslation !== pageData.vietnameseText) {
      content.push({
        type: "accordion",
        panels: [
          {
            title: "English Translation",
            content: pageData.englishTranslation
          }
        ]
      } as any);
    }

    return {
      title: pageData.title,
      content
    };
  }

  /**
   * Formats Vietnamese text with collapsible English translation.
   *
   * Uses HTML details element for collapsible functionality:
   * - Vietnamese text visible by default
   * - English translation hidden in collapsible section
   * - Summary shows "English" as clickable label
   *
   * @param vietnamese Vietnamese text
   * @param english English translation
   * @returns HTML string with collapsible translation
   */
  public formatCollapsibleTranslation(vietnamese: string, english: string): string {
    return `<p>${vietnamese}</p>

<details>
  <summary><strong>English</strong></summary>
  <p><em>${english}</em></p>
</details>`;
  }

  /**
   * Writes YAML data to file with proper formatting.
   *
   * Features:
   * - 2-space indentation
   * - Multi-line text blocks preserved with pipe (|) syntax
   * - UTF-8 encoding for Vietnamese diacritics
   *
   * @param data YAML data structure
   * @param outputPath Output file path
   */
  public async writeYamlFile(data: any, outputPath: string): Promise<void> {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fsExtra.ensureDir(outputDir);

    // Generate YAML with proper formatting
    const yamlString = yaml.dump(data, {
      indent: 2,
      lineWidth: -1, // No line wrapping
      noRefs: true, // Avoid references
      sortKeys: false // Maintain key order
    });

    // Write to file with UTF-8 encoding
    await fsExtra.writeFile(outputPath, yamlString, { encoding: "utf-8" });
  }

  /**
   * Extracts video ID from YouTube URL.
   *
   * Supports multiple URL formats:
   * - https://www.youtube.com/watch?v=VIDEO_ID
   * - https://youtu.be/VIDEO_ID
   * - https://www.youtube.com/embed/VIDEO_ID
   *
   * @param url YouTube video URL
   * @returns 11-character video ID
   */
  private extractVideoId(url: string): string {
    // Pattern 1: watch?v=VIDEO_ID
    const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) {
      return watchMatch[1];
    }

    // Pattern 2: youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) {
      return shortMatch[1];
    }

    // Pattern 3: embed/VIDEO_ID
    const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      return embedMatch[1];
    }

    throw new Error(`Invalid YouTube URL: ${url}`);
  }

  /**
   * Generates output file path from video ID if not specified.
   *
   * Default: {video-id}-story.yaml
   *
   * @param videoUrl YouTube video URL
   * @param configPath Optional path from config
   * @returns Absolute output file path
   */
  public generateOutputPath(videoUrl: string, configPath?: string): string {
    if (configPath) {
      return path.resolve(configPath);
    }

    const videoId = this.extractVideoId(videoUrl);
    return path.resolve(`${videoId}-story.yaml`);
  }
}
