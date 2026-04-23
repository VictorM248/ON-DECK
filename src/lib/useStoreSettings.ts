import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export type StoreSettings = {
  queueRotation: boolean;
  lockQueuePosition: boolean;
  rotationStartedAt?: number;
};

const defaults: StoreSettings = {
  queueRotation: false,
  lockQueuePosition: false,
  rotationStartedAt: undefined,
};

export function useStoreSettings(storeId: string) {
  const [settings, setSettings] = useState<StoreSettings>(defaults);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    const ref = doc(db, "stores", storeId, "settings", "features");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setSettings({ ...defaults, ...snap.data() } as StoreSettings);
      } else {
        setSettings(defaults);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [storeId]);

  const updateSetting = useCallback(
    async (key: keyof StoreSettings, value: boolean | number) => {
      const ref = doc(db, "stores", storeId, "settings", "features");
      await setDoc(ref, { [key]: value }, { merge: true });
    },
    [storeId]
  );

  return { settings, updateSetting, loading };
}