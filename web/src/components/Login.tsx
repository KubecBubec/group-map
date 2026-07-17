import { useEffect, useState } from "react";
import {
  fetchMeta,
  loginWithGoogleUrl,
  loginWithPassword,
  registerWithPassword,
  setToken,
} from "../lib/api";
import { isPrivateHostname } from "../lib/network";
import { APP_ICON_SMALL, APP_NAME, APP_TAGLINE } from "../lib/appBrand";
import { GoogleG } from "./icons";

function parseAuthError(e: unknown): string {
  if (!(e instanceof Error)) return "Prihlásenie zlyhalo";
  try {
    const body = JSON.parse(e.message) as { detail?: string; error?: string };
    return body.detail ?? body.error ?? e.message;
  } catch {
    return e.message;
  }
}

export function Login({
  error,
  onLogin,
}: {
  error: string | null;
  onLogin: (token: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMeta()
      .then((meta) => {
        if (!cancelled) setGoogleEnabled(Boolean(meta.googleOAuthEnabled));
      })
      .catch(() => {
        if (!cancelled) setGoogleEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showGoogle = googleEnabled && !isPrivateHostname();

  const submit = async () => {
    setFormError(null);
    setBusy(true);
    try {
      const result =
        mode === "register"
          ? await registerWithPassword(name, password)
          : await loginWithPassword(name, password);
      setToken(result.token);
      onLogin(result.token);
    } catch (e) {
      setFormError(parseAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card auth__card--wide">
        <div className="auth__logo">
          <img src={APP_ICON_SMALL} alt="" width={56} height={56} />
        </div>
        <div>
          <h1 style={{ fontSize: 23 }}>{APP_NAME}</h1>
          <p className="hint" style={{ marginTop: 8 }}>
            {APP_TAGLINE}
          </p>
        </div>

        {(error || formError) && <div className="auth__error">{error ?? formError}</div>}

        <div className="stack">
          <div className="field">
            <span className="field__label">Unikátne meno</span>
            <input
              className="input"
              value={name}
              autoComplete="username"
              autoCapitalize="words"
              onChange={(e) => setName(e.target.value)}
              placeholder="napr. Petra"
              disabled={busy}
            />
          </div>
          <div className="field">
            <span className="field__label">Heslo</span>
            <input
              className="input"
              type="password"
              value={password}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="aspoň 6 znakov"
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          <button
            className="btn btn--primary btn--block"
            disabled={busy || name.trim().length < 2 || password.length < 6}
            onClick={() => void submit()}
          >
            {busy ? "Čakaj…" : mode === "register" ? "Vytvoriť účet" : "Prihlásiť sa"}
          </button>
        </div>

        <p className="hint" style={{ textAlign: "center" }}>
          {mode === "login" ? (
            <>
              Nemáš účet?{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setMode("register");
                  setFormError(null);
                }}
              >
                Zaregistruj sa
              </button>
            </>
          ) : (
            <>
              Už máš účet?{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setMode("login");
                  setFormError(null);
                }}
              >
                Prihlás sa
              </button>
            </>
          )}
        </p>

        {showGoogle && (
          <>
            <div className="auth-divider">alebo</div>
            <button
              className="google-btn"
              type="button"
              disabled={busy}
              onClick={() => {
                window.location.href = loginWithGoogleUrl();
              }}
            >
              <GoogleG size={20} />
              Prihlásiť sa cez Google
            </button>
          </>
        )}

        {googleEnabled && isPrivateHostname() && (
          <p className="hint" style={{ textAlign: "center" }}>
            Google na lokálnej IP nefunguje. Použi meno a heslo, alebo otvor appku cez localhost /
            HTTPS tunel.
          </p>
        )}

        <p className="hint" style={{ textAlign: "center" }}>
          Prihlásením súhlasíš so zdieľaním polohy so svojou skupinou počas akcie. Prvý účet je
          admin.
        </p>
      </div>
    </div>
  );
}
