# POC Validation Guide

This guide provides step-by-step instructions for validating the generated biology-lesson.h5p package on H5P platforms.

---

## Prerequisites

Before you begin validation:

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Set up Anthropic API key**:
   ```bash
   export ANTHROPIC_API_KEY="your-api-key-here"
   ```

   Or create a `.env` file in the project root:
   ```
   ANTHROPIC_API_KEY=your-api-key-here
   ```

3. **Verify test media files exist**:
   ```bash
   ls -lh tests/test-image.jpg tests/test-audio.mp3
   ```

---

## Step 1: Build and Run POC Script

1. **Build the TypeScript code:**
   ```bash
   npm run build
   ```

2. **Run the POC demo script:**
   ```bash
   node dist/examples/poc-demo.js
   ```

3. **Expected output:**
   The script should display progress messages for each step:
   - Step 1: Parsing YAML input
   - Step 2: Fetching H5P libraries from Hub
   - Step 3: Checking for quiz content
   - Step 4: Initializing AI components
   - Step 5: Building book content (with AI generation)
   - Step 6: Validating content structure
   - Step 7: Assembling .h5p package
   - Step 8: Saving package to disk

4. **Verify output file exists:**
   ```bash
   ls -lh examples/biology-lesson.h5p
   ```

   The file should be several MB in size (due to bundled libraries).

---

## Step 2: Inspect Package Structure (Optional)

To manually verify the package structure:

1. **Unzip the package:**
   ```bash
   unzip -q examples/biology-lesson.h5p -d examples/biology-lesson-extracted
   ```

2. **Check structure:**
   ```bash
   tree examples/biology-lesson-extracted -L 2
   ```

   Expected structure:
   ```
   biology-lesson-extracted/
   ├── h5p.json
   ├── content/
   │   ├── content.json
   │   ├── images/
   │   │   └── 0.jpg (or similar)
   │   └── audios/
   │       └── 0.mp3 (or similar)
   ├── H5P.InteractiveBook-1.8/
   ├── H5P.MultipleChoice-1.16/
   ├── H5P.Column-1.18/
   ├── H5P.AdvancedText-1.1/
   ├── H5P.Image-1.1/
   ├── H5P.Audio-1.5/
   └── [other library directories]
   ```

3. **Inspect h5p.json:**
   ```bash
   cat examples/biology-lesson-extracted/h5p.json | jq
   ```

   Verify:
   - `title`: "AI-Generated Biology Lesson"
   - `language`: "en"
   - `mainLibrary`: "H5P.InteractiveBook"
   - `preloadedDependencies`: array of all libraries

4. **Inspect content.json:**
   ```bash
   cat examples/biology-lesson-extracted/content/content.json | jq '.chapters | length'
   ```

   Should show: 4 (chapters)

---

## Step 3: Validate on H5P.com

### 3.1 Upload to H5P.com

1. **Go to H5P.com:**
   - Navigate to https://h5p.com
   - Create a free account if you don't have one
   - Log in to your account

2. **Create new content:**
   - Click "Create new content" or "Upload"
   - Select "Upload" option
   - Choose `examples/biology-lesson.h5p`
   - Click "Upload"

3. **Wait for validation:**
   - H5P.com will validate the package
   - Watch for any error messages
   - If validation fails, note the exact error message

### 3.2 Test Interactive Book

Once uploaded successfully:

1. **View the book:**
   - Click to view/preview the content
   - Verify book title: "AI-Generated Biology Lesson"

2. **Chapter 1: Introduction to Photosynthesis**
   - Navigate to first chapter
   - Verify AI-generated text is present
   - Check for proper formatting
   - Verify text is educational and accurate
   - Take screenshot: `poc-results-chapter1.png`

3. **Chapter 2: Cell Structure**
   - Navigate to second chapter
   - Verify static text displays
   - Verify image displays correctly
   - Check image is not broken/corrupted
   - Take screenshot: `poc-results-chapter2.png`

4. **Chapter 3: Audio Narration**
   - Navigate to third chapter
   - Verify text displays
   - Click play on audio player
   - Verify audio plays (even if silent test file)
   - Check audio controls work (play/pause)
   - Take screenshot: `poc-results-chapter3.png`

5. **Chapter 4: Test Your Knowledge**
   - Navigate to fourth chapter
   - Verify introduction text displays
   - Count number of quiz questions (should be 5)
   - For each question:
     - Verify question text is relevant to photosynthesis
     - Verify 4 answer options are shown
     - Select an answer and click "Check"
     - Verify feedback is displayed
     - Verify "Retry" and "Show solution" buttons work
   - Take screenshot: `poc-results-chapter4.png`

6. **Browser console check:**
   - Open browser developer tools (F12)
   - Check Console tab for errors
   - Note any warnings or errors

### 3.3 Validation Checklist

Record results in `poc-results.md`:

- [ ] Package uploads without errors
- [ ] Validation passes
- [ ] Book displays with correct title
- [ ] Chapter navigation works
- [ ] AI-generated text (Chapter 1) displays correctly
- [ ] Image (Chapter 2) displays correctly
- [ ] Audio (Chapter 3) plays correctly
- [ ] Quiz questions (Chapter 4) display
- [ ] Quiz answers can be checked
- [ ] Quiz provides feedback
- [ ] No browser console errors

---

## Step 4: Validate in Lumi H5P Editor

### 4.1 Install Lumi (if not already installed)

1. **Download Lumi:**
   - Visit https://lumi.education/
   - Download Lumi for your operating system
   - Install the application

2. **Launch Lumi:**
   - Open the Lumi H5P Editor application

### 4.2 Open Package in Lumi

1. **Open file:**
   - In Lumi, click "Open" or "Import"
   - Navigate to `examples/biology-lesson.h5p`
   - Click to open

2. **Wait for loading:**
   - Lumi will parse the package
   - Note any error messages

### 4.3 Test Editability

1. **View structure:**
   - Navigate through the chapter list
   - Verify all 4 chapters are visible
   - Take screenshot: `lumi-structure.png`

2. **Edit text content:**
   - Open Chapter 1
   - Try editing the AI-generated text
   - Verify changes are saved

3. **Edit media:**
   - Open Chapter 2
   - Try replacing the image
   - Verify new image displays

4. **Edit quiz:**
   - Open Chapter 4
   - Try editing a quiz question
   - Verify changes are saved

5. **Preview:**
   - Use Lumi's preview function
   - Verify content displays correctly

6. **Re-save:**
   - Save the package as a new file
   - Verify no errors on save

### 4.4 Validation Checklist

Record results in `poc-results.md`:

- [ ] Package opens in Lumi without errors
- [ ] All chapters visible in editor
- [ ] Text content is editable
- [ ] Images can be modified
- [ ] Audio can be modified
- [ ] Quiz questions can be edited
- [ ] Preview works correctly
- [ ] Package can be saved after modifications
- [ ] Re-saved package uploads to H5P.com successfully

---

## Step 5: Document Results

1. **Update poc-results.md:**
   - Fill in all [TO BE COMPLETED] sections
   - Record package details (file size, libraries count)
   - Document validation results from H5P.com
   - Document validation results from Lumi
   - Evaluate AI-generated content quality
   - List any issues discovered
   - Add performance metrics
   - Provide recommendations

2. **Save screenshots:**
   ```bash
   mkdir -p agent-os/specs/template-free-h5p-compiler-poc/verification/screenshots
   ```

   Save screenshots to this directory:
   - `h5p-com-chapter1.png`
   - `h5p-com-chapter2.png`
   - `h5p-com-chapter3.png`
   - `h5p-com-chapter4.png`
   - `lumi-structure.png`
   - `lumi-preview.png`

3. **Document timing:**
   - Note how long each step took
   - Record library download vs cached times
   - Record AI generation times

---

## Troubleshooting

### POC Script Fails

**Issue:** Script fails with library download errors

**Solution:**
- Check internet connection
- Verify H5P Hub API is accessible: `curl https://api.h5p.org/v1/content-types`
- Check `content-type-cache/` directory permissions

**Issue:** AI generation fails

**Solution:**
- Verify ANTHROPIC_API_KEY is set correctly
- Check API key has sufficient credits
- Test API key: `curl https://api.anthropic.com/v1/messages -H "x-api-key: YOUR_KEY" -H "anthropic-version: 2023-06-01"`
- Fallback: Script will add error message to content instead of failing completely

**Issue:** Media files not found

**Solution:**
- Verify `tests/test-image.jpg` and `tests/test-audio.mp3` exist
- Check file paths in `biology-lesson.yaml` are correct
- Use absolute paths if relative paths fail

### Upload Fails on H5P.com

**Issue:** Package rejected by H5P.com validator

**Solution:**
- Unzip package and inspect structure manually
- Check h5p.json format
- Verify all library directories are present
- Check content.json for malformed JSON

**Issue:** Content displays incorrectly

**Solution:**
- Check browser console for JavaScript errors
- Verify library versions match those expected
- Compare structure to manually-created Interactive Book

### Lumi Opens Package but Shows Errors

**Issue:** Lumi reports validation errors

**Solution:**
- Check Lumi version (use latest)
- Try opening a known-good H5P package first
- Check Lumi console/logs for detailed error messages

---

## Success Criteria

The POC is considered successful if:

1. **Generation:** Script runs without fatal errors and produces biology-lesson.h5p
2. **Validation:** Package passes H5P.com validation
3. **Display:** All 4 chapters display correctly on H5P.com
4. **Functionality:** Images display, audio plays, quiz works
5. **AI Quality:** Generated text and quiz questions are educationally sound
6. **Editability:** Package opens and edits in Lumi
7. **Template-Free:** No template files were used (libraries fetched from Hub)

---

## Next Steps After Validation

Based on POC results:

1. **If successful:**
   - Document findings in poc-results.md
   - Identify production readiness gaps
   - Plan CLI interface implementation
   - Plan additional content type support
   - Consider handler architecture migration

2. **If issues found:**
   - Document all issues in poc-results.md
   - Prioritize critical vs nice-to-have fixes
   - Determine if issues are blockers
   - Plan remediation work

3. **Share results:**
   - Update tasks.md with completion status
   - Share poc-results.md with team
   - Provide recommendation for production implementation
