import { useState, type CSSProperties, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { mapAuthError } from "./mapAuthError";

type Mode = "signin" | "signup";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter email and password.");
      return;
    }

    setPending(true);
    try {
      if (mode === "signin") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (authError) setError(mapAuthError(authError));
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: trimmed,
          password,
        });
        if (authError) {
          setError(mapAuthError(authError));
        } else if (data.user && !data.session) {
          setInfo("Check your email to confirm your account, then sign in.");
        }
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        background: "#f6f6f6",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "white",
          padding: 24,
          borderRadius: 14,
          border: "1px solid #e5e5e5",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Zanarkand</h1>
        <p style={{ margin: "0 0 20px", opacity: 0.8, fontSize: 14 }}>
          {mode === "signin" ? "Sign in to continue." : "Create an account."}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Password</span>
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              style={inputStyle}
            />
          </label>

          {error && (
            <div style={{ background: "#ffe6e6", padding: 10, borderRadius: 10, fontSize: 14 }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ background: "#ecfff1", padding: 10, borderRadius: 10, fontSize: 14 }}>
              {info}
            </div>
          )}

          <button type="submit" disabled={pending} style={buttonStyle}>
            {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <p style={{ margin: "16px 0 0", fontSize: 14, textAlign: "center" }}>
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setInfo(null);
                }}
                style={linkButtonStyle}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                style={linkButtonStyle}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  fontSize: 16,
};

const buttonStyle: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #999",
  background: "#111",
  color: "white",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
};

const linkButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#0066cc",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
};
