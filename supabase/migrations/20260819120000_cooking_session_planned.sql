-- Phase 4: planned cooks reuse cooking_sessions (status = planned)

ALTER TABLE public.cooking_sessions
  DROP CONSTRAINT cooking_sessions_status_chk;

ALTER TABLE public.cooking_sessions
  ADD CONSTRAINT cooking_sessions_status_chk
  CHECK (status IN ('planned', 'in_progress', 'completed', 'abandoned'));
