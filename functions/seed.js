"use strict";
// Run only with authorized Application Default Credentials on an administrator's computer.
// Never put real exam banks, answer keys or service-account keys in the public repository.
const fs=require("node:fs");
const {initializeApp,applicationDefault}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {validateBank}=require("./grading");
async function main(){
  const [file,course,project]=process.argv.slice(2);
  if(!file||!["general","technical"].includes(course)||project!=="atv-security")
    throw Error("Usage: node seed.js /private/bank.json general|technical atv-security");
  const bank=validateBank(JSON.parse(fs.readFileSync(file,"utf8")));
  initializeApp({credential:applicationDefault(),projectId:project});
  await getFirestore().collection("assessmentBanks").doc(course).set(bank);
  console.log("Imported",course,bank.version,bank.questions.length,"questions");
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
