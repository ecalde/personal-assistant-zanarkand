import { useEffect, useMemo, useState } from "react";
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
  draftWeeklyMealPlan,
  suggestRecipesFromPantry,
} from "../core/cookingSuggestions";
import { getLocalWeekRange } from "../core/review";
import {
  abandonCookingSession,
  buildInProgressCookingSession,
  findActiveCookingSession,
  startGuidedFromPlanned,
} from "../core/cookingSession";
import { useCookingReferenceData } from "../core/cookingReferenceData";
import {
  catalogRecipeAsRecipe,
  cloneCatalogRecipe,
  findClonedCatalogRecipe,
} from "../core/recipeCatalog";
import {
  buildRecipeAvailabilityMap,
  pantryIsInUse,
} from "../core/ingredients";
import {
  buildNutritionIndexes,
  computeRecipeNutrition,
  ingredientIdsNeedingFetch,
} from "../core/nutrition";
import type { CookingSession, CustomIngredient, PantryItem, Recipe } from "../core/model";
import { fetchIngredientNutrition } from "../lib/nutritionFetch";
import { clearActiveCookingSessionMirror } from "../core/cookingSessionStorage";
import { formatLocalDateKey } from "../core/timeline";
import { CookingCompletionDialog } from "../components/cooking/CookingCompletionDialog";
import { CustomIngredientsPanel } from "../components/cooking/CustomIngredientsPanel";
import { ImportWizard } from "../components/cooking/ImportWizard";
import { CatalogBrowser } from "../components/cooking/CatalogBrowser";
import { PantryPanel } from "../components/cooking/PantryPanel";
import { RecipeDetail } from "../components/cooking/RecipeDetail";
import { RecipeForm } from "../components/cooking/RecipeForm";
import { RecipeGallery } from "../components/cooking/RecipeGallery";
import { RecipesToolbar } from "../components/cooking/RecipesToolbar";
import { MakeNowRail } from "../components/cooking/MakeNowRail";
import { MealPlanDraftCard } from "../components/cooking/MealPlanDraftCard";
import { ScheduleCookDialog } from "../components/cooking/ScheduleCookDialog";
import { CookingNotificationBanner } from "../components/cooking/CookingNotificationBanner";
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
  customIngredients: CustomIngredient[];
  onAddRecipe: (input: Omit<Recipe, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdateRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (recipeId: string) => void;
  onAddCookingSession: (
    input: Omit<CookingSession, "id" | "createdAtIso" | "updatedAtIso">
  ) => void;
  onUpdateCookingSession: (session: CookingSession) => void;
  cookingFocusActive?: boolean;
  onEnterCookingFocus?: (sessionId: string) => void;
  onExitCookingFocus?: () => void;
  onAddPantryItem: (input: Omit<PantryItem, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdatePantryItem: (item: PantryItem) => void;
  onDeletePantryItem: (itemId: string) => void;
  onAddCustomIngredient: (
    input: Omit<CustomIngredient, "id" | "createdAtIso" | "updatedAtIso">
  ) => void;
  onDeleteCustomIngredient: (itemId: string) => void;
};

type CookingView =
  | "gallery"
  | "detail"
  | "form"
  | "guided"
  | "pantry"
  | "import"
  | "catalog";

export default function CookingPage({
  recipes,
  cookingSessions,
  pantry,
  customIngredients,
  onAddRecipe,
  onUpdateRecipe,
  onDeleteRecipe,
  onAddCookingSession,
  onUpdateCookingSession,
  cookingFocusActive = false,
  onEnterCookingFocus,
  onExitCookingFocus,
  onAddPantryItem,
  onUpdatePantryItem,
  onDeletePantryItem,
  onAddCustomIngredient,
  onDeleteCustomIngredient,
}: CookingPageProps) {
  const [view, setView] = useState<CookingView>(() =>
    cookingFocusActive ? "guided" : "gallery"
  );
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedCatalogRecipeId, setSelectedCatalogRecipeId] = useState<string | null>(null);
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
  const { catalog, nutrients, retentionFactors, recipeCatalog, mergeFetchedNutrients } =
    useCookingReferenceData();
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
  const nutritionIndexes = useMemo(
    () =>
      buildNutritionIndexes({
        catalog,
        nutrients,
        customIngredients,
        retentionFactors,
      }),
    [catalog, nutrients, customIngredients, retentionFactors]
  );

  useEffect(() => {
    const missing = ingredientIdsNeedingFetch(
      [...recipes, ...recipeCatalog.map(catalogRecipeAsRecipe)],
      nutritionIndexes
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void fetchIngredientNutrition(missing)
      .then((result) => {
        if (!cancelled && result.nutrients.length > 0) {
          mergeFetchedNutrients(result.nutrients);
        }
      })
      .catch(() => {
        // Seed cache still covers the catalog; live USDA is best-effort.
      });
    return () => {
      cancelled = true;
    };
  }, [recipes, recipeCatalog, nutritionIndexes, mergeFetchedNutrients]);

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
  const selectedCatalogRecipe = selectedCatalogRecipeId
    ? recipeCatalog.find((entry) => entry.id === selectedCatalogRecipeId)
    : undefined;
  const clonedCatalogIds = useMemo(
    () =>
      new Set(
        recipes
          .map((recipe) => recipe.catalogRecipeId)
          .filter((id): id is string => Boolean(id))
      ),
    [recipes]
  );
  const selectedRecipeNutrition = selectedRecipe
    ? computeRecipeNutrition(selectedRecipe, nutritionIndexes)
    : undefined;
  const selectedCatalogNutrition = selectedCatalogRecipe
    ? computeRecipeNutrition(catalogRecipeAsRecipe(selectedCatalogRecipe), nutritionIndexes)
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
  const week = getLocalWeekRange(todayKey);
  const pantrySuggestions = useMemo(
    () =>
      suggestRecipesFromPantry({
        recipes,
        pantry,
        catalog,
        limit: 5,
      }),
    [recipes, pantry, catalog]
  );
  const mealPlanDraft = useMemo(
    () =>
      draftWeeklyMealPlan({
        recipes,
        cookingSessions,
        pantry,
        weekStartKey: week.weekStartKey,
        weekEndKey: week.weekEndKey,
        catalog,
      }),
    [recipes, cookingSessions, pantry, week.weekStartKey, week.weekEndKey, catalog]
  );
  const scheduledMealPlanKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const session of cookingSessions) {
      if (session.status === "abandoned" || !session.recipeId) continue;
      keys.add(`${session.recipeId}:${session.cookDate}`);
    }
    return keys;
  }, [cookingSessions]);
  const activeSession = findActiveCookingSession(cookingSessions);
  const guidedSession = view === "guided" ? activeSession : undefined;
  const guidedRecipe = guidedSession?.recipeId
    ? recipes.find((recipe) => recipe.id === guidedSession.recipeId)
    : undefined;

  useEffect(() => {
    if (view === "guided" && activeSession) {
      onEnterCookingFocus?.(activeSession.id);
    }
  }, [view, activeSession, onEnterCookingFocus]);

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

  function openCreateForm(prefill?: { notes?: string; title?: string }) {
    const next = emptyRecipeFormState();
    if (prefill?.notes) next.notes = prefill.notes;
    if (prefill?.title) next.title = prefill.title;
    setForm(next);
    setEditingRecipeId(null);
    setFormError(null);
    setSelectedRecipeId(null);
    setView("form");
  }

  function openCatalog() {
    setFormError(null);
    setEditingRecipeId(null);
    setSelectedRecipeId(null);
    setSelectedCatalogRecipeId(null);
    setView("catalog");
  }

  function handleCloneCatalogRecipe() {
    if (!selectedCatalogRecipe) return;
    onAddRecipe(cloneCatalogRecipe(selectedCatalogRecipe, { createId: () => crypto.randomUUID() }));
  }

  function openImport() {
    setFormError(null);
    setEditingRecipeId(null);
    setSelectedRecipeId(null);
    setView("import");
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
      customIngredients,
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
      if (!payload.cookingMethod) delete nextRecipe.cookingMethod;
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
              <button type="button" onClick={openCatalog}>
                Browse catalog
              </button>
            )}
            {view === "gallery" && (
              <button type="button" onClick={openImport}>
                Import recipe
              </button>
            )}
            {view === "gallery" && (
              <button type="button" onClick={() => openCreateForm()}>
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

      <CookingNotificationBanner />

      {view === "catalog" && selectedCatalogRecipe && (
        <RecipeDetail
          recipe={catalogRecipeAsRecipe(selectedCatalogRecipe)}
          nutrition={selectedCatalogNutrition}
          catalog={catalog}
          customIngredients={customIngredients}
          onBack={() => setSelectedCatalogRecipeId(null)}
          catalogActions={{
            alreadyInLibrary: Boolean(
              findClonedCatalogRecipe(recipes, selectedCatalogRecipe.id)
            ),
            onClone: handleCloneCatalogRecipe,
            onOpenCloned: () => {
              const cloned = findClonedCatalogRecipe(recipes, selectedCatalogRecipe.id);
              if (!cloned) return;
              setSelectedCatalogRecipeId(null);
              openDetail(cloned.id);
            },
          }}
        />
      )}

      {view === "catalog" && !selectedCatalogRecipe && (
        <CatalogBrowser
          recipes={recipeCatalog}
          clonedCatalogIds={clonedCatalogIds}
          onBack={() => setView("gallery")}
          onOpenRecipe={(catalogRecipeId) => setSelectedCatalogRecipeId(catalogRecipeId)}
        />
      )}
      {view === "import" && (
        <ImportWizard
          catalog={catalog}
          customIngredients={customIngredients}
          onCancel={() => setView("gallery")}
          onEnterManually={(prefill) => openCreateForm(prefill)}
          onSave={(payload) => {
            onAddRecipe(payload);
            setView("gallery");
          }}
          onUploadImage={
            isSanityConfigured()
              ? (file, kind) =>
                  uploadRecipeImage(file, {
                    kind,
                    alt: "Imported recipe",
                  })
              : undefined
          }
        />
      )}

      {view === "form" && (
        <RecipeForm
          editing={Boolean(editingRecipeId)}
          form={form}
          formError={formError}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={resetForm}
          catalog={catalog}
          customIngredients={customIngredients}
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
          customIngredients={customIngredients}
          nutrition={selectedRecipeNutrition}
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
          focusActive={cookingFocusActive}
          onChange={onUpdateCookingSession}
          onLeave={leaveGuided}
          onExitFocus={onExitCookingFocus}
          onFinish={() => {
            setLoggingRecipeId(guidedRecipe.id);
            setLoggingSessionId(guidedSession.id);
          }}
          onAbandon={() => {
            onUpdateCookingSession(abandonCookingSession(guidedSession));
            clearActiveCookingSessionMirror(guidedSession.id);
            onExitCookingFocus?.();
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
        <div style={{ display: "grid", gap: 14 }}>
          <PantryPanel
            pantry={pantry}
            catalog={catalog}
            onAdd={onAddPantryItem}
            onUpdate={onUpdatePantryItem}
            onDelete={onDeletePantryItem}
            onBack={() => setView("gallery")}
          />
          <div style={styles.card}>
            <CustomIngredientsPanel
              customIngredients={customIngredients}
              onAdd={onAddCustomIngredient}
              onDelete={onDeleteCustomIngredient}
            />
          </div>
        </div>
      )}

      {view === "gallery" && (
        <div style={styles.card}>
          {recipes.length === 0 ? (
            <div>
              <div style={{ marginBottom: 12 }}>
                Add a recipe, import from a photo or pasted text, or clone a starter from the
                catalog.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => openCreateForm()}>
                  Add your first recipe
                </button>
                <button type="button" onClick={openCatalog}>
                  Browse catalog
                </button>
                <button type="button" onClick={openImport}>
                  Import recipe
                </button>
              </div>
            </div>
          ) : (
            <>
              {pantryActive && (
                <MakeNowRail suggestions={pantrySuggestions} onOpenRecipe={openDetail} />
              )}
              {pantryActive && (
                <MealPlanDraftCard
                  draft={mealPlanDraft}
                  scheduledRecipeIdsByDate={scheduledMealPlanKeys}
                  onSchedule={(slot) => {
                    const match = recipes.find((item) => item.id === slot.recipeId);
                    if (!match) return;
                    const planned = buildPlannedCookingSession(match, { cookDate: slot.dateKey });
                    if (planned) onAddCookingSession(planned);
                  }}
                />
              )}
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
