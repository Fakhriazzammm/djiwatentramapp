/** Apps Script hook: the user pastes a small script into their own Google account; it posts matching bank / e-wallet mail here.
 *  The URL token only says which user the mail belongs to. What is recorded is still decided by the same gates as every other path
 *  (sender allowlist, DKIM / DMARC, OTP filter, dedupe), so a leaked token can at worst replay genuine bank mail. */
import { randomBytes } from "node:crypto";
import { ISSUERS } from "./mail/extract.js";
import { ensureSource, processForUser, type PipelineDeps, type RawMail } from "./mail/pipeline.js";
import type { MailCtx } from "./mail/smtp.js";
import type { Q, Tx } from "./sync.js";

export const HOOK_MAX_BYTES = 1_000_000;
const newToken = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; return Array.from(randomBytes(40), (b) => a[b % a.length]).join(""); };

export const issuerDomains = () => [...new Set(ISSUERS.flatMap((i) => i.domains))];
export const hookQuery = () => `from:(${issuerDomains().join(" OR ")})`;

export async function getHook(db: Q, userId: string) {
  return (await db.query("select token,created_at,last_at,last_status,last_reason,received from finance.inbound_hooks where user_id=$1", [userId])).rows[0] ?? null;
}
export async function ensureHook(db: Q, userId: string, rotate = false) {
  const have = await getHook(db, userId);
  if (have && !rotate) return have;
  await db.query("insert into finance.inbound_hooks(user_id,token) values($1,$2) on conflict(user_id) do update set token=excluded.token, created_at=now(), last_at=null, last_status=null, last_reason=null, received=0", [userId, newToken()]);
  return (await getHook(db, userId))!;
}
export const removeHook = (db: Q, userId: string) => db.query("delete from finance.inbound_hooks where user_id=$1", [userId]);
const userOf = async (db: Q, token: string) => /^[A-Za-z0-9]{32,64}$/.test(token) ? ((await db.query("select user_id from finance.inbound_hooks where token=$1", [token])).rows[0]?.user_id as string | undefined) ?? null : null;

/** What the script asks before each run: which senders to look for. Kept on the server so the list can grow without the user re-pasting. */
export async function hookConfig(db: Q, token: string) {
  return (await userOf(db, token)) ? { query: hookQuery(), domains: issuerDomains(), version: 1 } : null;
}

export type HookDeps = { db: Tx; pipeline: PipelineDeps; toMail: (raw: Buffer, ctx: MailCtx) => Promise<RawMail> };
export type HookResult = { code: 200 | 404 | 413 | 422; body: { success: boolean; status?: string; reason?: string; error?: string } };

export async function receiveHook(d: HookDeps, token: string, raw: Buffer): Promise<HookResult> {
  const userId = await userOf(d.db, token);
  if (!userId) return { code: 404, body: { success: false, error: "TOKEN_INVALID" } };
  if (raw.length > HOOK_MAX_BYTES) return { code: 413, body: { success: false, error: "TOO_LARGE" } };
  if (raw.length < 40) return { code: 422, body: { success: false, error: "EMPTY" } };
  const mail = await d.toMail(raw, { ip: "", helo: "", sender: "", host: "apps-script", recipients: [] });
  const trusted = Number((await ensureSource(d.db, userId)).trusted_count ?? 0);
  const out = await processForUser(d.pipeline, userId, trusted, mail);
  await d.db.query("update finance.inbound_hooks set last_at=now(), last_status=$2, last_reason=$3, received=received+1 where user_id=$1", [userId, out.status, out.reason.slice(0, 80)]);
  return { code: 200, body: { success: true, status: out.status, reason: out.reason } };
}

/** The script the user pastes. Plain, readable and commented in Indonesian: people should be able to see exactly what it does. */
export function hookScript(url: string): string {
  return `/**
 * Djiwa Pay - penerus email pembayaran
 *
 * Skrip ini berjalan di akun Google-mu sendiri. Tiap 5 menit ia mencari email dari bank dan
 * e-wallet (daftar pengirimnya diambil dari Djiwa Pay), lalu mengirim email itu ke alamat
 * rahasiamu di bawah. Email dari pengirim lain tidak pernah dikirim. Skrip tidak membalas,
 * menghapus, atau mengubah email apa pun.
 *
 * Cara berhenti: jalankan fungsi "berhenti", atau hapus proyek skrip ini.
 */
var DJIWA_URL = "${url}";   // jangan dibagikan: siapa pun yang punya alamat ini bisa mengirim email ke catatanmu
var HARI_AWAL = 7;          // pertama kali jalan, ambil email 7 hari terakhir
var MAKS_PER_JALAN = 40;

function pasang() {
  berhenti();
  ScriptApp.newTrigger("sinkron").timeBased().everyMinutes(5).create();
  sinkron();
  Logger.log("Selesai. Skrip akan memeriksa email baru setiap 5 menit.");
}

function berhenti() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  PropertiesService.getScriptProperties().deleteAllProperties();
}

function sinkron() {
  var props = PropertiesService.getScriptProperties();
  var mulai = Date.now();
  var sejak = Number(props.getProperty("sejak")) || (mulai - HARI_AWAL * 86400000);
  var cek = UrlFetchApp.fetch(DJIWA_URL, { muteHttpExceptions: true });
  if (cek.getResponseCode() === 404) throw new Error("Alamat tidak berlaku lagi. Buka Djiwa Pay > Integrasi dan salin skrip yang baru.");
  if (cek.getResponseCode() !== 200) return;                       // coba lagi 5 menit lagi
  var cfg = JSON.parse(cek.getContentText());
  var batas = Math.floor((sejak - 3600000) / 1000);                // tumpang tindih 1 jam; Djiwa Pay membuang email ganda
  var utas = GmailApp.search(cfg.query + " after:" + batas, 0, 50);
  var surat = [];
  utas.forEach(function (u) {
    u.getMessages().forEach(function (m) {
      if (m.getDate().getTime() < sejak - 3600000) return;
      var dari = (m.getFrom().match(/<([^>]+)>/) || [null, m.getFrom()])[1].toLowerCase();
      var domain = dari.split("@").pop();
      var cocok = cfg.domains.some(function (d) { return domain === d || domain.slice(-d.length - 1) === "." + d; });
      if (cocok) surat.push(m);
    });
  });
  surat.sort(function (a, b) { return a.getDate() - b.getDate(); });
  var lengkap = surat.length <= MAKS_PER_JALAN, terakhir = sejak;
  for (var i = 0; i < surat.length && i < MAKS_PER_JALAN; i++) {
    var res = UrlFetchApp.fetch(DJIWA_URL, { method: "post", contentType: "text/plain", payload: surat[i].getRawContent(), muteHttpExceptions: true });
    var kode = res.getResponseCode();
    if (kode === 404) throw new Error("Alamat tidak berlaku lagi. Buka Djiwa Pay > Integrasi dan salin skrip yang baru.");
    if (kode !== 200 && kode !== 413 && kode !== 422) { lengkap = false; break; }   // server sibuk: lanjutkan dari sini di jalan berikutnya (413/422 = email tak terbaca, dilewati)
    terakhir = surat[i].getDate().getTime();
  }
  props.setProperty("sejak", String(lengkap ? mulai : terakhir));
}
`;
}
