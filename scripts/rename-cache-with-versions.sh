#!/bin/bash
# Script to rename cached H5P libraries with version numbers
# Extracts version from library.json and renames files

set -e

CACHE_DIR="content-type-cache"

echo "=== Renaming Cache Files with Version Numbers ==="
echo ""

cd "$CACHE_DIR"

for h5p_file in *.h5p; do
  # Skip if already has version number
  if [[ "$h5p_file" =~ -[0-9]+\.[0-9]+\.h5p$ ]]; then
    echo "✓ $h5p_file - Already versioned, skipping"
    continue
  fi

  echo "Processing: $h5p_file"

  # Extract library name without .h5p
  lib_name="${h5p_file%.h5p}"

  # Extract library.json to get version
  # First, get h5p.json to find main library directory
  main_lib=$(unzip -p "$h5p_file" h5p.json | grep -o '"mainLibrary":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$main_lib" ]; then
    echo "  ⚠️  Could not find mainLibrary in h5p.json, skipping"
    continue
  fi

  # Extract library.json from the main library directory
  # Try to find the library directory (it might have version suffix)
  lib_dir=$(unzip -l "$h5p_file" | grep -o "${lib_name}[^/]*/library.json" | head -1 | cut -d'/' -f1)

  if [ -z "$lib_dir" ]; then
    echo "  ⚠️  Could not find library directory, skipping"
    continue
  fi

  # Extract version from library.json
  major=$(unzip -p "$h5p_file" "$lib_dir/library.json" | grep -o '"majorVersion":[0-9]*' | cut -d':' -f2)
  minor=$(unzip -p "$h5p_file" "$lib_dir/library.json" | grep -o '"minorVersion":[0-9]*' | cut -d':' -f2)

  if [ -z "$major" ] || [ -z "$minor" ]; then
    echo "  ⚠️  Could not extract version, skipping"
    continue
  fi

  # New filename with version
  new_name="${lib_name}-${major}.${minor}.h5p"

  if [ "$h5p_file" = "$new_name" ]; then
    echo "  ✓ Already has correct name"
    continue
  fi

  # Rename
  echo "  Renaming: $h5p_file → $new_name (v$major.$minor)"
  git mv "$h5p_file" "$new_name"
done

cd ..

echo ""
echo "=== Rename Complete ==="
echo ""
echo "Updated files:"
ls -lh "$CACHE_DIR"/*.h5p | awk '{print "  " $9 " (" $5 ")"}'
