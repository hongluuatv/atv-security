"use strict";
// Firebase-only adapter. Firestore Rules are the authorization boundary;
// scores are client-calculated and explicitly unverified.
window.ATV_FIRESTORE=(()=>{
  const ADMIN="honglm@arrow-tech.vn", validEmail=e=>typeof e==="string"&&/^[^/@\s]+@arrow-tech\.vn$/.test(e)&&e.length<=254;
  const fail=(message,code="failed-precondition")=>{const err=new Error(message);err.code=code;throw err;};
  const must=(v,msg)=>{if(!v)fail(msg,"invalid-argument");};
  const versioned=(b)=>{must(b&&typeof b.version==="string"&&b.version.trim()&&b.version.length<=80&&Array.isArray(b.questions)&&b.questions.length>=5&&b.questions.length<=150,"Ngân hàng phải có version và 5–150 câu.");const seen=new Set();return {version:b.version.trim(),questions:b.questions.map(q=>{must(q&&typeof q.prompt==="string"&&q.prompt.trim()&&q.prompt.length<=500&&!seen.has(q.prompt.trim())&&Array.isArray(q.options)&&q.options.length>=3&&q.options.length<=5&&q.options.every(o=>typeof o==="string"&&o.trim()&&o.length<=300)&&new Set(q.options.map(o=>o.trim())).size===q.options.length&&Number.isInteger(q.correctIndex)&&q.correctIndex>=0&&q.correctIndex<q.options.length,"Câu hỏi không hợp lệ hoặc trùng.");seen.add(q.prompt.trim());const out={prompt:q.prompt.trim(),options:q.options.map(o=>o.trim()),correctIndex:q.correctIndex};for(const [k,max] of Object.entries({id:80,topic:200,explanation:2000,source:1000,origin:200,reference:500})){if(q[k]!=null){must(typeof q[k]==="string"&&q[k].length<=max,"Thông tin câu hỏi không hợp lệ: "+k);out[k]=q[k];}}return out;})};};
  function randomized(bank,id,count){
    let seed=2166136261;for(const ch of id)seed=Math.imul(seed^ch.charCodeAt(0),16777619);
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
    let selected;
    if(bank.questions.every(q=>typeof q.topic==="string"&&q.topic.trim())){
      const groups=new Map();for(const q of bank.questions){if(!groups.has(q.topic))groups.set(q.topic,[]);groups.get(q.topic).push(q);}
      const pools=shuffle([...groups.values()]).map(g=>shuffle(g));selected=[];
      while(selected.length<count&&pools.some(p=>p.length)){for(const p of pools){if(p.length&&selected.length<count)selected.push(p.pop());}}
      selected=shuffle(selected);
    }else selected=shuffle(bank.questions).slice(0,count);
    return selected.map((q,i)=>{const opts=shuffle(q.options.map((label,j)=>({label,correct:j===q.correctIndex})));return {id:"q"+i,prompt:q.prompt,options:opts.map((o,j)=>({id:"o"+j,label:o.label})),correctId:"o"+opts.findIndex(o=>o.correct)};});
  }
  async function create(user,app){
    const sdk=await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");
    const {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,query,where,orderBy,limit,startAfter,runTransaction,writeBatch,serverTimestamp}=sdk;
    const db=getFirestore(app),uid=user.uid,email=String(user.email||"").toLowerCase(),name=String(user.displayName||"").slice(0,120);
    const ref=(...p)=>doc(db,...p),col=(...p)=>collection(db,...p),userRef=ref("portalUsers",email),policyRef=ref("portalSettings","access");
    const period=id=>ref("assessmentPeriods",id),bank=course=>ref("assessmentBanks",course),snapshot=id=>ref("assessmentPeriodBanks",id);
    const session=id=>ref("assessmentSessions",uid,"active",id),result=id=>ref("assessmentPeriods",id,"results",uid),attempt=id=>ref("assessmentResults",uid,"attempts",id);
    const now=()=>Date.now(), stamp=()=>serverTimestamp();
    const audit=(tx,action,target)=>tx.set(doc(col("portalAudit")),{actorUid:uid,actorEmail:email,action,target,at:stamp()});
    const actor=()=>({uid,email,name});
    const validId=id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,80}$/.test(id);
    const opened=p=>p?.status==="published"&&p.openAtMs<=now()&&now()<p.closeAtMs;
    const requireOpen=p=>{if(!opened(p))fail("Kỳ chưa mở, đã đóng hoặc hết hạn.");};
    const get=async r=>(await getDocFromServer(r)).data();
    async function profile(){
      must(validEmail(email)&&user.emailVerified,"Cần email Google công ty đã xác thực.");
      const token=await user.getIdTokenResult(true);
      if(token.signInProvider!=="google.com"||token.claims.email_verified!==true||String(token.claims.email||"").toLowerCase()!==email)fail("Phiên Google chưa xác thực đúng email công ty. Đăng nhập lại bằng Google.","permission-denied");
      let stage="đọc hồ sơ portalUsers/"+email;
      try{return await runTransaction(db,async tx=>{
        stage="đọc hồ sơ portalUsers/"+email;
        let p=(await tx.get(userRef)).data();
        if(p?.uid&&p.uid!==uid)fail("Định danh không khớp. Liên hệ quản trị viên.","permission-denied");
        if(email===ADMIN){
          if(!p||!p.uid||p.role!=="admin"||p.enabled!==true){p={...p,email,uid,name,role:"admin",enabled:true,createdAtMs:p?.createdAtMs||now(),firstLoginAtMs:p?.firstLoginAtMs||now()};stage="ghi hồ sơ Admin mặc định";tx.set(userRef,p);}
        }else if(!p){
          stage="đọc chính sách portalSettings/access";const settings=(await tx.get(policyRef)).data();
          if(settings?.mode==="whitelist")fail("Email chưa được cấp phép.","permission-denied");
          p={email,uid,name,role:"employee",enabled:true,createdAtMs:now(),firstLoginAtMs:now()};stage="tạo hồ sơ nhân viên";tx.set(userRef,p);
        }else{
          if(p.enabled!==true)fail("Tài khoản đã bị khóa.","permission-denied");
          if(!p.uid){p={...p,uid,name,firstLoginAtMs:now()};stage="gắn UID vào hồ sơ đã cấp phép";tx.set(userRef,p);}
        }
        return {...actor(),role:p.role,enabled:true};
      });}catch(err){if(err?.code==="permission-denied"&&/Missing or insufficient permissions/i.test(err.message||""))fail("Firestore từ chối khi "+stage+". Kiểm tra Rules v0.6 đã Publish đúng project atv-security, database (default), và App Check.","permission-denied");throw err;}
    }
    async function listPeriods(data={}){
      // Single-field query: compatible with default Firestore indexes and existing access rules.
      // Paginate before filtering so older expired periods cannot hide newer ones.
      const docs=[];let cursor=null;
      for(;;){
        const constraints=[where("status","==","published")];
        if(cursor)constraints.push(startAfter(cursor));
        constraints.push(limit(100));
        const page=(await getDocsFromServer(query(col("assessmentPeriods"),...constraints))).docs;
        docs.push(...page.filter(d=>d.data().closeAtMs>now()&&(!data.course||d.data().course===data.course)));
        if(page.length<100)break;
        cursor=page[page.length-1];
      }
      docs.sort((a,b)=>a.data().closeAtMs-b.data().closeAtMs||a.id.localeCompare(b.id));
      const rs=await Promise.all(docs.map(async d=>{const p=d.data(),r=await get(result(d.id));return {id:d.id,...p,attemptCount:r?.attemptCount||0,bestPercent:r?.bestPercent??null};}));
      return {periods:rs,nowMs:now()};
    }
    function makeSession(s,p,b,id){const startedAtMs=s.startedAt.toMillis(),expiresAtMs=Math.min(startedAtMs+p.durationMinutes*60000,p.closeAtMs);return {id:s.id,course:p.course,periodId:id,periodTitle:p.title,version:b.version,passPercent:p.passPercent,startedAtMs,expiresAtMs,questions:randomized(b,s.id,p.questionCount).map(({correctId,...q})=>q)};}
    async function start(data){
      const id=data.periodId;must(validId(id),"Chọn kỳ đánh giá.");const p=await get(period(id));requireOpen(p);const b=versioned(await get(snapshot(id)));must(b.questions.length>=p.questionCount,"Ngân hàng đề không đủ câu.");
      await runTransaction(db,async tx=>{
        const fresh=(await tx.get(period(id))).data(),s=(await tx.get(session(id))).data(),r=(await tx.get(result(id))).data();requireOpen(fresh);
        if(fresh.maxAttempts>0&&(r?.attemptCount||0)>=fresh.maxAttempts)fail("Đã hết số lượt thi.");
        const old=s?.id?(await tx.get(attempt(s.id))).exists():false;
        if(s?.startedAt&&now()<s.startedAt.toMillis()+fresh.durationMinutes*60000&&!old)return;
        tx.set(session(id),{id:crypto.randomUUID(),periodId:id,startedAt:stamp()});
      });
      const s=await get(session(id));return makeSession(s,p,b,id);
    }
    async function submit(data){
      const id=data.periodId,aid=data.id;must(validId(id)&&typeof aid==="string"&&/^[a-f0-9-]{36}$/.test(aid),"Mã lượt không hợp lệ.");
      const existing=await get(attempt(aid));if(existing){must(existing.periodId===id,"Kỳ không khớp.");return existing;}
      const b=versioned(await get(snapshot(id)));
      await runTransaction(db,async tx=>{
        const saved=await tx.get(attempt(aid));if(saved.exists()){must(saved.data().periodId===id,"Kỳ không khớp.");return;}
        const p=(await tx.get(period(id))).data(),s=(await tx.get(session(id))).data(),prior=(await tx.get(result(id))).data()||{};
        requireOpen(p);if(!s?.startedAt||s.id!==aid||now()>=s.startedAt.toMillis()+p.durationMinutes*60000)fail("Lượt thi hết hạn. Hãy mở lượt mới.");
        if(p.maxAttempts>0&&(prior.attemptCount||0)>=p.maxAttempts)fail("Đã hết số lượt thi.");
        const qs=randomized(b,aid,p.questionCount);must(Array.isArray(data.answers)&&data.answers.length===qs.length,"Cần trả lời đầy đủ.");
        const answers=new Map(data.answers.map(a=>[a.questionId,a.optionId]));must(answers.size===qs.length&&qs.every(q=>q.options.some(o=>o.id===answers.get(q.id))),"Đáp án không hợp lệ.");
        const correct=qs.filter(q=>answers.get(q.id)===q.correctId).length,total=qs.length,percent=Math.round(correct*100/total),passed=correct*100>=total*p.passPercent;
        const record={id:aid,course:p.course,periodId:id,periodTitle:p.title,bankVersion:b.version,passPercent:p.passPercent,startedAt:s.startedAt,submittedAt:stamp(),submittedAtMs:now(),correct,total,percent,passed,attemptNumber:(prior.attemptCount||0)+1,grading:"client-unverified"};
        tx.set(attempt(aid),record);
        tx.set(result(id),{uid,email,name,attemptCount:record.attemptNumber,bestPercent:Math.max(prior.bestPercent||0,percent),passedCount:(prior.passedCount||0)+(passed?1:0),lastPercent:percent,lastSubmittedAtMs:record.submittedAtMs,lastAttemptId:aid,grading:"client-unverified"});
      });
      return await get(attempt(aid));
    }
    async function history(data){
      const rows=[];let cursor=null;
      if(data.course)must(["general","onboarding","technical"].includes(data.course),"Khóa không hợp lệ.");
      if(data.cursor){cursor=await getDocFromServer(attempt(data.cursor));must(cursor.exists(),"Trang không tồn tại.");}
      // Filter course locally to retain single-field Firestore ordering (no composite index).
      for(;;){
        const constraints=[orderBy("submittedAtMs","desc")];
        if(cursor)constraints.push(startAfter(cursor));constraints.push(limit(100));
        const page=(await getDocsFromServer(query(col("assessmentResults",uid,"attempts"),...constraints))).docs;
        for(const d of page){const v=d.data();if(!data.course||v.course===data.course){rows.push(d);if(rows.length===26)return {attempts:rows.slice(0,25).map(x=>x.data()),nextCursor:rows[24].id};}}
        if(page.length<100)return {attempts:rows.map(x=>x.data()),nextCursor:null};
        cursor=page[page.length-1];
      }
    }
    async function paged(c,field,cursor,n=50){
      const qs=[orderBy(field,field==="createdAtMs"?"desc":"asc")];
      if(cursor){const d=await getDocFromServer(doc(c,cursor));must(d.exists(),"Trang không tồn tại.");qs.push(startAfter(d));}qs.push(limit(n+1));const docs=(await getDocsFromServer(query(c,...qs))).docs;const rows=docs.slice(0,n);return {rows,nextCursor:docs.length>n?rows[n-1].id:null};
    }
    async function listUsers(d){const [p,q]=await Promise.all([get(policyRef),paged(col("portalUsers"),"email",d.cursor)]);return {mode:p?.mode==="whitelist"?"whitelist":"domain",users:q.rows.map(s=>{const v=s.data();return {...v,registered:!!v.uid};}),nextCursor:q.nextCursor};}
    async function saveUser(d){const e=String(d.email||"").trim().toLowerCase();must(validEmail(e)&&e!==ADMIN&&e!==email&&["admin","employee"].includes(d.role)&&typeof d.enabled==="boolean","Email hoặc quyền không hợp lệ; không thể sửa admin mặc định hoặc chính mình.");const r=ref("portalUsers",e);await runTransaction(db,async tx=>{const old=(await tx.get(r)).data();tx.set(r,old?{...old,role:d.role,enabled:d.enabled,updatedAtMs:now()}:{email:e,role:d.role,enabled:d.enabled,createdAtMs:now(),updatedAtMs:now()});audit(tx,"user.save",e);});return {ok:true};}
    async function setMode(d){must(["domain","whitelist"].includes(d.mode),"Chế độ không hợp lệ.");const tx=writeBatch(db);tx.set(policyRef,{mode:d.mode,updatedAtMs:now(),updatedBy:email});audit(tx,"access.mode",d.mode);await tx.commit();return {ok:true};}
    async function listAdminPeriods(d){const [q,g,o,t]=await Promise.all([paged(col("assessmentPeriods"),"createdAtMs",d.cursor),get(bank("general")),get(bank("onboarding")),get(bank("technical"))]);const info=b=>({version:b?.version||null,count:b?.questions?.length||0});return {periods:q.rows.map(s=>({id:s.id,...s.data()})),nextCursor:q.nextCursor,banks:{general:info(g),onboarding:info(o),technical:info(t)}};}
    async function savePeriod(d){
      const x=d.period||{},title=String(x.title||"").trim(),p={title,course:x.course,openAtMs:x.openAtMs,closeAtMs:x.closeAtMs,questionCount:x.questionCount,passPercent:x.passPercent,durationMinutes:x.durationMinutes,maxAttempts:x.maxAttempts};
      must(title&&title.length<=150&&["general","onboarding","technical"].includes(p.course)&&Number.isSafeInteger(p.openAtMs)&&Number.isSafeInteger(p.closeAtMs)&&p.closeAtMs>p.openAtMs&&p.closeAtMs-p.openAtMs<=366*86400000&&Number.isInteger(p.questionCount)&&p.questionCount>=5&&p.questionCount<=50&&Number.isInteger(p.passPercent)&&p.passPercent>=1&&p.passPercent<=100&&Number.isInteger(p.durationMinutes)&&p.durationMinutes>=5&&p.durationMinutes<=1440&&Number.isInteger(p.maxAttempts)&&p.maxAttempts>=0&&p.maxAttempts<=100,"Cấu hình kỳ không hợp lệ.");
      const r=d.id?period(d.id):doc(col("assessmentPeriods"));if(d.id)must(validId(d.id),"Mã kỳ không hợp lệ.");
      await runTransaction(db,async tx=>{const old=(await tx.get(r)).data();if(d.id&&old?.status!=="draft")fail("Chỉ sửa kỳ nháp.");tx.set(r,{...p,status:"draft",createdAtMs:old?.createdAtMs||now(),createdBy:old?.createdBy||email,updatedAtMs:now()});audit(tx,"period.save",r.id);});return {id:r.id};
    }
    async function publish(d){must(validId(d.id),"Mã kỳ không hợp lệ.");await runTransaction(db,async tx=>{const r=period(d.id),p=(await tx.get(r)).data();if(p?.status!=="draft"||p.closeAtMs<=now())fail("Chỉ công bố kỳ nháp chưa hết hạn.");const b=versioned((await tx.get(bank(p.course))).data());must(b.questions.length>=p.questionCount,"Ngân hàng chưa đủ câu.");if(b.version.startsWith("DEMO")&&!d.confirmDemo)fail("Cần xác nhận đề DEMO.");tx.set(snapshot(d.id),b);tx.update(r,{status:"published",bankVersion:b.version,publishedAtMs:now(),publishedBy:email});audit(tx,"period.publish",d.id);});return {ok:true};}
    async function close(d){must(validId(d.id),"Mã kỳ không hợp lệ.");await runTransaction(db,async tx=>{const r=period(d.id),p=(await tx.get(r)).data();if(!p||!["draft","published"].includes(p.status))fail("Kỳ không thể đóng.");tx.update(r,{status:"closed",closedAtMs:now(),closedBy:email});audit(tx,"period.close",d.id);});return {ok:true};}
    async function adminResults(d){must(validId(d.id),"Mã kỳ không hợp lệ.");const q=await paged(col("assessmentPeriods",d.id,"results"),"email",d.cursor);return {results:q.rows.map(r=>r.data()),nextCursor:q.nextCursor};}
    async function saveBank(d){must(["general","onboarding","technical"].includes(d.course),"Khóa không hợp lệ.");const b=versioned(d.bank);const tx=writeBatch(db);tx.set(bank(d.course),b);audit(tx,"bank.save",d.course);await tx.commit();return {version:b.version,count:b.questions.length};}
    async function importBanks(d){
      const bundle=d.bundle,keys=["general","onboarding","technical"];
      must(bundle?.schemaVersion===1&&bundle.banks&&keys.every(k=>Object.prototype.hasOwnProperty.call(bundle.banks,k))&&Object.keys(bundle.banks).length===3,"JSON phải chứa đủ ba ngân hàng General, Onboarding, Technical.");
      const validated=keys.map(k=>[k,versioned(bundle.banks[k])]);
      for(const [k,b] of validated){must(new TextEncoder().encode(JSON.stringify(b)).length<700000,"Ngân hàng "+k+" vượt kích thước cho phép.");const ids=b.questions.map(q=>q.id).filter(Boolean);must(new Set(ids).size===ids.length,"Mã câu bị trùng trong "+k);}
      const tx=writeBatch(db);for(const [k,b] of validated)tx.set(bank(k),b);audit(tx,"bank.import","general,onboarding,technical");await tx.commit();
      return {banks:Object.fromEntries(validated.map(([k,b])=>[k,{version:b.version,count:b.questions.length}]))};
    }
    const handlers={getPortalProfile:profile,listAssessmentPeriods:listPeriods,startAssessment:start,submitAssessment:submit,getAssessmentHistory:history,adminListUsers:listUsers,adminSaveUser:saveUser,adminSetAccessMode:setMode,adminListPeriods:listAdminPeriods,adminSavePeriod:savePeriod,adminPublishPeriod:publish,adminClosePeriod:close,adminPeriodResults:adminResults,adminSaveBank:saveBank,adminImportBanks:importBanks};
    return {call:async(name,data={})=>{if(!handlers[name])fail("Chức năng không hợp lệ.");return handlers[name](data);}};
  }
  return {create};
})();
