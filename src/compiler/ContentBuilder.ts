import { LibraryRegistry } from "./LibraryRegistry";
import { SemanticValidator } from "./SemanticValidator";
import { ValidationResult } from "./types";
import { ChapterBuilder } from "./ChapterBuilder";

/**
 * Media file reference for tracking files to be included in package
 */
export interface MediaFile {
  filename: string;
  buffer: Buffer;
}

/**
 * Book cover structure for H5P.InteractiveBook
 */
export interface BookCover {
  coverDescription?: string;
  coverMedium?: any;
}

/**
 * Book content structure matching H5P.InteractiveBook format
 */
export interface BookContent {
  bookCover: BookCover;
  chapters: any[];
}

/**
 * ContentBuilder provides a fluent API for building H5P.InteractiveBook content
 * structures programmatically with automatic semantic validation.
 */
export class ContentBuilder {
  private bookTitle: string = "";
  private bookLanguage: string = "en";
  private chapters: any[] = [];
  private mediaFiles: MediaFile[] = [];
  private imageCounter: number = 0;
  private audioCounter: number = 0;

  /**
   * Creates a new ContentBuilder instance.
   * @param registry Library registry for fetching library metadata
   * @param validator Semantic validator for content validation
   */
  constructor(
    private registry: LibraryRegistry,
    private validator: SemanticValidator
  ) {}

  /**
   * Initializes a new book with title and language.
   * @param title Book title
   * @param language Language code (e.g., "en", "de")
   * @returns This builder for method chaining
   */
  public createBook(title: string, language: string): this {
    this.bookTitle = title;
    this.bookLanguage = language;
    this.chapters = [];
    this.mediaFiles = [];
    return this;
  }

  /**
   * Adds a new chapter to the book.
   * @param chapterTitle Title of the chapter
   * @returns ChapterBuilder for adding content to the chapter
   */
  public addChapter(chapterTitle: string): ChapterBuilder {

    const chapterBuilder = new ChapterBuilder(
      chapterTitle,
      this.chapters,
      this.mediaFiles,
      this.imageCounter,
      this.audioCounter
    );

    // Update counters when chapter is finalized
    chapterBuilder.onFinalize((imageCount, audioCount) => {
      this.imageCounter = imageCount;
      this.audioCounter = audioCount;
    });

    // Initialize the chapter structure (must be after callback is registered)
    chapterBuilder.initializeChapter();

    return chapterBuilder;
  }

  /**
   * Builds the final book content structure.
   * @returns Complete book content matching H5P.InteractiveBook format
   */
  public build(): BookContent {
    return {
      bookCover: {
        coverDescription: ""
      },
      chapters: this.chapters
    };
  }

  /**
   * Validates the book content structure against H5P.InteractiveBook semantics.
   * @returns Validation result with any errors
   */
  public validate(): ValidationResult {
    const content = this.build();

    // Get H5P.InteractiveBook semantics
    const library = this.registry["registry"].get("H5P.InteractiveBook-1.8");
    if (!library || !library.semantics) {
      return {
        valid: false,
        errors: [
          {
            fieldPath: "library",
            message: "H5P.InteractiveBook library not found in registry"
          }
        ]
      };
    }

    const schema = this.validator.parseSemantics(library.semantics);
    return this.validator.validate(content, schema);
  }

  /**
   * Gets all media files that have been added to the book.
   * @returns Array of media files with filenames and buffers
   */
  public getMediaFiles(): MediaFile[] {
    return this.mediaFiles;
  }

  /**
   * Gets the book title.
   * @returns Book title
   */
  public getTitle(): string {
    return this.bookTitle;
  }

  /**
   * Gets the book language.
   * @returns Language code
   */
  public getLanguage(): string {
    return this.bookLanguage;
  }
}
