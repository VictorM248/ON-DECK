import { useEffect, useMemo, useState, useCallback } from "react";
import { AuthGate } from "../components/AuthGate";
import { useStoreFeed, type QueueEntry } from "../lib/useStoreFeed";
import { Sidebar, SidebarItem } from "../components/Sidebar";
import { List, Users, CheckCircle, Handshake, BarChart3, DoorOpen, Phone, Globe, Timer, UserCog, UserX, Settings } from "lucide-react";
import { auth, db } from "../lib/firebase";
import { useStoreSettings } from "../lib/useStoreSettings";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, updateDoc, deleteDoc, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";



type Entry = QueueEntry & { originalQueueIndex?: number };

type PanelKey = "queue" | "active" | "completed" | "team" | "analytics" | "users" | "unassigned" | "settings";

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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  //Comment divider for sidebar collapse
  const [sidebarOpen, setSidebarOpen] = useState(() => {
  return localStorage.getItem("mgrSidebarOpen") !== "0";
    });

    useEffect(() => {
    localStorage.setItem("mgrSidebarOpen", sidebarOpen ? "1" : "0");
    }, [sidebarOpen]);

  // Same live feed as the app
  const { initIfMissing } = useStoreFeed(storeId || "store-placeholder", region);
  const { data: dataNorth } = useStoreFeed(storeId || "store-placeholder", "North");
  const { data: dataSouth } = useStoreFeed(storeId || "store-placeholder", "South");
  const { settings, updateSetting } = useStoreSettings(storeId || "store-placeholder");

  useEffect(() => {
    initIfMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, region]);

  const queue = useMemo(() => [
    ...(dataNorth.queue ?? []) as Entry[],
    ...(dataSouth.queue ?? []) as Entry[],
  ], [dataNorth.queue, dataSouth.queue]);
  const active = useMemo(() => [
    ...(dataNorth.active ?? []) as Entry[],
    ...(dataSouth.active ?? []) as Entry[],
  ], [dataNorth.active, dataSouth.active]);
  const completed = useMemo(() => [
    ...(dataNorth.completed ?? []) as Entry[],
    ...(dataSouth.completed ?? []) as Entry[],
  ], [dataNorth.completed, dataSouth.completed]);
  const queueNorth = useMemo(() => (dataNorth.queue ?? []) as Entry[], [dataNorth.queue]);
  const queueSouth = useMemo(() => (dataSouth.queue ?? []) as Entry[], [dataSouth.queue]);

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
    { label: string; icon: React.ReactNode; cls: string }
  > = {
    "walk-in": {
      label: "Walk-in",
      icon: <DoorOpen size={14} />,
      cls: "bg-slate-100 text-slate-600 border-slate-200",
    },
    "appt-phone": {
      label: "Appt (Phone)",
      icon: <Phone size={14} />,
      cls: "bg-blue-50 text-blue-700 border-blue-200",
    },
    "appt-online": {
      label: "Appt (Online)",
      icon: <Globe size={14} />,
      cls: "bg-green-50 text-green-700 border-green-200",
    },
  };

  const cfg = map[jt as "walk-in" | "appt-phone" | "appt-online"];
  if (!cfg) return null;

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs border ${cfg.cls}`}>
      {cfg.icon}
      <span className="font-medium">{cfg.label}</span>
    </span>
  );
};

const durationBadge = (e: Entry) => {
  if (!e.durationSec) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs">
      <Timer size={12} className="text-indigo-500" />
      <span className="font-medium text-indigo-700">
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
  const [analyticsMonth, setAnalyticsMonth] = useState(() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
});
const [rangeMode, setRangeMode] = useState<"day" | "week" | "month">("month");
const [analyticsDay, setAnalyticsDay] = useState(() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
});
const [analyticsWeek, setAnalyticsWeek] = useState(() => {
  const now = new Date();
  const year = now.getFullYear();
  // ISO week number
  const startOfYear = new Date(year, 0, 1);
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
});
  const [archiveEntries, setArchiveEntries] = useState<Entry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [currentUserStoreId, setCurrentUserStoreId] = useState<string>("");

 // Add user modal state
const [addUserModalOpen, setAddUserModalOpen] = useState(false);
const [addToQueueModalOpen, setAddToQueueModalOpen] = useState(false);
const [newUserFirstName, setNewUserFirstName] = useState("");
const [newUserLastName, setNewUserLastName] = useState("");
const [newUserEmail, setNewUserEmail] = useState("");
const [newUserStoreId, setNewUserStoreId] = useState("");
const [newUserRole, setNewUserRole] = useState("sales");
const [newUserSaving, setNewUserSaving] = useState(false);
const [newUserError, setNewUserError] = useState("");

// With Customers completion flow state
const [mgrCompleteEntryId, setMgrCompleteEntryId] = useState<string | null>(null);
const [mgrReturnPosition, setMgrReturnPosition] = useState<"top" | "bottom">("bottom");
const [mgrEarlyReasonModalOpen, setMgrEarlyReasonModalOpen] = useState(false);
const [mgrEarlyReason, setMgrEarlyReason] = useState<"service" | "parts" | "finance" | "other" | null>(null);
const [mgrOutcomeModalOpen, setMgrOutcomeModalOpen] = useState(false);
const [mgrVisitOutcome, setMgrVisitOutcome] = useState<{ testDrive?: boolean; proposal?: boolean; sold?: boolean; deposit?: boolean; vehicleType?: "new" | "used" | "n/a" }>({});
const [mgrPendingReason, setMgrPendingReason] = useState<"service" | "parts" | "finance" | "other" | undefined>(undefined);
const [mgrSelectedManagerIds, setMgrSelectedManagerIds] = useState<string[]>([]);
const [mgrDoneActiveId, setMgrDoneActiveId] = useState<string | null>(null);
const [mgrManagerUsers, setMgrManagerUsers] = useState<{ uid: string; displayName: string }[]>([]);
const [mgrStartEntryId, setMgrStartEntryId] = useState<string | null>(null);
const [mgrStartRegion, setMgrStartRegion] = useState<string>("");


  // Fetch current user's role and storeId
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) return;
      const emailUid = (u.email ?? "").toLowerCase().replace(/[^a-z0-9]/g, "_");
      getDoc(doc(db, "users", emailUid)).then((snap) => {
        setCurrentUserRole(snap.data()?.role ?? "");
        setCurrentUserStoreId(snap.data()?.storeId ?? "");
      });
    });
    return () => unsubscribe();
  }, []);

  const isOwner = currentUserRole === "owner";
  const isAdminOrOwner = currentUserRole === "admin" || currentUserRole === "owner";
  const isManagerLike = currentUserRole === "manager" || currentUserRole === "admin" || currentUserRole === "owner";

  const closeMgrCompleteModal = () => {
    setMgrCompleteEntryId(null);
    setMgrSelectedManagerIds([]);
    setMgrReturnPosition("bottom");
    setMgrEarlyReasonModalOpen(false);
    setMgrEarlyReason(null);
    setMgrOutcomeModalOpen(false);
    setMgrVisitOutcome({});
    setMgrPendingReason(undefined);
    setMgrDoneActiveId(null);
  };

  const handleMgrConfirmComplete = async (reason?: "service" | "parts" | "finance" | "other", outcome?: typeof mgrVisitOutcome) => {
    if (!mgrCompleteEntryId) return;
    const regionActive = dataNorth.active?.some((a) => a.id === mgrCompleteEntryId)
      ? (dataNorth.active ?? []) as Entry[]
      : (dataSouth.active ?? []) as Entry[];
    const regionQueue = dataNorth.active?.some((a) => a.id === mgrCompleteEntryId)
      ? (dataNorth.queue ?? []) as Entry[]
      : (dataSouth.queue ?? []) as Entry[];
    const entry = regionActive.find((e) => e.id === mgrCompleteEntryId);
    if (!entry) { closeMgrCompleteModal(); return; }

    const idToName = new Map<string, string>();
    for (const m of mgrManagerUsers) idToName.set(m.uid, m.displayName);
    const managersList = mgrSelectedManagerIds
      .map((id) => idToName.get(id))
      .filter((x): x is string => Boolean(x));

    const end = Date.now();
    const durationSec = entry.serviceStart
      ? Math.max(0, Math.round((end - entry.serviceStart) / 1000))
      : undefined;

    const completedEntry: Entry = {
      id: entry.id,
      firstName: entry.firstName,
      lastName: entry.lastName,
      email: entry.email,
      note: entry.note ?? "",
      joinedAt: entry.joinedAt,
      ...(entry.joinType ? { joinType: entry.joinType } : {}),
      ...(entry.teamLabel ? { teamLabel: entry.teamLabel } : {}),
      ...(entry.originalQueueIndex !== undefined ? { originalQueueIndex: entry.originalQueueIndex } : {}),
      ...(managersList.length > 0 ? { managers: managersList } : {}),
      ...(reason ?? mgrEarlyReason ? { earlyReason: reason ?? mgrEarlyReason ?? undefined } : {}),
      serviceEnd: end,
      ...(durationSec !== undefined ? { durationSec } : {}),
      visitOutcome: outcome ?? mgrVisitOutcome,
    };

    const canSendTop = entry.serviceStart ? now - entry.serviceStart < 2 * 60 * 1000 : true;
    const finalPosition = mgrReturnPosition === "top" && canSendTop ? "top" : "bottom";

    const requeuedEntry: Entry = {
      id: crypto.randomUUID(),
      firstName: entry.firstName,
      lastName: entry.lastName,
      email: entry.email,
      note: "",
      joinedAt: Date.now(),
    };

    const nextActive = regionActive.filter((e) => e.id !== mgrCompleteEntryId);
    const nextCompleted = [...(dataNorth.active?.some((a) => a.id === mgrCompleteEntryId) ? (dataNorth.completed ?? []) : (dataSouth.completed ?? [])) as Entry[], completedEntry];

    let nextQueue: Entry[];
    if (finalPosition === "top") {
      const originalIndex = typeof entry.originalQueueIndex === "number" ? entry.originalQueueIndex : 0;
      const safeIndex = Math.max(0, Math.min(originalIndex, regionQueue.length));
      nextQueue = [...regionQueue];
      nextQueue.splice(safeIndex, 0, requeuedEntry);
    } else {
      nextQueue = [...regionQueue, requeuedEntry];
    }

    const entryRegion = dataNorth.active?.some((a) => a.id === mgrCompleteEntryId) ? "North" : "South";
    const regionRef = doc(db, "stores", storeId, "regions", entryRegion);
    await updateDoc(regionRef, { queue: nextQueue, active: nextActive, completed: nextCompleted });
    closeMgrCompleteModal();
  };

  const handleMgrSendBackToQueue = async () => {
    if (!mgrDoneActiveId) return;
    const regionActive = dataNorth.active?.some((a) => a.id === mgrDoneActiveId)
      ? (dataNorth.active ?? []) as Entry[]
      : (dataSouth.active ?? []) as Entry[];
    const regionQueue = dataNorth.active?.some((a) => a.id === mgrDoneActiveId)
      ? (dataNorth.queue ?? []) as Entry[]
      : (dataSouth.queue ?? []) as Entry[];
    const entry = regionActive.find((e) => e.id === mgrDoneActiveId);
    if (!entry) { setMgrDoneActiveId(null); return; }

    const idToName = new Map<string, string>();
    for (const m of mgrManagerUsers) idToName.set(m.uid, m.displayName);
    const helpers = mgrSelectedManagerIds
      .map((id) => idToName.get(id))
      .filter((x): x is string => Boolean(x));

    const originalIndex = typeof entry.originalQueueIndex === "number" ? entry.originalQueueIndex : regionQueue.length;
    const safeIndex = Math.max(0, Math.min(originalIndex, regionQueue.length));

    const cleaned: Entry = {
      id: entry.id,
      firstName: entry.firstName,
      lastName: entry.lastName,
      email: entry.email,
      note: entry.note ?? "",
      joinedAt: entry.joinedAt,
      originalQueueIndex: entry.originalQueueIndex,
      ...(helpers.length > 0 ? { managers: helpers } : entry.managers ? { managers: entry.managers } : {}),
    };

    const nextActive = regionActive.filter((e) => e.id !== mgrDoneActiveId);
    const nextQueue = [...regionQueue];
    nextQueue.splice(safeIndex, 0, cleaned);

    const entryRegion = dataNorth.active?.some((a) => a.id === mgrDoneActiveId) ? "North" : "South";
    const regionRef = doc(db, "stores", storeId, "regions", entryRegion);
    const regionCompleted = entryRegion === "North" ? (dataNorth.completed ?? []) as Entry[] : (dataSouth.completed ?? []) as Entry[];
    await updateDoc(regionRef, { queue: nextQueue, active: nextActive, completed: regionCompleted });
    setMgrDoneActiveId(null);
    setMgrSelectedManagerIds([]);
  };

  const reorderQueue = useCallback(async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    const ref = doc(db, "stores", storeId, "regions", region);
    await updateDoc(ref, { queue: newQueue });
  }, [queue, storeId, region]);

  const fetchAnalytics = useCallback(async () => {
  if (!storeId) return;
  setArchiveLoading(true);
  setSelectedSalesperson(null);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Compute start/end ms for filtering
  let filterStart: number | null = null;
  let filterEnd: number | null = null;

  if (rangeMode === "day") {
    const d = new Date(analyticsDay + "T00:00:00");
    filterStart = d.getTime();
    filterEnd = d.getTime() + 86400000;
  } else if (rangeMode === "week") {
    // Parse YYYY-Www
    const [yearStr, weekStr] = analyticsWeek.split("-W");
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    const jan1 = new Date(year, 0, 1);
    const daysToMonday = (8 - jan1.getDay()) % 7;
    const firstMonday = new Date(jan1.getTime() + daysToMonday * 86400000);
    filterStart = firstMonday.getTime() + (week - 1) * 7 * 86400000;
    filterEnd = filterStart + 7 * 86400000;
  }

  // Determine which month(s) to fetch from Firestore
  const monthToFetch = rangeMode === "month"
    ? analyticsMonth
    : rangeMode === "day"
    ? analyticsDay.slice(0, 7)
    : analyticsWeek.slice(0, 4) + "-" + String(parseInt(analyticsWeek.slice(6)) > 0 ? analyticsWeek.slice(6) : "01").padStart(2, "0");

  let entries: Entry[] = [];

  if (monthToFetch === currentMonth) {
    const north = await getDoc(doc(db, "stores", storeId, "regions", "North"));
    const south = await getDoc(doc(db, "stores", storeId, "regions", "South"));
    entries = [
      ...((north.data()?.completed ?? []) as Entry[]),
      ...((south.data()?.completed ?? []) as Entry[]),
    ];
  } else {
    const archiveSnap = await getDoc(doc(db, "stores", storeId, "archive", monthToFetch));
    entries = (archiveSnap.data()?.entries ?? []) as Entry[];
  }

  // Apply day/week filter client-side using serviceEnd
  if (filterStart !== null && filterEnd !== null) {
    entries = entries.filter(
      (e) => e.serviceEnd && e.serviceEnd >= filterStart! && e.serviceEnd < filterEnd!
    );
  }

  setArchiveEntries(entries);
  setArchiveLoading(false);
}, [storeId, analyticsMonth, analyticsDay, analyticsWeek, rangeMode]);

  useEffect(() => {
    if (panel === "analytics") fetchAnalytics();
  }, [panel, fetchAnalytics]);

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
    fetchUsers();
  }, [fetchUsers]);

  // Fetch manager users for the completion flow
  useEffect(() => {
    if (!storeId) return;
    getDocs(collection(db, "users")).then((snap) => {
      const managers = snap.docs
        .filter((d) => ["manager", "admin", "owner"].includes(d.data().role ?? "") && d.data().storeId === currentUserStoreId)
        .map((d) => ({ uid: d.id, displayName: d.data().displayName ?? "" }));
      setMgrManagerUsers(managers);
    });
  }, [storeId, currentUserStoreId]);

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
  ? ["sales", "manager", "admin", "owner"]
  : isAdminOrOwner
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

  const analyticsBySalesperson = useMemo(() => {
    const map = new Map<string, {
      name: string;
      email: string;
      visits: number;
      testDrive: number;
      proposal: number;
      sold: number;
      deposit: number;
      newVehicle: number;
      usedVehicle: number;
      totalDuration: number;
      durationCount: number;
    }>();

    for (const e of archiveEntries) {
      const email = e.email?.toLowerCase() ?? "unknown";
      const name = `${e.firstName} ${e.lastName}`.trim();
      if (!map.has(email)) {
        map.set(email, { name, email, visits: 0, testDrive: 0, proposal: 0, sold: 0, deposit: 0, newVehicle: 0, usedVehicle: 0, totalDuration: 0, durationCount: 0 });
      }
      const s = map.get(email)!;
      s.visits++;
      if (e.visitOutcome?.testDrive) s.testDrive++;
      if (e.visitOutcome?.proposal) s.proposal++;
      if (e.visitOutcome?.sold) s.sold++;
      if (e.visitOutcome?.deposit) s.deposit++;
      if (e.visitOutcome?.vehicleType === "new") s.newVehicle++;
      if (e.visitOutcome?.vehicleType === "used") s.usedVehicle++;
      if (e.durationSec) { s.totalDuration += e.durationSec; s.durationCount++; }
    }

    return Array.from(map.values()).sort((a, b) => b.visits - a.visits);
  }, [archiveEntries]);

  const matchSearch = (e: Entry) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = `${e.firstName ?? ""} ${e.lastName ?? ""}`.toLowerCase();
    const team = (e.teamLabel ?? "").toLowerCase();
    const note = (e.note ?? "").toLowerCase();
    return name.includes(q) || team.includes(q) || note.includes(q);
  };

  const filteredQueue = useMemo(() => queue.filter(matchSearch), [queue, search]);
  const filteredActive = useMemo(() => {
    const allActive = [
      ...(dataNorth.active ?? []) as Entry[],
      ...(dataSouth.active ?? []) as Entry[],
    ];
    return allActive.filter(matchSearch);
  }, [dataNorth.active, dataSouth.active, search]);
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
  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center justify-between border-l-4 border-l-blue-500">
    <div className="flex items-center gap-3">
      <span>Queue</span>
      {settings.queueRotation && settings.rotationStartedAt && (() => {
        const THIRTY_MINUTES = 30 * 60 * 1000;
        const elapsed = now - settings.rotationStartedAt;
        const remaining = Math.max(0, THIRTY_MINUTES - elapsed);
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        return (
          <span className="text-xs font-medium text-amber-600 border border-amber-300 bg-amber-50 rounded-full px-2 py-0.5">
            ↻ {mins}m {secs.toString().padStart(2, "0")}s
          </span>
        );
      })()}
    </div>
    {search.trim() ? (
      <span className="text-xs text-slate-400">Filtered</span>
    ) : null}
  </div>

    <div className="divide-y divide-slate-100">
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-sm text-slate-400">None</div>
      ) : (
        rows.map((e, idx) => (
          <div key={e.id} className="px-4 py-3">
            {/* ROW HEADER (avatar + name + right side badges/meta) */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
              {/* Avatar */}
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                {initials(e)}
              </div>

              {/* Name + note */}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">
                  {title === "Queue"
                    ? `${idx + 1}. ${fullLabel(e)}`
                    : fullLabel(e)}
                </div>

                {e.note ? (
                  <div className="text-xs text-slate-400 italic truncate">
                    {e.note}
                  </div>
                ) : null}
              </div>

              {/* Right side (Completed gets badges; others get rightMeta) */}
              {title === "Completed" ? (
                <div className="col-span-2 justify-self-end flex items-center gap-2 flex-wrap">
                  {e.earlyReason ? (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
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
      {!storeId ? null : currentUserRole === 'sales' ? (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-lg font-bold text-slate-800">Access Denied</p>
            <p className="text-sm text-slate-400">You don't have permission to view this page.</p>
          </div>
        </div>
      ) : currentUserRole === '' ? null : <div className="min-h-screen bg-slate-100 text-slate-800">
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

{/* MGR: JOIN TYPE MODAL (Queue -> With Customers) */}
{mgrStartEntryId && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setMgrStartEntryId(null)}>
    <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-lg font-semibold mb-2 text-slate-100">How is this guest being served?</h2>
      {(() => {
        const regionQueue = mgrStartRegion === "North" ? queueNorth : mgrStartRegion === "South" ? queueSouth : queue;
        const e = regionQueue.find((q) => q.id === mgrStartEntryId);
        return <p className="text-sm text-slate-300 mb-4">{e ? `${e.firstName} ${e.lastName}` : "Selected guest"}</p>;
      })()}
      <div className="flex flex-col gap-3">
        {([
          ["walk-in", "Walk-in"],
          ["appt-phone", "Appointment (Phone)"],
          ["appt-online", "Appointment (Online)"],
        ] as const).map(([type, label]) => (
          <button
            key={type}
            onClick={async () => {
              const regionQueue = mgrStartRegion === "North" ? queueNorth : mgrStartRegion === "South" ? queueSouth : queue;
              const regionActive = mgrStartRegion === "North" ? (dataNorth.active ?? []) as Entry[] : mgrStartRegion === "South" ? (dataSouth.active ?? []) as Entry[] : active;
              const entryIdx = regionQueue.findIndex((q) => q.id === mgrStartEntryId);
              const entry = regionQueue[entryIdx];
              if (!entry) { setMgrStartEntryId(null); return; }
              const nextQueue = regionQueue.filter((q) => q.id !== mgrStartEntryId);
              const nextActive: Entry[] = [
                ...regionActive,
                {
                  ...entry,
                  joinType: type,
                  serviceStart: Date.now(),
                  originalQueueIndex: entryIdx,
                },
              ];
              const targetRegion = mgrStartRegion || region;
              const ref = doc(db, "stores", storeId, "regions", targetRegion);
              const regionCompleted = targetRegion === "North" ? (dataNorth.completed ?? []) as Entry[] : (dataSouth.completed ?? []) as Entry[];
              await updateDoc(ref, { queue: nextQueue, active: nextActive, completed: regionCompleted });
              setMgrStartEntryId(null);
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
          >
            {type === "walk-in" ? <DoorOpen size={16} /> : type === "appt-phone" ? <Phone size={16} /> : <Globe size={16} />}
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </div>
      <button onClick={() => setMgrStartEntryId(null)} className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Cancel</button>
    </div>
  </div>
)}

{/* MGR: DONE MODAL (Send back to queue) */}
{mgrDoneActiveId && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setMgrDoneActiveId(null); setMgrSelectedManagerIds([]); }}>
    <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-lg font-semibold mb-2 text-slate-100">Move back to queue?</h2>
      {(() => {
        const e = [...(dataNorth.active ?? []), ...(dataSouth.active ?? [])].find((a) => a.id === mgrDoneActiveId);
        return <p className="text-sm text-slate-300 mb-4">{e ? `${e.firstName} ${e.lastName}` : "Selected guest"}</p>;
      })()}
      {(() => {
        const e = [...(dataNorth.active ?? []), ...(dataSouth.active ?? [])].find((a) => a.id === mgrDoneActiveId);
        if (!e) return null;
        const canSendTop = e.serviceStart ? now - e.serviceStart < 2 * 60 * 1000 : true;
        return (
          <div className="flex flex-col gap-3 mb-4">
            {canSendTop && !settings.lockQueuePosition && (
              <button onClick={() => void handleMgrSendBackToQueue()} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700">
                Send back to <span className="font-semibold">original spot</span> in queue
              </button>
            )}
            {mgrManagerUsers.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-2">Who helped with this visit? (optional)</p>
                <div className="flex flex-wrap gap-2">
                  {mgrManagerUsers.map((m) => {
                    const selected = mgrSelectedManagerIds.includes(m.uid);
                    return (
                      <button key={m.uid} type="button" onClick={() => setMgrSelectedManagerIds((prev) => prev.includes(m.uid) ? prev.filter((x) => x !== m.uid) : prev.length >= 3 ? prev : [...prev, m.uid])}
                        className={`rounded-full border px-3 py-1 text-xs ${selected ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"}`}>
                        {m.displayName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
      <div className="flex gap-2 mt-2">
        <button onClick={() => { setMgrDoneActiveId(null); setMgrSelectedManagerIds([]); }} className="flex-1 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Cancel</button>
        <button onClick={() => void handleMgrSendBackToQueue()} className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Send to Bottom</button>
      </div>
    </div>
  </div>
)}

{/* MGR: COMPLETE MODAL */}
{mgrCompleteEntryId && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeMgrCompleteModal}>
    <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-lg font-semibold mb-2 text-slate-100">Complete this visit</h2>
      {(() => {
        const e = active.find((a) => a.id === mgrCompleteEntryId);
        return <p className="text-sm text-slate-300 mb-4">{e ? `${e.firstName} ${e.lastName}` : "Selected guest"}</p>;
      })()}
      {(() => {
        const e = active.find((a) => a.id === mgrCompleteEntryId);
        if (!e) return null;
        const canSendTop = e.serviceStart ? now - e.serviceStart < 2 * 60 * 1000 : true;
        return (
          <div className="flex flex-col gap-2 mb-4">
            {canSendTop && !settings.lockQueuePosition && (
              <button onClick={() => setMgrReturnPosition("top")} className={`rounded-xl px-4 py-2 text-sm text-center ${mgrReturnPosition === "top" ? "bg-slate-800 text-slate-100" : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"}`}>
                Send to <span className="font-semibold">original</span> spot in queue
              </button>
            )}
            <button onClick={() => setMgrReturnPosition("bottom")} className={`rounded-xl px-4 py-2 text-sm text-center ${mgrReturnPosition === "bottom" ? "bg-slate-800 text-slate-100" : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"}`}>
              Send to <span className="font-semibold">bottom</span> of queue
            </button>
            {mgrManagerUsers.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-slate-400 mb-2">Tap up to 3 managers who helped:</p>
                <div className="flex flex-wrap gap-2">
                  {mgrManagerUsers.map((m) => {
                    const selected = mgrSelectedManagerIds.includes(m.uid);
                    return (
                      <button key={m.uid} type="button" onClick={() => setMgrSelectedManagerIds((prev) => prev.includes(m.uid) ? prev.filter((x) => x !== m.uid) : prev.length >= 3 ? prev : [...prev, m.uid])}
                        className={`rounded-full border px-3 py-1 text-xs ${selected ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"}`}>
                        {m.displayName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
      <div className="flex gap-2">
        <button onClick={closeMgrCompleteModal} className="flex-1 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Cancel</button>
        <button
          onClick={() => {
            const e = [...(dataNorth.active ?? []), ...(dataSouth.active ?? [])] .find((a) => a.id === mgrCompleteEntryId);
            const canSendTop = e?.serviceStart ? now - e.serviceStart < 2 * 60 * 1000 : true;
            if (canSendTop && mgrReturnPosition === "top" && !settings.lockQueuePosition) {
              setMgrEarlyReasonModalOpen(true);
              return;
            }
            setMgrVisitOutcome({});
            setMgrPendingReason(undefined);
            setMgrOutcomeModalOpen(true);
          }}
          className="flex-1 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">
          Save visit
        </button>
      </div>
    </div>
  </div>
)}

{/* MGR: EARLY REASON MODAL */}
{mgrEarlyReasonModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setMgrEarlyReasonModalOpen(false)}>
    <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-lg font-semibold text-slate-100 mb-2">Customer needed...</h2>
      <p className="text-sm text-slate-300 mb-4">Select where they needed to go.</p>
      <div className="grid grid-cols-2 gap-3">
        {(["service", "parts", "finance", "other"] as const).map((key) => (
          <button key={key} type="button" onClick={() => {
            setMgrEarlyReason(key);
            setMgrEarlyReasonModalOpen(false);
            setMgrPendingReason(key);
            setMgrVisitOutcome({});
            setMgrOutcomeModalOpen(true);
          }} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-slate-700 capitalize">
            {key}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setMgrEarlyReasonModalOpen(false)} className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Cancel</button>
    </div>
  </div>
)}

{/* MGR: OUTCOME MODAL */}
{mgrOutcomeModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeMgrCompleteModal}>
    <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-lg font-semibold mb-1 text-slate-100">Visit outcome</h2>
      <p className="text-sm text-slate-400 mb-5">What happened during this visit?</p>
      <div className="flex flex-col gap-3 mb-6">
        {(["testDrive", "proposal", "sold", "deposit"] as const).map((key) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">{key === "testDrive" ? "Test Drive" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMgrVisitOutcome((prev) => ({ ...prev, [key]: false }))}
                className={`w-10 h-10 rounded-xl border text-lg flex items-center justify-center transition ${mgrVisitOutcome[key] === false ? "bg-red-600 border-red-500 text-white" : "bg-slate-800 border-slate-600 text-slate-400 hover:border-red-500/50"}`}>✕</button>
              <button type="button" onClick={() => setMgrVisitOutcome((prev) => ({ ...prev, [key]: true }))}
                className={`w-10 h-10 rounded-xl border text-lg flex items-center justify-center transition ${mgrVisitOutcome[key] === true ? "bg-green-600 border-green-500 text-white" : "bg-slate-800 border-slate-600 text-slate-400 hover:border-green-500/50"}`}>✓</button>
            </div>
          </div>
        ))}
        {settings.showNewUsed && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-medium text-slate-200">Vehicle Type</span>
            <div className="flex gap-2">
              {(["new", "used", "n/a"] as const).map((type) => (
                <button key={type} type="button" onClick={() => setMgrVisitOutcome((prev) => ({ ...prev, vehicleType: type }))}
                  className={`px-4 h-10 rounded-xl border text-sm font-medium transition uppercase ${mgrVisitOutcome.vehicleType === type ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-600 text-slate-400 hover:border-blue-500/50"}`}>
                  {type === "n/a" ? "N/A" : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={closeMgrCompleteModal} className="flex-1 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Cancel</button>
        <button onClick={() => { setMgrOutcomeModalOpen(false); void handleMgrConfirmComplete(mgrPendingReason, mgrVisitOutcome); }}
          className="flex-1 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">Save visit</button>
      </div>
      <button type="button" onClick={() => { setMgrOutcomeModalOpen(false); void handleMgrConfirmComplete(mgrPendingReason, mgrVisitOutcome); }}
        className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300">Skip</button>
    </div>
  </div>
)}

{/* ADD TO QUEUE MODAL */}
{addToQueueModalOpen && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    onClick={() => setAddToQueueModalOpen(false)}
  >
    <div
      className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="text-lg font-semibold text-slate-100 mb-4">Add to Queue</h2>
      <p className="text-xs text-slate-400 mb-3">Select a salesman to add to North or South queue.</p>
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
        {assignedUsers.filter((u) => u.role === "sales" || u.role === "manager").map((u) => {
          const initials = (u.displayName?.[0] ?? "?").toUpperCase();
          const alreadyNorth = queueNorth.some((q) => q.email === u.email);
          const alreadySouth = queueSouth.some((q) => q.email === u.email);
          const alreadyEither = alreadyNorth || alreadySouth;
          return (
            <div key={u.uid} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-white text-xs font-semibold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-100 truncate">{u.displayName}</div>
                <div className="text-xs text-slate-400 truncate">{u.email}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => {
                    if (alreadyNorth) return;
                    const newEntry = {
                      id: crypto.randomUUID(),
                      firstName: u.displayName.split(" ")[0] ?? u.displayName,
                      lastName: u.displayName.split(" ").slice(1).join(" ") ?? "",
                      email: u.email,
                      note: "",
                      joinedAt: Date.now(),
                    };
                    const ref = doc(db, "stores", storeId, "regions", "North");
                    updateDoc(ref, { queue: [...queueNorth, newEntry] });
                  }}
                  disabled={alreadyEither}
                  className="text-xs text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-full px-3 py-1"
                >
                  {alreadyNorth ? "In North" : alreadySouth ? "In South" : "+ North"}
                </button>
                <button
                  onClick={() => {
                    if (alreadySouth) return;
                    const newEntry = {
                      id: crypto.randomUUID(),
                      firstName: u.displayName.split(" ")[0] ?? u.displayName,
                      lastName: u.displayName.split(" ").slice(1).join(" ") ?? "",
                      email: u.email,
                      note: "",
                      joinedAt: Date.now(),
                    };
                    const ref = doc(db, "stores", storeId, "regions", "South");
                    updateDoc(ref, { queue: [...queueSouth, newEntry] });
                  }}
                  disabled={alreadyEither}
                  className="text-xs text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-full px-3 py-1"
                >
                  {alreadySouth ? "In South" : alreadyNorth ? "In North" : "+ South"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => setAddToQueueModalOpen(false)}
        className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
      >
        Done
      </button>
    </div>
  </div>
)}


          {/* LEFT SIDEBAR */}
            <Sidebar
            expanded={sidebarOpen}
            onToggle={() => setSidebarOpen((v) => !v)}
            dark
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
                text="Analytics"
                active={panel === "analytics"}
                onClick={() => { setPanel("analytics"); setSidebarOpen(true); }}
                />

            <li className="flex-1" />


            {isManagerLike && (
              <>
                <li className="my-2">
                  <div className="h-px bg-slate-700" />
                </li>
                <SidebarItem
                  icon={<Settings size={18} />}
                  text="Settings"
                  active={panel === "settings"}
                  onClick={() => { setPanel("settings"); setSidebarOpen(true); }}
                />
              </>
            )}

            </Sidebar>



          {/* MAIN */}
          <main className="flex-1">
            {/* TOP BAR */}
            <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-5 py-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                <div className="text-2xl font-bold tracking-tight truncate text-slate-800">Manager Dashboard</div>
                <div className="text-xs font-medium text-slate-400 tracking-wide uppercase">{todayLabel}</div>
                </div>

                <div className="flex items-center gap-2">
                <div className="relative">
                    <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Quick Search"
                    className="w-56 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500"
                    />
                </div>

                {!settings.splitRegionView && (
                  <select
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                  >
                      <option value="North">North</option>
                      <option value="South">South</option>
                  </select>
                )}
                <button
                  onClick={() => signOut(auth)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition"
                >
                  Sign out
                </button>
                </div>
            </div>

            {/* Stat cards */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="text-sm font-semibold text-blue-500 uppercase tracking-wide">In Queue</div>
                <div className="text-3xl font-bold text-blue-700 mt-0.5">{queue.length}</div>
              </div>
              <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                <div className="text-sm font-semibold text-green-500 uppercase tracking-wide">With Customers</div>
                <div className="text-3xl font-bold text-green-700 mt-0.5">{active.length}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Completed</div>
                <div className="text-3xl font-bold text-slate-600 mt-0.5">{completed.length}</div>
              </div>
            </div>
            {search.trim() ? (
              <div className="mt-2">
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
                  Searching: <span className="font-bold">{search.trim()}</span>
                </span>
              </div>
            ) : null}

            {/* Divider line (matches sidebar) */}
            <div className="mt-3 h-px bg-slate-200 w-full" />
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
                settings.splitRegionView ? (
                  <div className="flex flex-col gap-4">
                  {isManagerLike && (
                    <div className="flex justify-start">
                      <button
                        onClick={() => setAddToQueueModalOpen(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 border border-blue-300 bg-white rounded-lg px-3 py-1.5 font-medium"
                      >
                        + Add to Queue
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    {/* NORTH QUEUE */}
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center justify-between border-l-4 border-l-blue-500">
                        <span>North Queue ({queueNorth.length})</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {queueNorth.length === 0 ? (
                          <div className="px-4 py-4 text-sm text-slate-400">None</div>
                        ) : (
                          queueNorth.map((e, idx) => (
                            <div
                              key={e.id}
                              draggable
                              onDragStart={() => setDragIndex(idx)}
                              onDragOver={(ev) => { ev.preventDefault(); setDragOverIndex(idx); }}
                              onDrop={() => {
                                if (dragIndex !== null) reorderQueue(dragIndex, idx);
                                setDragIndex(null);
                                setDragOverIndex(null);
                              }}
                              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                              className={`flex items-center gap-3 px-4 py-3 cursor-grab transition-colors ${
                                dragOverIndex === idx && dragIndex !== idx
                                  ? "bg-blue-50 border-l-2 border-l-blue-400"
                                  : dragIndex === idx
                                  ? "opacity-50 bg-slate-50"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex flex-col gap-1 opacity-30 shrink-0">
                                <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
                                <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
                                <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
                              </div>
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold shrink-0">
                                {idx + 1}
                              </div>
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-semibold shrink-0">
                                {initials(e)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-slate-800 truncate">{fullLabel(e)}</div>
                                {e.note ? <div className="text-xs text-slate-400 italic truncate">{e.note}</div> : null}
                                <div className="text-[11px] text-slate-400">{e.joinedAt ? `Joined ${fmtTime(e.joinedAt)}` : ""}</div>
                              </div>
                              {isAdminOrOwner && (
                                <div className="flex gap-2 ml-2">
                                  {settings.northSouthTransfer && (
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      const northRef = doc(db, "stores", storeId, "regions", "North");
                                      const southRef = doc(db, "stores", storeId, "regions", "South");
                                      updateDoc(northRef, { queue: queueNorth.filter((q) => q.id !== e.id) });
                                      updateDoc(southRef, { queue: [...queueSouth, { ...e, joinedAt: Date.now() }] });
                                    }}
                                    className="text-xs text-white bg-purple-600 hover:bg-purple-500 rounded-full px-3 py-1"
                                  >
                                    → South
                                  </button>
                                  )}
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setMgrStartEntryId(e.id);
                                      setMgrStartRegion("North");
                                    }}
                                    className="text-xs text-white bg-green-600 hover:bg-green-500 rounded-full px-3 py-1"
                                  >
                                    With Customer
                                  </button>
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      const ref = doc(db, "stores", storeId, "regions", "North");
                                      updateDoc(ref, { queue: queueNorth.filter((q) => q.id !== e.id) });
                                    }}
                                    className="text-xs text-white bg-red-600 hover:bg-red-500 rounded-full px-3 py-1"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* SOUTH QUEUE */}
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center justify-between border-l-4 border-l-purple-500">
                        <span>South Queue ({queueSouth.length})</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {queueSouth.length === 0 ? (
                          <div className="px-4 py-4 text-sm text-slate-400">None</div>
                        ) : (
                          queueSouth.map((e, idx) => (
                            <div
                              key={e.id}
                              draggable
                              onDragStart={() => setDragIndex(idx)}
                              onDragOver={(ev) => { ev.preventDefault(); setDragOverIndex(idx); }}
                              onDrop={() => {
                                if (dragIndex !== null) {
                                  const newQueue = [...queueSouth];
                                  const [moved] = newQueue.splice(dragIndex, 1);
                                  newQueue.splice(idx, 0, moved);
                                  const ref = doc(db, "stores", storeId, "regions", "South");
                                  updateDoc(ref, { queue: newQueue });
                                }
                                setDragIndex(null);
                                setDragOverIndex(null);
                              }}
                              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                              className={`flex items-center gap-3 px-4 py-3 cursor-grab transition-colors ${
                                dragOverIndex === idx && dragIndex !== idx
                                  ? "bg-purple-50 border-l-2 border-l-purple-400"
                                  : dragIndex === idx
                                  ? "opacity-50 bg-slate-50"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex flex-col gap-1 opacity-30 shrink-0">
                                <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
                                <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
                                <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
                              </div>
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold shrink-0">
                                {idx + 1}
                              </div>
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-semibold shrink-0">
                                {initials(e)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-slate-800 truncate">{fullLabel(e)}</div>
                                {e.note ? <div className="text-xs text-slate-400 italic truncate">{e.note}</div> : null}
                                <div className="text-[11px] text-slate-400">{e.joinedAt ? `Joined ${fmtTime(e.joinedAt)}` : ""}</div>
                              </div>
                              {isAdminOrOwner && (
                                <div className="flex gap-2 ml-2">
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      const northRef = doc(db, "stores", storeId, "regions", "North");
                                      const southRef = doc(db, "stores", storeId, "regions", "South");
                                      updateDoc(southRef, { queue: queueSouth.filter((q) => q.id !== e.id) });
                                      updateDoc(northRef, { queue: [...queueNorth, { ...e, joinedAt: Date.now() }] });
                                    }}
                                    className="text-xs text-white bg-blue-600 hover:bg-blue-500 rounded-full px-3 py-1"
                                  >
                                    ← North
                                  </button>
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setMgrStartEntryId(e.id);
                                      setMgrStartRegion("South");
                                    }}
                                    className="text-xs text-white bg-green-600 hover:bg-green-500 rounded-full px-3 py-1"
                                  >
                                    With Customer
                                  </button>
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      const ref = doc(db, "stores", storeId, "regions", "South");
                                      updateDoc(ref, { queue: queueSouth.filter((q) => q.id !== e.id) });
                                    }}
                                    className="text-xs text-white bg-red-600 hover:bg-red-500 rounded-full px-3 py-1"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                ) : (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center justify-between border-l-4 border-l-blue-500">
                    <span>Queue</span>
                    {search.trim() ? <span className="text-xs text-slate-400">Filtered</span> : null}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {filteredQueue.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-slate-400">None</div>
                    ) : (
                      filteredQueue.map((e, idx) => (
                        <div
                          key={e.id}
                          draggable
                          onDragStart={() => setDragIndex(idx)}
                          onDragOver={(ev) => { ev.preventDefault(); setDragOverIndex(idx); }}
                          onDrop={() => {
                            if (dragIndex !== null) reorderQueue(dragIndex, idx);
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                          className={`flex items-center gap-3 px-4 py-3 cursor-grab transition-colors ${
                            dragOverIndex === idx && dragIndex !== idx
                              ? "bg-blue-50 border-l-2 border-l-blue-400"
                              : dragIndex === idx
                              ? "opacity-50 bg-slate-50"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex flex-col gap-1 opacity-30 shrink-0">
                            <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
                            <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
                            <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
                          </div>
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-semibold shrink-0">
                            {initials(e)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-slate-800 truncate">{fullLabel(e)}</div>
                            {e.note ? <div className="text-xs text-slate-400 italic truncate">{e.note}</div> : null}
                            <div className="text-[11px] text-slate-400">{e.joinedAt ? `Joined ${fmtTime(e.joinedAt)}` : ""}</div>
                          </div>
                          {isAdminOrOwner && (
                            <div className="flex gap-2 ml-2">
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setMgrStartEntryId(e.id);
                                  setMgrStartRegion(region);
                                }}
                                className="text-xs text-white bg-green-600 hover:bg-green-500 rounded-full px-3 py-1"
                              >
                                 With Customer
                              </button>
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  const ref = doc(db, "stores", storeId, "regions", region);
                                  updateDoc(ref, { queue: queue.filter((q) => q.id !== e.id) });
                                }}
                                className="text-xs text-white bg-red-600 hover:bg-red-500 rounded-full px-3 py-1"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                )
              )}

              {panel === "active" && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center justify-between border-l-4 border-l-blue-500">
                    <span>With Customers ({filteredActive.length})</span>
                    {search.trim() ? <span className="text-xs text-slate-400">Filtered</span> : null}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {filteredActive.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-slate-400">None</div>
                    ) : (
                      filteredActive.map((e) => {
                        const mins = minutesSince(e.serviceStart);
                        const bar = barStyle(mins);
                        return (
                          <div key={e.id} className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold shrink-0">
                                {initials(e)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-slate-800 truncate">{fullLabel(e)}</div>
                                {e.note ? <div className="text-xs text-slate-400 italic truncate">{e.note}</div> : null}
                                <div className="text-[11px] text-slate-400">{e.serviceStart ? `Started ${fmtTime(e.serviceStart)}` : ""}</div>
                              </div>
                              <div className="text-xs text-slate-500 whitespace-nowrap">{e.serviceStart ? fmtSince(e.serviceStart) : ""}</div>
                              {isManagerLike && (
                                <div className="flex gap-2 ml-2">
                                  <button
                                    onClick={() => {
                                      setMgrDoneActiveId(e.id);
                                      setMgrSelectedManagerIds([]);
                                    }}
                                    className="text-xs text-white bg-slate-600 hover:bg-slate-500 rounded-full px-3 py-1"
                                  >
                                    ↩ Queue
                                  </button>
                                  <button
                                    onClick={() => {
                                      setMgrCompleteEntryId(e.id);
                                      setMgrSelectedManagerIds([]);
                                      setMgrReturnPosition("bottom");
                                      setMgrEarlyReason(null);
                                    }}
                                    className="text-xs text-white bg-green-600 hover:bg-green-500 rounded-full px-3 py-1"
                                  >
                                    Done
                                  </button>
                                </div>
                              )}
                            </div>
                            {e.serviceStart ? (
                              <div className="mt-2 h-[3px] w-full rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full transition-all" style={{ width: bar.width, background: bar.background }}></div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {panel === "completed" && (
                <ListCard
                  title="Completed"
                  rows={filteredCompleted}
                  rightMeta={(e) => (e.managers?.length ? `${e.managers.length} mgr` : "")}
                />
              )}

              {(panel === "users" || panel === "unassigned") && isAdminOrOwner && (
               <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center justify-between border-l-4 border-l-blue-500">
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
                    <div className="divide-y divide-slate-100">
                      {(panel === "users" ? assignedUsers : unassignedUsers).length === 0 ? (
                        <div className="px-4 py-4 text-sm text-slate-400">None</div>
                      ) : (
                        (panel === "users" ? assignedUsers : unassignedUsers).map((u) => (
                          <div key={u.uid} className="px-4 py-3 flex flex-col gap-2">
                            {/* Name + email */}
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                                {(u.displayName?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-800 truncate">
                                  {u.displayName || "No name set"}
                                </div>
                                <div className="text-xs text-slate-400 truncate">{u.email}</div>
                              </div>
                              {/* Store badge */}
                              {u.storeId && (
                                <span className={`ml-auto text-xs rounded-full border px-2 py-0.5 ${
                                  u.storeId === "store-toyota"
                                    ? "bg-red-50 border-red-200 text-red-700"
                                    : u.storeId === "store-subaru"
                                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                    : "bg-blue-50 border-blue-200 text-blue-700"
                                }`}>
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
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none disabled:opacity-40"
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
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none disabled:opacity-40"
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

              {panel === "settings" && isManagerLike && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center border-l-4 border-l-blue-500">
                    Store Settings
                  </div>
                  <div className="divide-y divide-slate-100">
                    {/* Queue Rotation */}
                    <div className="px-4 py-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Queue Rotation</div>
                        <div className="text-xs text-slate-400 mt-0.5">Automatically rotate queue order every 30 minutes</div>
                      </div>
                      <button
                        onClick={() => {
                          const enabling = !settings.queueRotation;
                          updateSetting("queueRotation", enabling);
                          if (enabling) updateSetting("rotationStartedAt", Date.now());
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.queueRotation ? "bg-blue-600" : "bg-slate-200"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.queueRotation ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>
                    </div>



                        {/* New / Used Tracking */}
                    <div className="px-4 py-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">New / Used Tracking</div>
                        <div className="text-xs text-slate-400 mt-0.5">Show vehicle type selector (New/Used) on visit completion</div>
                      </div>
                      <button
                        onClick={() => updateSetting("showNewUsed", !settings.showNewUsed)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.showNewUsed ? "bg-blue-600" : "bg-slate-200"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.showNewUsed ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>
                    </div>

                    {/* Split Region View */}
                    <div className="px-4 py-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Split Region View</div>
                        <div className="text-xs text-slate-400 mt-0.5">Show North and South queues side by side in the Queue panel</div>
                      </div>
                      <button
                        onClick={() => updateSetting("splitRegionView", !settings.splitRegionView)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.splitRegionView ? "bg-blue-600" : "bg-slate-200"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.splitRegionView ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>
                    </div>

                    {/* North/South Transfer */}
                    <div className="px-4 py-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">North/South Transfer</div>
                        <div className="text-xs text-slate-400 mt-0.5">Allow moving salesmen between North and South queues</div>
                      </div>
                      <button
                        onClick={() => updateSetting("northSouthTransfer", !settings.northSouthTransfer)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.northSouthTransfer ? "bg-blue-600" : "bg-slate-200"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.northSouthTransfer ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>
                    </div>



                    {/* Lock Queue Position */}
                    <div className="px-4 py-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Lock Queue Position</div>
                        <div className="text-xs text-slate-400 mt-0.5">Disable "send to original spot" — salesmen always return to bottom</div>
                      </div>
                      <button
                        onClick={() => updateSetting("lockQueuePosition", !settings.lockQueuePosition)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          settings.lockQueuePosition ? "bg-blue-600" : "bg-slate-200"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.lockQueuePosition ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {panel === "team" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-lg font-semibold text-slate-800">Team</div>
                  <div className="text-sm text-slate-400 mt-1">
                    Placeholder for a “reps on floor / team status” view.
                  </div>
                </div>
              )}

              {panel === "analytics" && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex items-center justify-between border-l-4 border-l-blue-500">
                    <span>Analytics</span>
                    <div className="flex items-center gap-2">
                      {/* Segmented control */}
                      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                        {(["day", "week", "month"] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setRangeMode(mode)}
                            className={`px-3 py-1 capitalize transition-colors ${
                              rangeMode === mode
                                ? "bg-blue-600 text-white font-semibold"
                                : "bg-white text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>

                      {/* Date input — changes based on mode */}
                      {rangeMode === "month" && (
                        <input
                          type="month"
                          value={analyticsMonth}
                          onChange={(e) => setAnalyticsMonth(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500"
                        />
                      )}
                      {rangeMode === "week" && (
                        <input
                          type="week"
                          value={analyticsWeek}
                          onChange={(e) => setAnalyticsWeek(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500"
                        />
                      )}
                      {rangeMode === "day" && (
                        <input
                          type="date"
                          value={analyticsDay}
                          onChange={(e) => setAnalyticsDay(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500"
                        />
                      )}

                      <button
                        onClick={fetchAnalytics}
                        className="text-xs text-slate-400 hover:text-slate-200 border border-slate-300 rounded-lg px-2 py-1"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>

                  {archiveLoading ? (
                    <div className="px-4 py-4 text-sm text-slate-400">Loading...</div>
                  ) : selectedSalesperson ? (
                    (() => {
                      const person = analyticsBySalesperson.find(p => p.email === selectedSalesperson);
                      if (!person) return null;
                      const avgDuration = person.durationCount > 0
                        ? Math.round(person.totalDuration / person.durationCount)
                        : 0;
                      const avgMins = Math.floor(avgDuration / 60);
                      const avgSecs = avgDuration % 60;
                      return (
                        <div className="p-4">
                          <button
                            onClick={() => setSelectedSalesperson(null)}
                            className="text-xs text-blue-500 hover:text-blue-700 mb-4 flex items-center gap-1"
                          >
                            ← Back to all
                          </button>
                          <div className="text-lg font-bold text-slate-800 mb-1">{person.name}</div>
                          <div className="text-xs text-slate-400 mb-4">{person.email}</div>
                          <div className="grid grid-cols-3 gap-3 mb-4">
                            {[
                              { label: "Visits", value: person.visits, color: "bg-slate-50 border-slate-200" },
                              { label: "Sold", value: person.sold, color: "bg-green-50 border-green-200" },
                              { label: "Deposits", value: person.deposit, color: "bg-blue-50 border-blue-200" },
                              { label: "Test Drives", value: person.testDrive, color: "bg-amber-50 border-amber-200" },
                              { label: "Proposals", value: person.proposal, color: "bg-purple-50 border-purple-200" },
                              { label: "Avg Duration", value: person.durationCount > 0 ? `${avgMins}m ${String(avgSecs).padStart(2,"0")}s` : "—", color: "bg-slate-50 border-slate-200" },
                              ...(settings.showNewUsed ? [
                                { label: "New", value: person.newVehicle, color: "bg-blue-50 border-blue-200" },
                                { label: "Used", value: person.usedVehicle, color: "bg-slate-50 border-slate-200" },
                              ] : []),
                            ].map((stat) => (
                              <div key={stat.label} className={`rounded-xl border px-3 py-3 ${stat.color}`}>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">{stat.label}</div>
                                <div className="text-2xl font-black text-slate-700 mt-0.5">{stat.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()
                  ) : analyticsBySalesperson.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-slate-400">
                      No completed visits for this {rangeMode}.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {analyticsBySalesperson.map((person) => (
                        <button
                          key={person.email}
                          onClick={() => setSelectedSalesperson(person.email)}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 text-left"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-semibold shrink-0">
                            {person.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800">{person.name}</div>
                            <div className="text-xs text-slate-400">{person.visits} visits</div>
                          </div>
                          <div className="flex gap-3 text-xs">
                            <span className="text-green-600 font-bold">{person.sold} sold</span>
                            <span className="text-amber-600 font-bold">{person.testDrive} TD</span>
                            <span className="text-purple-600 font-bold">{person.proposal} prop</span>
                          </div>
                          <span className="text-slate-300 text-sm">›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>}
    </AuthGate>
  );
}
