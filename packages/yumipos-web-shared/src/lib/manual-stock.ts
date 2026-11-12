import { useEffect, useState } from 'react';
import { createClient } from './client';
export type StockMode='manual'|'integrated';
export type ManualStockValue={mode:'availability'|'count';status:'available'|'out'|'unknown';quantity:number|null;unit:string};
export type ManualStockItem=ManualStockValue&{inventoryId:string;name:string;updatedAt:number|null;updatedBy:string|null};
export type ManualStockHistory={id:string;at:number;actorName:string|null;note:string|null;before:ManualStockValue|null;after:ManualStockValue};
let cached:{mode:StockMode;at:number}|null=null;
let pending:Promise<StockMode>|null=null;
export async function fetchStockMode():Promise<StockMode>{
 if(cached&&Date.now()-cached.at<5000)return cached.mode;
 if(pending)return pending;
 pending=(async()=>{const {data,error}=await createClient().rpc('inventory_stock_mode');if(error)throw new Error('Pengaturan stok gagal dimuat');if(data?.mode!=='manual'&&data?.mode!=='integrated')throw new Error('Mode stok tidak valid');cached={mode:data.mode,at:Date.now()};return data.mode as StockMode})().finally(()=>{pending=null});
 return pending;
}
/** Never perform automatic quantity/HPP writes if mode cannot be verified. Sales may continue independently. */
export async function shouldRunIntegratedStock():Promise<boolean>{try{return await fetchStockMode()==='integrated'}catch{return false}}
export function useManualStockMode(){
 const [state,setState]=useState<{mode:StockMode|null;error:string|null;loading:boolean}>({mode:cached?.mode??null,error:null,loading:!cached});
 useEffect(()=>{let active=true;const refresh=async()=>{try{const mode=await fetchStockMode();if(active)setState({mode,error:null,loading:false})}catch(e){if(active)setState({mode:null,error:e instanceof Error?e.message:'Pengaturan stok gagal dimuat',loading:false})}};void refresh();const timer=setInterval(()=>{if(document.visibilityState!=='hidden')void refresh()},10000);const onVisible=()=>{if(document.visibilityState==='visible')void refresh()};document.addEventListener('visibilitychange',onVisible);return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible)}},[]);
 return state;
}
export async function fetchManualStock():Promise<{items:ManualStockItem[]}>{const {data,error}=await createClient().rpc('manual_stock_snapshot');if(error||!data||!Array.isArray(data.items))throw new Error('Data stok manual gagal dimuat');return data;}
async function protectedStock(action:string,args:Record<string,unknown>){
 const token=typeof window==='undefined'?'':localStorage.getItem('yumi_session_token')?.trim();if(!token)throw new Error('Silakan login untuk memperbarui stok');
 const url=String(import.meta.env.VITE_SUPABASE_URL??'').replace(/\/+$/,'');const key=String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??import.meta.env.VITE_SUPABASE_ANON_KEY??'');
 const response=await fetch(url+'/functions/v1/admin-protected-read',{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${token}`,'x-yumi-session-token':token},body:JSON.stringify({action,...args}),signal:AbortSignal.timeout(15000)});
 const body=(await response.json()) as {success?:boolean;data?:any;error?:{message?:string}};if(!response.ok||body?.success!==true)throw new Error(body?.error?.message??'Perubahan stok gagal disimpan');return body.data;
}
export async function saveManualStock(input:{inventoryId:string;mode:ManualStockValue['mode'];status:ManualStockValue['status'];quantity:number|null;unit:string;note?:string;expectedUpdatedAt?:number|null}){return protectedStock('manual_stock_save',{input});}
export async function fetchManualStockHistory(inventoryId:string):Promise<ManualStockHistory[]>{return protectedStock('manual_stock_history',{inventoryId});}
export async function createManualStockMaterial(name:string,unit:string){return protectedStock('manual_stock_create',{name,unit});}
