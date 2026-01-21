import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  getDoc,
} from "firebase/firestore";

export type QueueEntry = {
  id: string;
  firstName: string;
  lastName: string;
  note?: string;
  joinedAt: number;
  serviceStart?: number;
  joinType?: "walk-in" | "appointment";
  managers?: string[];
  teamLabel?: string;

  // ✅ added: under-2-minute return reason
  earlyReason?: "service" | "parts" | "finance" | "other";
};

type StoreFeed = {
  queue: QueueEntry[];
  active: QueueEntry[];
  completed: QueueEntry[];
};

export function useStoreFeed(storeId: string, region: string) {
  const [data, setData] = useState<StoreFeed>({
    queue: [],
    active: [],
    completed: [],
  });

  useEffect(() => {
    const ref = doc(db, "stores", storeId, "regions", region);

    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as StoreFeed;

      setData({
        queue: d.queue ?? [],
        active: d.active ?? [],
        completed: d.completed ?? [],
      });
    });

    return () => unsub();
  }, [storeId, region]);

  const initIfMissing = async () => {
    const ref = doc(db, "stores", storeId, "regions", region);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        queue: [],
        active: [],
        completed: [],
      });
    }
  };

  const updateFeed = async (partial: Partial<StoreFeed>) => {
    const ref = doc(db, "stores", storeId, "regions", region);
    await updateDoc(ref, partial);
  };

  return {
    data,
    initIfMissing,
    updateFeed,
  };
}
