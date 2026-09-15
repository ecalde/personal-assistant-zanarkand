import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_XML_PATH,
  getDocxPart,
  loadDocxBuffer,
  writeDocxBuffer,
} from "./resumeZip";
import {
  ATS_WARNING_CODES,
  analyzeResumeAtsStructure,
  atsChecksFromPackageParts,
  type AtsWarningCode,
  type ResumeAtsReport,
} from "./resumeAtsChecks";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const mixedCanaryPath = join(repoRoot, "fixtures/resume/public/mixed-runs-canary.docx");
const privateCanaryPath = join(repoRoot, "fixtures/resume/private/current-resume.docx");
const privateAtsStatsPath = join(repoRoot, "fixtures/resume/private/ats-checks.local.json");

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
  'xmlns:v="urn:schemas-microsoft-com:vml"';

const SECT_PR =
  '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
  '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>';

function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function documentXml(bodyInner: string, sectPr = SECT_PR): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document ${NS}><w:body>${bodyInner}${sectPr}</w:body></w:document>`
  );
}

function bulletLevel(ilvl: string, font: string, glyph: string): string {
  return (
    `<w:lvl w:ilvl="${ilvl}"><w:numFmt w:val="bullet"/>` +
    `<w:lvlText w:val="${glyph}"/>` +
    `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr></w:lvl>`
  );
}

/** Word's default first-level bullet: Symbol U+F0B7 (•). */
const DEFAULT_SYMBOL_LEVEL = bulletLevel("0", "Symbol", "\uF0B7");
/** A decorative Wingdings arrow, not one of Word's defaults. */
const WINGDINGS_ARROW_LEVEL = bulletLevel("0", "Wingdings", "\uF0E8");

function abstractNum(abstractNumId: string, levels: string): string {
  return `<w:abstractNum w:abstractNumId="${abstractNumId}">${levels}</w:abstractNum>`;
}

function numDefinition(numId: string, abstractNumId: string): string {
  return `<w:num w:numId="${numId}"><w:abstractNumId w:val="${abstractNumId}"/></w:num>`;
}

function numberedParagraph(text: string, numId: string, ilvl = "0"): string {
  return (
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` +
    `<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
  );
}

function relsXml(relationships: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `${relationships}</Relationships>`
  );
}

function codes(report: ResumeAtsReport): AtsWarningCode[] {
  return report.warnings.map((item) => item.code);
}

function occurrencesOf(report: ResumeAtsReport, code: AtsWarningCode): number | undefined {
  return report.warnings.find((item) => item.code === code)?.occurrences;
}

const PLAIN_RESUME_BODY =
  paragraph("Dana Rivera | dana.rivera@example.com | (555) 123-4567") +
  paragraph("WORK EXPERIENCE") +
  paragraph("Built REST APIs for inventory sync using Python and AWS.");

describe("atsChecksFromPackageParts", () => {
  it("reports no warnings for a single-column text resume", () => {
    const report = atsChecksFromPackageParts({ documentXml: documentXml(PLAIN_RESUME_BODY) });
    expect(report.warnings).toEqual([]);
  });

  it("exposes warnings only, never an aggregate score (RES-ATS-001)", () => {
    const report = atsChecksFromPackageParts({ documentXml: documentXml(PLAIN_RESUME_BODY) });
    expect(Object.keys(report)).toEqual(["warnings"]);
  });

  it("warns about tables and counts them", () => {
    const table =
      "<w:tbl><w:tr><w:tc>" +
      paragraph("Senior Engineer") +
      "</w:tc><w:tc>" +
      paragraph("2020 - 2026") +
      "</w:tc></w:tr></w:tbl>";
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(PLAIN_RESUME_BODY + table + table),
    });

    expect(codes(report)).toEqual(["table_layout"]);
    expect(occurrencesOf(report, "table_layout")).toBe(2);
    const warning = report.warnings[0];
    expect(warning?.severity).toBe("warning");
    // Honest phrasing: a documented failure mode, not a vendor verdict.
    expect(warning?.message).not.toMatch(/greenhouse|taleo|workday|score|%/i);
  });

  it("warns about text boxes once per shape and flags reading order", () => {
    // Word emits the same text box twice: DrawingML choice plus VML fallback.
    const textBox =
      "<w:p><w:r><mc:AlternateContent>" +
      "<mc:Choice Requires=\"wps\"><w:drawing><wp:anchor>" +
      '<wp:docPr id="1" name="Sidebar" descr="sidebar"/>' +
      `<wps:txbx><w:txbxContent>${paragraph("Skills: Python")}</w:txbxContent></wps:txbx>` +
      "</wp:anchor></w:drawing></mc:Choice>" +
      "<mc:Fallback><w:pict><v:shape alt=\"sidebar\">" +
      `<v:textbox><w:txbxContent>${paragraph("Skills: Python")}</w:txbxContent></v:textbox>` +
      "</v:shape></w:pict></mc:Fallback>" +
      "</mc:AlternateContent></w:r></w:p>";
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(PLAIN_RESUME_BODY + textBox),
    });

    expect(codes(report)).toEqual(["text_box_content", "reading_order_uncertain"]);
    expect(occurrencesOf(report, "text_box_content")).toBe(1);
    // One floating anchor plus one text box.
    expect(occurrencesOf(report, "reading_order_uncertain")).toBe(2);
  });

  it("warns about multi-column geometry and extra section definitions", () => {
    const columnSection =
      '<w:p><w:pPr><w:sectPr><w:cols w:num="2"/>' +
      '<w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:pPr></w:p>';
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(columnSection + PLAIN_RESUME_BODY),
    });

    expect(codes(report)).toEqual(["multi_column_section", "multiple_sections"]);
    expect(occurrencesOf(report, "multi_column_section")).toBe(1);
    expect(occurrencesOf(report, "multiple_sections")).toBe(2);
    expect(report.warnings.find((item) => item.code === "multiple_sections")?.severity).toBe(
      "info"
    );
  });

  it("does not treat a single-column section as multi-column", () => {
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(
        PLAIN_RESUME_BODY,
        '<w:sectPr><w:cols w:num="1"/><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>'
      ),
    });
    expect(codes(report)).toEqual([]);
  });

  it("warns when contact details live only in the header", () => {
    const header = `<w:hdr ${NS}>${paragraph(
      "Dana Rivera | dana.rivera@example.com | (555) 123-4567"
    )}</w:hdr>`;
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(paragraph("WORK EXPERIENCE") + paragraph("Built REST APIs.")),
      headerFooterXmls: [header],
    });

    expect(codes(report)).toEqual(["contact_only_in_header_footer"]);
  });

  it("stays quiet when the body also carries contact details", () => {
    const header = `<w:hdr ${NS}>${paragraph("dana.rivera@example.com")}</w:hdr>`;
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(PLAIN_RESUME_BODY),
      headerFooterXmls: [header],
    });

    expect(codes(report)).toEqual([]);
  });

  it("flags an empty body as having no selectable text", () => {
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(
        '<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Scan"/></wp:inline></w:drawing></w:r></w:p>'
      ),
    });

    expect(codes(report)).toEqual(["no_selectable_text", "image_without_alt_text"]);
    expect(report.warnings[0]?.severity).toBe("warning");
  });

  it("only flags images that carry no alt text", () => {
    const described =
      '<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Logo" descr="Employer logo"/>' +
      "</wp:inline></w:drawing></w:r></w:p>";
    const undescribed =
      '<w:p><w:r><w:drawing><wp:inline><wp:docPr id="2" name="Chart" descr=" "/>' +
      "</wp:inline></w:drawing></w:r></w:p>";
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(PLAIN_RESUME_BODY + described + undescribed),
    });

    expect(codes(report)).toEqual(["image_without_alt_text"]);
    expect(occurrencesOf(report, "image_without_alt_text")).toBe(1);
  });

  it("flags decorative glyphs from used bullet levels and inline symbols", () => {
    // abstract 0 = decorative Wingdings arrow (used); abstract 1 = Word's
    // default Symbol bullet (used); abstract 2 = decorative but never used.
    const numberingXml =
      '<?xml version="1.0"?>' +
      `<w:numbering ${NS}>` +
      abstractNum("0", WINGDINGS_ARROW_LEVEL) +
      abstractNum("1", DEFAULT_SYMBOL_LEVEL) +
      abstractNum("2", WINGDINGS_ARROW_LEVEL) +
      numDefinition("1", "0") +
      numDefinition("2", "1") +
      numDefinition("3", "2") +
      "</w:numbering>";
    const decorativeBullet = numberedParagraph("Led the migration.", "1");
    const defaultBullet = numberedParagraph("Shipped the batch window.", "2");
    const checkmarkRun =
      '<w:p><w:r><w:sym w:font="Wingdings" w:char="F0FC"/><w:t>Certified</w:t></w:r></w:p>';

    const report = atsChecksFromPackageParts({
      documentXml: documentXml(
        PLAIN_RESUME_BODY + decorativeBullet + defaultBullet + checkmarkRun
      ),
      numberingXml,
    });

    expect(codes(report)).toEqual(["nonstandard_bullet_font"]);
    // One used decorative level plus one inline checkmark. The unused
    // definition and the default Symbol bullet are not counted.
    expect(occurrencesOf(report, "nonstandard_bullet_font")).toBe(2);
  });

  it("stays quiet about Word's default bullet definitions", () => {
    // Word ships many unused abstract numberings using Symbol / Courier New /
    // Wingdings defaults. Warning on those would fire on nearly every resume.
    const numberingXml =
      '<?xml version="1.0"?>' +
      `<w:numbering ${NS}>` +
      abstractNum(
        "0",
        DEFAULT_SYMBOL_LEVEL +
          bulletLevel("1", "Courier New", "o") +
          bulletLevel("2", "Wingdings", "\uF0A7")
      ) +
      numDefinition("1", "0") +
      "</w:numbering>";
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(
        PLAIN_RESUME_BODY + numberedParagraph("Shipped the batch window.", "1")
      ),
      numberingXml,
    });
    expect(codes(report)).toEqual([]);
  });

  it("resolves hyperlinks against document rels", () => {
    const link =
      '<w:p><w:hyperlink r:id="rId5"><w:r><w:t>ExampleCorp</w:t></w:r></w:hyperlink></w:p>';
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(PLAIN_RESUME_BODY + link),
      documentRelsXml: relsXml(
        '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>'
      ),
    });

    expect(codes(report)).toEqual([]);
  });

  it("counts unresolved rel ids, empty targets, dangling anchors, and targetless links", () => {
    const body =
      PLAIN_RESUME_BODY +
      '<w:p><w:hyperlink r:id="rId9"><w:r><w:t>Missing rel</w:t></w:r></w:hyperlink></w:p>' +
      '<w:p><w:hyperlink r:id="rId5"><w:r><w:t>Empty target</w:t></w:r></w:hyperlink></w:p>' +
      '<w:p><w:hyperlink w:anchor="nowhere"><w:r><w:t>Dangling anchor</w:t></w:r></w:hyperlink></w:p>' +
      '<w:p><w:bookmarkStart w:id="1" w:name="skills"/><w:bookmarkEnd w:id="1"/>' +
      '<w:hyperlink w:anchor="skills"><w:r><w:t>Good anchor</w:t></w:r></w:hyperlink></w:p>' +
      "<w:p><w:hyperlink><w:r><w:t>No destination</w:t></w:r></w:hyperlink></w:p>";
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(body),
      documentRelsXml: relsXml('<Relationship Id="rId5" Target="" TargetMode="External"/>'),
    });

    expect(codes(report)).toEqual(["broken_hyperlink"]);
    expect(occurrencesOf(report, "broken_hyperlink")).toBe(4);
  });

  it("treats a missing rels part as unresolvable link destinations", () => {
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(
        PLAIN_RESUME_BODY +
          '<w:p><w:hyperlink r:id="rId5"><w:r><w:t>ExampleCorp</w:t></w:r></w:hyperlink></w:p>'
      ),
      documentRelsXml: null,
    });

    expect(codes(report)).toEqual(["broken_hyperlink"]);
    expect(occurrencesOf(report, "broken_hyperlink")).toBe(1);
  });

  it("keeps every message free of vendor claims, scores, and hidden-text advice", () => {
    // One document that trips every code, so the honesty assertions cover all
    // of the copy this module can produce (RES-ATS-001, RES-ATS-002).
    const numberingXml =
      '<?xml version="1.0"?>' +
      `<w:numbering ${NS}>` +
      abstractNum("0", WINGDINGS_ARROW_LEVEL) +
      numDefinition("1", "0") +
      "</w:numbering>";
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(
        '<w:p><w:pPr><w:sectPr><w:cols w:num="2"/></w:sectPr></w:pPr></w:p>' +
          `<w:tbl><w:tr><w:tc>${paragraph("")}</w:tc></w:tr></w:tbl>` +
          "<w:p><w:r><w:drawing><wp:anchor>" +
          '<wp:docPr id="1" name="Sidebar"/>' +
          "<wps:txbx><w:txbxContent><w:p/></w:txbxContent></wps:txbx>" +
          "</wp:anchor></w:drawing></w:r></w:p>" +
          numberedParagraph("", "1") +
          "<w:p><w:hyperlink><w:r><w:t/></w:hyperlink></w:p>"
      ),
      headerFooterXmls: [`<w:hdr ${NS}>${paragraph("dana.rivera@example.com")}</w:hdr>`],
      numberingXml,
    });

    expect(codes(report)).toEqual([...ATS_WARNING_CODES]);
    for (const item of report.warnings) {
      expect(item.message).not.toMatch(/greenhouse|taleo|workday|lever|icims/i);
      expect(item.message).not.toMatch(/score|probability|pass(es)? (the )?ats|\d+\s?%/i);
      expect(item.message).not.toMatch(/white text|hidden|invisible|keyword stuff/i);
      expect(item.message.length).toBeGreaterThan(20);
    }
  });

  it("emits warnings in a stable declared order", () => {
    const table = `<w:tbl><w:tr><w:tc>${paragraph("Cell")}</w:tc></w:tr></w:tbl>`;
    const columnSection =
      '<w:p><w:pPr><w:sectPr><w:cols w:num="3"/></w:sectPr></w:pPr></w:p>';
    const report = atsChecksFromPackageParts({
      documentXml: documentXml(
        columnSection +
          PLAIN_RESUME_BODY +
          table +
          '<w:p><w:hyperlink><w:r><w:t>No destination</w:t></w:r></w:hyperlink></w:p>'
      ),
    });

    const emitted = codes(report);
    expect(emitted).toEqual(
      ATS_WARNING_CODES.filter((code) => emitted.includes(code))
    );
    expect(emitted).toEqual([
      "table_layout",
      "multi_column_section",
      "multiple_sections",
      "broken_hyperlink",
    ]);
  });
});

describe("analyzeResumeAtsStructure", () => {
  it("finds no structural problems in the public geometry canary", async () => {
    const bytes = new Uint8Array(readFileSync(geometryCanaryPath));
    const before = Uint8Array.from(bytes);
    const report = await analyzeResumeAtsStructure(bytes);

    expect(codes(report)).not.toContain("no_selectable_text");
    expect(codes(report)).not.toContain("table_layout");
    expect(codes(report)).not.toContain("text_box_content");
    // Read-only: the caller's bytes are untouched.
    expect(bytes).toEqual(before);
  });

  it("resolves the mixed-run canary's real hyperlink relationship", async () => {
    const bytes = new Uint8Array(readFileSync(mixedCanaryPath));
    const report = await analyzeResumeAtsStructure(bytes);
    expect(codes(report)).not.toContain("broken_hyperlink");
  });

  it("detects a table injected into a real package", async () => {
    // Proves the package path (zip → document.xml → detectors) reports a hit,
    // not just the absence of one on clean fixtures.
    const loaded = await loadDocxBuffer(new Uint8Array(readFileSync(geometryCanaryPath)));
    const originalXml = new TextDecoder().decode(getDocxPart(loaded, DOCUMENT_XML_PATH));
    const table = `<w:tbl><w:tr><w:tc>${paragraph("Senior Engineer")}</w:tc></w:tr></w:tbl>`;
    const patchedXml = originalXml.replace("</w:body>", `${table}</w:body>`);
    expect(patchedXml).not.toBe(originalXml);

    const patchedBytes = await writeDocxBuffer({
      entries: loaded.entries.map((entry) =>
        entry.name === DOCUMENT_XML_PATH
          ? { ...entry, data: new TextEncoder().encode(patchedXml) }
          : entry
      ),
    });

    const report = await analyzeResumeAtsStructure(patchedBytes);
    expect(codes(report)).toEqual(["table_layout"]);
    expect(occurrencesOf(report, "table_layout")).toBe(1);
  });
});

describe("private resume fixture", () => {
  it.skipIf(process.env.RESUME_PRIVATE_FIXTURE !== "1")(
    "reports parseability warnings for the private resume without recording its text",
    async () => {
      if (!existsSync(privateCanaryPath)) {
        throw new Error("RESUME_PRIVATE_FIXTURE=1 but the private fixture is missing");
      }
      const bytes = new Uint8Array(readFileSync(privateCanaryPath));
      const report = await analyzeResumeAtsStructure(bytes);

      expect(codes(report)).not.toContain("no_selectable_text");
      for (const item of report.warnings) {
        expect(ATS_WARNING_CODES).toContain(item.code);
        expect(item.occurrences).toBeGreaterThan(0);
      }

      // Codes and counts only, to a gitignored path. Never document text.
      mkdirSync(dirname(privateAtsStatsPath), { recursive: true });
      writeFileSync(
        privateAtsStatsPath,
        `${JSON.stringify(
          {
            warnings: report.warnings.map((item) => ({
              code: item.code,
              severity: item.severity,
              occurrences: item.occurrences,
            })),
          },
          null,
          2
        )}\n`
      );
    }
  );
});
