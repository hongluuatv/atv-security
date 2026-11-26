"use strict";
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {initializeApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {validateBank,buildSession,publicSession,grade}=require("./grading");
initializeApp();
const db=getFirestore();
const options={region:"asia-southeast1",maxInstances:5,timeoutSeconds:30};
const courses=new Set(["general","technical"]);
function identity(req){
  const a=req.auth,t=a?.token;
  if(!a||t?.email_verified!==true||t?.firebase?.sign_in_provider!=="google.com")
    throw new HttpsError("unauthenticated","Đăng nhập bằng tài khoản Google đã xác thực.");
  const email=String(t.email||"").toLowerCase();
  if(email.split("@").pop()!=="arrow-tech.vn"||!email.includes("@"))
    throw new HttpsError("permission-denied","Chỉ dành cho tài khoản công ty được phép.");
  return a.uid;
}
function courseOf(data){
  const course=data?.course;
  if(!courses.has(course))throw new HttpsError("invalid-argument","Khóa đánh giá không hợp lệ.");
  return course;
}
const resultRoot=uid=>db.collection("assessmentResults").doc(uid);
const activeRef=(uid,course)=>db.collection("assessmentSessions").doc(uid).collection("active").doc(course);
const bankRef=course=>db.collection("assessmentBanks").doc(course);
exports.startAssessment=onCall(options,async req=>{
  const uid=identity(req),course=courseOf(req.data);
  const active=activeRef(uid,course);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(active);
    const previous=snap.data();
    if(previous&&previous.expiresAtMs>Date.now())return publicSession(previous);
    const bank=(await tx.get(bankRef(course))).data();
    try{validateBank(bank)}catch{throw new HttpsError("failed-precondition","Ngân hàng câu hỏi chưa được quản trị viên thiết lập.");}
    const session=buildSession(bank,course);
    tx.set(active,session);
    return publicSession(session);
  });
});
exports.submitAssessment=onCall(options,async req=>{
  const uid=identity(req),course=courseOf(req.data),id=req.data?.id;
  if(typeof id!=="string"||! /^[a-f0-9-]{36}$/.test(id))throw new HttpsError("invalid-argument","Mã lượt thi không hợp lệ.");
  const root=resultRoot(uid),ref=root.collection("attempts").doc(id),active=activeRef(uid,course);
  return db.runTransaction(async tx=>{
    const existing=await tx.get(ref);
    if(existing.exists){
      if(existing.data().course!==course)throw new HttpsError("invalid-argument","Khóa không khớp.");
      return existing.data();
    }
    const session=(await tx.get(active)).data();
    if(!session||session.id!==id||session.expiresAtMs<Date.now())throw new HttpsError("failed-precondition","Lượt thi không tồn tại hoặc đã hết hạn. Tạo lượt mới.");
    let score;
    try{score=grade(session,req.data.answers)}catch{throw new HttpsError("invalid-argument","Cần trả lời đầy đủ và hợp lệ.");}
    const summary=(await tx.get(root)).data()||{},now=Date.now(),prior=summary[course]||{};
    const record={id,course,bankVersion:session.version,startedAtMs:session.startedAtMs,submittedAtMs:now,durationSeconds:Math.max(0,Math.floor((now-session.startedAtMs)/1000)),...score,attemptNumber:(prior.attemptCount||0)+1};
    tx.create(ref,record);
    tx.set(root,{[course]:{attemptCount:record.attemptNumber,bestPercent:Math.max(prior.bestPercent||0,score.percent),passedCount:(prior.passedCount||0)+(score.passed?1:0),lastPercent:score.percent,lastSubmittedAtMs:now}},{merge:true});
    tx.delete(active);
    return record;
  });
});
exports.getAssessmentHistory=onCall(options,async req=>{
  const uid=identity(req),root=resultRoot(uid),cursor=req.data?.cursor;
  let q=root.collection("attempts").orderBy("submittedAtMs","desc").limit(26);
  if(cursor!=null){
    if(typeof cursor!=="string"||! /^[a-f0-9-]{36}$/.test(cursor))throw new HttpsError("invalid-argument","Trang không hợp lệ.");
    const doc=await root.collection("attempts").doc(cursor).get();
    if(!doc.exists)throw new HttpsError("invalid-argument","Trang không tồn tại.");
    q=q.startAfter(doc);
  }
  const [summary,page]=await Promise.all([root.get(),q.get()]);
  const docs=page.docs.slice(0,25);
  return {summary:summary.data()||{},attempts:docs.map(d=>d.data()),nextCursor:page.size>25?docs[docs.length-1].id:null};
});
