import { tapClass, useTapPulse } from "../lib/tapFeedback";
import { fromNow } from "../lib/time";
import type { LocationRow } from "../lib/types";
import { Avatar, RoleBadge, Sheet, StatusDot } from "./ui";

export function LocationClusterSheet({
  members,
  onClose,
  onSelect,
}: {
  members: LocationRow[];
  onClose: () => void;
  onSelect: (loc: LocationRow) => void;
}) {
  const { pulse, isPulsing } = useTapPulse();

  return (
    <Sheet title={`Na tomto mieste (${members.length})`} onClose={onClose}>
      <p className="hint" style={{ marginBottom: 12 }}>
        Viac členov zdieľa rovnakú polohu. Vyber konkrétneho účastníka.
      </p>
      <div className="list">
        {members.map((loc) => (
          <div
            key={loc.userId}
            className={tapClass(isPulsing(loc.userId), "list-row list-row--tappable")}
            onClick={() => {
              pulse(loc.userId);
              onSelect(loc);
            }}
          >
            <Avatar name={loc.user.name} />
            <div className="list-row__main">
              <div className="list-row__title">
                {loc.user.name}
                <RoleBadge role={loc.user.role} />
              </div>
              <div className="list-row__sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <StatusDot status={loc.status} />
                {loc.status === "online" ? "Online" : "Posledná poloha"} · {fromNow(loc.updatedAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
