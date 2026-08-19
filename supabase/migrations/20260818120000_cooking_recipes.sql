-- Phase 1: per-user recipes (Cooking domain)

CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'dinner',
  difficulty text NOT NULL DEFAULT 'medium',
  experience_level text NOT NULL DEFAULT 'beginner',
  estimated_minutes integer NULL,
  servings integer NULL,
  notes text NULL,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  hero_image jsonb NULL,
  gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'manual',
  catalog_recipe_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipes_title_nonempty_chk CHECK (char_length(title) > 0),
  CONSTRAINT recipes_category_chk CHECK (category IN (
    'breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'beverage', 'meal_prep'
  )),
  CONSTRAINT recipes_difficulty_chk CHECK (difficulty IN ('easy', 'medium', 'hard')),
  CONSTRAINT recipes_experience_chk CHECK (experience_level IN (
    'beginner', 'intermediate', 'advanced'
  )),
  CONSTRAINT recipes_servings_chk CHECK (servings IS NULL OR servings > 0),
  CONSTRAINT recipes_minutes_chk CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  CONSTRAINT recipes_source_chk CHECK (source IN ('manual', 'import', 'catalog')),
  CONSTRAINT recipes_ingredients_array_chk CHECK (jsonb_typeof(ingredients) = 'array'),
  CONSTRAINT recipes_steps_array_chk CHECK (jsonb_typeof(steps) = 'array'),
  CONSTRAINT recipes_equipment_array_chk CHECK (jsonb_typeof(equipment) = 'array'),
  CONSTRAINT recipes_gallery_array_chk CHECK (jsonb_typeof(gallery) = 'array')
);

CREATE INDEX recipes_user_id_idx ON public.recipes (user_id);
CREATE INDEX recipes_user_id_category_idx ON public.recipes (user_id, category);
CREATE INDEX recipes_user_id_updated_at_idx ON public.recipes (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_recipes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER recipes_set_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_recipes_updated_at();

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipes_select_own
  ON public.recipes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY recipes_insert_own
  ON public.recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY recipes_update_own
  ON public.recipes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY recipes_delete_own
  ON public.recipes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.recipes FROM PUBLIC;
REVOKE ALL ON TABLE public.recipes FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipes TO authenticated;
