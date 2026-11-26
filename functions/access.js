"use strict";
const {HttpsError}=require("firebase-functions/v2/https");
const {getFirestore}=require("firebase-admin/firestore");
const domain="arrow-tech.vn";
const validEmail=e=>typeof e==="string"&&e.length<=254&&/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@arrow-tech\.vn$/.test(e)&&!e.split("@")[0].includes("/");
function tokenIdentity(req){
  const a=req.auth,t=a?.token,email=String(t?.email||"").trim().toLowerCase();
  if(!a||t?.email_verified!==true||t?.firebase?.sign_in_provider!=="google.com")
    throw new HttpsError("unauthenticated","Đăng nhập Google đã xác thực.");
  if(!validEmail(email))throw new HttpsError("permission-denied","Chỉ dành cho email công ty.");
  return {uid:a.uid,email,name:String(t.name||"").slice(0,120)};
}
const users=()=>getFirestore().collection("portalUsers");
const policyRef=()=>getFirestore().collection("portalSettings").doc("access");
async function profile(req,tx=null,{register=false,admin=false}={}){
  const who=tokenIdentity(req),ref=users().doc(who.email);
  const snap=tx?await tx.get(ref):await ref.get();
  let data=snap.data();
  if(!data||!data.uid){
    if(!register||!tx)throw new HttpsError("permission-denied","Tài khoản chưa được đăng ký hoặc cấp quyền.");
    if(!data){
      const settings=(await tx.get(policyRef())).data()||{};
      if(settings.mode==="whitelist")throw new HttpsError("permission-denied","Email chưa có trong danh sách được phép.");
      data={email:who.email,role:"employee",enabled:true,createdAtMs:Date.now()};
    }
    if(data.enabled!==true)throw new HttpsError("permission-denied","Tài khoản đã bị khóa.");
    data={...data,uid:who.uid,name:who.name,firstLoginAtMs:Date.now()};
    tx.set(ref,data);
  }
  if(data.uid!==who.uid||data.enabled!==true)throw new HttpsError("permission-denied","Tài khoản bị khóa hoặc không đúng định danh.");
  if(!["admin","employee"].includes(data.role))throw new HttpsError("permission-denied","Vai trò không hợp lệ.");
  if(admin&&data.role!=="admin")throw new HttpsError("permission-denied","Chỉ admin được phép.");
  return {uid:who.uid,email:who.email,name:data.name||who.name,role:data.role,enabled:true};
}
function audit(tx,actor,action,target,details={}){
  tx.create(getFirestore().collection("portalAudit").doc(),{actorUid:actor.uid,actorEmail:actor.email,action,target,details,atMs:Date.now()});
}
module.exports={profile,tokenIdentity,users,policyRef,validEmail,audit,domain};
