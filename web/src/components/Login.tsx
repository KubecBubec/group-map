import { useEffect, useState } from "react";
import {
  fetchLanUsers,
  fetchMeta,
  loginViaLan,
  loginWithGoogleUrl,
  setToken,
  type LanUser,
} from "../lib/api";
import { isPrivateHostname } from "../lib/network";
import { GoogleG } from "./icons";
import { Avatar, RoleBadge } from "./ui";
import type { Role } from "../lib/types";

export function Login({
  error,
  onLanLogin,
}: {
  error: string | null;
  onLanLogin: (token: string) => void;
}) {
  const [lanUsers, setLanUsers] = useState<LanUser[]>([]);
  const [lanLoading, setLanLoading] = useState(false);
  const [lanError, setLanError] = useState<string | null>(null);
  const [showLan, setShowLan] = useState(isPrivateHostname());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await fetchMeta();
        if (!cancelled && (meta.lanLoginAvailable || isPrivateHostname())) {
          setShowLan(true);
          setLanLoading(true);
          const users = await fetchLanUsers();
          if (!cancelled) setLanUsers(users);
        }
      } catch {
        if (!cancelled && isPrivateHostname()) {
          setLanError("LAN prihlásenie nie je dostupné. Skontroluj, či beží API.");
        }
      } finally {
        if (!cancelled) setLanLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickUser = async (userId: string) => {
    setLanError(null);
    try {
      const { token } = await loginViaLan(userId);
      setToken(token);
      onLanLogin(token);
    } catch (e) {
      setLanError(e instanceof Error ? e.message : "Prihlásenie zlyhalo");
    }
  };

  return (
    <div className="auth">
      <div className="auth__card auth__card--wide">
        <div className="auth__logo">🧭</div>
        <div>
          <h1 style={{ fontSize: 23 }}>Koordinátor skupiny</h1>
          <p className="hint" style={{ marginTop: 8 }}>
            Živá mapa, stretnutia a rýchla koordinácia celej skupiny na jednom mieste.
          </p>
        </div>
        {(error || lanError) && <div className="auth__error">{error ?? lanError}</div>}

        {showLan && (
          <div className="lan-login">
            <p className="section-title" style={{ margin: "0 0 8px" }}>
              Prihlásenie v lokálnej sieti
            </p>
            <p className="hint" style={{ marginBottom: 12 }}>
              Na telefóne vyber svoje meno. Najprv sa raz prihlás cez Google na PC, aby tu bolo koho
              vybrať.
            </p>
            {lanLoading ? (
              <div className="center-screen" style={{ height: 120 }}>
                <div className="spinner" />
              </div>
            ) : lanUsers.length === 0 ? (
              <p className="hint">Zatiaľ žiadni používatelia. Prihlás sa najprv na PC cez Google.</p>
            ) : (
              <div className="lan-users">
                {lanUsers.map((u) => (
                  <button key={u.id} className="lan-user-btn" onClick={() => pickUser(u.id)}>
                    <Avatar name={u.name} small />
                    <span className="grow" style={{ textAlign: "left" }}>
                      <strong>{u.name}</strong>
                    </span>
                    <RoleBadge role={u.role as Role} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!isPrivateHostname() && (
          <>
            {showLan && <div className="auth-divider">alebo</div>}
            <button
              className="google-btn"
              onClick={() => (window.location.href = loginWithGoogleUrl())}
            >
              <GoogleG size={20} />
              Prihlásiť sa cez Google
            </button>
          </>
        )}

        {isPrivateHostname() && (
          <p className="hint" style={{ textAlign: "center" }}>
            Google prihlásenie na IP adrese v sieti Google nepovoľuje. Použi výber mena vyššie.
          </p>
        )}

        <p className="hint" style={{ textAlign: "center" }}>
          Prihlásením súhlasíš so zdieľaním polohy so svojou skupinou počas akcie.
        </p>
      </div>
    </div>
  );
}
