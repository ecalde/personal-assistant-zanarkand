import {
  getRecipeCategoryValues,
  getRecipeCookTimeFilterValues,
  getRecipeDifficultyValues,
  getRecipeExperienceLevelValues,
  getRecipeMasteryFilterValues,
  getRecipeAvailabilityFilterValues,
  getRecipeSortModeValues,
  isRecipeCategoryFilter,
  isRecipeCookTimeFilter,
  isRecipeDifficultyFilter,
  isRecipeExperienceFilter,
  isRecipeMasteryFilter,
  isRecipeAvailabilityFilter,
  isRecipesSortMode,
  RECIPE_CATEGORY_LABELS,
  RECIPE_COOK_TIME_FILTER_LABELS,
  RECIPE_DIFFICULTY_LABELS,
  RECIPE_EXPERIENCE_LABELS,
  RECIPE_MASTERY_FILTER_LABELS,
  RECIPE_AVAILABILITY_FILTER_LABELS,
  RECIPE_SORT_MODE_LABELS,
  recipeGalleryFiltersAreActive,
  type RecipeCategoryFilter,
  type RecipeCookTimeFilter,
  type RecipeDifficultyFilter,
  type RecipeExperienceFilter,
  type RecipeMasteryFilter,
  type RecipeAvailabilityFilter,
  type RecipesSortMode,
} from "../../core/cooking";
import { styles } from "../../ui/appStyles";

export type RecipesToolbarProps = {
  query: string;
  sortMode: RecipesSortMode;
  categoryFilter: RecipeCategoryFilter;
  difficultyFilter: RecipeDifficultyFilter;
  experienceFilter: RecipeExperienceFilter;
  cookTimeFilter: RecipeCookTimeFilter;
  masteryFilter: RecipeMasteryFilter;
  availabilityFilter: RecipeAvailabilityFilter;
  showAvailabilityFilter?: boolean;
  visibleCount: number;
  totalCount: number;
  onQueryChange: (value: string) => void;
  onSortModeChange: (value: RecipesSortMode) => void;
  onCategoryFilterChange: (value: RecipeCategoryFilter) => void;
  onDifficultyFilterChange: (value: RecipeDifficultyFilter) => void;
  onExperienceFilterChange: (value: RecipeExperienceFilter) => void;
  onCookTimeFilterChange: (value: RecipeCookTimeFilter) => void;
  onMasteryFilterChange: (value: RecipeMasteryFilter) => void;
  onAvailabilityFilterChange: (value: RecipeAvailabilityFilter) => void;
  onClearFilters: () => void;
};

const filterLabelStyle = { ...styles.label, flex: "1 1 140px", minWidth: 132 };

export function RecipesToolbar({
  query,
  sortMode,
  categoryFilter,
  difficultyFilter,
  experienceFilter,
  cookTimeFilter,
  masteryFilter,
  availabilityFilter,
  showAvailabilityFilter = false,
  visibleCount,
  totalCount,
  onQueryChange,
  onSortModeChange,
  onCategoryFilterChange,
  onDifficultyFilterChange,
  onExperienceFilterChange,
  onCookTimeFilterChange,
  onMasteryFilterChange,
  onAvailabilityFilterChange,
  onClearFilters,
}: RecipesToolbarProps) {
  const filtersActive = recipeGalleryFiltersAreActive({
    query,
    categoryFilter,
    difficultyFilter,
    experienceFilter,
    cookTimeFilter,
    masteryFilter,
    availabilityFilter: showAvailabilityFilter ? availabilityFilter : undefined,
  });

  return (
    <div style={styles.recipeToolbar}>
      <label style={styles.label}>
        Search
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Title, ingredient, notes…"
          style={{ ...styles.input, minWidth: 0, width: "100%" }}
        />
      </label>

      <div style={styles.recipeToolbarFilters}>
        <label style={filterLabelStyle}>
          Category
          <select
            value={categoryFilter}
            onChange={(e) => {
              if (isRecipeCategoryFilter(e.target.value)) {
                onCategoryFilterChange(e.target.value);
              }
            }}
            style={{ ...styles.select, width: "100%" }}
          >
            <option value="all">All categories</option>
            {getRecipeCategoryValues().map((category) => (
              <option key={category} value={category}>
                {RECIPE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>

        <label style={filterLabelStyle}>
          Difficulty
          <select
            value={difficultyFilter}
            onChange={(e) => {
              if (isRecipeDifficultyFilter(e.target.value)) {
                onDifficultyFilterChange(e.target.value);
              }
            }}
            style={{ ...styles.select, width: "100%" }}
          >
            <option value="all">All difficulties</option>
            {getRecipeDifficultyValues().map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {RECIPE_DIFFICULTY_LABELS[difficulty]}
              </option>
            ))}
          </select>
        </label>

        <label style={filterLabelStyle}>
          Experience
          <select
            value={experienceFilter}
            onChange={(e) => {
              if (isRecipeExperienceFilter(e.target.value)) {
                onExperienceFilterChange(e.target.value);
              }
            }}
            style={{ ...styles.select, width: "100%" }}
          >
            <option value="all">All levels</option>
            {getRecipeExperienceLevelValues().map((level) => (
              <option key={level} value={level}>
                {RECIPE_EXPERIENCE_LABELS[level]}
              </option>
            ))}
          </select>
        </label>

        <label style={filterLabelStyle}>
          Cook time
          <select
            value={cookTimeFilter}
            onChange={(e) => {
              if (isRecipeCookTimeFilter(e.target.value)) {
                onCookTimeFilterChange(e.target.value);
              }
            }}
            style={{ ...styles.select, width: "100%" }}
          >
            <option value="all">{RECIPE_COOK_TIME_FILTER_LABELS.all}</option>
            {getRecipeCookTimeFilterValues().map((value) => (
              <option key={value} value={value}>
                {RECIPE_COOK_TIME_FILTER_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label style={filterLabelStyle}>
          Mastery
          <select
            value={masteryFilter}
            onChange={(e) => {
              if (isRecipeMasteryFilter(e.target.value)) {
                onMasteryFilterChange(e.target.value);
              }
            }}
            style={{ ...styles.select, width: "100%" }}
          >
            <option value="all">{RECIPE_MASTERY_FILTER_LABELS.all}</option>
            {getRecipeMasteryFilterValues().map((value) => (
              <option key={value} value={value}>
                {RECIPE_MASTERY_FILTER_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        {showAvailabilityFilter && (
          <label style={filterLabelStyle}>
            Pantry
            <select
              value={availabilityFilter}
              onChange={(e) => {
                if (isRecipeAvailabilityFilter(e.target.value)) {
                  onAvailabilityFilterChange(e.target.value);
                }
              }}
              style={{ ...styles.select, width: "100%" }}
            >
              <option value="all">{RECIPE_AVAILABILITY_FILTER_LABELS.all}</option>
              {getRecipeAvailabilityFilterValues().map((value) => (
                <option key={value} value={value}>
                  {RECIPE_AVAILABILITY_FILTER_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={filterLabelStyle}>
          Sort
          <select
            value={sortMode}
            onChange={(e) => {
              if (isRecipesSortMode(e.target.value)) {
                onSortModeChange(e.target.value);
              }
            }}
            style={{ ...styles.select, width: "100%" }}
          >
            {getRecipeSortModeValues().map((mode) => (
              <option key={mode} value={mode}>
                {RECIPE_SORT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={styles.helpText}>
          {visibleCount} of {totalCount} {totalCount === 1 ? "recipe" : "recipes"}
        </div>
        {filtersActive && (
          <button type="button" onClick={onClearFilters}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
