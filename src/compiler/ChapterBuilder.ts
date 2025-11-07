import * as path from "path";
import { H5pImage } from "../models/h5p-image";
import { H5pAudio } from "../models/h5p-audio";
import { MediaFile } from "./ContentBuilder";

/**
 * ChapterBuilder provides methods for adding content pages to a chapter.
 * Supports text, image, audio, and custom H5P content.
 */
export class ChapterBuilder {
  private chapterContent: any[] = [];
  private localImageCounter: number;
  private localAudioCounter: number;
  private finalizeCallback?: (imageCount: number, audioCount: number) => void;

  /**
   * Creates a new ChapterBuilder instance.
   * @param chapterTitle Title of the chapter
   * @param chaptersArray Parent array to add chapter to when finalized
   * @param mediaFilesArray Parent array to add media files to
   * @param initialImageCounter Starting image counter value
   * @param initialAudioCounter Starting audio counter value
   */
  constructor(
    private chapterTitle: string,
    private chaptersArray: any[],
    private mediaFilesArray: MediaFile[],
    initialImageCounter: number,
    initialAudioCounter: number
  ) {
    this.localImageCounter = initialImageCounter;
    this.localAudioCounter = initialAudioCounter;
    this.finalizeChapter();
  }

  /**
   * Registers a callback to be called when the chapter is finalized.
   * Used to update parent counter state.
   * @param callback Function to call with final counter values
   */
  public onFinalize(callback: (imageCount: number, audioCount: number) => void): void {
    this.finalizeCallback = callback;
  }

  /**
   * Adds a text page to the chapter.
   * @param title Page title (displayed as H2 heading)
   * @param text Page text content (supports paragraphs separated by double newlines)
   * @returns This builder for method chaining
   */
  public addTextPage(title: string, text: string): this {
    const html = this.buildTextHtml(title, text);

    this.chapterContent.push({
      content: {
        library: "H5P.AdvancedText 1.1",
        params: {
          text: html
        },
        metadata: {
          contentType: "Text",
          license: "U",
          title: title || "Untitled Text"
        }
      },
      useSeparator: "auto"
    });

    return this;
  }

  /**
   * Adds an image page to the chapter.
   * Supports both local files and URLs.
   * @param title Page title
   * @param imagePath Path to image file (relative or absolute) or URL
   * @param alt Alt text for accessibility
   * @returns This builder for method chaining
   */
  public async addImagePage(title: string, imagePath: string, alt: string): Promise<this> {
    let ret: { extension: string; buffer: Buffer; image: H5pImage };

    // Detect URL vs local path
    if (!imagePath.startsWith("http://") && !imagePath.startsWith("https://")) {
      // Local file
      ret = await H5pImage.fromLocalFile(imagePath);
    } else {
      // URL - download from web
      ret = await H5pImage.fromDownload(imagePath);
    }

    // Generate sequential filename for package
    const filename = `images/${this.localImageCounter}${ret.extension}`;
    this.localImageCounter++;

    // Track media file
    this.mediaFilesArray.push({
      filename,
      buffer: ret.buffer
    });

    ret.image.path = filename;

    // Add image content to chapter
    this.chapterContent.push({
      content: {
        library: "H5P.Image 1.1",
        params: {
          contentName: "Image",
          file: ret.image,
          alt: alt
        },
        metadata: {
          contentType: "Image",
          license: "U",
          title: title || alt
        }
      },
      useSeparator: "auto"
    });

    return this;
  }

  /**
   * Adds an audio page to the chapter.
   * Supports both local files and URLs.
   * @param title Page title
   * @param audioPath Path to audio file (relative or absolute) or URL
   * @returns This builder for method chaining
   */
  public async addAudioPage(title: string, audioPath: string): Promise<this> {
    let ret: { extension: string; buffer: Buffer; audio: H5pAudio };

    // Detect URL vs local path
    if (!audioPath.startsWith("http://") && !audioPath.startsWith("https://")) {
      // Local file
      ret = await H5pAudio.fromLocalFile(audioPath);
    } else {
      // URL - download from web
      ret = await H5pAudio.fromDownload(audioPath);
    }

    // Generate sequential filename for package
    const filename = `audios/${this.localAudioCounter}${ret.extension}`;
    this.localAudioCounter++;

    // Track media file
    this.mediaFilesArray.push({
      filename,
      buffer: ret.buffer
    });

    ret.audio.path = filename;

    // Add audio content to chapter
    this.chapterContent.push({
      content: {
        library: "H5P.Audio 1.5",
        params: {
          contentName: "Audio",
          files: [ret.audio],
          playerMode: "full",
          fitToWrapper: false,
          controls: true,
          autoplay: false,
          audioNotSupported: "Your browser does not support this audio",
          playAudio: "Play audio",
          pauseAudio: "Pause audio"
        },
        metadata: {
          contentType: "Audio",
          license: "U",
          title: title || "Audio"
        }
      },
      useSeparator: "auto"
    });

    return this;
  }

  /**
   * Adds custom H5P content to the chapter.
   * @param content Custom H5P content structure
   * @returns This builder for method chaining
   */
  public addCustomContent(content: any): this {
    this.chapterContent.push({
      content,
      useSeparator: "auto"
    });

    return this;
  }

  /**
   * Finalizes the chapter and adds it to the parent chapters array.
   * This is called automatically when the ChapterBuilder is created.
   */
  private finalizeChapter(): void {
    // Add chapter to parent array immediately with reference to content array
    // This allows the chapter to be built up incrementally
    const chapterStructure = {
      library: "H5P.Column 1.18",
      params: {
        content: this.chapterContent
      },
      metadata: {
        contentType: "Column",
        license: "U",
        title: this.chapterTitle
      }
    };

    this.chaptersArray.push(chapterStructure);

    // Set up cleanup when builder is done (on next tick)
    process.nextTick(() => {
      if (this.finalizeCallback) {
        this.finalizeCallback(this.localImageCounter, this.localAudioCounter);
      }
    });
  }

  /**
   * Builds HTML content from title and text with proper formatting.
   * @param title Page title to display as heading
   * @param text Page text content (can contain multiple paragraphs)
   * @returns HTML string with formatted content
   */
  private buildTextHtml(title: string, text: string): string {
    let html = "";
    if (title) {
      html += `<h2>${this.escapeHtml(title)}</h2>\n`;
    }
    // Split text into paragraphs (double newlines indicate paragraph breaks)
    const paragraphs = text.split("\n\n").filter(p => p.trim());
    for (const para of paragraphs) {
      html += `<p>${this.escapeHtml(para.trim())}</p>\n`;
    }
    return html;
  }

  /**
   * Escapes HTML special characters to prevent injection.
   * @param text Text to escape
   * @returns Escaped text safe for HTML output
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
