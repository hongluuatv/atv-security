"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildSession,publicSession,grade,validateBank}=require("./grading");
const bank={version:"test",questions:Array.from({length:25},(_,i)=>({prompt:"Câu "+i,options:["A","B","C","D"],correctIndex:i%4}))};
test("20 random questions, no answer key in response",()=>{const s=buildSession(bank,"general");assert.equal(s.questions.length,20);assert.equal(new Set(s.questions.map(q=>q.id)).size,20);assert.ok(!JSON.stringify(publicSession(s)).includes("correctId"));assert.ok(!JSON.stringify(publicSession(s)).includes("correctIndex"));});
test("score, pass threshold and invalid inputs",()=>{const s=buildSession(bank,"technical");const a=s.questions.map((q,i)=>({questionId:q.id,optionId:i<16?q.correctId:q.options.find(o=>o.id!==q.correctId).id}));assert.deepEqual(grade(s,a),{correct:16,total:20,percent:80,passed:true});a[0].optionId=s.questions[0].options.find(x=>x.id!==s.questions[0].correctId).id;assert.equal(grade(s,a).passed,false);assert.throws(()=>grade(s,a.slice(1)));assert.throws(()=>grade(s,[...a.slice(1),a[1]]));a[0].optionId="invalid";assert.throws(()=>grade(s,a));});
test("reject malformed bank",()=>{assert.throws(()=>validateBank({version:"x",questions:[]}));assert.throws(()=>validateBank({...bank,questions:bank.questions.map(q=>({...q,correctIndex:99}))}));});
