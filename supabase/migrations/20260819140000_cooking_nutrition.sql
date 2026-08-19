-- Phase 8: nutrition cache, retention factors, custom ingredients, cooking method

-- ---------------------------------------------------------------------------
-- Recipes: cooking method for retention application
-- ---------------------------------------------------------------------------

ALTER TABLE public.recipes
  ADD COLUMN cooking_method text NULL;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_cooking_method_chk CHECK (
    cooking_method IS NULL OR cooking_method IN (
      'boil', 'bake', 'fry', 'saute', 'steam', 'grill', 'raw', 'other'
    )
  );

-- ---------------------------------------------------------------------------
-- Custom ingredients (per-user)
-- ---------------------------------------------------------------------------

CREATE TABLE public.custom_ingredients (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NULL,
  default_unit text NULL,
  density_g_per_ml numeric NULL,
  grams_per_piece numeric NULL,
  per_100g jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_ingredients_name_nonempty_chk CHECK (char_length(name) > 0),
  CONSTRAINT custom_ingredients_per100g_obj_chk CHECK (
    per_100g IS NULL OR jsonb_typeof(per_100g) = 'object'
  )
);

CREATE INDEX custom_ingredients_user_id_idx ON public.custom_ingredients (user_id);
CREATE UNIQUE INDEX custom_ingredients_user_name_uq
  ON public.custom_ingredients (user_id, lower(name));

CREATE OR REPLACE FUNCTION public.set_custom_ingredients_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER custom_ingredients_set_updated_at
  BEFORE UPDATE ON public.custom_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_custom_ingredients_updated_at();

ALTER TABLE public.custom_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_ingredients_select_own
  ON public.custom_ingredients
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY custom_ingredients_insert_own
  ON public.custom_ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY custom_ingredients_update_own
  ON public.custom_ingredients
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY custom_ingredients_delete_own
  ON public.custom_ingredients
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.custom_ingredients FROM PUBLIC;
REVOKE ALL ON TABLE public.custom_ingredients FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.custom_ingredients TO authenticated;

ALTER TABLE public.user_pantry
  ADD CONSTRAINT user_pantry_custom_ingredient_fk
  FOREIGN KEY (custom_ingredient_id)
  REFERENCES public.custom_ingredients (id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX user_pantry_user_custom_ingredient_uq
  ON public.user_pantry (user_id, custom_ingredient_id)
  WHERE custom_ingredient_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Global nutrient cache (read-all authenticated; writes via service role)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ingredient_nutrients (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.ingredients (id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'usda',
  fdc_id integer NULL,
  per_100g jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredient_nutrients_source_chk CHECK (source IN ('usda', 'off', 'custom')),
  CONSTRAINT ingredient_nutrients_per100g_obj_chk CHECK (jsonb_typeof(per_100g) = 'object')
);

CREATE UNIQUE INDEX ingredient_nutrients_ingredient_source_uq
  ON public.ingredient_nutrients (ingredient_id, source);
CREATE INDEX ingredient_nutrients_ingredient_id_idx
  ON public.ingredient_nutrients (ingredient_id);

ALTER TABLE public.ingredient_nutrients ENABLE ROW LEVEL SECURITY;

CREATE POLICY ingredient_nutrients_select_all
  ON public.ingredient_nutrients
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.ingredient_nutrients FROM PUBLIC;
REVOKE ALL ON TABLE public.ingredient_nutrients FROM anon;
GRANT SELECT ON TABLE public.ingredient_nutrients TO authenticated;

-- ---------------------------------------------------------------------------
-- Retention factors (global, read-all authenticated)
-- ---------------------------------------------------------------------------

CREATE TABLE public.retention_factors (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  cooking_method text NOT NULL,
  nutrient_key text NOT NULL,
  factor numeric NOT NULL,
  CONSTRAINT retention_factors_method_chk CHECK (cooking_method IN (
    'boil', 'bake', 'fry', 'saute', 'steam', 'grill', 'raw', 'other'
  )),
  CONSTRAINT retention_factor_range_chk CHECK (factor >= 0 AND factor <= 1)
);

CREATE UNIQUE INDEX retention_factors_method_nutrient_uq
  ON public.retention_factors (cooking_method, nutrient_key);

ALTER TABLE public.retention_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY retention_factors_select_all
  ON public.retention_factors
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.retention_factors FROM PUBLIC;
REVOKE ALL ON TABLE public.retention_factors FROM anon;
GRANT SELECT ON TABLE public.retention_factors TO authenticated;

INSERT INTO public.retention_factors (cooking_method, nutrient_key, factor)
SELECT method, nutrient, 1.0
FROM (
  VALUES
    ('boil'),
    ('bake'),
    ('fry'),
    ('saute'),
    ('steam'),
    ('grill'),
    ('raw'),
    ('other')
) AS methods(method)
CROSS JOIN (
  VALUES
    ('kcal'),
    ('protein_g'),
    ('fat_g'),
    ('carb_g'),
    ('fiber_g'),
    ('sugar_g'),
    ('sodium_mg')
) AS nutrients(nutrient);

INSERT INTO public.retention_factors (cooking_method, nutrient_key, factor)
VALUES
  ('boil', 'vitamin_c', 0.70),
  ('bake', 'vitamin_c', 0.90),
  ('fry', 'vitamin_c', 0.85),
  ('saute', 'vitamin_c', 0.90),
  ('steam', 'vitamin_c', 0.85),
  ('grill', 'vitamin_c', 0.85),
  ('raw', 'vitamin_c', 1.00),
  ('other', 'vitamin_c', 0.90);

-- ---------------------------------------------------------------------------
-- Seed catalog: USDA FDC ids + density / piece-weight gaps for gram conversion
-- ---------------------------------------------------------------------------

UPDATE public.ingredients AS i
SET
  fdc_id = v.fdc_id,
  density_g_per_ml = COALESCE(v.density_g_per_ml, i.density_g_per_ml),
  grams_per_piece = COALESCE(v.grams_per_piece, i.grams_per_piece)
FROM (
  VALUES
    ('a7e10000-0000-4000-8000-000000000001'::uuid, 1100854, NULL::numeric, NULL::numeric),
    ('a7e10000-0000-4000-8000-000000000002', 1100859, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000003', 2258588, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000004', 170497, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000005', 168374, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000006', 170108, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000007', 170457, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000008', 170379, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000009', 748967, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000000a', 748608, 0.91, NULL),
    ('a7e10000-0000-4000-8000-00000000000b', 173468, 1.217, NULL),
    ('a7e10000-0000-4000-8000-00000000000c', 170931, 0.50, NULL),
    ('a7e10000-0000-4000-8000-00000000000d', 169230, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000000e', 170000, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000000f', 171077, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000010', 174032, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000011', 169761, 0.85, NULL),
    ('a7e10000-0000-4000-8000-000000000012', 168894, 0.53, NULL),
    ('a7e10000-0000-4000-8000-000000000013', 173410, 0.911, NULL),
    ('a7e10000-0000-4000-8000-000000000014', 746782, 1.03, NULL),
    ('a7e10000-0000-4000-8000-000000000015', 173414, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000016', 170881, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000017', 168928, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000018', 167747, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000019', 168155, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000001a', 170026, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000001b', 170393, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000001c', 169988, NULL, 40),
    ('a7e10000-0000-4000-8000-00000000001d', 168462, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000001e', 171705, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000001f', 173944, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000020', 171688, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000021', 169655, 0.85, NULL),
    ('a7e10000-0000-4000-8000-000000000022', 168833, 0.80, NULL),
    ('a7e10000-0000-4000-8000-000000000023', 169640, 1.42, NULL),
    ('a7e10000-0000-4000-8000-000000000024', 174490, 1.18, NULL),
    ('a7e10000-0000-4000-8000-000000000025', 170923, 0.42, NULL),
    ('a7e10000-0000-4000-8000-000000000026', 171329, 0.46, NULL),
    ('a7e10000-0000-4000-8000-000000000027', 171320, 0.56, NULL),
    ('a7e10000-0000-4000-8000-000000000028', 172232, NULL, 2),
    ('a7e10000-0000-4000-8000-000000000029', 169997, NULL, 10),
    ('a7e10000-0000-4000-8000-00000000002a', 170416, NULL, 10),
    ('a7e10000-0000-4000-8000-00000000002b', 169231, NULL, 15),
    ('a7e10000-0000-4000-8000-00000000002c', 168321, NULL, 8),
    ('a7e10000-0000-4000-8000-00000000002d', 175180, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000002e', 175167, NULL, NULL),
    ('a7e10000-0000-4000-8000-00000000002f', 172470, NULL, NULL),
    ('a7e10000-0000-4000-8000-000000000030', 325871, NULL, 30),
    ('a7e10000-0000-4000-8000-000000000031', 172802, 0.90, NULL),
    ('a7e10000-0000-4000-8000-000000000032', 173469, 0.88, NULL),
    ('a7e10000-0000-4000-8000-000000000033', 169593, 0.35, NULL),
    ('a7e10000-0000-4000-8000-000000000034', 170172, 0.96, NULL),
    ('a7e10000-0000-4000-8000-000000000035', 173805, 0.68, NULL),
    ('a7e10000-0000-4000-8000-000000000036', 173735, 0.68, NULL),
    ('a7e10000-0000-4000-8000-000000000037', 170005, NULL, 15),
    ('a7e10000-0000-4000-8000-000000000038', 170499, NULL, 25)
) AS v(id, fdc_id, density_g_per_ml, grams_per_piece)
WHERE i.id = v.id;
