import { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc, getDoc, runTransaction } from "firebase/firestore";
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
  onLunch?: boolean;
  visitOutcome?: {
    testDrive?: boolean;
    proposal?: boolean;
    sold?: boolean;
    deposit?: boolean;
    vehicleType?: "new" | "used" | "n/a";
  };
};

type StoreFeed = {
  queue: QueueEntry[];
  active: QueueEntry[];
  completed: QueueEntry[];
};

const emptyFeed: StoreFeed = { queue: [], active: [], completed: [] };

export function useStoreFeed(storeId: string, region: string) {
  const [data, setData] = useState<StoreFeed>(emptyFeed);

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
      await setDoc(ref, emptyFeed);
    }
  };

  // Legacy-style update — still works, but computes from whatever local state
  // the caller already has. Prefer updateFeedTx below for anything that reads
  // queue/active/completed before deciding what to write.
  const updateFeed = async (partial: Partial<StoreFeed>) => {
    const ref = doc(db, "stores", storeId, "regions", region);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.exists() ? snap.data() : emptyFeed) as StoreFeed;
      tx.set(ref, { ...current, ...partial });
    });
  };

  // Transaction-safe update — pass a function that computes the next state
  // FROM the live server data, not from local React state. This closes the
  // race-condition gap: Firestore re-reads fresh data on each retry if another
  // write happened in between, so nothing gets silently overwritten.
  const updateFeedTx = async (
    updater: (current: StoreFeed) => Partial<StoreFeed>
  ) => {
    const ref = doc(db, "stores", storeId, "regions", region);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.exists() ? (snap.data() as StoreFeed) : emptyFeed);
      const next = updater(current);
      tx.set(ref, { ...current, ...next });
    });
  };

  return { data, initIfMissing, updateFeed, updateFeedTx };
}