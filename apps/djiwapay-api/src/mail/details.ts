import { parseRupiah } from './extract.js';
export type PaymentDetails = {
 description: string; items: { name: string; qty: number | null; unitPrice: number | null; amount: number | null }[];
 subtotal: number | null; discount: number | null; charges: { label: string; amount: number; included: boolean }[];
 total: number | null; warnings: string[];
};
const compact=(s:string)=>s.replace(/\s+/g,' ').trim();
const value=(s:string)=>{const m=s.match(/(?:Rp|IDR)\.?\s*([\d][\d.,]*)/i);return m?parseRupiah(m[1]):null;};
export function paymentDetails(body:string):PaymentDetails {
 const lines=body.split(/\r?\n/).map(compact).filter(Boolean);
 const details:PaymentDetails={description:'',items:[],subtotal:null,discount:null,charges:[],total:null,warnings:[]};
 const label=/^(nama (?:produk|barang|layanan|merchant|penerima)|produk|layanan|merchant|penerima|penyedia jasa|keterangan|deskripsi|jenis transaksi)\s*[:\-]?\s*(.*)$/i;
 const descriptions:string[]=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i], next=lines[i+1]??'', joined=line+' '+next;
  const field=line.match(label);
  if(field){const name=(field[2]||next).split(/\s+(?:nominal|total|jumlah|no\.? referensi|rekening|tanggal|jam|biaya|bank|[*•]{3,}|\d{5})\b/i)[0].trim();if(name&&!/^(Rp|IDR|tanggal|jam|nominal|total|biaya|rekening)\b/i.test(name)&&name.length<160)descriptions.push(name);}
  const money=value(line)??value(next);
  if(money!==null){
   if(/^(sub\s*total|jumlah harga barang)\b/i.test(line))details.subtotal=money;
   else if(/^(diskon|potongan|discount)\b/i.test(line))details.discount=money;
   else if(/^(pajak|ppn|pb1|tax|biaya (?:admin(?:istrasi)?|transaksi|layanan|pengiriman)|ongki[rs]|service (?:fee|charge)|shipping)\b/i.test(line)){
    details.charges.push({label:line.split(/(?:Rp|IDR)/i)[0].replace(/[:\s]+$/,'').slice(0,80),amount:money,included:/termasuk|included|inclusive/i.test(joined)});
   }else if(/^(total(?: transaksi| pembayaran| bayar)?|jumlah (?:transaksi|transfer|pembayaran))\b/i.test(line))details.total=money;
  }
  // A line item must explicitly print a name and amount. Do not turn balances/metadata into products.
  const row=line.match(/^(.{2,120}?)\s+(?:(\d+(?:[.,]\d+)?)\s*[x×]\s*(?:Rp|IDR)\s*([\d.,]+)\s+)?(?:Rp|IDR)\s*([\d.,]+)\s*$/i);
  if(row&&!/^(sub.?total|total|nominal|jumlah|biaya|pajak|ppn|pb1|diskon|potongan|saldo|sisa|limit|tunai|kembali|cashback|ongkir|service|shipping|harga)\b/i.test(row[1]))details.items.push({name:row[1].trim(),qty:row[2]?Number(row[2].replace(',','.')):null,unitPrice:row[3]?parseRupiah(row[3]):null,amount:parseRupiah(row[4])});
 }
 details.description=[...new Set(descriptions)].slice(0,3).join(' · ');
 if(!details.items.length)details.warnings.push('Email ini tidak merinci barang atau jasa per item.');
 return details;
}
/** Model details may only repeat names and monetary figures actually printed in the body. */
export function validatedDetails(raw:unknown,body:string):PaymentDetails {
 const fallback=paymentDetails(body);if(!raw||typeof raw!=='object')return fallback;
 const r=raw as Record<string,any>, text=compact(body).toLowerCase();
 const printed=[...body.matchAll(/(?:Rp|IDR)\.?\s*([\d][\d.,]*)/gi)].map(m=>parseRupiah(m[1]));
 const amount=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&printed.some(p=>Math.abs(p-n)<.01)?n:null;
 const present=(s:unknown)=>typeof s==='string'&&s.length<=160&&s.trim().length>1&&text.includes(compact(s).toLowerCase());
 const items=Array.isArray(r.items)?r.items.slice(0,100).filter((x:any)=>present(x?.name)).map((x:any)=>({name:x.name.trim(),qty:typeof x.qty==='number'&&x.qty>0&&x.qty<=1e6&&new RegExp(`\\b${String(x.qty).replace('.', '[.,]')}\\b`).test(body)?x.qty:null,unitPrice:amount(x.unitPrice),amount:amount(x.amount)})).filter((x:any)=>x.amount!==null):[];
 const charges=Array.isArray(r.charges)?r.charges.slice(0,20).filter((x:any)=>present(x?.label)&&amount(x.amount)!==null).map((x:any)=>({label:x.label.slice(0,80),amount:amount(x.amount)!,included:x.included===true&&/termasuk|included|inclusive/i.test(body)})):[];
 return {description:present(r.description)?r.description:fallback.description,items:items.length?items:fallback.items,subtotal:amount(r.subtotal)??fallback.subtotal,discount:amount(r.discount)??fallback.discount,charges:charges.length?charges:fallback.charges,total:amount(r.total)??fallback.total,warnings:items.length?[]:fallback.warnings};
}
