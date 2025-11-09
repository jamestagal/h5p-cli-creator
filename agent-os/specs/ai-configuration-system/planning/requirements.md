# AI Configuration System - Phase 5 Requirements

## Overview

Build a comprehensive AI configuration system that eliminates manual formatting instructions, provides teacher-friendly controls, and ensures consistent, grade-appropriate AI-generated content across all handlers.

## Problem Statement

### Current Issues

**❌ Teachers must include formatting rules in every prompt:**
```yaml
- type: ai-text
  prompt: "Write about photosynthesis. IMPORTANT: Use plain text only - no markdown formatting, no asterisks for bold, no special characters. Write naturally with proper paragraphs separated by blank lines."
```

**Problems:**
1. Cluttered YAML files with repetitive instructions
2. Inconsistent AI output when teachers forget rules
3. No grade-level standardization
4. Can't change system-wide formatting rules
5. Poor user experience for teachers

### Desired State

**✅ Clean, teacher-friendly prompts:**
```yaml
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain photosynthesis"  # System handles the rest!
```

**Benefits:**
1. Clean YAML files
2. Consistent AI output (formatting rules baked into system)
3. Grade-appropriate content automatically
4. System-wide configuration updates
5. Excellent teacher UX

## Inspiration: H5P.com Smart Import

The H5P.com Smart Import feature (screenshot provided by user) shows an excellent UX pattern:

1. **Language dropdown** - Select content language
2. **Source selection** - File, Link, or Text input
3. **Customization text field** - Free-text for:
   - Learning objectives
   - Focus areas
   - Difficulty level
   - Other custom instructions

**Key insight:** Hybrid approach of structured controls + free-text customization

## Core Requirements

### REQ-1: Book-Level AI Configuration

**REQ-1.1:** Add `aiConfig` field to BookDefinition
- Optional configuration at book level
- Applies to all AI handlers in the book
- Can be overridden at chapter or content-item level

**REQ-1.2:** Support structured parameters
- Reading level (dropdown with presets)
- Tone (dropdown with options)
- Output style (system-managed)

**REQ-1.3:** Support free-text customization
- Optional customization field
- For advanced users and specific requirements
- Examples: "Focus on visual learners", "Include real-world examples"

### REQ-2: Reading Level System

**REQ-2.1:** Predefined reading level options
- Elementary (grades 1-5)
- 6th grade (ages 11-12)
- 9th grade (ages 14-15)
- High school (grades 10-12)
- College level
- Professional/Adult
- ESL Beginner (A1-A2 CEFR)
- ESL Intermediate (B1-B2 CEFR)

**REQ-2.2:** Reading level characteristics
Each level defines:
- Target age/grade range
- Vocabulary guidance (word complexity, technical terms)
- Sentence length and structure
- Tone and style

**REQ-2.3:** Default reading level
- Default to "6th grade" if not specified
- Backward compatible with existing YAML files

### REQ-3: System Prompt Engineering

**REQ-3.1:** Automatic prompt construction
- AI handlers build complete prompts internally
- Combine user's content prompt + system instructions
- Teachers never see or write system instructions

**REQ-3.2:** Formatting rules (system-managed)
Critical rules baked into every AI prompt:
- Use plain text only - NO markdown formatting
- NO asterisks for bold/italic
- NO special characters or symbols
- Use HTML tags ONLY: `<h2>`, `<p>`, `<strong>`, `<em>`, `<ul>`, `<li>`
- Paragraphs wrapped in `<p>` tags
- Separate paragraphs with blank lines

**REQ-3.3:** Reading level integration
System prompts automatically include:
- Vocabulary guidance for the reading level
- Sentence length/complexity guidelines
- Appropriate tone and style

**REQ-3.4:** Customization integration
- User's customization text appended to system prompt
- Provides additional context to AI
- Example: "Focus on visual learners. Include analogies."

### REQ-4: TypeScript Type System

**REQ-4.1:** AIConfiguration interface
```typescript
interface AIConfiguration {
  targetAudience?:
    | "elementary"
    | "grade-6"
    | "grade-9"
    | "high-school"
    | "college"
    | "professional"
    | "esl-beginner"
    | "esl-intermediate";

  tone?: "educational" | "professional" | "casual" | "academic";

  outputStyle?: "plain-html" | "rich-html" | "markdown";

  customization?: string;
}
```

**REQ-4.2:** BookDefinition extension
```typescript
interface BookDefinition {
  title: string;
  language: string;
  description?: string;
  aiConfig?: AIConfiguration;  // NEW!
  chapters: ChapterDefinition[];
}
```

**REQ-4.3:** Export types for frontend
- AIConfiguration exported from types.ts
- Available for SvelteKit frontend
- JSON schema generation support

### REQ-5: Handler Integration

**REQ-5.1:** Update AITextHandler
- Access aiConfig from BookDefinition
- Build system prompt with reading level + formatting rules
- Append user's content prompt
- Append customization if provided
- Send complete prompt to AI provider

**REQ-5.2:** Update QuizHandler
- Same system prompt construction
- Apply reading level to question generation
- Ensure questions match target audience

**REQ-5.3:** Future AI handlers
- All AI handlers follow same pattern
- Consistent prompt engineering across system
- Reusable prompt builder utility

### REQ-6: Prompt Builder Service

**REQ-6.1:** Create AIPromptBuilder class
```typescript
class AIPromptBuilder {
  buildSystemPrompt(config?: AIConfiguration): string;
  buildCompletePrompt(userPrompt: string, config?: AIConfiguration): string;
}
```

**REQ-6.2:** Reading level presets
- Hardcoded configurations for each reading level
- Vocabulary guidance
- Sentence structure guidelines
- Tone specifications

**REQ-6.3:** Composable prompt sections
- System instructions (formatting rules)
- Reading level guidance
- User's content prompt
- Custom instructions

### REQ-7: YAML Format

**REQ-7.1:** Book-level configuration
```yaml
title: "Biology Lesson"
language: "en"
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: |
    Focus on visual learners. Include real-world examples.
    Use analogies to explain complex concepts.

chapters:
  - title: "Photosynthesis"
    content:
      - type: ai-text
        prompt: "Explain the process of photosynthesis"
```

**REQ-7.2:** Chapter-level override (optional)
```yaml
chapters:
  - title: "Advanced Topics"
    aiConfig:
      targetAudience: "college"  # Override for this chapter
    content:
      - type: ai-text
        prompt: "Explain quantum photosynthesis"
```

**REQ-7.3:** Item-level override (optional)
```yaml
- type: ai-text
  aiConfig:
    targetAudience: "esl-beginner"  # Override for this item
  prompt: "Simple explanation of photosynthesis"
```

### REQ-8: Frontend Integration (SvelteKit)

**REQ-8.1:** API endpoint updates
- Accept aiConfig in BookDefinition JSON
- Validate aiConfig structure
- Pass to H5pCompiler

**REQ-8.2:** UI components
- Dropdown for reading level
- Dropdown for tone
- Textarea for customization
- Matches H5P.com Smart Import UX

**REQ-8.3:** Form validation
- Required fields: none (all optional)
- Default values: grade-6, educational
- Character limits on customization

### REQ-9: Documentation

**REQ-9.1:** Update YAML format reference
- Document aiConfig options
- Show examples for each reading level
- Explain customization field usage

**REQ-9.2:** Update API Integration Guide
- Show aiConfig in request examples
- Document validation rules
- Provide frontend integration examples

**REQ-9.3:** Teacher guide
- How to choose reading level
- When to use customization
- Best practices for AI prompts

### REQ-10: Testing

**REQ-10.1:** Prompt builder tests
- Test system prompt generation
- Test reading level integration
- Test customization appending
- Test default values

**REQ-10.2:** Handler integration tests
- AITextHandler with various configs
- QuizHandler with various configs
- Config override precedence (book → chapter → item)

**REQ-10.3:** End-to-end tests
- YAML with aiConfig → .h5p generation
- Verify AI output matches reading level
- Compare output quality with/without config

### REQ-11: Backward Compatibility

**REQ-11.1:** Existing YAML files work unchanged
- aiConfig is optional
- Default to grade-6 if not specified
- No breaking changes

**REQ-11.2:** Existing API calls work unchanged
- aiConfig is optional in BookDefinition
- Existing prompts still work (now cleaner)

**REQ-11.3:** Migration path
- Teachers can gradually adopt aiConfig
- Old prompts with embedded instructions still work
- New prompts can be clean and simple

## Success Criteria

1. ✅ Teachers write simple prompts without formatting instructions
2. ✅ All AI output follows consistent formatting rules
3. ✅ Content automatically matches specified reading level
4. ✅ Book-level, chapter-level, and item-level configuration works
5. ✅ Backward compatible with existing YAML files
6. ✅ UI matches H5P.com Smart Import pattern
7. ✅ Frontend receives typed AIConfiguration interface
8. ✅ Comprehensive test coverage (>80%)

## Non-Requirements

- ❌ AI model fine-tuning (use prompt engineering only)
- ❌ Custom reading level creation (use predefined options)
- ❌ Language translation (language parameter already exists)
- ❌ Content quality scoring (out of scope)
- ❌ Multi-language prompt templates (English only for now)

## Technical Constraints

- Must work with existing QuizGenerator (Gemini, Claude APIs)
- Must integrate with existing handler architecture
- Must not break backward compatibility
- Must support CLI (YAML) and API (JSON) workflows
- Must be type-safe (TypeScript interfaces)

## Dependencies

- **Existing:** AITextHandler, QuizHandler, BookDefinition types
- **Existing:** YamlInputParser, H5pCompiler
- **New:** AIPromptBuilder service
- **New:** Reading level presets configuration
- **Future:** Additional AI handlers (Timeline, Summary, etc.)

## Timeline

- **Phase 5.1 (Week 1):** Core AIConfiguration types and prompt builder
- **Phase 5.2 (Week 1-2):** Handler integration (AITextHandler, QuizHandler)
- **Phase 5.3 (Week 2):** YAML parsing and validation
- **Phase 5.4 (Week 2-3):** Testing and documentation
- **Phase 5.5 (Week 3):** Frontend integration preparation

## References

- H5P.com Smart Import UI (user-provided screenshot)
- Existing handler architecture (Phase 1-4)
- BookDefinition types (src/compiler/types.ts)
- YamlInputParser (src/compiler/YamlInputParser.ts)
- AITextHandler (src/handlers/core/AITextHandler.ts)
- QuizHandler (src/handlers/ai/QuizHandler.ts)
