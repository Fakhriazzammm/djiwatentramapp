import type { Pool } from "pg";
import type { Tx } from "./sync.js";

export function poolTx(pool: Pool): Tx {
  return {
    query: (t, p) => pool.query(t, p as any[]),
    tx: async (fn) => {
      const client = await pool.connect();
      try { await client.query("begin"); const out = await fn({ query: (t, p) => client.query(t, p as any[]) }); await client.query("commit"); return out; }
      catch (e) { await client.query("rollback").catch(() => {}); throw e; } finally { client.release(); }
    },
  };
}
