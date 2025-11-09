import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";

/**
 * Manual accordion content with predefined panels
 */
export interface AccordionContent {
  type: "accordion";
  title?: string;
  panels: Array<{
    title: string;
    content: string;
  }>;
  hTag?: "h2" | "h3" | "h4";
}

/**
 * Handler for H5P.Accordion content type (manual panels)
 *
 * Creates collapsible accordion panels for organizing information.
 *
 * Manual usage in YAML:
 * ```yaml
 * - type: accordion
 *   title: "FAQ"
 *   panels:
 *     - title: "What is photosynthesis?"
 *       content: "Photosynthesis is the process..."
 *     - title: "Where does it occur?"
 *       content: "It occurs in the chloroplasts..."
 * ```
 */
export class AccordionHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "accordion";
  }

  /**
   * Validates accordion content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.panels || !Array.isArray(item.panels)) {
      return {
        valid: false,
        error: "Accordion requires 'panels' array. Each panel needs title and content."
      };
    }

    if (item.panels.length === 0) {
      return {
        valid: false,
        error: "Accordion must have at least one panel"
      };
    }

    // Validate each panel
    for (let i = 0; i < item.panels.length; i++) {
      const panel = item.panels[i];

      if (!panel.title) {
        return {
          valid: false,
          error: `Panel ${i + 1} missing 'title' field`
        };
      }

      if (!panel.content) {
        return {
          valid: false,
          error: `Panel ${i + 1} missing 'content' field`
        };
      }

      if (typeof panel.title !== "string") {
        return {
          valid: false,
          error: `Panel ${i + 1} 'title' must be a string`
        };
      }

      if (typeof panel.content !== "string") {
        return {
          valid: false,
          error: `Panel ${i + 1} 'content' must be a string`
        };
      }
    }

    // Validate hTag if provided
    if (item.hTag && !["h2", "h3", "h4"].includes(item.hTag)) {
      return {
        valid: false,
        error: "hTag must be one of: h2, h3, h4"
      };
    }

    return { valid: true };
  }

  /**
   * Processes accordion content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: AccordionContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding accordion: "${item.title || 'Untitled'}" (${item.panels.length} panels)`);
    }

    // Build H5P Accordion structure
    const h5pContent = {
      library: "H5P.Accordion 1.0",
      params: {
        panels: item.panels.map(panel => ({
          title: panel.title,
          content: {
            library: "H5P.AdvancedText 1.1",
            params: {
              text: `<p>${this.escapeHtml(panel.content)}</p>`
            },
            subContentId: this.generateSubContentId(),
            metadata: {
              contentType: "Text",
              license: "U",
              title: "Untitled Text"
            }
          }
        })),
        hTag: item.hTag || "h2"
      },
      metadata: {
        title: item.title || "Accordion",
        license: "U",
        contentType: "Accordion"
      },
      subContentId: this.generateSubContentId()
    };

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Accordion"];
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
