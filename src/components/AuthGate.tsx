import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, googleProvider, db } from "../lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [profileReady, setProfileReady] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setProfileReady(false);

      if (!u) {
        setLoading(false);
        return;
      }

      const userRef = doc(db, "users", u.uid);
      const snap = await getDoc(userRef);

      // 1) Ensure the user doc exists with baseline fields
      if (!snap.exists()) {
        await setDoc(
          userRef,
          {
            role: "sales",
            email: u.email ?? "",
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        // Keep email up to date if it was missing
        const data = snap.data();
        if (!data?.email && u.email) {
          await updateDoc(userRef, { email: u.email });
        }
      }

      // 2) Re-read (or use existing snap) to decide if we need a name prompt
      const latestSnap = snap.exists() ? snap : await getDoc(userRef);
      const data = latestSnap.data() || {};

      const existingName = (data.displayName ?? "").toString().trim();

      // Prefer Firebase Auth displayName if available (Google profile),
      // but still allow user to set their own.
      const authName = (u.displayName ?? "").trim();

      if (existingName) {
        setProfileReady(true);
      } else if (authName) {
        // Auto-fill once using Google profile name
        await updateDoc(userRef, { displayName: authName });
        setProfileReady(true);
      } else {
        // Prompt user
        setNameModalOpen(true);
        setProfileReady(false);
      }

      setLoading(false);
    });
  }, []);

  async function saveDisplayName() {
    if (!user) return;
    const name = displayNameInput.trim();
    if (!name) return;

    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { displayName: name });

    setNameModalOpen(false);
    setProfileReady(true);
  }

  if (loading) return null;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border p-6 space-y-4">
          <div className="text-lg font-semibold">Sign in</div>

          <button
            className="w-full rounded bg-black text-white py-2"
            onClick={() => signInWithPopup(auth, googleProvider)}
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // If the user is signed in but profile isn't ready, lock the app behind the name modal.
  return (
    <div>
      <div className="p-2 flex justify-end">
        <button
          className="px-3 py-1 rounded border"
          onClick={() => signOut(auth)}
        >
          Sign out
        </button>
      </div>

      {nameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
            <div className="text-lg font-semibold text-white">
              Set your name
            </div>
            <div className="mt-1 text-sm text-slate-300">
              This is what other people will see in ON-DECK.
            </div>

            <input
              className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none"
              placeholder="Your name (e.g., Victor)"
              value={displayNameInput}
              onChange={(e) => setDisplayNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDisplayName();
              }}
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200"
                onClick={() => signOut(auth)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                disabled={!displayNameInput.trim()}
                onClick={saveDisplayName}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {profileReady ? children : null}
    </div>
  );
}
