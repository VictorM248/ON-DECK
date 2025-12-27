import { useEffect, useMemo, useState, useCallback } from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export type SavedName = {
  id: string;
  firstName: string;
  lastName: string;
};

type SavedNamesDoc = {
  names: SavedName[];
};

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
    await setDoc(ref, { names: [] }, { merge: true });
  }, [ref]);

  const addSavedName = useCallback(
    async (firstName: string, lastName: string) => {
      const fn = firstName.trim();
      const ln = lastName.trim();
      if (!fn) return;

      const key = `${fn.toLowerCase()}|${ln.toLowerCase()}`;
      const exists = savedNames.some(
        (n) => `${n.firstName.toLowerCase()}|${n.lastName.toLowerCase()}` === key
      );
      if (exists) return;

      const next: SavedName[] = [
        ...savedNames,
        { id: crypto.randomUUID(), firstName: fn, lastName: ln },
      ];

      // Ensure doc exists, then update
      await setDoc(ref, { names: [] }, { merge: true });
      await updateDoc(ref, { names: next });
    },
    [ref, savedNames]
  );

  const removeSavedName = useCallback(
    async (id: string) => {
      const next = savedNames.filter((n) => n.id !== id);
      await setDoc(ref, { names: [] }, { merge: true });
      await updateDoc(ref, { names: next });
    },
    [ref, savedNames]
  );

  return { savedNames, addSavedName, removeSavedName, initIfMissing, loading };
}
