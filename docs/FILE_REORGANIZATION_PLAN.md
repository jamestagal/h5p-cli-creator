# File Reorganization Plan

## Current Structure (Messy)

```
src/
├── index.ts                          # CLI entry point
├── models/                           # ✅ Good organization
│   ├── h5p-audio.ts
│   ├── h5p-content.ts
│   ├── h5p-copyright-information.ts
│   ├── h5p-flashcards-content.ts
│   ├── h5p-image.ts
│   └── ...
├── compiler/                         # ✅ Good organization
│   ├── LibraryRegistry.ts
│   ├── ContentBuilder.ts
│   ├── ChapterBuilder.ts
│   └── ...
├── ai/                               # ✅ Good organization
│   ├── QuizGenerator.ts
│   └── types.ts
├── flashcards-module.ts              # ❌ Mixed with root
├── flashcards-creator.ts             # ❌ Mixed with root
├── dialogcards-module.ts             # ❌ Mixed with root
├── dialogcards-creator.ts            # ❌ Mixed with root
├── interactive-book-module.ts        # ❌ Mixed with root
├── interactive-book-creator.ts       # ❌ Mixed with root
├── interactive-book-ai-module.ts     # ❌ Mixed with root
├── content-creator.ts                # ❌ Mixed with root
└── h5p-package.ts                    # ❌ Mixed with root
```

**Problems:**
1. Module files mixed with root (flashcards-module.ts, etc.)
2. Creator files mixed with root (flashcards-creator.ts, etc.)
3. No clear separation between CSV-based and AI-based workflows
4. Utility files (h5p-package.ts) mixed with business logic

## Proposed Structure (Organized)

```
src/
├── index.ts                          # CLI entry point (unchanged)
│
├── models/                           # H5P content models (unchanged)
│   ├── h5p-audio.ts
│   ├── h5p-content.ts
│   ├── h5p-copyright-information.ts
│   ├── h5p-flashcards-content.ts
│   ├── h5p-dialogcards-content.ts
│   ├── h5p-interactivebook-content.ts
│   └── h5p-image.ts
│
├── compiler/                         # Template-free compiler (unchanged)
│   ├── LibraryRegistry.ts            # Cache-first library management
│   ├── SemanticValidator.ts          # Content validation
│   ├── ContentBuilder.ts             # Fluent API for building
│   ├── ChapterBuilder.ts             # Chapter-level builder
│   ├── PackageAssembler.ts           # .h5p package generation
│   ├── YamlInputParser.ts            # YAML parsing
│   └── types.ts
│
├── ai/                               # AI content generation (unchanged)
│   ├── QuizGenerator.ts              # AI quiz generation
│   ├── TextGenerator.ts              # Future: AI text generation
│   ├── FlashcardGenerator.ts         # Future: AI flashcard generation
│   └── types.ts
│
├── modules/                          # CLI command modules (NEW)
│   ├── csv/                          # CSV-based commands (legacy)
│   │   ├── flashcards-module.ts      # CSV → Flashcards
│   │   ├── dialogcards-module.ts     # CSV → Dialog Cards
│   │   └── interactive-book-module.ts # CSV → Interactive Book
│   └── ai/                           # AI-based commands (new)
│       └── interactive-book-ai-module.ts # YAML+AI → Interactive Book
│
├── creators/                         # Content creators (NEW)
│   ├── base/                         # Shared base classes
│   │   └── content-creator.ts        # Abstract base creator
│   └── csv/                          # CSV-based creators (legacy)
│       ├── flashcards-creator.ts
│       ├── dialogcards-creator.ts
│       └── interactive-book-creator.ts
│
└── utils/                            # Shared utilities (NEW)
    └── h5p-package.ts                # H5P package utilities
```

## Migration Steps

### Step 1: Create New Directories

```bash
mkdir -p src/modules/csv
mkdir -p src/modules/ai
mkdir -p src/creators/base
mkdir -p src/creators/csv
mkdir -p src/utils
```

### Step 2: Move Module Files

```bash
# CSV-based modules
git mv src/flashcards-module.ts src/modules/csv/
git mv src/dialogcards-module.ts src/modules/csv/
git mv src/interactive-book-module.ts src/modules/csv/

# AI-based modules
git mv src/interactive-book-ai-module.ts src/modules/ai/
```

### Step 3: Move Creator Files

```bash
# Base creator
git mv src/content-creator.ts src/creators/base/

# CSV-based creators
git mv src/flashcards-creator.ts src/creators/csv/
git mv src/dialogcards-creator.ts src/creators/csv/
git mv src/interactive-book-creator.ts src/creators/csv/
```

### Step 4: Move Utility Files

```bash
git mv src/h5p-package.ts src/utils/
```

### Step 5: Update Import Paths

**In index.ts:**
```typescript
// Before
import { FlashcardsModule } from "./flashcards-module";
import { DialogCardsModule } from "./dialogcards-module";
import { InteractiveBookModule } from "./interactive-book-module";
import { InteractiveBookAIModule } from "./interactive-book-ai-module";

// After
import { FlashcardsModule } from "./modules/csv/flashcards-module";
import { DialogCardsModule } from "./modules/csv/dialogcards-module";
import { InteractiveBookModule } from "./modules/csv/interactive-book-module";
import { InteractiveBookAIModule } from "./modules/ai/interactive-book-ai-module";
```

**In all creator files:**
```typescript
// Before
import { ContentCreator } from "./content-creator";
import { H5pPackage } from "./h5p-package";

// After
import { ContentCreator } from "../base/content-creator";
import { H5pPackage } from "../../utils/h5p-package";
```

**In all module files:**
```typescript
// Before
import { FlashcardsCreator } from "./flashcards-creator";
import { H5pPackage } from "./h5p-package";

// After
import { FlashcardsCreator } from "../../creators/csv/flashcards-creator";
import { H5pPackage } from "../../utils/h5p-package";
```

### Step 6: Test After Reorganization

```bash
npm run build
node ./dist/index.js --help
node ./dist/index.js flashcards --help
node ./dist/index.js interactivebook-ai --help
```

## Benefits

### 1. Clear Separation of Concerns

- **models/**: Data structures only
- **compiler/**: Template-free infrastructure
- **ai/**: AI integration only
- **modules/**: CLI commands only
- **creators/**: Content generation logic only
- **utils/**: Shared utilities

### 2. Workflow Visibility

```
modules/
├── csv/     ← Legacy CSV-based workflow
└── ai/      ← New AI-powered workflow
```

Clear distinction between old and new approaches.

### 3. Easier Navigation

Instead of scrolling through 20+ mixed files, navigate by purpose:
- Need to add a CLI command? → `modules/`
- Need to modify content creation? → `creators/`
- Need to tweak AI? → `ai/`

### 4. Future Extensibility

Adding new content types becomes obvious:

```
modules/
├── csv/
│   ├── flashcards-module.ts
│   └── course-presentation-module.ts    ← New!
└── ai/
    ├── interactive-book-ai-module.ts
    └── flashcards-ai-module.ts          ← New!
```

### 5. Handler Architecture Ready

When implementing the handler architecture (future), the structure becomes:

```
src/
├── modules/
│   └── generic-ai-module.ts             # Single module for all types
├── handlers/                            # NEW
│   ├── base/
│   │   └── content-handler.ts           # Handler interface
│   └── implementations/
│       ├── flashcards-handler.ts
│       ├── dialogcards-handler.ts
│       └── interactive-book-handler.ts
└── creators/                            # Can be deprecated eventually
```

## Backward Compatibility

**All imports within the project are updated**, so:
- ✅ Users: No change (CLI commands work the same)
- ✅ Tests: Update import paths
- ✅ Examples: Update import paths
- ❌ External users: If anyone imports these files directly (unlikely), their imports break

## Automation Script

Want to automate this? I can create a migration script:

```bash
#!/bin/bash
# scripts/reorganize-files.sh

# Creates directories
# Moves files with git mv
# Updates import paths with sed
# Runs build to verify
```

## Recommendation

**Do this in a separate commit/PR** so you can:
1. Review changes easily
2. Revert if needed
3. Keep git history clean

**Or do it incrementally:**
1. Start with just modules/ (move module files)
2. Then creators/ (move creator files)
3. Then utils/ (move utility files)

Each step can be a separate commit.

## Alternative: Minimal Reorganization

If full reorganization is too disruptive, do minimal:

```
src/
├── modules/                          # NEW: All module files
│   ├── flashcards-module.ts
│   ├── dialogcards-module.ts
│   ├── interactive-book-module.ts
│   └── interactive-book-ai-module.ts
└── creators/                         # NEW: All creator files
    ├── content-creator.ts
    ├── flashcards-creator.ts
    ├── dialogcards-creator.ts
    └── interactive-book-creator.ts
```

This alone reduces root clutter from 9 files to 2.

---

**Would you like me to:**
1. **Create the full migration script**?
2. **Implement the minimal reorganization now** (safer, smaller change)?
3. **Wait and plan this for a future PR**?
