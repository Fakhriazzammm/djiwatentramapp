import type { PaymentDetails as Details } from '../../lib/finance/integrations';
import { rupiah } from '../../lib/djiwa-pay-format';
export function PaymentDetails({details:d}:{details?:Details|null}){
 if(!d)return <p className="dpx-sub">Rincian belum tersimpan. Baca ulang isi email untuk melengkapinya.</p>;
 const hasItems=d.items.length>0;
 const sum=d.items.reduce((n,x)=>n+(x.amount??0),0);
 const computable=hasItems&&d.items.every(x=>x.amount!==null);
 const computed=sum-(d.discount??0)+d.charges.reduce((n,c)=>n+(c.included?0:c.amount),0);
 const mismatch=computable&&d.total!==null&&Math.abs(computed-d.total)>.01;
 return <section className="dpx-mail-details" aria-label="Rincian dari isi email">
  {d.description?<p className="dpx-mail-description">{d.description}</p>:null}
  {hasItems?<table><thead><tr><th>Item / jumlah</th><th>Jumlah harga</th></tr></thead><tbody>{d.items.map((x,i)=><tr key={i}><td>{x.name}<small>{x.qty!==null?`${x.qty} × `:''}{x.unitPrice!==null?rupiah(x.unitPrice):''}</small></td><td>{x.amount===null?'Tidak tercantum':rupiah(x.amount)}</td></tr>)}</tbody></table>:<p className="dpx-sub">Email tidak mencantumkan rincian barang per item.</p>}
  <dl>{d.subtotal!==null?<><dt>Subtotal</dt><dd>{rupiah(d.subtotal)}</dd></>:null}{d.discount!==null?<><dt>Diskon</dt><dd>−{rupiah(d.discount)}</dd></>:null}{d.charges.map((c,i)=><div className="dpx-mail-charge" key={i}><dt>{c.label}{c.included?' (termasuk)':''}</dt><dd>{rupiah(c.amount)}</dd></div>)}{!d.charges.length?<><dt>Pajak / biaya lain</dt><dd>Tidak tercantum</dd></>:null}{d.total!==null?<><dt><b>Total pada email</b></dt><dd><b>{rupiah(d.total)}</b></dd></>:null}</dl>
  {computable?<p className={`dpx-sub ${mismatch?'dpx-mail-warning':''}`}>Perhitungan item − diskon + biaya tambahan: {rupiah(computed)}{mismatch?' · Berbeda dari total email, perlu diperiksa.':''}</p>:null}
  {d.warnings.filter(w=>!w.includes('tidak merinci')).map((w,i)=><p key={i} className="dpx-mail-warning">{w}</p>)}
 </section>;
}
