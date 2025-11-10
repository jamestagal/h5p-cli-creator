# Specification: Essay Handler Implementation

## Goal

Implement manual and AI-powered handlers for H5P.Essay content type, following the standalone-first handler architecture. Enable teachers to create essay questions with keyword-based automatic scoring either manually or via AI generation, supporting keyword alternatives, per-keyword feedback, and sample solutions.

## User Stories

- As a teacher, I want to create manual essay questions in YAML with keywords and scoring criteria so that I can assess student written responses automatically
- As a teacher, I want to generate essay questions using AI so that I can quickly create assessment content with relevant keywords and sample solutions
- As a teacher, I want AI to suggest keyword alternatives (synonyms) so that scoring is fair and comprehensive
- As a teacher, I want to configure minimum/maximum essay lengths so that students meet specific writing requirements
- As a teacher, I want to provide sample solutions with explanations so that students can learn from examples after submission

## Specific Requirements

**Handler Implementation Structure**
- Create `EssayHandler.ts` in `src/handlers/embedded/` for manual essay questions
- Create `AIEssayHandler.ts` in `src/handlers/ai/` for AI-generated essay questions
- Both handlers must implement the `ContentHandler` interface with `getContentType()`, `validate()`, `process()`, and `getRequiredLibraries()` methods
- Follow exact patterns from AccordionHandler and AIAccordionHandler for consistency
- Support both "essay" and "ai-essay" type identifiers

**Content Type Interfaces**
- Define `EssayContent` interface with fields: type, title (optional), taskDescription (required string), placeholderText (optional string), keywords (required array), solution (optional object), media (optional object), behaviour (optional object), overallFeedback (optional array), labels (optional object)
- Define `AIEssayContent` interface with fields: type, title (optional), prompt (required string), keywordCount (optional number, default 5), includeAlternatives (optional boolean, default true), includeSampleSolution (optional boolean, default true), difficulty (optional enum), minimumLength (optional number), maximumLength (optional number), aiConfig (optional Universal AI Configuration)
- Export interfaces from handler files for use in YamlInputParser type unions
- Ensure interfaces match H5P.Essay-1.5 semantic structure requirements

**Keyword Array Processing and Validation**
- Each keyword object must have `keyword` field (required string, supports `*` wildcard and `/regex/` format)
- Support optional `alternatives` field (array of strings for synonyms/variations)
- Support optional `points` field (number, default 1)
- Support optional `occurrences` field (number, default 1 - how many times to award points)
- Support optional `caseSensitive` field (boolean, default true)
- Support optional `forgiveMistakes` field (boolean, default false - allow minor spelling errors)
- Support optional `feedbackIncluded` field (string, feedback when keyword found)
- Support optional `feedbackMissed` field (string, feedback when keyword missing)
- Preserve wildcard `*` characters without escaping (part of H5P.Essay keyword matching syntax)
- Preserve `/pattern/` format for regex keywords without modification

**Task Description HTML Formatting**
- Wrap taskDescription in proper HTML tags for H5P AdvancedText compatibility
- Escape HTML special characters using shared `escapeHtml()` method
- For AI-generated content, strip any HTML from AI responses before processing
- Support multi-line task descriptions with proper paragraph formatting

**Default Behaviour Configuration**
- Provide sensible defaults: enableRetry (true), inputFieldSize ("10" - string type, 10 lines), ignoreScoring (false), percentagePassing (50), percentageMastering (100)
- Support optional minimumLength (non-negative integer for minimum characters required)
- Support optional maximumLength (non-negative integer for maximum characters allowed)
- Validate that maximumLength > minimumLength if both provided
- Allow users to override defaults via optional `behaviour` object

**Default Labels and Localization**
- Provide complete default labels: checkAnswer ("Check"), submitAnswer ("Submit"), tryAgain ("Retry"), showSolution ("Show solution"), feedbackHeader ("Feedback"), solutionTitle ("Sample solution")
- Include accessibility labels with descriptive text
- Allow users to override any label via optional `labels` object

**Sample Solution Support**
- Support optional `solution` object with `introduction` (HTML string) and `sample` (HTML string)
- Introduction provides context for the sample solution
- Sample contains an example answer demonstrating expected content
- Escape HTML in user-provided solutions

**Media Support**
- Support optional media object with fields: path (required), type (optional: "image" | "video" | "audio"), alt (optional for images), disableZooming (optional boolean for images)
- Resolve media file paths relative to YAML file using context.basePath
- Generate proper H5P.Image, H5P.Video, or H5P.Audio sub-content structures
- Include disableImageZooming parameter only for image media types

**Overall Feedback Ranges**
- Support optional overallFeedback array with objects containing: from (number 0-100), to (number 0-100), feedback (string)
- Provide default feedback if not specified: ranges covering 0-100% with generic messages
- Validate that feedback ranges cover full spectrum appropriately

**AI Integration with AIPromptBuilder**
- Use `AIPromptBuilder.resolveConfig()` to merge aiConfig from item, chapter, and book levels
- Use `AIPromptBuilder.buildSystemPrompt()` to generate formatted system prompts with reading level and tone
- Build user prompts that request JSON object with taskDescription, placeholderText, keywords array (with alternatives), and solution
- Include difficulty parameter instructions: "easy" (3-5 keywords, 50-200 chars, simple vocabulary), "medium" (5-7 keywords, 100-500 chars, moderate vocabulary), "hard" (7-10 keywords, 200-1000 chars, advanced vocabulary)
- Use `quizGenerator.generateRawContent()` for AI calls with proper error handling

**AI Response Structure and Processing**
- Request AI to return JSON with structure: `{taskDescription, placeholderText, keywords: [{keyword, alternatives?, points?, feedbackIncluded?, feedbackMissed?}], solution: {introduction, sample}}`
- Strip markdown code blocks from AI responses: `replace(/^```json\n?/, "").replace(/\n?```$/, "")`
- Parse JSON and validate structure (must have taskDescription and keywords array)
- Strip HTML tags from AI-generated text content before processing
- Provide fallback behavior on AI failure: create single-keyword essay with error message text
- Log AI failures clearly with verbose mode support

**Difficulty Level Implementation**
- Easy difficulty: 3-5 keywords, 50-200 chars minimum/maximum, simple vocabulary, common terms, basic sentence structure
- Medium difficulty: 5-7 keywords, 100-500 chars, moderate vocabulary, subject-specific terms, analytical thinking required
- Hard difficulty: 7-10 keywords, 200-1000 chars, advanced vocabulary, technical terms, complex analysis required
- Pass difficulty and character limits to AI prompt to guide content generation
- Default to medium difficulty if not specified

**Validation Requirements**
- EssayHandler: validate taskDescription (required string, max 10000 chars), keywords (required array, min 1 keyword), each keyword.keyword (required string), each keyword.alternatives (array of strings if provided), each keyword.points (positive number if provided), each keyword.occurrences (positive integer if provided), each keyword.feedbackIncluded (string max 1000 chars if provided), each keyword.feedbackMissed (string max 1000 chars if provided), media.path (required string if media provided), behaviour.minimumLength (non-negative integer if provided), behaviour.maximumLength (non-negative integer if provided, must be > minimumLength), behaviour.percentagePassing (0-100 if provided), behaviour.percentageMastering (0-100 if provided)
- AIEssayHandler: validate prompt (required string, min 10 chars), keywordCount (positive integer 1-20 if provided), difficulty (enum: "easy" | "medium" | "hard" if provided), minimumLength (non-negative integer if provided), maximumLength (non-negative integer if provided, must be > minimumLength)
- Return validation objects with `{ valid: boolean; error?: string }` structure
- Provide clear, actionable error messages for all validation failures

**Type System Integration**
- Add "essay", "ai-essay" to ContentType union in YamlInputParser
- Add EssayContent and AIEssayContent to AnyContentItem union using import() syntax
- Add validation cases in YamlInputParser.validateContentItem() for both manual and AI types
- Export interfaces from handlers for external use

**Handler Registration**
- Register EssayHandler in `src/modules/ai/interactive-book-ai-module.ts` after other question handlers
- Register AIEssayHandler after other AI question handlers
- Maintain registration order for consistency with other handlers
- Ensure handlers are registered before ChapterBuilder processes content

**Required Libraries Declaration**
- Both handlers must return `["H5P.Essay"]` from `getRequiredLibraries()` method
- LibraryRegistry will automatically resolve dependencies: H5P.Question, H5P.JoubelUI, H5P.TextUtilities, H5P.FontIcons, FontAwesome, H5P.Transition
- Follow exact pattern from Accordion handlers for library declaration

**Sub-Content ID Generation**
- Use shared pattern for generating unique sub-content IDs: `${Date.now()}-${Math.random().toString(36).substring(7)}`
- Generate unique IDs for Essay content itself and any nested media content
- Ensure IDs are unique within the H5P package structure

**H5P Structure Generation**
- Build H5P.Essay structure with fields: taskDescription (string), placeholderText (string), keywords (array), solution (object), media (object), behaviour (object), overallFeedback (array), and all label fields
- Wrap content in Interactive Book's Row/RowColumn structure using `chapterBuilder.addCustomContent()`
- Generate unique `subContentId` for content and metadata using pattern from other handlers
- Map simplified YAML structure to full H5P.Essay params structure

**Logging and Progress Tracking**
- Log progress in verbose mode using `context.logger.log()`
- For manual essays: log title and keyword count
- For AI essays: log title, prompt summary, keyword count, difficulty
- Log AI generation progress: request sent, response received, response parsed
- Log fallback usage if AI generation fails
- Sample log format: `"    - Adding essay: \"The Hobbit Summary\" (4 keywords)"` or `"    - Generating AI essay: \"Photosynthesis Essay\" (prompt: \"Create an essay question...\", 7 keywords)"`

**HTML Escaping and Security**
- Always escape HTML in user-provided text using `escapeHtml()` helper method
- Strip HTML tags from AI-generated content before processing
- Prevent XSS vulnerabilities by sanitizing all external input
- Apply escaping to: task descriptions, placeholder text, keyword strings, feedback strings, solution text
- Do NOT escape wildcard `*` characters or `/regex/` patterns (they are H5P.Essay syntax)

## Existing Code to Leverage

**AccordionHandler pattern (src/handlers/embedded/AccordionHandler.ts)**
- Copy validation structure: check required fields, validate types, validate nested arrays with indexed error messages
- Copy `escapeHtml()` helper method exactly as implemented
- Copy `generateSubContentId()` helper method: `Date.now() + random string`
- Copy pattern for building H5P structure with `library`, `params`, `metadata`, `subContentId`
- Copy pattern for wrapping content: `chapterBuilder.addCustomContent(h5pContent)`

**AIAccordionHandler pattern (src/handlers/ai/AIAccordionHandler.ts)**
- Copy AI prompt building pattern: use `AIPromptBuilder.resolveConfig()` and `AIPromptBuilder.buildSystemPrompt()`
- Copy JSON response parsing logic: strip markdown code fences, parse JSON, validate structure
- Copy HTML stripping pattern: regex to remove `<p>`, `<br>`, and other HTML tags from AI responses
- Copy fallback pattern: return minimal valid content on AI failure with error message
- Copy verbose logging pattern: log prompts summaries, response lengths, parsed item counts
- Copy user prompt template structure: clear instructions + JSON format example + "Return ONLY JSON" directive

**DragTextHandler pattern (src/handlers/embedded/DragTextHandler.ts)**
- Reference dual-format handling pattern for fields that support both simplified and native formats
- Reference array validation with indexed error messages for complex nested structures
- Use similar pattern for converting simplified keywords array to H5P.Essay structure
- Reference media detection and handling logic

**AIDragTextHandler pattern (src/handlers/ai/AIDragTextHandler.ts)**
- Reference difficulty-based content generation strategy
- Reference AI response structure validation and error handling
- Use similar pattern for requesting AI to generate structured keyword arrays
- Reference fallback content generation with informative error messages

**ChapterBuilder interface (src/compiler/ChapterBuilder.ts)**
- Use `chapterBuilder.addCustomContent()` method to add H5P structures to chapter
- Reference `wrapInRowColumn()` pattern for understanding how content gets wrapped for Interactive Book
- Use `context.logger.log()` for verbose mode logging
- Use `context.options.verbose` to conditionally enable detailed logging

**AIPromptBuilder service (src/ai/AIPromptBuilder.ts)**
- Use `AIPromptBuilder.resolveConfig(item.aiConfig, chapterConfig, bookConfig)` to merge AI configuration hierarchy
- Use `AIPromptBuilder.buildSystemPrompt(resolvedConfig)` to generate reading level and tone instructions
- Pass resulting system prompt to `quizGenerator.generateRawContent()` along with user prompt
- Understand reading level presets: elementary, grade-6, grade-9, high-school, college, professional, esl-beginner, esl-intermediate
- Understand tone presets: educational, conversational, formal, playful, encouraging, technical

## Out of Scope

- Support for rich text editing in student input (H5P limitation - plain text only)
- Real-time keyword highlighting as students type
- Advanced regex patterns beyond H5P.Essay's built-in support
- Custom scoring algorithms (uses H5P.Essay's built-in keyword matching)
- Plagiarism detection or AI-generated content detection
- Multi-language keyword matching (single language per question)
- Integration with external grading systems or LMS gradebooks
- Audio/video recording as essay response format (use H5P.AudioRecorder instead)
- Collaborative essay writing or peer review features
- Grammar and spelling checking beyond H5P.Essay's "forgive mistakes" feature
- CSV input format for Essay content (YAML/JSON only per architectural decision)
- Custom feedback per keyword beyond feedbackIncluded/feedbackMissed
- Automatic blank generation from text (user must specify keywords manually)

## Bugs to Avoid

Based on lessons learned from DragText, SingleChoiceSet, Blanks, and TrueFalse handler implementations, avoid these common pitfalls:

### 1. **Wildcard and Regex Keyword Preservation**

**Problem**: Escaping wildcard `*` characters or modifying `/regex/` patterns breaks H5P.Essay's built-in keyword matching functionality.

**Example**:
```typescript
// ❌ WRONG - Escaping wildcards
const keyword = item.keyword.replace(/\*/g, '\\*');  // Breaks wildcard matching

// ❌ WRONG - Modifying regex patterns
const keyword = item.keyword.replace(/\//g, '\\/');  // Breaks regex patterns

// ✅ CORRECT - Preserve wildcards and regex as-is
const keyword = item.keyword;  // Keep "*photo*" as "*photo*"
                               // Keep "/^photo.*/" as "/^photo.*/"
```

**Action for Essay Handler**:
- Do NOT escape or modify `*` wildcard characters in keyword strings
- Do NOT modify `/pattern/` regex format in keyword strings
- These are H5P.Essay syntax, not HTML that needs escaping
- Only escape HTML special characters in surrounding text (taskDescription, feedback, etc.)

**Rationale**: H5P.Essay uses `*` for wildcard matching (e.g., `*photo*` matches "photograph", "photosynthesis") and `/pattern/` for regex matching. Modifying these breaks the keyword matching engine.

---

### 2. **Keyword Alternatives Array Handling**

**Problem**: Not properly joining keyword alternatives with the correct separator or validating array structure causes matching failures.

**Example**:
```typescript
// ❌ WRONG - Using wrong separator
const alternatives = keyword.alternatives.join(',');  // H5P expects newlines or specific format

// ❌ WRONG - Not validating array type
if (keyword.alternatives) {
  // Assumes it's an array, crashes if it's a string
  const joined = keyword.alternatives.join('\n');
}

// ✅ CORRECT - Validate and process properly
if (keyword.alternatives) {
  if (!Array.isArray(keyword.alternatives)) {
    return {
      valid: false,
      error: `Keyword ${i + 1} 'alternatives' must be an array of strings`
    };
  }
  // Store as array in H5P structure (H5P.Essay expects array format)
  h5pKeyword.alternatives = keyword.alternatives;
}
```

**Action for Essay Handler**:
- Validate that `alternatives` is an array if provided
- Each alternative must be a string
- Pass alternatives array directly to H5P structure (H5P.Essay expects array format)
- Test with keywords that have multiple alternatives to ensure matching works

**Rationale**: H5P.Essay's keyword matching uses the alternatives array to accept synonyms. Incorrect formatting breaks the matching logic.

---

### 3. **Character Length Validation Consistency**

**Problem**: Not validating that maximumLength > minimumLength causes confusing user experience and validation errors.

**Example**:
```typescript
// ❌ WRONG - No cross-field validation
if (item.behaviour?.minimumLength) {
  // Validate minimumLength only
}
if (item.behaviour?.maximumLength) {
  // Validate maximumLength only
}

// ✅ CORRECT - Cross-field validation
if (item.behaviour?.minimumLength !== undefined &&
    item.behaviour?.maximumLength !== undefined) {
  if (item.behaviour.maximumLength <= item.behaviour.minimumLength) {
    return {
      valid: false,
      error: `maximumLength (${item.behaviour.maximumLength}) must be greater than minimumLength (${item.behaviour.minimumLength})`
    };
  }
}

// Also validate non-negative
if (item.behaviour?.minimumLength !== undefined && item.behaviour.minimumLength < 0) {
  return {
    valid: false,
    error: "minimumLength must be a non-negative integer"
  };
}
```

**Action for Essay Handler**:
- Validate minimumLength is non-negative if provided
- Validate maximumLength is non-negative if provided
- Validate maximumLength > minimumLength if both provided
- Provide clear error message showing both values when validation fails

**Rationale**: Impossible constraints (max < min) cause runtime errors and confuse users. Validation should catch this early.

---

### 4. **External Media URLs in Examples**

**Problem**: Using external URLs (like `via.placeholder.com`) in example YAML files causes network errors during package generation.

**Example**:
```yaml
# ❌ WRONG - External URL
- type: essay
  taskDescription: "Write about photosynthesis"
  keywords:
    - keyword: "chlorophyll"
  media:
    path: https://via.placeholder.com/600x400.png

# ✅ CORRECT - Local test file
- type: essay
  taskDescription: "Write about photosynthesis"
  keywords:
    - keyword: "chlorophyll"
  media:
    path: ../../tests/images/test-image.jpg
```

**Action for Essay Handler**:
- Use **only local test files** in example YAML files
- Available test files: `tests/images/test-image.jpg`, `tests/audios/test-audio.mp3`
- Document media path format relative to YAML file location
- Never use external URLs in examples or tests

**Rationale**: External URLs can fail due to network issues, rate limiting, or service unavailability. Local files ensure reliable testing.

---

### 5. **HTML Stripping from AI Responses**

**Problem**: AI responses may include unwanted HTML tags (`<p>`, `<br>`, etc.) that break H5P content structure if not stripped.

**Example**:
```typescript
// ❌ WRONG - Using AI response directly
const taskDescription = `<p>${aiResponse.taskDescription}</p>`;
// If AI returned "<p>Describe the process...</p>", result is:
// "<p><p>Describe the process...</p></p>" - nested tags!

// ✅ CORRECT - Strip HTML first, then wrap
private stripHtml(text: string): string {
  return text
    .replace(/<\/?p>/gi, "")      // Remove <p> and </p>
    .replace(/<br\s*\/?>/gi, " ")  // Replace <br> with space
    .replace(/<[^>]+>/g, "")       // Remove all other HTML tags
    .trim();
}

const cleanDescription = this.stripHtml(aiResponse.taskDescription);
const taskDescription = `<p>${this.escapeHtml(cleanDescription)}</p>`;
```

**Action for Essay Handler**:
- Include `stripHtml()` utility method in AIEssayHandler
- Apply to all AI-generated text: taskDescription, placeholderText, keywords, feedback, solutions
- Strip HTML BEFORE escaping HTML (strip first, then escape user input)
- Test with AI responses that include HTML to ensure stripping works

**Rationale**: AI models often return formatted text with HTML tags. These must be stripped to avoid nested tags and broken formatting.

---

### 6. **Per-Keyword Points and Occurrences Validation**

**Problem**: Not validating numeric fields for keywords (points, occurrences) leads to runtime errors or unexpected scoring behavior.

**Example**:
```typescript
// ❌ WRONG - No type validation
if (keyword.points) {
  h5pKeyword.points = keyword.points;  // Could be string "5" or negative!
}

// ✅ CORRECT - Validate type and range
if (keyword.points !== undefined) {
  if (typeof keyword.points !== "number") {
    return {
      valid: false,
      error: `Keyword ${i + 1} 'points' must be a number. Received: ${typeof keyword.points}`
    };
  }
  if (keyword.points <= 0) {
    return {
      valid: false,
      error: `Keyword ${i + 1} 'points' must be positive. Received: ${keyword.points}`
    };
  }
  h5pKeyword.points = keyword.points;
}

if (keyword.occurrences !== undefined) {
  if (typeof keyword.occurrences !== "number" || !Number.isInteger(keyword.occurrences)) {
    return {
      valid: false,
      error: `Keyword ${i + 1} 'occurrences' must be an integer. Received: ${keyword.occurrences}`
    };
  }
  if (keyword.occurrences <= 0) {
    return {
      valid: false,
      error: `Keyword ${i + 1} 'occurrences' must be positive. Received: ${keyword.occurrences}`
    };
  }
  h5pKeyword.occurrences = keyword.occurrences;
}
```

**Action for Essay Handler**:
- Validate `points` is a positive number if provided
- Validate `occurrences` is a positive integer if provided
- Provide specific error messages with keyword index and received value
- Test with invalid values (negative, zero, string) to ensure validation catches them

**Rationale**: Invalid scoring parameters break the automatic scoring algorithm. Strong validation prevents runtime errors.

---

### 7. **AI JSON Response Format Assumptions**

**Problem**: Assuming AI will always return clean JSON without markdown code fences or extra whitespace causes parsing errors.

**Example**:
```typescript
// ❌ WRONG - Direct parsing
const data = JSON.parse(response);  // Fails if response has ```json wrapper

// ✅ CORRECT - Clean before parsing
const cleaned = response.trim()
  .replace(/^```json\n?/, "")   // Remove opening fence
  .replace(/\n?```$/, "")       // Remove closing fence
  .trim();

const data = JSON.parse(cleaned);

// Validate structure
if (!data.taskDescription || typeof data.taskDescription !== "string") {
  throw new Error("AI response missing 'taskDescription' field (string)");
}
if (!data.keywords || !Array.isArray(data.keywords)) {
  throw new Error("AI response missing 'keywords' array");
}
```

**Action for Essay Handler**:
- Strip markdown code fences before parsing JSON
- Validate all required fields exist in AI response
- Validate field types (taskDescription is string, keywords is array)
- Provide specific error messages for missing or invalid fields
- Log parsing errors with verbose mode

**Rationale**: AI models inconsistently return JSON with or without markdown formatting. Robust parsing handles both cases.

---

### 8. **SubContentId Generation for Nested Content**

**Problem**: Forgetting to generate unique `subContentId` for each content item (including nested media) can cause H5P rendering issues.

**Example**:
```typescript
// ❌ WRONG - Missing subContentId for media
const mediaContent = {
  library: "H5P.Image 1.1",
  params: { /* ... */ }
  // Missing subContentId!
};

// ✅ CORRECT - Generate for all content
private generateSubContentId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

const h5pContent = {
  library: "H5P.Essay 1.5",
  params: { /* ... */ },
  metadata: { /* ... */ },
  subContentId: this.generateSubContentId()  // ← Main content
};

if (mediaContent) {
  mediaContent.subContentId = this.generateSubContentId();  // ← Media content
}
```

**Action for Essay Handler**:
- Generate unique `subContentId` for Essay content itself
- Generate unique `subContentId` for media content (image/video/audio) if present
- Use same pattern as other handlers: `${Date.now()}-${Math.random().toString(36).substring(7)}`
- Ensure IDs are generated at processing time (not validation time)

**Rationale**: H5P uses subContentId to track and render nested content. Missing IDs cause rendering failures or duplicate content bugs.

---

### 9. **Fallback Content Quality for AI Failures**

**Problem**: Providing unhelpful fallback content when AI generation fails (like just "Error") leaves users confused.

**Example**:
```typescript
// ❌ WRONG - Minimal fallback
private getFallbackContent(): EssayResult {
  return {
    taskDescription: "Error",
    keywords: [{ keyword: "error" }]
  };
}

// ✅ CORRECT - Informative fallback
private getFallbackContent(prompt: string): EssayResult {
  return {
    taskDescription: `AI generation failed for prompt: "${prompt.substring(0, 60)}...". Please check your API configuration and try again. To troubleshoot: 1) Verify API key is set, 2) Check network connection, 3) Review prompt for clarity.`,
    placeholderText: "Describe your understanding of the error...",
    keywords: [
      {
        keyword: "error",
        alternatives: ["failure", "issue"],
        points: 1,
        feedbackMissed: "This is a fallback question due to AI generation failure."
      }
    ],
    solution: {
      introduction: "This is a fallback essay question because AI generation encountered an error.",
      sample: "Please review your AI configuration and try generating this content again."
    }
  };
}
```

**Action for Essay Handler**:
- Provide detailed fallback content with troubleshooting guidance
- Include relevant prompt snippet in fallback message
- Create valid essay structure with keyword, placeholder, and solution
- Log detailed error information in verbose mode
- Test fallback by simulating AI failures

**Rationale**: AI generation can fail for many reasons (API key, network, quota). Good fallback content helps users diagnose and fix the issue.

---

### 10. **Feedback String Length Validation**

**Problem**: Not validating feedback string lengths can cause rendering issues or database storage errors in LMS platforms.

**Example**:
```typescript
// ❌ WRONG - No length validation
if (keyword.feedbackIncluded) {
  h5pKeyword.feedbackIncluded = keyword.feedbackIncluded;
}

// ✅ CORRECT - Validate length
const MAX_FEEDBACK_LENGTH = 1000;

if (keyword.feedbackIncluded !== undefined) {
  if (typeof keyword.feedbackIncluded !== "string") {
    return {
      valid: false,
      error: `Keyword ${i + 1} 'feedbackIncluded' must be a string`
    };
  }
  if (keyword.feedbackIncluded.length > MAX_FEEDBACK_LENGTH) {
    return {
      valid: false,
      error: `Keyword ${i + 1} 'feedbackIncluded' exceeds maximum length of ${MAX_FEEDBACK_LENGTH} characters (current: ${keyword.feedbackIncluded.length})`
    };
  }
  h5pKeyword.feedbackIncluded = keyword.feedbackIncluded;
}

if (keyword.feedbackMissed !== undefined) {
  if (typeof keyword.feedbackMissed !== "string") {
    return {
      valid: false,
      error: `Keyword ${i + 1} 'feedbackMissed' must be a string`
    };
  }
  if (keyword.feedbackMissed.length > MAX_FEEDBACK_LENGTH) {
    return {
      valid: false,
      error: `Keyword ${i + 1} 'feedbackMissed' exceeds maximum length of ${MAX_FEEDBACK_LENGTH} characters (current: ${keyword.feedbackMissed.length})`
    };
  }
  h5pKeyword.feedbackMissed = keyword.feedbackMissed;
}

// Also validate taskDescription
const MAX_TASK_LENGTH = 10000;
if (item.taskDescription.length > MAX_TASK_LENGTH) {
  return {
    valid: false,
    error: `taskDescription exceeds maximum length of ${MAX_TASK_LENGTH} characters (current: ${item.taskDescription.length})`
  };
}
```

**Action for Essay Handler**:
- Validate `taskDescription` max length (10000 chars)
- Validate `feedbackIncluded` max length (1000 chars per keyword)
- Validate `feedbackMissed` max length (1000 chars per keyword)
- Validate `solution.introduction` and `solution.sample` max lengths
- Provide clear error messages showing current length vs max length
- Consider truncation for AI-generated content instead of hard failure

**Rationale**: Extremely long strings can cause rendering issues, performance problems, or database storage failures. Validation ensures content stays within reasonable bounds.

---

### Summary Checklist for Essay Handler Implementation

Before considering the handler complete, verify:

- [ ] Wildcard `*` characters preserved without escaping in keyword strings
- [ ] Regex `/pattern/` format preserved without modification in keyword strings
- [ ] Keyword alternatives validated as array of strings and passed correctly to H5P structure
- [ ] Character length validation includes cross-field check (maximumLength > minimumLength)
- [ ] Example YAML files use **only local test files** for media (no external URLs)
- [ ] HTML stripping applied to all AI-generated text content
- [ ] Per-keyword `points` and `occurrences` validated as positive number/integer
- [ ] AI response cleaning handles markdown code fences and whitespace
- [ ] SubContentId generated for Essay content AND nested media content
- [ ] Fallback content provides helpful troubleshooting guidance
- [ ] Feedback strings validated for maximum length (1000 chars per keyword)
- [ ] Task description validated for maximum length (10000 chars)
- [ ] Verbose logging shows summaries, not full sensitive content
- [ ] Type system integration includes both "essay" and "ai-essay" in unions
- [ ] Test package generated successfully and validated on H5P.com
