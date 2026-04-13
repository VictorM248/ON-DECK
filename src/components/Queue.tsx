import { useEffect, useState, useCallback } from "react";
import {
  useStoreFeed,
  type QueueEntry,
  type JoinType as FeedJoinType,
} from "../lib/useStoreFeed";
import { useStoreUsers } from "../lib/useStoreUsers";
import { isAdminLike } from "../lib/roles";
import { Calendar, Handshake, DoorOpen, Phone, Globe } from "lucide-react";
import type { ReactElement } from "react";
import RunnerButton from "../components/RunnerButton";

type Entry = QueueEntry & { originalQueueIndex?: number };
type Role = "Sales" | "Admin";
type JoinType = FeedJoinType;
type EarlyReason = "service" | "parts" | "finance" | "other";

type QueueProps = {
  role: Role;
  storeId: string;
  region: string;
  onAddSavedName?: (firstName: string, lastName: string, email: string) => void;
  registerAddHandler?: (
    fn: (firstName: string, lastName: string, email: string, note: string) => void
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
  const { data, initIfMissing, updateFeed } = useStoreFeed(storeId, region);

  const { managerUsers } = useStoreUsers(storeId);

  const queue = (data.queue ?? []) as Entry[];
  const active = (data.active ?? []) as Entry[];
  const completed = (data.completed ?? []) as Entry[];

  useEffect(() => {
    initIfMissing();
  }, [storeId, region]);

  const [activeTab, setActiveTab] = useState<"with" | "done">("with");
  useEffect(() => {
    if (role !== "Admin" && activeTab === "done") setActiveTab("with");
  }, [role, activeTab]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // modals
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [doneActiveId, setDoneActiveId] = useState<string | null>(null);
  const [completeEntryId, setCompleteEntryId] = useState<string | null>(null);
  const [earlyReasonModalOpen, setEarlyReasonModalOpen] = useState(false);
  const [earlyReason, setEarlyReason] = useState<EarlyReason | null>(null);

  // team modal
  const [teamEntryId, setTeamEntryId] = useState<string | null>(null);
  const [teamLabelInput, setTeamLabelInput] = useState("");

  // manager selection
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);

  const [returnPosition, setReturnPosition] = useState<"top" | "bottom">("bottom");

  // ---- Firestore write helper ----
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

  const avatarColor = (name: string) => {
    const colors = [
      "bg-blue-800 text-blue-200",
      "bg-green-800 text-green-200",
      "bg-amber-800 text-amber-200",
      "bg-purple-800 text-purple-200",
      "bg-rose-800 text-rose-200",
      "bg-teal-800 text-teal-200",
      "bg-indigo-800 text-indigo-200",
      "bg-orange-800 text-orange-200",
    ];
    const index = (name.charCodeAt(0) ?? 0) % colors.length;
    return colors[index];
  };

  const initials = (e: Entry) =>
    `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase();

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

  const formatDuration = (sec?: number) => {
    if (!sec || sec <= 0) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
    return `${s}s`;
  };

  const earlyReasonLabel = (r?: Entry["earlyReason"]) => {
    if (!r) return "";
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
    const jt: JoinType =
      e.joinType === ("appointment" as any) ? ("appt-phone" as const) : e.joinType;
    const map: Record<
      "walk-in" | "appt-phone" | "appt-online",
      { label: string; icon: ReactElement; cls: string }
    > = {
      "walk-in": {
        label: "Walk-in",
        icon: <DoorOpen size={16} />,
        cls: "bg-slate-700 text-slate-100 border-slate-600",
      },
      "appt-phone": {
        label: "Appt (Phone)",
        icon: <Phone size={16} />,
        cls: "bg-blue-600/20 text-blue-200 border-blue-500/40",
      },
      "appt-online": {
        label: "Appt (Online)",
        icon: <Globe size={16} />,
        cls: "bg-green-600/20 text-green-200 border-green-500/40",
      },
    };
    const cfg = map[jt as "walk-in" | "appt-phone" | "appt-online"] ?? {
      label: "Appointment",
      icon: <Calendar size={16} />,
      cls: "bg-slate-700 text-slate-100 border-slate-600",
    };
    return (
      <span className={`ml-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs border shadow-sm ${cfg.cls}`}>
        <span className="text-base">{cfg.icon}</span>
        <span className="font-medium">{cfg.label}</span>
      </span>
    );
  };

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

  // Add from modal (now includes email, required)
  const addFromModal = useCallback(
    async (firstName: string, lastName: string, email: string, note: string) => {
      const fn = firstName.trim();
      const ln = lastName.trim();
      const em = email.trim().toLowerCase();
      const nt = note.trim();

      if (!fn || !em) return;

      // basic email format check
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
      if (!emailValid) {
        alert("Please enter a valid email address.");
        return;
      }

      const nextQueue: Entry[] = [
        ...queue,
        {
          id: crypto.randomUUID(),
          firstName: fn,
          lastName: ln,
          email: em,
          note: nt,
          joinedAt: Date.now(),
        },
      ];

      await setLists({ queue: nextQueue, active, completed });
      onAddSavedName?.(fn, ln, em);
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
    const nextActive: Entry[] = [
      ...active,
      {
        ...entry,
        joinType: type,
        serviceStart: Date.now(),
        originalQueueIndex: idx,
      },
    ];
    await setLists({ queue: nextQueue, active: nextActive, completed });
    setSelectedEntryId(null);
  };

  const openDoneModal = (entryId: string) => {
    setDoneActiveId(entryId);
    const entry = active.find((e) => e.id === entryId);
    if (entry?.managers?.length) {
      const ids = managerUsers
        .filter((m) => entry.managers!.includes(m.displayName))
        .map((m) => m.uid);
      setSelectedManagerIds(ids);
    } else {
      setSelectedManagerIds([]);
    }
  };

  const openCompleteModal = (entryId: string) => {
    setCompleteEntryId(entryId);
    setSelectedManagerIds([]);
    setReturnPosition("bottom");
    setEarlyReason(null);
  };

  const closeCompleteModal = () => {
    setCompleteEntryId(null);
    setSelectedManagerIds([]);
    setReturnPosition("bottom");
    setEarlyReasonModalOpen(false);
    setEarlyReason(null);
  };

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

  const toggleManagerSelection = (id: string) => {
    setSelectedManagerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const handleConfirmComplete = async (reason?: EarlyReason) => {
    if (!completeEntryId) return;
    const entry = active.find((e) => e.id === completeEntryId);
    if (!entry) {
      closeCompleteModal();
      return;
    }

    let selectedIds = [...selectedManagerIds];

    if (selectedIds.length > 3) selectedIds = selectedIds.slice(0, 3);

    const idToName = new Map<string, string>();
    for (const m of managerUsers) idToName.set(m.uid, m.displayName);

    const managersList = selectedIds
      .map((id) => idToName.get(id))
      .filter((x): x is string => Boolean(x));

    setSelectedManagerIds(selectedIds);

    const end = Date.now();
    const durationSec = entry.serviceStart
      ? Math.max(0, Math.round((end - entry.serviceStart) / 1000))
      : undefined;

    const completedEntry: Entry = {
      ...entry,
      managers: managersList,
      earlyReason: reason ?? earlyReason ?? undefined,
      serviceEnd: end,
      durationSec,
    };

    const canSendTop = entry.serviceStart
      ? now - entry.serviceStart < 2 * 60 * 1000
      : true;

    const finalPosition: "top" | "bottom" =
      returnPosition === "top" && canSendTop ? "top" : "bottom";

    const requeuedEntry: Entry = {
      id: crypto.randomUUID(),
      firstName: entry.firstName,
      lastName: entry.lastName,
      email: entry.email,
      note: "",
      joinedAt: Date.now(),
      serviceStart: undefined,
      joinType: undefined,
      managers: undefined,
      teamLabel: undefined,
      earlyReason: undefined,
      serviceEnd: undefined,
      durationSec: undefined,
    };

    const nextActive = active.filter((e) => e.id !== completeEntryId);
    const nextCompleted = [...completed, completedEntry];

    let nextQueue: Entry[];
    if (finalPosition === "top") {
      const originalIndex =
        typeof entry.originalQueueIndex === "number" ? entry.originalQueueIndex : 0;
      const safeIndex = Math.max(0, Math.min(originalIndex, queue.length));
      nextQueue = [...queue];
      nextQueue.splice(safeIndex, 0, requeuedEntry);
    } else {
      nextQueue = [...queue, requeuedEntry];
    }

    await setLists({ queue: nextQueue, active: nextActive, completed: nextCompleted });
    closeCompleteModal();
  };

  const removeCompletedEntry = async (id: string) => {
    await setLists({
      queue,
      active,
      completed: completed.filter((e) => e.id !== id),
    });
  };

  const moveActiveBackToQueueOriginal = async () => {
    if (!doneActiveId) return;
    const entry = active.find((e) => e.id === doneActiveId);
    if (!entry) {
      setDoneActiveId(null);
      return;
    }

    let selectedIds = [...selectedManagerIds];

    if (selectedIds.length > 3) selectedIds = selectedIds.slice(0, 3);

    const idToName = new Map<string, string>();
    for (const m of managerUsers) idToName.set(m.uid, m.displayName);

    const helpers = selectedIds
      .map((id) => idToName.get(id))
      .filter((x): x is string => Boolean(x));

    setSelectedManagerIds(selectedIds);

    const originalIndex =
      typeof entry.originalQueueIndex === "number"
        ? entry.originalQueueIndex
        : queue.length;

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
                onClick={() => void confirmMoveWithType("walk-in")}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
              >
                <DoorOpen size={16} />
                <span className="font-medium">Walk-in</span>
              </button>
              <button
                onClick={() => void confirmMoveWithType("appt-phone")}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
              >
                <Phone size={16} />
                <span className="font-medium">Appointment (Phone)</span>
              </button>
              <button
                onClick={() => void confirmMoveWithType("appt-online")}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
              >
                <Globe size={16} />
                <span className="font-medium">Appointment (Online)</span>
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
                  <div className="flex flex-col gap-3">
                    {canSendTop && (
                      <button
                        onClick={() => void moveActiveBackToQueueOriginal()}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
                      >
                        Send back to{" "}
                        <span className="font-semibold">original spot</span> in queue
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
                    {managerUsers.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {managerUsers.map((m) => {
                          const selected = selectedManagerIds.includes(m.uid);
                          return (
                            <button
                              key={m.uid}
                              type="button"
                              onClick={() => toggleManagerSelection(m.uid)}
                              className={`rounded-full border px-3 py-1 text-xs ${
                                selected
                                  ? "bg-blue-600 border-blue-500 text-white"
                                  : "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                              }`}
                            >
                              {m.displayName}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 mb-2">
                        No managers found for this store.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
            <button
              onClick={() => {
                setDoneActiveId(null);
                setSelectedManagerIds([]);
              }}
              className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MODAL: DONE */}
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
                  <div className="flex flex-col gap-2">
                    {canSendTop && (
                      <RunnerButton
                        selected={returnPosition === "top"}
                        onClick={() => setReturnPosition("top")}
                        className={`rounded-xl px-4 py-2 text-sm flex items-center justify-center text-center ${
                          returnPosition === "top"
                            ? "bg-slate-800 text-slate-100"
                            : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                        }`}
                        gradientId="runnerGradientTop"
                      >
                        Send to <span className="font-semibold mx-1">original</span> spot in queue
                      </RunnerButton>
                    )}
                    <RunnerButton
                      selected={returnPosition === "bottom"}
                      onClick={() => setReturnPosition("bottom")}
                      className={`rounded-xl px-4 py-2 text-sm flex items-center justify-center text-center ${
                        returnPosition === "bottom"
                          ? "bg-slate-800 text-slate-100"
                          : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                      }`}
                      gradientId="runnerGradientBottom"
                    >
                      Send to <span className="font-semibold mx-1">bottom</span> of queue
                    </RunnerButton>
                  </div>
                  {managerUsers.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-slate-400">
                        Tap up to 3 managers who helped:
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {managerUsers.map((m) => {
                          const selected = selectedManagerIds.includes(m.uid);
                          return (
                            <button
                              key={m.uid}
                              type="button"
                              onClick={() => toggleManagerSelection(m.uid)}
                              className={`rounded-full border px-3 py-1 text-xs ${
                                selected
                                  ? "bg-blue-600 border-blue-500 text-white"
                                  : "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                              }`}
                            >
                              {m.displayName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                  const canSendTop = e?.serviceStart
                    ? now - e.serviceStart < 2 * 60 * 1000
                    : true;
                  if (returnPosition === "top" && canSendTop) {
                    setEarlyReasonModalOpen(true);
                    return;
                  }
                  void handleConfirmComplete();
                }}
                className="flex-1 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
              >
                Save visit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Under-2-min reason */}
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
              {(
                [
                  ["service", "Service"],
                  ["parts", "Parts"],
                  ["finance", "Finance"],
                  ["other", "Other"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setEarlyReason(key);
                    setEarlyReasonModalOpen(false);
                    void handleConfirmComplete(key);
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
                return <p className="text-sm text-slate-300 mb-4">Selected guest</p>;
              }
              const teammates = queue;
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
                onClick={() => void saveTeamLabel()}
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
                {isAdminLike(role) && (
                  <button
                    onClick={() => void clearQueue()}
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
                  className="flex items-center justify-between border-t border-slate-800 px-4 py-3 cursor-pointer hover:bg-slate-800 border-l-2 border-l-blue-500"
                  onClick={() => openJoinTypeModal(e.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(e.firstName)}`}>
                      {initials(e)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-slate-100">
                          {i + 1}. {e.firstName} {e.lastName}
                        </div>
                        {other && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-600/20 px-2 py-0.5 text-[11px] text-blue-200">
                            <Handshake size={12} />
                            <span className="font-medium">TEAM • {other}</span>
                          </span>
                        )}
                      </div>
                      {e.note && (
                        <div className="text-xs text-slate-300 italic">{e.note}</div>
                      )}
                      {e.joinedAt && (
                        <div className="text-[11px] text-slate-400">
                          Joined at {formatJoined(e.joinedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                  {isAdminLike(role) && (
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
            {isAdminLike(role) ? (
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

          {isAdminLike(role) && activeTab === "done"
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
                            className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold border border-slate-900 ${avatarColor(ini)}`}
                          >
                            {ini}
                          </div>
                        ))}
                    </div>
                    <div className="flex-1">
                      <div className="text-2xl font-semibold text-slate-100">
                        {e.teamLabel ? e.teamLabel : `${e.firstName} ${e.lastName}`}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-slate-300">
                          Customer visit completed
                        </span>
                        {joinBadge(e)}
                      </div>
                      {e.durationSec ? (
                        <div className="text-xs text-slate-400 mt-1">
                          Time with customer:{" "}
                          <span className="font-medium text-slate-200">
                            {formatDuration(e.durationSec)}
                          </span>
                        </div>
                      ) : null}
                      {e.earlyReason ? (
                        <div className="text-xs text-slate-300 mt-1">
                          Customer needed:{" "}
                          <span className="font-medium">
                            {earlyReasonLabel(e.earlyReason)}
                          </span>
                        </div>
                      ) : null}
                      {e.note ? (
                        <div className="text-sm text-slate-200 italic mt-1">
                          {e.note}
                        </div>
                      ) : null}
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
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold border border-slate-900 ${avatarColor(ini)}`}
                        >
                          {ini}
                        </div>
                      ))}
                      </div>
                      <div className="flex-1">
                        <div className="text-2xl font-semibold text-slate-100">
                          {e.teamLabel ? e.teamLabel : `${e.firstName} ${e.lastName}`}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm text-slate-300">
                            Currently with guest
                          </span>
                          {joinBadge(e)}
                        </div>
                        {e.note ? (
                          <div className="text-sm text-slate-200 italic mt-1">
                            {e.note}
                          </div>
                        ) : null}
                        {e.serviceStart ? (
                          <div className="text-xs text-slate-400 mt-1">
                            Service started at{" "}
                            {new Date(e.serviceStart).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </div>
                        ) : null}
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