-- Rename event type career -> vacation

UPDATE public.events
SET type = 'vacation'
WHERE type = 'career';

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
      'vacation',
      'work',
      'other'
    )
  );
