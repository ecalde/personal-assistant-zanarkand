/**
 * Curated global ingredient catalog (client fallback + tests).
 * Stable UUIDs match the Phase 7 seed migration.
 */

import type { Ingredient, IngredientAlias } from "./model";

export type IngredientCatalog = {
  ingredients: Ingredient[];
  aliases: IngredientAlias[];
};

type SeedIngredient = {
  n: number;
  name: string;
  category: string;
  unit?: string;
  densityGPerMl?: number;
  gramsPerPiece?: number;
  aliases?: string[];
};

function seedIngredientId(n: number): string {
  return `a7e10000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function seedAliasId(n: number): string {
  return `a7e20000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

const SEED_INGREDIENTS: SeedIngredient[] = [
  {
    n: 1,
    name: "flour tortilla",
    category: "grain",
    unit: "piece",
    gramsPerPiece: 30,
    aliases: ["tortilla", "tortillas", "flour tortillas"],
  },
  {
    n: 2,
    name: "corn tortilla",
    category: "grain",
    unit: "piece",
    gramsPerPiece: 24,
    aliases: ["corn tortillas"],
  },
  {
    n: 3,
    name: "bell pepper",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 150,
    aliases: ["bell peppers", "sweet pepper", "sweet peppers"],
  },
  {
    n: 4,
    name: "green bell pepper",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 150,
    aliases: ["green pepper", "green peppers", "green bell peppers"],
  },
  {
    n: 5,
    name: "yellow bell pepper",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 150,
    aliases: ["yellow pepper", "yellow peppers", "yellow bell peppers"],
  },
  {
    n: 6,
    name: "red bell pepper",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 150,
    aliases: ["red bell peppers"],
  },
  {
    n: 7,
    name: "tomato",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 120,
    aliases: ["tomatoes", "tomatoe", "tomatos"],
  },
  {
    n: 8,
    name: "broccoli",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 300,
    aliases: ["brocoli", "brocolli", "broccolis"],
  },
  {
    n: 9,
    name: "egg",
    category: "protein",
    unit: "piece",
    gramsPerPiece: 50,
    aliases: ["eggs"],
  },
  {
    n: 10,
    name: "olive oil",
    category: "oil",
    unit: "tbsp",
    densityGPerMl: 0.91,
    aliases: ["extra virgin olive oil", "extra-virgin olive oil", "evoo"],
  },
  {
    n: 11,
    name: "salt",
    category: "spice",
    unit: "tsp",
    aliases: ["kosher salt", "sea salt", "table salt"],
  },
  {
    n: 12,
    name: "black pepper",
    category: "spice",
    unit: "tsp",
    aliases: ["pepper", "ground black pepper", "cracked pepper"],
  },
  {
    n: 13,
    name: "garlic",
    category: "produce",
    unit: "clove",
    gramsPerPiece: 5,
    aliases: ["garlic clove", "garlic cloves"],
  },
  {
    n: 14,
    name: "onion",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 150,
    aliases: ["onions", "yellow onion", "yellow onions"],
  },
  {
    n: 15,
    name: "chicken breast",
    category: "protein",
    unit: "g",
    aliases: ["chicken", "chicken breasts", "boneless chicken breast"],
  },
  {
    n: 16,
    name: "ground beef",
    category: "protein",
    unit: "g",
    aliases: ["beef", "hamburger meat", "minced beef"],
  },
  {
    n: 17,
    name: "white rice",
    category: "grain",
    unit: "cup",
    aliases: ["rice", "long grain rice"],
  },
  {
    n: 18,
    name: "all-purpose flour",
    category: "grain",
    unit: "cup",
    aliases: ["flour", "ap flour", "plain flour"],
  },
  {
    n: 19,
    name: "butter",
    category: "dairy",
    unit: "tbsp",
    aliases: ["unsalted butter", "salted butter"],
  },
  {
    n: 20,
    name: "milk",
    category: "dairy",
    unit: "cup",
    densityGPerMl: 1.03,
    aliases: ["whole milk", "2% milk"],
  },
  {
    n: 21,
    name: "cheddar cheese",
    category: "dairy",
    unit: "g",
    aliases: ["cheddar"],
  },
  {
    n: 22,
    name: "parmesan cheese",
    category: "dairy",
    unit: "g",
    aliases: ["parmesan", "parmigiano"],
  },
  {
    n: 23,
    name: "spaghetti",
    category: "grain",
    unit: "g",
    aliases: ["pasta"],
  },
  {
    n: 24,
    name: "lemon",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 60,
    aliases: ["lemons"],
  },
  {
    n: 25,
    name: "lime",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 50,
    aliases: ["limes"],
  },
  {
    n: 26,
    name: "potato",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 170,
    aliases: ["potatoes", "russet potato"],
  },
  {
    n: 27,
    name: "carrot",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 60,
    aliases: ["carrots"],
  },
  {
    n: 28,
    name: "celery",
    category: "produce",
    unit: "piece",
    aliases: ["celery stalk", "celery stalks"],
  },
  {
    n: 29,
    name: "spinach",
    category: "produce",
    unit: "g",
    aliases: ["baby spinach"],
  },
  {
    n: 30,
    name: "avocado",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 150,
    aliases: ["avocados"],
  },
  {
    n: 31,
    name: "banana",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 120,
    aliases: ["bananas"],
  },
  {
    n: 32,
    name: "apple",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 180,
    aliases: ["apples"],
  },
  {
    n: 33,
    name: "granulated sugar",
    category: "pantry",
    unit: "cup",
    aliases: ["sugar", "white sugar"],
  },
  {
    n: 34,
    name: "brown sugar",
    category: "pantry",
    unit: "cup",
    aliases: ["light brown sugar"],
  },
  {
    n: 35,
    name: "honey",
    category: "pantry",
    unit: "tbsp",
    densityGPerMl: 1.42,
  },
  {
    n: 36,
    name: "soy sauce",
    category: "pantry",
    unit: "tbsp",
    aliases: ["soya sauce"],
  },
  {
    n: 37,
    name: "cumin",
    category: "spice",
    unit: "tsp",
    aliases: ["ground cumin"],
  },
  {
    n: 38,
    name: "paprika",
    category: "spice",
    unit: "tsp",
  },
  {
    n: 39,
    name: "cinnamon",
    category: "spice",
    unit: "tsp",
    aliases: ["ground cinnamon"],
  },
  {
    n: 40,
    name: "basil",
    category: "produce",
    unit: "piece",
    aliases: ["fresh basil"],
  },
  {
    n: 41,
    name: "cilantro",
    category: "produce",
    unit: "piece",
    aliases: ["coriander", "fresh cilantro"],
  },
  {
    n: 42,
    name: "parsley",
    category: "produce",
    unit: "piece",
    aliases: ["fresh parsley"],
  },
  {
    n: 43,
    name: "ginger",
    category: "produce",
    unit: "piece",
    aliases: ["fresh ginger", "ginger root"],
  },
  {
    n: 44,
    name: "bacon",
    category: "protein",
    unit: "slice",
    aliases: ["bacon strips"],
  },
  {
    n: 45,
    name: "shrimp",
    category: "protein",
    unit: "g",
    aliases: ["prawns", "prawn"],
  },
  {
    n: 46,
    name: "salmon",
    category: "protein",
    unit: "g",
    aliases: ["salmon fillet"],
  },
  {
    n: 47,
    name: "tofu",
    category: "protein",
    unit: "g",
    aliases: ["firm tofu"],
  },
  {
    n: 48,
    name: "bread",
    category: "grain",
    unit: "slice",
    aliases: ["loaf of bread"],
  },
  {
    n: 49,
    name: "baking powder",
    category: "pantry",
    unit: "tsp",
  },
  {
    n: 50,
    name: "vanilla extract",
    category: "pantry",
    unit: "tsp",
    aliases: ["vanilla"],
  },
  {
    n: 51,
    name: "cocoa powder",
    category: "pantry",
    unit: "tbsp",
    aliases: ["unsweetened cocoa"],
  },
  {
    n: 52,
    name: "coconut milk",
    category: "pantry",
    unit: "cup",
    aliases: ["canned coconut milk"],
  },
  {
    n: 53,
    name: "chickpeas",
    category: "pantry",
    unit: "cup",
    aliases: ["garbanzo beans", "garbanzos"],
  },
  {
    n: 54,
    name: "black beans",
    category: "pantry",
    unit: "cup",
    aliases: ["black bean"],
  },
  {
    n: 55,
    name: "scallion",
    category: "produce",
    unit: "piece",
    aliases: ["green onion", "green onions", "spring onion", "scallions"],
  },
  {
    n: 56,
    name: "shallot",
    category: "produce",
    unit: "piece",
    gramsPerPiece: 25,
    aliases: ["shallots"],
  },
];

/** Lowercase + strip punctuation; used when seeding aliases (full normalize lives in ingredients.ts). */
export function seedNormalizeAlias(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function seedIngredientIdFor(n: number): string {
  return seedIngredientId(n);
}

export function buildSeedIngredientCatalog(): IngredientCatalog {
  const ingredients: Ingredient[] = [];
  const aliases: IngredientAlias[] = [];
  const seenNormalized = new Set<string>();
  let aliasN = 1;

  function addAlias(ingredientId: string, alias: string) {
    const aliasNormalized = seedNormalizeAlias(alias);
    if (!aliasNormalized || seenNormalized.has(aliasNormalized)) return;
    seenNormalized.add(aliasNormalized);
    aliases.push({
      id: seedAliasId(aliasN),
      ingredientId,
      alias: alias.trim(),
      aliasNormalized,
    });
    aliasN += 1;
  }

  for (const seed of SEED_INGREDIENTS) {
    const id = seedIngredientId(seed.n);
    const ingredient: Ingredient = {
      id,
      canonicalName: seed.name,
      category: seed.category,
    };
    if (seed.unit) ingredient.defaultUnit = seed.unit;
    if (seed.densityGPerMl !== undefined) ingredient.densityGPerMl = seed.densityGPerMl;
    if (seed.gramsPerPiece !== undefined) ingredient.gramsPerPiece = seed.gramsPerPiece;
    ingredients.push(ingredient);
    addAlias(id, seed.name);
    for (const extra of seed.aliases ?? []) {
      addAlias(id, extra);
    }
  }

  return { ingredients, aliases };
}

export const SEED_INGREDIENT_CATALOG: IngredientCatalog = buildSeedIngredientCatalog();
