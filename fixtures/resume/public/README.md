# Public resume fixtures

These files are **fictional**. They contain no real names, employers, emails, or other personal data. They exist so later phases can prove OOXML zip identity (0C) and fail-closed text patching (0D) without committing a real resume.

## Geometry canary — `geometry-canary.docx`

Goal: a US Letter document whose layout is tight enough to be a pagination canary.

| Property | Intent |
| --- | --- |
| Page size | US Letter (12240 × 15840 twips) |
| Margins | ~0.5 in on all sides (720 twips) |
| Body font | Calibri 10 pt |
| Target bullet | The work-experience bullet that starts with `TARGET_GEOMETRY_BULLET:` — authored as **one visual line** |
| Tight last line | After many one-line bullets, a `SKILLS` line is meant to sit **near a page break** (page 2 if Word paginates as intended) |

Word is the layout oracle. Preview.app is not enough for later fidelity gates.

**Word measurement (2026-09-14):** 1 page; no repair dialog. `TARGET_GEOMETRY_BULLET:` is one line with ~10 characters of remaining width before wrap. The final `SKILLS` line is **not** tight to a page break (~18 blank lines of remaining page). Pagination tightness for product gates is the **private** resume, not this public file.

## Mixed-run canary — `mixed-runs-canary.docx`

Goal: one body paragraph (`w:p`) that is **not** a single flattened run.

Inside the paragraph whose plaintext starts with `MIXED_RUN_PARAGRAPH:`, in order:

1. Unformatted text
2. A **bold** run (`TeamAlpha`)
3. An *italic* run (`APIs`)
4. A **hyperlink** run (`ExampleCorp` → `https://example.com/mixed-run`)
5. A tab, then more unformatted text

Neighbor paragraphs are labeled `NEIGHBOR_BEFORE:` and `NEIGHBOR_AFTER:`. Later patch tests must keep those neighbors byte-equal (or XML-equivalent without introducing whitespace) and must not flatten mixed `w:rPr` / hyperlink `r:id`.

When you open this file in Word, confirm bold, italic, and a clickable hyperlink are all visible in that one paragraph.

## Private resume (local only)

Copy your real current resume to:

`fixtures/resume/private/current-resume.docx`

That path is **gitignored**. Do not commit it. Phases 0D and 4G use it as the acceptance canary when the file is present on disk.
