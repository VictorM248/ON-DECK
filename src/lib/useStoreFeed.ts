import { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export type JoinType = "walk-in" | "appointment" | "appt-phone" | "appt-online";

export type QueueEntry = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  note?: string;
  joinedAt: number;
  serviceStart?: number;
  serviceEnd?: number;
  durationSec?: number;
  joinType?: JoinType;
  managers?: string[];
  teamLabel?: string;
  earlyReason?: "service" | "parts" | "finance" | "other";
  visitOutcome?: {
    testDrive?: boolean;
    proposal?: boolean;
    sold?: boolean;
    deposit?: boolean;
  };
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
    let unsubSnap: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        if (unsubSnap) unsubSnap();
        unsubSnap = null;
        return;
      }
      if (!unsubSnap) {
        unsubSnap = onSnapshot(ref, { includeMetadataChanges: false }, (snap) => {
          if (!snap.exists()) return;
          const d = snap.data() as Partial<StoreFeed>;
          setData({
            queue: (d.queue ?? []) as QueueEntry[],
            active: (d.active ?? []) as QueueEntry[],
            completed: (d.completed ?? []) as QueueEntry[],
          });
        });
      }
    });

    return () => {
      unsubAuth();
      if (unsubSnap) unsubSnap();
    };
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

  return { data, initIfMissing, updateFeed };
}