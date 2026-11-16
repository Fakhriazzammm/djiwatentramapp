// Real database, isolated users, no calls to AI/Google and no customer writes.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { poolTx } from "./db";
import { createApp } from "./index";
import { parseReceipt } from "./receipt";
import type { ReceiptDocument } from "./receipt-document";
import { confirmReceipt, getReceipt } from "./receipt-records";
import { applySync } from "./sync";
const url=process.env.DATABASE_URL;
const run=url ? describe : describe.skip;
const p=url ? new Pool({connectionString:url,max:4,ssl:process.env.PGSSL==='off'?undefined:{rejectUnauthorized:false}}) : null;
const db=p ? poolTx(p) : null!;
const user=`itest-receipt-${crypto.randomUUID()}`,other=user+'-other';
const dir=mkdtempSync(join(tmpdir(),'receipt-integration-'));
const receipt={merchant:'Kedai Uji',purchasedAt:'2026-11-15T10:30:00Z',subtotal:30000,discount:2000,total:31000,items:[{name:'Kopi',qty:2,unitPrice:15000,discount:0,price:30000}],charges:[{label:'Pajak',kind:'tax',amount:3000,included:false}],tendered:null,change:null,confidence:.98};
const doc=()=>parseReceipt(JSON.stringify(receipt),'test');
const body=(document: ReceiptDocument=doc())=>({document,reviewed:true,accountId:'tunai',categoryId:'belanja'});
const seed=async(id:string)=>{await p!.query("insert into finance.receipts(user_id,id,merchant,total,tax,items,details) values($1,$2,'Kedai Uji',31000,3000,$3::jsonb,$4::jsonb)",[user,id,JSON.stringify(doc().items),JSON.stringify({version:2,original:doc()})]);};
afterAll(async()=>{if(!p)return;for(const t of ['entries','receipts','scan_usage','accounts','categories','profiles'])await p.query(`delete from finance.${t} where user_id=any($1::text[])`,[[user,other]]);await p.end();rmSync(dir,{recursive:true,force:true});});
run('itemized receipts in Postgres',()=>{
  test('owner-scoped reads and HTTP auth do not leak a document',async()=>{
    await applySync(db,user,{upserts:{accounts:[{id:'tunai',name:'Tunai',type:'cash',opening:0}],categories:[{id:'belanja',name:'Belanja',income:false}]}});
    await seed('rc-owner');
    await expect(getReceipt(db,other,'rc-owner')).rejects.toMatchObject({code:'NOT_FOUND'});
    const no=createApp({db,resolve:async()=>null,dir});
    expect((await no.request('/api/finance/receipts/rc-owner')).status).toBe(401);
    const app=createApp({db,resolve:async()=>other,dir});
    expect((await app.request('/api/finance/receipts/rc-owner')).status).toBe(404);
  });
  test('old cached clients cannot bypass document confirmation via generic sync',async()=>{
    await expect(applySync(db,user,{upserts:{entries:[{id:'legacy-client-entry',kind:'out',amount:30000,categoryId:'belanja',accountId:'tunai',at:'2026-11-15T10:30:00Z',receiptId:'rc-owner',source:'receipt'}]}})).rejects.toThrow('RECEIPT_CONFIRMATION_REQUIRED');
  });
  test('confirmation atomically saves corrections, tax and a single expense; concurrent retries are idempotent',async()=>{
    const corrected={...doc(),merchant:'Kedai Dikoreksi'};
    const app=createApp({db,resolve:async()=>user,dir});
    const responses=await Promise.all([1,2].map(()=>app.request('/api/finance/receipts/rc-owner/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body(corrected))})));
    expect(responses.map(r=>r.status)).toEqual([200,200]);
    const entries=(await p!.query('select amount from finance.entries where user_id=$1 and receipt_id=$2',[user,'rc-owner'])).rows;
    expect(entries).toHaveLength(1);expect(Number(entries[0].amount)).toBe(31000);
    await expect(applySync(db,user,{upserts:{entries:[{id:'duplicate',kind:'out',amount:31000,categoryId:'belanja',accountId:'tunai',at:'2026-11-15T10:30:00Z',receiptId:'rc-owner',source:'receipt'}]}})).rejects.toThrow('RECEIPT_CONFIRMATION_REQUIRED');
    const read=await getReceipt(db,user,'rc-owner');expect(read.merchant).toBe('Kedai Dikoreksi');expect(read.items[0].unitPrice).toBe(15000);expect(read.charges[0].amount).toBe(3000);
    const raw=(await p!.query('select details from finance.receipts where user_id=$1 and id=$2',[user,'rc-owner'])).rows[0];expect(raw.details.original.merchant).toBe('Kedai Uji');
  });
  test('mismatch and foreign account are rejected before a ledger write',async()=>{
    await seed('rc-invalid');
    await expect(confirmReceipt(db,user,'rc-invalid',body({...doc(),total:50000}))).rejects.toMatchObject({code:'RECEIPT_MISMATCH'});
    await expect(confirmReceipt(db,user,'rc-invalid',{...body(),accountId:'other-account'})).rejects.toMatchObject({code:'INVALID_ACCOUNT_OR_CATEGORY'});
    expect((await p!.query('select * from finance.entries where user_id=$1 and receipt_id=$2',[user,'rc-invalid'])).rows).toHaveLength(0);
    expect((await p!.query('select confirmed_at from finance.receipts where user_id=$1 and id=$2',[user,'rc-invalid'])).rows[0].confirmed_at).toBeNull();
  });
  test('editing updates both ledger and detail and rejects a stale second edit',async()=>{
    const old=await getReceipt(db,user,'rc-owner');
    const corrected={...old,discount:3000,total:30000};
    const result=await confirmReceipt(db,user,'rc-owner',{...body(corrected),revision:old.revision},true);
    expect(result.entry.amount).toBe(30000);expect(result.receipt.total).toBe(30000);
    await expect(confirmReceipt(db,user,'rc-owner',{...body(corrected),revision:old.revision},true)).rejects.toMatchObject({code:'RECEIPT_CHANGED'});
  });
  test('stale local sync cannot overwrite a reviewed receipt total',async()=>{
    const r=(await p!.query('select * from finance.entries where user_id=$1 and receipt_id=$2',[user,'rc-owner'])).rows[0];
    await applySync(db,user,{upserts:{entries:[{id:r.id,kind:'out',amount:1,categoryId:'belanja',accountId:'tunai',at:r.at,receiptId:'rc-owner',source:'receipt'}]}});
    expect(Number((await p!.query('select amount from finance.entries where user_id=$1 and id=$2',[user,r.id])).rows[0].amount)).toBe(30000);
  });
  test('a failure after updating the document rolls back the document and ledger together',async()=>{
    await seed('rc-rollback');
    await p!.query("insert into finance.entries(user_id,id,kind,amount,category_id,account_id,at) values($1,'receipt:rc-rollback','out',1,'belanja','tunai',now())",[user]);
    await expect(confirmReceipt(db,user,'rc-rollback',body())).rejects.toThrow();
    const r=(await p!.query('select confirmed_at,details from finance.receipts where user_id=$1 and id=$2',[user,'rc-rollback'])).rows[0];expect(r.confirmed_at).toBeNull();expect(r.details.reviewed).toBeUndefined();
  });
  test('retry after a user deleted a confirmed expense does not resurrect it',async()=>{
    await p!.query('delete from finance.entries where user_id=$1 and receipt_id=$2',[user,'rc-owner']);
    await expect(confirmReceipt(db,user,'rc-owner',body())).rejects.toMatchObject({code:'ALREADY_REMOVED'});
  });
  test('scan, review and reread retain the photo and never mutate the ledger during OCR',async()=>{
    const app=createApp({db,resolve:async()=>user,dir,read:async()=>doc()});
    const result=await app.request('/api/finance/receipts/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/jpeg;base64,/9j/4AAQ',id:'client-cannot-overwrite'})});
    expect(result.status).toBe(200);const data=await result.json() as any;
    expect(data.receipt.id).not.toBe('client-cannot-overwrite');
    const base='/api/finance/receipts/'+data.receipt.id;
    expect((await app.request(base+'/image')).headers.get('content-type')).toBe('image/jpeg');
    const saved=await app.request(base+'/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body())});expect(saved.status).toBe(200);
    const before=await getReceipt(db,user,data.receipt.id);
    expect((await app.request(base+'/reread',{method:'POST'})).status).toBe(200);
    const after=await getReceipt(db,user,data.receipt.id);expect(after.revision).toBe(before.revision);
    expect((await p!.query('select amount from finance.entries where user_id=$1 and receipt_id=$2',[user,data.receipt.id])).rows.map(r=>Number(r.amount))).toEqual([31000]);
    const foreign=createApp({db,resolve:async()=>other,dir,read:async()=>doc()});expect((await foreign.request(base+'/reread',{method:'POST'})).status).toBe(404);
  });
  test('legacy receipt exposes stored line totals and tax without claiming unit price was read',async()=>{
    await p!.query("insert into finance.receipts(user_id,id,merchant,total,tax,items) values($1,'legacy','Lama',11000,1000,$2::jsonb)",[user,JSON.stringify([{name:'Teh',qty:2,price:10000}])]);
    const r=await getReceipt(db,user,'legacy');expect(r.legacy).toBe(true);expect(r.items[0].unitPrice).toBeNull();expect(r.charges[0].amount).toBe(1000);expect(r.reconciliation.valid).toBe(true);
  });
});
