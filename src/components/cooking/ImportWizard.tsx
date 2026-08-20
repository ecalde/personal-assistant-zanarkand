import { useEffect, useMemo, useRef, useState } from "react";
import type { IngredientCatalog } from "../../core/ingredientCatalog";
import {
  resolveRecipeIngredientLine,
  suggestIngredientMatches,
} from "../../core/ingredients";
import type { CustomIngredient, Recipe, RecipeImportDraft } from "../../core/model";
import {
  buildRecipeImportDraft,
  importDraftAsRecipe,
  importReviewHighlightKeys,
  ingredientLineNeedsReview,
} from "../../core/recipeImport";
import type { RecipeImageKind } from "../../core/sanityUploadContract";
import {
  IMAGE_ACCEPT,
  OCR_EXTRACT_MIN_TEXT_CHARS,
  extractRecipeFromImage,
  extractRecipeFromText,
  validateOcrImageCapture,
} from "../../lib/ocrExtract";
import { styles } from "../../ui/appStyles";
import { RecipeForm } from "./RecipeForm";
import {
  emptyRecipeFormState,
  recipeFormFromRecipe,
  recipeFormReviewSnapshot,
  recipePayloadFromForm,
  validateRecipeForm,
  type RecipeFormState,
} from "./recipeFormState";

export type ImportWizardProps = {
  catalog: IngredientCatalog;
  customIngredients: CustomIngredient[];
  onSave: (payload: Omit<Recipe, "id" | "createdAtIso" | "updatedAtIso">) => void | Promise<void>;
  onCancel: () => void;
  onEnterManually: (prefill?: { notes?: string }) => void;
  onUploadImage?: (file: File, kind: RecipeImageKind) => Promise<NonNullable<Recipe["heroImage"]>>;
};

type WizardStep = "capture" | "extracting" | "review" | "error";

export function ImportWizard({
  catalog,
  customIngredients,
  onSave,
  onCancel,
  onEnterManually,
  onUploadImage,
}: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("capture");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<RecipeImportDraft | null>(null);
  const [form, setForm] = useState<RecipeFormState>(emptyRecipeFormState());
  const [initialForm, setInitialForm] = useState<RecipeFormState | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const highlightedFieldKeys = useMemo(() => {
    if (!draft || !initialForm) return new Set<string>();
    return new Set(
      importReviewHighlightKeys({
        fieldConfidence: draft.fieldConfidence,
        form: recipeFormReviewSnapshot(form),
        initial: recipeFormReviewSnapshot(initialForm),
      })
    );
  }, [draft, form, initialForm]);

  const unresolvedIngredientLineIds = useMemo(() => {
    return form.ingredients
      .filter((row) => row.rawText.trim())
      .filter((row) => {
        if (assignments[row.id]) return false;
        const line = resolveRecipeIngredientLine(
          { id: row.id, rawText: row.rawText, optional: row.optional },
          catalog,
          customIngredients
        );
        return ingredientLineNeedsReview(line);
      })
      .map((row) => row.id);
  }, [form.ingredients, assignments, catalog, customIngredients]);

  function chooseFile(next: File | null) {
    if (!next) {
      setFile(null);
      return;
    }
    const error = validateOcrImageCapture(next);
    if (error) {
      setExtractError(error);
      return;
    }
    setExtractError(null);
    setFile(next);
  }

  async function extract() {
    if (file) {
      const fileError = validateOcrImageCapture(file);
      if (fileError) {
        setExtractError(fileError);
        return;
      }
    } else if (text.trim().length < OCR_EXTRACT_MIN_TEXT_CHARS) {
      setExtractError(`Paste at least ${OCR_EXTRACT_MIN_TEXT_CHARS} characters, or add a photo.`);
      return;
    }

    cancelledRef.current = false;
    setExtractError(null);
    setFormError(null);
    setStep("extracting");
    try {
      const extracted = file
        ? await extractRecipeFromImage(file)
        : await extractRecipeFromText(text);
      if (cancelledRef.current) return;
      const nextDraft = buildRecipeImportDraft(extracted, { catalog, customIngredients });
      const stub = importDraftAsRecipe(nextDraft, {
        id: "import-draft",
        createdAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
      });
      const nextForm = recipeFormFromRecipe(stub);
      setDraft(nextDraft);
      setForm(nextForm);
      setInitialForm(nextForm);
      setAssignments({});
      setStep("review");
    } catch (err) {
      if (cancelledRef.current) return;
      setExtractError(err instanceof Error ? err.message : "Could not read a recipe from that input.");
      setStep("error");
    }
  }

  function handleFormChange(next: RecipeFormState) {
    setForm(next);
    setAssignments((prev) => {
      const updated = { ...prev };
      for (const row of next.ingredients) {
        const previous = form.ingredients.find((item) => item.id === row.id);
        if (previous && previous.rawText !== row.rawText) {
          delete updated[row.id];
        }
      }
      for (const id of Object.keys(updated)) {
        if (!next.ingredients.some((row) => row.id === id)) delete updated[id];
      }
      return updated;
    });
  }

  async function save() {
    if (saving) return;
    const validationError = validateRecipeForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = recipePayloadFromForm(form, {
        catalog,
        customIngredients,
        source: "import",
        ingredientAssignments: assignments,
        previous: draft
          ? importDraftAsRecipe(draft, { id: "import-draft", createdAtIso: "", updatedAtIso: "" })
          : undefined,
      });
      if (file && onUploadImage) {
        try {
          payload.heroImage = await onUploadImage(file, "hero");
        } catch (err) {
          setFormError(
            err instanceof Error
              ? `${err.message} Recipe saved without a photo.`
              : "Image upload failed. Recipe saved without a photo."
          );
        }
      }
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  const canExtract = Boolean(file) || text.trim().length >= OCR_EXTRACT_MIN_TEXT_CHARS;

  if (step === "extracting") {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>Reading the recipe…</div>
        <div style={styles.helpText}>
          This can take a few seconds. Nothing is saved until you review and confirm.
        </div>
        <button
          type="button"
          onClick={() => {
            cancelledRef.current = true;
            setStep("capture");
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>Couldn’t import that recipe</div>
        {extractError && <div style={styles.errorInline}>{extractError}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" onClick={() => setStep("capture")}>
            Try again
          </button>
          <button type="button" onClick={() => onEnterManually({ notes: text.trim() || undefined })}>
            Enter manually
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === "review" && draft && initialForm) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Review imported recipe</div>
          <div style={styles.helpText}>
            Nothing is saved until you confirm. Highlighted fields were guessed or low-confidence —
            please check them against the original.
          </div>
        </div>
        <div style={styles.importWizardLayout}>
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Original</div>
            {previewUrl && (
              <img src={previewUrl} alt="Imported recipe" style={styles.importSourcePreview} />
            )}
            {!previewUrl && text.trim() && (
              <pre
                style={{
                  ...styles.helpText,
                  whiteSpace: "pre-wrap",
                  maxHeight: 360,
                  overflow: "auto",
                  margin: 0,
                }}
              >
                {text.trim()}
              </pre>
            )}
            {!previewUrl && !text.trim() && (
              <div style={styles.helpText}>No original text was kept for this import.</div>
            )}
          </div>
          <RecipeForm
            editing
            form={form}
            formError={formError}
            onChange={handleFormChange}
            onSubmit={() => void save()}
            onCancel={onCancel}
            catalog={catalog}
            customIngredients={customIngredients}
            heading="Imported draft"
            submitLabel={saving ? "Saving…" : "Save recipe"}
            submitDisabled={saving}
            review={{
              highlightedFieldKeys,
              unresolvedIngredientLineIds,
              ingredientAssignments: assignments,
              onAssignIngredient: (lineId, ingredientId) => {
                setAssignments((prev) => {
                  const next = { ...prev };
                  if (ingredientId) next[lineId] = ingredientId;
                  else delete next[lineId];
                  return next;
                });
              },
              suggestionsFor: (rawText) => suggestIngredientMatches(rawText, catalog, 6),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>Import recipe</div>
      <div style={styles.helpText}>
        Take a photo, upload an image, or paste recipe text. You’ll review every field before it
        is saved.
      </div>
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <label style={styles.label}>
          Paste recipe text
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Title, ingredients, and steps…"
            style={styles.input}
          />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => cameraInputRef.current?.click()}>
            Take photo
          </button>
          <button type="button" onClick={() => uploadInputRef.current?.click()}>
            Upload image
          </button>
          {file && (
            <span style={{ ...styles.textMuted, fontSize: 12 }}>
              {file.name}
              <button type="button" onClick={() => chooseFile(null)} style={{ marginLeft: 8 }}>
                Remove
              </button>
            </span>
          )}
        </div>
        {previewUrl && <img src={previewUrl} alt="Selected recipe" style={styles.importSourcePreview} />}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            e.target.value = "";
            chooseFile(next);
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            e.target.value = "";
            chooseFile(next);
          }}
        />
        {extractError && <div style={styles.errorInline}>{extractError}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void extract()} disabled={!canExtract}>
            Extract recipe
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
