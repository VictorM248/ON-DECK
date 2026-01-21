import { useEffect, useState, useCallback } from "react";
import { useStoreFeed, type QueueEntry } from "../lib/useStoreFeed";
import { useSavedManagersFirestore } from "../lib/useSavedManagersFirestore";

type JoinType = "walk-in" | "appointment";

// Extend locally so TS knows about originalQueueIndex without changing backend types yet
type Entry = QueueEntry & { originalQueueIndex?: number };

//This is commented out because Idk what I'm doing with my saved managers yet
//type Manager = {
//  id: string;
//  name: string;
//};

type QueueProps = {
  role: "Sales" | "Admin";
  storeId: string;
  region: string;
  onAddSavedName?: (firstName: string, lastName: string) => void;
  registerAddHandler?: (
    fn: (firstName: string, lastName: string, note: string) => void
  ) => void;
  onOpenAddModal?: () => void;
};

export default function Queue({
  role,
  storeId,
  region,
  onAddSavedName,
  registerAddHandler,
}: QueueProps) {
  // TODO: Replace these with your real selected store/region if you have a selector elsewhere
  const { data, initIfMissing, updateFeed } = useStoreFeed(storeId, region);

  const {
    savedManagers = [],
    addManager,
    initIfMissing: initSavedManagers,
  } = useSavedManagersFirestore(storeId);

  console.log("savedManagers", savedManagers);

  useEffect(() => {
    initSavedManagers();
  }, [initSavedManagers]);

  const queue = (data.queue ?? []) as Entry[];
  const active = (data.active ?? []) as Entry[];
  const completed = (data.completed ?? []) as Entry[];

  // Ensure doc exists (safe; merge: true)
  useEffect(() => {
    initIfMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, region]);

  // right-side tab (Admin only)
  const [activeTab, setActiveTab] = useState<"with" | "done">("with");

  useEffect(() => {
    if (role !== "Admin" && activeTab === "done") setActiveTab("with");
  }, [role, activeTab]);

  // timer tick
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // modals
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null); // queue -> active (join type)
  const [doneActiveId, setDoneActiveId] = useState<string | null>(null); // active -> queue (send back)
  const [completeEntryId, setCompleteEntryId] = useState<string | null>(null); // done -> completed + requeue
  // early return (under 2 min) reason modal
  type EarlyReason = "service" | "parts" | "finance" | "other";

  const [earlyReasonModalOpen, setEarlyReasonModalOpen] = useState(false);
  const [earlyReason, setEarlyReason] = useState<EarlyReason | null>(null);


  // team modal
  const [teamEntryId, setTeamEntryId] = useState<string | null>(null);
  const [teamLabelInput, setTeamLabelInput] = useState("");

  // manager selection shared
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [newManagerName, setNewManagerName] = useState("");

  // where to requeue after "Done"
  const [returnPosition, setReturnPosition] = useState<"top" | "bottom">(
    "bottom"
  );

  // persist savedManagers only
  useEffect(
    () => localStorage.setItem("savedManagers", JSON.stringify(savedManagers)),
    [savedManagers]
  );

  // ---- Firestore write helper (always write all 3 arrays to keep state consistent) ----
  const stripUndefined = <T,>(obj: T): T =>
    JSON.parse(JSON.stringify(obj)) as T;

  const setLists = useCallback(
    async (next: { queue: Entry[]; active: Entry[]; completed: Entry[] }) => {
      const cleaned = stripUndefined({
        queue: next.queue,
        active: next.active,
        completed: next.completed,
      });

      try {
        await updateFeed(cleaned);
      } catch (err) {
        console.error("Firestore update failed:", err);
        alert("Save failed. Check console for details.");
        throw err;
      }
    },
    [updateFeed]
  );

  const fullName = (e: Entry) => `${e.firstName} ${e.lastName}`.trim();

  const initials = (e: Entry) =>
    `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase();

  // Overlapping avatar bubbles when teamLabel exists
  const avatarInitialsList = (e: Entry): string[] => {
    if (!e.teamLabel) return [initials(e)];

    const parts = e.teamLabel
      .split("&")
      .map((p) => p.trim())
      .filter(Boolean);

    const codes: string[] = [];
    for (let i = 0; i < Math.min(parts.length, 2); i++) {
      const words = parts[i].split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      const first = words[0][0] ?? "";
      const last = words.length > 1 ? words[words.length - 1][0] ?? "" : "";
      const code = (first + last).toUpperCase();
      if (code) codes.push(code);
    }
    return codes.length ? codes.slice(0, 2) : [initials(e)];
  };

  // team badge info for queue list: "TEAM • <other>"
  const parseTeamMembers = (teamLabel?: string) => {
    if (!teamLabel) return [];
    return teamLabel
      .split("&")
      .map((p) => p.trim())
      .filter(Boolean);
  };

  const teamedWith = (rep: Entry): string | null => {
    const repName = fullName(rep).toLowerCase();
    if (!repName) return null;

    for (const a of active) {
      if (!a.teamLabel) continue;

      const members = parseTeamMembers(a.teamLabel);
      const lower = members.map((m) => m.toLowerCase());
      if (!lower.includes(repName)) continue;

      const other = members.find((m) => m.toLowerCase() !== repName);
      return other ?? "Team";
    }

    return null;
  };

    //Yay another helper! // reason label for early return
    const earlyReasonLabel = (r?: Entry["earlyReason"]) => {
    if (!r) return null;
    if (r === "service") return "Service";
    if (r === "parts") return "Parts";
    if (r === "finance") return "Finance";
    return "Other";
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

  const joinBadge = (e: Entry) => {
    if (!e.joinType) return null;
    const isAppt = e.joinType === "appointment";
    return (
      <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-100 shadow-sm">
        <span className="text-base">{isAppt ? "📅" : "🚶"}</span>
        <span className="font-medium">{isAppt ? "Appointment" : "Walk-in"}</span>
      </span>
    );
  };

  // Add from App modal (Firestore write)
  const addFromModal = useCallback(
    async (firstName: string, lastName: string, note: string) => {
      const fn = firstName.trim();
      const ln = lastName.trim();
      const nt = note.trim();
      if (!fn) return;

      const nextQueue: Entry[] = [
        ...queue,
        {
          id: crypto.randomUUID(),
          firstName: fn,
          lastName: ln,
          note: nt,
          joinedAt: Date.now(),
        },
      ];

      await setLists({ queue: nextQueue, active, completed });
      onAddSavedName?.(fn, ln);
    },
    [queue, active, completed, setLists, onAddSavedName]
  );

  useEffect(() => {
    registerAddHandler?.(addFromModal);
  }, [registerAddHandler, addFromModal]);

  const removeFromQueue = async (id: string) => {
    await setLists({
      queue: queue.filter((e) => e.id !== id),
      active,
      completed,
    });
  };

  const clearQueue = async () => {
    if (window.confirm("Clear the entire queue?")) {
      await setLists({ queue: [], active, completed });
    }
  };

  // queue -> active join type modal
  const openJoinTypeModal = (entryId: string) => setSelectedEntryId(entryId);

  const confirmMoveWithType = async (type: JoinType) => {
    if (!selectedEntryId) return;

    const idx = queue.findIndex((e) => e.id === selectedEntryId);
    const entry = queue[idx];

    if (!entry) {
      setSelectedEntryId(null);
      return;
    }

    const nextQueue = queue.filter((e) => e.id !== selectedEntryId);
    const nextActive = [
      ...active,
      {
        ...entry,
        joinType: type,
        serviceStart: Date.now(),
        originalQueueIndex: idx, // save original spot
      },
    ];

    await setLists({ queue: nextQueue, active: nextActive, completed });
    setSelectedEntryId(null);
  };

  // open "Send back to queue" modal (active -> queue)
  const openDoneModal = (entryId: string) => {
    setDoneActiveId(entryId);

    const entry = active.find((e) => e.id === entryId);
    if (entry?.managers?.length) {
      const ids = savedManagers
        .filter((m) => entry.managers!.includes(m.name))
        .map((m) => m.id);
      setSelectedManagerIds(ids);
    } else {
      setSelectedManagerIds([]);
    }
    setNewManagerName("");
  };

  // open "Done" modal (log managers + requeue + completed)
  const openCompleteModal = (entryId: string) => {
    setCompleteEntryId(entryId);
    setSelectedManagerIds([]);
    setNewManagerName("");
    setReturnPosition("bottom");
  };

  const closeCompleteModal = () => {
    setCompleteEntryId(null);
    setSelectedManagerIds([]);
    setNewManagerName("");
    setReturnPosition("bottom");
  };

  // team modal open/close + save (Firestore write)
  const openTeamModal = (entryId: string) => {
    setTeamEntryId(entryId);
    const entry = active.find((e) => e.id === entryId);
    setTeamLabelInput(entry?.teamLabel ?? "");
  };

  const closeTeamModal = () => {
    setTeamEntryId(null);
    setTeamLabelInput("");
  };

  const saveTeamLabel = async () => {
    if (!teamEntryId) return;

    const nextActive = active.map((e) =>
      e.id === teamEntryId
        ? { ...e, teamLabel: teamLabelInput.trim() || undefined }
        : e
    );

    await setLists({ queue, active: nextActive, completed });
    closeTeamModal();
  };

  // toggle manager selection (max 3)
  const toggleManagerSelection = (id: string) => {
    setSelectedManagerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  // DONE: log managers, add to Completed, and requeue based on returnPosition + 2min rule (Firestore write)
  const handleConfirmComplete = async () => {
    if (!completeEntryId) return;

    const entry = active.find((e) => e.id === completeEntryId);
    if (!entry) {
      closeCompleteModal();
      return;
    }

    // Build selected IDs first (so typed name gets an ID and can be "selected")
    let selectedIds = [...selectedManagerIds];

    const nm = newManagerName.trim();
    let typed = null as { id: string; name: string } | null;

    if (nm) {
      if (role === "Admin") {
        typed = await addManager(nm); // Admin can persist
      }
      if (typed && !selectedIds.includes(typed.id)) selectedIds.push(typed.id);
    }

    // max 3
    if (selectedIds.length > 3) selectedIds = selectedIds.slice(0, 3);

    // Build id->name map (include typed even before snapshot refresh)
    const idToName = new Map<string, string>();
    for (const m of savedManagers) idToName.set(m.id, m.name);
    if (typed) idToName.set(typed.id, typed.name);

    const managersList = selectedIds
      .map((id) => idToName.get(id))
      .filter((x): x is string => Boolean(x));

    setSelectedManagerIds(selectedIds);

    // save completed entry
    const completedEntry: Entry = {
      ...entry,
      managers: managersList,
      earlyReason: earlyReason ?? undefined,
    };


    // 2-minute rule for top (keep as-is for this flow)
    const canSendTop = entry.serviceStart
      ? now - entry.serviceStart < 2 * 60 * 1000
      : true;

    const finalPosition: "top" | "bottom" =
      returnPosition === "top" && canSendTop ? "top" : "bottom";

    // requeue entry (new id + new join time; clear old note/team)
    const requeuedEntry: Entry = {
      id: crypto.randomUUID(),
      firstName: entry.firstName,
      lastName: entry.lastName,
      note: "",
      joinedAt: Date.now(),
      serviceStart: undefined,
      joinType: undefined,
      managers: undefined,
      teamLabel: undefined,
    };

    const nextActive = active.filter((e) => e.id !== completeEntryId);
    const nextCompleted = [...completed, completedEntry];

let nextQueue: Entry[];

if (finalPosition === "top") {
  // "top" is now repurposed to mean: original spot in queue
  const originalIndex =
    typeof entry.originalQueueIndex === "number" ? entry.originalQueueIndex : 0;

  const safeIndex = Math.max(0, Math.min(originalIndex, queue.length));

  nextQueue = [...queue];
  nextQueue.splice(safeIndex, 0, requeuedEntry);
} else {
  nextQueue = [...queue, requeuedEntry];
}



    await setLists({
      queue: nextQueue,
      active: nextActive,
      completed: nextCompleted,
    });
    closeCompleteModal();
  };

  const removeCompletedEntry = async (id: string) => {
    await setLists({
      queue,
      active,
      completed: completed.filter((e) => e.id !== id),
    });
  };

  // REPURPOSED: send active back to ORIGINAL queue spot (only allowed under 2 minutes in UI)
  const moveActiveBackToQueueOriginal = async () => {
    if (!doneActiveId) return;

    const entry = active.find((e) => e.id === doneActiveId);
    if (!entry) {
      setDoneActiveId(null);
      return;
    }

    let selectedIds = [...selectedManagerIds];

    const nm = newManagerName.trim();
    let typed = null as { id: string; name: string } | null;

    if (nm) {
      if (role === "Admin") {
        typed = await addManager(nm);
      }
      if (typed && !selectedIds.includes(typed.id)) selectedIds.push(typed.id);
    }

    if (selectedIds.length > 3) selectedIds = selectedIds.slice(0, 3);

    const idToName = new Map<string, string>();
    for (const m of savedManagers) idToName.set(m.id, m.name);
    if (typed) idToName.set(typed.id, typed.name);

    const helpers = selectedIds
      .map((id) => idToName.get(id))
      .filter((x): x is string => Boolean(x));

    setSelectedManagerIds(selectedIds);

    const originalIndex =
      typeof entry.originalQueueIndex === "number"
        ? entry.originalQueueIndex
        : queue.length; // fallback: bottom if missing

    const safeIndex = Math.max(0, Math.min(originalIndex, queue.length));

    const cleaned: Entry = {
      ...entry,
      serviceStart: undefined,
      joinType: undefined,
      managers: helpers.length > 0 ? helpers : entry.managers,
    };

    const nextActive = active.filter((e) => e.id !== doneActiveId);

    const nextQueue = [...queue];
    nextQueue.splice(safeIndex, 0, cleaned);

    await setLists({ queue: nextQueue, active: nextActive, completed });

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

      {/* MODAL: active -> queue (Send back to queue) */}
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

              // Keep 2-min rule"
              const canSendTop =
                e.serviceStart ? now - e.serviceStart < 2 * 60 * 1000 : true;

              return (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3">
                    {canSendTop && (
                      <button
                        onClick={() => void moveActiveBackToQueueOriginal()}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
                      >
                        Send back to{" "}
                        <span className="font-semibold">original spot</span> in
                        queue
                      </button>
                    )}

                    {!canSendTop && (
                      <p className="text-xs text-slate-400 italic">
                        This option is only available within the first 2 minutes.
                      </p>
                    )}
                  </div>

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
                      disabled={role !== "Admin"}
                      placeholder={role === "Admin" ? "Manager name" : "Admin only"}
                      className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* MODAL: DONE (log managers + send to top/bottom + completed + requeue) */}
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
              Log managers for this visit
            </h2>

            {(() => {
              const e = active.find((a) => a.id === completeEntryId);
              return (
                <p className="text-sm text-slate-300 mb-4">
                  {e ? `${e.firstName} ${e.lastName}` : "Selected guest"}
                </p>
              );
            })()}

            {(() => {
              const e = active.find((a) => a.id === completeEntryId);
              if (!e) return null;

              const canSendTop =
                e.serviceStart ? now - e.serviceStart < 2 * 60 * 1000 : true;

              return (
                <>
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
                          className={`rounded-xl px-4 py-2 text-sm
                            flex items-center justify-center text-center
                            ${
                              returnPosition === "top"
                                ? "outline-runner bg-slate-800 text-slate-100"
                                : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                            }
                          `}
                        >
                          {returnPosition === "top" && (
                            <svg aria-hidden="true">
                              <defs>
                                <linearGradient id="runnerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                  <stop offset="0%" stopColor="#22c55e" />
                                  <stop offset="20%" stopColor="#06b6d4" />
                                  <stop offset="40%" stopColor="#3b82f6" />
                                  <stop offset="60%" stopColor="#a855f7" />
                                  <stop offset="80%" stopColor="#ec4899" />
                                  <stop offset="100%" stopColor="#f97316" />
                                </linearGradient>
                              </defs>

                              <rect
                                className="runner-rect"
                                x="1"
                                y="1"
                                width="calc(100% - 2px)"
                                height="calc(100% - 2px)"
                                rx="12"
                                ry="12"
                                pathLength="1000"
                                stroke="url(#runnerGradient)"
                              />
                            </svg>
                          )}

                          <span className="outline-runner-content">
                            Send to<span className="font-semibold mx-1">original</span>spot in queue
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setReturnPosition("bottom")}
                        className={`rounded-xl px-4 py-2 text-sm
                          flex items-center justify-center text-center
                          ${
                            returnPosition === "bottom"
                              ? "outline-runner bg-slate-800 text-slate-100"
                              : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                          }`}
                      >
                        {returnPosition === "bottom" && (
                          <svg aria-hidden="true">
                            <defs>
                              <linearGradient id="runnerGradientBottom" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#22c55e" />
                                <stop offset="20%" stopColor="#06b6d4" />
                                <stop offset="40%" stopColor="#3b82f6" />
                                <stop offset="60%" stopColor="#a855f7" />
                                <stop offset="80%" stopColor="#ec4899" />
                                <stop offset="100%" stopColor="#f97316" />
                              </linearGradient>
                            </defs>

                            <rect
                              className="runner-rect"
                              x="1"
                              y="1"
                              width="calc(100% - 2px)"
                              height="calc(100% - 2px)"
                              rx="12"
                              ry="12"
                              pathLength="1000"
                              stroke="url(#runnerGradientBottom)"
                            />
                          </svg>
                        )}

                        <span className="outline-runner-content">
                          Send to<span className="font-semibold mx-1">bottom</span>of queue
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Manager selection */}
                  {savedManagers.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-slate-400">
                        Tap up to 3 managers who helped:
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
                      disabled={role !== "Admin"}
                      placeholder={role === "Admin" ? "Manager name" : "Admin only"}
                      className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              );
            })()}

            <div className="flex gap-2">
              <button
                onClick={closeCompleteModal}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const e = active.find((a) => a.id === completeEntryId);
                  const canSendTop = e?.serviceStart ? now - e.serviceStart < 2 * 60 * 1000 : true;

                  // only trigger new modal for the "original spot" path under 2 minutes
                  if (returnPosition === "top" && canSendTop) {
                    setEarlyReasonModalOpen(true);
                    return;
                  }

                  handleConfirmComplete();
                }}
                className="flex-1 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
              >
                Save visit
              </button>

            </div>
          </div>
        </div>
      )}

      {/* MODAL: Under-2-min reason (opens after Save visit) */}
        {earlyReasonModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setEarlyReasonModalOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-slate-100 mb-2">
                Customer needed...
              </h2>

              <p className="text-sm text-slate-300 mb-4">
                Select where they needed to go.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {([
                  ["service", "Service"],
                  ["parts", "Parts"],
                  ["finance", "Finance"],
                  ["other", "Other"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setEarlyReason(key);
                      setEarlyReasonModalOpen(false);
                      handleConfirmComplete(); // continues the save flow
                    }}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-slate-700"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setEarlyReasonModalOpen(false)}
                className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
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
                  <p className="text-sm text-slate-300 mb-4">Selected guest</p>
                );
              }

              const teammates = queue; // reps currently in queue

              return (
                <>
                  <p className="text-sm text-slate-300 mb-4">
                    {entry.firstName} {entry.lastName}
                  </p>

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

            {queue.map((e, i) => {
              const other = teamedWith(e);

              return (
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
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-slate-100">
                          {i + 1}. {e.firstName} {e.lastName}
                        </div>

                        {other && (
                          <span className="inline-flex items-center rounded-full border border-blue-500/40 bg-blue-600/20 px-2 py-0.5 text-[11px] text-blue-200">
                            TEAM • {other}
                          </span>
                        )}
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
                        void removeFromQueue(e.id);
                      }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — ACTIVE + COMPLETED */}
        <div className="w-full lg:w-2/3 space-y-6">
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

          {role === "Admin" && activeTab === "done"
            ? completed.map((e) => (
                <div
                  key={e.id}
                  className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg"
                >
                  <div className="flex items-start gap-4 justify-between">
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

                      {e.earlyReason && (
                        <div className="text-xs text-slate-300 mt-1">
                          Customer needed:{" "}
                          <span className="font-medium">{earlyReasonLabel(e.earlyReason)}</span>
                        </div>
                      )}


                      {e.note && (
                        <div className="text-sm text-slate-200 italic mt-1">
                          {e.note}
                        </div>
                      )}

                      {e.managers?.length ? (
                        <div className="text-xs text-slate-300 mt-1">
                          Managers:{" "}
                          <span className="font-medium">
                            {e.managers.join(", ")}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <button
                      onClick={() => void removeCompletedEntry(e.id)}
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

                      <div className="flex flex-col items-end gap-3">
                        <div className="text-lg tabular-nums text-slate-100">
                          {formatSince(e.serviceStart)}
                        </div>

                        <div className="flex flex-col gap-2">
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openCompleteModal(e.id);
                            }}
                            className="rounded-lg bg-green-600 px-4 py-2 text-white text-sm font-semibold hover:bg-green-500"
                          >
                            Done
                          </button>

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