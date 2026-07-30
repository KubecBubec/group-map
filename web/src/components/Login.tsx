import { useEffect, useState } from "react";
import { fetchMeta, loginWithGoogleUrl } from "../lib/api";
import { isPrivateHostname } from "../lib/network";
import { APP_ICON_SMALL, APP_NAME, APP_TAGLINE } from "../lib/appBrand";
import { GoogleG } from "./icons";

export function Login({
  error,
}: {
  error: string | null;
}) {
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

        {error && <div className="auth__error">{error}</div>}

        <div className="stack">
          {showGoogle && (
            <button
              className="google-btn"
              type="button"
              onClick={() => {
                window.location.href = loginWithGoogleUrl();
              }}
            >
              <GoogleG size={20} />
              Prihlásiť sa cez Google
            </button>
          )}
        </div>

        {googleEnabled && isPrivateHostname() && (
          <p className="hint" style={{ textAlign: "center" }}>
            Google na lokálnej IP nefunguje. Otvor appku cez verejnú HTTPS doménu.
          </p>
        )}
        {!googleEnabled && (
          <p className="hint" style={{ textAlign: "center" }}>
            Google prihlásenie zatiaľ nie je zapnuté. Požiadaj správcu o aktiváciu Google OAuth.
          </p>
        )}

        <p className="hint" style={{ textAlign: "center" }}>
          Prihlásením súhlasíš so zdieľaním polohy so svojou skupinou počas akcie.
        </p>
      </div>
    </div>
  );
}
