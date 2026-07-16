import { useMemo, useState } from "react";
import { useCoordinator } from "../lib/coordinator";
import { findMeetingLimitConflict, parseApiErrorMessage } from "../lib/meetingLimits";
import { canCreateGlobalMeetingPoint } from "../lib/meetingPermissions";
import { validateMeetingTitle } from "../lib/meetingValidation";
import { Segmented, Sheet } from "./ui";
import type { LatLng, MeetingScope } from "../lib/types";

export function CreateMeetingSheet({
  position,
  onClose,
}: {
  position: LatLng;
  onClose: () => void;
}) {
  const { groups, selectedUserIds, meetingPoints, user, createMeetingPoint } = useCoordinator();
  const canGlobal = canCreateGlobalMeetingPoint(user);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<MeetingScope>(canGlobal ? "GLOBAL" : "SELECTED");
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeOptions = useMemo(() => {
    const opts: { value: MeetingScope; label: string }[] = [];
    if (canGlobal) opts.push({ value: "GLOBAL", label: "Všetci" });
    opts.push({ value: "GROUP", label: "Skupina" }, { value: "SELECTED", label: "Vybraní" });
    return opts;
  }, [canGlobal]);

  const targetIds =
    scope === "GROUP" ? (groupId ? [groupId] : []) : scope === "SELECTED" ? selectedUserIds : [];

  const limitHint = useMemo(() => {
    if (!user) return null;
    return findMeetingLimitConflict(meetingPoints, {
      scope,
      targetIds,
      creatorId: user.id,
    });
  }, [meetingPoints, scope, targetIds, user]);

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
    const targetIds =
      scope === "GROUP" ? (groupId ? [groupId] : []) : scope === "SELECTED" ? selectedUserIds : [];
    if (scope === "GROUP" && !groupId) {
      setError("Vyber skupinu.");
      return;
    }
    if (scope === "SELECTED" && selectedUserIds.length === 0) {
      setError("Vyber aspoň jedného účastníka v karte Členovia.");
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
          <p className="hint">Vybraní účastníci z karty Členovia ({selectedUserIds.length}).</p>
        )}
        <p className="hint">
          {canGlobal
            ? "Limit: 1 aktívny zraz pre „Všetci“, 1 na skupinu, 1 pre tvoju výberovku „Vybraní“."
            : "Limit: 1 na skupinu, 1 pre tvoju výberovku „Vybraní“. Zraz pre všetkých môže vytvoriť len vedúci."}
        </p>
        {limitHint && <div className="auth__error">{limitHint}</div>}
        {error && <div className="auth__error">{error}</div>}
        <button className="btn btn--primary btn--block" onClick={submit} disabled={busy || Boolean(limitHint)}>
          {busy ? "Vytváram…" : "Vytvoriť bod"}
        </button>
      </div>
    </Sheet>
  );
}
