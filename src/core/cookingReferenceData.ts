/**
 * Global cooking reference data (ingredients + aliases). Not part of AppPayload.
 * Fetched from Supabase when remote sync is on; falls back to the seed catalog.
 */

import { useEffect, useState } from "react";
import {
  SEED_INGREDIENT_CATALOG,
  type IngredientCatalog,
} from "./ingredientCatalog";
import { isRemoteSyncEnabled } from "./remoteStorage";
import {
  ingredientAliasFromRow,
  ingredientFromRow,
  type IngredientAliasRow,
  type IngredientRow,
} from "./dbMappers";

export async function loadCookingReferenceData(): Promise<IngredientCatalog> {
  if (!isRemoteSyncEnabled()) {
    return SEED_INGREDIENT_CATALOG;
  }

  try {
    const { supabase } = await import("../lib/supabaseClient");
    const [ingredientsResult, aliasesResult] = await Promise.all([
      supabase.from("ingredients").select("*"),
      supabase.from("ingredient_aliases").select("*"),
    ]);

    if (ingredientsResult.error || aliasesResult.error) {
      return SEED_INGREDIENT_CATALOG;
    }

    const ingredientRows = (ingredientsResult.data ?? []) as IngredientRow[];
    if (ingredientRows.length === 0) {
      return SEED_INGREDIENT_CATALOG;
    }

    const aliasRows = (aliasesResult.data ?? []) as IngredientAliasRow[];
    return {
      ingredients: ingredientRows.map((row) => ingredientFromRow(row)),
      aliases: aliasRows.map((row) => ingredientAliasFromRow(row)),
    };
  } catch {
    return SEED_INGREDIENT_CATALOG;
  }
}

export function useCookingReferenceData(): IngredientCatalog {
  const [catalog, setCatalog] = useState<IngredientCatalog>(SEED_INGREDIENT_CATALOG);

  useEffect(() => {
    let cancelled = false;
    void loadCookingReferenceData().then((next) => {
      if (!cancelled) setCatalog(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return catalog;
}
