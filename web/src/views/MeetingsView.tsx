import { useState } from "react";
import { useCoordinator } from "../lib/coordinator";
import { canManageMeetingPoint } from "../lib/meetingPermissions";
import { fromNow } from "../lib/time";
import { Empty } from "../components/ui";
import { PlusIcon } from "../components/icons";
import type { MeetingPoint, MeetingScope } from "../lib/types";

const SCOPE_LABEL: Record<MeetingScope, string> = {
  GLOBAL: "Celá skupina",
  GROUP: "Skupina",
  SELECTED: "Vybraní",
};

function MeetingCard({ meeting }: { meeting: MeetingPoint }) {
  const { user, focusMeeting, requestMeetingMove, cancelMeetingPoint } = useCoordinator();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const canManage = canManageMeetingPoint(user, meeting);

  const handleCancel = async () => {
    setBusy(true);
    try {
      await cancelMeetingPoint(meeting.id);
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h3 className="card__title">📍 {meeting.title}</h3>
          <p className="card__sub">
            {SCOPE_LABEL[meeting.scope]} · vytvorené {fromNow(meeting.createdAt)}
          </p>
        </div>
      </div>
      <div className="stack">
        <button className="btn btn--primary btn--block" onClick={() => focusMeeting(meeting.id)} disabled={busy}>
          Zobraziť trasu na mape
        </button>
        {canManage && (
          <>
            <button
              className="btn btn--block"
              onClick={() => requestMeetingMove(meeting.id)}
              disabled={busy}
            >
              📍 Presunúť na mape
            </button>
            {!confirmCancel ? (
              <button
                className="btn btn--danger btn--block"
                onClick={() => setConfirmCancel(true)}
                disabled={busy}
              >
                Zrušiť bod stretnutia
              </button>
            ) : (
              <div className="stack">
                <p className="hint">Naozaj zrušiť tento zraz?</p>
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
          </>
        )}
      </div>
    </div>
  );
}

export function MeetingsView() {
  const { meetingPoints, requestMeetingPick } = useCoordinator();

  return (
    <div className="page">
      <div className="page__inner">
        <button className="btn btn--primary btn--block" onClick={requestMeetingPick}>
          <PlusIcon /> Nový bod stretnutia na mape
        </button>
        <p className="hint" style={{ textAlign: "center" }}>
          Otvorí sa mapa – klepni na miesto, kde má byť zraz. ETA a trasy sa zobrazia až pre
          označených účastníkov daného zrazu.
        </p>

        {meetingPoints.length === 0 ? (
          <div className="card">
            <Empty icon="📍" title="Žiadne body stretnutia" sub="Vytvor prvý zraz klepnutím na mapu." />
          </div>
        ) : (
          meetingPoints.map((m) => <MeetingCard key={m.id} meeting={m} />)
        )}
      </div>
    </div>
  );
}
