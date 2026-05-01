import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabasePublicEnvKey = "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY";

function readRequiredEnv(name: SupabasePublicEnvKey): string {
  const raw = import.meta.env[name];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(
      `[supabaseClient] Missing or empty environment variable: ${name}. ` +
        "Set it in .env.local (see .env.example) for local development, or in your host project settings for production."
    );
  }
  return raw;
}

const supabaseUrl = readRequiredEnv("VITE_SUPABASE_URL");
const supabaseAnonKey = readRequiredEnv("VITE_SUPABASE_ANON_KEY");

/**
 * Browser Supabase client (anon key + RLS). Initializes from Vite env; throws if vars are missing or blank.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
