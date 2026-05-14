export type Role = "owner" | "admin" | "manager" | "sales";

export function isAdminLike(role?: string) {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "Admin" ||
    role === "manager"
  );
}

export function isManagerLike(role?: string) {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "Admin"
  );
}

export function isOwner(role?: string) {
  return role === "owner";
}