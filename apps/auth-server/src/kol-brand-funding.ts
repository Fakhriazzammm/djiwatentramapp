import type { Pool, PoolClient } from "pg";
import {
  brandMayarConfig,
  checkBrandTopup,
  mayarBrandRequest,
} from "../../../supabase/functions/_shared/kol-brand-payment.js";
import { httpsUrl } from "./kol-brand-contract.js";

type Queryable = Pool | PoolClient;
type Deposit = {
  id: string;
  invoice_id: string | null;
  invoice_url: string | null;
  nominal: number;
  fee: number;
  total: number;
  campaign_id: number;
};

export const brandPaymentsEnabled = () => process.env.KOL_BRAND_PAYMENTS_ENABLED === "true";
const feeSetting = Number(process.env.KOL_BUDGET_FEE_PERCENT ?? "0.7");
export const brandFeePercent =
  Number.isFinite(feeSetting) && feeSetting >= 0 && feeSetting <= 20 ? feeSetting : 0.7;

const configuredMayar = () =>
  brandMayarConfig(process.env.KOL_BRAND_MAYAR_ENV, process.env.KOL_BRAND_MAYAR_API_KEY);
export const brandCheckoutAvailable = () => brandPaymentsEnabled() && Boolean(configuredMayar());

function mayarConfig() {
  const config = configuredMayar();
  if (!brandPaymentsEnabled() || !config) throw new BrandFlowError("BRAND_PAYMENTS_UNAVAILABLE", 503);
  return config;
}
export class BrandFlowError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

export async function brandTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export const allowBrandWrites = (db: Queryable) =>
  db.query("select set_config('djiwa.kol_brand_write','on',true)");

export async function lockBrandCampaign(db: Queryable, campaign: number, business?: number) {
  const { rows } = await db.query(
    `select c.id, c.title, c.status, c.business_id, c.application_deadline, c.end_date, bc.reward_per_kol
       from pos.kol_campaigns c join pos.kol_brand_campaigns bc on bc.campaign_id = c.id
      where c.id = $1 and ($2::bigint is null or c.business_id = $2) for update of c`,
    [campaign, business ?? null],
  );
  if (!rows[0]) throw new BrandFlowError("BRAND_CAMPAIGN_NOT_FOUND", 404);
  return rows[0];
}

export async function assertBrandMember(db: Queryable, business: number, userId: string) {
  const { rows } = await db.query(
    `select b.name, m.contact_email, m.contact_phone
       from pos.kol_brand_memberships m join pos.kol_businesses b on b.id = m.business_id
      where m.business_id = $1 and m.user_id = $2 and m.status = 'active' and b.status = 'active'
      for share of m,b`,
    [business, userId],
  );
  if (!rows[0]) throw new BrandFlowError("BRAND_NOT_FOUND", 404);
  return rows[0];
}

export async function createBrandTopup(
  pool: Pool,
  business: number,
  campaign: number,
  userId: string,
  nominal: number,
  key: string,
) {
  const config = mayarConfig();
  const { deposit, payer, title, created } = await brandTransaction(pool, async (db) => {
    const payer = await assertBrandMember(db, business, userId);
    const cp = await lockBrandCampaign(db, campaign, business);
    const idempotency = `brand:deposit:${business}:${campaign}:${key}`;
    const previous = (
      await db.query<Deposit>("select * from pos.kol_budget_deposits where idempotency_key = $1", [
        idempotency,
      ])
    ).rows[0];
    if (previous) {
      if (Number(previous.nominal) !== nominal) throw new BrandFlowError("TOPUP_REQUEST_CHANGED");
      return { deposit: previous, payer, title: cp.title, created: false };
    }
    if (!["draft", "published"].includes(cp.status)) throw new BrandFlowError("CAMPAIGN_NOT_OPEN");
    const outstanding = await db.query(
      `select 1 from pos.kol_brand_topups t join pos.kol_budget_deposits d on d.id = t.deposit_id
      where d.campaign_id = $1 and t.state in ('creating','pending','review') limit 1`,
      [campaign],
    );
    if (outstanding.rows.length) throw new BrandFlowError("TOPUP_ALREADY_PENDING");
    await allowBrandWrites(db);
    const fee = Math.ceil((nominal * brandFeePercent) / 100);
    const {
      rows: [deposit],
    } = await db.query<Deposit>("select * from pos.kol_budget_deposit_create($1,'mayar',$2,$3,null,$4,$5)", [
      campaign,
      nominal,
      fee,
      `brand:${userId}`,
      idempotency,
    ]);
    await db.query("insert into pos.kol_brand_topups(deposit_id) values ($1)", [deposit.id]);
    return { deposit, payer, title: cp.title, created: true };
  });

  if (!created) {
    const {
      rows: [current],
    } = await pool.query("select state from pos.kol_brand_topups where deposit_id = $1", [deposit.id]);
    return {
      id: deposit.id,
      state: current?.state,
      url: current?.state === "pending" ? deposit.invoice_url : null,
    };
  }

  try {
    const invoice = await mayarBrandRequest<{ id?: string; link?: string; expiredAt?: number }>(
      config,
      "/invoices/create",
      {
        method: "POST",
        body: JSON.stringify({
          name: payer.name,
          email: payer.contact_email,
          mobile: payer.contact_phone,
          description: `Anggaran KOL · ${title}`,
          expiredAt: new Date(Date.now() + 24 * 3600000).toISOString(),
          items: [
            { quantity: 1, rate: Number(deposit.total), description: `Anggaran reward kampanye ${title}` },
          ],
          extraData: { kolBudgetDepositId: deposit.id },
        }),
      },
    );
    const checkout = httpsUrl(invoice.link);
    if (
      !invoice.id ||
      !checkout ||
      typeof invoice.expiredAt !== "number" ||
      !Number.isFinite(invoice.expiredAt)
    )
      throw new Error("INVOICE_RESPONSE_INVALID");
    await brandTransaction(pool, async (db) => {
      await lockBrandCampaign(db, campaign, business);
      await allowBrandWrites(db);
      await db.query("update pos.kol_budget_deposits set invoice_id = $2, invoice_url = $3 where id = $1", [
        deposit.id,
        invoice.id,
        invoice.link,
      ]);
      await db.query(
        "update pos.kol_brand_topups set state = 'pending', issue = null, provider_expires_at = $2 where deposit_id = $1",
        [deposit.id, new Date(invoice.expiredAt)],
      );
    });
    return { id: deposit.id, state: "pending", url: invoice.link };
  } catch {
    // A timed-out create may have generated a payable invoice. Finance reconciles before allowing a second one.
    await pool.query(
      `update pos.kol_brand_topups set state = 'review', issue = 'INVOICE_CREATE_UNCONFIRMED'
      where deposit_id = $1 and state = 'creating'`,
      [deposit.id],
    );
    return { id: deposit.id, state: "review", url: null };
  }
}

export async function reconcileBrandTopup(
  pool: Pool,
  campaign: number,
  depositId: string,
  business?: number,
) {
  const config = mayarConfig();
  const {
    rows: [target],
  } = await pool.query<Deposit & { state: string; last_checked_at: Date | null }>(
    `select d.id,d.invoice_id,d.total,t.state,t.last_checked_at
       from pos.kol_budget_deposits d join pos.kol_brand_topups t on t.deposit_id = d.id
       join pos.kol_campaigns c on c.id = d.campaign_id
      where d.id = $1 and c.id = $2 and ($3::bigint is null or c.business_id = $3)`,
    [depositId, campaign, business ?? null],
  );
  if (!target) throw new BrandFlowError("BRAND_INVOICE_NOT_FOUND", 404);
  if (!target.invoice_id || target.state === "paid") return { status: target.state };
  const claim = await pool.query(
    `update pos.kol_brand_topups set last_checked_at = now()
    where deposit_id = $1 and state <> 'paid' and (last_checked_at is null or last_checked_at < now() - interval '15 seconds')
    returning state`,
    [target.id],
  );
  if (!claim.rows[0]) return { status: target.state };

  return applyBrandTopupStatus(pool, config, target.id, target.invoice_id, Number(target.total));
}

async function applyBrandTopupStatus(
  pool: Pool,
  config: NonNullable<ReturnType<typeof brandMayarConfig>>,
  depositId: string,
  invoiceId: string,
  total: number,
) {
  const verified = await checkBrandTopup(config, invoiceId, total).catch(() => {
    throw new BrandFlowError("BRAND_PROVIDER_UNAVAILABLE", 503);
  });
  const {
    rows: [row],
  } = await pool.query("select pos.kol_brand_payment_result($1,$2,$3,$4,$5,$6) as result", [
    depositId,
    invoiceId,
    total,
    verified.status,
    verified.status === "paid" ? verified.transactionId : null,
    verified.status === "review" ? verified.reason : null,
  ]);
  return row.result;
}

export function startBrandTopupReconciliation(pool: Pool) {
  const config = configuredMayar();
  if (!brandPaymentsEnabled() || !config) return;
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      const { rows } = await pool.query<{ deposit_id: string; invoice_id: string; total: string }>(
        "select * from pos.kol_brand_topups_due(5)",
      );
      const results = await Promise.allSettled(
        rows.map((row) =>
          applyBrandTopupStatus(pool, config, row.deposit_id, row.invoice_id, Number(row.total)),
        ),
      );
      const failures = results.filter((result) => result.status === "rejected").length;
      if (failures) console.error("KOL Brand top-ups awaiting another reconciliation", { failures });
    } catch (error) {
      console.error("KOL Brand top-up selection failed", { code: (error as { code?: string })?.code });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void poll(), 120000);
  timer.unref();
}

export async function resolveMissingInvoice(
  pool: Pool,
  campaign: number,
  depositId: string,
  decision: { invoiceId: string } | { noInvoice: true },
  actor: string,
  note: string,
) {
  const recovered = "invoiceId" in decision ? await recoverInvoice(decision.invoiceId, depositId) : null;
  await brandTransaction(pool, async (db) => {
    await lockBrandCampaign(db, campaign);
    const {
      rows: [row],
    } = await db.query(
      `select d.*, t.state, t.created_at as attempt_at
      from pos.kol_budget_deposits d join pos.kol_brand_topups t on t.deposit_id = d.id
      where d.id = $1 and d.campaign_id = $2 for update of d,t`,
      [depositId, campaign],
    );
    if (
      !row ||
      row.invoice_id ||
      !["review", "creating"].includes(row.state) ||
      Date.now() - new Date(row.attempt_at).getTime() < 60000
    )
      throw new BrandFlowError("INVOICE_RECOVERY_UNAVAILABLE");
    await allowBrandWrites(db);
    if (recovered) {
      if (Number(row.total) !== recovered.amount) throw new BrandFlowError("INVOICE_MISMATCH");
      await db.query("update pos.kol_budget_deposits set invoice_id = $2, invoice_url = $3 where id = $1", [
        row.id,
        recovered.id,
        recovered.paymentUrl,
      ]);
      await db.query(
        "update pos.kol_brand_topups set state = 'pending', issue = null, provider_expires_at = $2 where deposit_id = $1",
        [row.id, new Date(recovered.expiredAt)],
      );
    } else {
      await db.query("update pos.kol_budget_deposits set status = 'cancelled' where id = $1", [row.id]);
      await db.query("update pos.kol_brand_topups set state = 'void', issue = null where deposit_id = $1", [
        row.id,
      ]);
    }
    await db.query(
      `insert into pos.kol_brand_events(campaign_id,entity_id,action,actor,detail)
      values ($1,$2,$3,$4,jsonb_build_object('note',$5::text,'invoiceId',$6::text))`,
      [
        campaign,
        depositId,
        recovered ? "invoice_recovered" : "invoice_voided",
        actor,
        note,
        recovered?.id ?? null,
      ],
    );
  });
  return recovered ? reconcileBrandTopup(pool, campaign, depositId) : { status: "void" };
}

async function recoverInvoice(id: string, depositId: string) {
  const cfg = mayarConfig();
  const invoice = await mayarBrandRequest<{
    id: string;
    amount: number;
    expiredAt: number;
    paymentUrl: string;
    transactionId?: string;
    transactions?: { id: string; extraData?: { kolBudgetDepositId?: string } }[];
  }>(cfg, `/invoices/${encodeURIComponent(id)}`).catch(() => {
    throw new BrandFlowError("BRAND_PROVIDER_UNAVAILABLE", 503);
  });
  if (invoice.id !== id || !httpsUrl(invoice.paymentUrl) || !Number.isFinite(invoice.expiredAt))
    throw new BrandFlowError("INVOICE_MISMATCH");
  const matches = invoice.transactions?.some(
    (transaction) => transaction.extraData?.kolBudgetDepositId === depositId,
  );
  if (!matches) {
    if (!invoice.transactionId) throw new BrandFlowError("INVOICE_MISMATCH");
    const transaction = await mayarBrandRequest<{
      extraData?: { kolBudgetDepositId?: string };
      paymentLink?: { id?: string };
    }>(cfg, `/transactions/${encodeURIComponent(invoice.transactionId)}`).catch(() => {
      throw new BrandFlowError("BRAND_PROVIDER_UNAVAILABLE", 503);
    });
    if (transaction.extraData?.kolBudgetDepositId !== depositId || transaction.paymentLink?.id !== id)
      throw new BrandFlowError("INVOICE_MISMATCH");
  }
  return invoice;
}
