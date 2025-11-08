import { ContentHandler } from "./ContentHandler";
import { BookDefinition } from "../compiler/YamlInputParser";

/**
 * HandlerRegistry manages registration and retrieval of content handlers.
 * Implements singleton pattern for global access throughout the application.
 * Used to dynamically resolve handlers based on content type during compilation.
 */
export class HandlerRegistry {
  private static instance: HandlerRegistry;
  private handlers: Map<string, ContentHandler> = new Map();

  /**
   * Private constructor enforces singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance of HandlerRegistry
   * @returns The global HandlerRegistry instance
   */
  public static getInstance(): HandlerRegistry {
    if (!HandlerRegistry.instance) {
      HandlerRegistry.instance = new HandlerRegistry();
    }
    return HandlerRegistry.instance;
  }

  /**
   * Register a content handler with the registry.
   * Throws error if handler type is already registered.
   * @param handler ContentHandler implementation to register
   * @throws Error if handler type already registered
   */
  public register(handler: ContentHandler): void {
    const type = handler.getContentType();
    if (this.handlers.has(type)) {
      throw new Error(`Handler for type '${type}' already registered`);
    }
    this.handlers.set(type, handler);
  }

  /**
   * Retrieve a handler by content type.
   * @param contentType Content type identifier (e.g., "text", "image")
   * @returns ContentHandler if found, undefined otherwise
   */
  public getHandler(contentType: string): ContentHandler | undefined {
    return this.handlers.get(contentType);
  }

  /**
   * Get all registered handlers.
   * @returns Array of all registered ContentHandler instances
   */
  public getAllHandlers(): ContentHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Scan a BookDefinition and collect all required H5P libraries.
   * Iterates through all chapters and content items, collecting libraries
   * from each handler. Always includes base H5P.InteractiveBook library.
   * @param bookDef BookDefinition to scan for library requirements
   * @returns Array of unique library identifiers
   */
  public getRequiredLibrariesForBook(bookDef: BookDefinition): string[] {
    const libraries = new Set<string>();

    // Always include base Interactive Book library
    libraries.add("H5P.InteractiveBook");

    // Scan all content items and collect libraries
    for (const chapter of bookDef.chapters) {
      for (const item of chapter.content) {
        const handler = this.getHandler(item.type);
        if (handler) {
          handler.getRequiredLibraries().forEach(lib => libraries.add(lib));
        }
      }
    }

    return Array.from(libraries);
  }
}
