import { useMemo, useState } from "react";
import {
  describeRecipeGalleryEmptyState,
  filterAndSortRecipes,
  getRecipeCategoryValues,
  recipeGalleryFiltersAreActive,
  RECIPE_CATEGORY_LABELS,
  type RecipeCategoryFilter,
} from "../../core/cooking";
import { catalogRecipeAsRecipe } from "../../core/recipeCatalog";
import type { CatalogRecipe } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { RecipeGallery } from "./RecipeGallery";

export type CatalogBrowserProps = {
  recipes: CatalogRecipe[];
  clonedCatalogIds: ReadonlySet<string>;
  onBack: () => void;
  onOpenRecipe: (catalogRecipeId: string) => void;
};

export function CatalogBrowser({
  recipes,
  clonedCatalogIds,
  onBack,
  onOpenRecipe,
}: CatalogBrowserProps) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<RecipeCategoryFilter>("all");

  const asRecipes = useMemo(() => recipes.map(catalogRecipeAsRecipe), [recipes]);
  const filtered = useMemo(
    () =>
      filterAndSortRecipes(asRecipes, {
        query,
        sortMode: "title",
        categoryFilter,
      }),
    [asRecipes, query, categoryFilter]
  );
  const galleryFilters = { query, sortMode: "title" as const, categoryFilter };

  return (
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
        <div style={styles.cardTitle}>Starter catalog</div>
        <button type="button" onClick={onBack}>
          Back to my recipes
        </button>
      </div>
      <div style={{ ...styles.textSecondary, marginBottom: 12 }}>
        Browse curated recipes and add a copy to your private library. Clones keep the same
        ingredients, steps, and image references, and you can edit them independently.
        {clonedCatalogIds.size > 0
          ? ` ${clonedCatalogIds.size} already in your library.`
          : ""}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ ...styles.label, flex: "1 1 220px" }}>
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title or ingredient"
          />
        </label>
        <label style={{ ...styles.label, flex: "1 1 160px" }}>
          Category
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as RecipeCategoryFilter)}
          >
            <option value="all">All categories</option>
            {getRecipeCategoryValues().map((category) => (
              <option key={category} value={category}>
                {RECIPE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ ...styles.textMuted, fontSize: 13, marginBottom: 10 }}>
        Showing {filtered.length} of {recipes.length}
      </div>
      <RecipeGallery
        recipes={filtered}
        emptyMessage={describeRecipeGalleryEmptyState(galleryFilters)}
        onClearFilters={
          recipeGalleryFiltersAreActive(galleryFilters)
            ? () => {
                setQuery("");
                setCategoryFilter("all");
              }
            : undefined
        }
        onOpenRecipe={onOpenRecipe}
      />
    </div>
  );
}
