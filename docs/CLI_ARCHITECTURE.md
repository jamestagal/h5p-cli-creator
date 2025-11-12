# CLI Architecture - Important Notes for Agents

## Command Structure

### Current CLI Commands

The h5p-cli-creator has TWO command patterns:

#### 1. CSV-Based Commands (Legacy)
- `flashcards <input.csv> <output.h5p>`
- `dialogcards <input.csv> <output.h5p>`
- `interactivebook <input.csv> <output.h5p>`

**Use Case:** Simple CSV input for basic content types
**Location:** `src/modules/csv/`

#### 2. YAML-Based Command (Modern, Handler-Based)
- `interactivebook-ai <input.yaml> <output.h5p>`

**Use Case:** Advanced YAML input with AI generation and handler architecture
**Location:** `src/modules/ai/interactive-book-ai-module.ts`

### ⚠️ IMPORTANT: "interactivebook-ai" Handles ALL YAML Content

Despite its name, the `interactivebook-ai` command processes **ALL YAML-based content**, including:

- ✅ Interactive Books (compound content with chapters)
- ✅ Standalone content types (crossword, blanks, essay, quiz, etc.)
- ✅ AI-generated content (ai-crossword, ai-quiz, ai-blanks, etc.)
- ✅ Mixed content (manual + AI in same YAML)

**Why the confusing name?**
The command was initially created for Interactive Books but evolved to support the universal handler architecture. It now processes any YAML file regardless of whether the output is an Interactive Book or standalone content.

### 🎯 Recommended: Add "yaml" Command Alias

**TODO for future implementation:**
Add a `yaml` command as an alias to `interactivebook-ai` for clarity:

```typescript
// In src/index.ts
export class YamlModule implements yargs.CommandModule {
  public command = "yaml <input> <output>";
  public describe = "Creates H5P content from YAML definition (Interactive Books or standalone content types)";
  // ... delegate to InteractiveBookAIModule
}
```

This would allow:
- `node dist/index.js yaml input.yaml output.h5p` (clearer)
- `node dist/index.js interactivebook-ai input.yaml output.h5p` (backward compatible)

## Handler Architecture

### How Handlers Work

1. **Handler Registration** happens in `InteractiveBookAIModule.handler()` method
2. **All handlers** (Crossword, Blanks, Essay, Quiz, etc.) are registered in the HandlerRegistry
3. **YamlInputParser** determines which handler to use based on `type:` field in YAML
4. **Content output** can be:
   - Embedded in Interactive Book chapters
   - Standalone H5P package (if YAML has no chapters, just content items)

### Standalone vs Interactive Book

**Interactive Book YAML:**
```yaml
title: "My Book"
chapters:
  - title: "Chapter 1"
    content:
      - type: crossword
        words: [...]
```
Output: Interactive Book (.h5p) containing crossword in chapter

**Standalone YAML:**
```yaml
title: "My Crossword"
# No chapters - just standalone content
- type: crossword
  words: [...]
```
Output: Standalone Crossword (.h5p) package

### Adding New Content Type Handlers

When implementing a new handler (e.g., NewContentHandler):

1. **Create handler class:** `src/handlers/embedded/NewContentHandler.ts`
2. **Register in module:** Add to `InteractiveBookAIModule.handler()`:
   ```typescript
   handlerRegistry.register(new NewContentHandler());
   ```
3. **Add YAML validation:** Update `YamlInputParser.validateItem()` with new type
4. **Works automatically** in both Interactive Books and standalone

## Common Pitfalls for Agents

### ❌ Don't Try: `node dist/index.js yaml ...`
There is no `yaml` command (yet). Use `interactivebook-ai` instead.

### ❌ Don't Create: Separate commands for each content type
All YAML content types go through `interactivebook-ai` command using the handler registry.

### ❌ Don't Assume: "interactivebook-ai" only creates Interactive Books
It creates ANY content defined in YAML, including standalone content types.

### ✅ Do: Register handlers in InteractiveBookAIModule
All new YAML-based content type handlers must be registered in `src/modules/ai/interactive-book-ai-module.ts`

### ✅ Do: Test with actual CLI command
```bash
# Build first
npm run build

# Test with correct command
node dist/index.js interactivebook-ai ./test.yaml ./output.h5p --verbose
```

### ✅ Do: Update this document
When CLI architecture changes, update this document to help future agents.

## Future Improvements

1. **Add `yaml` command alias** - Makes the CLI more intuitive
2. **Rename `interactivebook-ai` to `compile`** - More generic name for universal YAML compiler
3. **Split into multiple commands** - `yaml-interactive-book`, `yaml-standalone`, `yaml-ai` for clarity
4. **Add `--output-type` flag** - Let users specify Interactive Book vs standalone explicitly

## Testing CLI Changes

When modifying CLI architecture:

1. **Rebuild TypeScript:** `npm run build`
2. **Test all commands:** `node dist/index.js --help`
3. **Test handler registration:** Check verbose output shows all registered handlers
4. **Test package generation:** Verify .h5p file is created
5. **Test H5P.com upload:** Ensure package works on H5P.com platform

## References

- Handler architecture: [docs/H5P_Handler_Architecture_Complete_Design.md](H5P_Handler_Architecture_Complete_Design.md)
- Handler registry: [src/handlers/HandlerRegistry.ts](../src/handlers/HandlerRegistry.ts)
- YAML parser: [src/compiler/YamlInputParser.ts](../src/compiler/YamlInputParser.ts)
- Main CLI entry: [src/index.ts](../src/index.ts)

---

**Last Updated:** 2025-11-11
**Maintained By:** Project contributors and AI agents
