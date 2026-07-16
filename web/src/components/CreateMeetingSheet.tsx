import { useMemo, useState } from "react";
import { useCoordinator } from "../lib/coordinator";
import { findMeetingLimitConflict, parseApiErrorMessage } from "../lib/meetingLimits";
import { canCreateGlobalMeetingPoint } from "../lib/meetingPermissions";
import { validateMeetingTitle } from "../lib/meetingValidation";
import { SearchIcon } from "./icons";
import { Avatar, RoleBadge, Segmented, Sheet } from "./ui";
import type { LatLng, MeetingScope } from "../lib/types";

export function CreateMeetingSheet({
  position,
  onClose,
}: {
  position: LatLng;
  onClose: () => void;
}) {
  const { groups, users, selectedUserIds, meetingPoints, user, createMeetingPoint } = useCoordinator();
  const canGlobal = canCreateGlobalMeetingPoint(user);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<MeetingScope>(canGlobal ? "GLOBAL" : "SELECTED");
  const [groupId, setGroupId] = useState("");
  const [pickIds, setPickIds] = useState<string[]>(() =>
    selectedUserIds.filter((id) => id !== user?.id),
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeOptions = useMemo(() => {
    const opts: { value: MeetingScope; label: string }[] = [];
    if (canGlobal) opts.push({ value: "GLOBAL", label: "Všetci" });
    opts.push({ value: "GROUP", label: "Skupina" }, { value: "SELECTED", label: "Vybraní" });
    return opts;
  }, [canGlobal]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => u.id !== user?.id)
      .filter((u) => (q ? u.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name, "sk"));
  }, [users, query, user?.id]);

  const targetIds =
    scope === "GROUP" ? (groupId ? [groupId] : []) : scope === "SELECTED" ? pickIds : [];

  const limitHint = useMemo(() => {
    if (!user) return null;
    return findMeetingLimitConflict(meetingPoints, {
      scope,
      targetIds,
      creatorId: user.id,
    });
  }, [meetingPoints, scope, targetIds, user]);

  const togglePick = (id: string) => {
    setPickIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    const titleError = validateMeetingTitle(title);
    if (titleError) {
      setError(titleError);
      return;
    }
    if (scope === "GLOBAL" && !canGlobal) {
      setError("Bod stretnutia pre všetkých môže vytvoriť len vedúci.");
      return;
    }
    if (scope === "GROUP" && !groupId) {
      setError("Vyber skupinu.");
      return;
    }
    if (scope === "SELECTED" && pickIds.length === 0) {
      setError("Vyber aspoň jedného účastníka.");
      return;
    }
    if (user) {
      const conflict = findMeetingLimitConflict(meetingPoints, {
        scope,
        targetIds,
        creatorId: user.id,
      });
      if (conflict) {
        setError(conflict);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await createMeetingPoint({ title: title.trim(), scope, targetIds, position });
      onClose();
    } catch (e) {
      setError(parseApiErrorMessage(e, "Nepodarilo sa vytvoriť bod."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Nový bod stretnutia" onClose={onClose}>
      <div className="stack">
        <p className="hint">
          Poloha: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </p>
        <div className="field">
          <span className="field__label">Názov</span>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="napr. Zraz pri fontáne"
          />
        </div>
        <div className="field">
          <span className="field__label">Pre koho</span>
          <Segmented<MeetingScope> value={scope} onChange={setScope} options={scopeOptions} />
        </div>
        {scope === "GLOBAL" && (
          <p className="hint">Zvýraznený zraz pre celú akciu – na mape bude výrazne označený.</p>
        )}
        {scope === "GROUP" && (
          <div className="field">
            <span className="field__label">Skupina</span>
            <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— vyber —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {scope === "SELECTED" && (
          <div className="stack">
            <div className="field">
              <span className="field__label">Účastníci ({pickIds.length} vybraných)</span>
              <div
                className="input"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}
              >
                <SearchIcon />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Hľadať podľa mena…"
                  style={{
                    border: "none",
                    outline: "none",
                    flex: 1,
                    padding: "11px 0",
                    background: "transparent",
                    fontSize: 14,
                  }}
                />
              </div>
            </div>
            {pickIds.length > 0 && (
              <button type="button" className="btn btn--sm" onClick={() => setPickIds([])}>
                Zrušiť výber
              </button>
            )}
            <div className="meeting-pick-list">
              {candidates.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  {users.filter((u) => u.id !== user?.id).length === 0
                    ? "Zatiaľ nie sú žiadni iní prihlásení účastníci."
                    : "Nikto nenájdený – skús iné meno."}
                </p>
              ) : (
                candidates.map((u) => {
                  const checked = pickIds.includes(u.id);
                  return (
                    <label key={u.id} className={`meeting-pick-row${checked ? " is-checked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePick(u.id)}
                        aria-label={`Vybrať ${u.name}`}
                      />
                      <Avatar name={u.name} small />
                      <span className="meeting-pick-row__name">
                        {u.name}
                        <RoleBadge role={u.role} />
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
        <p className="hint">
          {canGlobal
            ? "Limit: 1 aktívny zraz pre „Všetci“, 1 na skupinu, 1 pre tvoju výberovku „Vybraní“."
            : "Limit: 1 na skupinu, 1 pre tvoju výberovku „Vybraní“. Zraz pre všetkých môže vytvoriť len vedúci."}
        </p>
        {limitHint && <div className="auth__error">{limitHint}</div>}
        {error && <div className="auth__error">{error}</div>}
        <button
          className="btn btn--primary btn--block"
          onClick={submit}
          disabled={busy || Boolean(limitHint)}
        >
          {busy ? "Vytváram…" : "Vytvoriť bod"}
        </button>
      </div>
    </Sheet>
  );
}
