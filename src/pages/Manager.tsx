import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "../components/AuthGate";
import { useStoreFeed, type QueueEntry } from "../lib/useStoreFeed";
import { Sidebar, SidebarItem } from "../components/Sidebar";
import {List, Users, CheckCircle, Handshake, BarChart3, DoorOpen, Phone, Globe, Timer,
} from "lucide-react";




type Entry = QueueEntry & { originalQueueIndex?: number };

type PanelKey = "queue" | "active" | "completed" | "team" | "analytics";

export default function Manager() {
  const [storeId, setStoreId] = useState<string>("");

  const [region, setRegion] = useState<string>(
    () => localStorage.getItem("managerRegion") ?? "North"
  );

  useEffect(() => {
    localStorage.setItem("managerRegion", region);
  }, [region]);

  const [panel, setPanel] = useState<PanelKey>("queue");
  const [search, setSearch] = useState("");

  //Comment divider for sidebar collapse
  const [sidebarOpen, setSidebarOpen] = useState(() => {
  return localStorage.getItem("mgrSidebarOpen") !== "0";
    });

    useEffect(() => {
    localStorage.setItem("mgrSidebarOpen", sidebarOpen ? "1" : "0");
    }, [sidebarOpen]);

  // Same live feed as the app
  const { data, initIfMissing } = useStoreFeed(storeId, region);

  useEffect(() => {
    initIfMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, region]);

  const queue = useMemo(() => (data.queue ?? []) as Entry[], [data.queue]);
  const active = useMemo(() => (data.active ?? []) as Entry[], [data.active]);
  const completed = useMemo(
    () => (data.completed ?? []) as Entry[],
    [data.completed]
  );

  const initials = (e: Entry) =>
    `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase();

  const fullLabel = (e: Entry) =>
    e.teamLabel ? e.teamLabel : `${e.firstName} ${e.lastName}`.trim();

  const fmtTime = (ts?: number) =>
    ts
      ? new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";

  const fmtSince = (start?: number) => {
    if (!start) return "";
    const diff = Math.floor((Date.now() - start) / 1000);
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
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

  //comment for fmt helpers?
const earlyReasonLabel = (r?: Entry["earlyReason"]) => {
  if (!r) return "";
  if (r === "service") return "Service";
  if (r === "parts") return "Parts";
  if (r === "finance") return "Finance";
  return "Other";
};


  // Badges for join type and duration

  const joinBadge = (e: Entry) => {
  if (!e.joinType) return null;

  const jt =
    e.joinType === ("appointment" as any) ? ("appt-phone" as const) : e.joinType;

  const map: Record<
    "walk-in" | "appt-phone" | "appt-online",
    { label: string; icon: React.ReactNode }
  > = {
    "walk-in": { label: "Walk-in", icon: <DoorOpen size={14} /> },
    "appt-phone": { label: "Appt (Phone)", icon: <Phone size={14} /> },
    "appt-online": { label: "Appt (Online)", icon: <Globe size={14} /> },
  };

  const cfg = map[jt as "walk-in" | "appt-phone" | "appt-online"];
  if (!cfg) return null;

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-100 border border-slate-700">
      {cfg.icon}
      <span className="font-medium">{cfg.label}</span>
    </span>
  );
};

const durationBadge = (e: Entry) => {
  if (!e.durationSec) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs">
      <Timer size={12} />
      <span className="font-medium text-slate-100">
        {formatDuration(e.durationSec)}
      </span>
    </span>
  );
};


  // live tick so bars animate / update
const [now, setNow] = useState(() => Date.now());
useEffect(() => {
  const id = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(id);
}, []);

const minutesSince = (start?: number) =>
  start ? Math.floor((now - start) / 60000) : 0;

// same thresholds as Queue.tsx
const barStyle = (mins: number) => {
  const width = `${Math.min(mins, 120) / 1.2}%`; // 0..100 over 0..120 min

  const background =
    mins <= 25
      ? "#16a34a"
      : mins <= 30
      ? "linear-gradient(to right, #16a34a 0%, #16a34a 40%, #facc15 100%)"
      : mins <= 55
      ? "#facc15"
      : mins <= 60
      ? "linear-gradient(to right, #facc15 0%, #facc15 40%, #f97316 100%)"
      : mins <= 85
      ? "#f97316"
      : mins <= 90
      ? "linear-gradient(to right, #f97316 0%, #f97316 40%, #dc2626 100%)"
      : "#dc2626";

  return { width, background };
};


  const matchSearch = (e: Entry) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = `${e.firstName ?? ""} ${e.lastName ?? ""}`.toLowerCase();
    const team = (e.teamLabel ?? "").toLowerCase();
    const note = (e.note ?? "").toLowerCase();
    return name.includes(q) || team.includes(q) || note.includes(q);
  };

  const filteredQueue = useMemo(() => queue.filter(matchSearch), [queue, search]);
  const filteredActive = useMemo(() => active.filter(matchSearch), [active, search]);
  const filteredCompleted = useMemo(
    () => completed.filter(matchSearch),
    [completed, search]
  );

  const todayLabel = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Sidebar buttons (multi-box toggle)
  const navItem = (key: PanelKey, label: string, count?: number, icon?: string) => {
    const activeCls =
      panel === key
        ? "bg-blue-600/20 border-blue-500/40 text-blue-100"
        : "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800";

    return (
      <button
        key={key}
        type="button"
        onClick={() => setPanel(key)}
        className={`w-full rounded-xl border px-3 py-2 text-left transition ${activeCls}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">{icon ?? "•"}</span>
            <span className="text-sm font-semibold">{label}</span>
          </div>

          {typeof count === "number" && (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200 border border-slate-700">
              {count}
            </span>
          )}
        </div>
      </button>
    );
  };

 // Reusable list card
const ListCard = ({
  title,
  rows,
  rightMeta,
  miniBarForRow,
}: {
  title: string;
  rows: Entry[];
  rightMeta?: (e: Entry) => string;
  miniBarForRow?: (e: Entry) => { width: string; background: string } | null;
}) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-800 font-semibold text-slate-200 flex items-center justify-between">
      <span>{title}</span>
      {search.trim() ? (
        <span className="text-xs text-slate-400">Filtered</span>
      ) : null}
    </div>

    <div className="divide-y divide-slate-800">
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-sm text-slate-400">None</div>
      ) : (
        rows.map((e, idx) => (
          <div key={e.id} className="px-4 py-3">
            {/* ROW HEADER (avatar + name + right side badges/meta) */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
              {/* Avatar */}
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-white text-xs font-semibold">
                {initials(e)}
              </div>

              {/* Name + note */}
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-100 truncate">
                  {title === "Queue"
                    ? `${idx + 1}. ${fullLabel(e)}`
                    : fullLabel(e)}
                </div>

                {e.note ? (
                  <div className="text-xs text-slate-300 italic truncate">
                    {e.note}
                  </div>
                ) : null}
              </div>

              {/* Right side (Completed gets badges; others get rightMeta) */}
              {title === "Completed" ? (
                <div className="col-span-2 justify-self-end flex items-center gap-2 flex-wrap">
                  {e.earlyReason ? (
                    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-100">
                      Needed:
                      <span className="ml-1 font-medium">
                        {earlyReasonLabel(e.earlyReason)}
                      </span>
                    </span>
                  ) : null}

                  {joinBadge(e)}
                  {durationBadge(e)}
                </div>
              ) : rightMeta ? (
                <div className="col-span-2 text-[11px] text-slate-400 whitespace-nowrap justify-self-end">
                  {rightMeta(e)}
                </div>
              ) : (
                <div className="col-span-2" />
              )}
            </div>

            {/* MINI TIMER BAR (thin, no layout change) */}
            {miniBarForRow
              ? (() => {
                  const s = miniBarForRow(e);
                  if (!s) return null;
                  return (
                    <div className="mt-2 h-[3px] w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ width: s.width, background: s.background }}
                      />
                    </div>
                  );
                })()
              : null}
          </div>
        ))
      )}
    </div>
  </div>
);



  return (
    <AuthGate onStoreId={setStoreId}>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 text-slate-100">
        <div className="flex">
          {/* LEFT SIDEBAR */}
            <Sidebar
            expanded={sidebarOpen}
            onToggle={() => setSidebarOpen((v) => !v)}
            top={
                <img
                src="/brand-logo.png"
                alt="Logo"
                className="h-full w-full object-contain"
                />
            }
            >
            <SidebarItem icon={<List size={18} />} text="Queue"
                count={queue.length}
                active={panel === "queue"}
                onClick={() => {
                setPanel("queue");
                setSidebarOpen(true);
                }}
            />

            <SidebarItem icon={<Users size={18} />} text="With Customers"
                count={active.length}
                active={panel === "active"}
                onClick={() => {
                setPanel("active");
                setSidebarOpen(true);
                }}
            />

            <SidebarItem icon={<CheckCircle size={18} />} text="Completed"
                count={completed.length}
                active={panel === "completed"}
                onClick={() => {
                setPanel("completed");
                setSidebarOpen(true);
                }}
            />

            <li className="my-2">
                <div className="h-px bg-slate-800/80 w-full" />
            </li>

            <SidebarItem
                icon={<Handshake size={18} />}
                text="Team (soon)"
                disabled
                />

                <SidebarItem
                icon={<BarChart3 size={18} />}
                text="Analytics (soon)"
                disabled
                />

            </Sidebar>



          {/* MAIN */}
          <main className="flex-1">
            {/* TOP BAR */}
            <div className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur px-5 py-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                <div className="text-xl font-bold truncate">Manager Dashboard</div>
                <div className="text-xs text-slate-400">{todayLabel}</div>
                </div>

                <div className="flex items-center gap-2">
                <div className="relative">
                    <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Quick Search"
                    className="w-56 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
                    />
                </div>

                <select
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                >
                    <option value="North">North</option>
                    <option value="South">South</option>
                </select>
                </div>
            </div>

            {/* Small stat chips */}
            <div className="mt-3 flex flex-wrap gap-2">
                <div className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-200">
                Queue: <span className="font-semibold">{queue.length}</span>
                </div>

                <div className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-200">
                With Customers: <span className="font-semibold">{active.length}</span>
                </div>

                <div className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-200">
                Completed: <span className="font-semibold">{completed.length}</span>
                </div>

                {search.trim() ? (
                <div className="rounded-full border border-blue-500/40 bg-blue-600/20 px-3 py-1 text-xs text-blue-100">
                    Searching: <span className="font-semibold">{search.trim()}</span>
                </div>
                ) : null}
            </div>

            {/* Divider line (matches sidebar) */}
            <div className="mt-3 h-px bg-slate-800/80 w-full" />
            </div>

            {/* BODY */}
            <div className="p-6 space-y-6">
              {/* Mobile multi-box toggle (shows when sidebar hidden) */}
              <div className="md:hidden grid grid-cols-2 gap-2">
                {navItem("queue", "Queue", queue.length, "📋")}
                {navItem("active", "With Customers", active.length, "🧑‍🤝‍🧑")}
                {navItem("completed", "Completed", completed.length, "✅")}
                {navItem("analytics", "Analytics", undefined, "📈")}
              </div>

              {/* Panels */}
              {panel === "queue" && (
                <ListCard
                  title="Queue"
                  rows={filteredQueue}
                  rightMeta={(e) => (e.joinedAt ? `Joined ${fmtTime(e.joinedAt)}` : "")}/>
              )}

              {panel === "active" && (
                <ListCard
                    title="With Customers"
                    rows={filteredActive}
                    rightMeta={(e) => (e.serviceStart ? fmtSince(e.serviceStart) : "")}
                    miniBarForRow={(e) => {
                    if (!e.serviceStart) return null;
                    const mins = minutesSince(e.serviceStart);
                    return barStyle(mins);
                    }}
                />
                )}

              {panel === "completed" && (
                <ListCard
                  title="Completed"
                  rows={filteredCompleted}
                  rightMeta={(e) => (e.managers?.length ? `${e.managers.length} mgr` : "")}
                />
              )}

              {panel === "team" && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <div className="text-lg font-semibold">Team</div>
                  <div className="text-sm text-slate-400 mt-1">
                    Placeholder for a “reps on floor / team status” view.
                  </div>
                </div>
              )}

              {panel === "analytics" && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <div className="text-lg font-semibold">Analytics</div>
                  <div className="text-sm text-slate-400 mt-1">
                    Placeholder for later: wait times, rep totals, etc.
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
