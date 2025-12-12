import { useState, useEffect, useRef } from "react";
import Toggle from "./components/Toggle";
import Queue from "./components/Queue";

type Role = "Sales" | "Admin";

type SavedName = {
  id: string;
  firstName: string;
  lastName: string;
};

export default function App() {
  // Role
  const [role, setRole] = useState<Role>(
    () => (localStorage.getItem("role") as Role) ?? "Sales"
  );
  useEffect(() => {
    localStorage.setItem("role", role);
  }, [role]);

  // Store name section
  const [storeName, setStoreName] = useState<string>(
    () => localStorage.getItem("storeName") ?? "Company Name"
  );
  useEffect(() => {
    localStorage.setItem("storeName", storeName);
  }, [storeName]);

  // Region dropdown menu
  const [region, setRegion] = useState<string>(
    () => localStorage.getItem("region") ?? "North"
  );
  useEffect(() => {
    localStorage.setItem("region", region);
  }, [region]);

  // Clock
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

  // Saved names "Locally stored"
  const [savedNames, setSavedNames] = useState<SavedName[]>(() => {
    const raw = JSON.parse(localStorage.getItem("savedNames") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((n: any) => ({
      id: n.id ?? crypto.randomUUID(),
      firstName: n.firstName ?? "",
      lastName: n.lastName ?? "",
    }));
  });

  useEffect(() => {
    localStorage.setItem("savedNames", JSON.stringify(savedNames));
  }, [savedNames]);

  const handleAddSavedName = (firstName: string, lastName: string) => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn) return;

    const key = `${fn.toLowerCase()}|${ln.toLowerCase()}`;
    if (
      savedNames.some(
        (n) =>
          `${n.firstName.toLowerCase()}|${n.lastName.toLowerCase()}` === key
      )
    ) {
      return;
    }

    setSavedNames((prev) => [
      ...prev,
      { id: crypto.randomUUID(), firstName: fn, lastName: ln },
    ]);
  };

  // NEW: remove saved names (Admin use only)
  const handleRemoveSavedName = (id: string) => {
    setSavedNames((prev) => prev.filter((n) => n.id !== id));
  };

  // Queue add handler ref
  const queueAddRef = useRef<
    ((first: string, last: string, note: string) => void) | null
  >(null);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalFirst, setModalFirst] = useState("");
  const [modalLast, setModalLast] = useState("");
  const [modalNote, setModalNote] = useState("");

  const openAddModal = () => setShowAddModal(true);

  const closeAddModal = () => {
    setShowAddModal(false);
    setModalFirst("");
    setModalLast("");
    setModalNote("");
  };

  const handleConfirmAdd = () => {
    const fn = modalFirst.trim();
    const ln = modalLast.trim();
    const nt = modalNote.trim();
    if (!fn) return;

    queueAddRef.current?.(fn, ln, nt);
    closeAddModal();
  };

  const handleQuickAddSaved = (saved: SavedName) => {
    const nt = modalNote.trim();
    queueAddRef.current?.(saved.firstName, saved.lastName, nt);
    closeAddModal();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-700 text-slate-100">
      {/* ADD GUEST MODAL */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeAddModal}
>

          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
          onClick={(e) => e.stopPropagation()}
>
            <h2 className="text-lg font-semibold mb-3 text-slate-100">
              Add guest to queue
            </h2>

            {/* Admin view section */}
            {role === "Admin" ? (
              <>
                <div className="space-y-3 mb-4">
                  <input
                    value={modalFirst}
                    onChange={(e) => setModalFirst(e.target.value)}
                    placeholder="First name"
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
                  />

                  <input
                    value={modalLast}
                    onChange={(e) => setModalLast(e.target.value)}
                    placeholder="Last name (optional)"
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
                  />

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
                    className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
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
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-semibold">
                              {(n.firstName[0] + (n.lastName?.[0] ?? "")).toUpperCase()}
                            </div>

                            <span className="font-medium text-slate-100">
                              {n.firstName} {n.lastName}
                            </span>
                          </div>

                          <button
                            onClick={() => handleRemoveSavedName(n.id)}
                            className="text-[11px] text-red-400 hover:text-red-300"
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
              /* Sales view section */
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

      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-gradient-to-b from-slate-900 to-slate-950 backdrop-blur border-b border-blue-900 px-6 py-0.5 relative">
        {/* Center is Centered */}
        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          <h1 className="text-2xl font-bold text-slate-100">
            ON-DECK
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">Active View: {role}</p>
          <div className="mt-1">
            <Toggle onChange={setRole} />
          </div>
        </div>

        {/* LEFT + RIGHT */}
        <div className="flex items-start justify-between w-full">
          {/* LEFT */}
          <div className="flex flex-col items-start gap-3">

            <input
              className={`
                text-lg font-semibold border border-slate-700 rounded-lg px-3 py-1.5 shadow-sm
                text-center w-72 outline-none
                ${
                  role === "Sales"
                    ? "bg-slate-800/70 cursor-not-allowed"
                    : "bg-slate-800"
                }
                text-slate-100 placeholder:text-slate-400
              `}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Company Name"
              disabled={role === "Sales"}
            />

            <div className="w-full flex justify-center">
            <button
              onClick={openAddModal}
              className="h-16 w-16 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-500 transition -translate-y-2"
            >
              <span className="text-7xl font-light leading-none -mt-3">+</span>
            </button>


          </div>
        </div>
          {/* RIGHT */}
          <div className="flex flex-col items-end gap-1">
            <div className="font-mono text-sm text-slate-200">
              {currentTime}
            </div>

            <select
              className={`border border-slate-700 rounded-lg px-3 py-1.5 text-sm shadow-sm 
        ${
          role === "Sales"
            ? "bg-slate-800/70 cursor-not-allowed"
            : "bg-slate-800"
        }
        text-slate-100`}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={role === "Sales"}
            >
              <option value="North">North</option>
              <option value="South">South</option>
              <option value="East">East</option>
              <option value="West">West</option>
            </select>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="p-6 pt-3">
        <Queue
          role={role}
          onAddSavedName={handleAddSavedName}
          registerAddHandler={(fn) => {
            queueAddRef.current = fn;
          }}
          onOpenAddModal={openAddModal}
        />
      </div>
    </div>
  );
}
