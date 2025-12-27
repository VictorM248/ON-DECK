import { useEffect, useState } from "react";

export type SavedName = {
  id: string;
  firstName: string;
  lastName: string;
};

export function useSavedNames(storageKey = "savedNames") {
  const [savedNames, setSavedNames] = useState<SavedName[]>(() => {
    const raw = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((n: any) => ({
      id: n.id ?? crypto.randomUUID(),
      firstName: n.firstName ?? "",
      lastName: n.lastName ?? "",
    }));
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(savedNames));
  }, [savedNames, storageKey]);

  const addSavedName = (firstName: string, lastName: string) => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn) return;

    const key = `${fn.toLowerCase()}|${ln.toLowerCase()}`;
    if (
      savedNames.some(
        (n) => `${n.firstName.toLowerCase()}|${n.lastName.toLowerCase()}` === key
      )
    ) {
      return;
    }

    setSavedNames((prev) => [
      ...prev,
      { id: crypto.randomUUID(), firstName: fn, lastName: ln },
    ]);
  };

  const removeSavedName = (id: string) => {
    setSavedNames((prev) => prev.filter((n) => n.id !== id));
  };

  return { savedNames, addSavedName, removeSavedName };
}
