import { describe, expect, it } from "bun:test";
import { kolAdminContext } from "./kol-portal";

function context() {
  return {
    req: { raw: { headers: new Headers() } },
    json: (body: unknown, status: number) => ({ body, status }),
  };
}

function makeAuth(user: unknown) {
  return { api: { getSession: async () => user ? { user } : null } };
}

describe("KOL admin identity bridge", () => {
  it("rejects unverified Better Auth emails before querying staff records", async () => {
    let queried = false;
    const pool = { query: async () => { queried = true; return { rows: [] }; } };
    const result = await kolAdminContext(
      context(),
      makeAuth({ id: "better-auth-id", email: "admin@example.test", emailVerified: false }),
      pool,
    );
    expect("error" in result ? result.error.status : 200).toBe(401);
    expect(queried).toBe(false);
  });

  it("maps by verified email to the active canonical Yumi admin identity", async () => {
    let query = "";
    let values: unknown[] = [];
    const pool = {
      query: async (text: string, parameters?: unknown[]) => {
        query = text;
        values = parameters ?? [];
        return { rows: [{ source_id: "yumi_staff_7", display_name: "Admin", role_name: "Admin" }] };
      },
    };
    const result = await kolAdminContext(
      context(),
      makeAuth({ id: "better-auth-id", email: " ADMIN@Example.Test ", emailVerified: true }),
      pool,
    );
    expect(query).toContain("from auth.users au");
    expect(query).toContain("u.auth_user_id = au.id::text");
    expect(query).toContain("au.email_confirmed_at is not null");
    expect(values).toEqual(["admin@example.test"]);
    expect(result).toMatchObject({ userId: "yumi_staff_7", role: "admin", name: "Admin" });
  });

  it("denies non-admin roles and ambiguous identity mappings", async () => {
    const staff = { query: async () => ({ rows: [{ source_id: "staff", display_name: "Staff", role_name: "Staff" }] }) };
    const user = { id: "better-auth-id", email: "staff@example.test", emailVerified: true };
    const denied = await kolAdminContext(context(), makeAuth(user), staff);
    expect("error" in denied ? denied.error.status : 200).toBe(403);

    const ambiguous = { query: async () => ({ rows: [
      { source_id: "staff_a", display_name: "A", role_name: "Admin" },
      { source_id: "staff_b", display_name: "B", role_name: "Admin" },
    ] }) };
    const rejected = await kolAdminContext(context(), makeAuth(user), ambiguous);
    expect("error" in rejected ? rejected.error.status : 200).toBe(401);
  });
});
