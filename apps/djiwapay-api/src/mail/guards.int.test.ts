import { afterAll, describe, expect, test } from 'bun:test';
import { Pool } from 'pg';
import { poolTx } from '../db';
import { processForUser } from './pipeline';
import { commitImport, importState } from '../gmail-import';
import { RULES_VERSION } from './extract';
const url=process.env.DATABASE_URL;
const run=url ? describe : describe.skip;
const user=`itest-guards-${crypto.randomUUID()}`;
const pool=url ? new Pool({connectionString:url,max:1,ssl:process.env.PGSSL==='off'?undefined:{rejectUnauthorized:false}}) : null;
const db=pool ? poolTx(pool) : null!;
afterAll(async()=>{if(!pool)return;for(const t of ['inbound_messages','gmail_import','entries','accounts','profiles'])await pool.query(`delete from finance.${t} where user_id=$1`,[user]);await pool.end();});
run('mail safety guards',()=>{
 test('a hallucinated amount cannot merge an existing ledger entry into a transfer',async()=>{
  const now=new Date();
  await pool!.query(`insert into finance.entries(user_id,id,kind,amount,category_id,account_id,at,note,source) values($1,'existing','out',77777,'lainnya','email-bca',$2,'Original','email')`,[user,now]);
  const result=await processForUser({db,domain:'example.test',llm:async()=>({amount:77777,direction:'in',merchant:'Kopi',accountHint:'',ref:'',at:now.getTime(),confidence:0.99,missing:[]})},user,100,{
   messageId:`guard-${crypto.randomUUID()}`,from:'no-reply@gopay.co.id',to:[],subject:'Pembayaran berhasil',text:'Pembayaran berhasil, nominal tidak tersedia.',date:now,auth:{dmarcPass:true,dkimDomains:['gopay.co.id']}
  });
  expect(result.status).toBe('review');
  expect((await pool!.query(`select kind,note from finance.entries where user_id=$1 and id='existing'`,[user])).rows[0]).toEqual({kind:'out',note:'Original'});
 });
 test('old sure rows stay out of the preview total and bulk commit, current rows still work',async()=>{
  const id=(await pool!.query(`insert into finance.gmail_import(user_id,status,period_days,since,until,window_end) values($1,'ready',365,now()-interval '365 days',now(),now()) returning id`,[user])).rows[0].id;
  for(const version of [RULES_VERSION-1,RULES_VERSION])await pool!.query(`insert into finance.inbound_messages(user_id,message_id,sender_domain,channel,status,import_id,parsed) values($1,$2,'gopay.co.id','gopay','staged',$3,$4::jsonb)`,[user,`old-${version}-${id}`,id,JSON.stringify({sure:true,rulesVersion:version,kind:'out',amount:25000,categoryId:'makan',accountId:'email-gopay',accountName:'GoPay',accountType:'ewallet',at:new Date().toISOString(),merchant:'Kopi'})]);
  const preview=await importState(db,user);
  expect((preview!.preview as any).sure.count).toBe(1);
  expect((preview!.preview as any).check.count).toBe(1);
  const done=await commitImport(db,user,id);
  expect(done).toMatchObject({committed:1,movedToReview:1});
  const old=(await pool!.query(`select status,parsed from finance.inbound_messages where user_id=$1 and import_id=$2 and parsed->>'rulesVersion'=$3`,[user,id,String(RULES_VERSION-1)])).rows[0];
  expect(old.status).toBe('review');expect(old.parsed.flags).toContain('old-rules');
 });
});
