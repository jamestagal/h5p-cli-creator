# h5p-cli-creator

This is a command line utility that allows you to mass create H5P content from input files using the command line. It is written in TypeScript and runs on NodeJS, meaning it's platform independent. Currently, it supports the **Flashcards**, **Dialog Cards**, and **Interactive Book** content types, but you can use the infrastructure provided here to add functionality for other content types. Pull requests are welcomed!

## Run
* Install [NodeJS](https://nodejs.org/)
* [clone this repository](https://help.github.com/articles/cloning-a-repository/) into a directory on your computer
* Execute these commands from the command line at the directory you've cloned into:
* `npm install` to install dependencies
* `npm run build` to transpile typescript to javascript
* `node ./dist/index.js --help` to get help
* `node ./dist/index.js flashcards --help` to get help for creating flashcards
* `node ./dist/index.js dialogcards --help` to get help for creating dialog cards
* `node ./dist/index.js interactivebook --help` to get help for creating interactive books

## Supported Content Types

### Flashcards
Create flashcard decks for learning and memorization.

**Example:**
```bash
node ./dist/index.js flashcards ./tests/flash1.csv ./outputfile.h5p -l=de -t="Meine Karteikarten" --description="Schreibe die Übersetzungen in das Eingabefeld."
```

Reads the file `flash1.csv` in the `tests` directory and outputs a h5p file with the filename `outputfile.h5p` in the current directory. The language strings will be set to German, the title 'Meine Karteikarten' and the description displayed when studying the flashcards will be 'Schreibe die Übersetzungen in das Eingabefeld.'

### Dialog Cards
Create dialog cards with audio and images for language learning.

**Example:**
```bash
node ./dist/index.js dialogcards ./tests/dialog1.csv ./outputfile.h5p -l=de -n="Meine Karteikarten" -m="repetition"
```

Reads the file `dialog1.csv` in the `tests` directory and outputs a h5p file with the filename `outputfile.h5p` in the current directory. The language strings will be set to German and the title to 'Meine Karteikarten'.

### Interactive Book
Create interactive digital storybooks with text, images, and audio narration.

**Example:**
```bash
node ./dist/index.js interactivebook ./tests/book1.csv ./outputfile.h5p -l=en -t="My Story Book"
```

Reads the file `book1.csv` and creates an Interactive Book H5P package with English language settings and the title "My Story Book".

**CSV Format:**

Required columns:
- `bookTitle` - Title of the entire book (used from first row)
- `pageTitle` - Title for each page/chapter
- `pageText` - Main text content for the page (supports multiple paragraphs with double newlines)

Optional columns:
- `imagePath` - Path to image file (local or URL starting with http:// or https://)
- `imageAlt` - Alt text for accessibility
- `audioPath` - Path to audio narration file (local or URL)
- `coverDescription` - Book cover description (from first row only)

**CSV Example:**
```csv
bookTitle,pageTitle,pageText,imagePath,imageAlt,audioPath,coverDescription
"My Story","Introduction","Welcome to my story.

This is a great adventure.",,,,"A wonderful tale"
"My Story","Chapter 1","Once upon a time...",images/chapter1.jpg,An illustration,audios/narration1.mp3,
"My Story","Chapter 2","The adventure continues...",images/chapter2.jpg,Another scene,,
```

**CLI Options:**
- `-l, --language <code>` - Language code (default: "en")
- `-t, --title <title>` - Override book title from CSV
- `-d, --delimiter <char>` - CSV delimiter (default: ",")
- `-e, --encoding <enc>` - File encoding (default: "UTF-8")

**Media File Handling:**
- **Local files**: Paths are resolved relative to the CSV file location
  - Example: `images/chapter1.jpg` looks for file in same directory as CSV
- **URLs**: Images and audio can be downloaded from the web
  - Example: `https://example.com/image.jpg`
- Supported image formats: JPG, PNG, GIF, SVG
- Supported audio formats: MP3, WAV, OGG

**Known Limitations:**
- One image per page maximum
- One audio file per page maximum
- No video support
- No interactive elements (quizzes, drag-drop, etc.)
- Basic HTML formatting only (h2 for titles, p for paragraphs)
- Text formatting uses automatic paragraph detection (double newlines create new paragraphs)

## Coding conventions
All classes that exist in the actual H5P libraries or content types start with `H5p`, e.g. `H5pImage`. All classes that are part of the creator and don't exist in external libraries or content types don't start with this prefix.
