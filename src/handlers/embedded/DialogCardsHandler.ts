import * as path from "path";
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { H5pImage } from "../../models/h5p-image";
import { H5pAudio } from "../../models/h5p-audio";

/**
 * DialogCardsContent represents the structure of dialog card items
 * that can be embedded in Interactive Book chapters.
 */
export interface DialogCardsContent {
  type: "dialogcards";
  title?: string;
  mode?: "normal" | "repetition";
  cards: Array<{
    front: string;
    back: string;
    image?: string;
    audio?: string;
  }>;
}

/**
 * DialogCardsHandler generates H5P.DialogCards sub-content that can be
 * embedded within Interactive Book chapters for conversation practice.
 */
export class DialogCardsHandler implements ContentHandler {
  public getContentType(): string {
    return "dialogcards";
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.cards) {
      return {
        valid: false,
        error: "Dialog cards content must have a 'cards' array",
      };
    }

    if (!Array.isArray(item.cards)) {
      return {
        valid: false,
        error: "Dialog cards 'cards' field must be an array",
      };
    }

    if (item.cards.length === 0) {
      return {
        valid: false,
        error: "Dialog cards must have at least one card",
      };
    }

    // Validate each card has required fields
    for (let i = 0; i < item.cards.length; i++) {
      const card = item.cards[i];
      if (!card.front || typeof card.front !== "string") {
        return {
          valid: false,
          error: `Card ${i + 1} must have a 'front' field (string)`,
        };
      }
      if (!card.back || typeof card.back !== "string") {
        return {
          valid: false,
          error: `Card ${i + 1} must have a 'back' field (string)`,
        };
      }
    }

    return { valid: true };
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.Dialogcards"];  // Note: lowercase 'c' in 'cards' for library name
  }

  public async process(
    context: HandlerContext,
    item: DialogCardsContent
  ): Promise<void> {
    const { chapterBuilder, logger, options, basePath, mediaFiles } = context;

    if (options.verbose) {
      logger.log(
        `    - Adding dialog cards: "${item.title || "Untitled Dialog Cards"}"`
      );
      logger.log(`      Cards: ${item.cards.length}`);
    }

    // Track media counters for this dialog card set
    let imageCounter = mediaFiles.filter((f) =>
      f.filename.startsWith("images/")
    ).length;
    let audioCounter = mediaFiles.filter((f) =>
      f.filename.startsWith("audios/")
    ).length;

    // Build dialog array with media handling
    const dialogs = [];
    for (const cardData of item.cards) {
      const card: any = {
        text: `<p>${cardData.front}</p>`,
        answer: `<p>${cardData.back}</p>`,
        tips: {},  // Required empty tips object
      };

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

      // Handle optional audio
      if (cardData.audio) {
        try {
          let ret: { extension: string; buffer: Buffer; audio: H5pAudio };

          // Detect URL vs local path
          if (
            !cardData.audio.startsWith("http://") &&
            !cardData.audio.startsWith("https://")
          ) {
            // Local file - resolve relative to basePath
            const audioPath = path.isAbsolute(cardData.audio)
              ? cardData.audio
              : path.join(basePath, cardData.audio);
            ret = await H5pAudio.fromLocalFile(audioPath);
          } else {
            // URL - download from web
            ret = await H5pAudio.fromDownload(cardData.audio);
          }

          // Generate sequential filename
          const filename = `audios/${audioCounter}${ret.extension}`;
          audioCounter++;

          // Track media file
          mediaFiles.push({
            filename,
            buffer: ret.buffer,
          });

          ret.audio.path = filename;
          card.audio = [ret.audio];

          if (options.verbose) {
            logger.log(
              `        Downloaded audio from ${cardData.audio}. (${ret.buffer.byteLength} bytes)`
            );
          }
        } catch (error) {
          logger.error(`        Failed to load audio: ${error}`);
          card.audio = undefined;
        }
      }

      dialogs.push(card);
    }

    // Build H5P.DialogCards content structure
    // IMPORTANT: Field order must match H5P.com: params, library, subContentId (added by wrapper), metadata
    const dialogCardsContent = {
      params: {
        mode: item.mode || "normal",  // Use "normal" mode by default (matching H5P.com)
        dialogs: dialogs,
        behaviour: {
          enableRetry: true,
          disableBackwardsNavigation: false,
          scaleTextNotCard: false,
          randomCards: false,
          maxProficiency: 5,
          quickProgression: false,
        },
        // UI labels (required for Dialog Cards to render properly)
        answer: "Turn",
        next: "Next",
        prev: "Previous",
        retry: "Retry",
        correctAnswer: "I got it right!",
        incorrectAnswer: "I got it wrong",
        round: "Round @round",
        cardsLeft: "Cards left: @number",
        nextRound: "Proceed to round @round",
        startOver: "Start over",
        showSummary: "Next",
        summary: "Summary",
        summaryCardsRight: "Cards you got right:",
        summaryCardsWrong: "Cards you got wrong:",
        summaryCardsNotShown: "Cards in pool not shown:",
        summaryOverallScore: "Overall Score",
        summaryCardsCompleted: "Cards you have completed learning:",
        summaryCompletedRounds: "Completed rounds:",
        summaryAllDone: "Well done! You have mastered all @cards cards by getting them correct @max times!",
        progressText: "Card @card of @total",
        cardFrontLabel: "Card front",
        cardBackLabel: "Card back",
        tipButtonLabel: "Show tip",
        audioNotSupported: "Your browser does not support this audio",
        confirmStartingOver: {
          header: "Start over?",
          body: "All progress will be lost. Are you sure you want to start over?",
          cancelLabel: "Cancel",
          confirmLabel: "Start over",
        },
        title: `<p>${item.title || "Dialog Cards"}</p>`,
      },
      library: "H5P.Dialogcards 1.9",
      metadata: {
        contentType: "Dialog Cards",
        license: "U",
        title: item.title || "Dialog Cards",
      },
    };

    // Add to chapter using custom content method
    chapterBuilder.addCustomContent(dialogCardsContent);
  }
}
