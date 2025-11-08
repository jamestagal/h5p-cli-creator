import { ContentHandler } from "../handlers/ContentHandler";
import { HandlerContext } from "../handlers/HandlerContext";

/**
 * TODO: Define your content type interface
 *
 * This interface describes the structure of your content items
 * in the YAML/JSON input.
 *
 * Example:
 * export interface VideoContent {
 *   type: "video";
 *   title?: string;
 *   videoUrl: string;
 *   subtitles?: string;
 * }
 */
export interface TemplateContent {
  type: "template";  // TODO: Replace with your content type identifier
  // TODO: Add required fields
  requiredField: string;
  // TODO: Add optional fields
  optionalField?: string;
}

/**
 * TODO: Handler for H5P.YourLibrary content type
 *
 * Replace "Template" with your handler name and update the description.
 *
 * This handler processes [CONTENT_TYPE_NAME] content items and generates
 * H5P.[LIBRARY_NAME] sub-content for Interactive Books.
 *
 * Example usage in YAML:
 * ```yaml
 * - type: template
 *   requiredField: "value"
 *   optionalField: "optional value"
 * ```
 */
export class TemplateHandler implements ContentHandler {
  /**
   * Returns the unique content type identifier
   *
   * TODO: Replace "template" with your content type identifier.
   * This must match the `type` field in your content interface.
   *
   * @returns Content type string (e.g., "video", "timeline", "accordion")
   */
  public getContentType(): string {
    return "template";  // TODO: Replace with your content type
  }

  /**
   * Validates the content item structure
   *
   * TODO: Add validation logic for your required and optional fields.
   * Check for:
   * - Required fields are present
   * - Field types are correct (string, number, array, etc.)
   * - Valid value ranges (if applicable)
   * - File path existence (if applicable)
   *
   * @param item Content item to validate
   * @returns Validation result with error message if invalid
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // TODO: Add validation for required fields
    if (!item.requiredField) {
      return {
        valid: false,
        error: "Missing required field 'requiredField'. Please provide a value."
      };
    }

    // TODO: Add type checking if needed
    if (typeof item.requiredField !== "string") {
      return {
        valid: false,
        error: "Field 'requiredField' must be a string"
      };
    }

    // TODO: Add any additional validation (e.g., field length, valid URLs, etc.)

    return { valid: true };
  }

  /**
   * Processes the content item and adds it to the chapter
   *
   * TODO: Implement content processing logic.
   * Steps:
   * 1. Extract data from the item
   * 2. Build H5P content structure (see content/content.json from sample .h5p)
   * 3. Add to chapter using chapterBuilder methods
   *
   * Available chapterBuilder methods:
   * - addTextPage(title, text) - For simple text
   * - addImagePage(title, path, alt) - For images
   * - addAudioPage(title, path) - For audio
   * - addQuizPage(quizContent) - For quizzes
   * - addCustomContent(h5pContent) - For complex H5P structures
   *
   * @param context Handler execution context with utilities
   * @param item Content item to process
   */
  public async process(context: HandlerContext, item: TemplateContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    // TODO: Add verbose logging if enabled
    if (options.verbose) {
      logger.log(`    - Adding template content: "${item.requiredField}"`);
    }

    // TODO: Build H5P content structure
    // Reference: Study content/content.json from a sample .h5p file to understand the structure
    const h5pContent = {
      library: "H5P.YourLibrary 1.0",  // TODO: Replace with actual library name and version
      params: {
        // TODO: Map your content fields to H5P structure
        // Example:
        // text: item.requiredField,
        // options: {
        //   setting1: true,
        //   setting2: item.optionalField || "default"
        // }
      },
      metadata: {
        title: item.requiredField  // TODO: Use appropriate title field
      },
      subContentId: this.generateSubContentId()
    };

    // TODO: Choose appropriate chapterBuilder method
    // For complex H5P types, use addCustomContent():
    chapterBuilder.addCustomContent(h5pContent);

    // For simple text, use addTextPage():
    // chapterBuilder.addTextPage(item.title || "", item.requiredField);

    // For images, use addImagePage():
    // chapterBuilder.addImagePage(item.title || "", item.imagePath, item.alt);
  }

  /**
   * Returns the list of H5P libraries required by this handler
   *
   * TODO: Replace with your H5P library name(s).
   * The compiler uses this to:
   * 1. Fetch libraries from the H5P Hub
   * 2. Resolve dependencies automatically
   * 3. Bundle libraries into the .h5p package
   *
   * Library name format: "H5P.LibraryName" (without version)
   * Example: ["H5P.Video", "H5P.Audio"]
   *
   * @returns Array of H5P library identifiers
   */
  public getRequiredLibraries(): string[] {
    return [
      "H5P.YourLibrary"  // TODO: Replace with actual H5P library name
    ];
  }

  /**
   * Generates a unique sub-content ID for H5P content
   * @private
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * TODO: Testing Your Handler
 *
 * Create a test file at: tests/handlers/your-category/TemplateHandler.test.ts
 *
 * Test checklist:
 * - [ ] getContentType() returns correct identifier
 * - [ ] validate() accepts valid content
 * - [ ] validate() rejects missing required fields
 * - [ ] validate() rejects invalid field types
 * - [ ] process() calls chapterBuilder methods correctly
 * - [ ] process() logs when verbose is enabled
 * - [ ] getRequiredLibraries() returns correct libraries
 *
 * Example test:
 * ```typescript
 * describe("TemplateHandler", () => {
 *   let handler: TemplateHandler;
 *   let mockContext: HandlerContext;
 *
 *   beforeEach(() => {
 *     handler = new TemplateHandler();
 *     mockContext = createMockContext();
 *   });
 *
 *   test("should validate valid content", () => {
 *     const item = { type: "template", requiredField: "value" };
 *     expect(handler.validate(item).valid).toBe(true);
 *   });
 * });
 * ```
 */

/**
 * TODO: Register Your Handler
 *
 * Add to src/modules/ai/interactive-book-ai-module.ts:
 *
 * ```typescript
 * import { TemplateHandler } from "../../handlers/your-category/TemplateHandler";
 *
 * // In runInteractiveBookAI method:
 * handlerRegistry.register(new TemplateHandler());
 * ```
 */

/**
 * TODO: Update TypeScript Types
 *
 * Add to src/compiler/YamlInputParser.ts:
 *
 * 1. Add to ContentType union:
 *    export type ContentType = "text" | "image" | "template" | ...;
 *
 * 2. Export your interface:
 *    export { TemplateContent } from "../handlers/your-category/TemplateHandler";
 *
 * 3. Add to AnyContentItem union:
 *    export type AnyContentItem = TextContent | ImageContent | TemplateContent | ...;
 */

/**
 * TODO: Documentation
 *
 * 1. Update README.md:
 *    - Add to "Supported Content Types" table
 *    - Add example YAML showing usage
 *
 * 2. Create example YAML file in examples/:
 *    examples/template-example.yaml
 *
 * 3. Update docs/Handler_Development_Guide.md:
 *    - Add your handler as an example (optional)
 */

/**
 * TODO: Manual Testing
 *
 * 1. Build the project:
 *    npm run build
 *
 * 2. Create a test YAML file:
 *    ```yaml
 *    title: "Test Template Handler"
 *    language: "en"
 *    chapters:
 *      - title: "Chapter 1"
 *        content:
 *          - type: template
 *            requiredField: "test value"
 *    ```
 *
 * 3. Generate .h5p package:
 *    node ./dist/index.js interactivebook-ai ./test.yaml ./output.h5p --verbose
 *
 * 4. Upload to h5p.com or your H5P platform to verify
 *
 * 5. Check:
 *    - [ ] Package uploads successfully
 *    - [ ] Content displays correctly
 *    - [ ] Interactive elements work as expected
 *    - [ ] No console errors
 */
