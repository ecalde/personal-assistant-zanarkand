/**
 * Unicode + plaintext extraction policy (Phase 3E).
 *
 * Two directions, deliberately asymmetric (architecture §16.1, §25 step 6,
 * RES-UNI-001):
 *
 * 1. **Text we generate** (LLM paraphrase, anything the app writes back into
 *    the working OOXML) is sanitized: NFC, no invisible format characters, no
 *    exotic spaces, single line, collapsed whitespace. Zero-width characters
 *    are the classic keyword-stuffing trick, so nothing we author may carry
 *    them (RES-ATS-002).
 * 2. **Text we read out of the document** is extracted faithfully. The
 *    person's own NBSP between "Senior" and "Engineer", their tabs, curly
 *    quotes, en/em dashes and ordinary hyphens are meaningful typography — the
 *    extractor must not "fix" them. Only NFC is applied, and only to the
 *    extracted string; the document bytes are never touched here.
 *
 * When document text must be *compared* against a lexicon or a job
 * description, folding happens in `normalizeDocumentTextForComparison`, which
 * returns a throwaway matching key. It never becomes document content.
 *
 * Style questions (em dash usage, banned phrases) are **not** decided here.
 * `sanitizeGeneratedText` keeps em dashes intact on purpose; `resumeStyleLint`
 * (Phase 6E) is what judges them.
 */

import { listParagraphPlaintexts } from "./resumeOoxmlRead";

/**
 * Invisible format characters (Unicode `Cf`): ZWSP, ZWNJ/ZWJ, word joiner,
 * bidi overrides/isolates, BOM, soft hyphen, interlinear annotation marks.
 */
const INVISIBLE_FORMAT_PATTERN = /\p{Cf}/gu;

/** Every way a line can break, including the Unicode line/paragraph separators. */
const LINE_BREAK_PATTERN = /\r\n|[\n\r\u0085\u2028\u2029]/g;

/**
 * Space-like characters other than U+0020: NBSP, narrow NBSP, figure/thin
 * spaces, ideographic space, plus tab and the vertical whitespace controls.
 */
const SPACE_LIKE_PATTERN = /[\p{Zs}\t\v\f]/gu;

/** Remaining C0/C1 controls once line breaks and tabs have been handled. */
const CONTROL_PATTERN = /\p{Cc}/gu;

/** What `sanitizeGeneratedText` had to change, for diagnostics and tests. */
export type GeneratedTextSanitationChange =
  | "nfc_normalized"
  | "invisible_format_removed"
  | "line_break_folded"
  | "space_like_folded"
  | "control_removed"
  | "whitespace_collapsed";

export type SanitizedGeneratedText = {
  text: string;
  changes: GeneratedTextSanitationChange[];
};

/** True when the string carries any invisible `Cf` character. */
export function containsInvisibleFormatCharacters(text: string): boolean {
  return new RegExp(INVISIBLE_FORMAT_PATTERN.source, "u").test(text);
}

/**
 * Sanitize text the app authored before it is shown as a suggestion or patched
 * into the working document.
 *
 * Removed: invisible format characters and stray controls. Folded: line breaks
 * and every space-like character to a single U+0020, then collapsed and
 * trimmed — a block suggestion is one paragraph, and tabs/breaks are document
 * structure the patcher owns (§18.4), not characters to smuggle in as text.
 *
 * Preserved: letters with diacritics, em/en dashes, curly quotes, ellipsis,
 * ordinary hyphens. Sanitation is not style.
 */
export function sanitizeGeneratedTextWithChanges(text: string): SanitizedGeneratedText {
  const changes: GeneratedTextSanitationChange[] = [];
  const note = (change: GeneratedTextSanitationChange, before: string, after: string): string => {
    if (before !== after) changes.push(change);
    return after;
  };

  let out = note("nfc_normalized", text, text.normalize("NFC"));
  out = note("invisible_format_removed", out, out.replace(INVISIBLE_FORMAT_PATTERN, ""));
  out = note("line_break_folded", out, out.replace(LINE_BREAK_PATTERN, " "));
  out = note("space_like_folded", out, out.replace(SPACE_LIKE_PATTERN, " "));
  out = note("control_removed", out, out.replace(CONTROL_PATTERN, ""));
  out = note("whitespace_collapsed", out, out.replace(/ {2,}/g, " ").trim());

  return { text: out, changes };
}

/** `sanitizeGeneratedTextWithChanges` when only the text is needed. */
export function sanitizeGeneratedText(text: string): string {
  return sanitizeGeneratedTextWithChanges(text).text;
}

/** One paragraph of the document in reading order. */
export type ResumePlaintextLine = {
  /** Zero-based paragraph order, matching the Phase 3A block graph. */
  order: number;
  text: string;
};

export type ResumeDocumentPlaintext = {
  /** Paragraphs joined by `\n` in reading order. */
  text: string;
  lines: ResumePlaintextLine[];
};

/**
 * Reading-order plaintext from paragraph text (architecture §23 step 1).
 *
 * Faithful by policy: NFC only. NBSP, tabs, curly quotes, en/em dashes and
 * ordinary hyphens survive exactly as the person typed them, and empty
 * paragraphs stay as empty lines so line order equals block order.
 */
export function documentPlaintextFromParagraphs(
  paragraphTexts: readonly string[]
): ResumeDocumentPlaintext {
  const lines = paragraphTexts.map((text, order) => ({ order, text: text.normalize("NFC") }));
  return { text: lines.map((line) => line.text).join("\n"), lines };
}

/** Load a DOCX and extract its reading-order plaintext (read-only). */
export async function readResumeDocumentPlaintext(
  docxBytes: Uint8Array | ArrayBuffer
): Promise<ResumeDocumentPlaintext> {
  return documentPlaintextFromParagraphs(await listParagraphPlaintexts(docxBytes));
}

/**
 * Fold document text for **comparison only** (lexicon/JD matching, coverage).
 *
 * Invisible characters are dropped so a ZWSP inside "Java\u200bScript" cannot
 * hide a real mention, and space-like characters collapse to U+0020. Line
 * structure is kept because section detection needs it. The result is a
 * throwaway matching key — never written back to the document.
 */
export function normalizeDocumentTextForComparison(text: string): string {
  return text
    .normalize("NFC")
    .replace(INVISIBLE_FORMAT_PATTERN, "")
    .replace(LINE_BREAK_PATTERN, "\n")
    // Line by line, so removing controls cannot swallow the line breaks.
    .split("\n")
    .map((line) =>
      line
        .replace(SPACE_LIKE_PATTERN, " ")
        .replace(CONTROL_PATTERN, "")
        .replace(/ {2,}/g, " ")
        .trim()
    )
    .join("\n")
    .trim();
}
