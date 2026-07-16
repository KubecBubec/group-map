import { useMemo, useState } from "react";
import { useCoordinator } from "../lib/coordinator";
import { tapClass, useTapPulse } from "../lib/tapFeedback";
import { fromNow } from "../lib/time";
import { Avatar, Empty, RoleBadge, StatusDot } from "../components/ui";
import { SearchIcon } from "../components/icons";

export function MembersView() {
  const {
    users,
    groups,
    locationByUser,
    user,
    selectedUserIds,
    toggleSelect,
    isSelected,
    clearSelection,
    focusUser,
    openPing,
  } = useCoordinator();
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState<string>("ALL");
  const { pulse, isPulsing } = useTapPulse();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => (q ? u.name.toLowerCase().includes(q) : true))
      .filter((u) =>
        groupId === "ALL" ? true : (u.memberships ?? []).some((m) => m.groupId === groupId),
      )
      .sort((a, b) => {
        const sa = locationByUser[a.id]?.status === "online" ? 0 : 1;
        const sb = locationByUser[b.id]?.status === "online" ? 0 : 1;
        return sa - sb || a.name.localeCompare(b.name);
      });
  }, [users, query, groupId, locationByUser]);

  return (
    <div className="page">
      <div className="page__inner">
        <div className="field">
          <div className="input" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hľadať účastníka podľa mena…"
              style={{ border: "none", outline: "none", flex: 1, padding: "11px 0", background: "transparent", fontSize: 14 }}
            />
          </div>
        </div>

        <div className="chips">
          <button className={`chip${groupId === "ALL" ? " is-active" : ""}`} onClick={() => setGroupId("ALL")}>
            Všetci
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              className={`chip${groupId === g.id ? " is-active" : ""}`}
              onClick={() => setGroupId(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>

        {selectedUserIds.length > 0 && (
          <div className="card" style={{ padding: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{selectedUserIds.length} vybraných</strong>
              <div className="row">
                <button className="btn btn--sm" onClick={clearSelection}>
                  Zrušiť
                </button>
                <button
                  className="btn btn--sm btn--primary"
                  onClick={() =>
                    openPing({ scope: "SELECTED", targetIds: selectedUserIds, label: "vybraní" })
                  }
                >
                  Pingnúť vybraných
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          {filtered.length === 0 ? (
            <Empty icon="🔍" title="Nikto nenájdený" sub="Skús iné meno alebo skupinu." />
          ) : (
            <div className="list">
              {filtered.map((u) => {
                const loc = locationByUser[u.id];
                const me = u.id === user?.id;
                return (
                  <div
                    className={tapClass(isPulsing(u.id), "list-row list-row--tappable")}
                    key={u.id}
                    onClick={() => {
                      pulse(u.id);
                      if (loc) focusUser(u.id);
                    }}
                  >
                    <label
                      style={{ display: "flex", alignItems: "center" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        style={{ width: 18, height: 18 }}
                        aria-label={`Vybrať ${u.name}`}
                      />
                    </label>
                    <Avatar name={u.name} />
                    <div className="list-row__main">
                      <div className="list-row__title">
                        {u.name}
                        {me && <span className="badge">ja</span>}
                        <RoleBadge role={u.role} />
                      </div>
                      <div className="list-row__sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <StatusDot status={loc?.status} />
                        {loc
                          ? `${loc.status === "online" ? "Online" : "Naposledy"} · ${fromNow(loc.updatedAt)}`
                          : "Bez polohy"}
                      </div>
                    </div>
                    <div className="list-row__actions" onClick={(e) => e.stopPropagation()}>
                      {loc && (
                        <button
                          className="btn btn--sm"
                          onClick={() => {
                            pulse(u.id);
                            focusUser(u.id);
                          }}
                        >
                          Mapa
                        </button>
                      )}
                      {!me && (
                        <button
                          className="btn btn--sm btn--ghost"
                          onClick={() => openPing({ scope: "USER", targetIds: [u.id], label: u.name })}
                        >
                          Ping
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
