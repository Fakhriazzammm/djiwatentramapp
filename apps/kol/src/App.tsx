import { createAuthClient } from "better-auth/react";
import { useEffect, useRef, useState } from "react";
import { KolPortalView, portalTabFromPath } from "./kol-portal";
import { KolPublicProfile } from "./kol-public-profile";
import { LoginScreen, RegisterFlow } from "./kol-onboarding";
import { AUTH_BASE, KOL_API, logoutKol } from "./kol-lib";

const authClient=createAuthClient({baseURL:AUTH_BASE,fetchOptions:{credentials:"include"}});
type BetterSession={user:{id:string;name?:string|null;email?:string|null;image?:string|null}};
async function getKolSession():Promise<BetterSession|null>{const response=await fetch(`${AUTH_BASE}/get-session`,{credentials:"include",headers:{Accept:"application/json"}});if(!response.ok)return null;return await response.json() as BetterSession|null}
type KolClaim={userType:string;linked:boolean;ambiguous:boolean;profile:{source_id:string;name:string;username:string;status:string}|null};
async function claimKolRole():Promise<KolClaim>{const response=await fetch(`${KOL_API}/claim`,{method:"POST",credentials:"include",headers:{Accept:"application/json"}});if(!response.ok)throw new Error("Akun Google belum dapat disiapkan sebagai KOL.");return await response.json() as KolClaim}
async function startGoogleSignIn(callbackPath=window.location.pathname+window.location.search+window.location.hash){const {data,error}=await authClient.signIn.social({provider:"google",callbackURL:window.location.origin+callbackPath});if(error)throw new Error(error.message||"Gagal membuka Google Auth.");if(!data?.url)throw new Error("URL login Google tidak diterima server.");window.location.assign(data.url)}
type InviteContext={
  token?:string;
  name?:string|null;
  displayName?:string|null;
  brandName?:string|null;
  location?:string|null;
  category?:string|null;
  expiresAt?:string|null;
  status?:string|null;
};

async function getInviteContext(token:string){
  const response=await fetch(`${KOL_API}/invites/${encodeURIComponent(token)}`,{credentials:"omit",headers:{Accept:"application/json"}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.success===false){
    const error=new Error(body.error||"INVITE_NOT_FOUND");
    (error as Error & {code?:string}).code=body.error;
    throw error;
  }
  return (body.data??body) as InviteContext;
}

async function claimInvite(token:string){
  const response=await fetch(`${KOL_API}/invites/${encodeURIComponent(token)}/claim`,{method:"POST",credentials:"include",headers:{Accept:"application/json","Content-Type":"application/json"}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.success===false){
    const error=new Error(body.error||"INVITE_CLAIM_FAILED");
    (error as Error & {code?:string}).code=body.error;
    throw error;
  }
  return body.data??body;
}

function InviteLanding({token,session,authLoading}:{token:string;session:BetterSession|null;authLoading:boolean}){
  const [context,setContext]=useState<InviteContext|null>(null);
  const [loading,setLoading]=useState(true);
  const [claiming,setClaiming]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState(false);
  useEffect(()=>{let active=true;setLoading(true);setError("");getInviteContext(token).then(value=>{if(active)setContext(value)}).catch((reason:any)=>{if(!active)return;setError(reason?.code||reason?.message||"INVITE_NOT_FOUND")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[token]);
  useEffect(()=>{if(!session||authLoading||!context||claiming||success)return;let active=true;setClaiming(true);claimInvite(token).then(()=>{if(!active)return;setSuccess(true);window.setTimeout(()=>window.location.assign(`/visit?invite=${encodeURIComponent(token)}`),350);window.setTimeout(()=>{window.location.assign(`/visit?invite=${encodeURIComponent(token)}`)},500)}).catch((reason:any)=>{if(active)setError(reason?.code||reason?.message||"INVITE_CLAIM_FAILED")}).finally(()=>{if(active)setClaiming(false)});return()=>{active=false}},[session,authLoading,context,claiming,success,token]);
  const code=error.toUpperCase();
  const expired=["INVITE_EXPIRED","INVITE_REVOKED","INVITE_NOT_FOUND","INVITATION_NOT_VALID"].includes(code);
  const title=success?"Akun berhasil terhubung":expired?"Undangan sudah tidak aktif":error?"Undangan belum dapat dibuka":"Undangan Visit Djiwa Tentram";
  if(loading)return <InviteShell><InviteCard><p className="text-sm font-semibold text-slate-500">Memuat detail undangan...</p></InviteCard></InviteShell>;
  if(error&&!context)return <InviteShell><InviteCard><p className="text-4xl">🙈</p><h1 className="display mt-4 text-2xl font-extrabold">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-500">Link ini mungkin sudah kedaluwarsa, dicabut, atau tidak valid. Hubungi admin Djiwa Tentram jika kamu membutuhkan bantuan.</p><a href="/" className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">Kembali ke Portal Creator</a></InviteCard></InviteShell>;
  return <InviteShell><InviteCard><div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-xl font-black text-white">D</div><p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-blue-600">Undangan Visit Djiwa Tentram</p><h1 className="display mt-2 text-2xl font-extrabold">{title}</h1>{context&&<div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Creator</p><p className="mt-1 text-lg font-extrabold text-slate-900">{context.displayName||context.name||"Creator"}</p>{(context.location||context.category)&&<p className="mt-1 text-sm text-slate-500">{[context.location,context.category].filter(Boolean).join(" · ")}</p>}{context.expiresAt&&<p className="mt-3 text-xs text-slate-500">Link berlaku sampai {new Date(context.expiresAt).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}.</p>}</div>}{success?<><p className="mt-5 text-sm leading-6 text-emerald-700">Sekarang pilih satu tanggal Visit yang tersedia. Membuka kalender Visit...</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-500"/></div></>:error?<p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{code==="PROFILE_ALREADY_LINKED"?"Profil creator sudah terhubung ke akun lain. Hubungi admin untuk review.":code==="INVITE_EMAIL_MISMATCH"?"Akun Google ini belum cocok dengan data undangan. Gunakan email yang menerima undangan atau hubungi admin.":code==="INVITE_NEEDS_REVIEW"?"Data creator perlu diverifikasi admin sebelum akun dapat dihubungkan.":"Undangan ini belum dapat dilanjutkan. Hubungi admin Djiwa Tentram."}</p>:session? <p className="mt-5 text-sm text-slate-500">Memeriksa akun dan menyiapkan kalender Visit...</p>:<button onClick={async()=>{try{setError("");await startGoogleSignIn(`/invite/${encodeURIComponent(token)}`)}catch(reason:any){setError(reason?.message||"Gagal membuka Google Auth.")}}} className="press focus-ring mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white">Lanjutkan dengan Google</button>}</InviteCard></InviteShell>;
}
function InviteShell({children}:{children:React.ReactNode}){return <div className="kol-public-shell flex min-h-screen items-center justify-center bg-[#f7f8fb] px-5 py-10">{children}</div>}
function InviteCard({children}:{children:React.ReactNode}){return <main className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-[0_12px_36px_rgba(9,9,11,.08)] sm:p-8">{children}</main>}


function ReviewScreen({session}:{session:BetterSession}){return <div className="kx kx-wrap"><div className="kx-view" style={{paddingTop:"calc(56px + env(safe-area-inset-top))",textAlign:"center"}}><h1 className="kx-h1">Akunmu sedang ditinjau</h1><p className="kx-lead">Email {session.user.email} cocok dengan lebih dari satu data creator. Admin Djiwa Tentram akan menghubungkan akunmu secara manual.</p><button type="button" className="kx-btn kx-btn--ghost" style={{marginTop:24}} onClick={()=>void logoutKol()}>Keluar</button></div></div>}

function App(){
  const [pathname,setPathname]=useState(()=>window.location.pathname);
  useEffect(()=>{const syncPath=()=>setPathname(window.location.pathname);const handleInternalLink=(event:MouseEvent)=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const target=event.target;if(!(target instanceof Element))return;const anchor=target.closest("a");if(!anchor||anchor.hasAttribute("download")||(anchor.target&&anchor.target!=="_self"))return;const url=new URL(anchor.href,window.location.href);if(url.origin!==window.location.origin||url.pathname==="/admin")return;if(url.pathname===window.location.pathname&&url.search===window.location.search)return;event.preventDefault();window.history.pushState({},"",`${url.pathname}${url.search}${url.hash}`);syncPath();window.dispatchEvent(new PopStateEvent("popstate"))};document.addEventListener("click",handleInternalLink);window.addEventListener("popstate",syncPath);return()=>{document.removeEventListener("click",handleInternalLink);window.removeEventListener("popstate",syncPath)}},[]);const [session,setSession]=useState<BetterSession|null>(null);const [authLoading,setAuthLoading]=useState(true);const [authError,setAuthError]=useState("");const [claim,setClaim]=useState<KolClaim|null>(null);const authCheckedRef=useRef(false);
  useEffect(()=>{const publicRoute=/^\/[^/]+\/profile\/?$/.test(pathname)||/^\/creator\/[^/]+\/?$/.test(pathname);if(publicRoute){setAuthLoading(false);return}if(authCheckedRef.current)return;authCheckedRef.current=true;setAuthLoading(true);const invitePath=pathname.startsWith("/invite/");getKolSession().then(async current=>{if(!current){setAuthLoading(false);return}if(invitePath){setSession(current);setAuthLoading(false);return}try{const result=await claimKolRole();setClaim(result);setSession(current)}catch(error){setAuthError(error instanceof Error?error.message:"Akun belum dapat disiapkan.")}finally{setAuthLoading(false)}}).catch(()=>{setAuthError("Sesi Google belum dapat diverifikasi.");setAuthLoading(false)})},[pathname]);
  const canonicalProfileMatch=pathname.match(/^\/([^/]+)\/profile\/?$/);if(canonicalProfileMatch)return <KolPublicProfile slug={decodeURIComponent(canonicalProfileMatch[1]||"")}/>;
  const publicMatch=pathname.match(/^\/creator\/([^/]+)\/?$/);if(publicMatch){const slug=decodeURIComponent(publicMatch[1]||"");window.history.replaceState(null,"",`/${encodeURIComponent(slug)}/profile`);return <KolPublicProfile slug={slug}/>}
  const inviteMatch=pathname.match(/^\/invite\/([^/]+)\/?$/);if(inviteMatch)return <InviteLanding token={decodeURIComponent(inviteMatch[1]||"")} session={session} authLoading={authLoading}/>;
  if(authLoading)return <LoginScreen loading onGoogle={()=>undefined}/>;
  if(!session)return <LoginScreen error={authError} onGoogle={async()=>{try{setAuthError("");await startGoogleSignIn()}catch(error){setAuthError(error instanceof Error?error.message:"Gagal membuka Google Auth.")}}}/>;
  if(claim?.ambiguous)return <ReviewScreen session={session}/>;
  if(!claim?.linked)return <RegisterFlow session={session} onRegistered={async()=>{const result=await claimKolRole();setClaim(result);window.history.replaceState({},"","/");setPathname("/")}}/>;
  if(/^\/portal\/profile-settings\/?$/.test(pathname)){window.history.replaceState({},"","/profil");return <KolPortalView session={session} claim={claim} initialTab="profile"/>}
  const portalTab=portalTabFromPath(pathname);const inviteToken=new URLSearchParams(window.location.search).get("invite");
  return <KolPortalView session={session} claim={claim} initialTab={portalTab} inviteContext={portalTab==="calendar"&&inviteToken?{active:true,token:inviteToken}:undefined}/>;
}
export default App;
