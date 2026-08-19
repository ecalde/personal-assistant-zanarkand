import { useMemo, useState } from "react";
import {
  buildCompletedCookingSession,
  buildPlannedCookingSession,
  buildRecipeMasteryViews,
  completeCookingSession,
  describeRecipeGalleryEmptyState,
  filterAndSortRecipes,
  findPlannedCookingSession,
  recipeGalleryFiltersAreActive,
  type RecipeCategoryFilter,
  type RecipeCookTimeFilter,
  type RecipeDifficultyFilter,
  type RecipeExperienceFilter,
  type RecipeMasteryFilter,
  type RecipeAvailabilityFilter,
  type RecipesSortMode,
} from "../core/cooking";
import {
  abandonCookingSession,
  buildInProgressCookingSession,
  findActiveCookingSession,
  startGuidedFromPlanned,
} from "../core/cookingSession";
import { useCookingReferenceData } from "../core/cookingReferenceData";
import {
  buildRecipeAvailabilityMap,
  pantryIsInUse,
} from "../core/ingredients";
import type { CookingSession, PantryItem, Recipe } from "../core/model";
import { clearActiveCookingSessionMirror } from "../core/cookingSessionStorage";
import { formatLocalDateKey } from "../core/timeline";
import { CookingCompletionDialog } from "../components/cooking/CookingCompletionDialog";
import { PantryPanel } from "../components/cooking/PantryPanel";
import { RecipeDetail } from "../components/cooking/RecipeDetail";
import { RecipeForm } from "../components/cooking/RecipeForm";
import { RecipeGallery } from "../components/cooking/RecipeGallery";
import { RecipesToolbar } from "../components/cooking/RecipesToolbar";
import { ScheduleCookDialog } from "../components/cooking/ScheduleCookDialog";
import { GuidedCookingMode } from "../components/cooking/GuidedCookingMode";
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
  pantry: PantryItem[];
  onAddRecipe: (input: Omit<Recipe, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdateRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (recipeId: string) => void;
  onAddCookingSession: (
    input: Omit<CookingSession, "id" | "createdAtIso" | "updatedAtIso">
  ) => void;
  onUpdateCookingSession: (session: CookingSession) => void;
  onAddPantryItem: (input: Omit<PantryItem, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdatePantryItem: (item: PantryItem) => void;
  onDeletePantryItem: (itemId: string) => void;
};

type CookingView = "gallery" | "detail" | "form" | "guided" | "pantry";

export default function CookingPage({
  recipes,
  cookingSessions,
  pantry,
  onAddRecipe,
  onUpdateRecipe,
  onDeleteRecipe,
  onAddCookingSession,
  onUpdateCookingSession,
  onAddPantryItem,
  onUpdatePantryItem,
  onDeletePantryItem,
}: CookingPageProps) {
  const [view, setView] = useState<CookingView>("gallery");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [form, setForm] = useState<RecipeFormState>(emptyRecipeFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<RecipesSortMode>("recent");
  const [categoryFilter, setCategoryFilter] = useState<RecipeCategoryFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<RecipeDifficultyFilter>("all");
  const [experienceFilter, setExperienceFilter] = useState<RecipeExperienceFilter>("all");
  const [cookTimeFilter, setCookTimeFilter] = useState<RecipeCookTimeFilter>("all");
  const [masteryFilter, setMasteryFilter] = useState<RecipeMasteryFilter>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<RecipeAvailabilityFilter>("all");
  const catalog = useCookingReferenceData();
  const pantryActive = pantryIsInUse(pantry);
  const [loggingRecipeId, setLoggingRecipeId] = useState<string | null>(null);
  const [loggingSessionId, setLoggingSessionId] = useState<string | null>(null);
  const [schedulingRecipeId, setSchedulingRecipeId] = useState<string | null>(null);

  const masteryByRecipeId = useMemo(
    () => buildRecipeMasteryViews(recipes, cookingSessions),
    [recipes, cookingSessions]
  );
  const availabilityByRecipeId = useMemo(
    () => buildRecipeAvailabilityMap(recipes, pantry, catalog),
    [recipes, pantry, catalog]
  );

  const galleryFilters = {
    query,
    sortMode,
    categoryFilter,
    difficultyFilter,
    experienceFilter,
    cookTimeFilter,
    masteryFilter,
    availabilityFilter: pantryActive ? availabilityFilter : undefined,
  };

  const filteredRecipes = useMemo(
    () =>
      filterAndSortRecipes(recipes, {
        query,
        sortMode,
        categoryFilter,
        difficultyFilter,
        experienceFilter,
        cookTimeFilter,
        masteryFilter,
        availabilityFilter: pantryActive ? availabilityFilter : "all",
        masteryByRecipeId,
        availabilityByRecipeId,
      }),
    [
      recipes,
      query,
      sortMode,
      categoryFilter,
      difficultyFilter,
      experienceFilter,
      cookTimeFilter,
      masteryFilter,
      availabilityFilter,
      masteryByRecipeId,
      availabilityByRecipeId,
      pantryActive,
    ]
  );

  const selectedRecipe = selectedRecipeId
    ? recipes.find((recipe) => recipe.id === selectedRecipeId)
    : undefined;

  const loggingRecipe = loggingRecipeId
    ? recipes.find((recipe) => recipe.id === loggingRecipeId)
    : undefined;
  const loggingSession = loggingSessionId
    ? cookingSessions.find((session) => session.id === loggingSessionId)
    : undefined;
  const schedulingRecipe = schedulingRecipeId
    ? recipes.find((recipe) => recipe.id === schedulingRecipeId)
    : undefined;
  const todayKey = formatLocalDateKey(new Date());
  const activeSession = findActiveCookingSession(cookingSessions);
  const guidedSession = view === "guided" ? activeSession : undefined;
  const guidedRecipe = guidedSession?.recipeId
    ? recipes.find((recipe) => recipe.id === guidedSession.recipeId)
    : undefined;

  function startGuided(recipe: Recipe) {
    const existing = findActiveCookingSession(cookingSessions);
    if (existing) {
      setView("guided");
      return;
    }

    const planned = findPlannedCookingSession(cookingSessions, recipe.id, todayKey);
    if (planned) {
      onUpdateCookingSession(
        startGuidedFromPlanned(planned, recipe, new Date(), () => crypto.randomUUID())
      );
      setView("guided");
      return;
    }

    onAddCookingSession(
      buildInProgressCookingSession(recipe, new Date(), () => crypto.randomUUID())
    );
    setView("guided");
  }

  function leaveGuided() {
    setView(selectedRecipeId ? "detail" : "gallery");
  }

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

    const payload = recipePayloadFromForm(form, {
      catalog,
      previous: editingRecipeId
        ? recipes.find((recipe) => recipe.id === editingRecipeId)
        : undefined,
    });

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

  function clearGalleryFilters() {
    setQuery("");
    setCategoryFilter("all");
    setDifficultyFilter("all");
    setExperienceFilter("all");
    setCookTimeFilter("all");
    setMasteryFilter("all");
    setAvailabilityFilter("all");
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {view === "gallery" && activeSession && (
              <button type="button" onClick={() => setView("guided")}>
                Resume cook
              </button>
            )}
            {view === "gallery" && (
              <button type="button" onClick={() => setView("pantry")}>
                Pantry
              </button>
            )}
            {view === "gallery" && (
              <button type="button" onClick={openCreateForm}>
                Add recipe
              </button>
            )}
          </div>
        </div>
        <div style={styles.textSecondary}>
          Build a personal recipe library, track pantry ingredients, and log cooks to earn
          Creative XP and recipe mastery.
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
          catalog={catalog}
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
          availability={availabilityByRecipeId.get(selectedRecipe.id)}
          showAvailability={pantryActive}
          pantry={pantry}
          catalog={catalog}
          onBack={() => {
            setSelectedRecipeId(null);
            setView("gallery");
          }}
          onEdit={() => openEditForm(selectedRecipe)}
          onDelete={() => handleDelete(selectedRecipe.id)}
          onStartCooking={() => startGuided(selectedRecipe)}
          onLogCook={() => {
            const planned = findPlannedCookingSession(
              cookingSessions,
              selectedRecipe.id,
              todayKey
            );
            setLoggingRecipeId(selectedRecipe.id);
            setLoggingSessionId(planned?.id ?? null);
          }}
          onScheduleCook={() => setSchedulingRecipeId(selectedRecipe.id)}
          resumeLabel={
            activeSession?.recipeId === selectedRecipe.id ? "Resume Cooking" : undefined
          }
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

      {view === "guided" && guidedSession && guidedRecipe && (
        <GuidedCookingMode
          recipe={guidedRecipe}
          session={guidedSession}
          onChange={onUpdateCookingSession}
          onLeave={leaveGuided}
          onFinish={() => {
            setLoggingRecipeId(guidedRecipe.id);
            setLoggingSessionId(guidedSession.id);
          }}
          onAbandon={() => {
            onUpdateCookingSession(abandonCookingSession(guidedSession));
            clearActiveCookingSessionMirror(guidedSession.id);
            setView(selectedRecipeId ? "detail" : "gallery");
          }}
        />
      )}

      {view === "guided" && guidedSession && !guidedRecipe && (
        <div style={styles.card}>
          <div style={styles.helpText}>
            That recipe is no longer available. You can abandon this cook.
          </div>
          <button
            type="button"
            onClick={() => {
              onUpdateCookingSession(abandonCookingSession(guidedSession));
              clearActiveCookingSessionMirror(guidedSession.id);
              setView("gallery");
            }}
          >
            Abandon cook
          </button>
        </div>
      )}

      {view === "guided" && !guidedSession && (
        <div style={styles.card}>
          <div style={styles.helpText}>Starting guided cook…</div>
        </div>
      )}

      {view === "pantry" && (
        <PantryPanel
          pantry={pantry}
          catalog={catalog}
          onAdd={onAddPantryItem}
          onUpdate={onUpdatePantryItem}
          onDelete={onDeletePantryItem}
          onBack={() => setView("gallery")}
        />
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
              <RecipesToolbar
                query={query}
                sortMode={sortMode}
                categoryFilter={categoryFilter}
                difficultyFilter={difficultyFilter}
                experienceFilter={experienceFilter}
                cookTimeFilter={cookTimeFilter}
                masteryFilter={masteryFilter}
                availabilityFilter={availabilityFilter}
                showAvailabilityFilter={pantryActive}
                visibleCount={filteredRecipes.length}
                totalCount={recipes.length}
                onQueryChange={setQuery}
                onSortModeChange={setSortMode}
                onCategoryFilterChange={setCategoryFilter}
                onDifficultyFilterChange={setDifficultyFilter}
                onExperienceFilterChange={setExperienceFilter}
                onCookTimeFilterChange={setCookTimeFilter}
                onMasteryFilterChange={setMasteryFilter}
                onAvailabilityFilterChange={setAvailabilityFilter}
                onClearFilters={clearGalleryFilters}
              />
              <RecipeGallery
                recipes={filteredRecipes}
                masteryByRecipeId={masteryByRecipeId}
                availabilityByRecipeId={availabilityByRecipeId}
                showAvailability={pantryActive}
                emptyMessage={describeRecipeGalleryEmptyState(galleryFilters)}
                onClearFilters={
                  recipeGalleryFiltersAreActive(galleryFilters)
                    ? clearGalleryFilters
                    : undefined
                }
                onOpenRecipe={openDetail}
              />
            </>
          )}
        </div>
      )}

      {loggingRecipe && (
        <CookingCompletionDialog
          recipe={loggingRecipe}
          initialNotes={loggingSession?.notes}
          initialStartedAtIso={loggingSession?.startedAtIso}
          onCancel={() => {
            setLoggingRecipeId(null);
            setLoggingSessionId(null);
          }}
          onConfirm={(values) => {
            const completed = loggingSession
              ? completeCookingSession(loggingSession, values)
              : buildCompletedCookingSession(loggingRecipe, values);
            if (loggingSession) {
              onUpdateCookingSession({
                ...loggingSession,
                ...completed,
              });
            } else {
              onAddCookingSession(completed);
            }
            if (loggingSession?.id) clearActiveCookingSessionMirror(loggingSession.id);
            if (view === "guided") {
              setView("gallery");
            }
            setLoggingRecipeId(null);
            setLoggingSessionId(null);
          }}
        />
      )}

      {schedulingRecipe && (
        <ScheduleCookDialog
          recipes={recipes}
          initialRecipeId={schedulingRecipe.id}
          initialDate={todayKey}
          onCancel={() => setSchedulingRecipeId(null)}
          onConfirm={(values) => {
            const planned = buildPlannedCookingSession(schedulingRecipe, values);
            if (planned) onAddCookingSession(planned);
            setSchedulingRecipeId(null);
          }}
        />
      )}
    </div>
  );
}
