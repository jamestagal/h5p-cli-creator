# Product Mission

## Pitch
h5p-cli-creator is a command-line utility that helps educators, content creators, and developers mass-produce H5P interactive learning content by transforming CSV data files into packaged H5P content, eliminating the tedious manual content creation process and enabling scalable, automated workflows for educational content generation.

## Users

### Primary Customers
- **Educators & Instructional Designers**: Teachers, trainers, and learning designers who need to create large volumes of similar interactive content for courses and learning materials
- **Content Development Teams**: Educational content production teams that need to produce H5P content at scale across multiple courses or learning modules
- **Developers & Automation Engineers**: Software developers building automated educational content pipelines, LMS integrations, or content generation systems
- **Open Source Contributors**: Developers who want to extend the tool with support for additional H5P content types

### User Personas

**Sarah, Instructional Designer** (35-45 years old)
- **Role:** Learning Designer at online education company
- **Context:** Creates language learning courses with hundreds of flashcards and dialog cards per course
- **Pain Points:** Manually creating each flashcard in H5P editor takes 2-3 minutes. With 500 flashcards per course, this means 16+ hours of repetitive data entry per course. Error-prone and mind-numbing work.
- **Goals:** Create entire flashcard sets from spreadsheets in minutes. Spend time on instructional design, not data entry. Iterate quickly based on feedback.

**Marcus, Developer** (28-40 years old)
- **Role:** Backend Developer at EdTech startup
- **Context:** Building automated content generation pipeline that converts existing content databases into H5P packages for LMS delivery
- **Pain Points:** No programmatic way to create H5P content. Must use web-based editor manually. Cannot integrate H5P creation into CI/CD pipelines or batch processes.
- **Goals:** Integrate H5P content generation into automated workflows. Generate content from databases or APIs. Deploy content programmatically to LMS platforms.

**Priya, Language Teacher** (30-50 years old)
- **Role:** High school language teacher
- **Context:** Creates vocabulary study materials for multiple grade levels and units
- **Pain Points:** Creating 50-100 vocabulary flashcards per unit across 6 units and 3 grade levels means thousands of flashcards. Current web-based creation is unsustainable.
- **Goals:** Create flashcards from simple spreadsheets. Reuse and adapt content across courses. Share templates with other teachers. Focus on pedagogy, not technology.

**Alex, Open Source Contributor** (25-55 years old)
- **Role:** Developer contributing to educational tools
- **Context:** Wants to add support for new H5P content types to the tool
- **Pain Points:** Current codebase requires deep understanding and significant code duplication to add new content types. Takes 4-8 hours to add a new handler. Barrier to entry is too high.
- **Goals:** Add new content type handlers in 30-60 minutes. Clear patterns and interfaces to follow. Minimal boilerplate code. Easy testing and validation.

## The Problem

### Manual H5P Content Creation is Unsustainable at Scale
Creating interactive H5P content through web-based editors is appropriate for individual pieces of content, but becomes prohibitively time-consuming when creating dozens or hundreds of similar items. An educator creating 100 flashcards must manually enter data, upload images, and configure settings 100 times through a web interface. This represents 3-6 hours of repetitive work prone to errors and inconsistencies.

**Our Solution:** Bulk content creation via CSV input files. Define content structure once, provide data in CSV format, generate hundreds of H5P packages in seconds. What took hours now takes minutes.

### No Programmatic Content Generation Path
Organizations with existing content databases, APIs, or automated workflows have no way to generate H5P content programmatically. The web-based H5P editor is designed for human interaction, not automation. This creates a bottleneck for organizations trying to scale content production or integrate H5P into existing content management systems.

**Our Solution:** Command-line interface enables scripting, automation, and integration into CI/CD pipelines. Generate H5P content from any data source that can produce CSV files. Integrate with existing content production workflows.

### Extensibility Barrier Limits Community Growth
The current architecture requires significant code duplication and deep knowledge of the codebase to add support for new H5P content types. Adding a new content type requires 4-8 hours of development time and understanding of the entire content generation pipeline. This creates a high barrier to entry for community contributors.

**Our Solution:** Handler/plugin architecture with clear interfaces and patterns reduces new content type development to 30-60 minutes. Standard ContentHandler interface ensures consistency. Isolated, independently testable handlers make contributions straightforward.

### Documentation Drift and Maintenance Burden
CSV format documentation must be manually maintained and kept in sync with code changes. Each new content type requires updating multiple documentation files. CLI help text must be manually written and maintained. This creates maintenance burden and opportunities for documentation to become outdated.

**Our Solution:** Self-documenting architecture generates CSV format documentation directly from handler definitions. CLI commands and help text generated automatically from handler metadata. Single source of truth eliminates documentation drift.

## Differentiators

### Handler/Plugin Architecture for Extensibility
Unlike monolithic content generation scripts, h5p-cli-creator implements a plugin-based handler architecture. Each H5P content type is an independent handler implementing a standard ContentHandler interface. This results in 87% reduction in time required to add new content types (from 4-8 hours to 30-60 minutes) and enables community contributions without deep codebase knowledge.

### Bulk Content Creation via CSV
Unlike web-based H5P editors that require manual content entry, h5p-cli-creator accepts CSV input files. Content creators work in familiar spreadsheet tools, enabling rapid iteration, bulk editing, and reuse of existing data. This results in 90%+ time savings for bulk content creation scenarios.

### Type-Safe TypeScript Implementation
Unlike script-based content generators, h5p-cli-creator is built with TypeScript providing compile-time type checking, interfaces that enforce correctness, and IDE autocompletion support. This results in fewer runtime errors, better developer experience, and more maintainable code.

### Auto-Generated Documentation
Unlike tools with manually maintained documentation, h5p-cli-creator generates CSV format documentation, CLI help text, and usage examples directly from handler code. This ensures documentation is always accurate and synchronized with code, reducing maintenance burden and improving user experience.

### Media File Flexibility
Unlike tools that only support local files or only URLs, h5p-cli-creator seamlessly handles both local media files and remote URLs. Images and audio can be provided as local paths (relative to CSV file) or as HTTP/HTTPS URLs, giving content creators maximum flexibility in their workflows.

## Key Features

### Core Features
- **CSV-Based Bulk Content Creation:** Define content structure in CSV format, generate dozens or hundreds of H5P packages with a single command
- **Multiple Content Type Support:** Built-in handlers for Flashcards, Dialog Cards, and Interactive Book content types with extensible architecture for additional types
- **Local and Remote Media Support:** Seamlessly embed images and audio from local file paths or remote URLs into H5P packages
- **Content Type Caching:** Downloaded H5P content type packages are cached locally to eliminate redundant downloads and speed up subsequent builds
- **Validation and Error Reporting:** Comprehensive input validation with clear error messages identifying specific issues with field names, row numbers, and expected values

### Extensibility Features
- **Handler/Plugin Architecture:** Standard ContentHandler interface enables rapid addition of new content types without modifying core infrastructure
- **Handler Registry:** Central registry manages handler lifecycle, discovery, and validation ensuring consistent behavior across all content types
- **Shared Context Utilities:** HandlerContext provides file operations, MIME type detection, CSV parsing, and logging to all handlers eliminating code duplication
- **Independent Handler Testing:** Each handler is isolated and independently testable with clear interfaces and mock-friendly design

### Developer Experience Features
- **Type-Safe TypeScript Implementation:** Full TypeScript support with interfaces, type checking, and IDE autocompletion for better developer experience
- **Auto-Generated Documentation:** CSV format documentation generated dynamically from handler definitions ensuring accuracy and consistency
- **Dynamic CLI Command Generation:** CLI commands, options, and help text generated automatically from registered handlers reducing boilerplate
- **CSV Template Generation:** Generate empty CSV templates for any content type with proper column headers and example values

### Workflow Integration Features
- **Command-Line Interface:** Scriptable CLI enables integration into automated workflows, CI/CD pipelines, and batch processing systems
- **Configurable Options:** Language codes, titles, descriptions, and content type-specific settings configurable via CLI flags
- **Batch Processing Support:** Process multiple CSV files in scripted workflows for large-scale content production
- **Standard Output Formats:** Generates standard .h5p package files compatible with all H5P-enabled LMS platforms and content repositories
