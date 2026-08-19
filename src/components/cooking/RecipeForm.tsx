import { useRef, useState } from "react";
import {
  RECIPE_CATEGORY_LABELS,
  RECIPE_DIFFICULTY_LABELS,
  RECIPE_EXPERIENCE_LABELS,
  getRecipeCategoryValues,
  getRecipeDifficultyValues,
  getRecipeExperienceLevelValues,
} from "../../core/cooking";
import {
  RECIPE_GALLERY_MAX_IMAGES,
  validateRecipeImageFile,
  type RecipeImageKind,
} from "../../core/sanityUploadContract";
import type { SanityImageRef } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { RecipeImage } from "./RecipeImage";
import {
  emptyEquipmentFormRow,
  emptyIngredientFormRow,
  emptyStepFormRow,
  type RecipeFormState,
} from "./recipeFormState";

export type RecipeFormProps = {
  editing: boolean;
  form: RecipeFormState;
  formError: string | null;
  onChange: (next: RecipeFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onUploadImage?: (file: File, kind: RecipeImageKind) => Promise<SanityImageRef>;
};

const compactLabel = { ...styles.label, fontSize: 12 };
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function RecipeForm({
  editing,
  form,
  formError,
  onChange,
  onSubmit,
  onCancel,
  onUploadImage,
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

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{editing ? "Edit recipe" : "Add recipe"}</div>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={styles.label}>
          Title
          <input
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            placeholder='e.g., "Weeknight carbonara"'
            style={styles.input}
          />
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
              style={styles.inputCompact}
            >
              {getRecipeCategoryValues().map((category) => (
                <option key={category} value={category}>
                  {RECIPE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
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
              style={styles.inputCompact}
            >
              {getRecipeDifficultyValues().map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {RECIPE_DIFFICULTY_LABELS[difficulty]}
                </option>
              ))}
            </select>
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
              style={styles.inputCompact}
            >
              {getRecipeExperienceLevelValues().map((level) => (
                <option key={level} value={level}>
                  {RECIPE_EXPERIENCE_LABELS[level]}
                </option>
              ))}
            </select>
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
              style={styles.inputCompact}
            />
          </label>
          <label style={styles.label}>
            Servings
            <input
              value={form.servings}
              onChange={(e) => onChange({ ...form, servings: e.target.value })}
              placeholder="4"
              inputMode="numeric"
              style={styles.inputCompact}
            />
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
          {form.ingredients.map((row, index) => (
            <div
              key={row.id}
              style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}
            >
              <input
                value={row.rawText}
                onChange={(e) => updateIngredient(index, { rawText: e.target.value })}
                placeholder='e.g., "2 eggs"'
                style={styles.inputCompact}
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
          ))}
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
          {form.steps.map((row, index) => (
            <div key={row.id} style={{ display: "grid", gap: 6 }}>
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
                style={styles.inputCompact}
              />
            </div>
          ))}
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
            style={styles.input}
          />
        </label>

        {formError && <div style={styles.errorInline}>{formError}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onSubmit} disabled={uploadingKind !== null}>
            {editing ? "Save recipe" : "Add recipe"}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
