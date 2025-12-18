import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";


export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

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

      {children}
    </div>
  );
}
