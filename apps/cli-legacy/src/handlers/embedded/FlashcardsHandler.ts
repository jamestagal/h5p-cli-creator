import * as path from "path";
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { H5pImage } from "../../models/h5p-image";

/**
 * FlashcardsContent represents the structure of flashcard items
 * that can be embedded in Interactive Book chapters.
 */
export interface FlashcardsContent {
  type: "flashcards";
  title?: string;
  description?: string;
  cards: Array<{
    question: string;
    answer: string;
    tip?: string;
    image?: string;
  }>;
}

/**
 * FlashcardsHandler generates H5P.Flashcards sub-content that can be
 * embedded within Interactive Book chapters for practice activities.
 */
export class FlashcardsHandler implements ContentHandler {
  public getContentType(): string {
    return "flashcards";
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.cards) {
      return {
        valid: false,
        error: "Flashcards content must have a 'cards' array",
      };
    }

    if (!Array.isArray(item.cards)) {
      return {
        valid: false,
        error: "Flashcards 'cards' field must be an array",
      };
    }

    if (item.cards.length === 0) {
      return {
        valid: false,
        error: "Flashcards must have at least one card",
      };
    }

    // Validate each card has required fields
    for (let i = 0; i < item.cards.length; i++) {
      const card = item.cards[i];
      if (!card.question || typeof card.question !== "string") {
        return {
          valid: false,
          error: `Card ${i + 1} must have a 'question' field (string)`,
        };
      }
      if (!card.answer || typeof card.answer !== "string") {
        return {
          valid: false,
          error: `Card ${i + 1} must have an 'answer' field (string)`,
        };
      }
    }

    return { valid: true };
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.Flashcards"];
  }

  public async process(
    context: HandlerContext,
    item: FlashcardsContent
  ): Promise<void> {
    const { chapterBuilder, logger, options, basePath, mediaFiles } = context;

    if (options.verbose) {
      logger.log(
        `    - Adding flashcards: "${item.title || "Untitled Flashcards"}"`
      );
      logger.log(`      Cards: ${item.cards.length}`);
    }

    // Track image counter for this flashcard set
    let imageCounter = mediaFiles.length;

    // Build card array with media handling
    const cards = [];
    for (const cardData of item.cards) {
      const card: any = {
        text: cardData.question,
        answer: cardData.answer,
      };

      // Handle optional tip
      if (cardData.tip) {
        card.tip = cardData.tip;
      }

      // Handle optional image
      if (cardData.image) {
        try {
          let ret: { extension: string; buffer: Buffer; image: H5pImage };

          // Detect URL vs local path
          if (
            !cardData.image.startsWith("http://") &&
            !cardData.image.startsWith("https://")
          ) {
            // Local file - resolve relative to basePath
            const imagePath = path.isAbsolute(cardData.image)
              ? cardData.image
              : path.join(basePath, cardData.image);
            ret = await H5pImage.fromLocalFile(imagePath);
          } else {
            // URL - download from web
            ret = await H5pImage.fromDownload(cardData.image);
          }

          // Generate sequential filename
          const filename = `images/${imageCounter}${ret.extension}`;
          imageCounter++;

          // Track media file
          mediaFiles.push({
            filename,
            buffer: ret.buffer,
          });

          ret.image.path = filename;
          card.image = ret.image;

          if (options.verbose) {
            logger.log(
              `        Downloaded image from ${cardData.image}. (${ret.buffer.byteLength} bytes)`
            );
          }
        } catch (error) {
          logger.error(`        Failed to load image: ${error}`);
          card.image = undefined;
        }
      }

      cards.push(card);
    }

    // Build H5P.Flashcards content structure
    const flashcardsContent = {
      library: "H5P.Flashcards 1.5",
      params: {
        description: item.description || "Practice with flashcards",
        cards: cards,
        caseSensitive: false,
        showSolutionsRequiresInput: true,
      },
      metadata: {
        contentType: "Flashcards",
        license: "U",
        title: item.title || "Flashcards",
      },
    };

    // Add to chapter using custom content method
    chapterBuilder.addCustomContent(flashcardsContent);
  }
}
