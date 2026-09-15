import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  CONTENT_TYPES_PATH,
  DOCUMENT_XML_PATH,
  getDocxPart,
  loadDocxBuffer,
} from "./resumeZip";
import {
  listParagraphPlaintexts,
  listParagraphXml,
  PatchError,
  patchParagraphPlaintext,
} from "./resumeOoxmlPatch";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const mixedCanaryPath = join(repoRoot, "fixtures/resume/public/mixed-runs-canary.docx");
const publicOutDir = join(repoRoot, "fixtures/resume/public/out");
const privateCanaryPath = join(repoRoot, "fixtures/resume/private/current-resume.docx");
const privatePatchedPath = join(repoRoot, "fixtures/resume/private/current-resume.patched.docx");

const MIXED_PLAIN =
  "MIXED_RUN_PARAGRAPH: Led TeamAlpha built APIs for ExampleCorp then shipped the batch window.";
const MIXED_LED_TO_RAN =
  "MIXED_RUN_PARAGRAPH: Ran TeamAlpha built APIs for ExampleCorp then shipped the batch window.";
const MIXED_BOLD_TO_BRAVO =
  "MIXED_RUN_PARAGRAPH: Led TeamBravo built APIs for ExampleCorp then shipped the batch window.";
const MIXED_MERGE_FAIL =
  "MIXED_RUN_PARAGRAPH: Directed built APIs for ExampleCorp then shipped the batch window.";
const GEOMETRY_PLAIN =
  "TARGET_GEOMETRY_BULLET: Built REST APIs for inventory sync across warehouse nodes using Python and AWS.";
const GEOMETRY_PATCHED =
  "TARGET_GEOMETRY_BULLET: Wrote REST APIs for inventory sync across warehouse nodes using Python and AWS.";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function decodePart(loaded: Awaited<ReturnType<typeof loadDocxBuffer>>, path: string): string {
  return new TextDecoder().decode(getDocxPart(loaded, path));
}

async function otherPartsEqual(originalBytes: Uint8Array, patchedBytes: Uint8Array): Promise<void> {
  const original = await loadDocxBuffer(originalBytes);
  const patched = await loadDocxBuffer(patchedBytes);
  for (const entry of original.entries) {
    if (entry.dir || entry.name === DOCUMENT_XML_PATH) continue;
    expect(getDocxPart(patched, entry.name)).toEqual(entry.data);
  }
}

async function makeDocx(documentInner: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(CONTENT_TYPES_PATH, "<Types/>");
  zip.file(
    DOCUMENT_XML_PATH,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}"><w:body>${documentInner}</w:body></w:document>`
  );
  return zip.generateAsync({ type: "uint8array" });
}

function minimalSameLengthWordingChange(plain: string): string {
  const match = /[A-Za-z]{5,}/.exec(plain);
  if (!match || match.index === undefined) {
    throw new Error("Private fixture bullet has no 5+ letter word to change");
  }
  const word = match[0];
  const last = word[word.length - 1];
  if (!last) {
    throw new Error("Private fixture bullet has no 5+ letter word to change");
  }
  const replacementLast =
    last === "x" || last === "X" ? (last === "X" ? "Y" : "y") : last === last.toUpperCase() ? "X" : "x";
  return plain.slice(0, match.index) + word.slice(0, -1) + replacementLast + plain.slice(match.index + word.length);
}

function pickPrivateWorkBullet(
  paragraphXml: string[],
  plains: string[]
): { exactPlaintext: string; next: string } {
  for (let i = 0; i < paragraphXml.length; i += 1) {
    const xml = paragraphXml[i];
    const plain = plains[i];
    if (!xml || !plain) continue;
    if (!xml.includes("<w:numPr")) continue;
    const wtCount = xml.match(/<w:t[\s>]/g)?.length ?? 0;
    if (wtCount !== 1) continue;
    if (plain.length < 40) continue;
    if (plains.filter((item) => item === plain).length !== 1) continue;
    const next = minimalSameLengthWordingChange(plain);
    if (next !== plain) return { exactPlaintext: plain, next };
  }
  throw new Error("No unique single-run work-experience bullet found in the private fixture");
}

describe("patchParagraphPlaintext", () => {
  it("rejects a locator that does not uniquely match a paragraph", async () => {
    const bytes = new Uint8Array(readFileSync(geometryCanaryPath));
    await expect(
      patchParagraphPlaintext(bytes, { exactPlaintext: "this paragraph does not exist" }, "x")
    ).rejects.toMatchObject({ name: "PatchError", code: "not_found" });
    await expect(
      patchParagraphPlaintext(
        bytes,
        {
          exactPlaintext:
            "Documented service contracts so partner teams could integrate without extra design meetings each week.",
        },
        "x"
      )
    ).rejects.toMatchObject({ name: "PatchError", code: "not_unique" });
  });

  it("changes an unformatted word in mixed-runs-canary without flattening rPr or hyperlink r:id", async () => {
    const original = new Uint8Array(readFileSync(mixedCanaryPath));
    const patched = await patchParagraphPlaintext(
      original,
      { exactPlaintext: MIXED_PLAIN },
      MIXED_LED_TO_RAN
    );

    const origLoaded = await loadDocxBuffer(original);
    const nextLoaded = await loadDocxBuffer(patched);
    const origXml = decodePart(origLoaded, DOCUMENT_XML_PATH);
    const nextXml = decodePart(nextLoaded, DOCUMENT_XML_PATH);
    const origParts = listParagraphXml(origXml);
    const nextParts = listParagraphXml(nextXml);

    expect(nextParts[1]).toBe(origParts[1]);
    expect(nextParts[3]).toBe(origParts[3]);
    expect(nextParts[0]).toBe(origParts[0]);

    const mixedXml = nextParts[2] ?? "";
    expect(mixedXml).toContain("Ran ");
    expect(mixedXml).toContain("<w:b/>");
    expect(mixedXml).toContain(">TeamAlpha<");
    expect(mixedXml).toContain("<w:i/>");
    expect(mixedXml).toContain(">APIs<");
    expect(mixedXml).toContain('r:id="rId5"');
    expect(mixedXml).toContain(">ExampleCorp<");
    expect(mixedXml).toContain("<w:tab/>");

    const plains = await listParagraphPlaintexts(patched);
    expect(plains).toContain(MIXED_LED_TO_RAN);
    expect(plains.filter((plain) => plain === MIXED_PLAIN)).toHaveLength(0);

    await otherPartsEqual(original, patched);

    mkdirSync(publicOutDir, { recursive: true });
    writeFileSync(join(publicOutDir, "mixed-runs-canary.patched.docx"), patched);
  });

  it("changes text inside the bold run only and keeps that run bold", async () => {
    const original = new Uint8Array(readFileSync(mixedCanaryPath));
    const patched = await patchParagraphPlaintext(
      original,
      { exactPlaintext: MIXED_PLAIN },
      MIXED_BOLD_TO_BRAVO
    );
    const xml = decodePart(await loadDocxBuffer(patched), DOCUMENT_XML_PATH);
    const mixedXml = listParagraphXml(xml)[2] ?? "";
    expect(mixedXml).toContain(">TeamBravo<");
    expect(mixedXml).not.toContain(">TeamAlpha<");
    expect(mixedXml).toMatch(/<w:b\/>[\s\S]*<w:t>TeamBravo<\/w:t>/);
    expect(mixedXml).toContain("<w:i/>");
    expect(mixedXml).toContain('r:id="rId5"');
    expect(mixedXml).toContain("Led ");
  });

  it("returns PatchError without mutating input when a patch would merge distinct rPr regions", async () => {
    const original = new Uint8Array(readFileSync(mixedCanaryPath));
    const snapshot = new Uint8Array(original);
    await expect(
      patchParagraphPlaintext(original, { exactPlaintext: MIXED_PLAIN }, MIXED_MERGE_FAIL)
    ).rejects.toMatchObject({ name: "PatchError", code: "mixed_rpr" });
    expect(original).toEqual(snapshot);
    expect(await listParagraphPlaintexts(original)).toContain(MIXED_PLAIN);
  });

  it("changes the geometry canary target bullet and leaves other paragraphs' XML unchanged", async () => {
    const original = new Uint8Array(readFileSync(geometryCanaryPath));
    const patched = await patchParagraphPlaintext(
      original,
      { exactPlaintext: GEOMETRY_PLAIN },
      GEOMETRY_PATCHED
    );

    const origParts = listParagraphXml(decodePart(await loadDocxBuffer(original), DOCUMENT_XML_PATH));
    const nextParts = listParagraphXml(decodePart(await loadDocxBuffer(patched), DOCUMENT_XML_PATH));
    expect(nextParts).toHaveLength(origParts.length);

    let changed = 0;
    for (let i = 0; i < origParts.length; i += 1) {
      if (origParts[i] === nextParts[i]) continue;
      changed += 1;
      expect(nextParts[i]).toContain("Wrote REST APIs");
      expect(nextParts[i]).not.toContain("Built REST APIs");
    }
    expect(changed).toBe(1);

    const plains = await listParagraphPlaintexts(patched);
    expect(plains).toContain(GEOMETRY_PATCHED);
    expect(plains.filter((plain) => plain === GEOMETRY_PLAIN)).toHaveLength(0);
    const origPlains = await listParagraphPlaintexts(original);
    for (let i = 0; i < origPlains.length; i += 1) {
      if (origPlains[i] === GEOMETRY_PLAIN) continue;
      expect(plains[i]).toBe(origPlains[i]);
    }

    await otherPartsEqual(original, patched);

    mkdirSync(publicOutDir, { recursive: true });
    writeFileSync(join(publicOutDir, "geometry-canary.patched.docx"), patched);
  });

  it("patches identical-rPr multi-w:t by rewriting the changed middle without inventing rPr", async () => {
    const inner =
      '<w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>World</w:t></w:r></w:p>';
    const bytes = await makeDocx(inner);
    const patched = await patchParagraphPlaintext(
      bytes,
      { exactPlaintext: "Hello World" },
      "Hi there"
    );
    const xml = decodePart(await loadDocxBuffer(patched), DOCUMENT_XML_PATH);
    expect(await listParagraphPlaintexts(patched)).toEqual(["Hi there"]);
    expect(xml).toContain('<w:sz w:val="20"/>');
    expect(xml).not.toContain("Hello");
    expect(xml).not.toContain("World");
  });

  it.skipIf(!existsSync(privateCanaryPath))(
    "patches one private work-experience bullet when the gitignored fixture is present",
    async () => {
      if (process.env.RESUME_PRIVATE_FIXTURE === "1" && !existsSync(privateCanaryPath)) {
        throw new Error("RESUME_PRIVATE_FIXTURE=1 but the private fixture is missing");
      }
      const original = new Uint8Array(readFileSync(privateCanaryPath));
      const origLoaded = await loadDocxBuffer(original);
      const origXml = decodePart(origLoaded, DOCUMENT_XML_PATH);
      const origParts = listParagraphXml(origXml);
      const origPlains = await listParagraphPlaintexts(original);
      const target = pickPrivateWorkBullet(origParts, origPlains);

      const patched = await patchParagraphPlaintext(
        original,
        { exactPlaintext: target.exactPlaintext },
        target.next
      );
      const nextPlains = await listParagraphPlaintexts(patched);
      expect(nextPlains).toContain(target.next);
      expect(nextPlains.filter((plain) => plain === target.exactPlaintext)).toHaveLength(0);

      let changed = 0;
      for (let i = 0; i < origPlains.length; i += 1) {
        if (origPlains[i] === nextPlains[i]) continue;
        changed += 1;
        expect(nextPlains[i]).toBe(target.next);
      }
      expect(changed).toBe(1);
      await otherPartsEqual(original, patched);

      writeFileSync(privatePatchedPath, patched);
      expect(readFileSync(privatePatchedPath).length).toBeGreaterThan(0);
    }
  );
});

describe("PatchError", () => {
  it("is a distinct error type from generic Error", () => {
    const err = new PatchError("nope", "mixed_rpr");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PatchError");
    expect(err.code).toBe("mixed_rpr");
  });
});
