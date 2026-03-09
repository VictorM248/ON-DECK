export type Role = "owner" | "admin" | "manager" | "sales";

export function isAdminLike(role?: string) {
  return role === "admin" || role === "owner" || role === "Admin";
}

export function isOwner(role?: string) {
  return role === "owner";
}
