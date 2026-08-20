import { useRef, useState, type CSSProperties } from "react";
import {
  COOKING_METHOD_LABELS,
  RECIPE_CATEGORY_LABELS,
  RECIPE_DIFFICULTY_LABELS,
  RECIPE_EXPERIENCE_LABELS,
  RECIPE_STEP_KIND_LABELS,
  getCookingMethodValues,
  getRecipeCategoryValues,
  getRecipeDifficultyValues,
  getRecipeExperienceLevelValues,
  getRecipeStepKindValues,
} from "../../core/cooking";
import type { IngredientCatalog } from "../../core/ingredientCatalog";
import { describeIngredientMatch, type IngredientSuggestion } from "../../core/ingredients";
import type { CustomIngredient, SanityImageRef } from "../../core/model";
import {
  RECIPE_GALLERY_MAX_IMAGES,
  validateRecipeImageFile,
  type RecipeImageKind,
} from "../../core/sanityUploadContract";
import { styles } from "../../ui/appStyles";
import { RecipeImage } from "./RecipeImage";
import {
  emptyEquipmentFormRow,
  emptyIngredientFormRow,
  emptyStepFormRow,
  applyStepKindDefaults,
  type RecipeFormState,
} from "./recipeFormState";

export type RecipeFormReviewHints = {
  highlightedFieldKeys: ReadonlySet<string>;
  unresolvedIngredientLineIds: string[];
  ingredientAssignments: Record<string, string>;
  onAssignIngredient: (lineId: string, ingredientId: string | undefined) => void;
  suggestionsFor: (rawText: string) => IngredientSuggestion[];
};

export type RecipeFormProps = {
  editing: boolean;
  form: RecipeFormState;
  formError: string | null;
  onChange: (next: RecipeFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onUploadImage?: (file: File, kind: RecipeImageKind) => Promise<SanityImageRef>;
  catalog?: IngredientCatalog;
  customIngredients?: CustomIngredient[];
  heading?: string;
  submitLabel?: string;
  submitDisabled?: boolean;
  review?: RecipeFormReviewHints;
};

const compactLabel = { ...styles.label, fontSize: 12 };
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

function fieldStyle(
  base: CSSProperties,
  key: string,
  highlighted?: ReadonlySet<string>
): CSSProperties {
  if (!highlighted?.has(key)) return base;
  return { ...base, ...styles.lowConfidenceField };
}

function ConfirmHint({ show }: { show: boolean }) {
  if (!show) return null;
  return <div style={{ ...styles.textMuted, fontSize: 12 }}>Low confidence — please confirm</div>;
}

export function RecipeForm({
  editing,
  form,
  formError,
  onChange,
  onSubmit,
  onCancel,
  onUploadImage,
  catalog,
  customIngredients = [],
  heading,
  submitLabel,
  submitDisabled,
  review,
}: RecipeFormProps) {
  const [uploadingKind, setUploadingKind] = useState<RecipeImageKind | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  async function handleImageFile(file: File, kind: RecipeImageKind) {
    if (!onUploadImage) return;
    const validationError = validateRecipeImageFile(file);
    if (validationError) {
      setImageError(validationError);
      return;
    }
    if (kind === "gallery" && formRef.current.gallery.length >= RECIPE_GALLERY_MAX_IMAGES) {
      setImageError(`Gallery is limited to ${RECIPE_GALLERY_MAX_IMAGES} photos.`);
      return;
    }

    setImageError(null);
    setUploadingKind(kind);
    try {
      const image = await onUploadImage(file, kind);
      const current = formRef.current;
      if (kind === "hero") {
        onChange({ ...current, heroImage: image });
      } else {
        onChange({ ...current, gallery: [...current.gallery, image] });
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploadingKind(null);
    }
  }
  function updateIngredient(index: number, patch: Partial<RecipeFormState["ingredients"][number]>) {
    onChange({
      ...form,
      ingredients: form.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function updateStep(index: number, patch: Partial<RecipeFormState["steps"][number]>) {
    onChange({
      ...form,
      steps: form.steps.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function updateEquipment(index: number, name: string) {
    onChange({
      ...form,
      equipment: form.equipment.map((row, i) => (i === index ? { ...row, name } : row)),
    });
  }

  const highlighted = review?.highlightedFieldKeys;

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{heading ?? (editing ? "Edit recipe" : "Add recipe")}</div>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={styles.label}>
          Title
          <input
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            placeholder='e.g., "Weeknight carbonara"'
            style={fieldStyle(styles.input, "title", highlighted)}
          />
          <ConfirmHint show={Boolean(highlighted?.has("title"))} />
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          <label style={styles.label}>
            Category
            <select
              value={form.category}
              onChange={(e) =>
                onChange({ ...form, category: e.target.value as RecipeFormState["category"] })
              }
              style={fieldStyle(styles.inputCompact, "category", highlighted)}
            >
              {getRecipeCategoryValues().map((category) => (
                <option key={category} value={category}>
                  {RECIPE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
            <ConfirmHint show={Boolean(highlighted?.has("category"))} />
          </label>

          <label style={styles.label}>
            Difficulty
            <select
              value={form.difficulty}
              onChange={(e) =>
                onChange({
                  ...form,
                  difficulty: e.target.value as RecipeFormState["difficulty"],
                })
              }
              style={fieldStyle(styles.inputCompact, "difficulty", highlighted)}
            >
              {getRecipeDifficultyValues().map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {RECIPE_DIFFICULTY_LABELS[difficulty]}
                </option>
              ))}
            </select>
            <ConfirmHint show={Boolean(highlighted?.has("difficulty"))} />
          </label>

          <label style={styles.label}>
            Experience
            <select
              value={form.experienceLevel}
              onChange={(e) =>
                onChange({
                  ...form,
                  experienceLevel: e.target.value as RecipeFormState["experienceLevel"],
                })
              }
              style={fieldStyle(styles.inputCompact, "experienceLevel", highlighted)}
            >
              {getRecipeExperienceLevelValues().map((level) => (
                <option key={level} value={level}>
                  {RECIPE_EXPERIENCE_LABELS[level]}
                </option>
              ))}
            </select>
            <ConfirmHint show={Boolean(highlighted?.has("experienceLevel"))} />
          </label>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          <label style={styles.label}>
            Cook time (minutes)
            <input
              value={form.estimatedMinutes}
              onChange={(e) => onChange({ ...form, estimatedMinutes: e.target.value })}
              placeholder="30"
              inputMode="numeric"
              style={fieldStyle(styles.inputCompact, "estimatedMinutes", highlighted)}
            />
            <ConfirmHint show={Boolean(highlighted?.has("estimatedMinutes"))} />
          </label>
          <label style={styles.label}>
            Servings
            <input
              value={form.servings}
              onChange={(e) => onChange({ ...form, servings: e.target.value })}
              placeholder="4"
              inputMode="numeric"
              style={fieldStyle(styles.inputCompact, "servings", highlighted)}
            />
            <ConfirmHint show={Boolean(highlighted?.has("servings"))} />
          </label>
          <label style={styles.label}>
            Cooking method
            <select
              value={form.cookingMethod}
              onChange={(e) =>
                onChange({
                  ...form,
                  cookingMethod: e.target.value as RecipeFormState["cookingMethod"],
                })
              }
              style={styles.inputCompact}
            >
              <option value="">Not set</option>
              {getCookingMethodValues().map((method) => (
                <option key={method} value={method}>
                  {COOKING_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(onUploadImage || form.heroImage || form.gallery.length > 0) && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 700 }}>Photos</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ ...styles.textMuted, fontSize: 12 }}>Hero</div>
              {form.heroImage && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <RecipeImage
                    image={form.heroImage}
                    alt="Hero"
                    preset="thumb"
                    style={styles.recipeFormImagePreview}
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ ...form, heroImage: null })}
                  >
                    Remove hero
                  </button>
                </div>
              )}
              {onUploadImage && (
                <label style={{ ...compactLabel, maxWidth: 280 }}>
                  {uploadingKind === "hero" ? "Uploading…" : form.heroImage ? "Replace hero" : "Upload hero"}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    disabled={uploadingKind !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void handleImageFile(file, "hero");
                    }}
                  />
                </label>
              )}
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ ...styles.textMuted, fontSize: 12 }}>
                Gallery ({form.gallery.length}/{RECIPE_GALLERY_MAX_IMAGES})
              </div>
              {form.gallery.length > 0 && (
                <div style={styles.recipeGalleryStrip}>
                  {form.gallery.map((image, index) => (
                    <div key={`${image.assetRef}-${index}`} style={{ display: "grid", gap: 6 }}>
                      <RecipeImage
                        image={image}
                        alt={`Gallery ${index + 1}`}
                        preset="gallery"
                        style={styles.recipeGalleryThumb}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...form,
                            gallery: form.gallery.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {onUploadImage && form.gallery.length < RECIPE_GALLERY_MAX_IMAGES && (
                <label style={{ ...compactLabel, maxWidth: 280 }}>
                  {uploadingKind === "gallery" ? "Uploading…" : "Add gallery photo"}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    disabled={uploadingKind !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void handleImageFile(file, "gallery");
                    }}
                  />
                </label>
              )}
            </div>
            {imageError && <div style={styles.errorInline}>{imageError}</div>}
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Ingredients</div>
          {form.ingredients.map((row, index) => {
            const ingredientKey = `ingredient:${row.id}`;
            const assignedId = review?.ingredientAssignments[row.id];
            const suggestions =
              review && row.rawText.trim() ? review.suggestionsFor(row.rawText) : [];
            const needsPicker = Boolean(
              review &&
                row.rawText.trim() &&
                (review.unresolvedIngredientLineIds.includes(row.id) || assignedId)
            );
            return (
            <div key={row.id} style={{ display: "grid", gap: 4 }}>
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}
              >
                <input
                  value={row.rawText}
                  onChange={(e) => updateIngredient(index, { rawText: e.target.value })}
                  placeholder='e.g., "2 eggs"'
                  style={fieldStyle(styles.inputCompact, ingredientKey, highlighted)}
                />
                <label style={{ ...compactLabel, display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={row.optional}
                    onChange={(e) => updateIngredient(index, { optional: e.target.checked })}
                  />
                  Optional
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (form.ingredients.length <= 1) return;
                    onChange({
                      ...form,
                      ingredients: form.ingredients.filter((_, i) => i !== index),
                    });
                  }}
                  disabled={form.ingredients.length <= 1}
                >
                  Remove
                </button>
              </div>
              {needsPicker && review && (
                <label style={compactLabel}>
                  Match to catalog
                  <select
                    value={assignedId ?? ""}
                    onChange={(e) =>
                      review.onAssignIngredient(row.id, e.target.value ? e.target.value : undefined)
                    }
                    style={styles.inputCompact}
                  >
                    <option value="">Keep unmatched</option>
                    {suggestions.map((suggestion) => (
                      <option key={suggestion.ingredientId} value={suggestion.ingredientId}>
                        {suggestion.name} · {Math.round(suggestion.confidence * 100)}%
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {catalog && row.rawText.trim() && (
                <div style={{ ...styles.textMuted, fontSize: 12 }}>
                  {assignedId
                    ? `${suggestions.find((item) => item.ingredientId === assignedId)?.name ?? "Matched"} · you chose`
                    : describeIngredientMatch(row.rawText, catalog, customIngredients) ??
                      "Unmatched — save will keep the raw line"}
                </div>
              )}
              <ConfirmHint show={Boolean(highlighted?.has(ingredientKey))} />
            </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              onChange({ ...form, ingredients: [...form.ingredients, emptyIngredientFormRow()] })
            }
          >
            Add ingredient
          </button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Steps</div>
          {form.steps.map((row, index) => {
            const showTimerFields = row.kind === "wait" || row.kind === "timer" || row.timerMinutes.trim().length > 0;
            return (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid var(--aether-panel-border, #e5e5e5)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ ...styles.textMuted, fontSize: 12 }}>Step {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (form.steps.length <= 1) return;
                      onChange({
                        ...form,
                        steps: form.steps.filter((_, i) => i !== index),
                      });
                    }}
                    disabled={form.steps.length <= 1}
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={row.text}
                  onChange={(e) => updateStep(index, { text: e.target.value })}
                  rows={2}
                  placeholder="What to do in this step"
                  style={fieldStyle(styles.inputCompact, `step:${row.id}`, highlighted)}
                />
                <ConfirmHint show={Boolean(highlighted?.has(`step:${row.id}`))} />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 8,
                  }}
                >
                  <label style={compactLabel}>
                    Kind
                    <select
                      value={row.kind}
                      onChange={(e) =>
                        updateStep(index, applyStepKindDefaults(row, e.target.value as typeof row.kind))
                      }
                      style={styles.inputCompact}
                    >
                      {getRecipeStepKindValues().map((kind) => (
                        <option key={kind} value={kind}>
                          {RECIPE_STEP_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={compactLabel}>
                    Timer (minutes)
                    <input
                      value={row.timerMinutes}
                      onChange={(e) => updateStep(index, { timerMinutes: e.target.value })}
                      placeholder={showTimerFields ? "10" : "Optional"}
                      inputMode="decimal"
                      style={styles.inputCompact}
                    />
                  </label>
                  <label style={compactLabel}>
                    Timer label
                    <input
                      value={row.timerLabel}
                      onChange={(e) => updateStep(index, { timerLabel: e.target.value })}
                      placeholder="Pasta"
                      style={styles.inputCompact}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <label style={{ ...compactLabel, display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={row.blocksProgress}
                      onChange={(e) => updateStep(index, { blocksProgress: e.target.checked })}
                    />
                    Blocks next step
                  </label>
                  <label style={{ ...compactLabel, display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={row.canRunInBackground}
                      onChange={(e) => updateStep(index, { canRunInBackground: e.target.checked })}
                    />
                    Timer can run in background
                  </label>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => onChange({ ...form, steps: [...form.steps, emptyStepFormRow()] })}
          >
            Add step
          </button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Equipment (optional)</div>
          {form.equipment.map((row, index) => (
            <div
              key={row.id}
              style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}
            >
              <input
                value={row.name}
                onChange={(e) => updateEquipment(index, e.target.value)}
                placeholder='e.g., "Large skillet"'
                style={styles.inputCompact}
              />
              <button
                type="button"
                onClick={() => {
                  if (form.equipment.length <= 1) {
                    onChange({ ...form, equipment: [emptyEquipmentFormRow()] });
                    return;
                  }
                  onChange({
                    ...form,
                    equipment: form.equipment.filter((_, i) => i !== index),
                  });
                }}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ ...form, equipment: [...form.equipment, emptyEquipmentFormRow()] })
            }
          >
            Add equipment
          </button>
        </div>

        <label style={styles.label}>
          Notes (optional)
          <textarea
            value={form.notes}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
            rows={3}
            style={fieldStyle(styles.input, "notes", highlighted)}
          />
          <ConfirmHint show={Boolean(highlighted?.has("notes"))} />
        </label>

        {formError && <div style={styles.errorInline}>{formError}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onSubmit} disabled={uploadingKind !== null || submitDisabled}>
            {submitLabel ?? (editing ? "Save recipe" : "Add recipe")}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
