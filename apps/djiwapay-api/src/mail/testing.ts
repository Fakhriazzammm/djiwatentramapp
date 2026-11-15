// Test support: builds mail that is really DKIM-signed with a throwaway key, plus a resolver that publishes that key.
import { generateKeyPairSync } from "node:crypto";
import { dkimSign } from "mailauth";

/** A message really signed with a generated key; DNS is answered by a local resolver. */
export async function signed(domain: string, from: string, subject: string, body: string, opts: { tamper?: boolean; wrongKey?: boolean } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const msg = `From: ${from}\r\nTo: user@example.com\r\nSubject: ${subject}\r\nMessage-ID: <${crypto.randomUUID()}@${domain}>\r\nDate: Sun, 15 Nov 2026 06:50:00 +0000\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;
  const { signatures } = await dkimSign(msg, { canonicalization: "relaxed/relaxed", signatureData: [{ signingDomain: domain, selector: "s1", privateKey, algorithm: "rsa-sha256" }] } as any);
  const publish = (opts.wrongKey ? other.publicKey : publicKey).replace(/-----[^-]+-----|\s/g, "");
  const resolver = async (name: string, rr: string) => { if (rr === "TXT" && name === `s1._domainkey.${domain}`) return [[`v=DKIM1; k=rsa; p=${publish}`]]; throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }); };
  let raw = signatures + msg;
  if (opts.tamper) raw = raw.replace("Rp 25.000", "Rp 2.500.000");
  return { raw: Buffer.from(raw), resolver };
}

