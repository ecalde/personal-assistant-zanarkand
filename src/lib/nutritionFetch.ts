import type { IngredientNutrients, Per100g } from "../core/model";
import { supabase } from "./supabaseClient";

export type NutritionFetchResponse = {
  nutrients: IngredientNutrients[];
  missingIngredientIds?: string[];
  offProduct?: { barcode: string; name?: string; per100g: Per100g };
};

export async function fetchIngredientNutrition(
  ingredientIds: string[],
  options?: { barcode?: string }
): Promise<NutritionFetchResponse> {
  if (ingredientIds.length === 0 && !options?.barcode) {
    return { nutrients: [] };
  }

  const { data, error } = await supabase.functions.invoke("nutrition-fetch", {
    body: {
      ingredientIds,
      barcode: options?.barcode,
    },
  });
  if (error) {
    throw new Error(error.message || "Nutrition lookup failed.");
  }

  const payload = data as NutritionFetchResponse | null;
  return {
    nutrients: Array.isArray(payload?.nutrients) ? payload.nutrients : [],
    missingIngredientIds: payload?.missingIngredientIds,
    offProduct: payload?.offProduct,
  };
}
