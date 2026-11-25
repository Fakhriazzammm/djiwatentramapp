import { createAuthClient } from "better-auth/react";
import { useEffect, useState } from "react";
import { BrandEntry } from "./kol-brand";
import { KolPortalView, portalTabFromPath } from "./kol-portal";
import { PublicCampaigns } from "./kol-campaigns";
import { KolPublicProfile } from "./kol-public-profile";
import { RegisterFlow } from "./kol-onboarding";
import { AUTH_BASE, KOL_API, getAccountRoles, kolApi, loginErrorText, logoutKol, type AccountRoles } from "./kol-lib";
import { RolePicker, type AccountRole } from "./kol-role";

const authClient=createAuthClient({baseURL:AUTH_BASE,fetchOptions:{credentials:"include"}});
type BetterSession={user:{id:string;name?:string|null;email?:string|null;image?:string|null}};
async function getKolSession():Promise<BetterSession|null>{const response=await fetch(`${AUTH_BASE}/get-session`,{credentials:"include",headers:{Accept:"application/json"}});if(!response.ok)return null;return await response.json() as BetterSession|null}
type KolClaim={userType:string;linked:boolean;ambiguous:boolean;profile:{source_id:string;name:string;username:string;status:string}|null};
async function claimKolRole():Promise<KolClaim>{const response=await fetch(`${KOL_API}/claim`,{method:"POST",credentials:"include",headers:{Accept:"application/json"}});if(!response.ok)throw new Error("Akun Google belum dapat disiapkan sebagai KOL.");return await response.json() as KolClaim}
async function startGoogleSignIn(callbackPath = window.location.pathname + window.location.search + window.location.hash) {
  const origin = window.location.origin;
  const campaignLogin = callbackPath.startsWith("/campaigns/");
  const errorUrl = new URL(campaignLogin || callbackPath === "/brand" || callbackPath.startsWith("/masuk") ? callbackPath : "/", origin);
  errorUrl.searchParams.delete("apply");
  errorUrl.searchParams.set("login", "gagal");
  const { data, error } = await authClient.signIn.social({
    provider: "google", callbackURL: origin + callbackPath, errorCallbackURL: errorUrl.href, disableRedirect: true,
  });
  if (error) throw new Error(error.message || "Gagal membuka Google Auth.");
  if (!data?.url) throw new Error("URL login Google tidak diterima server.");
  const next = new URL(data.url);
  if (/(^|\.)google\.com$/.test(next.hostname)) next.searchParams.set("prompt", "select_account");
  window.location.assign(next.toString());
}
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

function App() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [session, setSession] = useState<BetterSession | null>(null);
  const [roles, setRoles] = useState<AccountRoles | null>(null);
  const [claim, setClaim] = useState<KolClaim | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return query.get("login") === "gagal" ? loginErrorText(query.get("error")) : "";
  });
  const [role, setRole] = useState<AccountRole | null>(null);
  const [pathname = "/", query = ""] = location.split("?");
  const params = new URLSearchParams(query);
  const profile = pathname.match(/^\/([^/]+)\/profile\/?$/) ?? pathname.match(/^\/creator\/([^/]+)\/?$/);
  const invite = pathname.match(/^\/invite\/([^/]+)\/?$/);
  const campaign = pathname.match(/^\/campaigns(?:\/([a-z0-9-]{1,120}))?\/?$/i);
  const campaignSlug = campaign?.[1]?.toLowerCase();
  const choosing = /^\/masuk\/?$/.test(pathname);
  const brand = /^\/brand\/?$/.test(pathname);
  const nextCampaign = params.get("campaign");
  const requestedCampaign = nextCampaign && /^[a-z0-9-]{1,120}$/.test(nextCampaign) ? nextCampaign : null;
  const applying = params.get("apply") === "1" && Boolean(campaignSlug);

  function navigate(to: string, replace = false) {
    if (replace) window.history.replaceState({}, "", to);
    else window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  useEffect(() => {
    const sync = () => setLocation(window.location.pathname + window.location.search);
    const link = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === "/admin" || url.pathname + url.search === window.location.pathname + window.location.search) return;
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", link);
    window.addEventListener("popstate", sync);
    return () => {
      document.removeEventListener("click", link);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (profile) return;
    let current = true;
    setAuthLoading(true);
    getKolSession().then(async (value) => {
      if (!current) return;
      setSession(value);
      if (value) {
        const account = await getAccountRoles();
        if (current) setRoles(account);
      }
    }).catch(() => {
      if (current) setAuthError("Sesi atau peran akun belum dapat dimuat. Coba muat ulang.");
    }).finally(() => {
      if (current) setAuthLoading(false);
    });
    return () => { current = false; };
  }, [Boolean(profile)]);

  const login = async (campaignToResume?: string) => {
    setAuthError("");
    try { await startGoogleSignIn(campaignToResume ? `/masuk?campaign=${encodeURIComponent(campaignToResume)}` : "/masuk"); }
    catch (error) { setAuthError(error instanceof Error ? error.message : "Gagal membuka Google Auth."); }
  };

  const choose = async (selected: AccountRole) => {
    setAuthError("");
    try {
      if (selected === "brand") {
        await kolApi("/roles", { method: "POST", body: JSON.stringify({ role: "brand" }) });
        setRole("brand");
        navigate("/brand", false);
        return;
      }
      const result = await claimKolRole();
      setRole("creator");
      setClaim(result);
      navigate(requestedCampaign ? `/campaigns/${requestedCampaign}?apply=1` : "/", false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Peran akun belum bisa dipilih.");
    }
  };

  if (profile) return <KolPublicProfile slug={decodeURIComponent(profile[1] || "")} />;
  if (invite) return <InviteLanding token={decodeURIComponent(invite[1] || "")} session={session} authLoading={authLoading} />;
  if (brand) return <BrandEntry signed={Boolean(session)} loading={authLoading} loginError={authError} onLogin={() => login()} />;
  if (campaign && (!session || (!roles?.creator && !claim?.linked && !applying))) {
    return <PublicCampaigns key={pathname} slug={campaignSlug} loginError={authError} onApply={async () => {
      if (!session) await login(campaignSlug);
      else if (campaignSlug) navigate(`/masuk?campaign=${encodeURIComponent(campaignSlug)}`);
    }} />;
  }
  if (authLoading) return <RolePicker loading />;
  if (!session) return <RolePicker error={authError} onGoogle={() => login()} />;
  if (choosing || (role !== "creator" && !roles?.creator && !claim?.linked)) {
    return <RolePicker signed error={authError} hasCreator={Boolean(roles?.creator)} hasBrand={Boolean(roles?.brands.length)} onChoose={choose} />;
  }
  if (claim?.ambiguous) return <ReviewScreen session={session} />;
  if (!roles?.creator && !claim?.linked) {
    return <RegisterFlow session={session} campaignSlug={applying ? campaignSlug : undefined} onRegistered={async () => {
      setClaim(await claimKolRole());
      navigate(applying && campaignSlug ? `/campaigns/${campaignSlug}` : "/", true);
    }} />;
  }
  const linked = claim ?? (roles?.creator ? { userType: "kol", linked: true, ambiguous: false, profile: roles.creator } : null);
  const tab = /^\/portal\/profile-settings\/?$/.test(pathname) ? "profile" : portalTabFromPath(pathname);
  const inviteToken = params.get("invite");
  return <KolPortalView session={session} claim={linked} initialTab={tab} campaignSlug={campaignSlug}
    inviteContext={tab === "calendar" && inviteToken ? { active: true, token: inviteToken } : undefined} />;
}

export default App;
