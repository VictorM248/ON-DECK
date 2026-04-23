import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, microsoftProvider, db } from "../lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

export function AuthGate({ children, onStoreId }: { children: React.ReactNode, onStoreId?: (storeId: string) => void }) {
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

      console.log("AUTH:", {
      email: u.email,
      emailVerified: u.emailVerified,
      uid: u.uid,
      providerData: u.providerData,
    });
    await u.getIdTokenResult(true).then((t) =>
      console.log("TOKEN:", {
        email: t.claims.email,
        email_verified: t.claims.email_verified,
        provider: t.signInProvider,
      })
    );


      const emailUid = (u.email ?? "").toLowerCase().replace(/[^a-z0-9]/g, "_");
      const userRef = doc(db, "users", emailUid);
      const snap = await getDoc(userRef);

      // Make sure user doc exists with baseline fields
        if (!snap.exists()) {
  await setDoc(
    userRef,
    {
      role: "sales",
      storeId: "",
      email: u.email ?? "",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
      } else {
        // Keep email up to date if its missing
        const data = snap.data();
        if (!data?.email && u.email) {
          await updateDoc(userRef, { email: u.email });
        }
      }

      // 2) Re-read (or use existing snap) to decide if we need a name prompt
      const latestSnap = snap.exists() ? snap : await getDoc(userRef);
      const data = latestSnap.data() || {};
      const storeId = (data.storeId ?? "").toString().trim();
      if (onStoreId) onStoreId(storeId);

      const existingName = (data.displayName ?? "").toString().trim();

      // Prefer Firebase Auth displayName if available (Google profile), but still allow user to set their own.
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md text-center">
          {/* Dalton icon + ON-DECK */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <img src="/daltonicon.png" alt="Dalton" className="h-16 w-16 object-contain rounded-xl" />
            <div className="w-px h-12 bg-slate-300" />
            <div className="text-4xl font-black text-slate-900 tracking-widest">ON-DECK</div>
          </div>

          {/* Subtitle */}
          <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">
            Dalton Motors Queue Management
          </div>

          {/* Store logos */}
          <div className="mb-8">
            <img src="/all-logos.png" alt="Toyota · Hyundai · Subaru" className="w-full max-w-md object-contain mx-auto rounded-xl" />
          </div>

          {/* Sign in card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <div className="text-lg font-black text-slate-800 mb-1">Welcome back</div>
            <div className="text-sm text-slate-400 mb-6">Sign in with your Dalton Corp account</div>
            <button
              onClick={() => signInWithPopup(auth, microsoftProvider)}
              className="w-full flex items-center justify-center gap-3 bg-[#1e3a5f] hover:bg-[#16304f] transition rounded-xl py-3 text-sm font-bold text-white"
            >
              <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
              Continue with Microsoft
            </button>
            <div className="text-xs text-slate-300 mt-4">@daltoncorp.com accounts only</div>
          </div>

          <div className="text-xs text-slate-300 mt-6">© 2026 DaltonMotors </div>
        </div>
      </div>
    );
  }

  // If the user is signed in but profile isn't ready, lock the app behind the name modal.
  return (
  <>
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
  </>
);
}
