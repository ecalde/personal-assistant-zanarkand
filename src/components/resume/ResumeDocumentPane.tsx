import { useMemo } from "react";
import type { ResumeStructureGraph } from "../../core/resume/resumeModel";
import { documentFontFamilies } from "../../core/resume/resumeFonts";
import { paginatePreviewBlocks } from "../../core/resume/resumePreviewGeometry";
import { styles } from "../../ui/appStyles";
import { ResumePageSurface } from "./ResumePageSurface";
import { useResumeFontPreflight } from "./useResumeFontPreflight";

/**
 * Read-only document preview pane (Phase 4A + 4B font preflight).
 *
 * Left-pane document view: paginates the persisted block graph into US Letter
 * pages and renders them as a light-paper CSS approximation. Missing Calibri
 * (or other document fonts) shows an honest Carlito-substitution warning
 * (architecture §40). No editing yet (Phase 4C). Microsoft Word remains the
 * authority for exact layout and page count (architecture §30, §58).
 */

export type ResumeDocumentPaneProps = {
  resumeName: string;
  graph?: ResumeStructureGraph;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
};

export function ResumeDocumentPane({
  resumeName,
  graph,
  loading = false,
  error = null,
  onClose,
}: ResumeDocumentPaneProps) {
  const pages = useMemo(
    () => (graph ? paginatePreviewBlocks(graph.blocks) : []),
    [graph]
  );
  const fontFamilies = useMemo(
    () => (graph ? documentFontFamilies(graph.blocks) : []),
    [graph]
  );
  const fontPreflight = useResumeFontPreflight(fontFamilies);

  const hasContent = graph !== undefined && graph.blocks.length > 0;

  return (
    <section aria-label={`Preview of ${resumeName}`} style={styles.card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div style={styles.cardTitle}>{resumeName}</div>
        {onClose && (
          <button type="button" onClick={onClose}>
            Close preview
          </button>
        )}
      </div>

      <p style={{ ...styles.metaText, margin: "0 0 12px 0" }}>
        Approximate on-screen preview. Microsoft Word is the source of truth for exact fonts,
        wrapping, and page count.
      </p>

      {fontPreflight?.warning ? (
        <div
          role="status"
          style={{
            ...styles.statusWarning,
            padding: 10,
            borderRadius: 12,
            margin: "0 0 12px 0",
          }}
        >
          {fontPreflight.warning}
        </div>
      ) : null}

      {loading ? (
        <p style={{ ...styles.helpText, margin: 0 }} role="status">
          Loading preview…
        </p>
      ) : error ? (
        <div style={styles.errorInline}>{error}</div>
      ) : !hasContent ? (
        <p style={{ ...styles.helpText, margin: 0 }}>
          No preview is available for this resume yet.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 20,
            justifyItems: "center",
            padding: "12px 4px",
            overflowX: "auto",
            background: "var(--aether-surface-sunken, #fafafa)",
            borderRadius: 12,
          }}
        >
          {pages.map((page, index) => (
            <ResumePageSurface
              key={index}
              page={page}
              pageNumber={index + 1}
              pageCount={pages.length}
            />
          ))}
        </div>
      )}
    </section>
  );
}
