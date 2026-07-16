import { useEffect, useMemo, useState } from "react";
import { useCoordinator } from "../lib/coordinator";
import { canManageMeetingPoint } from "../lib/meetingPermissions";
import { parseApiErrorMessage, validateMeetingTitle } from "../lib/meetingValidation";
import { meetingTargetUsers } from "../lib/meetingTargets";
import { fromNow } from "../lib/time";
import type { MeetingPoint } from "../lib/types";
import { Sheet } from "./ui";

const SCOPE_LABEL = {
  GLOBAL: "Celá skupina",
  GROUP: "Skupina",
  SELECTED: "Vybraní",
} as const;

export function MeetingPointSheet({
  meeting,
  routeSummary,
  routeVisible,
  onClose,
  onToggleRoute,
  onMove,
  onCancel,
}: {
  meeting: MeetingPoint;
  /** Presná trasa z mapy (Directions API), ak je zraz aktívny. */
  routeSummary?: string | null;
  routeVisible: boolean;
  onClose: () => void;
  onToggleRoute: () => void;
  onMove?: () => void;
  onCancel?: () => void;
}) {
  const { users, groups, user, updateMeetingPoint } = useCoordinator();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [titleDraft, setTitleDraft] = useState(meeting.title);
  const [titleMsg, setTitleMsg] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  const canManage = canManageMeetingPoint(user, meeting);

  useEffect(() => {
    setTitleDraft(meeting.title);
    setTitleMsg(null);
    setTitleError(null);
  }, [meeting.id, meeting.title]);

  const targetCount = useMemo(
    () => meetingTargetUsers(meeting, users, groups).length,
    [meeting, users, groups],
  );

  const handleCancel = async () => {
    if (!onCancel) return;
    setBusy(true);
    try {
      await onCancel();
    } finally {
      setBusy(false);
    }
  };

  const saveTitle = async () => {
    const next = titleDraft.trim();
    const titleErrorMsg = validateMeetingTitle(next);
    if (titleErrorMsg) {
      setTitleError(titleErrorMsg);
      return;
    }
    if (next === meeting.title) {
      setTitleMsg("Bez zmeny.");
      return;
    }
    setBusy(true);
    setTitleError(null);
    setTitleMsg(null);
    try {
      await updateMeetingPoint(meeting.id, { title: next });
      setTitleMsg("Názov uložený.");
    } catch (e) {
      setTitleError(parseApiErrorMessage(e, "Uloženie zlyhalo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={canManage ? "Upraviť bod stretnutia" : meeting.title} onClose={onClose}>
      <div className="stack">
        {canManage ? (
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>
              Klepni na 📍 na mape kedykoľvek pre úpravu tohto zrazu.
            </p>
            <div className="field">
              <span className="field__label">Názov</span>
              <input
                className="input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="Názov zrazu"
                disabled={busy}
              />
            </div>
            {titleError && <div className="auth__error">{titleError}</div>}
            {titleMsg && <p className="hint">{titleMsg}</p>}
            <div className="row">
              <button className="btn grow" onClick={saveTitle} disabled={busy}>
                {busy ? "Ukladám…" : "Uložiť názov"}
              </button>
              {onMove && (
                <button className="btn btn--primary grow" onClick={onMove} disabled={busy}>
                  Presunúť
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="hint">
            {SCOPE_LABEL[meeting.scope]} · vytvorené {fromNow(meeting.createdAt)}
          </p>
        )}

        {canManage && (
          <p className="hint">
            {SCOPE_LABEL[meeting.scope]} · {targetCount}{" "}
            {targetCount === 1 ? "účastník" : targetCount < 5 ? "účastníci" : "účastníkov"} ·
            vytvorené {fromNow(meeting.createdAt)} · {meeting.latitude.toFixed(5)},{" "}
            {meeting.longitude.toFixed(5)}
          </p>
        )}

        {routeSummary && (
          <div className="map-route-sheet-summary">
            <span className="map-route-sheet-summary__label">Tvoja trasa na mape</span>
            <span className="map-route-sheet-summary__value">{routeSummary}</span>
          </div>
        )}

        <button className="btn btn--primary btn--block" onClick={onToggleRoute}>
          {routeVisible ? "Skryť trasu na mape" : "Zobraziť trasu na mape"}
        </button>
        <p className="hint">
          Na mape uvidíš svoju trasu. Trasy ostatných (online členov) zobrazíš klepnutím na ich šípku
          → „Zobraziť trasu k zrazu“.
        </p>
        <a
          className="btn btn--block"
          href={`https://www.google.com/maps/dir/?api=1&destination=${meeting.latitude},${meeting.longitude}`}
          target="_blank"
          rel="noreferrer"
        >
          Otvoriť v Google Maps
        </a>
        {canManage && onCancel && !confirmCancel && (
          <button className="btn btn--danger btn--block" onClick={() => setConfirmCancel(true)} disabled={busy}>
            Zrušiť bod stretnutia
          </button>
        )}
        {canManage && onCancel && confirmCancel && (
          <div className="stack">
            <p className="hint">Naozaj zrušiť tento zraz? Všetci ho už neuvidia.</p>
            <div className="row">
              <button className="btn grow" onClick={() => setConfirmCancel(false)} disabled={busy}>
                Nie
              </button>
              <button className="btn btn--danger grow" onClick={handleCancel} disabled={busy}>
                {busy ? "Ruším…" : "Áno, zrušiť"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
