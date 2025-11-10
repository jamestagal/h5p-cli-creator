# Requirements: Essay Handler Implementation

## Overview

Implement manual and AI-powered handlers for H5P.Essay content type, following the standalone-first handler architecture. Enable teachers to create essay questions with keyword-based automatic scoring, either manually or via AI generation.

## User Stories

1. As a teacher, I want to create manual essay questions in YAML with keywords and scoring criteria so that I can assess student written responses automatically
2. As a teacher, I want to generate essay questions using AI so that I can quickly create assessment content with relevant keywords and sample solutions
3. As a teacher, I want AI to suggest keyword alternatives (synonyms) so that scoring is fair and comprehensive
4. As a teacher, I want to configure minimum/maximum essay lengths so that students meet specific writing requirements
5. As a teacher, I want to provide sample solutions with explanations so that students can learn from examples after submission

## Content Type Analysis

**H5P.Essay-1.5 Package Analysis:**
- **Runnable**: Yes (`"runnable": 1`)
- **Dependencies**: H5P.Question-1.5, H5P.JoubelUI-1.3, H5P.TextUtilities-1.3
- **Primary Use Case**: Essay writing interface with keyword-based automatic scoring
- **Key Features**:
  - Rich text task descriptions
  - Keyword matching with wildcards and regex support
  - Keyword alternatives/synonyms
  - Per-keyword point values and feedback
  - Sample solutions with introductions
  - Optional media (image/video/audio)
  - Character count limits (min/max)
  - Passing and mastering percentage thresholds

## Required Interfaces

### Manual Handler Interface (EssayContent)

```typescript
export interface EssayContent {
  type: "essay";
  title?: string;
  taskDescription: string;  // HTML task description (required)
  placeholderText?: string;  // Help text in input field

  keywords: Array<{
    keyword: string;  // Word/phrase, supports * wildcard and /regex/
    alternatives?: string[];  // Synonyms/variations
    points?: number;  // Default: 1
    occurrences?: number;  // How many times to award points, default: 1
    caseSensitive?: boolean;  // Default: true
    forgiveMistakes?: boolean;  // Allow minor spelling errors, default: false
    feedbackIncluded?: string;  // Feedback if keyword found
    feedbackMissed?: string;  // Feedback if keyword missing
  }>;

  solution?: {
    introduction?: string;  // HTML introduction to sample solution
    sample?: string;  // HTML sample solution text
  };

  media?: {
    path: string;
    type?: "image" | "video" | "audio";
    alt?: string;  // For images
    disableZooming?: boolean;  // For images only
  };

  behaviour?: {
    minimumLength?: number;  // Min characters required
    maximumLength?: number;  // Max characters allowed
    inputFieldSize?: "1" | "3" | "10";  // Lines, default: "10"
    enableRetry?: boolean;  // Default: true
    ignoreScoring?: boolean;  // Show only feedback, no score, default: false
    percentagePassing?: number;  // 0-100, passing threshold
    percentageMastering?: number;  // 0-100, mastering threshold
  };

  overallFeedback?: Array<{
    from: number;  // Percentage 0-100
    to: number;    // Percentage 0-100
    feedback: string;
  }>;

  labels?: {
    checkAnswer?: string;
    submitAnswer?: string;
    tryAgain?: string;
    showSolution?: string;
    feedbackHeader?: string;
    solutionTitle?: string;
  };
}
```

### AI Handler Interface (AIEssayContent)

```typescript
export interface AIEssayContent {
  type: "ai-essay";
  title?: string;
  prompt: string;  // "Create an essay question about photosynthesis for high school students"

  keywordCount?: number;  // Default: 5
  includeAlternatives?: boolean;  // Generate synonyms for keywords, default: true
  includeSampleSolution?: boolean;  // Generate example answer, default: true

  difficulty?: "easy" | "medium" | "hard";
  // Easy: 3-5 keywords, 50-200 chars, simple vocabulary
  // Medium: 5-7 keywords, 100-500 chars, moderate vocabulary
  // Hard: 7-10 keywords, 200-1000 chars, advanced vocabulary

  minimumLength?: number;  // Override difficulty default
  maximumLength?: number;  // Override difficulty default

  // Universal AI Configuration
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}
```

## Handler Implementation Requirements

### EssayHandler (Manual)

**Location**: `src/handlers/embedded/EssayHandler.ts`

**Key Methods**:
- `getContentType()`: Return "essay"
- `validate()`: Validate all required fields, keyword structure, length constraints
- `process()`: Build H5P.Essay structure with proper params, metadata, subContentId
- `getRequiredLibraries()`: Return `["H5P.Essay"]`

**Critical Features**:
1. **Keyword Array Processing**: Convert simplified keyword objects to H5P format
2. **HTML Formatting**: Wrap taskDescription in proper HTML tags, escape user input
3. **Media Support**: Handle image/video/audio with proper sub-content structures
4. **Default Labels**: Provide all UI labels with sensible defaults
5. **Default Behaviour**: enableRetry (true), inputFieldSize ("10"), percentagePassing (50), percentageMastering (100)
6. **Feedback Ranges**: Default overall feedback if not provided

### AIEssayHandler (AI-Powered)

**Location**: `src/handlers/ai/AIEssayHandler.ts`

**Key Methods**:
- Same as EssayHandler

**AI Integration**:
1. **Prompt Building**:
   - Use `AIPromptBuilder.resolveConfig()` to merge aiConfig from item/chapter/book levels
   - Use `AIPromptBuilder.buildSystemPrompt()` for reading level and tone
   - Build user prompt requesting JSON with taskDescription, keywords array, and sample solution

2. **Difficulty Mapping**:
   - Easy: 3-5 keywords, 50-200 chars, simple vocabulary, common terms
   - Medium: 5-7 keywords, 100-500 chars, moderate vocabulary, subject-specific terms
   - Hard: 7-10 keywords, 200-1000 chars, advanced vocabulary, technical terms

3. **AI Response Structure**:
```json
{
  "taskDescription": "Describe the process of photosynthesis...",
  "placeholderText": "Begin by explaining...",
  "keywords": [
    {
      "keyword": "chlorophyll",
      "alternatives": ["chloroplast pigment", "green pigment"],
      "points": 2,
      "feedbackIncluded": "Excellent! You mentioned chlorophyll.",
      "feedbackMissed": "Remember to discuss the role of chlorophyll."
    }
  ],
  "solution": {
    "introduction": "A strong answer should include...",
    "sample": "Photosynthesis is the process by which..."
  }
}
```

4. **Response Processing**:
   - Strip markdown code fences
   - Parse JSON and validate structure
   - Strip HTML from AI-generated text
   - Provide fallback on AI failure

## Type System Integration

**Updates Required**:

1. Add to ContentType union in `YamlInputParser.ts`:
```typescript
type ContentType =
  | "essay"
  | "ai-essay"
  | /* other types */;
```

2. Add to AnyContentItem union:
```typescript
type AnyContentItem =
  | import("./handlers/embedded/EssayHandler").EssayContent
  | import("./handlers/ai/AIEssayHandler").AIEssayContent
  | /* other types */;
```

3. Add validation cases in `YamlInputParser.validateContentItem()`

## Handler Registration

**File**: `src/modules/ai/interactive-book-ai-module.ts`

```typescript
// Register after other question handlers
handlerRegistry.register(new EssayHandler());
handlerRegistry.register(new AIEssayHandler());
```

## Required Libraries

**Main Library**: `H5P.Essay 1.5`

**Auto-Resolved Dependencies** (via LibraryRegistry):
- H5P.Question 1.5
- H5P.JoubelUI 1.3
- H5P.TextUtilities 1.3
- H5P.FontIcons 1.0
- FontAwesome 4.5
- H5P.Transition 1.0

## Validation Requirements

### EssayHandler Validation
- `taskDescription` (required string, max 10000 chars)
- `keywords` (required array, min 1 keyword)
- Each keyword: `keyword` (required string)
- Each keyword: `alternatives` (array of strings if provided)
- Each keyword: `points` (positive number if provided)
- Each keyword: `occurrences` (positive integer if provided)
- Each keyword: `feedbackIncluded` (string max 1000 chars if provided)
- Each keyword: `feedbackMissed` (string max 1000 chars if provided)
- `media.path` (required string if media provided)
- `behaviour.minimumLength` (non-negative integer if provided)
- `behaviour.maximumLength` (non-negative integer if provided, must be > minimumLength)
- `behaviour.percentagePassing` (0-100 if provided)
- `behaviour.percentageMastering` (0-100 if provided)

### AIEssayHandler Validation
- `prompt` (required string, min 10 chars)
- `keywordCount` (positive integer 1-20 if provided)
- `difficulty` (enum: "easy" | "medium" | "hard" if provided)
- `minimumLength` (non-negative integer if provided)
- `maximumLength` (non-negative integer if provided, must be > minimumLength)

## Example YAML Files

### Manual Essay Example
```yaml
chapters:
  - title: "Literary Analysis"
    items:
      - type: essay
        title: "The Hobbit Summary"
        taskDescription: |
          <p>Please describe the novel <em>"The Hobbit"</em> by J.R.R. Tolkien
          with at least 100 characters and up to 500 characters.</p>
        placeholderText: "In a hole in the ground there lived a hobbit..."
        keywords:
          - keyword: "Bilbo"
            points: 10
            occurrences: 3
            feedbackMissed: "You should mention the main character by name."
          - keyword: "Gandalf"
            points: 20
            forgiveMistakes: true
            feedbackMissed: "Did you mention what the wizard did?"
          - keyword: "Smaug"
            points: 20
            feedbackIncluded: "Great! You remembered the dragon's name!"
          - keyword: "adventure"
            alternatives: ["quest", "journey"]
            points: 10
        solution:
          introduction: |
            <p>Remember that you were not expected to come up with
            the exact same solution. This is just a good example.</p>
          sample: |
            <p>The book is about Bilbo Baggins, a hobbit who goes on
            an unexpected adventure with Gandalf and thirteen dwarfs...</p>
        behaviour:
          minimumLength: 100
          maximumLength: 500
          percentagePassing: 50
          percentageMastering: 80
        overallFeedback:
          - from: 0
            to: 49
            feedback: "Maybe you should read the book again?"
          - from: 50
            to: 79
            feedback: "Great! You know some things about The Hobbit!"
          - from: 80
            to: 100
            feedback: "Excellent! You're a fantasy expert!"
```

### AI Essay Example
```yaml
chapters:
  - title: "Science Assessment"
    items:
      - type: ai-essay
        title: "Photosynthesis Essay"
        prompt: |
          Create an essay question about the process of photosynthesis,
          including the role of chlorophyll, sunlight, and carbon dioxide.
          Target high school biology students.
        keywordCount: 7
        includeAlternatives: true
        includeSampleSolution: true
        difficulty: "medium"
        minimumLength: 150
        maximumLength: 600
        aiConfig:
          targetAudience: "high-school"
          tone: "educational"
```

## Bugs to Avoid

Based on lessons from DragText, SingleChoiceSet, and other handlers:

1. **HTML Stripping from AI Responses**: Strip `<p>`, `<br>`, and all HTML tags from AI-generated text before processing
2. **Keyword Wildcard Handling**: Don't escape wildcard `*` characters - they're part of H5P.Essay's keyword matching syntax
3. **Regex Keyword Format**: Preserve `/pattern/` format for regex keywords without modification
4. **External Media URLs**: Use only local test files in examples, never external URLs
5. **Type Aliases**: Register both "essay" and "ai-essay" type identifiers
6. **SubContentId Generation**: Generate unique IDs for Essay content AND nested media content
7. **AI JSON Response Cleaning**: Strip markdown code fences before parsing
8. **Fallback Content Quality**: Provide informative fallback with actionable error messages
9. **Validation Error Messages**: Specific, actionable messages for each validation failure
10. **Character Length Consistency**: Ensure maximumLength > minimumLength validation

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

## Success Criteria

1. Both handlers implement ContentHandler interface correctly
2. All validation rules enforce proper content structure
3. Manual handler processes YAML correctly with proper H5P structure
4. AI handler generates relevant keywords with appropriate alternatives
5. AI handler generates coherent task descriptions and sample solutions
6. Test package generates successfully and validates on H5P.com
7. Example YAML files demonstrate all major features
8. Media support works for images, videos, and audio
9. All 10 "Bugs to Avoid" are prevented in implementation
10. Comprehensive unit tests cover validation and processing logic
