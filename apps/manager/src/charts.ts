// @ts-nocheck
// SVG chart helpers ported verbatim from prototype v20 charts.js (animations via CSS keyframes in proto.css).
const esc2 = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const CH={ink:'#111114',red:'#c73822',blue:'#1a5dc6',green:'#16a34a',amber:'#d99a00',gray:'#9a9aa6',teal:'#2f6b8a',purple:'#6b3fc4'};
export const PAL=[CH.blue,CH.ink,CH.green,CH.amber,CH.purple,CH.gray];
export const fmtRp=n=>(n<0?'−':'')+'Rp '+Math.abs(Math.round(n)).toLocaleString('id-ID');
export const fmtShort=n=>n>=1e6?(n/1e6).toFixed(n>=1e7?0:1).replace('.',',')+' jt':n>=1e3?Math.round(n/1e3)+' rb':String(Math.round(n));
export const pctChg=(a,b)=>b?((a-b)/b*100):0;
export const sgnPct=v=>(v>=0?'+':'−')+Math.abs(v).toFixed(1).replace('.',',')+'%';
export function svgArea(labels,series,o={}){
 const w=o.w||640,h=o.h||220,pad={l:46,r:12,t:12,b:26},iw=w-pad.l-pad.r,ih=h-pad.t-pad.b;
 const max=Math.max(1,...series.flatMap(s=>s.data))*1.12,n=labels.length;
 const x=i=>pad.l+(n===1?iw/2:iw*i/(n-1)),y=v=>pad.t+ih-ih*v/max;
 let g='';for(let k=0;k<=4;k++){const v=max*k/4,yy=y(v);g+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${yy}" y2="${yy}" stroke="#e6e6ea" stroke-width="1"/><text x="${pad.l-6}" y="${yy+3}" text-anchor="end" font-size="9" fill="#9a9aa6" font-family="ui-monospace,Menlo,monospace">${fmtShort(v)}</text>`}
 const step=Math.ceil(n/(o.maxTicks||8));
 g+=labels.map((l,i)=>i%step===0?`<text x="${x(i)}" y="${h-8}" text-anchor="middle" font-size="9" fill="#9a9aa6" font-family="ui-monospace,Menlo,monospace">${esc2(l)}</text>`:'').join('');
 let out='';series.forEach((s,si)=>{const pts=s.data.map((v,i)=>[x(i),y(v)]);let len=0;pts.forEach((p,i)=>{if(i)len+=Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1])});len=Math.ceil(len)+2;
  const d='M'+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L');const c=s.color||PAL[si];
  if(si===0)out+=`<path d="${d} L${x(n-1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z" fill="${c}" opacity=".08" style="animation:fadeIn 1.2s ease .3s both"/>`;
  out+=`<path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="--len:${len};stroke-dasharray:${len};animation:drawLn 1.3s cubic-bezier(.32,.72,0,1) ${si*.15}s both"/>`;
  out+=pts.map((p,i)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="#fff" stroke="${c}" stroke-width="1.8" style="animation:fadeIn .4s ease ${(.8+i*.04+si*.15).toFixed(2)}s both"><title>${esc2(labels[i])} · ${esc2(s.name)}: ${fmtRp(s.data[i])}</title></circle>`).join('')});
 return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Grafik tren" style="display:block;overflow:visible">${g}${out}</svg>`}
export function svgBars(labels,vals,o={}){
 const w=o.w||640,h=o.h||200,pad={l:46,r:8,t:12,b:24},iw=w-pad.l-pad.r,ih=h-pad.t-pad.b,n=vals.length,bw=iw/n*.62,max=Math.max(1,...vals)*1.1,hi=vals.indexOf(Math.max(...vals));
 let g='';for(let k=0;k<=3;k++){const v=max*k/3,yy=pad.t+ih-ih*v/max;g+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${yy}" y2="${yy}" stroke="#e6e6ea"/><text x="${pad.l-6}" y="${yy+3}" text-anchor="end" font-size="9" fill="#9a9aa6" font-family="ui-monospace,Menlo,monospace">${fmtShort(v)}</text>`}
 const bars=vals.map((v,i)=>{const bh=ih*v/max,xx=pad.l+iw*i/n+(iw/n-bw)/2;return `<rect x="${xx.toFixed(1)}" y="${(pad.t+ih-bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${i===hi?CH.ink:CH.blue}" opacity="${i===hi?1:.85}" style="transform-box:fill-box;transform-origin:bottom;animation:growY .8s cubic-bezier(.32,.72,0,1) ${(i*.04).toFixed(2)}s both"><title>${esc2(labels[i])}: ${fmtRp(v)}</title></rect><text x="${(xx+bw/2).toFixed(1)}" y="${h-8}" text-anchor="middle" font-size="9" fill="#9a9aa6" font-family="ui-monospace,Menlo,monospace">${esc2(labels[i])}</text>`}).join('');
 return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Grafik batang" style="display:block;overflow:visible">${g}${bars}</svg>`}
export function svgHBars(data,o={}){
 const w=o.w||520,rh=o.rh||30,h=data.length*rh+4,max=Math.max(1,...data.map(d=>d[1])),lw=o.lw||118,vw=o.vw||112,bw=w-lw-vw;
 return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Grafik batang horizontal" style="display:block">${data.map((d,i)=>{const yy=i*rh+4,l=bw*d[1]/max;return `<text x="0" y="${yy+15}" font-size="11" fill="#1d1d1f" font-family="-apple-system,Helvetica,Arial,sans-serif">${esc2(d[0])}</text><rect x="${lw}" y="${yy+5}" width="${bw}" height="12" rx="6" fill="#efeff2"/><rect x="${lw}" y="${yy+5}" width="${l.toFixed(1)}" height="12" rx="6" fill="${o.colors?o.colors[i%o.colors.length]:PAL[i%PAL.length]}" style="transform-box:fill-box;transform-origin:left;animation:growX .9s cubic-bezier(.32,.72,0,1) ${(i*.08).toFixed(2)}s both"/><text x="${w}" y="${yy+15}" text-anchor="end" font-size="11" fill="#6a6a76" font-family="ui-monospace,Menlo,monospace">${o.fmtVal?o.fmtVal(d[1]):fmtShort(d[1])}</text>`}).join('')}</svg>`}
export function donutHTML(data,o={}){
 const size=o.size||150,r=size/2-14,C=2*Math.PI*r,total=data.reduce((a,d)=>a+d[1],0)||1;let off=0;
 const segs=data.map((d,i)=>{const len=C*d[1]/total,s=`<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${PAL[i%PAL.length]}" stroke-width="20" stroke-dasharray="${(len-1.5).toFixed(2)} ${(C-len+1.5).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${size/2} ${size/2})" style="--c:${C.toFixed(2)};animation:donutIn 1.1s cubic-bezier(.32,.72,0,1) ${(i*.1).toFixed(2)}s both" data-seg="${i}" ${o.dim!==undefined&&o.dim!==null&&o.dim!==i?'opacity=".25"':''}><title>${esc2(d[0])}: ${fmtRp(d[1])} (${(d[1]/total*100).toFixed(1).replace('.',',')}%)</title></circle>`;off+=len;return s}).join('');
 const top=data.slice().sort((a,b)=>b[1]-a[1])[0];
 const svg=`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Grafik donat" style="flex:none"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#efeff2" stroke-width="20"/>${segs}<text x="50%" y="${size/2-2}" text-anchor="middle" font-size="${size*.11}" font-weight="600" fill="#1d1d1f" font-family="-apple-system,Helvetica,Arial,sans-serif">${(top[1]/total*100).toFixed(0)}%</text><text x="50%" y="${size/2+14}" text-anchor="middle" font-size="9" fill="#6a6a76" font-family="ui-monospace,Menlo,monospace">${esc2(top[0])}</text></svg>`;
 const leg=`<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;justify-content:center">${data.map((d,i)=>`<div data-leg="${i}" style="display:flex;align-items:center;gap:7px;font-size:11.5px;${o.dim!==undefined&&o.dim!==null&&o.dim!==i?'opacity:.4':''}"><span style="width:9px;height:9px;border-radius:3px;background:${PAL[i%PAL.length]};flex:none"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc2(d[0])}</span><span style="font-family:ui-monospace,Menlo,monospace;color:#6a6a76">${(d[1]/total*100).toFixed(0)}%</span></div>`).join('')}</div>`;
 return `<div style="display:flex;gap:14px;align-items:center">${svg}${leg}</div>`}
export function spark(data,color,w=96,h=30){const max=Math.max(...data),min=Math.min(...data),n=data.length;const pts=data.map((v,i)=>[2+(w-4)*i/(n-1),h-3-(h-6)*(v-min)/((max-min)||1)]);let len=0;pts.forEach((p,i)=>{if(i)len+=Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1])});len=Math.ceil(len)+2;
 return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block"><path d="M${pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" style="--len:${len};stroke-dasharray:${len};animation:drawLn 1.1s cubic-bezier(.32,.72,0,1) both"/></svg>`}
/* blok khusus untuk dokumen (laporan keuangan): metrics dan chart */
