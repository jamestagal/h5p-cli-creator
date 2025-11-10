import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { H5pImage } from "../../models/h5p-image";
import { H5pAudio } from "../../models/h5p-audio";
import * as path from "path";

/**
 * Manual true/false content
 *
 * @example
 * ```yaml
 * - type: truefalse
 *   title: "Capital Cities"
 *   question: "Oslo is the capital of Norway"
 *   correct: true
 * ```
 *
 * @example
 * ```yaml
 * - type: truefalse
 *   title: "Geography Question"
 *   question: "The Earth is flat"
 *   correct: false
 *   behaviour:
 *     enableRetry: true
 *     feedbackOnWrong: "The Earth is actually round!"
 * ```
 */
export interface TrueFalseContent {
  type: "truefalse" | "true-false";
  title?: string;

  // The statement to evaluate
  question: string;

  // Is the statement true or false?
  correct: boolean;

  // Optional media above the question
  media?: {
    path: string;           // Path to image/video/audio file
    type?: "image" | "video" | "audio";
    alt?: string;           // For images
    disableZooming?: boolean;  // For images only
  };

  // Optional behavior settings
  behaviour?: {
    enableRetry?: boolean;
    enableSolutionsButton?: boolean;
    confirmCheckDialog?: boolean;
    confirmRetryDialog?: boolean;
    autoCheck?: boolean;
    feedbackOnCorrect?: string;
    feedbackOnWrong?: string;
  };

  // Optional UI labels
  labels?: {
    trueText?: string;
    falseText?: string;
    checkAnswer?: string;
    showSolutionButton?: string;
    tryAgain?: string;
    wrongAnswerMessage?: string;
    correctAnswerMessage?: string;
  };
}

/**
 * Handler for H5P.TrueFalse content type (manual questions)
 *
 * Creates simple true/false questions where users determine if a statement is true or false.
 *
 * Manual usage in YAML:
 * ```yaml
 * - type: truefalse
 *   title: "Capital Cities"
 *   question: "Oslo is the capital of Norway"
 *   correct: true
 * ```
 */
export class TrueFalseHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "truefalse";
  }

  /**
   * Validates true/false content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // Validate question field (required)
    if (!item.question) {
      return {
        valid: false,
        error: "TrueFalse requires 'question' field. Please provide a question text string."
      };
    }

    if (typeof item.question !== "string") {
      return {
        valid: false,
        error: "TrueFalse 'question' field must be a string. Received: " + typeof item.question
      };
    }

    // Validate correct field (required boolean)
    if (item.correct === undefined || item.correct === null) {
      return {
        valid: false,
        error: "TrueFalse requires 'correct' field. Please provide a boolean value (true or false)."
      };
    }

    if (typeof item.correct !== "boolean") {
      return {
        valid: false,
        error: "TrueFalse 'correct' field must be a boolean (true or false). Received: " + typeof item.correct
      };
    }

    // Validate media if provided
    if (item.media) {
      if (!item.media.path) {
        return {
          valid: false,
          error: "TrueFalse media object requires 'path' field. Please provide a file path."
        };
      }

      if (typeof item.media.path !== "string") {
        return {
          valid: false,
          error: "TrueFalse media 'path' must be a string"
        };
      }

      if (item.media.type && !["image", "video", "audio"].includes(item.media.type)) {
        return {
          valid: false,
          error: "TrueFalse media 'type' must be one of: image, video, audio"
        };
      }

      if (item.media.alt !== undefined && typeof item.media.alt !== "string") {
        return {
          valid: false,
          error: "TrueFalse media 'alt' must be a string"
        };
      }

      if (item.media.disableZooming !== undefined && typeof item.media.disableZooming !== "boolean") {
        return {
          valid: false,
          error: "TrueFalse media 'disableZooming' must be a boolean"
        };
      }
    }

    // Validate behaviour fields if provided
    if (item.behaviour) {
      const booleanFields = [
        "enableRetry",
        "enableSolutionsButton",
        "confirmCheckDialog",
        "confirmRetryDialog",
        "autoCheck"
      ];

      for (const field of booleanFields) {
        if (item.behaviour[field] !== undefined && typeof item.behaviour[field] !== "boolean") {
          return {
            valid: false,
            error: `TrueFalse behaviour '${field}' must be a boolean`
          };
        }
      }

      // Validate feedback strings (max 2048 chars per H5P semantics)
      const feedbackFields = ["feedbackOnCorrect", "feedbackOnWrong"];
      for (const field of feedbackFields) {
        if (item.behaviour[field] !== undefined) {
          if (typeof item.behaviour[field] !== "string") {
            return {
              valid: false,
              error: `TrueFalse behaviour '${field}' must be a string`
            };
          }
          if (item.behaviour[field].length > 2048) {
            return {
              valid: false,
              error: `TrueFalse behaviour '${field}' exceeds maximum length of 2048 characters`
            };
          }
        }
      }
    }

    // Validate labels if provided
    if (item.labels) {
      const stringFields = [
        "trueText",
        "falseText",
        "checkAnswer",
        "showSolutionButton",
        "tryAgain",
        "wrongAnswerMessage",
        "correctAnswerMessage"
      ];

      for (const field of stringFields) {
        if (item.labels[field] !== undefined && typeof item.labels[field] !== "string") {
          return {
            valid: false,
            error: `TrueFalse labels '${field}' must be a string`
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Processes true/false content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: TrueFalseContent): Promise<void> {
    const { chapterBuilder, logger, options, basePath } = context;

    if (options.verbose) {
      logger.log(`    - Adding true/false question: "${item.title || 'Untitled'}"`);
    }

    // Build default behaviour
    const defaultBehaviour = {
      enableRetry: true,
      enableSolutionsButton: true,
      enableCheckButton: true,
      confirmCheckDialog: false,
      confirmRetryDialog: false,
      autoCheck: false
    };

    // Merge with custom behaviour if provided
    const behaviour = { ...defaultBehaviour, ...(item.behaviour || {}) };

    // Build default labels (l10n)
    const defaultLabels = {
      trueText: "True",
      falseText: "False",
      score: "You got @score of @total points",
      checkAnswer: "Check",
      submitAnswer: "Submit",
      showSolutionButton: "Show solution",
      tryAgain: "Retry",
      wrongAnswerMessage: "Wrong answer",
      correctAnswerMessage: "Correct answer",
      scoreBarLabel: "You got :num out of :total points",
      a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
      a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
      a11yRetry: "Retry the task. Reset all responses and start the task over again."
    };

    // Merge with custom labels if provided
    const l10n = { ...defaultLabels, ...(item.labels || {}) };

    // Build default confirmation dialogs
    const confirmCheck = {
      header: "Finish ?",
      body: "Are you sure you wish to finish ?",
      cancelLabel: "Cancel",
      confirmLabel: "Finish"
    };

    const confirmRetry = {
      header: "Retry ?",
      body: "Are you sure you wish to retry ?",
      cancelLabel: "Cancel",
      confirmLabel: "Confirm"
    };

    // CRITICAL: Convert boolean correct to string "true" or "false"
    const h5pParams: any = {
      question: `<p>${this.escapeHtml(item.question)}</p>`,
      correct: item.correct ? "true" : "false",  // CRITICAL: String, not boolean!
      behaviour: behaviour,
      l10n: l10n,
      confirmCheck: confirmCheck,
      confirmRetry: confirmRetry
    };

    // Add custom feedback if provided
    if (item.behaviour?.feedbackOnCorrect) {
      h5pParams.behaviour.feedbackOnCorrect = item.behaviour.feedbackOnCorrect;
    }
    if (item.behaviour?.feedbackOnWrong) {
      h5pParams.behaviour.feedbackOnWrong = item.behaviour.feedbackOnWrong;
    }

    // Process media if provided (Task Group 2: Media Handling)
    if (item.media) {
      try {
        // Resolve media file path relative to YAML file
        const mediaPath = path.isAbsolute(item.media.path)
          ? item.media.path
          : path.resolve(basePath, item.media.path);

        // Determine media type from extension if not provided
        const mediaType = item.media.type || this.detectMediaType(item.media.path);

        if (options.verbose) {
          logger.log(`      Processing ${mediaType} media: ${item.media.path}`);
        }

        // Build media structure based on type
        if (mediaType === "image") {
          h5pParams.media = await this.processImageMedia(
            mediaPath,
            item.media.alt,
            item.media.disableZooming,
            chapterBuilder,
            options.verbose ? logger : undefined
          );
        } else if (mediaType === "video") {
          h5pParams.media = await this.processVideoMedia(
            mediaPath,
            chapterBuilder,
            options.verbose ? logger : undefined
          );
        } else if (mediaType === "audio") {
          h5pParams.media = await this.processAudioMedia(
            mediaPath,
            chapterBuilder,
            options.verbose ? logger : undefined
          );
        }
      } catch (error) {
        logger.warn(`      Warning: Failed to process media: ${error instanceof Error ? error.message : String(error)}`);
        // Continue without media if processing fails
      }
    }

    // Build H5P TrueFalse structure
    const h5pContent = {
      library: "H5P.TrueFalse 1.8",
      params: h5pParams,
      metadata: {
        title: item.title || "True/False Question",
        license: "U",
        contentType: "True/False Question"
      },
      subContentId: this.generateSubContentId()
    };

    chapterBuilder.addCustomContent(h5pContent);

    if (options.verbose) {
      logger.log(`      ✓ Added true/false question with correct answer: ${item.correct}`);
    }
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.TrueFalse"];
  }

  /**
   * Detects media type from file extension
   */
  private detectMediaType(filePath: string): "image" | "video" | "audio" {
    const ext = path.extname(filePath).toLowerCase();

    // Image extensions
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"].includes(ext)) {
      return "image";
    }

    // Video extensions
    if ([".mp4", ".webm", ".ogg", ".ogv", ".mov", ".avi"].includes(ext)) {
      return "video";
    }

    // Audio extensions
    if ([".mp3", ".wav", ".m4a", ".ogg", ".oga", ".flac"].includes(ext)) {
      return "audio";
    }

    // Default to image
    return "image";
  }

  /**
   * Processes image media and returns H5P media structure
   */
  private async processImageMedia(
    mediaPath: string,
    alt: string | undefined,
    disableZooming: boolean | undefined,
    chapterBuilder: any,
    logger?: any
  ): Promise<any> {
    let ret: { extension: string; buffer: Buffer; image: H5pImage };

    // Detect URL vs local path
    if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) {
      ret = await H5pImage.fromDownload(mediaPath);
    } else {
      ret = await H5pImage.fromLocalFile(mediaPath);
    }

    // Generate sequential filename for package
    const imageCounter = chapterBuilder.mediaFilesArray?.length || 0;
    const filename = `images/${imageCounter}${ret.extension}`;

    // Track media file in ChapterBuilder
    if (chapterBuilder.mediaFilesArray) {
      chapterBuilder.mediaFilesArray.push({
        filename,
        buffer: ret.buffer
      });
    }

    ret.image.path = filename;

    // Build H5P.Image structure
    const imageParams: any = {
      contentName: "Image",
      file: ret.image,
      alt: alt || ""
    };

    const mediaStructure: any = {
      type: {
        library: "H5P.Image 1.1",
        params: imageParams,
        subContentId: this.generateSubContentId(),
        metadata: {
          contentType: "Image",
          license: "U",
          title: "Image"
        }
      }
    };

    // Include disableImageZooming only for images and only if specified
    if (disableZooming !== undefined) {
      mediaStructure.disableImageZooming = disableZooming;
    }

    if (logger) {
      logger.log(`        ✓ Processed image media: ${filename}`);
    }

    return mediaStructure;
  }

  /**
   * Processes video media and returns H5P media structure
   */
  private async processVideoMedia(
    mediaPath: string,
    chapterBuilder: any,
    logger?: any
  ): Promise<any> {
    // For video, we need to handle the file manually since there's no H5pVideo helper
    const fs = await import("fs");
    const mime = await import("mime-types");

    let buffer: Buffer;
    let mimeType: string;

    // Detect URL vs local path
    if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) {
      const axios = await import("axios");
      const response = await axios.default.get(mediaPath, { responseType: "arraybuffer" });
      if (response.status !== 200) {
        throw new Error(`Failed to download video from ${mediaPath}`);
      }
      buffer = Buffer.from(response.data);
      mimeType = response.headers["content-type"] || "video/mp4";
    } else {
      buffer = fs.readFileSync(mediaPath);
      mimeType = mime.lookup(mediaPath) || "video/mp4";
    }

    // Generate sequential filename for package
    const videoCounter = chapterBuilder.mediaFilesArray?.length || 0;
    const extension = path.extname(mediaPath);
    const filename = `videos/${videoCounter}${extension}`;

    // Track media file in ChapterBuilder
    if (chapterBuilder.mediaFilesArray) {
      chapterBuilder.mediaFilesArray.push({
        filename,
        buffer
      });
    }

    // Build H5P.Video structure
    const videoParams = {
      sources: [
        {
          path: filename,
          mime: mimeType,
          copyright: {
            license: "U"
          }
        }
      ],
      visuals: {
        fit: true,
        controls: true
      },
      playback: {
        autoplay: false,
        loop: false
      }
    };

    const mediaStructure = {
      type: {
        library: "H5P.Video 1.6",
        params: videoParams,
        subContentId: this.generateSubContentId(),
        metadata: {
          contentType: "Video",
          license: "U",
          title: "Video"
        }
      }
    };

    if (logger) {
      logger.log(`        ✓ Processed video media: ${filename}`);
    }

    return mediaStructure;
  }

  /**
   * Processes audio media and returns H5P media structure
   */
  private async processAudioMedia(
    mediaPath: string,
    chapterBuilder: any,
    logger?: any
  ): Promise<any> {
    let ret: { extension: string; buffer: Buffer; audio: H5pAudio };

    // Detect URL vs local path
    if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) {
      ret = await H5pAudio.fromDownload(mediaPath);
    } else {
      ret = await H5pAudio.fromLocalFile(mediaPath);
    }

    // Generate sequential filename for package
    const audioCounter = chapterBuilder.mediaFilesArray?.length || 0;
    const filename = `audios/${audioCounter}${ret.extension}`;

    // Track media file in ChapterBuilder
    if (chapterBuilder.mediaFilesArray) {
      chapterBuilder.mediaFilesArray.push({
        filename,
        buffer: ret.buffer
      });
    }

    ret.audio.path = filename;

    // Build H5P.Audio structure
    const audioParams = {
      contentName: "Audio",
      files: [ret.audio],
      playerMode: "full",
      fitToWrapper: false,
      controls: true,
      autoplay: false,
      audioNotSupported: "Your browser does not support this audio",
      playAudio: "Play audio",
      pauseAudio: "Pause audio"
    };

    const mediaStructure = {
      type: {
        library: "H5P.Audio 1.5",
        params: audioParams,
        subContentId: this.generateSubContentId(),
        metadata: {
          contentType: "Audio",
          license: "U",
          title: "Audio"
        }
      }
    };

    if (logger) {
      logger.log(`        ✓ Processed audio media: ${filename}`);
    }

    return mediaStructure;
  }

  /**
   * Escapes HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Generates a unique sub-content ID for H5P content
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
