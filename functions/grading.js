"use strict";
const {randomInt, randomUUID} = require("node:crypto");
const TOTAL = 20, PASS = 80, SESSION_MS = 24 * 60 * 60 * 1000;
function shuffle(xs) {
  const a = [...xs];
  for (let i = a.length-1; i > 0; i--) {
    const j = randomInt(i+1); [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function validateBank(bank) {
  if (!bank || typeof bank.version !== "string" || !bank.version.trim() || bank.version.length>80 ||
    !Array.isArray(bank.questions) || bank.questions.length<TOTAL || bank.questions.length>150) throw Error("Invalid bank");
  const prompts = new Set();
  for (const q of bank.questions) {
    if (!q || typeof q.prompt !== "string" || !q.prompt.trim() || q.prompt.length>500 ||
      prompts.has(q.prompt.trim()) || !Array.isArray(q.options) || q.options.length<3 || q.options.length>5 ||
      q.options.some(x=>typeof x!=="string"||!x.trim()||x.length>300) ||
      new Set(q.options.map(x=>x.trim())).size!==q.options.length ||
      !Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>=q.options.length) throw Error("Invalid question");
    prompts.add(q.prompt.trim());
  }
  return bank;
}
function buildSession(bank, course, now=Date.now()) {
  validateBank(bank);
  const questions = shuffle(bank.questions).slice(0,TOTAL).map(q=>{
    const options=shuffle(q.options.map((label,i)=>({id:randomUUID(),label,correct:i===q.correctIndex})));
    return {id:randomUUID(),prompt:q.prompt,options:options.map(({id,label})=>({id,label})),correctId:options.find(x=>x.correct).id};
  });
  return {id:randomUUID(),course,version:bank.version,startedAtMs:now,expiresAtMs:now+SESSION_MS,questions};
}
function publicSession(s) {
  return {id:s.id,course:s.course,version:s.version,startedAtMs:s.startedAtMs,expiresAtMs:s.expiresAtMs,
    questions:s.questions.map(({id,prompt,options})=>({id,prompt,options}))};
}
function grade(s, answers) {
  if (!Array.isArray(answers)||answers.length!==s.questions.length) throw Error("Incomplete answers");
  const byId=new Map();
  for(const a of answers){
    if(!a||typeof a.questionId!=="string"||typeof a.optionId!=="string"||byId.has(a.questionId))throw Error("Invalid answers");
    byId.set(a.questionId,a.optionId);
  }
  let correct=0;
  for(const q of s.questions){
    const choice=byId.get(q.id);
    if(!q.options.some(x=>x.id===choice))throw Error("Invalid answer option");
    if(choice===q.correctId)correct++;
  }
  const total=s.questions.length,percent=Math.round(correct*100/total);
  return {correct,total,percent,passed:percent>=PASS};
}
module.exports={TOTAL,PASS,SESSION_MS,validateBank,buildSession,publicSession,grade};
