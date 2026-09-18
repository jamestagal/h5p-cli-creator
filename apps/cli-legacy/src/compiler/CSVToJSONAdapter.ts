import {
  BookDefinition,
  ChapterDefinition,
  FlashcardsContent,
  DialogCardsContent,
  TextContent,
  AnyContentItem
} from "./YamlInputParser";

/**
 * Options for CSV to JSON conversion
 */
export interface CSVConversionOptions {
  title: string;
  language: string;
  description?: string;
  mode?: "normal" | "repetition";
}

/**
 * CSVToJSONAdapter converts CSV data to BookDefinition JSON structure.
 * Supports legacy CSV formats (flashcards, dialog cards, simple books).
 */
export class CSVToJSONAdapter {
  /**
   * Infers content type from CSV column headers.
   * @param headers Array of column header names
   * @returns Inferred content type
   */
  public static inferContentType(headers: string[]): "flashcards" | "dialogcards" | "text" {
    const headerSet = new Set(headers.map(h => h.toLowerCase()));

    // Check for flashcards pattern (question/answer)
    if (headerSet.has("question") && headerSet.has("answer")) {
      return "flashcards";
    }

    // Check for dialog cards pattern (front/back)
    if (headerSet.has("front") && headerSet.has("back")) {
      return "dialogcards";
    }

    // Default to text-based content
    return "text";
  }

  /**
   * Auto-detects content type and converts CSV to BookDefinition.
   * @param csvData Array of CSV row objects
   * @param options Conversion options
   * @returns BookDefinition structure
   */
  public static convertAuto(
    csvData: any[],
    options: CSVConversionOptions
  ): BookDefinition {
    if (csvData.length === 0) {
      throw new Error("CSV data is empty");
    }

    // Infer content type from first row headers
    const headers = Object.keys(csvData[0]);
    const contentType = this.inferContentType(headers);

    // Route to appropriate converter
    switch (contentType) {
      case "flashcards":
        return this.convertFlashcards(csvData, options);
      case "dialogcards":
        return this.convertDialogCards(csvData, options);
      case "text":
        return this.convertSimpleBook(csvData, options);
      default:
        throw new Error(`Unknown content type: ${contentType}`);
    }
  }

  /**
   * Converts flashcards CSV to BookDefinition.
   * Expected columns: question, answer, [tip], [image]
   * @param csvData Array of flashcard row objects
   * @param options Conversion options
   * @returns BookDefinition with single chapter containing flashcards content
   */
  public static convertFlashcards(
    csvData: Array<{
      question: string;
      answer: string;
      tip?: string;
      image?: string;
    }>,
    options: CSVConversionOptions
  ): BookDefinition {
    // Build cards array from CSV rows
    const cards = csvData.map(row => {
      const card: any = {
        question: row.question,
        answer: row.answer
      };

      // Add optional fields if present and non-empty
      if (row.tip && row.tip.trim()) {
        card.tip = row.tip;
      }
      if (row.image && row.image.trim()) {
        card.image = row.image;
      }

      return card;
    });

    // Create flashcards content item
    const flashcardsContent: FlashcardsContent = {
      type: "flashcards",
      title: options.title,
      description: options.description || "Write in the answers to the questions.",
      cards
    };

    // Create single chapter with flashcards
    const chapter: ChapterDefinition = {
      title: options.title,
      content: [flashcardsContent]
    };

    // Return complete book definition
    return {
      title: options.title,
      language: options.language,
      // description: options.description,  // TODO: Add description field to BookDefinition type
      chapters: [chapter]
    };
  }

  /**
   * Converts dialog cards CSV to BookDefinition.
   * Expected columns: front, back, [image], [audio]
   * @param csvData Array of dialog card row objects
   * @param options Conversion options
   * @returns BookDefinition with single chapter containing dialog cards content
   */
  public static convertDialogCards(
    csvData: Array<{
      front: string;
      back: string;
      image?: string;
      audio?: string;
    }>,
    options: CSVConversionOptions
  ): BookDefinition {
    // Build cards array from CSV rows
    const cards = csvData.map(row => {
      const card: any = {
        front: row.front,
        back: row.back
      };

      // Add optional fields if present and non-empty
      if (row.image && row.image.trim()) {
        card.image = row.image;
      }
      if (row.audio && row.audio.trim()) {
        card.audio = row.audio;
      }

      return card;
    });

    // Create dialog cards content item
    const dialogCardsContent: DialogCardsContent = {
      type: "dialogcards",
      title: options.title,
      mode: options.mode || "repetition",
      cards
    };

    // Create single chapter with dialog cards
    const chapter: ChapterDefinition = {
      title: options.title,
      content: [dialogCardsContent]
    };

    // Return complete book definition
    return {
      title: options.title,
      language: options.language,
      // description: options.description,  // TODO: Add description field to BookDefinition type
      chapters: [chapter]
    };
  }

  /**
   * Converts simple book CSV to BookDefinition.
   * Each row becomes a text page in the chapter.
   * Expected columns: pageTitle, pageText (or title, text)
   * @param csvData Array of page row objects
   * @param options Conversion options
   * @returns BookDefinition with single chapter containing text pages
   */
  public static convertSimpleBook(
    csvData: any[],
    options: CSVConversionOptions
  ): BookDefinition {
    // Build content items from CSV rows
    const content: TextContent[] = csvData.map(row => {
      // Support both pageTitle/pageText and title/text column names
      const title = row.pageTitle || row.title || "";
      const text = row.pageText || row.text || "";

      return {
        type: "text",
        title,
        text
      };
    });

    // Create single chapter with all text pages
    const chapter: ChapterDefinition = {
      title: options.title,
      content
    };

    // Return complete book definition
    return {
      title: options.title,
      language: options.language,
      // description: options.description,  // TODO: Add description field to BookDefinition type
      chapters: [chapter]
    };
  }
}
