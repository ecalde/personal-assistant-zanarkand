-- Phase 7: ingredient catalog, aliases, pantry, pg_trgm

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Global ingredients (read-all authenticated; writes via seed/service role)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  canonical_name text NOT NULL UNIQUE,
  category text NULL,
  default_unit text NULL,
  density_g_per_ml numeric NULL,
  grams_per_piece numeric NULL,
  fdc_id integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredients_name_nonempty_chk CHECK (char_length(canonical_name) > 0)
);

CREATE INDEX ingredients_name_trgm_idx
  ON public.ingredients
  USING gin (canonical_name extensions.gin_trgm_ops);
CREATE INDEX ingredients_fdc_id_idx ON public.ingredients (fdc_id);

CREATE OR REPLACE FUNCTION public.set_ingredients_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ingredients_set_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ingredients_updated_at();

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY ingredients_select_all
  ON public.ingredients
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.ingredients FROM PUBLIC;
REVOKE ALL ON TABLE public.ingredients FROM anon;
GRANT SELECT ON TABLE public.ingredients TO authenticated;

-- ---------------------------------------------------------------------------
-- Global aliases
-- ---------------------------------------------------------------------------

CREATE TABLE public.ingredient_aliases (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.ingredients (id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredient_aliases_alias_nonempty_chk CHECK (char_length(alias) > 0)
);

CREATE UNIQUE INDEX ingredient_aliases_normalized_uq
  ON public.ingredient_aliases (alias_normalized);
CREATE INDEX ingredient_aliases_norm_trgm_idx
  ON public.ingredient_aliases
  USING gin (alias_normalized extensions.gin_trgm_ops);
CREATE INDEX ingredient_aliases_ingredient_id_idx
  ON public.ingredient_aliases (ingredient_id);

ALTER TABLE public.ingredient_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY ingredient_aliases_select_all
  ON public.ingredient_aliases
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.ingredient_aliases FROM PUBLIC;
REVOKE ALL ON TABLE public.ingredient_aliases FROM anon;
GRANT SELECT ON TABLE public.ingredient_aliases TO authenticated;

-- ---------------------------------------------------------------------------
-- Per-user pantry
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_pantry (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  ingredient_id uuid NULL REFERENCES public.ingredients (id) ON DELETE SET NULL,
  custom_ingredient_id uuid NULL,
  label text NOT NULL,
  available boolean NOT NULL DEFAULT true,
  quantity numeric NULL,
  unit text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_pantry_label_nonempty_chk CHECK (char_length(label) > 0)
);

CREATE INDEX user_pantry_user_id_idx ON public.user_pantry (user_id);
CREATE INDEX user_pantry_user_id_ingredient_id_idx
  ON public.user_pantry (user_id, ingredient_id);
CREATE UNIQUE INDEX user_pantry_user_ingredient_uq
  ON public.user_pantry (user_id, ingredient_id)
  WHERE ingredient_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_user_pantry_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_pantry_set_updated_at
  BEFORE UPDATE ON public.user_pantry
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_pantry_updated_at();

ALTER TABLE public.user_pantry ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_pantry_select_own
  ON public.user_pantry
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_pantry_insert_own
  ON public.user_pantry
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_pantry_update_own
  ON public.user_pantry
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_pantry_delete_own
  ON public.user_pantry
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.user_pantry FROM PUBLIC;
REVOKE ALL ON TABLE public.user_pantry FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_pantry TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed catalog (stable ingredient UUIDs match src/core/ingredientCatalog.ts)
-- ---------------------------------------------------------------------------

INSERT INTO public.ingredients (
  id, canonical_name, category, default_unit, density_g_per_ml, grams_per_piece
) VALUES
  ('a7e10000-0000-4000-8000-000000000001', 'flour tortilla', 'grain', 'piece', NULL, 30),
  ('a7e10000-0000-4000-8000-000000000002', 'corn tortilla', 'grain', 'piece', NULL, 24),
  ('a7e10000-0000-4000-8000-000000000003', 'bell pepper', 'produce', 'piece', NULL, 150),
  ('a7e10000-0000-4000-8000-000000000004', 'green bell pepper', 'produce', 'piece', NULL, 150),
  ('a7e10000-0000-4000-8000-000000000005', 'yellow bell pepper', 'produce', 'piece', NULL, 150),
  ('a7e10000-0000-4000-8000-000000000006', 'red bell pepper', 'produce', 'piece', NULL, 150),
  ('a7e10000-0000-4000-8000-000000000007', 'tomato', 'produce', 'piece', NULL, 120),
  ('a7e10000-0000-4000-8000-000000000008', 'broccoli', 'produce', 'piece', NULL, 300),
  ('a7e10000-0000-4000-8000-000000000009', 'egg', 'protein', 'piece', NULL, 50),
  ('a7e10000-0000-4000-8000-00000000000a', 'olive oil', 'oil', 'tbsp', 0.91, NULL),
  ('a7e10000-0000-4000-8000-00000000000b', 'salt', 'spice', 'tsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000000c', 'black pepper', 'spice', 'tsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000000d', 'garlic', 'produce', 'clove', NULL, 5),
  ('a7e10000-0000-4000-8000-00000000000e', 'onion', 'produce', 'piece', NULL, 150),
  ('a7e10000-0000-4000-8000-00000000000f', 'chicken breast', 'protein', 'g', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000010', 'ground beef', 'protein', 'g', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000011', 'white rice', 'grain', 'cup', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000012', 'all-purpose flour', 'grain', 'cup', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000013', 'butter', 'dairy', 'tbsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000014', 'milk', 'dairy', 'cup', 1.03, NULL),
  ('a7e10000-0000-4000-8000-000000000015', 'cheddar cheese', 'dairy', 'g', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000016', 'parmesan cheese', 'dairy', 'g', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000017', 'spaghetti', 'grain', 'g', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000018', 'lemon', 'produce', 'piece', NULL, 60),
  ('a7e10000-0000-4000-8000-000000000019', 'lime', 'produce', 'piece', NULL, 50),
  ('a7e10000-0000-4000-8000-00000000001a', 'potato', 'produce', 'piece', NULL, 170),
  ('a7e10000-0000-4000-8000-00000000001b', 'carrot', 'produce', 'piece', NULL, 60),
  ('a7e10000-0000-4000-8000-00000000001c', 'celery', 'produce', 'piece', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000001d', 'spinach', 'produce', 'g', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000001e', 'avocado', 'produce', 'piece', NULL, 150),
  ('a7e10000-0000-4000-8000-00000000001f', 'banana', 'produce', 'piece', NULL, 120),
  ('a7e10000-0000-4000-8000-000000000020', 'apple', 'produce', 'piece', NULL, 180),
  ('a7e10000-0000-4000-8000-000000000021', 'granulated sugar', 'pantry', 'cup', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000022', 'brown sugar', 'pantry', 'cup', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000023', 'honey', 'pantry', 'tbsp', 1.42, NULL),
  ('a7e10000-0000-4000-8000-000000000024', 'soy sauce', 'pantry', 'tbsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000025', 'cumin', 'spice', 'tsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000026', 'paprika', 'spice', 'tsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000027', 'cinnamon', 'spice', 'tsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000028', 'basil', 'produce', 'piece', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000029', 'cilantro', 'produce', 'piece', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000002a', 'parsley', 'produce', 'piece', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000002b', 'ginger', 'produce', 'piece', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000002c', 'bacon', 'protein', 'slice', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000002d', 'shrimp', 'protein', 'g', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000002e', 'salmon', 'protein', 'g', NULL, NULL),
  ('a7e10000-0000-4000-8000-00000000002f', 'tofu', 'protein', 'g', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000030', 'bread', 'grain', 'slice', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000031', 'baking powder', 'pantry', 'tsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000032', 'vanilla extract', 'pantry', 'tsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000033', 'cocoa powder', 'pantry', 'tbsp', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000034', 'coconut milk', 'pantry', 'cup', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000035', 'chickpeas', 'pantry', 'cup', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000036', 'black beans', 'pantry', 'cup', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000037', 'scallion', 'produce', 'piece', NULL, NULL),
  ('a7e10000-0000-4000-8000-000000000038', 'shallot', 'produce', 'piece', NULL, 25);

INSERT INTO public.ingredient_aliases (ingredient_id, alias, alias_normalized)
SELECT
  i.id,
  i.canonical_name,
  lower(btrim(regexp_replace(regexp_replace(i.canonical_name, '[^a-zA-Z0-9]+', ' ', 'g'), '\s+', ' ', 'g')))
FROM public.ingredients i;

INSERT INTO public.ingredient_aliases (ingredient_id, alias, alias_normalized)
SELECT v.ingredient_id, v.alias, v.alias_normalized
FROM (
  VALUES
    ('a7e10000-0000-4000-8000-000000000001'::uuid, 'tortilla', 'tortilla'),
    ('a7e10000-0000-4000-8000-000000000001'::uuid, 'tortillas', 'tortillas'),
    ('a7e10000-0000-4000-8000-000000000001'::uuid, 'flour tortillas', 'flour tortillas'),
    ('a7e10000-0000-4000-8000-000000000002'::uuid, 'corn tortillas', 'corn tortillas'),
    ('a7e10000-0000-4000-8000-000000000003'::uuid, 'bell peppers', 'bell peppers'),
    ('a7e10000-0000-4000-8000-000000000003'::uuid, 'sweet pepper', 'sweet pepper'),
    ('a7e10000-0000-4000-8000-000000000003'::uuid, 'sweet peppers', 'sweet peppers'),
    ('a7e10000-0000-4000-8000-000000000004'::uuid, 'green pepper', 'green pepper'),
    ('a7e10000-0000-4000-8000-000000000004'::uuid, 'green peppers', 'green peppers'),
    ('a7e10000-0000-4000-8000-000000000004'::uuid, 'green bell peppers', 'green bell peppers'),
    ('a7e10000-0000-4000-8000-000000000005'::uuid, 'yellow pepper', 'yellow pepper'),
    ('a7e10000-0000-4000-8000-000000000005'::uuid, 'yellow peppers', 'yellow peppers'),
    ('a7e10000-0000-4000-8000-000000000005'::uuid, 'yellow bell peppers', 'yellow bell peppers'),
    ('a7e10000-0000-4000-8000-000000000006'::uuid, 'red bell peppers', 'red bell peppers'),
    ('a7e10000-0000-4000-8000-000000000007'::uuid, 'tomatoes', 'tomatoes'),
    ('a7e10000-0000-4000-8000-000000000007'::uuid, 'tomatoe', 'tomatoe'),
    ('a7e10000-0000-4000-8000-000000000007'::uuid, 'tomatos', 'tomatos'),
    ('a7e10000-0000-4000-8000-000000000008'::uuid, 'brocoli', 'brocoli'),
    ('a7e10000-0000-4000-8000-000000000008'::uuid, 'brocolli', 'brocolli'),
    ('a7e10000-0000-4000-8000-000000000008'::uuid, 'broccolis', 'broccolis'),
    ('a7e10000-0000-4000-8000-000000000009'::uuid, 'eggs', 'eggs'),
    ('a7e10000-0000-4000-8000-00000000000a'::uuid, 'extra virgin olive oil', 'extra virgin olive oil'),
    ('a7e10000-0000-4000-8000-00000000000a'::uuid, 'evoo', 'evoo'),
    ('a7e10000-0000-4000-8000-00000000000b'::uuid, 'kosher salt', 'kosher salt'),
    ('a7e10000-0000-4000-8000-00000000000b'::uuid, 'sea salt', 'sea salt'),
    ('a7e10000-0000-4000-8000-00000000000b'::uuid, 'table salt', 'table salt'),
    ('a7e10000-0000-4000-8000-00000000000c'::uuid, 'pepper', 'pepper'),
    ('a7e10000-0000-4000-8000-00000000000c'::uuid, 'ground black pepper', 'ground black pepper'),
    ('a7e10000-0000-4000-8000-00000000000c'::uuid, 'cracked pepper', 'cracked pepper'),
    ('a7e10000-0000-4000-8000-00000000000d'::uuid, 'garlic clove', 'garlic clove'),
    ('a7e10000-0000-4000-8000-00000000000d'::uuid, 'garlic cloves', 'garlic cloves'),
    ('a7e10000-0000-4000-8000-00000000000e'::uuid, 'onions', 'onions'),
    ('a7e10000-0000-4000-8000-00000000000e'::uuid, 'yellow onion', 'yellow onion'),
    ('a7e10000-0000-4000-8000-00000000000e'::uuid, 'yellow onions', 'yellow onions'),
    ('a7e10000-0000-4000-8000-00000000000f'::uuid, 'chicken', 'chicken'),
    ('a7e10000-0000-4000-8000-00000000000f'::uuid, 'chicken breasts', 'chicken breasts'),
    ('a7e10000-0000-4000-8000-00000000000f'::uuid, 'boneless chicken breast', 'boneless chicken breast'),
    ('a7e10000-0000-4000-8000-000000000010'::uuid, 'beef', 'beef'),
    ('a7e10000-0000-4000-8000-000000000010'::uuid, 'hamburger meat', 'hamburger meat'),
    ('a7e10000-0000-4000-8000-000000000010'::uuid, 'minced beef', 'minced beef'),
    ('a7e10000-0000-4000-8000-000000000011'::uuid, 'rice', 'rice'),
    ('a7e10000-0000-4000-8000-000000000011'::uuid, 'long grain rice', 'long grain rice'),
    ('a7e10000-0000-4000-8000-000000000012'::uuid, 'flour', 'flour'),
    ('a7e10000-0000-4000-8000-000000000012'::uuid, 'ap flour', 'ap flour'),
    ('a7e10000-0000-4000-8000-000000000012'::uuid, 'plain flour', 'plain flour'),
    ('a7e10000-0000-4000-8000-000000000013'::uuid, 'unsalted butter', 'unsalted butter'),
    ('a7e10000-0000-4000-8000-000000000013'::uuid, 'salted butter', 'salted butter'),
    ('a7e10000-0000-4000-8000-000000000014'::uuid, 'whole milk', 'whole milk'),
    ('a7e10000-0000-4000-8000-000000000014'::uuid, '2% milk', '2 milk'),
    ('a7e10000-0000-4000-8000-000000000015'::uuid, 'cheddar', 'cheddar'),
    ('a7e10000-0000-4000-8000-000000000016'::uuid, 'parmesan', 'parmesan'),
    ('a7e10000-0000-4000-8000-000000000016'::uuid, 'parmigiano', 'parmigiano'),
    ('a7e10000-0000-4000-8000-000000000017'::uuid, 'pasta', 'pasta'),
    ('a7e10000-0000-4000-8000-000000000018'::uuid, 'lemons', 'lemons'),
    ('a7e10000-0000-4000-8000-000000000019'::uuid, 'limes', 'limes'),
    ('a7e10000-0000-4000-8000-00000000001a'::uuid, 'potatoes', 'potatoes'),
    ('a7e10000-0000-4000-8000-00000000001a'::uuid, 'russet potato', 'russet potato'),
    ('a7e10000-0000-4000-8000-00000000001b'::uuid, 'carrots', 'carrots'),
    ('a7e10000-0000-4000-8000-00000000001c'::uuid, 'celery stalk', 'celery stalk'),
    ('a7e10000-0000-4000-8000-00000000001c'::uuid, 'celery stalks', 'celery stalks'),
    ('a7e10000-0000-4000-8000-00000000001d'::uuid, 'baby spinach', 'baby spinach'),
    ('a7e10000-0000-4000-8000-00000000001e'::uuid, 'avocados', 'avocados'),
    ('a7e10000-0000-4000-8000-00000000001f'::uuid, 'bananas', 'bananas'),
    ('a7e10000-0000-4000-8000-000000000020'::uuid, 'apples', 'apples'),
    ('a7e10000-0000-4000-8000-000000000021'::uuid, 'sugar', 'sugar'),
    ('a7e10000-0000-4000-8000-000000000021'::uuid, 'white sugar', 'white sugar'),
    ('a7e10000-0000-4000-8000-000000000022'::uuid, 'light brown sugar', 'light brown sugar'),
    ('a7e10000-0000-4000-8000-000000000024'::uuid, 'soya sauce', 'soya sauce'),
    ('a7e10000-0000-4000-8000-000000000025'::uuid, 'ground cumin', 'ground cumin'),
    ('a7e10000-0000-4000-8000-000000000027'::uuid, 'ground cinnamon', 'ground cinnamon'),
    ('a7e10000-0000-4000-8000-000000000028'::uuid, 'fresh basil', 'fresh basil'),
    ('a7e10000-0000-4000-8000-000000000029'::uuid, 'coriander', 'coriander'),
    ('a7e10000-0000-4000-8000-000000000029'::uuid, 'fresh cilantro', 'fresh cilantro'),
    ('a7e10000-0000-4000-8000-00000000002a'::uuid, 'fresh parsley', 'fresh parsley'),
    ('a7e10000-0000-4000-8000-00000000002b'::uuid, 'fresh ginger', 'fresh ginger'),
    ('a7e10000-0000-4000-8000-00000000002b'::uuid, 'ginger root', 'ginger root'),
    ('a7e10000-0000-4000-8000-00000000002c'::uuid, 'bacon strips', 'bacon strips'),
    ('a7e10000-0000-4000-8000-00000000002d'::uuid, 'prawns', 'prawns'),
    ('a7e10000-0000-4000-8000-00000000002d'::uuid, 'prawn', 'prawn'),
    ('a7e10000-0000-4000-8000-00000000002e'::uuid, 'salmon fillet', 'salmon fillet'),
    ('a7e10000-0000-4000-8000-00000000002f'::uuid, 'firm tofu', 'firm tofu'),
    ('a7e10000-0000-4000-8000-000000000030'::uuid, 'loaf of bread', 'loaf of bread'),
    ('a7e10000-0000-4000-8000-000000000032'::uuid, 'vanilla', 'vanilla'),
    ('a7e10000-0000-4000-8000-000000000033'::uuid, 'unsweetened cocoa', 'unsweetened cocoa'),
    ('a7e10000-0000-4000-8000-000000000034'::uuid, 'canned coconut milk', 'canned coconut milk'),
    ('a7e10000-0000-4000-8000-000000000035'::uuid, 'garbanzo beans', 'garbanzo beans'),
    ('a7e10000-0000-4000-8000-000000000035'::uuid, 'garbanzos', 'garbanzos'),
    ('a7e10000-0000-4000-8000-000000000036'::uuid, 'black bean', 'black bean'),
    ('a7e10000-0000-4000-8000-000000000037'::uuid, 'green onion', 'green onion'),
    ('a7e10000-0000-4000-8000-000000000037'::uuid, 'green onions', 'green onions'),
    ('a7e10000-0000-4000-8000-000000000037'::uuid, 'spring onion', 'spring onion'),
    ('a7e10000-0000-4000-8000-000000000037'::uuid, 'scallions', 'scallions'),
    ('a7e10000-0000-4000-8000-000000000038'::uuid, 'shallots', 'shallots')
) AS v(ingredient_id, alias, alias_normalized)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ingredient_aliases a
  WHERE a.alias_normalized = v.alias_normalized
);
