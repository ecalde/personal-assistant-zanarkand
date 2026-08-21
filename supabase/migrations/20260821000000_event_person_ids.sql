-- Multiple people per event (keeps events.person_id as the first linked person).

ALTER TABLE public.events
  ADD COLUMN person_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.events
SET person_ids = ARRAY[person_id]
WHERE person_id IS NOT NULL
  AND person_ids = '{}'::uuid[];

CREATE INDEX events_user_id_person_ids_gin_idx
  ON public.events
  USING GIN (person_ids);

DROP POLICY events_insert_own ON public.events;
DROP POLICY events_update_own ON public.events;

CREATE POLICY events_insert_own
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      person_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.people p
        WHERE p.id = person_id
          AND p.user_id = auth.uid()
      )
    )
    AND (
      person_ids = '{}'::uuid[]
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(person_ids) AS pid
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.people p
          WHERE p.id = pid
            AND p.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY events_update_own
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      person_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.people p
        WHERE p.id = person_id
          AND p.user_id = auth.uid()
      )
    )
    AND (
      person_ids = '{}'::uuid[]
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(person_ids) AS pid
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.people p
          WHERE p.id = pid
            AND p.user_id = auth.uid()
        )
      )
    )
  );
