import { accessToken,type GoogleCfg,type Fetch } from '../google.js';
import { toRawMail } from './smtp.js';
import { extractPayment,issuerFor,domainOf } from './extract.js';
import { validatedDetails } from './details.js';
import type { Tx } from '../sync.js';
import type { Llm } from './pipeline.js';
/** Explicitly enrich an existing queued record. Never creates or edits a ledger entry. */
export async function rereadMail(db:Tx,userId:string,id:string,cfg:GoogleCfg,f:Fetch=fetch,llm?:Llm){
 const row=(await db.query("select message_id,parsed from finance.inbound_messages where user_id=$1 and id=$2 and status in ('review','failed','staged')",[userId,id])).rows[0];
 if(!row)throw Error('NOT_FOUND');
 const token=await accessToken(db,cfg,userId,f);if(!token)throw Error('NOT_CONNECTED');
 const headers={authorization:`Bearer ${token}`};
 const res=await f(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({q:`rfc822msgid:${String(row.message_id).replace(/[<>]/g,'')}`,maxResults:'1'})}`,{headers});
 if(!res.ok)throw Error(`GMAIL_${res.status}`);
 const found=(await res.json() as any).messages?.[0]?.id;if(!found)throw Error('EMAIL_NOT_FOUND');
 const raw=await f(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(found)}?format=raw`,{headers});if(!raw.ok)throw Error(`GMAIL_${raw.status}`);
 const mail=await toRawMail(Buffer.from((await raw.json() as any).raw,'base64url'),{ip:'',helo:'',sender:'',host:'gmail',recipients:[],trustGoogleVerdict:true});
 const issuer=issuerFor(domainOf(mail.from));
 if(!issuer||mail.messageId!==row.message_id)throw Error('SENDER_NOT_ALLOWED');
 if(!mail.auth.dmarcPass&&!mail.auth.dkimDomains.some(d=>issuer.domains.some(i=>d===i||d.endsWith('.'+i))))throw Error('AUTH_FAILED');
 let x=extractPayment(mail.subject,mail.text);
 if(llm){const m=await llm(mail.subject,mail.text,mail.from);if(m?.details)x={...x,details:validatedDetails(m.details,mail.text),merchant:m.details.description||x.merchant};}
 const details=x.details!;
 // Keep the reviewed amount and classification. Enrichment is not approval or correction of the ledger.
 if(details.total!==null&&Math.abs(details.total-Number(row.parsed?.amount??0))>.01)details.warnings.push('Total pada email berbeda dari nominal antrean. Periksa sebelum menyetujui.');
 await db.query(`update finance.inbound_messages set parsed=parsed || $3::jsonb where user_id=$1 and id=$2 and status in ('review','failed','staged')`,[userId,id,JSON.stringify({details,...(x.merchant?{merchant:x.merchant}:{})})]);
 return details;
}
