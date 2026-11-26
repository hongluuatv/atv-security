"use strict";
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {getFirestore}=require("firebase-admin/firestore");
const {profile,users,policyRef,validEmail,audit,DEFAULT_ADMIN}=require("./access");
const {periods,bankRef,idOk,validatePeriod,publicPeriod,freezeBank}=require("./periods");
const options={region:"asia-southeast1",maxInstances:5,timeoutSeconds:30};
const db=()=>getFirestore();
const secure=(handler)=>onCall(options,handler);
exports.getPortalProfile=secure(async req=>db().runTransaction(tx=>profile(req,tx,{register:true})));
exports.adminListUsers=secure(async req=>{
  await profile(req,null,{admin:true});
  const cursor=req.data?.cursor;
  if(cursor!=null&&!validEmail(cursor))throw new HttpsError("invalid-argument","Cursor không hợp lệ.");
  let q=users().orderBy("email").limit(51);if(cursor)q=q.startAfter(cursor);
  const [snap,p]=await Promise.all([q.get(),policyRef().get()]);
  const docs=snap.docs.slice(0,50);
  return {mode:p.data()?.mode==="whitelist"?"whitelist":"domain",users:docs.map(d=>{const v=d.data();return {email:v.email,name:v.name||"",role:v.role,enabled:v.enabled===true,registered:!!v.uid};}),nextCursor:snap.size>50?docs[49].data().email:null};
});
exports.adminSaveUser=secure(async req=>{
  const email=String(req.data?.email||"").trim().toLowerCase(),role=req.data?.role,enabled=req.data?.enabled;
  if(!validEmail(email)||!["admin","employee"].includes(role)||typeof enabled!=="boolean")throw new HttpsError("invalid-argument","Email, vai trò hoặc trạng thái không hợp lệ.");
  return db().runTransaction(async tx=>{
    const actor=await profile(req,tx,{admin:true});
    if(email===DEFAULT_ADMIN)throw new HttpsError("failed-precondition","Không thể khóa hoặc thay vai trò admin mặc định.");
    if(email===actor.email)throw new HttpsError("failed-precondition","Không thể tự đổi vai trò hoặc khóa chính mình.");
    const ref=users().doc(email),before=(await tx.get(ref)).data();
    tx.set(ref,{...before,email,role,enabled,createdAtMs:before?.createdAtMs||Date.now(),updatedAtMs:Date.now()});
    audit(tx,actor,"user.save",email,{beforeRole:before?.role||null,beforeEnabled:before?.enabled??null,role,enabled});
    return {ok:true};
  });
});
exports.adminSetAccessMode=secure(async req=>{
  const mode=req.data?.mode;if(!["domain","whitelist"].includes(mode))throw new HttpsError("invalid-argument","Chế độ không hợp lệ.");
  return db().runTransaction(async tx=>{const actor=await profile(req,tx,{admin:true});tx.set(policyRef(),{mode,updatedAtMs:Date.now(),updatedBy:actor.email},{merge:true});audit(tx,actor,"access.mode","access",{mode});return {ok:true};});
});
exports.adminListPeriods=secure(async req=>{
  await profile(req,null,{admin:true});
  const cursor=req.data?.cursor;
  let q=periods().orderBy("createdAtMs","desc").limit(51);
  if(cursor!=null){if(!idOk(cursor))throw new HttpsError("invalid-argument","Cursor không hợp lệ.");const d=await periods().doc(cursor).get();if(!d.exists)throw new HttpsError("invalid-argument","Kỳ không tồn tại.");q=q.startAfter(d);}
  const [snap,g,t]=await Promise.all([q.get(),db().collection("assessmentBanks").doc("general").get(),db().collection("assessmentBanks").doc("technical").get()]);
  const docs=snap.docs.slice(0,50);
  const info=d=>({version:d.data()?.version||null,count:Array.isArray(d.data()?.questions)?d.data().questions.length:0});
  return {periods:docs.map(d=>publicPeriod(d.id,d.data())),nextCursor:snap.size>50?docs[49].id:null,banks:{general:info(g),technical:info(t)}};
});
exports.adminSavePeriod=secure(async req=>{
  const id=req.data?.id;if(id!=null&&!idOk(id))throw new HttpsError("invalid-argument","Mã kỳ không hợp lệ.");
  const p=validatePeriod(req.data?.period);
  return db().runTransaction(async tx=>{
    const actor=await profile(req,tx,{admin:true}),ref=id?periods().doc(id):periods().doc(),old=(await tx.get(ref)).data();
    if(id&&!old)throw new HttpsError("not-found","Kỳ không tồn tại.");
    if(old&&old.status!=="draft")throw new HttpsError("failed-precondition","Chỉ sửa kỳ nháp. Tạo kỳ mới nếu cần thay đổi cấu hình đã công bố.");
    tx.set(ref,{...p,status:"draft",createdAtMs:old?.createdAtMs||Date.now(),updatedAtMs:Date.now(),createdBy:old?.createdBy||actor.email});
    audit(tx,actor,"period.save",ref.id,{title:p.title,course:p.course});return {id:ref.id};
  });
});
exports.adminPublishPeriod=secure(async req=>{
  const id=req.data?.id;if(!idOk(id))throw new HttpsError("invalid-argument","Mã kỳ không hợp lệ.");
  return db().runTransaction(async tx=>{
    const actor=await profile(req,tx,{admin:true}),ref=periods().doc(id),p=(await tx.get(ref)).data();
    if(!p||p.status!=="draft"||p.closeAtMs<=Date.now())throw new HttpsError("failed-precondition","Chỉ công bố kỳ nháp chưa hết hạn.");
    const raw=(await tx.get(db().collection("assessmentBanks").doc(p.course))).data();
    let bank;try{bank=freezeBank(raw,p)}catch{throw new HttpsError("failed-precondition","Ngân hàng đề chưa có hoặc không đủ câu hợp lệ.");}
    if(bank.version.startsWith("DEMO")&&req.data?.confirmDemo!==true)throw new HttpsError("failed-precondition","Đây là ngân hàng DEMO. Cần xác nhận chỉ dùng thử.");
    tx.create(bankRef(id),bank);
    tx.update(ref,{status:"published",bankVersion:bank.version,publishedAtMs:Date.now(),publishedBy:actor.email});
    audit(tx,actor,"period.publish",id,{bankVersion:bank.version});return {ok:true};
  });
});
exports.adminClosePeriod=secure(async req=>{
  const id=req.data?.id;if(!idOk(id))throw new HttpsError("invalid-argument","Mã kỳ không hợp lệ.");
  return db().runTransaction(async tx=>{
    const actor=await profile(req,tx,{admin:true}),ref=periods().doc(id),p=(await tx.get(ref)).data();
    if(!p||!["draft","published"].includes(p.status))throw new HttpsError("failed-precondition","Kỳ không thể đóng.");
    tx.update(ref,{status:"closed",closedAtMs:Date.now(),closedBy:actor.email});audit(tx,actor,"period.close",id);return {ok:true};
  });
});
exports.adminPeriodResults=secure(async req=>{
  await profile(req,null,{admin:true});const id=req.data?.id,cursor=req.data?.cursor;
  if(!idOk(id)||cursor!=null&&(typeof cursor!=="string"||cursor.length>128||cursor.includes("/")))throw new HttpsError("invalid-argument","Mã kỳ hoặc trang không hợp lệ.");
  const ref=periods().doc(id);if(!(await ref.get()).exists)throw new HttpsError("not-found","Kỳ không tồn tại.");
  let q=ref.collection("results").orderBy("email").limit(51);
  if(cursor){const d=await ref.collection("results").doc(cursor).get();if(!d.exists)throw new HttpsError("invalid-argument","Trang không tồn tại.");q=q.startAfter(d);}
  const snap=await q.get(),docs=snap.docs.slice(0,50);
  return {results:docs.map(d=>d.data()),nextCursor:snap.size>50?docs[49].id:null};
});
