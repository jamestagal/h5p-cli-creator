#!/bin/bash
# Script to download H5P content types from h5p.org with proper versioning
# Downloads are saved as: ContentType-MajorVersion.MinorVersion.h5p

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

CACHE_DIR="../content-type-cache"
mkdir -p "$CACHE_DIR"

echo -e "${BLUE}=== H5P Content Type Downloader ===${NC}\n"

# Array of content types to download
# Format: "machine-name display-name download-url expected-version"
declare -a CONTENT_TYPES=(
  "H5P.Flashcards|Flashcards|https://h5p.org/sites/default/files/h5p/exports/h5p-flashcards-155.h5p|1.5"
  "H5P.DialogCards|Dialog Cards|https://h5p.org/sites/default/files/h5p/exports/h5p-dialog-cards-160.h5p|1.8"
  "H5P.InteractiveBook|Interactive Book|https://h5p.org/sites/default/files/h5p/exports/h5p-interactive-book-1-8-15.h5p|1.8"
  "H5P.MultiChoice|Multiple Choice|https://h5p.org/sites/default/files/h5p/exports/h5p-multi-choice-1-16-14.h5p|1.16"
  "H5P.CoursePresentation|Course Presentation|https://h5p.org/sites/default/files/h5p/exports/h5p-course-presentation-1-25-9.h5p|1.25"
  "H5P.Video|Interactive Video|https://h5p.org/sites/default/files/h5p/exports/h5p-interactive-video-1-26-9.h5p|1.26"
  "H5P.DragQuestion|Drag and Drop|https://h5p.org/sites/default/files/h5p/exports/h5p-drag-question-1-14-17.h5p|1.14"
  "H5P.Summary|Summary|https://h5p.org/sites/default/files/h5p/exports/h5p-summary-1-10-17.h5p|1.10"
  "H5P.SingleChoiceSet|Single Choice Set|https://h5p.org/sites/default/files/h5p/exports/h5p-single-choice-set-1-11-23.h5p|1.11"
  "H5P.FillInTheBlanks|Fill in the Blanks|https://h5p.org/sites/default/files/h5p/exports/h5p-fill-in-the-blanks-1-15-10.h5p|1.15"
)

echo "Downloading H5P content types to: $CACHE_DIR"
echo ""

for CONTENT_TYPE in "${CONTENT_TYPES[@]}"; do
  IFS='|' read -r MACHINE_NAME DISPLAY_NAME URL EXPECTED_VERSION <<< "$CONTENT_TYPE"

  OUTPUT_FILE="$CACHE_DIR/${MACHINE_NAME}-${EXPECTED_VERSION}.h5p"

  if [ -f "$OUTPUT_FILE" ]; then
    echo -e "${GREEN}✓${NC} $DISPLAY_NAME ($MACHINE_NAME-$EXPECTED_VERSION.h5p) - Already cached"
  else
    echo -e "${BLUE}↓${NC} Downloading $DISPLAY_NAME..."
    curl -L -o "$OUTPUT_FILE" "$URL" --silent --show-error

    if [ -f "$OUTPUT_FILE" ]; then
      FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
      echo -e "${GREEN}✓${NC} Downloaded $DISPLAY_NAME → $MACHINE_NAME-$EXPECTED_VERSION.h5p ($FILE_SIZE)"
    else
      echo -e "❌ Failed to download $DISPLAY_NAME"
    fi
  fi
  echo ""
done

echo -e "${GREEN}=== Download Complete ===${NC}"
echo ""
echo "Cached content types:"
ls -lh "$CACHE_DIR"/*.h5p | awk '{print "  " $9 " (" $5 ")"}'
echo ""
echo "Usage: These files will be automatically used by LibraryRegistry"
echo "       No manual intervention needed - cache-first strategy is now active!"
