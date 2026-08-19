import { useMemo, useState } from "react";
import {
  buildCompletedCookingSession,
  buildRecipeMasteryViews,
  filterAndSortRecipes,
  getRecipeCategoryValues,
  RECIPE_CATEGORY_LABELS,
  type RecipeCategoryFilter,
  type RecipesSortMode,
} from "../core/cooking";
import type { CookingSession, Recipe } from "../core/model";
import { CookingCompletionDialog } from "../components/cooking/CookingCompletionDialog";
import { RecipeDetail } from "../components/cooking/RecipeDetail";
import { RecipeForm } from "../components/cooking/RecipeForm";
import { RecipeGallery } from "../components/cooking/RecipeGallery";
import {
  emptyRecipeFormState,
  recipeFormFromRecipe,
  recipePayloadFromForm,
  validateRecipeForm,
  type RecipeFormState,
} from "../components/cooking/recipeFormState";
import { isSanityConfigured } from "../lib/sanityClient";
import { uploadRecipeImage } from "../lib/sanityUpload";
import { styles } from "../ui/appStyles";

export type CookingPageProps = {
  recipes: Recipe[];
  cookingSessions: CookingSession[];
  onAddRecipe: (input: Omit<Recipe, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdateRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (recipeId: string) => void;
  onAddCookingSession: (
    input: Omit<CookingSession, "id" | "createdAtIso" | "updatedAtIso">
  ) => void;
};

type CookingView = "gallery" | "detail" | "form";

export default function CookingPage({
  recipes,
  cookingSessions,
  onAddRecipe,
  onUpdateRecipe,
  onDeleteRecipe,
  onAddCookingSession,
}: CookingPageProps) {
  const [view, setView] = useState<CookingView>("gallery");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [form, setForm] = useState<RecipeFormState>(emptyRecipeFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<RecipesSortMode>("recent");
  const [categoryFilter, setCategoryFilter] = useState<RecipeCategoryFilter>("all");
  const [loggingRecipeId, setLoggingRecipeId] = useState<string | null>(null);

  const filteredRecipes = useMemo(
    () =>
      filterAndSortRecipes(recipes, {
        query,
        sortMode,
        categoryFilter,
      }),
    [recipes, query, sortMode, categoryFilter]
  );

  const selectedRecipe = selectedRecipeId
    ? recipes.find((recipe) => recipe.id === selectedRecipeId)
    : undefined;

  const masteryByRecipeId = useMemo(
    () => buildRecipeMasteryViews(recipes, cookingSessions),
    [recipes, cookingSessions]
  );

  const loggingRecipe = loggingRecipeId
    ? recipes.find((recipe) => recipe.id === loggingRecipeId)
    : undefined;

  function resetForm() {
    setForm(emptyRecipeFormState());
    setEditingRecipeId(null);
    setFormError(null);
    setView(selectedRecipeId ? "detail" : "gallery");
  }

  function openCreateForm() {
    setForm(emptyRecipeFormState());
    setEditingRecipeId(null);
    setFormError(null);
    setSelectedRecipeId(null);
    setView("form");
  }

  function openEditForm(recipe: Recipe) {
    setForm(recipeFormFromRecipe(recipe));
    setEditingRecipeId(recipe.id);
    setFormError(null);
    setView("form");
  }

  function openDetail(recipeId: string) {
    setSelectedRecipeId(recipeId);
    setView("detail");
  }

  function handleSubmit() {
    const validationError = validateRecipeForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const payload = recipePayloadFromForm(form);

    if (editingRecipeId) {
      const existing = recipes.find((recipe) => recipe.id === editingRecipeId);
      if (!existing) {
        setFormError("Could not find that recipe.");
        return;
      }
      const nextRecipe: Recipe = { ...existing, ...payload };
      if (!payload.heroImage) delete nextRecipe.heroImage;
      onUpdateRecipe(nextRecipe);
      setSelectedRecipeId(existing.id);
      setForm(emptyRecipeFormState());
      setEditingRecipeId(null);
      setFormError(null);
      setView("detail");
      return;
    }

    onAddRecipe(payload);
    setForm(emptyRecipeFormState());
    setEditingRecipeId(null);
    setFormError(null);
    setView("gallery");
  }

  function handleDelete(recipeId: string) {
    onDeleteRecipe(recipeId);
    setSelectedRecipeId(null);
    setView("gallery");
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={styles.cardTitle}>Cooking</div>
          {view === "gallery" && (
            <button type="button" onClick={openCreateForm}>
              Add recipe
            </button>
          )}
        </div>
        <div style={styles.textSecondary}>
          Build a personal recipe library and log completed cooks to earn Creative XP and
          recipe mastery.
        </div>
      </div>

      {view === "form" && (
        <RecipeForm
          editing={Boolean(editingRecipeId)}
          form={form}
          formError={formError}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={resetForm}
          onUploadImage={
            isSanityConfigured()
              ? (file, kind) =>
                  uploadRecipeImage(file, {
                    kind,
                    recipeId: editingRecipeId ?? undefined,
                    alt: form.title.trim() || undefined,
                  })
              : undefined
          }
        />
      )}

      {view === "detail" && selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          mastery={masteryByRecipeId.get(selectedRecipe.id)}
          onBack={() => {
            setSelectedRecipeId(null);
            setView("gallery");
          }}
          onEdit={() => openEditForm(selectedRecipe)}
          onDelete={() => handleDelete(selectedRecipe.id)}
          onStartCooking={() => setLoggingRecipeId(selectedRecipe.id)}
        />
      )}

      {view === "detail" && !selectedRecipe && (
        <div style={styles.card}>
          <div style={styles.helpText}>That recipe is no longer available.</div>
          <button
            type="button"
            onClick={() => {
              setSelectedRecipeId(null);
              setView("gallery");
            }}
          >
            Back to recipes
          </button>
        </div>
      )}

      {view === "gallery" && (
        <div style={styles.card}>
          {recipes.length === 0 ? (
            <div>
              <div style={{ marginBottom: 12 }}>
                Add a recipe with ingredients and steps to get started.
              </div>
              <button type="button" onClick={openCreateForm}>
                Add your first recipe
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search recipes"
                  style={{ ...styles.inputCompact, maxWidth: 260 }}
                />
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as RecipesSortMode)}
                  style={styles.select}
                >
                  <option value="recent">Recent</option>
                  <option value="title">Title</option>
                  <option value="category">Category</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) =>
                    setCategoryFilter(e.target.value as RecipeCategoryFilter)
                  }
                  style={styles.select}
                >
                  <option value="all">All categories</option>
                  {getRecipeCategoryValues().map((category) => (
                    <option key={category} value={category}>
                      {RECIPE_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
                <span style={styles.helpText}>
                  {filteredRecipes.length} of {recipes.length}
                </span>
              </div>
              <RecipeGallery
                recipes={filteredRecipes}
                masteryByRecipeId={masteryByRecipeId}
                emptyQuery={query.trim() || undefined}
                onOpenRecipe={openDetail}
              />
            </>
          )}
        </div>
      )}

      {loggingRecipe && (
        <CookingCompletionDialog
          recipe={loggingRecipe}
          onCancel={() => setLoggingRecipeId(null)}
          onConfirm={(values) => {
            onAddCookingSession(buildCompletedCookingSession(loggingRecipe, values));
            setLoggingRecipeId(null);
          }}
        />
      )}
    </div>
  );
}
