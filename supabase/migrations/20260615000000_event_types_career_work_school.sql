-- Extend event types (career, work) and rename deadline -> school

UPDATE public.events
SET type = 'school'
WHERE type = 'deadline';

ALTER TABLE public.events
  DROP CONSTRAINT events_type_chk;

ALTER TABLE public.events
  ADD CONSTRAINT events_type_chk
  CHECK (
    type IN (
      'birthday',
      'hangout',
      'trip',
      'holiday',
      'school',
      'career',
      'work',
      'other'
    )
  );
