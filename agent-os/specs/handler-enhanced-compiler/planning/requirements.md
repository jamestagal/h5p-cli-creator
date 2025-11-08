# Handler-Enhanced Compiler Requirements

## Overview

Build a handler-based plugin system that works with the existing template-free H5P compiler to enable composable content types, AI-powered generation, and frontend integration.

## Source Document

Based on: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/Handler_Enhanced_Compiler_Architecture.md`

## Core Requirements

### 1. Handler Architecture

**REQ-1.1:** Create a ContentHandler interface that works with template-free compilation
- Must integrate with existing ContentBuilder/ChapterBuilder APIs
- Must NOT use template-based approach (H5pPackageBuilder)
- Must support async operations for AI generation

**REQ-1.2:** Implement HandlerRegistry for managing content handlers
- Register handlers dynamically
- Discover handlers by type
- Find handlers that can process specific data
- Get required libraries for handlers

**REQ-1.3:** Create HandlerContext for shared utilities
- Provide access to LibraryRegistry
- Provide access to QuizGenerator (AI)
- Provide logger for progress messages
- Support future AI services (text, image, flashcard generators)

### 2. Input Format Strategy

**REQ-2.1:** JSON as core internal format
- All input formats convert to BookDefinition JSON
- TypeScript interfaces for type safety
- Frontend-ready API structure

**REQ-2.2:** Support multiple input formats
- YAML (CLI convenience for developers)
- CSV (legacy compatibility)
- JSON (direct API for SvelteKit frontend)

**REQ-2.3:** Input adapters for each format
- YamlInputParser: YAML → JSON
- CSVToJSONAdapter: CSV → JSON
- Direct JSON for API endpoints (no adapter needed)

### 3. Handler Implementations

**REQ-3.1:** Core content handlers
- TextHandler: Add formatted text to chapters
- ImageHandler: Add images with proper metadata
- AudioHandler: Add audio content
- QuizHandler: AI-generated quizzes using QuizGenerator

**REQ-3.2:** Extended content handlers
- FlashcardsHandler: Embed flashcard practice
- DialogCardsHandler: Embed dialog cards
- VideoHandler: Embed video content
- Future: Timeline, Accordion, Tabs, etc.

**REQ-3.3:** Handler capabilities
- Validation: Check data before processing
- Library requirements: Declare needed H5P libraries
- Composability: Work independently in any combination
- AI integration: Use shared AI services

### 4. SvelteKit Frontend Integration

**REQ-4.1:** API endpoint structure
- POST /api/generate-h5p endpoint
- Accept BookDefinition JSON
- Return .h5p file as download
- Proper error handling and validation

**REQ-4.2:** Shared compiler library
- Extract compiler to reusable module
- Works identically for CLI and API
- Same handlers for both contexts
- Consistent behavior and output

**REQ-4.3:** Frontend data model
- TypeScript types for BookDefinition
- Visual form builder support
- Drag & drop content blocks
- Live preview capability

### 5. Migration & Compatibility

**REQ-5.1:** Backward compatibility
- Existing YAML files work unchanged
- CLI commands unchanged
- Output .h5p files identical to current
- No breaking changes to existing workflows

**REQ-5.2:** Gradual migration path
- Phase 1: Extract handlers from existing code
- Phase 2: Integrate with InteractiveBookAIModule
- Phase 3: Add new handler types
- Phase 4: Enable SvelteKit integration

**REQ-5.3:** Template-free throughout
- No H5pPackageBuilder usage
- Use ContentBuilder/ChapterBuilder exclusively
- Programmatic generation only
- No template extraction/modification

### 6. AI Integration

**REQ-6.1:** QuizGenerator integration
- Handlers access via HandlerContext
- Support for Gemini and Claude APIs
- Error handling with fallback content
- Configurable question counts

**REQ-6.2:** Future AI services
- TextGenerator for content creation
- ImageGenerator for visuals
- FlashcardGenerator for study materials
- Extensible architecture for new services

### 7. Testing & Validation

**REQ-7.1:** Handler testing
- Unit tests for each handler
- Validation logic testing
- Integration tests with ChapterBuilder
- Mock HandlerContext for isolation

**REQ-7.2:** End-to-end testing
- YAML → .h5p generation
- CSV → .h5p generation
- JSON API → .h5p generation
- Output validation and comparison

### 8. Documentation

**REQ-8.1:** Developer documentation
- Handler development guide
- API reference
- Integration examples
- Migration guide

**REQ-8.2:** User documentation
- YAML format reference
- CSV format reference
- JSON API documentation
- SvelteKit integration guide

## Success Criteria

1. ✅ All existing YAML examples produce identical output
2. ✅ Can add new content types without modifying core code
3. ✅ SvelteKit can generate .h5p files using same handlers
4. ✅ AI-powered content generation works seamlessly
5. ✅ Community can contribute new handlers
6. ✅ No template dependencies anywhere in the system
7. ✅ Clear separation between CLI and API workflows
8. ✅ Comprehensive test coverage (>80%)

## Non-Requirements

- ❌ Template-based generation (explicitly removed)
- ❌ Standalone content type handlers (focus on composable sub-content)
- ❌ CSV-only approach (multi-format support)
- ❌ Breaking changes to existing workflows
- ❌ Frontend UI implementation (API only, UI is separate project)

## Technical Constraints

- Must work with existing template-free compiler
- Must integrate with current LibraryRegistry (cache-first)
- Must support current AI providers (Gemini, Claude)
- Must maintain TypeScript type safety
- Must work in Node.js environment (CLI and API)

## Dependencies

- Existing: ContentBuilder, ChapterBuilder, PackageAssembler
- Existing: LibraryRegistry (cache-first)
- Existing: QuizGenerator (AI integration)
- Existing: YamlInputParser
- New: HandlerRegistry, ContentHandler interface, HandlerContext
- Future: SvelteKit API routes

## Timeline

- **Phase 1 (Week 1):** Core handler infrastructure
- **Phase 2 (Week 2):** Integration with InteractiveBookAIModule
- **Phase 3 (Week 3):** New handler implementations
- **Phase 4 (Week 4):** SvelteKit integration preparation
- **Phase 5 (Ongoing):** Community handler contributions
