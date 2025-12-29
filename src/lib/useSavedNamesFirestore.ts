import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export type SavedName = { id: string; firstName: string; lastName: string };
type SavedNamesDoc = { names: SavedName[] };

export function useSavedNamesFirestore(storeId: string) {
  const ref = useMemo(() => doc(db, "stores", storeId, "meta", "savedNames"), [storeId]);

  const [savedNames, setSavedNames] = useState<SavedName[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSavedNames([]);
        setLoading(false);
        return;
      }
      const data = snap.data() as SavedNamesDoc;
      setSavedNames(data.names ?? []);
      setLoading(false);
    });

    return () => unsub();
  }, [ref]);

  const initIfMissing = useCallback(async () => {
    const snap = await getDoc(ref);
    if (!snap.exists()) await setDoc(ref, { names: [] }, { merge: true });
  }, [ref]);

  const addSavedName = useCallback(
    async (firstName: string, lastName: string) => {
      const fn = firstName.trim().replace(/\s+/g, " ");
      const ln = lastName.trim().replace(/\s+/g, " ");
      if (!fn) return null;

      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const current: SavedName[] = snap.exists()
          ? ((snap.data() as SavedNamesDoc).names ?? [])
          : [];

        const exists = current.find(
          (n) =>
            n.firstName.toLowerCase() === fn.toLowerCase() &&
            (n.lastName ?? "").toLowerCase() === (ln ?? "").toLowerCase()
        );
        if (exists) return exists;

        const next: SavedName = { id: crypto.randomUUID(), firstName: fn, lastName: ln };
        tx.set(ref, { names: [...current, next] }, { merge: true });
        return next;
      });
    },
    [ref]
  );

  const removeSavedName = useCallback(
    async (id: string) => {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const current = ((snap.data() as SavedNamesDoc).names ?? []) as SavedName[];
        tx.set(ref, { names: current.filter((n) => n.id !== id) }, { merge: true });
      });
    },
    [ref]
  );

  return { savedNames, addSavedName, removeSavedName, initIfMissing, loading };
}
