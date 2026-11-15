import { readFileSync } from "node:fs";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { authenticate } from "mailauth";
import { processMail, type PipelineDeps, type RawMail } from "./pipeline.js";

const MAX_BYTES = 1_000_000;

const stripTags = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#?\w+;/g, " ");

/** Parses and authenticates one raw message into the shape the pipeline wants. */
export type MailCtx = { ip: string; helo: string; sender: string; host: string; recipients: string[]; resolver?: (name: string, rr: string) => Promise<unknown> };
export async function toRawMail(raw: Buffer, ctx: MailCtx): Promise<RawMail> {
  const parsed = await simpleParser(raw, { skipImageLinks: true, skipHtmlToText: false });
  let dmarcPass = false; const dkimDomains: string[] = [];
  try {
    const a = await authenticate(raw, { ip: ctx.ip, helo: ctx.helo, sender: ctx.sender, mta: ctx.host, trustReceived: true, ...(ctx.resolver ? { resolver: ctx.resolver } : {}) } as any);
    dmarcPass = typeof a.dmarc === "object" && a.dmarc?.status?.result === "pass";
    for (const r of a.dkim?.results ?? []) if (r.status?.result === "pass" && r.signingDomain) dkimDomains.push(String(r.signingDomain).toLowerCase());
  } catch { /* an unverifiable mail simply fails the gate */ }
  return {
    messageId: parsed.messageId ?? "", from: parsed.from?.value?.[0]?.address ?? ctx.sender, to: ctx.recipients, subject: parsed.subject ?? "",
    text: (parsed.text && parsed.text.trim() ? parsed.text : stripTags(parsed.html || "")).slice(0, 20_000), date: parsed.date ?? null, auth: { dmarcPass, dkimDomains },
  };
}

export function startSmtp(deps: PipelineDeps, o: { port: number; host?: string; hostname: string; tlsKey?: string; tlsCert?: string; log?: (m: string) => void }) {
  const log = o.log ?? console.log;
  const hits = new Map<string, { n: number; t: number }>();
  const limited = (ip: string) => { const now = Date.now(), h = hits.get(ip); if (!h || now - h.t > 60_000) { hits.set(ip, { n: 1, t: now }); return false; } h.n++; return h.n > 60; };
  const server = new SMTPServer({
    name: o.hostname, banner: "Djiwa Pay", size: MAX_BYTES, authOptional: true, disabledCommands: ["AUTH"], maxClients: 30, socketTimeout: 60_000, closeTimeout: 5000,
    key: o.tlsKey ? readFileSync(o.tlsKey) : undefined, cert: o.tlsCert ? readFileSync(o.tlsCert) : undefined,
    onConnect(session, cb) { return limited(session.remoteAddress) ? cb(new Error("421 Too many connections")) : cb(); },
    onRcptTo(addr, session, cb) {
      const [local, dom] = addr.address.toLowerCase().split("@");
      if (dom !== deps.domain.toLowerCase() || !/^[a-z0-9]{8,32}$/.test(local ?? "")) return cb(Object.assign(new Error("550 No such mailbox"), { responseCode: 550 }));
      if (session.envelope.rcptTo.length >= 1) return cb(Object.assign(new Error("452 One recipient per message"), { responseCode: 452 }));
      cb();
    },
    onData(stream, session, cb) {
      const chunks: Buffer[] = []; let size = 0, tooBig = false;
      stream.on("data", (c: Buffer) => { size += c.length; if (size <= MAX_BYTES) chunks.push(c); else tooBig = true; });
      stream.on("end", async () => {
        if (tooBig || (stream as any).sizeExceeded) return cb(Object.assign(new Error("552 Message too large"), { responseCode: 552 }));
        try {
          const mail = await toRawMail(Buffer.concat(chunks), { ip: session.remoteAddress, helo: session.hostNameAppearsAs ?? "", sender: session.envelope.mailFrom ? session.envelope.mailFrom.address : "", host: o.hostname, recipients: session.envelope.rcptTo.map((r) => r.address) });
          const out = await processMail(deps, mail);
          log(`mail ${out.status} ${out.reason}${out.userId ? "" : ""}`);
          cb();
        } catch (e) { log(`mail error ${e instanceof Error ? e.message : e}`); cb(Object.assign(new Error("451 Try again later"), { responseCode: 451 })); }
      });
    },
  });
  server.on("error", (e: Error) => log(`smtp error ${e.message}`));
  server.listen(o.port, o.host ?? "0.0.0.0", () => log(`djiwapay-mail listening on ${o.host ?? "0.0.0.0"}:${o.port} for @${deps.domain}`));
  return server;
}
