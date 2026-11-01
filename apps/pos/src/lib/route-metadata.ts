/** Shell navigation policy only; data authorization remains on the backend. */
export const HR_DESTINATIONS = [
 { to: "/admin/operational-team", label: "Dasbor Tim" },
 { to: "/admin/operational-team/karyawan", label: "Karyawan" },
 { to: "/admin/operational-team/karyawan/data", label: "Data Karyawan" },
 { to: "/admin/operational-team/attendance", label: "Absensi" },
 { to: "/admin/operational-team/attendance/jadwal", label: "Jadwal" },
 { to: "/admin/operational-team/attendance/pengaturan", label: "Pengaturan Absensi" },
 { to: "/admin/operational-team/payroll", label: "Gaji & Role" },
 { to: "/admin/operational-team/payroll/slip", label: "Slip Gaji" },
 { to: "/admin/operational-team/register", label: "Register Karyawan" },
 { to: "/admin/operational-team/register/onboarding", label: "Onboarding & Persetujuan" },
 { to: "/admin/operational-team/register/contract", label: "Kontrak Kerja" },
 { to: "/admin/operational-team/register/riwayat", label: "Riwayat Kontrak" },
 { to: "/admin/operational-team/rekrutmen", label: "Rekrutmen" },
] as const;

const ADMIN_PERMISSIONS: Record<string, readonly string[]> = {
 "/admin": ["analytics:view"],
 "/admin/ai-chat": [],
 "/admin/orders": ["orders:view"],
 "/admin/products": ["products:manage"],
 "/admin/recipe": ["inventory:manage"],
 "/admin/recipe/hpp": ["inventory:manage", "finance:view"],
 "/admin/inventory": ["inventory:manage"],
 "/admin/stock-overview": ["inventory:manage"],
 "/admin/booking": ["orders:view"],
 "/admin/kitchen": [],
 "/admin/bar": [],
 "/admin/customer-service": ["orders:view"],
 "/admin/customers": [],
 "/admin/discounts": ["products:manage"],
 "/admin/minigames": ["products:manage"],
 "/admin/finance": ["finance:view"],
 "/admin/forecasting": ["analytics:view"],
 "/admin/recommendation-metrics": ["analytics:view"],
 "/admin/operational-team": ["users:manage"],
 "/admin/onboarding": ["users:manage"],
 "/admin/settings": ["settings:manage"],
};

export function canAccessAdminRoute(path: string, isAdmin: boolean, permissions: readonly string[] = []): boolean {
 if (isAdmin) return true;
 const pathname = path.split(/[?#]/)[0].replace(/\/$/, "");
 const match = Object.keys(ADMIN_PERMISSIONS)
  .filter((route) => pathname === route || (route !== "/admin" && pathname.startsWith(`${route}/`)))
  .sort((a, b) => b.length - a.length)[0];
 if (!match) return false;
 const required = ADMIN_PERMISSIONS[match];
 return required.length === 0 || required.some((permission) => permissions.includes(permission));
}

export function isLoginRoute(path: string): boolean {
 return ["/admin/login", "/karyawan/login", "/kasir/login"].includes(path);
}

export function isPublicRoute(path: string): boolean {
 return isLoginRoute(path) || path === "/register" || path.startsWith("/register/selesai/");
}

export function loginPathFor(path: string): "/karyawan/login" | "/kasir/login" {
 return path === "/karyawan" || path.startsWith("/karyawan/") ? "/karyawan/login" : "/kasir/login";
}

export const RETURN_PATH_KEY = "pos-login-return-path";

export function safeReturnPath(value: string | null | undefined): string | null {
 if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value)) return null;
 let decoded: string;
 try { decoded = decodeURIComponent(value); } catch { return null; }
 if (decoded.startsWith("//") || /[\\\s]/.test(decoded)) return null;
 const pathname = new URL(decoded, "https://pos.local").pathname;
 if (isPublicRoute(pathname)) return null;
 return value;
}
