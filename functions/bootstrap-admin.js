"use strict";
// Run from an authorized workstation with Application Default Credentials. Never commit keys.
const {initializeApp,applicationDefault}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {validEmail}=require("./access");
async function main(){
  const email=String(process.argv[2]||"").trim().toLowerCase();
  if(process.argv[3]!=="atv-security"||!validEmail(email))throw Error("Usage: node functions/bootstrap-admin.js <email@arrow-tech.vn> atv-security");
  initializeApp({credential:applicationDefault(),projectId:"atv-security"});
  const db=getFirestore(),ref=db.collection("portalUsers").doc(email);
  await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();tx.set(ref,{...old,email,role:"admin",enabled:true,createdAtMs:old?.createdAtMs||Date.now(),updatedAtMs:Date.now()});tx.create(db.collection("portalAudit").doc(),{action:"admin.bootstrap",target:email,atMs:Date.now(),actorEmail:"authorized-cli"});});
  console.log("Admin configured:",email,"Sign in with this Google account to bind its UID.");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
