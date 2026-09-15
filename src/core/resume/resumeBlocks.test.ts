import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readResumeOoxml } from "./resumeOoxmlRead";
import {
  blockGraphFromDocumentXml,
  readResumeBlockGraph,
  type ResumeBlock,
} from "./resumeBlocks";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const mixedCanaryPath = join(repoRoot, "fixtures/resume/public/mixed-runs-canary.docx");
const privateCanaryPath = join(repoRoot, "fixtures/resume/private/current-resume.docx");
const privateBlockGraphPath = join(repoRoot, "fixtures/resume/private/block-graph.local.json");

const GEOMETRY_BULLET =
  "TARGET_GEOMETRY_BULLET: Built REST APIs for inventory sync across warehouse nodes using Python and AWS.";
const MIXED_PARAGRAPH =
  "MIXED_RUN_PARAGRAPH: Led TeamAlpha built APIs for ExampleCorp then shipped the batch window.";

function blockText(block: ResumeBlock): string {
  return block.runs.map((run) => run.text).join("");
}

describe("readResumeBlockGraph", () => {
  it("maps geometry-canary paragraphs to ordered blocks matching the reader", async () => {
    const bytes = new Uint8Array(readFileSync(geometryCanaryPath));
    const graph = await readResumeBlockGraph(bytes);
    const inventory = await readResumeOoxml(bytes);

    // Block count and order line up with the read-only inventory.
    expect(graph.blocks).toHaveLength(inventory.paragraphCount);
    expect(graph.blocks.map((block) => block.order)).toEqual(
      graph.blocks.map((_, index) => index)
    );
    expect(graph.blocks.map((block) => block.text)).toEqual(inventory.paragraphs);

    // Run-text concatenation equals the paragraph plaintext for every block.
    for (const block of graph.blocks) {
      expect(blockText(block)).toBe(block.text);
    }

    const bullet = graph.blocks.find((block) => block.text === GEOMETRY_BULLET);
    expect(bullet).toBeDefined();
    expect(bullet?.runs).toHaveLength(1);
    expect(bullet?.runs[0]).toMatchObject({
      text: GEOMETRY_BULLET,
      bold: false,
      italic: false,
      underline: false,
      font: "Calibri",
      sizePt: 10,
      hyperlinkRelId: null,
    });
  });

  it("keeps bold, italic, and hyperlink runs distinct instead of flattening", async () => {
    const bytes = new Uint8Array(readFileSync(mixedCanaryPath));
    const graph = await readResumeBlockGraph(bytes);

    const mixed = graph.blocks.find((block) => block.text === MIXED_PARAGRAPH);
    expect(mixed).toBeDefined();
    if (!mixed) return;

    // Not flattened: the mixed paragraph keeps multiple distinct runs.
    expect(mixed.runs.length).toBeGreaterThan(1);
    expect(blockText(mixed)).toBe(MIXED_PARAGRAPH);

    const bold = mixed.runs.filter((run) => run.bold);
    expect(bold).toHaveLength(1);
    expect(bold[0]?.text).toBe("TeamAlpha");
    expect(bold[0]?.italic).toBe(false);

    const italic = mixed.runs.filter((run) => run.italic);
    expect(italic).toHaveLength(1);
    expect(italic[0]?.text).toBe("APIs");
    expect(italic[0]?.bold).toBe(false);

    // The hyperlink run preserves its relationship id (r:id) and underline.
    const linked = mixed.runs.filter((run) => run.hyperlinkRelId !== null);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.text).toBe("ExampleCorp");
    expect(linked[0]?.hyperlinkRelId).toBe("rId5");
    expect(linked[0]?.underline).toBe(true);

    // The leading plain run is not bold/italic and carries the document font/size.
    const leading = mixed.runs[0];
    expect(leading?.text).toBe("MIXED_RUN_PARAGRAPH: Led ");
    expect(leading?.bold).toBe(false);
    expect(leading?.italic).toBe(false);
    expect(leading?.font).toBe("Calibri");
    expect(leading?.sizePt).toBe(10);
    expect(leading?.hyperlinkRelId).toBeNull();
  });

  it("returns an empty run list for paragraphs without text", async () => {
    const documentXml =
      '<?xml version="1.0"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:body><w:p><w:pPr/></w:p></w:body></w:document>";
    const graph = blockGraphFromDocumentXml(documentXml);
    expect(graph.blocks).toHaveLength(1);
    expect(graph.blocks[0]?.runs).toEqual([]);
    expect(graph.blocks[0]?.text).toBe("");
  });

  it.skipIf(process.env.RESUME_PRIVATE_FIXTURE !== "1")(
    "parses the private fixture into a block graph without logging its contents",
    async () => {
      if (!existsSync(privateCanaryPath)) {
        throw new Error("RESUME_PRIVATE_FIXTURE=1 but the private fixture is missing");
      }
      const bytes = new Uint8Array(readFileSync(privateCanaryPath));
      const graph = await readResumeBlockGraph(bytes);
      const inventory = await readResumeOoxml(bytes);

      expect(graph.blocks.length).toBeGreaterThan(0);
      expect(graph.blocks).toHaveLength(inventory.paragraphCount);
      // At least one paragraph should carry more than one run (real resumes
      // mix bold headers / plain body), proving no global flatten.
      expect(graph.blocks.some((block) => block.runs.length > 1)).toBe(true);

      // Record only aggregate counts locally (gitignored). Never the text.
      mkdirSync(dirname(privateBlockGraphPath), { recursive: true });
      writeFileSync(
        privateBlockGraphPath,
        `${JSON.stringify(
          {
            blockCount: graph.blocks.length,
            totalRuns: graph.blocks.reduce((sum, block) => sum + block.runs.length, 0),
            maxRunsInABlock: graph.blocks.reduce(
              (max, block) => Math.max(max, block.runs.length),
              0
            ),
          },
          null,
          2
        )}\n`
      );
    }
  );
});
