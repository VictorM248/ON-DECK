import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { db } from "./firebase";


export type SavedManager = { id: string; name: string };
type ManagersDoc = { managers: SavedManager[] };

export function useSavedManagersFirestore(storeId: string) {
  const ref = useMemo(() => doc(db, "stores", storeId, "meta", "managers"), [storeId]);

  const [savedManagers, setSavedManagers] = useState<SavedManager[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSavedManagers([]);
        return;
      }
      const d = snap.data() as ManagersDoc;
      setSavedManagers(d.managers ?? []);
    });

    return () => unsub();
  }, [ref]);

  const initIfMissing = useCallback(async () => {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { managers: [] }, { merge: true });
    }
  }, [ref]);

  const addManager = useCallback(
    async (name: string): Promise<SavedManager | null> => {
      const nm = name.trim().replace(/\s+/g, " ");
      if (!nm) return null;

      const manager = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);

        const current: SavedManager[] = snap.exists()
          ? ((snap.data() as ManagersDoc).managers ?? [])
          : [];

        const existing = current.find((m) => m.name.toLowerCase() === nm.toLowerCase());
        if (existing) return existing;

        const created: SavedManager = { id: crypto.randomUUID(), name: nm };
        tx.set(ref, { managers: [...current, created] }, { merge: true });
        return created;
      });

      return manager ?? null;
    },
    [ref]
  );

  return { savedManagers, addManager, initIfMissing };
}
