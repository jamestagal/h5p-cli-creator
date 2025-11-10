# H5P Platform Testing Instructions for Essay Handler

## Prerequisites

Before testing, you need to add H5P.Essay-1.5 library to the cache:

1. **Download H5P.Essay-1.5** from a working H5P platform (h5p.com, Moodle, or WordPress)
   - Create a sample essay question manually in the H5P editor
   - Download the .h5p file
   - Extract it and find the H5P.Essay library folder
   - Package it as `H5P.Essay-1.5.h5p` and place in `content-type-cache/`

2. **Alternative**: Request H5P.Essay library from H5P Hub (requires API access)

## Test Package Generation

Once H5P.Essay-1.5 is in cache, generate test packages:

### Manual Essay Test Package

```bash
# Build project
npm run build

# Generate manual essay test package
GOOGLE_API_KEY="dummy-key" node dist/index.js interactivebook-ai \
  examples/yaml/essay-test-manual-only.yaml \
  essay-manual-test.h5p \
  --verbose
```

### AI Essay Test Package (requires real API key)

```bash
# Generate AI essay test package
GOOGLE_API_KEY="your-actual-api-key" node dist/index.js interactivebook-ai \
  examples/yaml/essay-example.yaml \
  essay-ai-test.h5p \
  --verbose
```

## Task 6.5: Manual Essay Testing on h5p.com

### Test Package: essay-manual-test.h5p

**Upload Steps:**
1. Navigate to https://h5p.com
2. Log in to your account
3. Click "Create new content"
4. Upload `essay-manual-test.h5p`
5. Verify upload completes without errors

**Test Scenarios:**

#### Scenario 1: Simple Essay with Basic Keywords
**Location:** Chapter "Test Essays" > "Simple Essay"

**Test Steps:**
1. Open the essay question
2. Read task description: "Write about the Sun."
3. Verify minimum/maximum character limits displayed (50-300 characters)
4. Type essay containing keywords: "star" and "light"
5. Click "Check" button
6. **Expected Result:**
   - Score calculated based on keyword matches
   - Feedback shows which keywords were found
   - Each keyword worth 10 points (total 20 points possible)

**Verification Checklist:**
- [ ] Character count indicator shows min/max (50/300)
- [ ] Character count updates as you type
- [ ] Cannot submit if below minimum length
- [ ] Warning if approaching maximum length
- [ ] Score increases when keywords "star" and "light" are included
- [ ] Retry button works correctly
- [ ] Can modify answer and recheck

#### Scenario 2: Essay with Keyword Alternatives
**Location:** Chapter "Test Essays" > "Essay with Alternatives"

**Test Steps:**
1. Open the essay question
2. Read task description: "Describe planets."
3. Type essay with keyword "rocky" → expect score increase
4. Retry and type essay with alternative "terrestrial" → expect same score
5. Retry and type essay with alternative "solid" → expect same score
6. Repeat for "gas" vs "gaseous"

**Expected Results:**
- All alternatives ("rocky", "terrestrial", "solid") should be accepted as correct
- All alternatives ("gas", "gaseous") should be accepted as correct
- Score should be same regardless of which alternative is used

**Verification Checklist:**
- [ ] Keyword "rocky" scores 10 points
- [ ] Alternative "terrestrial" scores 10 points (same as "rocky")
- [ ] Alternative "solid" scores 10 points (same as "rocky")
- [ ] Keyword "gas" scores 10 points
- [ ] Alternative "gaseous" scores 10 points (same as "gas")
- [ ] Maximum score is 20 points (10 per keyword group)

#### Scenario 3: Essay with Sample Solution
**Location:** Chapter "Test Essays" > "Essay with Solution"

**Test Steps:**
1. Open the essay question
2. Read task description: "Explain gravity."
3. Type a response (with or without correct keywords)
4. Click "Check" to see score
5. Click "Show solution" button

**Expected Results:**
- Sample solution introduction displays: "A good answer explains what gravity is."
- Sample solution text displays: "Gravity is a force that attracts objects with mass toward each other."
- Sample solution is clearly formatted and readable

**Verification Checklist:**
- [ ] "Show solution" button is visible after checking
- [ ] Sample solution introduction displays correctly
- [ ] Sample solution text displays correctly
- [ ] Sample solution helps user understand expected answer
- [ ] Can close sample solution and retry

#### Scenario 4: Essay with Media
**Location:** Chapter "Test Essays" > "Essay with Media"

**Test Steps:**
1. Open the essay question
2. Verify image displays above the task description
3. Verify image alt text is accessible (check with screen reader or browser inspector)
4. Type essay describing the image
5. Include keyword "image" in response
6. Check answer

**Expected Results:**
- Image displays correctly above task
- Image has alt text "Test image"
- Essay input field displays below media
- Keyword matching works correctly with media present

**Verification Checklist:**
- [ ] Image displays above task description
- [ ] Image has proper alt text for accessibility
- [ ] Image does not interfere with essay input
- [ ] Keyword matching works as expected
- [ ] Character limits apply correctly

## Task 6.6: AI Essay Testing on h5p.com

### Test Package: essay-ai-test.h5p

**Note:** This requires a valid AI API key during generation.

**Upload Steps:**
1. Navigate to https://h5p.com
2. Log in to your account
3. Click "Create new content"
4. Upload `essay-ai-test.h5p`
5. Verify upload completes without errors

**Test Scenarios:**

#### Scenario 1: AI-Generated Essay (Easy Difficulty)
**Expected Content Characteristics:**
- 3-5 keywords
- 50-200 character range
- Simple vocabulary
- Common terms
- Basic sentence structure

**Test Steps:**
1. Open AI-generated essay with "easy" difficulty
2. Read AI-generated task description
3. Verify task description is coherent and appropriate
4. Verify keywords are relevant to the prompt topic
5. Type response using various AI-generated keywords
6. Check answer and verify scoring works

**Verification Checklist:**
- [ ] Task description is grammatically correct
- [ ] Task description is appropriate for prompt topic
- [ ] Number of keywords is 3-5 (check by testing different keywords)
- [ ] Vocabulary is simple and appropriate for easy level
- [ ] Alternative keywords (if generated) are relevant synonyms
- [ ] Sample solution (if generated) is helpful and clear
- [ ] Keyword matching works correctly
- [ ] Scoring is fair and accurate

#### Scenario 2: AI-Generated Essay (Medium Difficulty)
**Expected Content Characteristics:**
- 5-7 keywords
- 100-500 character range
- Moderate vocabulary
- Subject-specific terms
- Analytical thinking required

**Test Steps:**
1. Open AI-generated essay with "medium" difficulty
2. Verify complexity is higher than easy difficulty
3. Verify keywords require more subject knowledge
4. Test keyword matching with alternatives
5. Review sample solution quality

**Verification Checklist:**
- [ ] Task description is more complex than easy
- [ ] Number of keywords is 5-7
- [ ] Keywords are subject-specific (not just common terms)
- [ ] Alternatives show understanding of synonyms/related terms
- [ ] Character range is 100-500
- [ ] Sample solution demonstrates expected depth of analysis

#### Scenario 3: AI-Generated Essay (Hard Difficulty)
**Expected Content Characteristics:**
- 7-10 keywords
- 200-1000 character range
- Advanced vocabulary
- Technical terms
- Complex analysis required

**Test Steps:**
1. Open AI-generated essay with "hard" difficulty
2. Verify task requires deep understanding
3. Verify keywords are technical/advanced
4. Test that essay requires substantial writing (200+ chars)
5. Verify sample solution is comprehensive

**Verification Checklist:**
- [ ] Task description requires complex analysis
- [ ] Number of keywords is 7-10
- [ ] Keywords are technical/specialized terms
- [ ] Vocabulary is advanced and subject-specific
- [ ] Character range is 200-1000
- [ ] Sample solution is comprehensive and detailed
- [ ] Task is appropriately challenging

## Task 6.7: Interactive Book Embedding

### Test: Essay in Interactive Book Context

**Test Steps:**
1. Upload essay test package to h5p.com
2. Navigate through Interactive Book chapters
3. Test essay questions within book context
4. Navigate to next chapter, then back to essay
5. Verify state persistence

**Verification Checklist:**
- [ ] Essays render correctly within Interactive Book layout
- [ ] Navigation between chapters works smoothly
- [ ] Essay text is saved when navigating away
- [ ] Essay score is saved when navigating away
- [ ] Returning to essay chapter restores previous state
- [ ] Media (images) display correctly in book context
- [ ] Multiple essays in same book work independently
- [ ] Book progress bar updates correctly after completing essays

## Task 6.8: Bugs to Avoid Verification

### Wildcard and Regex Preservation

**Test Method:** Generate package and inspect content.json

```bash
# Extract and inspect H5P package
unzip -q essay-manual-test.h5p -d /tmp/essay-test
cat /tmp/essay-test/content/content.json | grep -o '\*[^"]*\*' | head -5
```

**Verification Checklist:**
- [ ] Wildcard `*` characters preserved without escaping (e.g., `*photo*` not `\\*photo\\*`)
- [ ] Regex `/pattern/` format preserved without modification
- [ ] Test with wildcard keyword: type "photograph" for keyword "*photo*" → should match
- [ ] Test with wildcard keyword: type "photosynthesis" for keyword "*photo*" → should match
- [ ] Wildcards work in actual H5P platform (not just in content.json)

### Keyword Alternatives Handling

**Verification Checklist:**
- [ ] Alternatives validated as array of strings during generation
- [ ] Alternatives passed correctly to H5P structure (not concatenated or modified)
- [ ] Multiple alternatives per keyword work (tested in Scenario 2 above)
- [ ] Empty alternatives array doesn't cause errors
- [ ] AI-generated alternatives are relevant synonyms

### Character Length Validation

**Verification Checklist:**
- [ ] maximumLength > minimumLength validation passes
- [ ] Cannot create essay with maxLength ≤ minLength (build should fail)
- [ ] Character count indicator displays correctly
- [ ] Cannot submit essay below minimum length
- [ ] Warning shown when approaching maximum length

### HTML Stripping from AI Responses

**Test Method:** Inspect AI-generated content in content.json

**Verification Checklist:**
- [ ] No nested HTML tags (e.g., `<p><p>Text</p></p>`)
- [ ] No `<strong>`, `<em>`, or other inline HTML from AI
- [ ] Task descriptions properly wrapped in single `<p>` tags
- [ ] No escaped HTML entities that shouldn't be escaped

### SubContentId Generation

**Test Method:** Inspect content.json for unique IDs

```bash
# Extract and check subContentIds
cat /tmp/essay-test/content/content.json | grep -o '"subContentId":"[^"]*"' | sort | uniq | wc -l
```

**Verification Checklist:**
- [ ] Each Essay has unique subContentId
- [ ] Media content has unique subContentId (different from Essay)
- [ ] IDs are non-empty strings
- [ ] IDs follow pattern: timestamp-randomString

### Feedback String Length Validation

**Verification Checklist:**
- [ ] Cannot create keyword with feedbackIncluded > 1000 chars (build should fail)
- [ ] Cannot create keyword with feedbackMissed > 1000 chars (build should fail)
- [ ] Feedback displays correctly in H5P player (not truncated)
- [ ] Task description > 10000 chars fails validation

### Per-Keyword Points and Occurrences

**Test Steps:**
1. Create essay with keyword: points=10, occurrences=2
2. Type essay with keyword appearing 3 times
3. Check score

**Verification Checklist:**
- [ ] Points must be positive number (negative points fail validation)
- [ ] Occurrences must be positive integer (negative occurrences fail validation)
- [ ] Score calculation respects occurrences limit
- [ ] Default points (1) applied when not specified
- [ ] Default occurrences (1) applied when not specified

## Summary: Testing Completion Criteria

All tests pass when:

- [ ] All 4 manual essay scenarios work correctly on h5p.com
- [ ] All 3 AI essay difficulty levels produce appropriate content
- [ ] Interactive Book embedding works without errors
- [ ] State persistence works across chapter navigation
- [ ] All 15 items in "Bugs to Avoid" checklist verified
- [ ] No errors during package upload to h5p.com
- [ ] No console errors in browser when using essays
- [ ] Keyword matching works correctly (including wildcards and alternatives)
- [ ] Sample solutions display correctly
- [ ] Media displays correctly
- [ ] Scoring is accurate
- [ ] Retry functionality works
- [ ] Character limits are enforced

## Troubleshooting

### Package Upload Fails

**Symptom:** h5p.com rejects package upload

**Solutions:**
1. Check H5P.Essay library version in cache (must be 1.5)
2. Verify content.json structure matches H5P.Essay semantics
3. Check for missing dependencies in library.json
4. Inspect package structure (should have content/, H5P.Essay-1.5/, etc.)

### Keywords Don't Match

**Symptom:** Essay score doesn't increase when typing keywords

**Solutions:**
1. Verify wildcards not escaped (check content.json)
2. Check caseSensitive setting (default: true)
3. Verify alternatives array structure
4. Test with exact keyword first, then alternatives

### Media Doesn't Display

**Symptom:** Image/video/audio not showing in essay

**Solutions:**
1. Verify media file included in package (content/images/, content/videos/, etc.)
2. Check media paths in content.json (relative paths)
3. Verify media subContentId generated
4. Check media library (H5P.Image, H5P.Video, H5P.Audio) included

### AI Content Quality Issues

**Symptom:** AI-generated essays are incoherent or irrelevant

**Solutions:**
1. Verify API key is valid and has quota
2. Check prompt clarity and specificity
3. Review aiConfig settings (targetAudience, tone)
4. Test with different difficulty levels
5. Review verbose logs for AI response parsing errors
