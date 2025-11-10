# Specification: TrueFalse Handler Implementation

## Goal

Implement manual and AI-powered handlers for H5P.TrueFalse content type, following the standalone-first handler architecture. Enable teachers to create simple true/false questions either manually or via AI generation, with proper boolean-to-string conversion for H5P compatibility.

## User Stories

- As a teacher, I want to create manual true/false questions in YAML so that I can quickly add simple assessment questions to my Interactive Books
- As a teacher, I want to generate true/false questions using AI so that I can create diverse assessment content without manually writing each question

## Specific Requirements

**Handler Implementation Structure**
- Create `TrueFalseHandler.ts` in `src/handlers/embedded/` for manual true/false questions
- Create `AITrueFalseHandler.ts` in `src/handlers/ai/` for AI-generated true/false questions
- Both handlers must implement the `ContentHandler` interface with `getContentType()`, `validate()`, `process()`, and `getRequiredLibraries()` methods
- Follow exact patterns from AccordionHandler and AIAccordionHandler for consistency
- Support both "truefalse" and "true-false" type aliases for flexibility

**Content Type Interfaces**
- Define `TrueFalseContent` interface with fields: type, title (optional), question (required string), correct (required boolean), media (optional object), behaviour (optional object), labels (optional object)
- Define `AITrueFalseContent` interface with fields: type, title (optional), prompt (required string), questionCount (optional number, default 5), difficulty (optional enum), aiConfig (optional Universal AI Configuration)
- Export interfaces from handler files for use in YamlInputParser type unions
- Ensure interfaces match H5P.TrueFalse-1.8 semantic structure requirements

**Boolean-to-String Conversion (CRITICAL)**
- TrueFalseHandler must convert boolean `correct` field to string "true" or "false" for H5P structure
- Use explicit conversion: `correct: item.correct ? "true" : "false"`
- AITrueFalseHandler must also convert AI-generated boolean values to strings
- Add unit tests specifically validating this conversion behavior

**Question Text HTML Formatting**
- Wrap question text in `<p>` tags for H5P AdvancedText compatibility
- Escape HTML special characters using shared `escapeHtml()` method
- For AI-generated content, strip any HTML from AI responses before processing
- Use pattern: `question: "<p>${this.escapeHtml(item.question)}</p>"`

**Default Behaviour Configuration**
- Provide sensible defaults: enableRetry (true), enableSolutionsButton (true), enableCheckButton (true), confirmCheckDialog (false), confirmRetryDialog (false), autoCheck (false)
- Allow users to override defaults via optional `behaviour` object
- Include optional custom feedback: feedbackOnCorrect and feedbackOnWrong
- Map user-provided behaviour to H5P behaviour structure correctly

**Default Labels and Localization**
- Provide complete default labels: trueText ("True"), falseText ("False"), checkAnswer ("Check"), showSolutionButton ("Show solution"), tryAgain ("Retry"), wrongAnswerMessage ("Wrong answer"), correctAnswerMessage ("Correct answer")
- Include accessibility labels: a11yCheck, a11yShowSolution, a11yRetry with descriptive text
- Include confirmation dialog defaults for header, body, cancelLabel, confirmLabel
- Allow users to override any label via optional `labels` object

**Media Support**
- Support optional media object with fields: path (required), type (optional: "image" | "video" | "audio"), alt (optional for images), disableZooming (optional boolean for images)
- Resolve media file paths relative to YAML file using context.basePath
- Generate proper H5P.Image, H5P.Video, or H5P.Audio sub-content structures
- Include disableImageZooming parameter only for image media types

**AI Integration with AIPromptBuilder**
- Use `AIPromptBuilder.resolveConfig()` to merge aiConfig from item, chapter, and book levels
- Use `AIPromptBuilder.buildSystemPrompt()` to generate formatted system prompts with reading level and tone
- Build user prompts that request JSON array of question objects with "question" (string) and "correct" (boolean) fields
- Include difficulty parameter instructions: "easy" (simple, obvious statements), "medium" (moderate complexity), "hard" (complex, subtle distinctions)
- Use `quizGenerator.generateRawContent()` for AI calls with proper error handling

**AI Response Processing and Fallback**
- Strip markdown code blocks from AI responses: `replace(/^```json\n?/, "").replace(/\n?```$/, "")`
- Parse JSON array and validate structure (must have question and correct fields)
- Strip HTML tags from AI-generated question text before processing
- Provide fallback behavior on AI failure: create single true/false question with error message text
- Log AI failures clearly with verbose mode support

**Validation Requirements**
- TrueFalseHandler: validate question (required string), correct (required boolean), media.path (string if media provided), media.type (valid enum if provided), behaviour fields (boolean types), feedback strings (max 2048 chars)
- AITrueFalseHandler: validate prompt (required string), questionCount (positive integer if provided), difficulty (valid enum if provided: "easy" | "medium" | "hard")
- Return validation objects with `{ valid: boolean; error?: string }` structure
- Provide clear, actionable error messages for all validation failures

**Type System Integration**
- Add "truefalse", "true-false", "ai-truefalse", "ai-true-false" to ContentType union in YamlInputParser
- Add TrueFalseContent and AITrueFalseContent to AnyContentItem union using import() syntax
- Add validation cases in YamlInputParser.validateContentItem() for both manual and AI types
- Export interfaces from handlers for external use

**Handler Registration**
- Register TrueFalseHandler in `src/modules/ai/interactive-book-ai-module.ts` after SingleChoiceSetHandler
- Register AITrueFalseHandler after AISingleChoiceSetHandler
- Maintain registration order for consistency with other handlers
- Ensure handlers are registered before ChapterBuilder processes content

**Required Libraries Declaration**
- Both handlers must return `["H5P.TrueFalse"]` from `getRequiredLibraries()` method
- LibraryRegistry will automatically resolve dependencies: H5P.Question, H5P.JoubelUI, H5P.FontIcons, FontAwesome
- Follow exact pattern from Accordion handlers for library declaration

**Sub-Content ID Generation**
- Use shared pattern for generating unique sub-content IDs: `${Date.now()}-${Math.random().toString(36).substring(7)}`
- Generate unique IDs for TrueFalse content itself and any nested media content
- Ensure IDs are unique within the H5P package structure

## Existing Code to Leverage

**AccordionHandler Pattern**
- Use AccordionHandler.ts as template for TrueFalseHandler structure and validation logic
- Replicate escapeHtml() and generateSubContentId() helper methods exactly
- Follow validation pattern with clear error messages for each field
- Use same ChapterBuilder integration via chapterBuilder.addCustomContent()
- Copy verbose logging pattern for consistent user feedback

**AIAccordionHandler AI Integration**
- Use AIAccordionHandler.ts as template for AI prompt building and response parsing
- Replicate AIPromptBuilder.resolveConfig() and buildSystemPrompt() usage pattern
- Copy JSON response parsing with markdown strip and validation
- Use same fallback pattern when AI generation fails (getFallbackPanels equivalent)
- Follow error handling with try-catch and verbose logging

**Handler Registration Pattern**
- Follow exact registration pattern from interactive-book-ai-module.ts
- Import handlers at top of file with other handler imports
- Register in correct order relative to other question-type handlers
- Maintain consistent naming conventions for handler instances

**ContentHandler Interface Compliance**
- Implement all four required methods from ContentHandler interface
- Use HandlerContext parameter destructuring: `{ chapterBuilder, logger, options, quizGenerator }`
- Return proper types from each method (string, Promise<void>, validation object, string array)
- Follow async/await patterns for process() method

**ChapterBuilder Integration**
- Use chapterBuilder.addCustomContent() to add H5P content structures
- Build complete H5P content objects with library, params, metadata, subContentId
- Follow exact structure from existing handlers for consistency
- Ensure metadata includes title, license, contentType fields

## Out of Scope

- Support for multiple questions in a single TrueFalse content item (use multiple items instead)
- Advanced question features like hints, explanations, or scored feedback levels
- Custom styling or theming for TrueFalse UI elements
- Support for image-based true/false questions where the media IS the question (media is supplementary only)
- Standalone TrueFalse handler for generating .h5p packages (Interactive Book embedding only)
- CSV-based input format (YAML/JSON only per architecture decision)
- Migration of legacy true/false question formats from other systems
- Custom feedback templates or conditional feedback based on score
- Timer or time-limit features for true/false questions
- Randomization of true/false answer positions

## Bugs to Avoid

Based on lessons learned from DragText and SingleChoiceSet handler implementations, avoid these common pitfalls:

### 1. **Boolean-to-String Conversion (CRITICAL FOR TRUEFALSE)**

**Problem**: H5P.TrueFalse requires the `correct` field to be a STRING `"true"` or `"false"`, NOT a boolean. Failing to convert will cause silent failures or incorrect behavior.

**Example**:
```typescript
// ❌ WRONG - Boolean value
params: {
  correct: item.correct  // JavaScript boolean true/false
}

// ✅ CORRECT - String value
params: {
  correct: item.correct ? "true" : "false"  // String "true" or "false"
}
```

**Action for TrueFalse Handler**:
- Apply conversion in BOTH `TrueFalseHandler` (manual content) and `AITrueFalseHandler` (AI-generated content)
- Add specific unit test: "Test process() converts boolean to string for correct field"
- This is the **most critical** bug to avoid for TrueFalse

---

### 2. **External Media URLs in Examples**

**Problem**: Using external URLs (like `via.placeholder.com`) in example YAML files causes network errors during package generation.

**Example from DragText**:
```yaml
# ❌ WRONG - External URL
- type: truefalse
  question: "The Earth is round"
  correct: true
  media:
    path: https://via.placeholder.com/600x400.png

# ✅ CORRECT - Local test file
- type: truefalse
  question: "The Earth is round"
  correct: true
  media:
    path: ../../tests/images/test-image.jpg
```

**Action for TrueFalse Handler**:
- Use **only local test files** in `truefalse-example.yaml`
- Available test files: `tests/images/test-image.jpg`, `tests/audios/test-audio.mp3`
- Document media path format relative to YAML file location

---

### 3. **HTML Stripping from AI Responses**

**Problem**: AI responses may include unwanted HTML tags (`<p>`, `<br>`, etc.) that need to be stripped before wrapping in our own `<p>` tags.

**Action for TrueFalse Handler**:
```typescript
// ✅ Include HTML stripping utility in AITrueFalseHandler
private stripHtml(text: string): string {
  return text
    .replace(/<\/?p>/gi, "")      // Remove <p> and </p>
    .replace(/<br\s*\/?>/gi, " ")  // Replace <br> with space
    .replace(/<[^>]+>/g, "")       // Remove all other HTML tags
    .trim();
}

// Apply to AI-generated content
const cleanQuestion = this.stripHtml(aiResponse.question);
const wrappedQuestion = `<p>${this.escapeHtml(cleanQuestion)}</p>`;
```

---

### 4. **Missing Type Aliases in Registration**

**Problem**: Forgetting to register type aliases means users can't use alternative type names (e.g., `"true-false"` vs `"truefalse"`).

**Action for TrueFalse Handler**:
```typescript
// ✅ Register with aliases in interactive-book-ai-module.ts
handlerRegistry.register(new TrueFalseHandler(), ["true-false"]);
handlerRegistry.register(new AITrueFalseHandler(), ["ai-true-false"]);
```

Test both type identifiers work in YAML:
```yaml
- type: truefalse       # Primary identifier
- type: true-false      # Alias
- type: ai-truefalse    # Primary AI identifier
- type: ai-true-false   # Alias
```

---

### 5. **SubContentId Generation Inconsistency**

**Problem**: Forgetting to generate unique `subContentId` for each content item can cause H5P rendering issues.

**Action for TrueFalse Handler**:
```typescript
// ✅ Always include in H5P structure
private generateSubContentId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

const h5pContent = {
  library: "H5P.TrueFalse 1.8",
  params: { /* ... */ },
  metadata: { /* ... */ },
  subContentId: this.generateSubContentId()  // ← Don't forget!
};

// Also generate for media if present
if (mediaContent) {
  mediaContent.subContentId = this.generateSubContentId();
}
```

---

### 6. **AI JSON Response Format Assumptions**

**Problem**: Assuming AI will always return clean JSON without markdown code fences or extra whitespace causes parsing errors.

**Action for TrueFalse Handler**:
```typescript
// ✅ Clean AI response before parsing
const cleaned = response.trim()
  .replace(/^```json\n?/, "")   // Remove opening fence
  .replace(/\n?```$/, "")       // Remove closing fence
  .trim();

const data = JSON.parse(cleaned);

// Validate structure
if (!Array.isArray(data)) {
  throw new Error("AI response must be an array of questions");
}

for (const q of data) {
  if (!q.question || typeof q.correct !== "boolean") {
    throw new Error("Each question must have 'question' (string) and 'correct' (boolean)");
  }
}
```

---

### 7. **Verbose Logging with Sensitive Info**

**Problem**: Logging full prompts or AI responses in verbose mode can expose sensitive content or clutter logs.

**Action for TrueFalse Handler**:
```typescript
// ✅ Log concise summaries, not full content
if (options.verbose) {
  logger.log(`    - Generating AI true/false questions: "${item.title || 'Untitled'}"`);
  logger.log(`      Prompt: "${item.prompt.substring(0, 60)}..."`);
  logger.log(`      Question count: ${questionCount}`);
  logger.log(`      Difficulty: ${difficulty}`);
}

// After AI generation
if (options.verbose) {
  logger.log(`      ✓ Generated ${questions.length} true/false questions`);
  const sample = questions[0].question.substring(0, 50);
  logger.log(`      Sample: "${sample}..."`);
}
```

---

### 8. **Fallback Content Quality**

**Problem**: Providing unhelpful fallback content when AI generation fails (like just "Error") leaves users confused.

**Action for TrueFalse Handler**:
```typescript
// ✅ Provide informative fallback
private getFallbackQuestion(prompt: string): { question: string; correct: string } {
  return {
    question: `AI generation failed for prompt: "${prompt.substring(0, 40)}...". Please check your API key and try again.`,
    correct: "true"  // Note: already a string for fallback
  };
}
```

---

### 9. **Media Type Detection and Structure**

**Problem**: Not properly detecting media type from file extension or forgetting to include type-specific fields (like `disableImageZooming` only for images).

**Action for TrueFalse Handler**:
```typescript
// ✅ Proper media type handling
if (item.media) {
  const mediaType = item.media.type || this.detectMediaType(item.media.path);

  if (mediaType === "image") {
    const imageContent = {
      library: "H5P.Image 1.1",
      params: {
        file: { path: item.media.path, mime: "image/jpeg", copyright: {} },
        alt: item.media.alt || "",
        decorative: false
      },
      subContentId: this.generateSubContentId()
    };

    // Only add disableImageZooming for images
    if (item.media.disableZooming !== undefined) {
      imageContent.params.file.disableImageZooming = item.media.disableZooming;
    }

    h5pParams.media = { type: { library: "H5P.Image 1.1", params: imageContent.params } };
  }
  // Handle video and audio similarly...
}

private detectMediaType(path: string): "image" | "video" | "audio" {
  const ext = path.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return "image";
  if (['mp4', 'webm', 'ogg'].includes(ext)) return "video";
  if (['mp3', 'wav', 'm4a'].includes(ext)) return "audio";
  return "image"; // default
}
```

---

### 10. **Validation Error Message Quality**

**Problem**: Generic validation error messages make debugging difficult for content authors.

**Action for TrueFalse Handler**:
```typescript
// ❌ WRONG - Generic error
if (!item.question) {
  return { valid: false, error: "Missing required field" };
}

// ✅ CORRECT - Specific, actionable error
if (!item.question) {
  return {
    valid: false,
    error: "TrueFalse requires 'question' field. Please provide a question text string."
  };
}

if (typeof item.correct !== "boolean") {
  return {
    valid: false,
    error: "TrueFalse 'correct' field must be a boolean (true or false). Received: " + typeof item.correct
  };
}

if (item.media && !item.media.path) {
  return {
    valid: false,
    error: "TrueFalse media object requires 'path' field. Please provide a file path."
  };
}
```

---

### Summary Checklist for TrueFalse Handler Implementation

Before considering the handler complete, verify:

- [ ] **Boolean-to-string conversion** applied in BOTH handlers (CRITICAL)
- [ ] Unit test specifically validates boolean→string conversion
- [ ] Example YAML files use **only local test files** for media (no external URLs)
- [ ] HTML stripping applied to all AI-generated question text
- [ ] Type aliases registered in HandlerRegistry (`"true-false"`, `"ai-true-false"`)
- [ ] SubContentId generated for every H5P content item (including media)
- [ ] AI response cleaning handles markdown code fences and whitespace
- [ ] Verbose logging shows summaries, not full sensitive content
- [ ] Fallback content provides helpful error messages
- [ ] Media type detection works correctly with proper field inclusion
- [ ] Validation error messages are specific and actionable
- [ ] Test package generated successfully and validated on H5P.com
