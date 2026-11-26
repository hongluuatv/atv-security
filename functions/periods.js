"use strict";
const {HttpsError}=require("firebase-functions/v2/https");
const {getFirestore}=require("firebase-admin/firestore");
const {validateBank}=require("./grading");
const courses=new Set(["general","technical"]);
const periods=()=>getFirestore().collection("assessmentPeriods");
const bankRef=id=>getFirestore().collection("assessmentPeriodBanks").doc(id);
const idOk=id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,80}$/.test(id);
function validatePeriod(x){
  const title=typeof x?.title==="string"?x.title.trim():"";
  const p={title,course:x?.course,openAtMs:x?.openAtMs,closeAtMs:x?.closeAtMs,questionCount:x?.questionCount,passPercent:x?.passPercent,durationMinutes:x?.durationMinutes,maxAttempts:x?.maxAttempts};
  if(!title||title.length>150||!courses.has(p.course)||!Number.isSafeInteger(p.openAtMs)||!Number.isSafeInteger(p.closeAtMs)||p.closeAtMs<=p.openAtMs||
     p.closeAtMs-p.openAtMs>366*86400000||!Number.isInteger(p.questionCount)||p.questionCount<5||p.questionCount>50||
     !Number.isInteger(p.passPercent)||p.passPercent<1||p.passPercent>100||!Number.isInteger(p.durationMinutes)||p.durationMinutes<5||p.durationMinutes>1440||
     !Number.isInteger(p.maxAttempts)||p.maxAttempts<0||p.maxAttempts>100)throw new HttpsError("invalid-argument","Cấu hình kỳ không hợp lệ: thời gian, 5–50 câu, điểm đạt 1–100%, 5–1440 phút, 0–100 lượt (0 = không giới hạn).");
  return p;
}
function isOpen(p,now=Date.now()){return p?.status==="published"&&p.openAtMs<=now&&now<p.closeAtMs;}
function publicPeriod(id,p){return {id,title:p.title,course:p.course,status:p.status,openAtMs:p.openAtMs,closeAtMs:p.closeAtMs,questionCount:p.questionCount,passPercent:p.passPercent,durationMinutes:p.durationMinutes,maxAttempts:p.maxAttempts,bankVersion:p.bankVersion||null};}
function freezeBank(bank,p){validateBank(bank);if(bank.questions.length<p.questionCount)throw Error("Not enough questions");return {version:bank.version,questions:bank.questions};}
module.exports={periods,bankRef,idOk,validatePeriod,isOpen,publicPeriod,freezeBank};
