import { useEffect, useMemo, useState, useCallback } from "react";
import { AuthGate } from "../components/AuthGate";
import { useStoreFeed, type QueueEntry } from "../lib/useStoreFeed";
import { Sidebar, SidebarItem } from "../components/Sidebar";
import { List, Users, CheckCircle, Handshake, BarChart3, DoorOpen, Phone, Globe, Timer, UserCog, UserX,} from "lucide-react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, updateDoc, deleteDoc, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";



type Entry = QueueEntry & { originalQueueIndex?: number };

type PanelKey = "queue" | "active" | "completed" | "team" | "analytics" | "users" | "unassigned";

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
  const { data, initIfMissing } = useStoreFeed(storeId || "store-placeholder", region);

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

// User management
  type UserRecord = {
    uid: string;
    email: string;
    displayName: string;
    role: string;
    storeId: string;
  }; 

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [currentUserStoreId, setCurrentUserStoreId] = useState<string>("");

  // Add user modal state
const [addUserModalOpen, setAddUserModalOpen] = useState(false);
const [newUserFirstName, setNewUserFirstName] = useState("");
const [newUserLastName, setNewUserLastName] = useState("");
const [newUserEmail, setNewUserEmail] = useState("");
const [newUserStoreId, setNewUserStoreId] = useState("");
const [newUserRole, setNewUserRole] = useState("sales");
const [newUserSaving, setNewUserSaving] = useState(false);
const [newUserError, setNewUserError] = useState("");


  // Fetch current user's role and storeId
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) return;
      getDoc(doc(db, "users", u.uid)).then((snap) => {
        setCurrentUserRole(snap.data()?.role ?? "");
        setCurrentUserStoreId(snap.data()?.storeId ?? "");
      });
    });
    return () => unsubscribe();
  }, []);

  const isOwner = currentUserRole === "owner";
  const isAdminOrOwner = currentUserRole === "admin" || currentUserRole === "owner";

  const fetchUsers = useCallback(async () => {
    if (!isAdminOrOwner) return;
    setUsersLoading(true);
    const snap = await getDocs(collection(db, "users"));
    const list: UserRecord[] = snap.docs.map((d) => ({
      uid: d.id,
      email: d.data().email ?? "",
      displayName: d.data().displayName ?? "",
      role: d.data().role ?? "sales",
      storeId: d.data().storeId ?? "",
    }));
    setUsers(list);
    setUsersLoading(false);
  }, [isAdminOrOwner]);

  useEffect(() => {
    if (panel === "users" || panel === "unassigned") {
      fetchUsers();
    }
  }, [panel, fetchUsers]);

  async function updateUser(uid: string, field: "role" | "storeId", value: string) {
    await updateDoc(doc(db, "users", uid), { [field]: value });
    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, [field]: value } : u))
    );
  }

  async function removeUser(uid: string) {
    if (!confirm("Remove this user? They will lose all access.")) return;
    await deleteDoc(doc(db, "users", uid));
    setUsers((prev) => prev.filter((u) => u.uid !== uid));
  }

  async function createUser() {
  const fn = newUserFirstName.trim();
  const ln = newUserLastName.trim();
  const em = newUserEmail.trim().toLowerCase();

  if (!fn) { setNewUserError("First name is required."); return; }
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setNewUserError("Valid email is required."); return; }
  if (!em.endsWith("@daltoncorp.com")) { setNewUserError("Must be a @daltoncorp.com email."); return; }
  if (!newUserStoreId) { setNewUserError("Please select a store."); return; }

  const uid = em.replace(/[^a-z0-9]/g, '_');
  const userRef = doc(db, "users", uid);

  setNewUserSaving(true);
  setNewUserError("");

  try {
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      setNewUserError("A user with this email already exists.");
      setNewUserSaving(false);
      return;
    }

    await setDoc(userRef, {
      displayName: ln ? `${fn} ${ln}` : fn,
      email: em,
      role: newUserRole,
      storeId: newUserStoreId,
      createdAt: serverTimestamp(),
    });

    setAddUserModalOpen(false);
    setNewUserFirstName("");
    setNewUserLastName("");
    setNewUserEmail("");
    setNewUserStoreId("");
    setNewUserRole("sales");
    setNewUserError("");
    await fetchUsers();
  } catch (e) {
    console.error("createUser failed", e);
    setNewUserError("Failed to create user. Check console.");
  } finally {
    setNewUserSaving(false);
  }
}

  // Owner sees all assigned users, admin sees only their store
  const assignedUsers = useMemo(() => {
    if (isOwner) return users.filter((u) => u.storeId !== "" && u.role !== "owner" && u.uid !== auth.currentUser?.uid);
    return users.filter((u) => u.storeId === currentUserStoreId && u.role !== "owner" && u.uid !== auth.currentUser?.uid);
  }, [users, isOwner, currentUserStoreId]);

  // Both owner and admin can see unassigned
  const unassignedUsers = useMemo(
    () => users.filter((u) => u.storeId === "" && u.uid !== auth.currentUser?.uid),
    [users]
  );

  // What stores can this user assign to
  const assignableStores = isOwner
    ? [
        { value: "store-toyota", label: "Toyota" },
        { value: "store-subaru", label: "Subaru" },
        { value: "store-hyundai", label: "Hyundai" },
      ]
    : [
        {
          value: currentUserStoreId,
          label:
            currentUserStoreId === "store-toyota"
              ? "Toyota"
              : currentUserStoreId === "store-subaru"
              ? "Subaru"
              : "Hyundai",
        },
      ];

  // What roles can this user assign
  const assignableRoles = isOwner
    ? ["sales", "manager", "admin"]
    : ["sales", "manager"];

  // Can this user remove a target user
  function canRemove(target: UserRecord) {
    if (isOwner) return true;
    return target.storeId === currentUserStoreId;
  }

  // Can this user change the store of a target user
  function canChangeStore(target: UserRecord) {
    if (isOwner) return true;
    // Admin can only assign unassigned users to their store
    return target.storeId === "";
  }

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
      {!storeId ? null : <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 text-slate-100">
        <div className="flex">

          {/* ADD USER MODAL */}
{addUserModalOpen && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    onClick={() => !newUserSaving && setAddUserModalOpen(false)}
  >
    <div
      className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="text-lg font-semibold text-slate-100 mb-4">Add New User</h2>
      <div className="flex flex-col gap-3">
        <input
          value={newUserFirstName}
          onChange={(e) => setNewUserFirstName(e.target.value)}
          placeholder="First name *"
          className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
          disabled={newUserSaving}
        />
        <input
          value={newUserLastName}
          onChange={(e) => setNewUserLastName(e.target.value)}
          placeholder="Last name (optional)"
          className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
          disabled={newUserSaving}
        />
        <input
          value={newUserEmail}
          onChange={(e) => setNewUserEmail(e.target.value)}
          placeholder="Email (@daltoncorp.com) *"
          type="email"
          autoCapitalize="none"
          className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
          disabled={newUserSaving}
        />
        <select
          value={newUserStoreId}
          onChange={(e) => setNewUserStoreId(e.target.value)}
          className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
          disabled={newUserSaving}
        >
          <option value="">— Select store —</option>
          {assignableStores.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={newUserRole}
          onChange={(e) => setNewUserRole(e.target.value)}
          className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
          disabled={newUserSaving}
        >
          {assignableRoles.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        {newUserError && (
          <p className="text-xs text-red-400">{newUserError}</p>
        )}
      </div>
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => !newUserSaving && setAddUserModalOpen(false)}
          className="flex-1 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          disabled={newUserSaving}
        >
          Cancel
        </button>
        <button
          onClick={createUser}
          className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          disabled={newUserSaving}
        >
          {newUserSaving ? "Saving..." : "Create User"}
        </button>
      </div>
    </div>
  </div>
)}


          {/* LEFT SIDEBAR */}
            <Sidebar
            expanded={sidebarOpen}
            onToggle={() => setSidebarOpen((v) => !v)}
            top={
                <img
                src="/daltonicon.png"
                alt="Dalton Icon"
                className="h-full w-full object-cover"
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

            {isAdminOrOwner && (
              <>
                <li className="my-2">
                  <div className="h-px bg-slate-800/80 w-full" />
                </li>
                <SidebarItem
                  icon={<UserCog size={18} />}
                  text="All Users"
                  count={assignedUsers.length}
                  active={panel === "users"}
                  onClick={() => { setPanel("users"); setSidebarOpen(true); }}
                />
                <SidebarItem
                  icon={<UserX size={18} />}
                  text="Unassigned"
                  count={unassignedUsers.length}
                  active={panel === "unassigned"}
                  onClick={() => { setPanel("unassigned"); setSidebarOpen(true); }}
                />
              </>
            )}

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
                <button
                  onClick={() => signOut(auth)}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
                >
                  Sign out
                </button>
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

              {(panel === "users" || panel === "unassigned") && isAdminOrOwner && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 font-semibold text-slate-200 flex items-center justify-between">
                  <span>{panel === "users" ? "All Users" : "Unassigned Users"}</span>
                  <div className="flex items-center gap-2">
                    {isAdminOrOwner && (
                      <button
                        onClick={() => {
                          setNewUserError("");
                          setAddUserModalOpen(true);
                        }}
                        className="text-xs text-blue-400 hover:text-blue-200 border border-blue-800 rounded-lg px-2 py-1"
                      >
                        + Add User
                      </button>
                    )}
                    <button
                      onClick={fetchUsers}
                      className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg px-2 py-1"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                  {usersLoading ? (
                    <div className="px-4 py-4 text-sm text-slate-400">Loading...</div>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {(panel === "users" ? assignedUsers : unassignedUsers).length === 0 ? (
                        <div className="px-4 py-4 text-sm text-slate-400">None</div>
                      ) : (
                        (panel === "users" ? assignedUsers : unassignedUsers).map((u) => (
                          <div key={u.uid} className="px-4 py-3 flex flex-col gap-2">
                            {/* Name + email */}
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-white text-xs font-semibold">
                                {(u.displayName?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-100 truncate">
                                  {u.displayName || "No name set"}
                                </div>
                                <div className="text-xs text-slate-400 truncate">{u.email}</div>
                              </div>
                              {/* Store badge */}
                              {u.storeId && (
                                <span className="ml-auto text-xs rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                                  {u.storeId === "store-toyota" ? "Toyota" : u.storeId === "store-subaru" ? "Subaru" : "Hyundai"}
                                </span>
                              )}
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Store selector */}
                              <select
                                value={u.storeId}
                                disabled={!canChangeStore(u)}
                                onChange={(e) => updateUser(u.uid, "storeId", e.target.value)}
                                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none disabled:opacity-40"
                              >
                                <option value="">— No store —</option>
                                {assignableStores.map((s) => (
                                  <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                              </select>

                              {/* Role selector */}
                              <select
                                value={u.role}
                                disabled={!canRemove(u)}
                                onChange={(e) => updateUser(u.uid, "role", e.target.value)}
                                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none disabled:opacity-40"
                              >
                                {assignableRoles.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>

                              {/* Remove button */}
                              {canRemove(u) && (
                                <button
                                  onClick={() => removeUser(u.uid)}
                                  className="ml-auto text-xs text-red-400 hover:text-red-300 border border-red-900 rounded-lg px-2 py-1"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
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
      </div>}
    </AuthGate>
  );
}
