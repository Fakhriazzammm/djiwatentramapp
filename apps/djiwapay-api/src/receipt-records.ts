import { normalizeReceiptDocument, reconcileReceipt, type ReceiptDocument } from "./receipt-document.js";
import type { Q, Tx } from "./sync.js";

export class ReceiptProblem extends Error { constructor(public code: string, public status = 422) { super(code); } }
export function receiptFromRow(r: Record<string, any>) {
  const original = r.details?.original ?? { merchant: r.merchant, purchasedAt: r.purchased_at ? new Date(r.purchased_at).toISOString() : null, total: r.total, tax: r.tax, items: r.items };
  const document = normalizeReceiptDocument(r.details?.reviewed ?? original);
  return { id: r.id, ...document, confidence: r.confidence ?? 0, model: r.model ?? "legacy", legacy: !r.details, reviewed: Boolean(r.details?.reviewed), revision: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null, reconciliation: reconcileReceipt(document) };
}
export async function getReceipt(q: Q, userId: string, id: string) {
  const r = await q.query("select * from finance.receipts where user_id=$1 and id=$2", [userId, id]);
  if (!r.rows[0]) throw new ReceiptProblem("NOT_FOUND", 404);
  return receiptFromRow(r.rows[0]);
}
const entryFromRow = (e: Record<string, any>) => ({ id: e.id, kind: e.kind, amount: Number(e.amount), categoryId: e.category_id, accountId: e.account_id, at: new Date(e.at).toISOString(), note: e.note, tags: e.tags ?? [], source: e.source, receiptId: e.receipt_id, createdAt: new Date(e.created_at).toISOString(), ...(e.to_account_id ? { toAccountId: e.to_account_id } : {}), ...(e.foreign_currency && e.foreign_amount ? { foreignCurrency: e.foreign_currency, foreignAmount: Number(e.foreign_amount), ...(e.fx_rate ? { fxRate: Number(e.fx_rate) } : {}) } : {}) });

export async function confirmReceipt(db: Tx, userId: string, id: string, body: any, revise = false) {
  if (!body || body.reviewed !== true || typeof body.accountId !== "string" || typeof body.categoryId !== "string" || !body.document || typeof body.document !== "object") throw new ReceiptProblem("BAD_REQUEST", 400);
  const document: ReceiptDocument = normalizeReceiptDocument(body.document);
  if (!reconcileReceipt(document).valid || !document.merchant || !document.purchasedAt || !Number.isFinite(Date.parse(document.purchasedAt))) throw new ReceiptProblem("RECEIPT_MISMATCH");
  document.purchasedAt = new Date(document.purchasedAt).toISOString();
  return db.tx(async q => {
    const found = await q.query("select * from finance.receipts where user_id=$1 and id=$2 for update", [userId, id]);
    const r = found.rows[0];
    if (!r) throw new ReceiptProblem("NOT_FOUND", 404);
    const previous = await q.query("select * from finance.entries where user_id=$1 and receipt_id=$2 order by created_at", [userId, id]);
    if (!revise && r.confirmed_at) {
      const e = previous.rows.find(e=>e.id === `receipt:${id}`);
      if (!e) throw new ReceiptProblem("ALREADY_REMOVED", 409);
      return { receipt: receiptFromRow(r), entry: entryFromRow(e), alreadySaved: true };
    }
    if (!revise && previous.rows.length) throw new ReceiptProblem("ALREADY_RECORDED", 409);
    if (revise && (previous.rows.length !== 1 || !Object.hasOwn(body, "revision") || body.revision !== (r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null))) throw new ReceiptProblem("RECEIPT_CHANGED", 409);
    const kind = document.kind ?? "itemized", entryKind = kind === "refund" ? "in" : kind === "topup" ? "tf" : "out";
    const foreign = document.currency !== "IDR";
    if (foreign && !document.fx) throw new ReceiptProblem("FX_REQUIRED");
    const amount = foreign ? Math.round(document.total * document.fx!.rate) : document.total;
    if (!(amount > 0)) throw new ReceiptProblem("RECEIPT_MISMATCH");
    const toAccountId = entryKind === "tf" ? String(body.toAccountId ?? "") : null;
    if (entryKind === "tf" && (!toAccountId || toAccountId === body.accountId)) throw new ReceiptProblem("INVALID_ACCOUNT_OR_CATEGORY");
    const account = await q.query("select id from finance.accounts where user_id=$1 and id = any($2::text[]) and not archived", [userId, entryKind === "tf" ? [body.accountId, toAccountId] : [body.accountId]]);
    const category = await q.query("select id from finance.categories where user_id=$1 and id=$2 and income=$3", [userId, body.categoryId, entryKind === "in"]);
    if (account.rows.length !== (entryKind === "tf" ? 2 : 1) || !category.rows.length) throw new ReceiptProblem("INVALID_ACCOUNT_OR_CATEGORY");
    const tags = foreign ? [`trip:${document.currency}-${document.purchasedAt.slice(0, 7)}`] : [];
    const fxCols = foreign ? [document.currency, document.total, document.fx!.rate] : [null, null, null];
    const entryId = revise ? previous.rows[0].id : `receipt:${id}`;
    if (entryId.length > 80) throw new ReceiptProblem("BAD_REQUEST", 400);
    const details = { version: 2, original: r.details?.original ?? receiptFromRow(r), reviewed: document };
    const tax = document.charges.filter(c=>c.kind === "tax").reduce((s,c)=>s+(c.amount ?? 0),0);
    const saved = await q.query("update finance.receipts set merchant=$3,purchased_at=$4,total=$5,tax=$6,items=$7::jsonb,details=$8::jsonb,confirmed_at=now() where user_id=$1 and id=$2 returning *", [userId, id, document.merchant, document.purchasedAt, document.total, tax, JSON.stringify(document.items), JSON.stringify(details)]);
    const inserted = revise ? await q.query("update finance.entries set kind=$3,amount=$4,category_id=$5,account_id=$6,to_account_id=$7,at=$8,note=$9,tags=$10::text[],foreign_currency=$11,foreign_amount=$12,fx_rate=$13 where user_id=$1 and id=$2 returning *", [userId, entryId, entryKind, amount, body.categoryId, body.accountId, toAccountId, document.purchasedAt, document.merchant, tags, ...fxCols]) : await q.query("insert into finance.entries(user_id,id,kind,amount,category_id,account_id,to_account_id,at,note,tags,source,receipt_id,foreign_currency,foreign_amount,fx_rate) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],'receipt',$11,$12,$13,$14) returning *", [userId, entryId, entryKind, amount, body.categoryId, body.accountId, toAccountId, document.purchasedAt, document.merchant, tags, id, ...fxCols]);
    await q.query("insert into finance.profiles(user_id,version) values($1,1) on conflict(user_id) do update set version=finance.profiles.version+1,updated_at=now()", [userId]);
    await q.query("update finance.google_sheet_exports set dirty=true,next_sync_at=least(next_sync_at,now()+interval '8 seconds') where user_id=$1", [userId]);
    return { receipt: receiptFromRow(saved.rows[0]), entry: entryFromRow(inserted.rows[0]), alreadySaved: false };
  });
}

/** Adds a scanned receipt to an entry that already exists (e.g. read from a payment e-mail): the paid amount, wallet and time stay as the bank reported them; the receipt supplies items, tax and discounts. */
export async function attachReceipt(db: Tx, userId: string, id: string, body: any) {
  if (!body || body.reviewed !== true || typeof body.entryId !== "string" || !body.document || typeof body.document !== "object") throw new ReceiptProblem("BAD_REQUEST", 400);
  const document: ReceiptDocument = normalizeReceiptDocument(body.document);
  if (!reconcileReceipt(document).valid || !document.merchant) throw new ReceiptProblem("RECEIPT_MISMATCH");
  if (!document.purchasedAt || !Number.isFinite(Date.parse(document.purchasedAt))) document.purchasedAt = null as never; else document.purchasedAt = new Date(document.purchasedAt).toISOString();
  return db.tx(async q => {
    const found = await q.query("select * from finance.receipts where user_id=$1 and id=$2 for update", [userId, id]);
    const r = found.rows[0];
    if (!r) throw new ReceiptProblem("NOT_FOUND", 404);
    const used = await q.query("select id from finance.entries where user_id=$1 and receipt_id=$2", [userId, id]);
    if (used.rows.length && used.rows[0].id !== body.entryId) throw new ReceiptProblem("ALREADY_RECORDED", 409);
    const entry = await q.query("select * from finance.entries where user_id=$1 and id=$2 for update", [userId, body.entryId]);
    if (!entry.rows[0]) throw new ReceiptProblem("NOT_FOUND", 404);
    if (entry.rows[0].receipt_id && entry.rows[0].receipt_id !== id) throw new ReceiptProblem("ALREADY_RECORDED", 409);
    const details = { version: 2, original: r.details?.original ?? receiptFromRow(r), reviewed: document, attachedTo: body.entryId };
    const tax = document.charges.filter(c => c.kind === "tax").reduce((s, c) => s + (c.amount ?? 0), 0);
    const saved = await q.query("update finance.receipts set merchant=$3,purchased_at=$4,total=$5,tax=$6,items=$7::jsonb,details=$8::jsonb,confirmed_at=now() where user_id=$1 and id=$2 returning *", [userId, id, document.merchant, document.purchasedAt, document.total, tax, JSON.stringify(document.items), JSON.stringify(details)]);
    const updated = await q.query("update finance.entries set receipt_id=$3 where user_id=$1 and id=$2 returning *", [userId, body.entryId, id]);
    await q.query("insert into finance.profiles(user_id,version) values($1,1) on conflict(user_id) do update set version=finance.profiles.version+1,updated_at=now()", [userId]);
    await q.query("update finance.google_sheet_exports set dirty=true,next_sync_at=least(next_sync_at,now()+interval '8 seconds') where user_id=$1", [userId]);
    return { receipt: receiptFromRow(saved.rows[0]), entry: entryFromRow(updated.rows[0]), alreadySaved: false };
  });
}
