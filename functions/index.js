"use strict";
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {initializeApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {buildSession,publicSession,grade}=require("./grading");
const {profile}=require("./access");
const {periods,bankRef,idOk,isOpen,publicPeriod}=require("./periods");
initializeApp();
const db=getFirestore();
const options={region:"asia-southeast1",maxInstances:5,timeoutSeconds:30};
const resultRoot=uid=>db.collection("assessmentResults").doc(uid);
const activeRef=(uid,periodId)=>db.collection("assessmentSessions").doc(uid).collection("active").doc(periodId);
const periodResult=(periodId,uid)=>periods().doc(periodId).collection("results").doc(uid);
const periodOf=data=>{if(!idOk(data?.periodId))throw new HttpsError("invalid-argument","Chọn kỳ đánh giá.");return data.periodId;};
Object.assign(exports,require("./admin"));
exports.listAssessmentPeriods=onCall(options,async req=>{
  const actor=await profile(req);
  const snap=await periods().where("status","==","published").where("closeAtMs",">",Date.now()).orderBy("closeAtMs").limit(100).get();
  const resultRefs=snap.docs.map(d=>periodResult(d.id,actor.uid));
  const results=resultRefs.length?await db.getAll(...resultRefs):[];
  return {periods:snap.docs.map((d,i)=>({...publicPeriod(d.id,d.data()),attemptCount:results[i]?.data()?.attemptCount||0,bestPercent:results[i]?.data()?.bestPercent??null})),nowMs:Date.now()};
});
exports.startAssessment=onCall(options,async req=>{
  const periodId=periodOf(req.data);
  return db.runTransaction(async tx=>{
    const actor=await profile(req,tx),active=activeRef(actor.uid,periodId);
    const p=(await tx.get(periods().doc(periodId))).data();
    if(!isOpen(p))throw new HttpsError("failed-precondition","Kỳ chưa mở, đã đóng hoặc hết hạn.");
    const previous=(await tx.get(active)).data();
    if(previous&&previous.expiresAtMs>Date.now())return {...publicSession(previous),periodId,periodTitle:p.title};
    const prior=(await tx.get(periodResult(periodId,actor.uid))).data()||{};
    if(p.maxAttempts>0&&(prior.attemptCount||0)>=p.maxAttempts)throw new HttpsError("failed-precondition","Đã hết số lượt thi được phép.");
    const bank=(await tx.get(bankRef(periodId))).data();
    let session;try{session=buildSession(bank,p.course,Date.now(),p)}catch{throw new HttpsError("failed-precondition","Ngân hàng đề của kỳ không hợp lệ.");}
    tx.set(active,{...session,periodId,periodTitle:p.title});
    return {...publicSession(session),periodId,periodTitle:p.title};
  });
});
exports.submitAssessment=onCall(options,async req=>{
  const periodId=periodOf(req.data),id=req.data?.id;
  if(typeof id!=="string"||! /^[a-f0-9-]{36}$/.test(id))throw new HttpsError("invalid-argument","Mã lượt không hợp lệ.");
  return db.runTransaction(async tx=>{
    const actor=await profile(req,tx),root=resultRoot(actor.uid),ref=root.collection("attempts").doc(id),active=activeRef(actor.uid,periodId),pr=periodResult(periodId,actor.uid);
    const existing=await tx.get(ref);
    if(existing.exists){if(existing.data().periodId!==periodId)throw new HttpsError("invalid-argument","Kỳ không khớp.");return existing.data();}
    const p=(await tx.get(periods().doc(periodId))).data();
    if(!isOpen(p))throw new HttpsError("failed-precondition","Kỳ đã đóng hoặc hết hạn.");
    const session=(await tx.get(active)).data();
    if(!session||session.id!==id||session.periodId!==periodId||session.expiresAtMs<=Date.now())throw new HttpsError("failed-precondition","Lượt thi không tồn tại hoặc hết hạn. Về danh sách kỳ để tạo lượt mới.");
    const summary=(await tx.get(root)).data()||{},periodPrior=(await tx.get(pr)).data()||{},prior=summary[p.course]||{};
    if(p.maxAttempts>0&&(periodPrior.attemptCount||0)>=p.maxAttempts)throw new HttpsError("failed-precondition","Đã hết số lượt thi.");
    let score;try{score=grade(session,req.data.answers)}catch{throw new HttpsError("invalid-argument","Cần trả lời đầy đủ và hợp lệ.");}
    const now=Date.now();if(!isOpen(p,now)||now>=session.expiresAtMs)throw new HttpsError("failed-precondition","Đã hết thời gian nộp bài.");
    const record={id,course:p.course,periodId,periodTitle:p.title,bankVersion:session.version,passPercent:session.passPercent,startedAtMs:session.startedAtMs,submittedAtMs:now,durationSeconds:Math.max(0,Math.floor((now-session.startedAtMs)/1000)),...score,attemptNumber:(periodPrior.attemptCount||0)+1};
    tx.create(ref,record);
    tx.set(root,{[p.course]:{attemptCount:(prior.attemptCount||0)+1,bestPercent:Math.max(prior.bestPercent||0,score.percent),passedCount:(prior.passedCount||0)+(score.passed?1:0),lastPercent:score.percent,lastSubmittedAtMs:now}},{merge:true});
    tx.set(pr,{uid:actor.uid,email:actor.email,name:actor.name,attemptCount:record.attemptNumber,bestPercent:Math.max(periodPrior.bestPercent||0,score.percent),passedCount:(periodPrior.passedCount||0)+(score.passed?1:0),lastPercent:score.percent,lastSubmittedAtMs:now});
    tx.delete(active);return record;
  });
});
exports.getAssessmentHistory=onCall(options,async req=>{
  const actor=await profile(req),root=resultRoot(actor.uid),cursor=req.data?.cursor;
  let q=root.collection("attempts").orderBy("submittedAtMs","desc").limit(26);
  if(cursor!=null){if(typeof cursor!=="string"||! /^[a-f0-9-]{36}$/.test(cursor))throw new HttpsError("invalid-argument","Trang không hợp lệ.");const doc=await root.collection("attempts").doc(cursor).get();if(!doc.exists)throw new HttpsError("invalid-argument","Trang không tồn tại.");q=q.startAfter(doc);}
  const [summary,page]=await Promise.all([root.get(),q.get()]);const docs=page.docs.slice(0,25);
  return {summary:summary.data()||{},attempts:docs.map(d=>d.data()),nextCursor:page.size>25?docs[docs.length-1].id:null};
});
