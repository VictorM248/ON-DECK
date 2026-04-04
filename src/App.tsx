import { useEffect, useRef, useState } from "react";
import Toggle from "./components/Toggle";
import Queue from "./components/Queue";
import { AuthGate } from "./components/AuthGate";

import { useStoreFeed } from "./lib/useStoreFeed";
import { useSavedNamesFirestore } from "./lib/useSavedNamesFirestore";
import { useSavedManagersFirestore } from "./lib/useSavedManagersFirestore";
import { isAdminLike } from "./lib/roles";

import { auth, db, functions } from "./lib/firebase";
import {
  OAuthProvider,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { UserPlus, UserStar } from "lucide-react";
import { httpsCallable } from "firebase/functions";

type Role = "Sales" | "Admin";

type SavedName = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

function AppInner({ storeId }: { storeId: string }) {
  const [role, setRole] = useState<Role>(
    () => (localStorage.getItem("role") as Role) ?? "Sales"
  );

  const ADMIN_UNLOCK_MS = 2 * 60 * 1000;
  const ADMIN_UNLOCK_KEY = "adminUnlockedUntil";

  const [adminUnlockedUntil, setAdminUnlockedUntil] = useState<number>(() => {
    const raw = Number(sessionStorage.getItem(ADMIN_UNLOCK_KEY) ?? "0");
    return Number.isFinite(raw) ? raw : 0;
  });

  const adminLockTimeoutRef = useRef<number | null>(null);
  const isAdminUnlocked = Date.now() < adminUnlockedUntil;

  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [adminPinError, setAdminPinError] = useState("");
  const [adminPinLoading, setAdminPinLoading] = useState(false);

  const adminAuthInProgressRef = useRef(false);

  function lockAdminNow() {
    setAdminUnlockedUntil(0);
    sessionStorage.setItem(ADMIN_UNLOCK_KEY, "0");
    setRole("Sales");
    localStorage.setItem("role", "Sales");

    if (adminLockTimeoutRef.current) {
      window.clearTimeout(adminLockTimeoutRef.current);
      adminLockTimeoutRef.current = null;
    }
  }

  function unlockAdminForWindow() {
    const until = Date.now() + ADMIN_UNLOCK_MS;
    setAdminUnlockedUntil(until);
    sessionStorage.setItem(ADMIN_UNLOCK_KEY, String(until));

    if (adminLockTimeoutRef.current) {
      window.clearTimeout(adminLockTimeoutRef.current);
    }

    adminLockTimeoutRef.current = window.setTimeout(() => {
      lockAdminNow();
    }, ADMIN_UNLOCK_MS);
  }

  async function requestAdminAccess() {
    if (adminAuthInProgressRef.current) return;
    adminAuthInProgressRef.current = true;

    try {
      const u = auth.currentUser;
      if (!u) {
        alert("You must be signed in.");
        return;
      }

      const userRef = doc(db, "users", u.uid);
      const snap = await getDoc(userRef);
      const r = (snap.data()?.role ?? "").toString().toLowerCase();

      if (r !== "admin" && r !== "owner") {
        alert("Not authorized for Admin view.");
        lockAdminNow();
        return;
      }

      const provider = new OAuthProvider("microsoft.com");
      provider.setCustomParameters({
        tenant: import.meta.env.VITE_MICROSOFT_TENANT_ID as string,
        prompt: "select_account",
      });

      try {
        await reauthenticateWithPopup(u, provider);
      } catch (err: any) {
        if (
          err?.code === "auth/popup-blocked" ||
          err?.code === "auth/popup-closed-by-user" ||
          err?.code === "auth/operation-not-supported-in-this-environment"
        ) {
          await reauthenticateWithRedirect(u, provider);
          return;
        }
        throw err;
      }

      await u.getIdToken(true);
      unlockAdminForWindow();
      setRole("Admin");
    } catch (e) {
      console.error("Admin re-auth failed:", e);
      alert("Admin verification failed.");
      lockAdminNow();
    } finally {
      adminAuthInProgressRef.current = false;
    }
  }

  useEffect(() => {
    localStorage.setItem("role", role === "Admin" ? "Sales" : role);
  }, [role]);

  useEffect(() => {
    if (role === "Admin" && !isAdminUnlocked) {
      lockAdminNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, adminUnlockedUntil]);

  useEffect(() => {
    const saved = (localStorage.getItem("role") as Role) ?? "Sales";
    if (saved === "Admin") {
      localStorage.setItem("role", "Sales");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (adminLockTimeoutRef.current) {
        window.clearTimeout(adminLockTimeoutRef.current);
        adminLockTimeoutRef.current = null;
      }
    };
  }, []);

  const [storeName, setStoreName] = useState<string>(
    () => localStorage.getItem("storeName") ?? "Company Name"
  );
  useEffect(() => {
    localStorage.setItem("storeName", storeName);
  }, [storeName]);

  const [region, setRegion] = useState<string>(
    () => localStorage.getItem("region") ?? "North"
  );
  useEffect(() => {
    localStorage.setItem("region", region);
  }, [region]);

  const { initIfMissing } = useStoreFeed(storeId, region);
  useEffect(() => {
    initIfMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const [currentTime, setCurrentTime] = useState<string>("");
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    updateTime();
    const intervalId = setInterval(updateTime, 1000);
    return () => clearInterval(intervalId);
  }, []);

  const {
    savedNames,
    addSavedName,
    removeSavedName,
    initIfMissing: initSavedNames,
  } = useSavedNamesFirestore(storeId);

  useEffect(() => {
    initSavedNames();
  }, [initSavedNames]);

  // Migrate localStorage -> Firestore (only if Firestore empty)
  useEffect(() => {
    if (savedNames.length > 0) return;
    const raw = JSON.parse(localStorage.getItem("savedNames") || "[]");
    if (!Array.isArray(raw) || raw.length === 0) return;
    raw.forEach((n: any) => {
      const fn = (n.firstName ?? "").trim();
      const ln = (n.lastName ?? "").trim();
      const em = (n.email ?? "").trim();
      if (fn && em) addSavedName(fn, ln, em);
    });
    localStorage.removeItem("savedNames");
  }, [savedNames.length, addSavedName]);

  const { addManager } = useSavedManagersFirestore(storeId);

  // Queue add handler ref — now includes email
  const queueAddRef = useRef<
    ((first: string, last: string, email: string, note: string) => void) | null
  >(null);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalFirst, setModalFirst] = useState("");
  const [modalLast, setModalLast] = useState("");
  const [modalEmail, setModalEmail] = useState("");
  const [modalNote, setModalNote] = useState("");
  const [addChooserOpen, setAddChooserOpen] = useState(false);

  // Manager modal state
  const [managerModalOpen, setManagerModalOpen] = useState(false);
  const [managerName, setManagerName] = useState("");
  const [managerSaving, setManagerSaving] = useState(false);

  const openAddModal = () => setShowAddModal(true);

  const closeAddModal = () => {
    setShowAddModal(false);
    setModalFirst("");
    setModalLast("");
    setModalEmail("");
    setModalNote("");
  };

  const handleConfirmAdd = () => {
  const fn = modalFirst.trim();
  const ln = modalLast.trim();
  const em = modalEmail.trim().toLowerCase();
  const nt = modalNote.trim();

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);

  if (!fn) return;
  if (!em || !emailValid) return;

  queueAddRef.current?.(fn, ln, em, nt);
  closeAddModal();
};

  const handleQuickAddSaved = (saved: SavedName) => {
    const nt = modalNote.trim();
    queueAddRef.current?.(saved.firstName, saved.lastName, saved.email, nt);
    closeAddModal();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-700 text-slate-100">

      {/* ADD CHOOSER MODAL (Admin only) */}
      {addChooserOpen && isAdminLike(role) && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setAddChooserOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4 text-slate-100">
              What would you like to add?
            </h2>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setAddChooserOpen(false);
                  openAddModal();
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
              >
                <UserPlus size={16} className="text-slate-300" />
                <span>Add guest to queue</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddChooserOpen(false);
                  setManagerModalOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-left text-slate-100 hover:bg-slate-700"
              >
                <UserStar size={16} className="text-slate-300" />
                <span>Add manager</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAddChooserOpen(false)}
              className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ADD GUEST MODAL */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeAddModal}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-3 text-slate-100">
              Add guest to queue
            </h2>

            {/* Admin view */}
            {isAdminLike(role) ? (
              <>
                <div className="space-y-3 mb-4">
                  <div>
                    <input
                      value={modalFirst}
                      onChange={(e) => setModalFirst(e.target.value)}
                      placeholder="First name *"
                      className={`w-full rounded-xl border px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none bg-slate-800 focus:border-blue-500 ${
                        !modalFirst.trim() ? "border-red-500/60" : "border-slate-600"
                      }`}
                    />
                    {!modalFirst.trim() && (
                      <p className="text-xs text-red-400 mt-1 ml-1">First name is required</p>
                    )}
                  </div>

                  <input
                    value={modalLast}
                    onChange={(e) => setModalLast(e.target.value)}
                    placeholder="Last name (optional)"
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
                  />

                  <div>
                    <input
                      value={modalEmail}
                      onChange={(e) => setModalEmail(e.target.value)}
                      placeholder="Email address *"
                      type="email"
                      autoCapitalize="none"
                      className={`w-full rounded-xl border px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none bg-slate-800 focus:border-blue-500 ${
                        modalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalEmail.trim())
                          ? "border-red-500/60"
                          : !modalEmail.trim()
                          ? "border-red-500/60"
                          : "border-slate-600"
                      }`}
                    />
                    {!modalEmail.trim() && (
                      <p className="text-xs text-red-400 mt-1 ml-1">Email is required</p>
                    )}
                    {modalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalEmail.trim()) && (
                      <p className="text-xs text-red-400 mt-1 ml-1">Please enter a valid email address</p>
                    )}
                  </div>

                  <input
                    value={modalNote}
                    onChange={(e) => setModalNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={closeAddModal}
                    className="flex-1 rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAdd}
                    disabled={
                      !modalFirst.trim() ||
                      !modalEmail.trim() ||
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalEmail.trim())
                    }
                    className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add to queue
                  </button>
                </div>

                {savedNames.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-400 mb-2">
                      Manage saved names
                    </p>
                    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                      {savedNames.map((n) => (
                        <div
                          key={n.id}
                          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm flex items-center justify-between"
                        >
                          <button
                            type="button"
                            onClick={() => handleQuickAddSaved(n)}
                            className="flex items-center gap-3 text-left hover:opacity-90"
                            title="Add to queue"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-semibold">
                              {(n.firstName[0] + (n.lastName?.[0] ?? "")).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-100">
                                {n.firstName} {n.lastName}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {n.email}
                              </span>
                            </div>
                            <span className="ml-2 text-[11px] text-slate-400">
                              Add to queue
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSavedName(n.id)}
                            className="text-[11px] text-red-400 hover:text-red-300"
                            title="Remove saved name"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Sales view */
              <>
                {savedNames.length > 0 ? (
                  <>
                    <p className="text-sm text-slate-300 mb-3">
                      Tap a saved name below to add them to the queue.
                    </p>
                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto mb-4">
                      {savedNames.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleQuickAddSaved(n)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm flex items-center justify-between hover:bg-slate-700"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-semibold">
                              {(n.firstName[0] + (n.lastName?.[0] ?? "")).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-100">
                              {n.firstName} {n.lastName}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            Add to queue
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 mb-4">
                    No saved names yet. Please contact an admin.
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={closeAddModal}
                    className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* END ADD GUEST MODAL */}

      {/* ADD MANAGER MODAL */}
      {managerModalOpen && isAdminLike(role) && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            if (!managerSaving) {
              setManagerModalOpen(false);
              setManagerName("");
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-3 text-slate-100">
              Add manager
            </h2>
            <input
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="Manager name"
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
              disabled={managerSaving}
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setManagerModalOpen(false);
                  setManagerName("");
                }}
                disabled={managerSaving}
                className="flex-1 rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const nm = managerName.trim();
                  if (!nm) return;
                  setManagerSaving(true);
                  try {
                    await addManager(nm);
                    setManagerModalOpen(false);
                    setManagerName("");
                  } catch (e) {
                    console.error("addManager failed", e);
                    alert("Failed to save manager. Check console.");
                  } finally {
                    setManagerSaving(false);
                  }
                }}
                disabled={managerSaving || !managerName.trim()}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {/* END ADD MANAGER MODAL */}

      {/* ADMIN PIN MODAL */}
      {adminPinOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setAdminPinOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-2">Admin Access</h2>
            <p className="text-sm text-slate-400 mb-4">
              Enter the admin PIN to continue.
            </p>
            <input
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="Admin PIN"
              type="password"
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={async (e) => {
                if (e.key !== "Enter") return;
                setAdminPinLoading(true);
              try {
                const verifyAdminPin = httpsCallable(functions, 'verifyAdminPin');
                await verifyAdminPin({ pin: adminPin.trim() });
                setAdminPinOpen(false);
                await requestAdminAccess();
              } catch (e: any) {
                setAdminPinError(e?.message?.includes('Incorrect') ? 'Incorrect PIN.' : 'Verification failed.');
              } finally {
                setAdminPinLoading(false);
              }
              }}
            />
            {adminPinError && (
              <div className="mt-2 text-sm text-red-400">{adminPinError}</div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setAdminPinOpen(false)}
                className="flex-1 rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setAdminPinLoading(true);
                  try {
                    const verifyAdminPin = httpsCallable(functions, 'verifyAdminPin');
                    await verifyAdminPin({ pin: adminPin.trim() });
                    setAdminPinOpen(false);
                    await requestAdminAccess();
                  } catch (e: any) {
                    setAdminPinError(e?.message?.includes('Incorrect') ? 'Incorrect PIN.' : 'Verification failed.');
                  } finally {
                    setAdminPinLoading(false);
                  }
                }}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                  disabled={adminPinLoading}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-gradient-to-b from-slate-900 to-slate-950 backdrop-blur border-b border-blue-900 px-6 py-0.5 relative">
        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          <h1 className="text-2xl font-bold text-slate-100">ON-DECK</h1>
          <p className="text-slate-400 text-xs mt-0.5">Active View: {role}</p>
          <div className="mt-1">
            <Toggle
              activeRole={role}
              onSetRole={() => {
                lockAdminNow();
              }}
              onRequestAdmin={() => {
                setAdminPinError("");
                setAdminPin("");
                setAdminPinOpen(true);
              }}
            />
          </div>
        </div>

        <div className="flex items-start justify-between w-full">
          {/* Left */}
          <div className="flex flex-col items-start gap-3">
            <input
              className={`
                text-lg font-semibold border border-slate-700 rounded-lg px-3 py-1.5 shadow-sm
                text-center w-72 outline-none
                ${role === "Sales" ? "bg-slate-800/70 cursor-not-allowed" : "bg-slate-800"}
                text-slate-100 placeholder:text-slate-400
              `}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Company Name"
              disabled={role === "Sales"}
            />
            <div className="w-full flex justify-center">
              <button
                onClick={() =>
                  isAdminLike(role) ? setAddChooserOpen(true) : openAddModal()
                }
                className="h-16 w-16 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-500 transition -translate-y-2"
              >
                <span className="text-7xl font-light leading-none -mt-3">+</span>
              </button>
            </div>
          </div>

          {/* Right */}
          <div className="flex flex-col items-end gap-1">
            <div className="font-mono text-sm text-slate-200">{currentTime}</div>
            <select
              className={`border border-slate-700 rounded-lg px-3 py-1.5 text-sm shadow-sm 
                ${role === "Sales" ? "bg-slate-800/70 cursor-not-allowed" : "bg-slate-800"}
                text-slate-100`}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={role === "Sales"}
            >
              <option value="North">North</option>
              <option value="South">South</option>
            </select>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="p-6 pt-3">
        <Queue
          role={role}
          storeId={storeId}
          region={region}
          onAddSavedName={(fn, ln, em) => addSavedName(fn, ln, em)}
          registerAddHandler={(fn) => {
            queueAddRef.current = fn;
          }}
          onOpenAddModal={openAddModal}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [storeId, setStoreId] = useState<string>("");

  return (
    <AuthGate onStoreId={setStoreId}>
      {storeId ? (
        <AppInner storeId={storeId} />
      ) : (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">Account pending setup</p>
            <p className="text-sm text-slate-400">
              Your account hasn't been assigned to a store yet. Please contact your administrator.
            </p>
          </div>
        </div>
      )}
    </AuthGate>
  );
}