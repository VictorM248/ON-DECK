import { useEffect, useState, useCallback } from "react";

type JoinType = "walk-in" | "appointment";

type Entry = {
  id: string;
  firstName: string;
  lastName: string;
  note: string;
  joinedAt?: number;
  serviceStart?: number;
  joinType?: JoinType;
  managers?: string[]; // helpers / managers involved
  teamLabel?: string; // team working the guest (e.g. "John Doe & Jane Doe")
};

type Manager = {
  id: string;
  name: string;
};

type QueueProps = {
  role: "Sales" | "Admin";
  onAddSavedName?: (firstName: string, lastName: string) => void;
  registerAddHandler?: (
    fn: (firstName: string, lastName: string, note: string) => void
  ) => void;
  onOpenAddModal?: () => void;
};

export default function Queue({
  role,
  onAddSavedName,
  registerAddHandler,
}: QueueProps) {
  // waiting queue
  const [queue, setQueue] = useState<Entry[]>(() => {
    const raw = JSON.parse(localStorage.getItem("queue") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any): Entry => ({
      id: item.id ?? crypto.randomUUID(),
      firstName: item.firstName ?? "",
      lastName: item.lastName ?? "",
      note: item.note ?? "",
      joinedAt: item.joinedAt,
      serviceStart: item.serviceStart,
      joinType: item.joinType as JoinType | undefined,
      managers: Array.isArray(item.managers) ? item.managers : undefined,
      teamLabel: item.teamLabel ?? undefined,
    }));
  });

  // active (with customers)
  const [active, setActive] = useState<Entry[]>(() => {
    const raw = JSON.parse(localStorage.getItem("active") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any): Entry => ({
      id: item.id ?? crypto.randomUUID(),
      firstName: item.firstName ?? "",
      lastName: item.lastName ?? "",
      note: item.note ?? "",
      joinedAt: item.joinedAt,
      serviceStart: item.serviceStart,
      joinType: item.joinType as JoinType | undefined,
      managers: Array.isArray(item.managers) ? item.managers : undefined,
      teamLabel: item.teamLabel ?? undefined,
    }));
  });

  // completed list (Admin tab)
  const [completed, setCompleted] = useState<Entry[]>(() => {
    const raw = JSON.parse(localStorage.getItem("completed") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any): Entry => ({
      id: item.id ?? crypto.randomUUID(),
      firstName: item.firstName ?? "",
      lastName: item.lastName ?? "",
      note: item.note ?? "",
      joinedAt: item.joinedAt,
      serviceStart: item.serviceStart,
      joinType: item.joinType as JoinType | undefined,
      managers: Array.isArray(item.managers) ? item.managers : undefined,
      teamLabel: item.teamLabel ?? undefined,
    }));
  });

  // saved helpers/managers
  const [savedManagers, setSavedManagers] = useState<Manager[]>(() => {
    const raw = JSON.parse(localStorage.getItem("savedManagers") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((m: any) => ({
      id: m.id ?? crypto.randomUUID(),
      name: m.name ?? "",
    }));
  });

  // tab for right side
  const [activeTab, setActiveTab] = useState<"with" | "done">("with");

  // Sales cannot sit on "done" tab
  useEffect(() => {
    if (role !== "Admin" && activeTab === "done") {
      setActiveTab("with");
    }
  }, [role, activeTab]);

  // timer tick for durations
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // modals
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null); // queue -> active
  const [doneActiveId, setDoneActiveId] = useState<string | null>(null); // active -> queue
  const [completeEntryId, setCompleteEntryId] = useState<string | null>(null); // active -> completed

  // team modal (active card click)
  const [teamEntryId, setTeamEntryId] = useState<string | null>(null);
  const [teamLabelInput, setTeamLabelInput] = useState("");

  // where to send rep back in queue after completion
  const [returnPosition, setReturnPosition] = useState<"top" | "bottom">(
    "bottom"
  );

  // shared helper selection state
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [newManagerName, setNewManagerName] = useState("");

  // persist lists
  useEffect(() => {
    localStorage.setItem("queue", JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    localStorage.setItem("active", JSON.stringify(active));
  }, [active]);

  useEffect(() => {
    localStorage.setItem("completed", JSON.stringify(completed));
  }, [completed]);

  useEffect(() => {
    localStorage.setItem("savedManagers", JSON.stringify(savedManagers));
  }, [savedManagers]);

  const initials = (e: Entry) =>
    `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase();

  // For overlapping avatar bubbles when a team is set
  const avatarInitialsList = (e: Entry): string[] => {
    // If no team, just return this guest's initials
    if (!e.teamLabel) {
      return [
        `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase(),
      ];
    }

    // Example teamLabel: "John Doe & Jane Doe"
    const parts = e.teamLabel
      .split("&")
      .map((p) => p.trim())
      .filter(Boolean);

    const codes: string[] = [];

    for (let i = 0; i < Math.min(parts.length, 2); i++) {
      const words = parts[i].split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;

      const first = words[0][0] ?? "";
      const last = words.length > 1 ? words[words.length - 1][0] ?? "" : "";
      const code = (first + last).toUpperCase(); // "JD"

      if (code) codes.push(code);
    }

    if (codes.length === 0) {
      return [
        `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase(),
      ];
    }

    return codes.slice(0, 2); // max 2 bubbles
  };

  const formatJoined = (ts?: number) =>
    ts
      ? new Date(ts).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";

  const formatSince = (start?: number) => {
    if (!start) return "0m 00s";
    const diff = Math.floor((now - start) / 1000);
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  //walk-in / appointment badge
  const joinBadge = (e: Entry) => {
    if (!e.joinType) return null;
    const isAppt = e.joinType === "appointment";

    return (
      <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-100 shadow-sm">
        <span className="text-base">{isAppt ? "📅" : "🚶"}</span>
        <span className="font-medium">
          {isAppt ? "Appointment" : "Walk-in"}
        </span>
      </span>
    );
  };

  // Add from main / Add Guest modal
  const addFromModal = useCallback(
    (firstName: string, lastName: string, note: string) => {
      const fn = firstName.trim();
      const ln = lastName.trim();
      const nt = note.trim();

      if (!fn) return;

      setQueue((q) => [
        ...q,
        {
          id: crypto.randomUUID(),
          firstName: fn,
          lastName: ln,
          note: nt,
          joinedAt: Date.now(),
        },
      ]);

      onAddSavedName?.(fn, ln);
    },
    [onAddSavedName]
  );

  // expose add handler back to App
  useEffect(() => {
    registerAddHandler?.(addFromModal);
  }, [registerAddHandler, addFromModal]);

  const removeFromQueue = (id: string) =>
    setQueue((q) => q.filter((e) => e.id !== id));

  const clearQueue = () => {
    if (window.confirm("Clear the entire queue?")) setQueue([]);
  };

  // queue -> active type modal
  const openJoinTypeModal = (entryId: string) => {
    setSelectedEntryId(entryId);
  };

  const confirmMoveWithType = (type: JoinType) => {
    if (!selectedEntryId) return;

    const entry = queue.find((e) => e.id === selectedEntryId);
    if (!entry) {
      setSelectedEntryId(null);
      return;
    }

    setQueue((q) => q.filter((e) => e.id !== selectedEntryId));
    setActive((a) => [
      ...a,
      {
        ...entry,
        joinType: type,
        serviceStart: Date.now(),
      },
    ]);

    setSelectedEntryId(null);
  };

  // open "Done" modal (active -> queue, WITHOUT logging sale)
  const openDoneModal = (entryId: string) => {
    setDoneActiveId(entryId);

    const entry = active.find((e) => e.id === entryId);
    if (entry && entry.managers && entry.managers.length > 0) {
      const ids = savedManagers
        .filter((m) => entry.managers!.includes(m.name))
        .map((m) => m.id);
      setSelectedManagerIds(ids);
    } else {
      setSelectedManagerIds([]);
    }
    setNewManagerName("");
  };

  // open manager log modal (active -> completed)
  const openCompleteModal = (entryId: string) => {
    setCompleteEntryId(entryId);
    setSelectedManagerIds([]);
    setNewManagerName("");
    setReturnPosition("bottom"); // default choice
  };

  const closeCompleteModal = () => {
    setCompleteEntryId(null);
    setSelectedManagerIds([]);
    setNewManagerName("");
    setReturnPosition("bottom");
  };

  // team modal open/close + save
  const openTeamModal = (entryId: string) => {
    setTeamEntryId(entryId);
    const entry = active.find((e) => e.id === entryId);
    setTeamLabelInput(entry?.teamLabel ?? "");
  };

  const closeTeamModal = () => {
    setTeamEntryId(null);
    setTeamLabelInput("");
  };

  const saveTeamLabel = () => {
    if (!teamEntryId) return;

    setActive((a) =>
      a.map((e) =>
        e.id === teamEntryId
          ? { ...e, teamLabel: teamLabelInput.trim() || undefined }
          : e
      )
    );

    closeTeamModal();
  };

  // toggle helper selection (max 3)
  const toggleManagerSelection = (id: string) => {
    setSelectedManagerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  // confirm visit complete -> Completed tab + requeue at top/bottom
  const handleConfirmComplete = () => {
    if (!completeEntryId) return;

    const entry = active.find((e) => e.id === completeEntryId);
    if (!entry) {
      closeCompleteModal();
      return;
    }

    // managers/helpers selected
    let managersList = savedManagers
      .filter((m) => selectedManagerIds.includes(m.id))
      .map((m) => m.name);

    const nm = newManagerName.trim();

    if (nm) {
      const existing = savedManagers.find(
        (m) => m.name.toLowerCase() === nm.toLowerCase()
      );

      if (!existing) {
        const newMgr: Manager = { id: crypto.randomUUID(), name: nm };
        setSavedManagers((prev) => [...prev, newMgr]);
        managersList.push(newMgr.name);
      } else if (!managersList.includes(existing.name)) {
        managersList.push(existing.name);
      }
    }

    if (managersList.length > 3) managersList = managersList.slice(0, 3);

    // entry saved to Completed tab with managers
    const completedEntry: Entry = {
      ...entry,
      managers: managersList,
    };

    // new, cleaned entry back into the queue (top or bottom)
    const requeuedEntry: Entry = {
      id: crypto.randomUUID(), // treat as a new turn in line
      firstName: entry.firstName,
      lastName: entry.lastName,
      note: "", // or entry.note if you want to carry it forward
      joinedAt: Date.now(),
      serviceStart: undefined,
      joinType: undefined,
      managers: undefined,
      teamLabel: undefined,
    };

    setActive((a) => a.filter((e) => e.id !== completeEntryId));
    setCompleted((c) => [...c, completedEntry]);
    setQueue((q) =>
      returnPosition === "top" ? [requeuedEntry, ...q] : [...q, requeuedEntry]
    );

    closeCompleteModal();
  };

  // REMOVE completed entry
  const removeCompletedEntry = (id: string) => {
    setCompleted((c) => c.filter((e) => e.id !== id));
  };

  // active -> queue (uses helpers too) WITHOUT logging sale
  const moveActiveBackToQueue = (position: "top" | "bottom") => {
    if (!doneActiveId) return;

    const entry = active.find((e) => e.id === doneActiveId);
    if (!entry) {
      setDoneActiveId(null);
      return;
    }

    // helpers list from selection + optional new name
    let helpers = savedManagers
      .filter((m) => selectedManagerIds.includes(m.id))
      .map((m) => m.name);

    const nm = newManagerName.trim();
    if (nm) {
      const existing = savedManagers.find(
        (m) => m.name.toLowerCase() === nm.toLowerCase()
      );

      if (!existing) {
        const newHelper: Manager = { id: crypto.randomUUID(), name: nm };
        setSavedManagers((prev) => [...prev, newHelper]);
        helpers.push(newHelper.name);
      } else if (!helpers.includes(existing.name)) {
        helpers.push(existing.name);
      }
    }

    if (helpers.length > 3) helpers = helpers.slice(0, 3);

    const cleaned: Entry = {
      ...entry,
      serviceStart: undefined,
      managers: helpers.length > 0 ? helpers : entry.managers,
    };

    setActive((a) => a.filter((e) => e.id !== doneActiveId));
    setQueue((q) =>
      position === "top" ? [cleaned, ...q] : [...q, cleaned]
    );

    setDoneActiveId(null);
    setSelectedManagerIds([]);
    setNewManagerName("");
  };

  return (
    <>
      {/* MODAL: queue -> active (walk-in / appt) */}
      {selectedEntryId && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedEntryId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >

            <h2 className="text-lg font-semibold mb-2 text-slate-100">
              How is this guest being served?
            </h2>

            {(() => {
              const e = queue.find((q) => q.id === selectedEntryId);
              return (
                <p className="text-sm text-slate-300 mb-4">
                  {e ? `${e.firstName} ${e.lastName}` : "Selected guest"}
                </p>
              );
            })()}

            <div className="flex flex-col gap-3">
              <button
                onClick={() => confirmMoveWithType("walk-in")}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
              >
                <span className="text-base">🚶</span>
                <span className="font-medium">Walk-in</span>
              </button>

              <button
                onClick={() => confirmMoveWithType("appointment")}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
              >
                <span className="text-base">📅</span>
                <span className="font-medium">Appointment</span>
              </button>
            </div>

            <button
              onClick={() => setSelectedEntryId(null)}
              className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MODAL: active -> queue (Done / helpers) WITHOUT logging sale */}
      {doneActiveId && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
          onClick={() => {
            setDoneActiveId(null);
            setSelectedManagerIds([]);
            setNewManagerName("");
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >

            <h2 className="text-lg font-semibold mb-2 text-slate-100">
              Move back to queue?
            </h2>

            {(() => {
              const e = active.find((a) => a.id === doneActiveId);
              return (
                <p className="text-sm text-slate-300 mb-4">
                  {e ? `${e.firstName} ${e.lastName}` : "Selected guest"}
                </p>
              );
            })()}

            {(() => {
              const e = active.find((a) => a.id === doneActiveId);
              if (!e) return null;

              const canSendTop =
                e.serviceStart ? now - e.serviceStart < 2 * 60 * 1000 : true;

              return (
                <div className="flex flex-col gap-4">
                  {/* queue position */}
                  <div className="flex flex-col gap-3">
                    {canSendTop && (
                      <button
                        onClick={() => moveActiveBackToQueue("top")}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
                      >
                        Send to <span className="font-semibold">top</span> of
                        queue
                      </button>
                    )}

                    <button
                      onClick={() => moveActiveBackToQueue("bottom")}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
                    >
                      Send to <span className="font-semibold">bottom</span> of
                      queue
                    </button>
                  </div>

                  {/* helpers section */}
                  <div className="mt-2">
                    <p className="text-xs text-slate-400 mb-1">
                      Who helped you with this visit? (optional)
                    </p>

                    {savedManagers.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {savedManagers.map((m) => {
                          const selected = selectedManagerIds.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleManagerSelection(m.id)}
                              className={`rounded-full border px-3 py-1 text-xs ${
                                selected
                                  ? "bg-blue-600 border-blue-500 text-white"
                                  : "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                              }`}
                            >
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 mb-2">
                        No helpers saved yet. You can add one below.
                      </p>
                    )}

                    <input
                      value={newManagerName}
                      onChange={(e) => setNewManagerName(e.target.value)}
                      placeholder="Add another helper (name)"
                      className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              );
            })()}

            <button
              onClick={() => {
                setDoneActiveId(null);
                setSelectedManagerIds([]);
                setNewManagerName("");
              }}
              className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MODAL: visit complete / managers -> Completed + queue position */}
      {completeEntryId && (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
        onClick={closeCompleteModal}
      >
        <div
          className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >

            <h2 className="text-lg font-semibold mb-2 text-slate-100">
              Log visit & managers
            </h2>

            {(() => {
              const e = active.find((a) => a.id === completeEntryId);
              if (!e) {
                return (
                  <p className="text-sm text-slate-300 mb-4">
                    Selected guest
                  </p>
                );
              }

              const canSendTop =
                e.serviceStart ? now - e.serviceStart < 2 * 60 * 1000 : true;

              return (
                <>
                  <p className="text-sm text-slate-300 mb-4">
                    {e.firstName} {e.lastName}
                  </p>

                  {/* Queue position selection */}
                  <div className="mb-4">
                    <p className="text-xs text-slate-400 mb-1">
                      After this visit is logged, where should they go in the
                      queue?
                    </p>
                    <div className="flex flex-col gap-2">
                      {canSendTop && (
                        <button
                          type="button"
                          onClick={() => setReturnPosition("top")}
                          className={`rounded-xl border px-4 py-2 text-left text-sm ${
                            returnPosition === "top"
                              ? "bg-slate-800 border-blue-500 text-slate-100"
                              : "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                          }`}
                        >
                          Send to <span className="font-semibold">top</span> of
                          queue
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setReturnPosition("bottom")}
                        className={`rounded-xl border px-4 py-2 text-left text-sm ${
                          returnPosition === "bottom"
                            ? "bg-slate-800 border-blue-500 text-slate-100"
                            : "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        Send to <span className="font-semibold">bottom</span> of
                        queue
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Managers selection */}
            {savedManagers.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-slate-400">
                  Who helped you with this visit? (optional, up to 3)
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {savedManagers.map((m) => {
                    const selected = selectedManagerIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleManagerSelection(m.id)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          selected
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                        }`}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="text-xs text-slate-400 mb-1">
                Add another manager (optional):
              </p>
              <input
                value={newManagerName}
                onChange={(e) => setNewManagerName(e.target.value)}
                placeholder="Manager name"
                className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={closeCompleteModal}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmComplete}
                className="flex-1 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
              >
                Save visit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Team for active card */}
      {teamEntryId && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
          onClick={closeTeamModal}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >


            <h2 className="text-lg font-semibold mb-2 text-slate-100">
              Set team for this visit
            </h2>

            {(() => {
              const entry = active.find((a) => a.id === teamEntryId);
              if (!entry) {
                return (
                  <p className="text-sm text-slate-300 mb-4">
                    Selected guest
                  </p>
                );
              }

              const teammates = queue; // reps currently in queue

              return (
                <>
                  <p className="text-sm text-slate-300 mb-4">
                    {entry.firstName} {entry.lastName}
                  </p>

                  {/* Free-text team label */}
                  <div className="mb-4">
                    <p className="text-xs text-slate-400 mb-1">
                      Who is working this guest? (optional)
                    </p>
                    <input
                      value={teamLabelInput}
                      onChange={(e) => setTeamLabelInput(e.target.value)}
                      placeholder='e.g. "John Doe & Jane Doe"'
                      className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Quick-pick from current queue */}
                  {teammates.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-slate-400 mb-2">
                        Or tap a teammate from the queue:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {teammates.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              const label = `${entry.firstName} ${entry.lastName} & ${t.firstName} ${t.lastName}`;
                              setTeamLabelInput(label);
                            }}
                            className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-100 hover:bg-slate-700"
                          >
                            {t.firstName} {t.lastName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="flex gap-2">
              <button
                onClick={closeTeamModal}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={saveTeamLabel}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Save team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="w-full flex flex-col lg:flex-row gap-10 mt-3">
        {/* LEFT — QUEUE */}
        <div className="w-full lg:w-1/3 space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-lg">
            <div className="px-3 py-2 flex items-center justify-between text-sm font-semibold text-slate-200">
              <span>In Queue ({queue.length} waiting)</span>

              <div className="flex gap-2">
                {role === "Admin" && (
                  <button
                    onClick={clearQueue}
                    className="text-xs text-red-400 hover:text-red-300 disabled:text-slate-500"
                    disabled={queue.length === 0}
                  >
                    Clear queue
                  </button>
                )}
              </div>
            </div>

            {queue.map((e, i) => (
              <div
                key={e.id}
                className="flex items-center justify-between border-t border-slate-800 px-4 py-3 cursor-pointer hover:bg-slate-800"
                onClick={() => openJoinTypeModal(e.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-white text-xs font-semibold">
                    {initials(e)}
                  </div>

                  <div>
                    <div className="font-medium text-slate-100">
                      {i + 1}. {e.firstName} {e.lastName}
                    </div>

                    {e.note && (
                      <div className="text-xs text-slate-300 italic">
                        {e.note}
                      </div>
                    )}

                    {e.joinedAt && (
                      <div className="text-[11px] text-slate-400">
                        Joined at {formatJoined(e.joinedAt)}
                      </div>
                    )}
                  </div>
                </div>

                {role === "Admin" && (
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      removeFromQueue(e.id);
                    }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — ACTIVE + COMPLETED */}
        <div className="w-full lg:w-2/3 space-y-6">
          {/* HEADER WITH TABS (ADMIN ONLY) */}
          <div className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 bg-slate-900 shadow-lg">
            {role === "Admin" ? (
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("with")}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                      activeTab === "with"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    With customers
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("done")}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                      activeTab === "done"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Completed
                  </button>
                </div>

                <div className="text-xs text-slate-400">
                  {activeTab === "with"
                    ? `With customers (${active.length})`
                    : `Completed (${completed.length})`}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-200">
                  With customers ({active.length})
                </span>
              </div>
            )}
          </div>

          {/* LIST AREA */}
          {role === "Admin" && activeTab === "done"
            ? completed.map((e) => (
                <div
                  key={e.id}
                  className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg"
                >
                  <div className="flex items-start gap-4 justify-between">
                    {/* Initials (overlapping if team) */}
                    <div className="flex -space-x-2">
                      {avatarInitialsList(e).map((ini, idx) => (
                        <div
                          key={idx}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-white text-xs font-semibold border border-slate-900"
                        >
                          {ini}
                        </div>
                      ))}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className="text-2xl font-semibold text-slate-100">
                        {e.teamLabel
                          ? e.teamLabel
                          : `${e.firstName} ${e.lastName}`}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-slate-300">
                          Customer visit completed
                        </span>
                        {joinBadge(e)}
                      </div>

                      {e.note && (
                        <div className="text-sm text-slate-200 italic mt-1">
                          {e.note}
                        </div>
                      )}

                      {e.managers && (
                        <div className="text-xs text-slate-300 mt-1">
                          Managers:{" "}
                          <span className="font-medium">
                            {e.managers.join(", ")}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeCompletedEntry(e.id)}
                      className="text-xs text-red-400 hover:text-red-300 ml-3"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            : active.map((e) => {
                const minutes = e.serviceStart
                  ? Math.floor((now - e.serviceStart) / 60000)
                  : 0;

                return (
                  <div
                    key={e.id}
                    className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg cursor-pointer"
                    onClick={() => openTeamModal(e.id)}
                  >
                    <div className="flex items-center gap-4">
                      {/* Initials (overlapping if team) */}
                      <div className="flex -space-x-2">
                        {avatarInitialsList(e).map((ini, idx) => (
                          <div
                            key={idx}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-white text-xs font-semibold border border-slate-900"
                          >
                            {ini}
                          </div>
                        ))}
                      </div>

                      {/* Info */}
                      <div className="flex-1">
                        <div className="text-2xl font-semibold text-slate-100">
                          {e.teamLabel
                            ? e.teamLabel
                            : `${e.firstName} ${e.lastName}`}
                        </div>

                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm text-slate-300">
                            Currently with guest
                          </span>
                          {joinBadge(e)}
                        </div>

                        {e.note && (
                          <div className="text-sm text-slate-200 italic mt-1">
                            {e.note}
                          </div>
                        )}

                        {e.serviceStart && (
                          <div className="text-xs text-slate-400 mt-1">
                            Service started at{" "}
                            {new Date(e.serviceStart).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </div>

                      {/* Timer + actions */}
                      <div className="flex flex-col items-end gap-3">
                        <div className="text-lg tabular-nums text-slate-100">
                          {formatSince(e.serviceStart)}
                        </div>

                        <div className="flex flex-col gap-2">
                          {/* DONE = log visit + managers (Completed tab + re-queue) */}
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openCompleteModal(e.id);
                            }}
                            className="rounded-lg bg-green-600 px-4 py-2 text-white text-sm font-semibold hover:bg-green-500"
                          >
                            Done
                          </button>

                          {/* Separate action: send guest back to queue (top/bottom) without logging sale */}
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openDoneModal(e.id);
                            }}
                            className="rounded-lg border border-slate-600 px-4 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                          >
                            Send back to queue
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar / color change */}
                    <div className="mt-4 w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${Math.min(minutes, 120) / 1.2}%`,
                          background:
                            minutes <= 25
                              ? "#16a34a"
                              : minutes <= 30
                              ? "linear-gradient(to right, #16a34a 0%, #16a34a 40%, #facc15 100%)"
                              : minutes <= 55
                              ? "#facc15"
                              : minutes <= 60
                              ? "linear-gradient(to right, #facc15 0%, #facc15 40%, #f97316 100%)"
                              : minutes <= 85
                              ? "#f97316"
                              : minutes <= 90
                              ? "linear-gradient(to right, #f97316 0%, #f97316 40%, #dc2626 100%)"
                              : "#dc2626",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </>
  );
}
