import * as path from "path";

import { ContentCreator } from "../base/content-creator";
import { H5pPackage } from "../../utils/h5p-package";
import { H5pInteractiveBookContent } from "../../models/h5p-interactive-book-content";
import { H5pImage } from "../../models/h5p-image";
import { H5pAudio } from "../../models/h5p-audio";

/**
 * Creator class for H5P Interactive Book content type.
 * Extends ContentCreator to follow the established architecture pattern.
 *
 * Generates Interactive Book H5P packages from CSV data containing text, images, and audio.
 * Each CSV row becomes a chapter/page in the book with optional media attachments.
 */
export class InteractiveBookCreator extends ContentCreator<H5pInteractiveBookContent> {
  /** Counter for generating sequential image filenames (images/0.jpg, images/1.png, etc.) */
  private imageCounter: number = 0;

  /** Counter for generating sequential audio filenames (audios/0.mp3, audios/1.wav, etc.) */
  private audioCounter: number = 0;

  /**
   * Creates a new InteractiveBookCreator instance.
   *
   * @param h5pPackage - The H5P package to populate with content
   * @param data - Array of parsed CSV rows containing book page data
   * @param titleOverride - Optional title to override the bookTitle from CSV
   * @param sourcePath - Directory path of the CSV file (used for resolving relative media paths)
   */
  constructor(
    h5pPackage: H5pPackage,
    private data: any[],
    private titleOverride: string | undefined,
    sourcePath: string
  ) {
    super(h5pPackage, sourcePath);
  }

  /**
   * Factory method to create a new H5pInteractiveBookContent instance.
   * Required by ContentCreator abstract class.
   *
   * @returns New instance of H5pInteractiveBookContent
   */
  protected contentObjectFactory(): H5pInteractiveBookContent {
    return new H5pInteractiveBookContent();
  }

  /**
   * Populates the content object with chapters from CSV data.
   * Required by ContentCreator abstract class.
   *
   * Each CSV row is converted into a chapter with nested H5P content types:
   * - H5P.AdvancedText for title and text content
   * - H5P.Image if imagePath is provided
   * - H5P.Audio if audioPath is provided
   *
   * @param content - The content object to populate
   */
  protected async addContent(content: H5pInteractiveBookContent): Promise<void> {
    content.chapters = [];

    for (const row of this.data) {
      try {
        const chapter = await this.createChapter(row);
        content.chapters.push(chapter);
      } catch (error) {
        console.warn(`Warning: Failed to create chapter for "${row.pageTitle}": ${error.message}`);
      }
    }
  }

  /**
   * Configures book metadata and settings.
   * Required by ContentCreator abstract class.
   *
   * Sets the book title (from CLI override or CSV) and cover description.
   *
   * @param content - The content object to configure
   */
  protected addSettings(content: H5pInteractiveBookContent): void {
    const firstRow = this.data[0];
    const bookTitle = this.titleOverride || firstRow?.bookTitle || "Interactive Book";

    // Set book cover description from first row of CSV
    content.bookCover.coverDescription = firstRow?.coverDescription || "";

    // Update H5P package metadata with book title
    this.h5pPackage.h5pMetadata.title = bookTitle;
    this.h5pPackage.addMetadata(this.h5pPackage.h5pMetadata);
  }

  /**
   * Creates a chapter object from a CSV row.
   *
   * Builds the chapter structure with nested H5P content types:
   * 1. Always includes H5P.AdvancedText with page title and text content
   * 2. Optionally includes H5P.Image if imagePath provided
   * 3. Optionally includes H5P.Audio if audioPath provided
   *
   * @param row - CSV row data containing page information
   * @returns Chapter structure with H5P.Column wrapper and metadata
   */
  private async createChapter(row: any): Promise<any> {
    const content: any[] = [];

    // Add text content (always present)
    content.push({
      content: {
        library: "H5P.AdvancedText 1.1",
        params: {
          text: this.buildTextHtml(row.pageTitle, row.pageText)
        },
        metadata: {
          contentType: "Text",
          license: "U",
          title: row.pageTitle || "Untitled Text"
        }
      },
      useSeparator: "auto"
    });

    // Add image if provided
    if (row.imagePath) {
      try {
        const imageContent = await this.createImageContent(
          row.imagePath,
          row.imageAlt || row.pageTitle
        );
        content.push(imageContent);
        console.log(`Added image for page: ${row.pageTitle}`);
      } catch (error) {
        console.warn(`Warning: Failed to add image for "${row.pageTitle}": ${error.message}`);
      }
    }

    // Add audio if provided
    if (row.audioPath) {
      try {
        const audioContent = await this.createAudioContent(row.audioPath);
        content.push(audioContent);
        console.log(`Added audio for page: ${row.pageTitle}`);
      } catch (error) {
        console.warn(`Warning: Failed to add audio for "${row.pageTitle}": ${error.message}`);
      }
    }

    // Return chapter structure expected by H5P Interactive Book
    // Chapters array contains direct H5P.Column objects (no "chapter" wrapper)
    return {
      library: "H5P.Column 1.18",
      params: {
        content
      },
      metadata: {
        contentType: "Column",
        license: "U",
        title: row.pageTitle || "Untitled Page"
      }
    };
  }

  /**
   * Builds HTML content from title and text with proper formatting.
   *
   * - Page title is wrapped in <h2> tags
   * - Text is split by double newlines (\n\n) into separate paragraphs
   * - Each paragraph is wrapped in <p> tags
   * - All HTML special characters are escaped for security
   *
   * @param title - Page title to display as heading
   * @param text - Page text content (can contain multiple paragraphs)
   * @returns HTML string with formatted content
   */
  private buildTextHtml(title: string, text: string): string {
    let html = '';
    if (title) {
      html += `<h2>${this.escapeHtml(title)}</h2>\n`;
    }
    // Split text into paragraphs (double newlines indicate paragraph breaks)
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    for (const para of paragraphs) {
      html += `<p>${this.escapeHtml(para.trim())}</p>\n`;
    }
    return html;
  }

  /**
   * Creates an image content structure using H5pImage helper.
   * Supports both local files and URLs (http:// or https://).
   *
   * Process:
   * 1. Detect if path is URL or local file
   * 2. Load image using H5pImage helper (handles MIME types and dimensions)
   * 3. Generate sequential filename (images/0.jpg, images/1.png, etc.)
   * 4. Add image buffer to H5P package
   * 5. Return H5P.Image content structure
   *
   * @param imagePath - Path to image file (relative to CSV) or URL
   * @param alt - Alt text for accessibility
   * @returns Image content structure for H5P.Image 1.1
   */
  private async createImageContent(imagePath: string, alt: string): Promise<any> {
    let ret: { extension: string; buffer: Buffer; image: H5pImage };

    // Detect URL vs local path
    if (
      !imagePath.startsWith("http://") &&
      !imagePath.startsWith("https://")
    ) {
      // Local file - resolve relative to CSV directory
      ret = await H5pImage.fromLocalFile(
        path.join(this.sourcePath, imagePath)
      );
    } else {
      // URL - download from web
      ret = await H5pImage.fromDownload(imagePath);
    }

    // Generate sequential filename for package
    const filename = `images/${this.imageCounter}${ret.extension}`;
    this.imageCounter++;

    // Add file buffer to H5P package ZIP
    this.h5pPackage.addContentFile(filename, ret.buffer);
    ret.image.path = filename;

    // Return H5P.Image content structure matching Hub format
    return {
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
          title: alt
        }
      },
      useSeparator: "auto"
    };
  }

  /**
   * Creates an audio content structure using H5pAudio helper.
   * Supports both local files and URLs (http:// or https://).
   *
   * Process:
   * 1. Detect if path is URL or local file
   * 2. Load audio using H5pAudio helper (handles MIME types)
   * 3. Generate sequential filename (audios/0.mp3, audios/1.wav, etc.)
   * 4. Add audio buffer to H5P package
   * 5. Return H5P.Audio content structure with minimalistic player
   *
   * @param audioPath - Path to audio file (relative to CSV) or URL
   * @returns Audio content structure for H5P.Audio 1.5
   */
  private async createAudioContent(audioPath: string): Promise<any> {
    let ret: { extension: string; buffer: Buffer; audio: H5pAudio };

    // Detect URL vs local path
    if (
      !audioPath.startsWith("http://") &&
      !audioPath.startsWith("https://")
    ) {
      // Local file - resolve relative to CSV directory
      ret = await H5pAudio.fromLocalFile(
        path.join(this.sourcePath, audioPath)
      );
    } else {
      // URL - download from web
      ret = await H5pAudio.fromDownload(audioPath);
    }

    // Generate sequential filename for package
    const filename = `audios/${this.audioCounter}${ret.extension}`;
    this.audioCounter++;

    // Add file buffer to H5P package ZIP
    this.h5pPackage.addContentFile(filename, ret.buffer);
    ret.audio.path = filename;

    // Return H5P.Audio content structure matching Hub format
    return {
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
          title: "Audio"
        }
      },
      useSeparator: "auto"
    };
  }

  /**
   * Escapes HTML special characters to prevent injection.
   *
   * @param text - Text to escape
   * @returns Escaped text safe for HTML output
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
