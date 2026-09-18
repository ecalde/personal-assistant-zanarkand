import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const careerPageSource = readFileSync(join(here, "CareerPage.tsx"), "utf8");

describe("CareerPage resume lazy load (10F)", () => {
  it("loads ResumeWorkspace with React.lazy instead of a static resume import", () => {
    expect(careerPageSource).toMatch(/lazy\(\(\) => import\("\.\.\/components\/resume\/ResumeWorkspace"\)\)/);
    expect(careerPageSource).not.toMatch(/from ["']\.\.\/components\/resume\/ResumeSection["']/);
    expect(careerPageSource).not.toMatch(/from ["']\.\.\/components\/resume\/ResumeDocumentPane["']/);
    expect(careerPageSource).not.toMatch(/jszip/);
    expect(careerPageSource).not.toMatch(/resumeZip/);
  });
});
