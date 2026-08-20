/**
 * Global cooking reference data (ingredients, aliases, nutrients, retention, recipe catalog).
 * Not part of AppPayload. Fetched from Supabase when remote sync is on;
 * falls back to the seed catalogs + seed nutrient cache.
 */

import { useCallback, useEffect, useState } from "react";
import {
  SEED_INGREDIENT_CATALOG,
  type IngredientCatalog,
} from "./ingredientCatalog";
import {
  SEED_INGREDIENT_NUTRIENTS,
  SEED_RETENTION_FACTORS,
} from "./nutritionSeed";
import { SEED_RECIPE_CATALOG } from "./recipeCatalogSeed";
import { selectPublishedCatalogRecipes } from "./recipeCatalog";
import { mergeNutrientCaches } from "./nutrition";
import { isRemoteSyncEnabled } from "./remoteStorage";
import {
  catalogRecipeFromRow,
  ingredientAliasFromRow,
  ingredientFromRow,
  ingredientNutrientsFromRow,
  retentionFactorFromRow,
  type CatalogRecipeRow,
  type IngredientAliasRow,
  type IngredientNutrientsRow,
  type IngredientRow,
  type RetentionFactorRow,
} from "./dbMappers";
import type { CatalogRecipe, IngredientNutrients, RetentionFactor } from "./model";

export type CookingReferenceData = {
  catalog: IngredientCatalog;
  nutrients: IngredientNutrients[];
  retentionFactors: RetentionFactor[];
  recipeCatalog: CatalogRecipe[];
};

export type CookingReferenceDataState = CookingReferenceData & {
  mergeFetchedNutrients: (incoming: IngredientNutrients[]) => void;
};

export function seedCookingReferenceData(): CookingReferenceData {
  return {
    catalog: SEED_INGREDIENT_CATALOG,
    nutrients: SEED_INGREDIENT_NUTRIENTS,
    retentionFactors: SEED_RETENTION_FACTORS,
    recipeCatalog: selectPublishedCatalogRecipes(SEED_RECIPE_CATALOG),
  };
}

export async function loadCookingReferenceData(): Promise<CookingReferenceData> {
  const seed = seedCookingReferenceData();
  if (!isRemoteSyncEnabled()) return seed;

  try {
    const { supabase } = await import("../lib/supabaseClient");
    const [ingredientsResult, aliasesResult, nutrientsResult, retentionResult, recipeCatalogResult] =
      await Promise.all([
        supabase.from("ingredients").select("*"),
        supabase.from("ingredient_aliases").select("*"),
        supabase.from("ingredient_nutrients").select("*"),
        supabase.from("retention_factors").select("*"),
        supabase.from("recipe_catalog").select("*"),
      ]);

    if (ingredientsResult.error || aliasesResult.error) return seed;

    const ingredientRows = (ingredientsResult.data ?? []) as IngredientRow[];
    if (ingredientRows.length === 0) return seed;

    const aliasRows = (aliasesResult.data ?? []) as IngredientAliasRow[];
    const catalog: IngredientCatalog = {
      ingredients: ingredientRows.map((row) => ingredientFromRow(row)),
      aliases: aliasRows.map((row) => ingredientAliasFromRow(row)),
    };

    let nutrients = seed.nutrients;
    if (!nutrientsResult.error) {
      const nutrientRows = (nutrientsResult.data ?? []) as IngredientNutrientsRow[];
      nutrients = mergeNutrientCaches(
        nutrientRows.map((row) => ingredientNutrientsFromRow(row)),
        seed.nutrients
      );
    }

    let retentionFactors = seed.retentionFactors;
    if (!retentionResult.error) {
      const retentionRows = (retentionResult.data ?? []) as RetentionFactorRow[];
      if (retentionRows.length > 0) {
        retentionFactors = retentionRows.map((row) => retentionFactorFromRow(row));
      }
    }

    let recipeCatalog = seed.recipeCatalog;
    if (!recipeCatalogResult.error) {
      const catalogRows = (recipeCatalogResult.data ?? []) as CatalogRecipeRow[];
      const parsed = catalogRows.map((row) => catalogRecipeFromRow(row));
      const published = selectPublishedCatalogRecipes(parsed);
      if (published.length > 0) recipeCatalog = published;
    }

    return { catalog, nutrients, retentionFactors, recipeCatalog };
  } catch {
    return seed;
  }
}

export function useCookingReferenceData(): CookingReferenceDataState {
  const [data, setData] = useState<CookingReferenceData>(seedCookingReferenceData);

  const reload = useCallback(() => {
    let cancelled = false;
    void loadCookingReferenceData().then((next) => {
      if (!cancelled) setData(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => reload(), [reload]);

  const mergeFetchedNutrients = useCallback((incoming: IngredientNutrients[]) => {
    setData((current) => ({
      ...current,
      nutrients: mergeNutrientCaches(incoming, current.nutrients),
    }));
  }, []);

  return { ...data, mergeFetchedNutrients };
}
