import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

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
    await setDoc(
      ref,
      { queue: [], active: [], completed: [] },
      { merge: true }
    );
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
