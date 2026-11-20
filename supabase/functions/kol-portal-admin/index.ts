import { campaignFieldsForUpdate, generateCampaignDraft, parseCampaignFields } from "../_shared/kol-campaign.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { buildKolEmail, sampleKolPayload, type KolMailKind } from "../_shared/kol-mail.ts";
import { emailSetting } from "../_shared/email-settings.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const allowedReview=new Set(["approved","rejected","pending"]);
const allowedSubmission=new Set(["approved","needs_revision","rejected","submitted"]);
const allowedVisit=new Set(["requested","confirmed","cancelled","completed","no_show"]);
const allowedInquiry=new Set(["new","reviewing","contacted","declined","closed"]);
const isAdmin=async(req:Request)=>{const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"").trim();if(!token)return false;const {data:session,error:sessionError}=await admin.from("yumi_sessions").select("user_source_id,expires_at").eq("token",token).gt("expires_at",new Date().toISOString()).maybeSingle();if(sessionError||!session)return false;const {data:user,error:userError}=await admin.from("yumi_users").select("source_id,is_active,role_source_id").eq("source_id",session.user_source_id).maybeSingle();if(userError||!user?.is_active)return false;const {data:role,error:roleError}=await admin.from("yumi_roles").select("name").eq("source_id",user.role_source_id).maybeSingle();if(roleError||!role?.name)return false;return ["admin","administrator","owner","superadmin","super admin"].includes(role.name.trim().toLowerCase())};
const text=(v:unknown,max=2000)=>String(v??"").trim().slice(0,max);
const url=(v:unknown)=>{const value=text(v,2048);if(!value)return null;try{const parsed=new URL(value);return ["http:","https:"].includes(parsed.protocol)?value:null}catch{return null}};
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Method tidak diizinkan"},405);try{if(!await isAdmin(req))return json({error:"Unauthorized"},401);const body=await req.json();const action=body.action;
if(action==="overview"){const [campaigns,assignments,submissions,badges,visits,inquiries,reports,sowVersions,settings,emails]=await Promise.all([
 admin.schema("pos").from("kol_campaigns").select("*").order("created_at",{ascending:false}),
 admin.schema("pos").from("kol_campaign_assignments").select("id,campaign_id,kol_id,status,admin_note,accepted_at,completed_at,created_at,kol_creators(name,username)").order("created_at",{ascending:false}).limit(1000),
 admin.schema("pos").from("kol_content_submissions").select("*,kol_campaign_assignments!inner(id,kol_id,campaign_id,kol_creators(name,username),kol_campaigns(title))").order("created_at",{ascending:false}).limit(300),
 admin.schema("pos").from("kol_creator_badges").select("*,kol_badges(code,name),kol_creators(name,username)").order("awarded_at",{ascending:false}).limit(500),
 admin.schema("pos").from("kol_visit_bookings").select("*,kol_creators(name,username,avatar_url,kol_private_contacts(whatsapp,email))").order("booking_date",{ascending:true}).limit(500),
 admin.schema("pos").from("kol_collaboration_inquiries").select("*,kol_creators!inner(name,username)").order("created_at",{ascending:false}).limit(300),
 admin.schema("pos").from("kol_public_post_reports").select("id,post_id,reporter_kol_id,reason,note,status,created_at,kol_public_posts(id,kol_id,post_type,title,body,media_url,visibility,moderation_status,kol_creators(name,username))").in("status",["open","reviewing"]).order("created_at",{ascending:false}).limit(200),
 admin.schema("pos").from("kol_sow_versions").select("id,version,title,sections,closing,note,is_active,created_by,created_at").order("version",{ascending:false}).limit(50),
 admin.schema("pos").from("kol_visit_settings").select("cafe_name,address,maps_url,wa_admin,wa_manager,post_deadline_days,updated_at").eq("id",1).maybeSingle(),
 admin.schema("pos").from("kol_email_outbox").select("id,kind,booking_id,kol_id,to_email,status,attempts,last_error,scheduled_at,sent_at,created_at").order("id",{ascending:false}).limit(600),
 ]);for(const r of [campaigns,assignments,submissions,badges,visits,inquiries,reports,sowVersions,settings,emails])if(r.error)throw r.error;return json({data:{campaigns:campaigns.data??[],assignments:assignments.data??[],submissions:submissions.data??[],badges:badges.data??[],visits:visits.data??[],inquiries:inquiries.data??[],reports:reports.data??[],sowVersions:sowVersions.data??[],settings:settings.data??null,emails:emails.data??[]}})}
if (action === "campaign_draft_ai") {
  try {
    const projectKey = Deno.env.get("KOL_CAMPAIGN_AI_KEY");
    const openai = Deno.env.get("OPENAI_API_KEY");
    const data = await generateCampaignDraft(body, {
      key: projectKey || openai || Deno.env.get("HELIPOD_AI_KEY"),
      baseUrl: projectKey
        ? Deno.env.get("KOL_CAMPAIGN_AI_BASE_URL") || "https://ai.helipod.io/v1"
        : openai ? Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1"
        : Deno.env.get("HELIPOD_AI_BASE_URL") || "https://ai.helipod.io/v1",
      model: Deno.env.get("KOL_CAMPAIGN_AI_MODEL") || (openai && !projectKey ? Deno.env.get("OPENAI_MODEL_CHAT") || "gpt-4o-mini" : "qwen3.7-flash"),
    });
    return json({ data });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Draf AI belum tersedia." }, 422); }
}
if (action === "campaign_applications") {
  const id = Number(body.campaignId);
  if (!Number.isSafeInteger(id) || id < 1) return json({ error: "Kampanye tidak valid." }, 400);
  const { data, error } = await admin.schema("pos").from("kol_campaign_applications")
    .select("id,status,applied_at,review_note,booking_id,kol_creators(name,username),kol_visit_bookings(booking_date,booking_time)")
    .eq("campaign_id", id).order("applied_at", { ascending: false });
  if (error) throw error;
  return json({ data: (data ?? []).map(({ kol_creators, kol_visit_bookings, ...row }) => {
    const creator = Array.isArray(kol_creators) ? kol_creators[0] : kol_creators;
    const booking = Array.isArray(kol_visit_bookings) ? kol_visit_bookings[0] : kol_visit_bookings;
    return { ...row, name: creator?.name, username: creator?.username, booking_date: booking?.booking_date, booking_time: booking?.booking_time };
  }) });
}
if (action === "campaign_application_review") {
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof body.approve !== "boolean") return json({ error: "Keputusan tidak valid." }, 400);
  const { data, error } = await admin.schema("pos").rpc("kol_review_campaign_application",
    { p_id: id, p_approve: body.approve, p_actor: "admin", p_note: text(body.note, 1000) });
  if (error?.code === "P0001") return json({ error: "Pengajuan sudah diproses. Muat ulang daftar." }, 409);
  if (error) throw error;
  return json({ data });
}
if (action === "submission_review") {
  const id = Number(body.id), status = text(body.status, 30);
  if (!Number.isSafeInteger(id) || !allowedSubmission.has(status)) return json({ error: "Review submission tidak valid." }, 400);
  const { data, error } = await admin.schema("pos").rpc("kol_review_campaign_proof",
    { p_id: id, p_status: status, p_actor: "admin", p_note: text(body.note, 1000) });
  if (error?.code === "23505" && error.message.includes("idx_kol_submissions_one_current_platform")) {
    return json({ error: "Bukti pengganti untuk platform ini sudah masuk. Tinjau bukti terbaru." }, 409);
  }
  if (error) throw error;
  if (!data?.id) return json({ error: "Submission tidak ditemukan." }, 404);
  return json({ data });
}
if (action === "campaign_save") {
  const id = Number(body.id);
  const editing = Number.isSafeInteger(id) && id > 0;
  let fields;
  if (editing) {
    const current = await admin.schema("pos").from("kol_campaigns")
      .select("application_mode,cover_url,terms,sow,proof_platforms").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return json({ error: "Kampanye tidak ditemukan." }, 404);
    try { fields = campaignFieldsForUpdate(body, current.data); }
    catch (e) { return json({ error: (e as Error).message }, 400); }
    if (current.data.application_mode === "invite" && fields.application_mode && fields.application_mode !== "invite") {
      const pending = await admin.schema("pos").from("kol_campaign_assignments").select("id")
        .eq("campaign_id", id).eq("status", "invited").limit(1);
      if (pending.error) throw pending.error;
      if (pending.data?.length) return json({ error: "Masih ada undangan yang menunggu jawaban. Selesaikan sebelum mengubah cara bergabung." }, 409);
    }
  } else {
    try { fields = parseCampaignFields(body); }
    catch (e) { return json({ error: (e as Error).message }, 400); }
  }
  const payload = {...fields,slug:text(body.slug,120).toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,""),title:text(body.title,160),description:text(body.description,4000),location:text(body.location,160)||null,benefit_description:text(body.benefitDescription,1000),deliverable_summary:text(body.deliverableSummary,2000),application_deadline:body.applicationDeadline||null,start_date:body.startDate||null,end_date:body.endDate||null,status:["draft","published","closed","archived"].includes(body.status)?body.status:"draft",updated_at:new Date().toISOString()};
  if (!payload.slug || !payload.title) return json({ error: "Campaign wajib memiliki slug dan judul." }, 400);
  const query = editing ? admin.schema("pos").from("kol_campaigns").update(payload).eq("id",id)
    : admin.schema("pos").from("kol_campaigns").insert({ ...payload, created_by:"admin" });
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return json({ data });
}
if(action==="campaign_assign"){const campaignId=Number(body.campaignId),kolId=text(body.kolId,120);if(!campaignId||!kolId)return json({error:"Campaign atau creator tidak valid."},400);const campaign=await admin.schema("pos").from("kol_campaigns").select("application_mode").eq("id",campaignId).maybeSingle();if(campaign.error)throw campaign.error;if(campaign.data?.application_mode!=="invite")return json({error:"Undangan hanya tersedia untuk kampanye mode undangan."},409);const {data,error}=await admin.schema("pos").from("kol_campaign_assignments").upsert({campaign_id:campaignId,kol_id:kolId,status:"invited",assigned_by:"admin",admin_note:text(body.note,1000)||null,updated_at:new Date().toISOString()},{onConflict:"campaign_id,kol_id"}).select("*").single();if(error)throw error;return json({data})}
if(action==="badge_award"){const kolId=text(body.kolId,120),code=text(body.code,80);const badge=await admin.schema("pos").from("kol_badges").select("id").eq("code",code).eq("is_active",true).maybeSingle();if(badge.error)throw badge.error;if(!badge.data)return json({error:"Badge tidak ditemukan."},404);const {data,error}=await admin.schema("pos").from("kol_creator_badges").upsert({kol_id:kolId,badge_id:badge.data.id,awarded_by:"admin",source_event:"manual_admin",is_visible:true},{onConflict:"kol_id,badge_id"}).select("*").single();if(error)throw error;return json({data})}
if(action==="inquiry_update"){const id=Number(body.id),status=text(body.status,30);if(!Number.isInteger(id)||id<1||!allowedInquiry.has(status))return json({error:"Status inquiry tidak valid."},400);const {data,error}=await admin.schema("pos").from("kol_collaboration_inquiries").update({status,admin_note:text(body.adminNote,2000)||null,updated_at:new Date().toISOString()}).eq("id",id).select("id,status,admin_note,updated_at").maybeSingle();if(error)throw error;if(!data)return json({error:"Inquiry tidak ditemukan."},404);return json({data})}
if(action==="visit_update"){const id=Number(body.id),status=text(body.status,30);if(!id||!allowedVisit.has(status))return json({error:"Status booking tidak valid."},400);
const cur=await admin.schema("pos").from("kol_visit_bookings").select("id,kol_id,status").eq("id",id).maybeSingle();if(cur.error)throw cur.error;if(!cur.data)return json({error:"Booking tidak ditemukan."},404);
const nextAllowed=(({requested:["confirmed","cancelled"],confirmed:["cancelled","completed","no_show"]}) as Record<string,string[]>)[cur.data.status]??[];if(!nextAllowed.includes(status))return json({error:`Booking berstatus ${cur.data.status} tidak bisa diubah ke ${status}.`},409);
const note=text(body.note,1000)||null;const now=new Date().toISOString();const patch:any={status,admin_note:note,updated_at:now};if(status==="confirmed")patch.confirmed_at=now;if(status==="cancelled")patch.cancelled_at=now;
const {data,error}=await admin.schema("pos").from("kol_visit_bookings").update(patch).eq("id",id).eq("status",cur.data.status).select("*").maybeSingle();if(error)throw error;if(!data)return json({error:"Booking baru saja diubah pihak lain. Muat ulang."},409);
await admin.schema("pos").from("kol_visit_booking_events").insert({booking_id:id,kol_id:cur.data.kol_id,event_type:"booking_status_changed",actor_type:"admin",actor_id:"admin",payload:{from:cur.data.status,to:status,note}});
if(body.skipEmail===true&&status==="confirmed")await admin.schema("pos").from("kol_email_outbox").update({status:"skipped",last_error:"DIBATALKAN_ADMIN",updated_at:new Date().toISOString()}).eq("booking_id",id).eq("kind","visit_confirmed").eq("status","pending");
return json({data})} if(action==="creator_list"){const {data,error}=await admin.schema("pos").from("kol_creators").select("source_id,name,username,avatar_url,location,category,status,public_reason,application_data,visit_booking_eligible,auth_user_id,created_at,kol_platforms(platform,username,followers,profile_url),kol_private_contacts(whatsapp,email,manager_name,manager_contact),kol_profiles(slug,display_name,bio,is_public,public_availability)").order("created_at",{ascending:false}).limit(2000);if(error)throw error;const one=(v:any)=>Array.isArray(v)?(v[0]??null):(v??null);return json({data:(data??[]).map((c:any)=>{const {auth_user_id,kol_private_contacts,kol_profiles,...rest}=c;return {...rest,linked:Boolean(auth_user_id),contact:one(kol_private_contacts),profile:one(kol_profiles)}})})} if(action==="creator_eligibility"){const kolId=text(body.kolId,120);if(!kolId||typeof body.eligible!=="boolean")return json({error:"Data kelayakan tidak valid."},400);
const cur=await admin.schema("pos").from("kol_creators").select("source_id,status,visit_booking_eligible").eq("source_id",kolId).maybeSingle();if(cur.error)throw cur.error;if(!cur.data)return json({error:"Creator tidak ditemukan."},404);if(body.eligible&&cur.data.status==="Rejected")return json({error:"Creator berstatus Rejected tidak bisa diizinkan booking."},409);
const {data,error}=await admin.schema("pos").from("kol_creators").update({visit_booking_eligible:body.eligible,visit_booking_eligible_by:"admin",visit_booking_eligible_at:new Date().toISOString(),visit_booking_eligibility_note:text(body.note,1000)||null,updated_at:new Date().toISOString()}).eq("source_id",kolId).select("source_id,visit_booking_eligible").single();if(error)throw error;
await admin.schema("pos").from("kol_visit_booking_events").insert({kol_id:kolId,event_type:"booking_eligibility_changed",actor_type:"admin",actor_id:"admin",payload:{from:cur.data.visit_booking_eligible,to:body.eligible}});return json({data})} if(action==="report_resolve"){const id=Number(body.id),decision=text(body.decision,20);if(!Number.isInteger(id)||id<1||!["hide","dismiss"].includes(decision))return json({error:"Keputusan moderasi tidak valid."},400);
const rep=await admin.schema("pos").from("kol_public_post_reports").select("id,post_id,status").eq("id",id).maybeSingle();if(rep.error)throw rep.error;if(!rep.data)return json({error:"Laporan tidak ditemukan."},404);const now=new Date().toISOString();
if(decision==="hide"){const post=await admin.schema("pos").from("kol_public_posts").update({visibility:"hidden",moderation_status:"hidden",moderation_note:text(body.note,1000)||null,updated_at:now}).eq("id",rep.data.post_id);if(post.error)throw post.error;const all=await admin.schema("pos").from("kol_public_post_reports").update({status:"resolved",reviewed_by:"admin",reviewed_at:now}).eq("post_id",rep.data.post_id).in("status",["open","reviewing"]);if(all.error)throw all.error}
else{const one=await admin.schema("pos").from("kol_public_post_reports").update({status:"dismissed",reviewed_by:"admin",reviewed_at:now}).eq("id",id);if(one.error)throw one.error}
return json({data:{id,decision}})} if(action==="visit_calendar"){const {data,error}=await admin.schema("pos").from("kol_visit_bookings").select("id,kol_id,booking_date,status,visit_note,kol_creators(name,username)").order("booking_date",{ascending:true}).limit(500);if(error)throw error;return json({data:data??[]})}
if(action==="invite_list"){const {data,error}=await admin.schema("pos").from("kol_visit_invitations").select("id,kol_id,status,expires_at,created_at,updated_at,linked_auth_user_id,kol_creators(name,username)").order("created_at",{ascending:false}).limit(500);if(error)throw error;return json({data:data??[]})}
if(action==="invite_create"||action==="invite_resend"){let kolId=text(body.kolId||body.invitationId,120);if(!kolId)return json({error:"Creator tidak valid."},400);if(action==="invite_resend"){const old=await admin.schema("pos").from("kol_visit_invitations").select("id,kol_id").eq("id",kolId).maybeSingle();if(old.error)throw old.error;if(!old.data)return json({error:"Undangan tidak ditemukan."},404);await admin.schema("pos").from("kol_visit_invitations").update({status:"revoked",revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",old.data.id);kolId=old.data.kol_id}
const creator=await admin.schema("pos").from("kol_creators").select("source_id,name").eq("source_id",kolId).neq("status","Rejected").maybeSingle();if(creator.error)throw creator.error;if(!creator.data)return json({error:"Creator tidak ditemukan atau tidak eligible."},404);const token=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));const tokenHash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");const expiresAt=typeof body.expiresAt==="string"&&body.expiresAt?new Date(body.expiresAt):new Date(Date.now()+7*24*60*60*1000);if(Number.isNaN(expiresAt.getTime())||expiresAt<=new Date())return json({error:"Expiry undangan tidak valid."},400);const {data,error}=await admin.schema("pos").from("kol_visit_invitations").insert({kol_id:kolId,token_hash:tokenHash,status:"created",expires_at:expiresAt.toISOString(),created_by:"admin",metadata:{}}).select("id,status,expires_at").single();if(error){if(error.code==="23505")return json({error:"Creator sudah memiliki undangan aktif."},409);throw error}return json({data:{invitationId:data.id,inviteUrl:`https://kol.djiwatentram.web.id/invite/${token}`,expiresAt:data.expires_at,status:data.status}})}
if(action==="invite_bulk_create"){const ids=Array.isArray(body.kolIds)?Array.from(new Set(body.kolIds.map((id:unknown)=>text(id,120)).filter(Boolean))).slice(0,200):[];if(!ids.length)return json({error:"Pilih minimal satu creator."},400);const expiresAt=typeof body.expiresAt==="string"&&body.expiresAt?new Date(body.expiresAt):new Date(Date.now()+7*24*60*60*1000);if(Number.isNaN(expiresAt.getTime())||expiresAt<=new Date())return json({error:"Expiry undangan tidak valid."},400);const creators=await admin.schema("pos").from("kol_creators").select("source_id,name,username,status").in("source_id",ids).neq("status","Rejected");if(creators.error)throw creators.error;const active=await admin.schema("pos").from("kol_visit_invitations").select("kol_id").in("kol_id",ids).in("status",["created","opened","authenticated","linked","schedule_selected"]);if(active.error)throw active.error;const activeIds=new Set((active.data??[]).map((row:any)=>row.kol_id));const creatorById=new Map((creators.data??[]).map((row:any)=>[row.source_id,row]));const skipped=ids.filter(id=>!creatorById.has(id)).map(id=>({kolId:id,reason:"NOT_ELIGIBLE"}));ids.filter(id=>activeIds.has(id)).forEach(id=>skipped.push({kolId:id,reason:"ACTIVE_INVITE_EXISTS"}));const eligible=ids.filter(id=>creatorById.has(id)&&!activeIds.has(id));const generated=eligible.map(kolId=>{const token=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");return {kolId,token}});const rows=[];for(const item of generated){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(item.token));const tokenHash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");rows.push({kol_id:item.kolId,token_hash:tokenHash,status:"created",expires_at:expiresAt.toISOString(),created_by:"admin",metadata:{bulk:true}})}if(rows.length){const inserted=await admin.schema("pos").from("kol_visit_invitations").insert(rows).select("id,kol_id,status,expires_at");if(inserted.error){if(inserted.error.code==="23505")return json({error:"Sebagian creator sudah memiliki undangan aktif. Muat ulang data lalu coba lagi."},409);throw inserted.error}const byKol=new Map((inserted.data??[]).map((row:any)=>[row.kol_id,row]));return json({data:{created:generated.map(item=>{const row=byKol.get(item.kolId);const creator=creatorById.get(item.kolId);return {invitationId:row?.id,kolId:item.kolId,name:creator?.name??item.kolId,username:creator?.username??null,inviteUrl:`https://kol.djiwatentram.web.id/invite/${item.token}`,expiresAt:row?.expires_at,status:row?.status}}),skipped,summary:{requested:ids.length,created:generated.length,skipped:skipped.length}}})}return json({data:{created:[],skipped,summary:{requested:ids.length,created:0,skipped:skipped.length}}})}
if(action==="invite_revoke"){const invitationId=text(body.invitationId,120);if(!invitationId)return json({error:"Undangan tidak valid."},400);const {data,error}=await admin.schema("pos").from("kol_visit_invitations").update({status:"revoked",revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",invitationId).in("status",["created","opened","authenticated","linked","schedule_selected"]).select("id,status").maybeSingle();if(error)throw error;if(!data)return json({error:"Undangan tidak ditemukan atau sudah tidak aktif."},404);return json({data})}

if(action==="sow_publish"){const title=text(body.title,160),closing=text(body.closing,1000);if(!Array.isArray(body.sections))return json({error:"Bagian SOW tidak valid."},400);const {data,error}=await admin.schema("pos").rpc("kol_sow_publish",{p_title:title,p_sections:body.sections,p_closing:closing,p_note:text(body.note,500)||null,p_actor:"admin",p_apply:body.apply!==false});if(error)throw error;return json({data:Array.isArray(data)?data[0]:data})}
if(action==="booking_sow_set"){const id=Number(body.id);if(!Number.isInteger(id)||id<1||!Array.isArray(body.sections))return json({error:"Data SOW booking tidak valid."},400);const {error}=await admin.schema("pos").rpc("kol_booking_sow_set",{p_booking_id:id,p_title:text(body.title,160)||"Scope of Work",p_sections:body.sections,p_closing:text(body.closing,1000),p_notify:body.notify!==false});if(error)throw error;return json({data:{id}})}
if(action==="booking_sow_sync"){const id=Number(body.id);if(!Number.isInteger(id)||id<1)return json({error:"Booking tidak valid."},400);const {error}=await admin.schema("pos").rpc("kol_booking_sow_sync",{p_booking_id:id,p_notify:body.notify!==false});if(error)throw error;return json({data:{id}})}
if(action==="settings_save"){const digits=(v:unknown)=>String(v??"").replace(/[^\d+]/g,"").slice(0,20);const maps=text(body.mapsUrl,500);if(maps&&!/^https:\/\//i.test(maps))return json({error:"Link Google Maps harus diawali https://"},400);const days=Number(body.postDeadlineDays);if(!Number.isInteger(days)||days<1||days>60)return json({error:"Batas tayang harus 1 sampai 60 hari."},400);const {data,error}=await admin.schema("pos").from("kol_visit_settings").update({cafe_name:text(body.cafeName,160)||"Djiwa Tentram Cafe & Resto - Tasikmalaya",address:text(body.address,300),maps_url:maps,wa_admin:digits(body.waAdmin),wa_manager:digits(body.waManager),post_deadline_days:days,updated_by:"admin",updated_at:new Date().toISOString()}).eq("id",1).select("*").single();if(error)throw error;return json({data})}
if(action==="email_resend"){const bookingId=Number(body.bookingId),kind=text(body.kind,30)||"visit_confirmed";if(!Number.isInteger(bookingId)||bookingId<1)return json({error:"Booking tidak valid."},400);const {data,error}=await admin.schema("pos").rpc("kol_email_resend",{p_booking_id:bookingId,p_kind:kind});if(error)throw error;return json({data:{id:data}})}
if(action==="email_skip"){const id=Number(body.id);if(!Number.isInteger(id)||id<1)return json({error:"Email tidak valid."},400);const {data,error}=await admin.schema("pos").rpc("kol_email_skip",{p_outbox_id:id});if(error)throw error;return json({data:{skipped:Boolean(data)}})}
if(action==="email_test"){const to=text(body.to,254).toLowerCase(),kind=text(body.kind,30) as KolMailKind;if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))return json({error:"Alamat email uji tidak valid."},400);if(!["visit_confirmed","visit_cancelled","visit_reminder","sow_updated"].includes(kind))return json({error:"Jenis email tidak valid."},400);
const [sow,st]=await Promise.all([admin.schema("pos").from("kol_sow_versions").select("title,sections,closing").eq("is_active",true).maybeSingle(),admin.schema("pos").from("kol_visit_settings").select("*").eq("id",1).maybeSingle()]);
const payload=sampleKolPayload({cafeName:st.data?.cafe_name??undefined,address:st.data?.address??"",mapsUrl:st.data?.maps_url??"",waAdmin:st.data?.wa_admin??"",waManager:st.data?.wa_manager??"",...(sow.data?{sow:{title:sow.data.title,sections:sow.data.sections,closing:sow.data.closing,days:st.data?.post_deadline_days??7}}:{})});
const mail=buildKolEmail(kind,payload);const key=await emailSetting(admin as never,"HELIPOD_EMAIL_API_KEY");if(!key)return json({error:"Kunci email belum diatur."},500);const from=(await emailSetting(admin as never,"EMAIL_FROM"))||"Djiwa Tentram <hello@mail.djiwatentram.web.id>";
const res=await fetch("https://mail.helipod.io/api/email/send",{method:"POST",headers:{Authorization:["Bear","er ",key].join(""),"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject:"[UJI] "+mail.subject,html:mail.html,text:mail.text})});const out=await res.json().catch(()=>null);if(!out?.success)return json({error:"Email uji ditolak: "+(typeof out?.error==="string"?out.error:out?.error?.message??res.status)},502);return json({data:{sent:true}})}
return json({error:"Action tidak dikenal"},400)}catch(error:any){console.error("kol-portal-admin",error);const known:Record<string,string>={SOW_SECTIONS_INVALID:"SOW harus punya 1 sampai 12 bagian.",SOW_SECTION_INVALID:"Tiap bagian SOW butuh judul dan 1 sampai 40 poin.",SOW_ITEM_INVALID:"Tiap poin SOW harus berisi teks (maksimal 500 karakter).",SOW_TITLE_INVALID:"Judul SOW harus 2 sampai 160 karakter.",SOW_NOT_FOUND:"Belum ada SOW aktif.",BOOKING_NOT_FOUND:"Booking tidak ditemukan.",EMAIL_KIND_INVALID:"Jenis email tidak valid."};const msg=known[String(error?.message??"")];if(msg)return json({error:msg},400);return json({error:"Gagal memproses admin Creator Portal."},500)}});
