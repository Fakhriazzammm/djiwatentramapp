// Role-level access helpers for admin workspace pages.
// Server boundaries use the SAME allowlist (kol-public, pos-notifications,
// customer-community worker) — keep these in sync so UI gates never show a
// page that the server would reject, and never hide data the server allows.
const ADMIN_LEVEL_ROLES = new Set(["admin", "administrator", "owner", "superadmin", "super admin"]);

export function isAdminLevelRole(roleName?: string | null): boolean {
  if (!roleName) return false;
  return ADMIN_LEVEL_ROLES.has(roleName.trim().toLowerCase());
}

// pos-notifications server accepts manager in addition to admin-level roles.
export function isBroadcastRole(roleName?: string | null): boolean {
  if (!roleName) return false;
  const name = roleName.trim().toLowerCase();
  return ADMIN_LEVEL_ROLES.has(name) || name.includes("manager");
}
