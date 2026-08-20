import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  catalogRecipeFromRow,
  catalogRecipeToRow,
  recipeToRow,
} from "./dbMappers";
import type { CatalogRecipe, Recipe } from "./model";
import {
  catalogRecipeAsRecipe,
  catalogRecipeIsClientReadable,
  cloneCatalogRecipe,
  findClonedCatalogRecipe,
  selectPublishedCatalogRecipes,
} from "./recipeCatalog";
import { SEED_RECIPE_CATALOG, seedCatalogRecipeId } from "./recipeCatalogSeed";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLONE_IDS = [
  "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1",
  "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2",
  "d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3",
  "e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4",
  "f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5",
  "a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6",
  "b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7",
  "c8c8c8c8-c8c8-4c8c-8c8c-c8c8c8c8c8c8",
  "d9d9d9d9-d9d9-4d9d-8d9d-d9d9d9d9d9d9",
  "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0",
  "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
  "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2",
];

function makeIds() {
  let index = 0;
  return () => {
    const id = CLONE_IDS[index];
    if (!id) throw new Error("ran out of test ids");
    index += 1;
    return id;
  };
}

describe("cloneCatalogRecipe", () => {
  const entry = SEED_RECIPE_CATALOG[0]!;

  it("copies content and image refs into a personal recipe with catalog provenance", () => {
    const hero = {
      assetRef: "image-heroone-800x600-jpg",
      url: "https://cdn.sanity.io/images/abc123xy/production/heroone-800x600.jpg",
      alt: "Eggs",
    };
    const gallery = {
      assetRef: "image-galleryone-400x400-jpg",
      url: "https://cdn.sanity.io/images/abc123xy/production/galleryone-400x400.jpg",
    };
    const withImages: CatalogRecipe = { ...entry, heroImage: hero, gallery: [gallery] };
    const clone = cloneCatalogRecipe(withImages, { createId: makeIds() });

    expect(clone.title).toBe(entry.title);
    expect(clone.category).toBe(entry.category);
    expect(clone.ingredients.map((line) => line.rawText)).toEqual(
      entry.ingredients.map((line) => line.rawText)
    );
    expect(clone.ingredients.map((line) => line.ingredientId)).toEqual(
      entry.ingredients.map((line) => line.ingredientId)
    );
    expect(clone.steps.map((step) => step.text)).toEqual(entry.steps.map((step) => step.text));
    expect(clone.equipment).toEqual(entry.equipment);
    expect(clone.heroImage).toEqual(hero);
    expect(clone.gallery).toEqual([gallery]);
    expect(clone.source).toBe("catalog");
    expect(clone.catalogRecipeId).toBe(entry.id);
    expect(clone.ingredients.every((line) => line.id !== entry.ingredients[0]?.id)).toBe(true);
    expect(clone.steps.every((step) => step.id !== entry.steps[0]?.id)).toBe(true);
  });

  it("produces a recipe that round-trips through the personal recipes mapper", () => {
    const clone = cloneCatalogRecipe(entry, { createId: makeIds() });
    const recipe: Recipe = {
      ...clone,
      id: CLONE_IDS[11]!,
      createdAtIso: "2026-08-19T12:00:00.000Z",
      updatedAtIso: "2026-08-19T12:00:00.000Z",
    };
    expect(recipeToRow(recipe, USER_ID).catalog_recipe_id).toBe(entry.id);
    expect(recipeToRow(recipe, USER_ID).source).toBe("catalog");
  });

  it("refuses unpublished catalog recipes", () => {
    expect(() =>
      cloneCatalogRecipe({ ...entry, isPublished: false }, { createId: makeIds() })
    ).toThrow(/unpublished/i);
  });
});

describe("catalog read access (RLS contract)", () => {
  it("treats unpublished rows as not client-readable", () => {
    expect(catalogRecipeIsClientReadable({ isPublished: true })).toBe(true);
    expect(catalogRecipeIsClientReadable({ isPublished: false })).toBe(false);
    expect(
      selectPublishedCatalogRecipes([
        { isPublished: true, id: "a" },
        { isPublished: false, id: "b" },
      ]).map((row) => row.id)
    ).toEqual(["a"]);
  });

  it("client seed excludes unpublished drafts", () => {
    expect(SEED_RECIPE_CATALOG.every((recipe) => recipe.isPublished)).toBe(true);
    expect(SEED_RECIPE_CATALOG.map((recipe) => recipe.id)).not.toContain(
      seedCatalogRecipeId(99)
    );
  });

  it("migration allows authenticated SELECT of published rows only", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260819150000_cooking_catalog.sql"),
      "utf8"
    );
    expect(sql).toContain("CREATE POLICY recipe_catalog_select_published");
    expect(sql).toMatch(/FOR SELECT\s+TO authenticated/s);
    expect(sql).toContain("USING (is_published)");
    expect(sql).toContain("GRANT SELECT ON TABLE public.recipe_catalog TO authenticated");
    expect(sql).not.toMatch(/CREATE POLICY recipe_catalog_insert/i);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public.recipe_catalog/i);
    expect(sql).toContain("is_published boolean NOT NULL DEFAULT true");
    expect(sql).toContain("'Internal catalog draft'");
    expect(sql).toMatch(/'Internal catalog draft'[\s\S]*false/);
  });
});

describe("catalogRecipeAsRecipe / findClonedCatalogRecipe", () => {
  it("preview recipes keep catalog provenance for browsing", () => {
    const entry = SEED_RECIPE_CATALOG[1]!;
    const preview = catalogRecipeAsRecipe(entry);
    expect(preview.id).toBe(entry.id);
    expect(preview.source).toBe("catalog");
    expect(preview.catalogRecipeId).toBe(entry.id);
  });

  it("finds a personal clone by catalog id", () => {
    const entry = SEED_RECIPE_CATALOG[2]!;
    const clone = cloneCatalogRecipe(entry, { createId: makeIds() });
    const recipe: Recipe = {
      ...clone,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      createdAtIso: "2026-08-19T12:00:00.000Z",
      updatedAtIso: "2026-08-19T12:00:00.000Z",
    };
    expect(findClonedCatalogRecipe([recipe], entry.id)?.id).toBe(recipe.id);
    expect(findClonedCatalogRecipe([recipe], seedCatalogRecipeId(1))).toBeUndefined();
  });
});

describe("catalog recipe mappers", () => {
  it("round-trips a published catalog recipe including optional image refs", () => {
    const entry: CatalogRecipe = {
      ...SEED_RECIPE_CATALOG[0]!,
      heroImage: {
        assetRef: "image-heroone-800x600-jpg",
        url: "https://cdn.sanity.io/images/abc123xy/production/heroone-800x600.jpg",
      },
    };
    const row = catalogRecipeToRow(entry);
    expect(row.is_published).toBe(true);
    expect(catalogRecipeFromRow(row)).toEqual(entry);
  });

  it("round-trips every seed catalog recipe", () => {
    for (const entry of SEED_RECIPE_CATALOG) {
      expect(catalogRecipeFromRow(catalogRecipeToRow(entry))).toEqual(entry);
    }
  });
});
