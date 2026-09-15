import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listParagraphPlaintexts } from "./resumeOoxmlRead";
import {
  containsInvisibleFormatCharacters,
  documentPlaintextFromParagraphs,
  normalizeDocumentTextForComparison,
  readResumeDocumentPlaintext,
  sanitizeGeneratedText,
  sanitizeGeneratedTextWithChanges,
} from "./resumeUnicode";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const privateCanaryPath = join(repoRoot, "fixtures/resume/private/current-resume.docx");
const privateUnicodePath = join(repoRoot, "fixtures/resume/private/unicode-policy.local.json");

const ZWSP = "\u200b";
const NBSP = "\u00a0";
const NARROW_NBSP = "\u202f";
const SOFT_HYPHEN = "\u00ad";
const BOM = "\ufeff";
const EM_DASH = "\u2014";

const GEOMETRY_BULLET =
  "TARGET_GEOMETRY_BULLET: Built REST APIs for inventory sync across warehouse nodes using Python and AWS.";

describe("sanitizeGeneratedText", () => {
  it("strips zero-width and other invisible format characters", () => {
    const stuffed = `Built${ZWSP} REST${ZWSP}${ZWSP} APIs`;
    const result = sanitizeGeneratedTextWithChanges(stuffed);

    expect(result.text).toBe("Built REST APIs");
    expect(result.changes).toContain("invisible_format_removed");
    expect(containsInvisibleFormatCharacters(result.text)).toBe(false);
  });

  it("removes the whole Cf family a keyword stuffer would reach for", () => {
    const tricks = [
      ZWSP,
      "\u200c", // ZWNJ
      "\u200d", // ZWJ
      "\u2060", // word joiner
      "\u200e", // LRM
      "\u202e", // RTL override
      "\u2066", // LRI
      SOFT_HYPHEN,
      BOM,
    ];
    for (const trick of tricks) {
      expect(sanitizeGeneratedText(`Kuber${trick}netes`)).toBe("Kubernetes");
    }
  });

  it("normalizes to NFC without changing what the reader sees", () => {
    const decomposed = "Andre\u0301s Rodri\u0301guez";
    const result = sanitizeGeneratedTextWithChanges(decomposed);

    expect(result.changes).toContain("nfc_normalized");
    expect(result.text).toBe("Andrés Rodríguez".normalize("NFC"));
    expect(result.text.normalize("NFC")).toBe(result.text);
    // The composed form is shorter in code units; the glyphs are identical.
    expect(result.text.length).toBeLessThan(decomposed.length);
  });

  it("folds NBSP, exotic spaces, tabs, and line breaks into single spaces", () => {
    const messy = `Senior${NBSP}Engineer${NARROW_NBSP}2024\tremote\r\nteam\u2028lead   here`;
    const result = sanitizeGeneratedTextWithChanges(messy);

    expect(result.text).toBe("Senior Engineer 2024 remote team lead here");
    expect(result.changes).toContain("space_like_folded");
    expect(result.changes).toContain("line_break_folded");
    expect(result.changes).toContain("whitespace_collapsed");
  });

  it("trims the result and reports no changes for already-clean text", () => {
    const clean = "Built REST APIs for inventory sync using Python and AWS.";
    const result = sanitizeGeneratedTextWithChanges(clean);

    expect(result.text).toBe(clean);
    expect(result.changes).toEqual([]);
    expect(sanitizeGeneratedText(`  ${clean}  `)).toBe(clean);
  });

  it("preserves em dash, en dash, curly quotes, ellipsis, and ordinary hyphens", () => {
    const typography = `Cross-functional lead ${EM_DASH} owned the “batch window” \u2013 2020\u20262024`;
    expect(sanitizeGeneratedText(typography)).toBe(typography);
    // Em dash policy belongs to resumeStyleLint (6E), not to sanitation.
    expect(sanitizeGeneratedText(typography)).toContain(EM_DASH);
    expect(sanitizeGeneratedText("multi-region roll-out")).toBe("multi-region roll-out");
  });

  it("removes stray control characters without eating text", () => {
    const result = sanitizeGeneratedTextWithChanges("Shipped\u0000 the\u0007 release");
    expect(result.text).toBe("Shipped the release");
    expect(result.changes).toContain("control_removed");
  });

  it("is idempotent", () => {
    const messy = `Built${ZWSP}${NBSP}REST\tAPIs${SOFT_HYPHEN} `;
    const once = sanitizeGeneratedText(messy);
    expect(sanitizeGeneratedText(once)).toBe(once);
  });

  it("collapses to an empty string when the input was only invisible characters", () => {
    expect(sanitizeGeneratedText(`${ZWSP}${BOM}${NBSP}`)).toBe("");
  });
});

describe("documentPlaintextFromParagraphs", () => {
  it("keeps the document's own NBSP, tabs, hyphens, and quotes", () => {
    const paragraphs = [
      `Senior${NBSP}Engineer`,
      "Software Engineer\t2020 – 2026",
      "Built multi-region roll-out of the “batch window”",
    ];
    const extracted = documentPlaintextFromParagraphs(paragraphs);

    expect(extracted.lines.map((line) => line.text)).toEqual(paragraphs);
    expect(extracted.text).toBe(paragraphs.join("\n"));
    expect(extracted.text).toContain(NBSP);
    expect(extracted.text).toContain("\t");
    expect(extracted.text).toContain("multi-region roll-out");
  });

  it("does not strip invisible characters that are already in the document", () => {
    const extracted = documentPlaintextFromParagraphs([`Java${ZWSP}Script`]);
    // Extraction reports what the file says; sanitation only guards our output.
    expect(extracted.text).toBe(`Java${ZWSP}Script`);
    expect(containsInvisibleFormatCharacters(extracted.text)).toBe(true);
  });

  it("normalizes extracted text to NFC and keeps reading order with blank lines", () => {
    const extracted = documentPlaintextFromParagraphs(["Andre\u0301s", "", "Engineer"]);

    expect(extracted.lines).toEqual([
      { order: 0, text: "Andrés".normalize("NFC") },
      { order: 1, text: "" },
      { order: 2, text: "Engineer" },
    ]);
    expect(extracted.text).toBe(`${"Andrés".normalize("NFC")}\n\nEngineer`);
  });

  it("extracts the geometry canary in paragraph order from real bytes", async () => {
    const bytes = new Uint8Array(readFileSync(geometryCanaryPath));
    const extracted = await readResumeDocumentPlaintext(bytes);
    const paragraphs = await listParagraphPlaintexts(bytes);

    expect(extracted.lines).toHaveLength(paragraphs.length);
    expect(extracted.lines.map((line) => line.order)).toEqual(paragraphs.map((_, i) => i));
    expect(extracted.text.split("\n")).toEqual(paragraphs.map((text) => text.normalize("NFC")));
    expect(extracted.text).toContain(GEOMETRY_BULLET);
  });
});

describe("normalizeDocumentTextForComparison", () => {
  it("unhides a mention split by a zero-width character", () => {
    expect(normalizeDocumentTextForComparison(`Java${ZWSP}Script`)).toBe("JavaScript");
    expect(normalizeDocumentTextForComparison(`Kuber${SOFT_HYPHEN}netes`)).toBe("Kubernetes");
  });

  it("folds NBSP and tabs but keeps line structure for section detection", () => {
    const documentText = `PROFILE\nSenior${NBSP}Engineer\t2026\n\nSKILLS\nPython,${NBSP}AWS`;
    expect(normalizeDocumentTextForComparison(documentText)).toBe(
      "PROFILE\nSenior Engineer 2026\n\nSKILLS\nPython, AWS"
    );
  });

  it("leaves ordinary hyphens and dashes alone so terms still match verbatim", () => {
    expect(normalizeDocumentTextForComparison("multi-region roll-out")).toBe(
      "multi-region roll-out"
    );
    expect(normalizeDocumentTextForComparison(`2020 ${EM_DASH} 2026`)).toBe(`2020 ${EM_DASH} 2026`);
  });

  it("does not mutate the document text it was given", () => {
    const original = `Senior${NBSP}Engineer`;
    normalizeDocumentTextForComparison(original);
    expect(original).toBe(`Senior${NBSP}Engineer`);
  });
});

describe("private fixture", () => {
  it.skipIf(process.env.RESUME_PRIVATE_FIXTURE !== "1")(
    "extracts the private resume faithfully without logging its contents",
    async () => {
      if (!existsSync(privateCanaryPath)) {
        throw new Error("RESUME_PRIVATE_FIXTURE=1 but the private fixture is missing");
      }
      const bytes = new Uint8Array(readFileSync(privateCanaryPath));
      const extracted = await readResumeDocumentPlaintext(bytes);
      const paragraphs = await listParagraphPlaintexts(bytes);

      expect(extracted.lines).toHaveLength(paragraphs.length);
      // Faithful extraction: nothing but NFC was applied.
      expect(extracted.lines.map((line) => line.text)).toEqual(
        paragraphs.map((text) => text.normalize("NFC"))
      );

      // Sanitation must never be applied to document text, but every line must
      // survive it as a suggestion would: no line is emptied by hygiene alone.
      const nonEmpty = extracted.lines.filter((line) => line.text.trim().length > 0);
      expect(nonEmpty.length).toBeGreaterThan(0);
      for (const line of nonEmpty) {
        expect(sanitizeGeneratedText(line.text).length).toBeGreaterThan(0);
      }

      // Counts only, gitignored. Never any document text.
      mkdirSync(dirname(privateUnicodePath), { recursive: true });
      writeFileSync(
        privateUnicodePath,
        `${JSON.stringify(
          {
            lineCount: extracted.lines.length,
            nonEmptyLineCount: nonEmpty.length,
            linesWithNbsp: extracted.lines.filter((line) => line.text.includes(NBSP)).length,
            linesWithTab: extracted.lines.filter((line) => line.text.includes("\t")).length,
            linesWithInvisibleFormat: extracted.lines.filter((line) =>
              containsInvisibleFormatCharacters(line.text)
            ).length,
            linesChangedByComparisonFold: extracted.lines.filter(
              (line) => normalizeDocumentTextForComparison(line.text) !== line.text
            ).length,
            nfcAlreadyNormalized: extracted.lines.every(
              (line, index) => line.text === paragraphs[index]
            ),
          },
          null,
          2
        )}\n`
      );
    }
  );
});
