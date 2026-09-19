export const READING_LEVEL_IDS = ["kindergarten", "elementary", "grade-1", "grade-2", "grade-3", "grade-4", "grade-5", "grade-6", "grade-7", "grade-8", "grade-9", "grade-10", "grade-11", "grade-12", "high-school", "college", "professional", "esl-beginner", "esl-intermediate"] as const;
export type ReadingLevel = (typeof READING_LEVEL_IDS)[number];
export const TONE_IDS = ["educational", "professional", "casual", "academic", "creative"] as const;
export type Tone = (typeof TONE_IDS)[number];

export interface ReadingLevelPreset { sentenceLength: string; vocabulary: string; style: string; examples: string; }

export const READING_LEVELS: Record<ReadingLevel, ReadingLevelPreset> = {
  kindergarten: { sentenceLength: "Use very simple sentences (3-5 words). Keep structure basic.", vocabulary: "Use concrete nouns and basic verbs only. Avoid abstract concepts completely.", style: "Use a warm, supportive tone. Use repetition for learning.", examples: "Use simple, tangible examples: colors, animals, family members, basic actions." },
  elementary: { sentenceLength: "Use very short sentences (8-12 words). Avoid complex sentence structures.", vocabulary: "Use simple, everyday vocabulary. Avoid technical terms. If a technical term is necessary, explain it in very simple words.", style: "Use a friendly, encouraging tone. Break concepts into very small steps.", examples: "Use concrete, tangible examples from everyday life. Avoid abstract concepts." },
  "grade-1": { sentenceLength: "Use simple sentences (5-7 words). Keep subject-verb-object order.", vocabulary: "Use common words and simple adjectives. Build basic vocabulary (100-300 words).", style: "Use a patient, encouraging tone. Use lots of repetition.", examples: "Use family, school, and playground examples. Keep very concrete." },
  "grade-2": { sentenceLength: "Use short sentences (7-10 words). Introduce basic compound sentences.", vocabulary: "Expand vocabulary to 300-500 words. Introduce simple descriptive language.", style: "Use a friendly, supportive tone. Build on known concepts.", examples: "Use examples from school, home, and neighborhood. Introduce simple cause-effect." },
  "grade-3": { sentenceLength: "Use medium sentences (8-12 words). Introduce conjunctions (and, but, so).", vocabulary: "Build vocabulary to 500-800 words. Introduce basic academic terms with definitions.", style: "Use an encouraging, instructional tone. Promote curiosity.", examples: "Use school subjects, hobbies, and community examples. Begin abstract thinking." },
  "grade-4": { sentenceLength: "Use varied sentences (10-15 words). Mix simple and compound sentences.", vocabulary: "Expand vocabulary to 800-1200 words. Introduce subject-specific terminology.", style: "Use a clear, engaging tone. Encourage independent thinking.", examples: "Use real-world applications from science, history, and current events." },
  "grade-5": { sentenceLength: "Use complex sentences (12-18 words). Introduce subordinate clauses.", vocabulary: "Build vocabulary to 1200-1500 words. Use more sophisticated academic language.", style: "Use an instructional, analytical tone. Promote critical thinking.", examples: "Use examples requiring analysis and comparison. Connect multiple concepts." },
  "grade-6": { sentenceLength: "Use medium-length sentences (12-15 words). Keep structure clear and direct.", vocabulary: "Use grade-appropriate vocabulary. Define technical terms when first introduced. Build on concepts students already know.", style: "Use a clear, instructional tone. Make concepts relatable to students' lives.", examples: "Use relatable examples from school, home, and popular culture. Include analogies when helpful." },
  "grade-7": { sentenceLength: "Use longer sentences (15-20 words). Vary structure with sophisticated transitions.", vocabulary: "Expand vocabulary to 2000-3000 words. Use discipline-specific terminology.", style: "Use an engaging, analytical tone. Promote deeper analysis.", examples: "Use current events, literature, and cross-disciplinary connections." },
  "grade-8": { sentenceLength: "Use complex sentences (18-25 words). Expect comprehension of nuanced arguments.", vocabulary: "Build vocabulary to 3000-4000 words. Introduce abstract concepts.", style: "Use a sophisticated, thought-provoking tone. Encourage debate and evaluation.", examples: "Use examples requiring synthesis of multiple sources and perspectives." },
  "grade-9": { sentenceLength: "Use longer sentences (15-20 words) with some complexity. Vary sentence structure for engagement.", vocabulary: "Use broader vocabulary. Introduce technical terms with brief definitions. Expect increasing subject knowledge.", style: "Use an engaging, analytical tone. Encourage critical thinking.", examples: "Use real-world applications and current events. Connect to broader themes." },
  "grade-10": { sentenceLength: "Use complex sentences (18-25 words). Expect comprehension of layered ideas.", vocabulary: "Use advanced vocabulary (5000-6000 words). Employ discipline-specific terminology.", style: "Use a challenging, analytical tone. Promote evaluation and synthesis.", examples: "Use college-prep examples, research concepts, and theoretical frameworks." },
  "grade-11": { sentenceLength: "Use sophisticated sentences (20-30 words). Vary structure for rhetorical effect.", vocabulary: "Use college-level vocabulary (6000-7000 words). Assume strong content knowledge.", style: "Use an academic, challenging tone. Encourage original analysis.", examples: "Use college-level analysis, research methods, and theoretical debates." },
  "grade-12": { sentenceLength: "Use advanced academic sentences (20-35 words). Expect mature comprehension.", vocabulary: "Use advanced vocabulary (7000-8000 words). Employ sophisticated academic language.", style: "Use a scholarly, rigorous tone. Promote independent scholarship.", examples: "Use advanced examples requiring synthesis, evaluation, and original thought." },
  "high-school": { sentenceLength: "Use complex sentences (18-25 words) with varied structure. Expect comprehension of compound ideas.", vocabulary: "Use advanced vocabulary and subject-specific terminology. Define only highly specialized terms.", style: "Use a sophisticated, academic tone. Promote analysis and evaluation.", examples: "Use college-level examples, research references, and interdisciplinary connections." },
  college: { sentenceLength: "Use academic sentence structures of varying complexity. Expect comprehension of dense text.", vocabulary: "Use discipline-specific language freely. Assume foundational knowledge in the subject area.", style: "Use a scholarly, precise tone. Encourage synthesis and original thought.", examples: "Reference research, theories, and debates in the field. Assume intellectual maturity." },
  professional: { sentenceLength: "Use concise, efficient sentences. Get to the point quickly.", vocabulary: "Use industry-standard terminology. Assume professional expertise.", style: "Use a professional, actionable tone. Focus on practical application.", examples: "Use industry case studies, best practices, and real-world scenarios. Emphasize ROI and outcomes." },
  "esl-beginner": { sentenceLength: "Use very short, simple sentences (5-8 words). Use subject-verb-object order consistently.", vocabulary: "Use only common, high-frequency vocabulary (top 1000-2000 words). Avoid idioms and slang.", style: "Use a patient, supportive tone. Repeat key concepts. Use explicit context.", examples: "Use universal concepts (food, family, weather, time). Avoid culturally specific references." },
  "esl-intermediate": { sentenceLength: "Use medium sentences (10-15 words). Introduce varied sentence patterns gradually.", vocabulary: "Expand vocabulary to everyday situations. Introduce common idioms with explanations. Use multiple tenses.", style: "Use a clear, encouraging tone. Build confidence with scaffolded complexity.", examples: "Include cultural context when introducing idioms. Use travel, work, and education scenarios." }
};

export const TONES: Record<Tone, string> = {
  educational: "Use a clear, instructional, and approachable tone. Make learning engaging and accessible. Explain concepts step-by-step.",
  professional: "Use a formal, business-like tone. Be concise and action-oriented. Focus on practical outcomes.",
  casual: "Use a conversational, friendly tone. Write as if talking to a peer. Be relatable and warm.",
  academic: "Use a scholarly, research-oriented tone. Be precise and objective. Support claims with evidence.",
  creative: "Use an imaginative, expressive tone. Employ narrative techniques and vivid language. Engage emotions and creativity."
};

export const GROUNDING_RULES = `GROUNDING RULES (NON-NEGOTIABLE):
- Use only the numbered EVIDENCE sentences you are given. Do not add facts, figures, names or procedures that are not in the evidence.
- Every activity and every item must cite the evidence sentence ids it is based on, in the evidenceIds fields. Cite only ids that appear in the evidence you were given.
- Write plain text. No markdown, no HTML tags, no bullet characters, no emoji.
- Never use the characters * / : inside fill-in-the-blank answers or tips, and never put * in a passage.
- If the evidence does not support the task, return fewer items rather than inventing content.`;

const LANGUAGE_NAMES: Record<string, string> = { en: "English", vi: "Vietnamese", fr: "French", de: "German", es: "Spanish", zh: "Chinese", ar: "Arabic", hi: "Hindi", id: "Indonesian", ja: "Japanese", ko: "Korean", pt: "Portuguese", th: "Thai", it: "Italian" };
export function languageName(code: string): string { return LANGUAGE_NAMES[code.toLowerCase()] ?? code; }

export interface PromptConfig { readingLevel: ReadingLevel; tone: Tone; language: string; instructionalLanguage?: string; customisation?: string; }
export const DEFAULT_PROMPT_CONFIG: PromptConfig = { readingLevel: "high-school", tone: "educational", language: "en" };

/** Bump whenever any prompt text in this module or a producer changes, so recorded attempts stay attributable to the wording that produced them. */
export const PROMPT_VERSION = "2026-09-19.2";

/** Deterministic for identical config, so it forms a stable cached prefix. */
export function buildSystemPrompt(config: PromptConfig): string {
  const level = READING_LEVELS[config.readingLevel];
  const parts = [
    "You are an expert vocational-education content generator. You turn source evidence into H5P revision activities that help learners check their understanding. The activities are for revision, not assessment.",
    GROUNDING_RULES,
    `READING LEVEL: ${config.readingLevel.toUpperCase()}\n${level.sentenceLength}\n${level.vocabulary}\n${level.style}\n${level.examples}`,
    `TONE: ${config.tone.toUpperCase()}\n${TONES[config.tone]}`,
    `CONTENT LANGUAGE: ${languageName(config.language)} (${config.language})\nGenerate all educational content (questions, answers, explanations) in ${languageName(config.language)} (${config.language}). Do not translate content to other languages unless explicitly instructed.`
  ];
  if (config.instructionalLanguage && config.instructionalLanguage !== config.language) {
    parts.push(`INSTRUCTIONAL LANGUAGE: ${languageName(config.instructionalLanguage)} (${config.instructionalLanguage})\nGenerate all task instructions, directions, and scaffolding text in ${languageName(config.instructionalLanguage)} (${config.instructionalLanguage}). This includes quiz instructions, activity directions, and any text that guides the learner through the task.`);
  }
  if (config.customisation?.trim()) parts.push(`ADDITIONAL CUSTOMISATION:\n${config.customisation.trim()}`);
  return parts.join("\n\n");
}
