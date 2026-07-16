import { useMemo, useState } from "react";
import { useCoordinator } from "../lib/coordinator";
import { Avatar, Empty, Sheet } from "../components/ui";
import { PlusIcon } from "../components/icons";
import type { Group } from "../lib/types";

export function GroupsView() {
  const { groups, users, user, createGroup, addMember, removeMember, openPing } = useCoordinator();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState<Group | null>(null);

  const userName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) map[u.id] = u.name;
    return map;
  }, [users]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createGroup(name.trim());
      setName("");
    } finally {
      setBusy(false);
    }
  };

  const nonMembers = (g: Group) =>
    users.filter((u) => !(g.memberships ?? []).some((m) => m.userId === u.id));

  return (
    <div className="page">
      <div className="page__inner">
        <div className="card">
          <div className="card__head">
            <div>
              <h3 className="card__title">Nová skupina</h3>
              <p className="card__sub">Vytvor podskupinu (napr. „Autobus 1“, „Vedúci“).</p>
            </div>
          </div>
          <div className="row">
            <input
              className="input grow"
              value={name}
              placeholder="Názov skupiny"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button className="btn btn--primary" onClick={create} disabled={busy}>
              <PlusIcon /> Vytvoriť
            </button>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="card">
            <Empty icon="🧭" title="Zatiaľ žiadne skupiny" sub="Vytvor prvú skupinu vyššie." />
          </div>
        ) : (
          groups.map((g) => {
            const members = g.memberships ?? [];
            return (
              <div className="card" key={g.id}>
                <div className="card__head">
                  <div>
                    <h3 className="card__title">{g.name}</h3>
                    <p className="card__sub">{members.length} členov</p>
                  </div>
                  <div className="row">
                    <button
                      className="btn btn--sm"
                      onClick={() =>
                        openPing({
                          scope: "GROUP",
                          targetIds: [g.id],
                          label: g.name,
                        })
                      }
                    >
                      Ping
                    </button>
                    <button className="btn btn--sm btn--ghost" onClick={() => setManage(g)}>
                      Spravovať
                    </button>
                  </div>
                </div>
                <div className="row row--wrap">
                  {members.slice(0, 8).map((m) => (
                    <span key={m.id} className="badge">
                      {userName[m.userId] ?? "?"}
                    </span>
                  ))}
                  {members.length === 0 && <span className="hint">Žiadni členovia.</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {manage && (
        <Sheet title={manage.name} onClose={() => setManage(null)}>
          <div className="stack">
            <div>
              <p className="section-title">Členovia</p>
              <div className="list">
                {(manage.memberships ?? []).length === 0 && (
                  <p className="hint">Skupina je zatiaľ prázdna.</p>
                )}
                {(manage.memberships ?? []).map((m) => (
                  <div className="list-row" key={m.id}>
                    <Avatar name={userName[m.userId] ?? "?"} small />
                    <div className="list-row__main">
                      <div className="list-row__title">
                        {userName[m.userId] ?? "?"}
                        {m.userId === user?.id && <span className="badge">ja</span>}
                      </div>
                    </div>
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={async () => {
                        await removeMember(manage.id, m.userId);
                        setManage((prev) =>
                          prev
                            ? {
                                ...prev,
                                memberships: (prev.memberships ?? []).filter((x) => x.userId !== m.userId),
                              }
                            : prev,
                        );
                      }}
                    >
                      Odobrať
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="section-title">Pridať člena</p>
              <div className="list">
                {nonMembers(manage).length === 0 && <p className="hint">Všetci sú už v skupine.</p>}
                {nonMembers(manage).map((u) => (
                  <div className="list-row" key={u.id}>
                    <Avatar name={u.name} small />
                    <div className="list-row__main">
                      <div className="list-row__title">{u.name}</div>
                    </div>
                    <button
                      className="btn btn--sm btn--primary"
                      onClick={async () => {
                        await addMember(manage.id, u.id);
                        setManage((prev) =>
                          prev
                            ? {
                                ...prev,
                                memberships: [
                                  ...(prev.memberships ?? []),
                                  { id: `${prev.id}-${u.id}`, userId: u.id, groupId: prev.id },
                                ],
                              }
                            : prev,
                        );
                      }}
                    >
                      Pridať
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
