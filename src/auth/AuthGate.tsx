import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import App from "../App";
import { AuthScreen } from "./AuthScreen";

export function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session: initial } }) => {
      if (!cancelled) {
        setSession(initial);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
          color: "#333",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!session?.user) {
    return <AuthScreen />;
  }

  return (
    <App
      onSignOut={() => {
        void supabase.auth.signOut();
      }}
    />
  );
}
