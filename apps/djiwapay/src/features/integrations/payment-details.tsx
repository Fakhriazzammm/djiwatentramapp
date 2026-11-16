import type { PaymentDetails as Details } from '../../lib/finance/integrations';
import { rupiah } from '../../lib/djiwa-pay-format';
import { Breakdown, type BreakdownRow } from '../finance/breakdown';

export function PaymentDetails({details:d}:{details?:Details|null}){
 if(!d)return <p className="dpx-sub">Rincian belum tersimpan. Baca ulang isi email untuk melengkapinya.</p>;
 const sum=d.items.reduce((n,x)=>n+(x.amount??0),0);
 const computable=d.items.length>0&&d.items.every(x=>x.amount!==null);
 const computed=sum-(d.discount??0)+d.charges.reduce((n,c)=>n+(c.included?0:c.amount),0);
 const mismatch=computable&&d.total!==null&&Math.abs(computed-d.total)>.01;
 const rows:BreakdownRow[]=[];
 if(computable)rows.push({label:'Jumlah item',value:rupiah(sum)});
 if(d.subtotal!==null)rows.push({label:'Subtotal',value:rupiah(d.subtotal)});
 if(d.discount!==null)rows.push({label:'Diskon',value:'\u2212'+rupiah(d.discount)});
 for(const c of d.charges)rows.push({label:c.label+(c.included?' (termasuk)':''),value:rupiah(c.amount)});
 if(!d.charges.length)rows.push({label:'Pajak / biaya lain',value:'Tidak tercantum'});
 if(d.total!==null)rows.push({label:'Total pada email',value:rupiah(d.total),strong:true});
 return <div className="dpx-mail-details" aria-label="Rincian dari isi email">
  {d.description?<p className="dpx-mail-description">{d.description}</p>:null}
  <Breakdown title="Rincian email" count={d.items.length?`${d.items.length} item`:undefined}
   lines={d.items.map(x=>({name:x.name,sub:[x.qty!==null?`${x.qty.toLocaleString('id-ID')}`:'',x.unitPrice!==null?`\u00d7 ${rupiah(x.unitPrice)}`:''].filter(Boolean).join(' ')||undefined,amount:x.amount===null?'Tidak tercantum':rupiah(x.amount)}))}
   rows={rows} empty="Email tidak mencantumkan rincian barang per item.">
   {computable?<p className={`dpx-sub ${mismatch?'dpx-mail-warning':''}`}>Hitungan item \u2212 diskon + biaya tambahan: {rupiah(computed)}{mismatch?' \u00b7 Berbeda dari total email, perlu diperiksa.':''}</p>:null}
   {d.warnings.filter(w=>!w.includes('tidak merinci')).map((w,i)=><p key={i} className="dpx-mail-warning">{w}</p>)}
  </Breakdown>
 </div>;
}
