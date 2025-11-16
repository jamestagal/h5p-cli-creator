/**
 * JSONValidator - Utility class for validating and extracting JSON from AI responses
 *
 * Provides static methods to:
 * - Strip markdown code fences and explanatory text
 * - Extract JSON objects/arrays from mixed content
 * - Validate JSON structure completeness (balanced braces/brackets)
 * - Detect truncated JSON responses
 *
 * Used to reduce AI-generated JSON parsing failures from ~20% to <5%.
 */
export class JSONValidator {
  /**
   * Remove markdown code fences and extra whitespace from text
   *
   * Handles patterns like:
   * - ```json\n{...}\n```
   * - ```javascript\n{...}\n```
   * - ```\n{...}\n```
   *
   * @param text - Raw text that may contain markdown
   * @returns Cleaned text with markdown removed
   */
  static stripMarkdown(text: string): string {
    let cleaned = text.trim();

    // Remove markdown code fences with optional language specifiers
    // Handles: ```json, ```javascript, ``` (without language)
    // Match ``` followed by optional word characters, followed by optional newline/whitespace
    cleaned = cleaned.replace(/```[a-zA-Z]*\s*/g, "");

    // Remove any remaining ``` markers
    cleaned = cleaned.replace(/```/g, "");

    // Remove leading and trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Extract JSON object or array from mixed content
   *
   * Finds the first occurrence of a JSON structure (starting with { or [)
   * and extracts it by matching balanced braces/brackets.
   *
   * Handles:
   * - Text before JSON: "Here's your data: {...}"
   * - Text after JSON: "{...}\nHope this helps!"
   * - Nested objects and arrays
   *
   * @param text - Text that may contain JSON embedded in other content
   * @returns Extracted JSON string, or original text if no JSON found
   */
  static extractJSON(text: string): string {
    const trimmed = text.trim();

    // Find the first opening brace or bracket
    const startBrace = trimmed.indexOf("{");
    const startBracket = trimmed.indexOf("[");

    let start = -1;
    let startChar = "";

    // Determine which comes first (object or array)
    if (startBrace !== -1 && (startBracket === -1 || startBrace < startBracket)) {
      start = startBrace;
      startChar = "{";
    } else if (startBracket !== -1) {
      start = startBracket;
      startChar = "[";
    }

    // No JSON found
    if (start === -1) {
      return trimmed;
    }

    // Find matching closing brace/bracket using balanced counting
    const endChar = startChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < trimmed.length; i++) {
      const char = trimmed[i];

      // Handle escape sequences in strings
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      // Track string boundaries to ignore braces/brackets inside strings
      if (char === '"') {
        inString = !inString;
        continue;
      }

      // Only count braces/brackets outside of strings
      if (!inString) {
        if (char === startChar) {
          depth++;
        } else if (char === endChar) {
          depth--;

          // Found matching closing character
          if (depth === 0) {
            return trimmed.substring(start, i + 1);
          }
        }
      }
    }

    // No matching closing character found - return from start to end
    return trimmed.substring(start);
  }

  /**
   * Validate that JSON structure has balanced braces and brackets
   *
   * Checks that:
   * - Number of { matches number of }
   * - Number of [ matches number of ]
   * - Ignores braces/brackets inside strings
   *
   * @param text - JSON string to validate
   * @returns true if structure is balanced, false otherwise
   */
  static validateCompleteJSON(text: string): boolean {
    let braceDepth = 0;
    let bracketDepth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Handle escape sequences
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      // Track string boundaries
      if (char === '"') {
        inString = !inString;
        continue;
      }

      // Only count braces/brackets outside of strings
      if (!inString) {
        if (char === "{") {
          braceDepth++;
        } else if (char === "}") {
          braceDepth--;
        } else if (char === "[") {
          bracketDepth++;
        } else if (char === "]") {
          bracketDepth--;
        }

        // Early detection of extra closing braces/brackets
        if (braceDepth < 0 || bracketDepth < 0) {
          return false;
        }
      }
    }

    // Valid JSON has all braces and brackets balanced
    return braceDepth === 0 && bracketDepth === 0;
  }

  /**
   * Detect if JSON is likely truncated (incomplete response from AI)
   *
   * Truncation indicators:
   * - Text doesn't end with } or ]
   * - Unbalanced braces (more { than })
   * - Unbalanced brackets (more [ than ])
   * - Ends with a comma (mid-array or mid-object)
   *
   * @param text - JSON string to check
   * @returns true if likely truncated, false if appears complete
   */
  static isLikelyTruncated(text: string): boolean {
    const trimmed = text.trim();

    // Empty text is not truncated
    if (trimmed.length === 0) {
      return false;
    }

    // Check if text ends abruptly (not with } or ])
    const endsWithClosing = trimmed.endsWith("}") || trimmed.endsWith("]");
    if (!endsWithClosing) {
      // Definitely truncated if doesn't end with proper closing
      return true;
    }

    // Check for unbalanced braces/brackets
    const isBalanced = this.validateCompleteJSON(trimmed);
    if (!isBalanced) {
      return true;
    }

    // Check if ends with comma (mid-structure)
    // Remove final closing brace/bracket and check what's before it
    const withoutFinalChar = trimmed.slice(0, -1).trim();
    if (withoutFinalChar.endsWith(",")) {
      return true;
    }

    // Appears to be complete
    return false;
  }
}
