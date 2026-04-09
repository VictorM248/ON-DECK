import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

export type StoreUser = {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  storeId: string;
};

export function useStoreUsers(storeId: string) {
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;

    const q = query(
      collection(db, "users"),
      where("storeId", "==", storeId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: StoreUser[] = snap.docs.map((d) => ({
        uid: d.id,
        displayName: d.data().displayName ?? "",
        email: d.data().email ?? "",
        role: d.data().role ?? "sales",
        storeId: d.data().storeId ?? "",
      }));
      setUsers(list);
      setLoading(false);
    });

    return () => unsub();
  }, [storeId]);

  const guestUsers = users;

  const managerUsers = users.filter(
    (u) => u.role === "manager" || u.role === "admin" || u.role === "owner"
  );

  return { users, guestUsers, managerUsers, loading };
}