import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { CONTENT_TYPES_PATH, DOCUMENT_XML_PATH } from "./resumeZip";
import {
  readResumeOoxml,
  ResumeOoxmlReadError,
  listParagraphPlaintexts,
} from "./resumeOoxmlRead";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const mixedCanaryPath = join(repoRoot, "fixtures/resume/public/mixed-runs-canary.docx");
const privateCanaryPath = join(repoRoot, "fixtures/resume/private/current-resume.docx");
const privateInventoryPath = join(repoRoot, "fixtures/resume/private/ooxml-inventory.local.json");

/** Authored US Letter + 0.5in margins on the public canaries (twips). */
const US_LETTER_WIDTH_TWIPS = 12240;
const US_LETTER_HEIGHT_TWIPS = 15840;
const HALF_INCH_TWIPS = 720;

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

async function makeDocx(parts: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(CONTENT_TYPES_PATH, "<Types/>");
  for (const [name, xml] of Object.entries(parts)) {
    zip.file(name, xml);
  }
  return zip.generateAsync({ type: "uint8array" });
}

describe("readResumeOoxml", () => {
  it("reads geometry-canary page size, fonts, and plaintext", async () => {
    const bytes = new Uint8Array(readFileSync(geometryCanaryPath));
    const inventory = await readResumeOoxml(bytes);

    expect(inventory.fonts.length).toBeGreaterThan(0);
    expect(inventory.fonts).toContain("Calibri");
    expect(inventory.sections).toHaveLength(1);
    expect(inventory.sections[0]).toMatchObject({
      pageWidthTwips: US_LETTER_WIDTH_TWIPS,
      pageHeightTwips: US_LETTER_HEIGHT_TWIPS,
      marginTopTwips: HALF_INCH_TWIPS,
      marginRightTwips: HALF_INCH_TWIPS,
      marginBottomTwips: HALF_INCH_TWIPS,
      marginLeftTwips: HALF_INCH_TWIPS,
    });
    expect(inventory.paragraphCount).toBeGreaterThan(0);
    expect(inventory.paragraphCount).toBe(inventory.paragraphs.length);
    expect(inventory.concatenatedPlaintext.length).toBeGreaterThan(0);
    expect(inventory.paragraphs).toContain(
      "TARGET_GEOMETRY_BULLET: Built REST APIs for inventory sync across warehouse nodes using Python and AWS."
    );
    expect(await listParagraphPlaintexts(bytes)).toEqual(inventory.paragraphs);
  });

  it("reads mixed-runs-canary page size and mixed-run plaintext", async () => {
    const bytes = new Uint8Array(readFileSync(mixedCanaryPath));
    const inventory = await readResumeOoxml(bytes);

    expect(inventory.fonts).toContain("Calibri");
    expect(inventory.sections[0]?.pageWidthTwips).toBe(US_LETTER_WIDTH_TWIPS);
    expect(inventory.sections[0]?.pageHeightTwips).toBe(US_LETTER_HEIGHT_TWIPS);
    expect(inventory.paragraphs).toContain(
      "MIXED_RUN_PARAGRAPH: Led TeamAlpha built APIs for ExampleCorp then shipped the batch window."
    );
    expect(inventory.concatenatedPlaintext).toContain("NEIGHBOR_BEFORE:");
    expect(inventory.concatenatedPlaintext).toContain("NEIGHBOR_AFTER:");
  });

  it("throws when concatenated plaintext is empty", async () => {
    const bytes = await makeDocx({
      [DOCUMENT_XML_PATH]: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}"><w:body><w:p><w:pPr/></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`,
    });
    await expect(readResumeOoxml(bytes)).rejects.toBeInstanceOf(ResumeOoxmlReadError);
  });

  it.skipIf(process.env.RESUME_PRIVATE_FIXTURE !== "1")(
    "parses the private fixture into fonts, geometry, and nonempty plaintext without logging it",
    async () => {
      if (!existsSync(privateCanaryPath)) {
        throw new Error("RESUME_PRIVATE_FIXTURE=1 but the private fixture is missing");
      }
      const bytes = new Uint8Array(readFileSync(privateCanaryPath));
      const inventory = await readResumeOoxml(bytes);

      expect(inventory.fonts.length).toBeGreaterThan(0);
      expect(inventory.paragraphCount).toBeGreaterThan(0);
      expect(inventory.concatenatedPlaintext.replace(/\n/g, "").length).toBeGreaterThan(0);
      expect(inventory.sections.length).toBeGreaterThan(0);
      expect(inventory.sections[0]?.pageWidthTwips).toBeGreaterThan(0);
      expect(inventory.sections[0]?.pageHeightTwips).toBeGreaterThan(0);

      mkdirSync(dirname(privateInventoryPath), { recursive: true });
      writeFileSync(
        privateInventoryPath,
        `${JSON.stringify(
          {
            fonts: inventory.fonts,
            sections: inventory.sections,
            paragraphCount: inventory.paragraphCount,
            concatenatedPlaintextLength: inventory.concatenatedPlaintext.length,
          },
          null,
          2
        )}\n`
      );
    }
  );
});
