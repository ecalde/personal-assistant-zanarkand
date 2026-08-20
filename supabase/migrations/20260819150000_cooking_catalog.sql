-- Phase 10: global curated recipe_catalog (read published rows; writes via seed/admin)

CREATE TABLE public.recipe_catalog (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  difficulty text NOT NULL,
  experience_level text NOT NULL,
  estimated_minutes integer NULL,
  servings integer NULL,
  notes text NULL,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  hero_image jsonb NULL,
  gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  cooking_method text NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_catalog_title_nonempty_chk CHECK (char_length(title) > 0),
  CONSTRAINT recipe_catalog_category_chk CHECK (category IN (
    'breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'beverage', 'meal_prep'
  )),
  CONSTRAINT recipe_catalog_difficulty_chk CHECK (difficulty IN ('easy', 'medium', 'hard')),
  CONSTRAINT recipe_catalog_experience_chk CHECK (experience_level IN (
    'beginner', 'intermediate', 'advanced'
  )),
  CONSTRAINT recipe_catalog_servings_chk CHECK (servings IS NULL OR servings > 0),
  CONSTRAINT recipe_catalog_minutes_chk CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  CONSTRAINT recipe_catalog_cooking_method_chk CHECK (
    cooking_method IS NULL OR cooking_method IN (
      'boil', 'bake', 'fry', 'saute', 'steam', 'grill', 'raw', 'other'
    )
  ),
  CONSTRAINT recipe_catalog_ingredients_array_chk CHECK (jsonb_typeof(ingredients) = 'array'),
  CONSTRAINT recipe_catalog_steps_array_chk CHECK (jsonb_typeof(steps) = 'array'),
  CONSTRAINT recipe_catalog_equipment_array_chk CHECK (jsonb_typeof(equipment) = 'array'),
  CONSTRAINT recipe_catalog_gallery_array_chk CHECK (jsonb_typeof(gallery) = 'array')
);

CREATE INDEX recipe_catalog_category_idx
  ON public.recipe_catalog (category)
  WHERE is_published;

CREATE OR REPLACE FUNCTION public.set_recipe_catalog_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER recipe_catalog_set_updated_at
  BEFORE UPDATE ON public.recipe_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.set_recipe_catalog_updated_at();

ALTER TABLE public.recipe_catalog ENABLE ROW LEVEL SECURITY;

-- Authenticated clients may read published recipes only. No client write policies.
CREATE POLICY recipe_catalog_select_published
  ON public.recipe_catalog
  FOR SELECT
  TO authenticated
  USING (is_published);

REVOKE ALL ON TABLE public.recipe_catalog FROM PUBLIC;
REVOKE ALL ON TABLE public.recipe_catalog FROM anon;
GRANT SELECT ON TABLE public.recipe_catalog TO authenticated;

-- ---------------------------------------------------------------------------
-- Starter recipes (stable UUIDs match src/core/recipeCatalogSeed.ts)
-- Hero/gallery image refs are omitted until Sanity assets are authored.
-- ---------------------------------------------------------------------------

INSERT INTO public.recipe_catalog (
  id, title, category, difficulty, experience_level, estimated_minutes, servings, notes,
  ingredients, steps, equipment, cooking_method, is_published, created_at, updated_at
) VALUES
(
  'ca7a1000-0000-4000-8000-000000000001',
  'Soft scrambled eggs',
  'breakfast', 'easy', 'beginner', 10, 2,
  'Keep the heat low and stir often so the curds stay small and creamy.',
  '[
    {"id":"ca7a1100-0000-4000-8000-000000000001","rawText":"3 eggs","ingredientId":"a7e10000-0000-4000-8000-000000000009","matchConfidence":1,"quantity":3,"unit":"piece"},
    {"id":"ca7a1100-0000-4000-8000-000000000002","rawText":"1 tbsp butter","ingredientId":"a7e10000-0000-4000-8000-000000000013","matchConfidence":1,"quantity":1,"unit":"tbsp"},
    {"id":"ca7a1100-0000-4000-8000-000000000003","rawText":"Pinch of salt","ingredientId":"a7e10000-0000-4000-8000-00000000000b","matchConfidence":1},
    {"id":"ca7a1100-0000-4000-8000-000000000004","rawText":"Black pepper","ingredientId":"a7e10000-0000-4000-8000-00000000000c","matchConfidence":1,"optional":true}
  ]'::jsonb,
  '[
    {"id":"ca7a1200-0000-4000-8000-000000000001","order":0,"text":"Crack the eggs into a bowl and beat until the whites and yolks are combined.","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-000000000002","order":1,"text":"Melt the butter in a nonstick skillet over low heat.","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-000000000003","order":2,"text":"Pour in the eggs. Stir slowly and constantly until they look barely set and still glossy.","kind":"timer","blocksProgress":true,"timerSeconds":180,"timerLabel":"Soft scramble"},
    {"id":"ca7a1200-0000-4000-8000-000000000004","order":3,"text":"Season with salt and pepper. Serve immediately.","kind":"blocking","blocksProgress":true}
  ]'::jsonb,
  '["Nonstick skillet","Silicone spatula"]'::jsonb,
  'saute', true, '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
),
(
  'ca7a1000-0000-4000-8000-000000000002',
  'Garlic spaghetti',
  'dinner', 'easy', 'beginner', 25, 4,
  'Save a splash of pasta water to loosen the sauce.',
  '[
    {"id":"ca7a1100-0000-4000-8000-000000000005","rawText":"340 g spaghetti","ingredientId":"a7e10000-0000-4000-8000-000000000017","matchConfidence":1,"quantity":340,"unit":"g"},
    {"id":"ca7a1100-0000-4000-8000-000000000006","rawText":"3 tbsp olive oil","ingredientId":"a7e10000-0000-4000-8000-00000000000a","matchConfidence":1,"quantity":3,"unit":"tbsp"},
    {"id":"ca7a1100-0000-4000-8000-000000000007","rawText":"4 garlic cloves, thinly sliced","ingredientId":"a7e10000-0000-4000-8000-00000000000d","matchConfidence":1,"quantity":4,"unit":"clove"},
    {"id":"ca7a1100-0000-4000-8000-000000000008","rawText":"Salt","ingredientId":"a7e10000-0000-4000-8000-00000000000b","matchConfidence":1},
    {"id":"ca7a1100-0000-4000-8000-000000000009","rawText":"30 g parmesan cheese","ingredientId":"a7e10000-0000-4000-8000-000000000016","matchConfidence":1,"quantity":30,"unit":"g"},
    {"id":"ca7a1100-0000-4000-8000-00000000000a","rawText":"Fresh parsley","ingredientId":"a7e10000-0000-4000-8000-00000000002a","matchConfidence":1,"optional":true},
    {"id":"ca7a1100-0000-4000-8000-00000000000b","rawText":"1 lemon (optional zest)","ingredientId":"a7e10000-0000-4000-8000-000000000018","matchConfidence":1,"quantity":1,"unit":"piece","optional":true}
  ]'::jsonb,
  '[
    {"id":"ca7a1200-0000-4000-8000-000000000005","order":0,"text":"Bring a large pot of salted water to a boil and cook the spaghetti until al dente.","kind":"timer","blocksProgress":true,"timerSeconds":540,"timerLabel":"Boil pasta"},
    {"id":"ca7a1200-0000-4000-8000-000000000006","order":1,"text":"While the pasta cooks, warm olive oil in a skillet over medium-low heat and cook the garlic until fragrant, not browned.","kind":"parallel","blocksProgress":false,"canRunInBackground":true},
    {"id":"ca7a1200-0000-4000-8000-000000000007","order":2,"text":"Drain the pasta, reserving 1/2 cup of pasta water. Toss pasta with the garlic oil, a splash of pasta water, and parmesan.","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-000000000008","order":3,"text":"Finish with parsley and lemon zest if using. Taste and add salt.","kind":"blocking","blocksProgress":true}
  ]'::jsonb,
  '["Large pot","Skillet","Colander"]'::jsonb,
  'boil', true, '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
),
(
  'ca7a1000-0000-4000-8000-000000000003',
  'Sheet-pan chicken and peppers',
  'dinner', 'medium', 'beginner', 40, 4,
  'Cut the peppers and onion into similar-sized strips so they roast evenly.',
  '[
    {"id":"ca7a1100-0000-4000-8000-00000000000c","rawText":"680 g chicken breast","ingredientId":"a7e10000-0000-4000-8000-00000000000f","matchConfidence":1,"quantity":680,"unit":"g"},
    {"id":"ca7a1100-0000-4000-8000-00000000000d","rawText":"2 bell peppers, sliced","ingredientId":"a7e10000-0000-4000-8000-000000000003","matchConfidence":1,"quantity":2,"unit":"piece"},
    {"id":"ca7a1100-0000-4000-8000-00000000000e","rawText":"1 onion, sliced","ingredientId":"a7e10000-0000-4000-8000-00000000000e","matchConfidence":1,"quantity":1,"unit":"piece"},
    {"id":"ca7a1100-0000-4000-8000-00000000000f","rawText":"2 tbsp olive oil","ingredientId":"a7e10000-0000-4000-8000-00000000000a","matchConfidence":1,"quantity":2,"unit":"tbsp"},
    {"id":"ca7a1100-0000-4000-8000-000000000010","rawText":"1 tsp cumin","ingredientId":"a7e10000-0000-4000-8000-000000000025","matchConfidence":1,"quantity":1,"unit":"tsp"},
    {"id":"ca7a1100-0000-4000-8000-000000000011","rawText":"1 tsp paprika","ingredientId":"a7e10000-0000-4000-8000-000000000026","matchConfidence":1,"quantity":1,"unit":"tsp"},
    {"id":"ca7a1100-0000-4000-8000-000000000012","rawText":"Salt","ingredientId":"a7e10000-0000-4000-8000-00000000000b","matchConfidence":1},
    {"id":"ca7a1100-0000-4000-8000-000000000013","rawText":"Black pepper","ingredientId":"a7e10000-0000-4000-8000-00000000000c","matchConfidence":1}
  ]'::jsonb,
  '[
    {"id":"ca7a1200-0000-4000-8000-000000000009","order":0,"text":"Heat the oven to 425°F (220°C).","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-00000000000a","order":1,"text":"Toss chicken, peppers, and onion with olive oil, cumin, paprika, salt, and pepper. Spread on a sheet pan.","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-00000000000b","order":2,"text":"Roast until the chicken is cooked through and the peppers are browned at the edges.","kind":"timer","blocksProgress":true,"timerSeconds":1500,"timerLabel":"Roast"},
    {"id":"ca7a1200-0000-4000-8000-00000000000c","order":3,"text":"Rest the chicken 5 minutes, then slice and serve with the roasted vegetables.","kind":"wait","blocksProgress":true,"timerSeconds":300,"timerLabel":"Rest"}
  ]'::jsonb,
  '["Sheet pan","Mixing bowl"]'::jsonb,
  'bake', true, '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
),
(
  'ca7a1000-0000-4000-8000-000000000004',
  'Chickpea spinach bowl',
  'lunch', 'easy', 'beginner', 20, 2,
  'A pantry lunch: warm chickpeas over wilted spinach with a lemon-garlic dressing.',
  '[
    {"id":"ca7a1100-0000-4000-8000-000000000014","rawText":"1 1/2 cups chickpeas, drained","ingredientId":"a7e10000-0000-4000-8000-000000000037","matchConfidence":1,"quantity":1.5,"unit":"cup"},
    {"id":"ca7a1100-0000-4000-8000-000000000015","rawText":"4 cups spinach","ingredientId":"a7e10000-0000-4000-8000-00000000001d","matchConfidence":1,"quantity":4,"unit":"cup"},
    {"id":"ca7a1100-0000-4000-8000-000000000016","rawText":"2 tbsp olive oil","ingredientId":"a7e10000-0000-4000-8000-00000000000a","matchConfidence":1,"quantity":2,"unit":"tbsp"},
    {"id":"ca7a1100-0000-4000-8000-000000000017","rawText":"2 garlic cloves, minced","ingredientId":"a7e10000-0000-4000-8000-00000000000d","matchConfidence":1,"quantity":2,"unit":"clove"},
    {"id":"ca7a1100-0000-4000-8000-000000000018","rawText":"1 lemon, juiced","ingredientId":"a7e10000-0000-4000-8000-000000000018","matchConfidence":1,"quantity":1,"unit":"piece"},
    {"id":"ca7a1100-0000-4000-8000-000000000019","rawText":"Salt","ingredientId":"a7e10000-0000-4000-8000-00000000000b","matchConfidence":1}
  ]'::jsonb,
  '[
    {"id":"ca7a1200-0000-4000-8000-00000000000d","order":0,"text":"Warm olive oil in a skillet over medium heat. Cook the garlic until fragrant.","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-00000000000e","order":1,"text":"Add chickpeas and a pinch of salt. Cook until they pick up a little color.","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-00000000000f","order":2,"text":"Add spinach and toss until just wilted. Finish with lemon juice and more salt to taste.","kind":"blocking","blocksProgress":true}
  ]'::jsonb,
  '["Skillet"]'::jsonb,
  'saute', true, '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
),
(
  'ca7a1000-0000-4000-8000-000000000005',
  'Banana cinnamon smoothie',
  'beverage', 'easy', 'beginner', 5, 1,
  'Use a frozen banana if you want a thicker shake.',
  '[
    {"id":"ca7a1100-0000-4000-8000-00000000001a","rawText":"1 banana","ingredientId":"a7e10000-0000-4000-8000-00000000001f","matchConfidence":1,"quantity":1,"unit":"piece"},
    {"id":"ca7a1100-0000-4000-8000-00000000001b","rawText":"1 cup milk","ingredientId":"a7e10000-0000-4000-8000-000000000014","matchConfidence":1,"quantity":1,"unit":"cup"},
    {"id":"ca7a1100-0000-4000-8000-00000000001c","rawText":"1 tbsp honey","ingredientId":"a7e10000-0000-4000-8000-000000000023","matchConfidence":1,"quantity":1,"unit":"tbsp","optional":true},
    {"id":"ca7a1100-0000-4000-8000-00000000001d","rawText":"1/2 tsp cinnamon","ingredientId":"a7e10000-0000-4000-8000-000000000027","matchConfidence":1,"quantity":0.5,"unit":"tsp"}
  ]'::jsonb,
  '[
    {"id":"ca7a1200-0000-4000-8000-000000000010","order":0,"text":"Add banana, milk, honey, and cinnamon to a blender.","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-000000000011","order":1,"text":"Blend until smooth. Taste and add more cinnamon or honey if you like.","kind":"blocking","blocksProgress":true}
  ]'::jsonb,
  '["Blender"]'::jsonb,
  'raw', true, '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
),
(
  'ca7a1000-0000-4000-8000-000000000006',
  'Black bean tacos',
  'dinner', 'easy', 'beginner', 20, 4,
  'Warm the tortillas last so they stay pliable.',
  '[
    {"id":"ca7a1100-0000-4000-8000-00000000001e","rawText":"8 flour tortillas","ingredientId":"a7e10000-0000-4000-8000-000000000001","matchConfidence":1,"quantity":8,"unit":"piece"},
    {"id":"ca7a1100-0000-4000-8000-00000000001f","rawText":"2 cups black beans, drained","ingredientId":"a7e10000-0000-4000-8000-000000000038","matchConfidence":1,"quantity":2,"unit":"cup"},
    {"id":"ca7a1100-0000-4000-8000-000000000020","rawText":"1 avocado, sliced","ingredientId":"a7e10000-0000-4000-8000-00000000001e","matchConfidence":1,"quantity":1,"unit":"piece"},
    {"id":"ca7a1100-0000-4000-8000-000000000021","rawText":"1/2 onion, minced","ingredientId":"a7e10000-0000-4000-8000-00000000000e","matchConfidence":1,"quantity":0.5,"unit":"piece"},
    {"id":"ca7a1100-0000-4000-8000-000000000022","rawText":"Fresh cilantro","ingredientId":"a7e10000-0000-4000-8000-000000000029","matchConfidence":1,"optional":true},
    {"id":"ca7a1100-0000-4000-8000-000000000023","rawText":"1 lime, cut into wedges","ingredientId":"a7e10000-0000-4000-8000-000000000019","matchConfidence":1,"quantity":1,"unit":"piece"},
    {"id":"ca7a1100-0000-4000-8000-000000000024","rawText":"1 tbsp olive oil","ingredientId":"a7e10000-0000-4000-8000-00000000000a","matchConfidence":1,"quantity":1,"unit":"tbsp"},
    {"id":"ca7a1100-0000-4000-8000-000000000025","rawText":"Salt","ingredientId":"a7e10000-0000-4000-8000-00000000000b","matchConfidence":1}
  ]'::jsonb,
  '[
    {"id":"ca7a1200-0000-4000-8000-000000000012","order":0,"text":"Warm olive oil in a skillet. Cook the onion until softened, then add black beans and salt. Mash some of the beans as they heat.","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-000000000013","order":1,"text":"Warm the tortillas in a dry skillet or directly over a low flame.","kind":"blocking","blocksProgress":true},
    {"id":"ca7a1200-0000-4000-8000-000000000014","order":2,"text":"Fill tortillas with beans, avocado, cilantro, and a squeeze of lime.","kind":"blocking","blocksProgress":true}
  ]'::jsonb,
  '["Skillet"]'::jsonb,
  'saute', true, '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
),
-- Unpublished draft: RLS must hide this from authenticated SELECT.
(
  'ca7a1000-0000-4000-8000-000000000063',
  'Internal catalog draft',
  'snack', 'easy', 'beginner', 5, 1,
  'Not published.',
  '[{"id":"ca7a1100-0000-4000-8000-000000000063","rawText":"1 banana","ingredientId":"a7e10000-0000-4000-8000-00000000001f","matchConfidence":1,"quantity":1,"unit":"piece"}]'::jsonb,
  '[{"id":"ca7a1200-0000-4000-8000-000000000063","order":0,"text":"This draft should never reach the client.","kind":"blocking","blocksProgress":true}]'::jsonb,
  '[]'::jsonb,
  'raw', false, '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
);
