# Tech Stack

## Language & Runtime
- **Language:** TypeScript 4.5+
- **Runtime:** Node.js (current LTS)
- **Package Manager:** npm

## CLI Framework
- **Command-Line Interface:** yargs 17.x
- **Console Styling:** chalk 5.x

## Data Processing
- **CSV Parsing:** papaparse 5.x
- **File System Operations:** fs-extra 10.x
- **Package Compression:** JSZip 3.x
- **HTTP Client:** axios 0.25+

## Media & File Handling
- **MIME Type Detection:** mime-types 2.x
- **Image Dimension Detection:** buffer-image-size 0.6+

## Architecture Patterns
- **Handler/Plugin System:** ContentHandler interface with HandlerRegistry for extensible content type support
- **Context Pattern:** HandlerContext provides shared utilities (file operations, logging, CSV parsing) to all handlers
- **Registry Pattern:** HandlerRegistry manages handler registration, discovery, validation, and documentation generation

## Testing & Quality (Planned)
- **Test Framework:** Jest 29.x (to be added)
- **Test Utilities:** ts-jest 29.x (to be added)
- **Type Definitions:** @types/* packages for TypeScript support

## Development Tools
- **TypeScript Compiler:** tsc via typescript package
- **Linting:** tslint 5.x
- **Type Execution:** ts-node 10.x

## H5P Integration
- **H5P Hub API:** Download content type packages from official H5P Hub
- **H5P Package Format:** Generate standard .h5p files (ZIP archives with h5p.json, content/content.json, and media assets)
- **Content Type Cache:** Local filesystem caching in content-type-cache/ directory

## Architecture Components

### Core Infrastructure
- **ContentHandler Interface:** Standard interface all content type handlers implement
- **HandlerRegistry:** Central registry for handler registration, discovery, and validation
- **HandlerContextImpl:** Concrete implementation providing shared utilities
- **SimpleLogger:** Console-based logging with configurable debug output

### Handler Pattern
- **FlashcardsHandler:** Handler for H5P.Flashcards content type
- **DialogCardsHandler:** Handler for H5P.DialogCards content type
- **InteractiveBookHandler:** Handler for H5P.InteractiveBook content type (planned)

### Content Models
- **H5pContent:** Base interface for H5P content structures
- **H5pImage:** Image asset handling with local file and URL support
- **H5pAudio:** Audio asset handling with local file and URL support
- **H5pCopyrightInformation:** Copyright metadata structures

### Package Management
- **H5pPackage:** Manages H5P package download, cache, and extraction
- **H5pPackageBuilder:** Assembles content.json, h5p.json, and media files into .h5p packages

## File Structure

```
src/
├── index.ts                      # CLI entry point with dynamic command generation
├── handlers/                     # Handler architecture (planned)
│   ├── ContentHandler.ts        # Core interfaces
│   ├── HandlerRegistry.ts       # Registry implementation
│   ├── HandlerContextImpl.ts    # Context utilities
│   ├── SimpleLogger.ts          # Logger implementation
│   ├── FlashcardsHandler.ts     # Flashcards handler
│   ├── DialogCardsHandler.ts    # Dialog cards handler
│   └── InteractiveBookHandler.ts # Interactive book handler (planned)
├── models/                       # Content type models
│   ├── h5p-content.ts
│   ├── h5p-flashcards-content.ts
│   ├── h5p-dialogcards-content.ts
│   ├── h5p-image.ts
│   └── h5p-audio.ts
├── h5p-package.ts               # Package download and management
└── content-creator.ts           # Base creator infrastructure
```

## Data Flow

1. **CLI Command Invocation:** User executes CLI command with CSV file and options
2. **Handler Discovery:** HandlerRegistry locates appropriate handler for content type
3. **CSV Parsing:** Handler parses CSV file using papaparse into structured data objects
4. **Validation:** Handler validates parsed data against content type requirements
5. **Package Acquisition:** H5pPackage downloads or retrieves cached content type package from H5P Hub
6. **Content Generation:** Handler generates H5P content structure (content.json) from validated data
7. **Media Processing:** Local files copied or URLs downloaded, added to package with proper MIME types
8. **Package Assembly:** H5pPackageBuilder combines content, metadata, and media into ZIP structure
9. **Output Generation:** Final .h5p file written to specified output path

## Dependencies Rationale

### yargs
- Industry-standard CLI framework for Node.js
- Supports command hierarchies, options parsing, and help text generation
- Will be extended with dynamic command generation from HandlerRegistry

### papaparse
- Robust CSV parsing with configurable delimiters and encoding
- Handles edge cases (quoted fields, line breaks in values)
- Synchronous parsing suitable for CLI workflow

### JSZip
- Creates H5P packages (ZIP format with specific structure)
- In-memory ZIP construction for performance
- Supports custom compression settings

### axios
- HTTP client for downloading H5P packages from Hub API
- Supports remote media file downloads (images, audio from URLs)
- Promise-based API fits async workflow

### fs-extra
- Enhanced file system operations with promise support
- Recursive directory operations (copy, move, remove)
- Atomic file operations for reliability

### chalk
- Terminal color and styling for CLI output
- Improves user experience with visual feedback
- Cross-platform terminal compatibility

### mime-types
- Accurate MIME type detection from file extensions
- Required for H5P content.json media file references
- Comprehensive MIME type database

### buffer-image-size
- Extract image dimensions without full image decoding
- Required for H5P image metadata
- Supports all common image formats (JPEG, PNG, GIF, WebP)

## Future Considerations

### Testing Infrastructure
- Add Jest for comprehensive test coverage
- Unit tests for each handler
- Integration tests for full workflow
- Mock HandlerContext for isolated testing

### Advanced CSV Features
- CSV validation tools
- Multi-file CSV inputs
- Auto-detection of CSV format

### Performance Optimization
- Parallel CSV processing for batch operations
- Streaming for large CSV files
- Package compression optimization

### Content Type Expansion
- Community-contributed handlers for additional H5P content types
- Handler marketplace or registry
- Handler versioning and compatibility
