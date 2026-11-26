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
          if(p.deletedAt)fail("Tài khoản đã bị xóa khỏi Portal. Liên hệ quản trị viên.","permission-denied");
          if(p.enabled!==true)fail("Tài khoản đã bị khóa.","permission-denied");
          if(!p.uid){p={...p,uid,name,firstLoginAtMs:now()};stage="gắn UID vào hồ sơ đã cấp phép";tx.set(userRef,p);}
        }
        return {...actor(),role:p.role,enabled:true};
      });}catch(err){if(err?.code==="permission-denied"&&/Missing or insufficient permissions/i.test(err.message||""))fail("Firestore từ chối khi "+stage+". Kiểm tra Rules v0.6 đã Publish đúng project atv-security, database (default), và App Check.","permission-denied");throw err;}
    }
    const ONBOARD="onboarding-always",onboardConfig={course:"onboarding",title:"Đánh giá nhân viên mới",questionCount:15,passPercent:80,durationMinutes:30,maxAttempts:0};
    const completion=()=>ref("onboardingCompletion",uid),onboardSession=()=>ref("onboardingSessions",uid);
    async function onboardingStatus(){
      let stage="kiểm tra trạng thái hoàn thành";
      try{
      let completed=await get(completion());
      if(!completed){
        // Migrate a previous pass from any historical onboarding period, not just the first page.
        stage="kiểm tra lịch sử đánh giá nhân viên mới";
        let cursor=null,proof=null;
        for(;;){
          const qs=[where("course","==","onboarding")];if(cursor)qs.push(startAfter(cursor));qs.push(limit(100));
          const page=(await getDocsFromServer(query(col("assessmentResults",uid,"attempts"),...qs))).docs;
          proof=page.find(d=>d.data().passed===true);if(proof||page.length<100)break;cursor=page[page.length-1];
        }
        if(proof){
          stage="đồng bộ kết quả đạt trước đây";
          await runTransaction(db,async tx=>{const old=await tx.get(completion());if(!old.exists())tx.set(completion(),{uid,attemptId:proof.id,completedAt:stamp()});});
          completed=await get(completion());
        }
      }
      if(completed){stage="đọc kết quả đã đạt";const r=await get(attempt(completed.attemptId));return {completed:true,attempt:r||null};}
      stage="đọc ngân hàng câu hỏi nhân viên mới";
      const b=await get(bank("onboarding"));return {completed:false,ready:Array.isArray(b?.questions)&&b.questions.length>=15,config:onboardConfig};
      }catch(err){if(err?.code==="permission-denied")fail("Firestore từ chối khi "+stage+". Quản trị viên cần Publish Security Rules v0.6.10 đã sửa trên project atv-security, database (default).","permission-denied");throw err;}
    }
    function onboardPublic(s){
      return {id:s.id,periodId:ONBOARD,periodTitle:onboardConfig.title,course:"onboarding",version:s.bank.version,passPercent:80,startedAtMs:s.startedAt.toMillis(),expiresAtMs:s.startedAt.toMillis()+30*60000,questions:randomized(s.bank,s.id,15).map(({correctId,...q})=>q)};
    }
    async function startOnboarding(){
      const status=await onboardingStatus();if(status.completed)fail("Bạn đã hoàn thành đánh giá nhân viên mới.");if(!status.ready)fail("Ngân hàng nhân viên mới chưa sẵn sàng. Liên hệ Admin.");
      await runTransaction(db,async tx=>{
        const done=await tx.get(completion()),active=(await tx.get(onboardSession())).data(),raw=(await tx.get(bank("onboarding"))).data();
        if(done.exists())fail("Bạn đã hoàn thành đánh giá nhân viên mới.");
        const used=active?.id?(await tx.get(attempt(active.id))).exists():false;
        if(active?.startedAt&&now()<active.startedAt.toMillis()+30*60000&&!used)return;
        const b=versioned(raw);must(b.questions.length>=15,"Ngân hàng nhân viên mới không đủ câu.");
        // Store the exact bank document for rule-enforced immutable in-progress snapshot.
        tx.set(onboardSession(),{id:crypto.randomUUID(),startedAt:stamp(),bank:raw});
      });
      return onboardPublic(await get(onboardSession()));
    }
    async function submitOnboarding(d){
      const aid=d.id;must(typeof aid==="string"&&/^[a-f0-9-]{36}$/.test(aid),"Mã lượt không hợp lệ.");
      await runTransaction(db,async tx=>{
        const saved=await tx.get(attempt(aid));if(saved.exists()){must(saved.data().periodId===ONBOARD,"Lượt không khớp.");return;}
        const done=await tx.get(completion()),s=(await tx.get(onboardSession())).data(),prior=(await tx.get(result(ONBOARD))).data()||{};
        if(done.exists())fail("Bạn đã hoàn thành đánh giá nhân viên mới.");
        if(!s?.startedAt||s.id!==aid||now()>=s.startedAt.toMillis()+30*60000)fail("Lượt thi đã hết hạn. Hãy bắt đầu lại.");
        const qs=randomized(s.bank,aid,15);must(Array.isArray(d.answers)&&d.answers.length===15,"Cần trả lời đủ 15 câu.");
        const answers=new Map(d.answers.map(a=>[a.questionId,a.optionId]));must(answers.size===15&&qs.every(q=>q.options.some(o=>o.id===answers.get(q.id))),"Đáp án không hợp lệ.");
        const correct=qs.filter(q=>answers.get(q.id)===q.correctId).length,percent=Math.round(correct*100/15),passed=correct>=12;
        const record={id:aid,course:"onboarding",periodId:ONBOARD,periodTitle:onboardConfig.title,bankVersion:s.bank.version,passPercent:80,startedAt:s.startedAt,submittedAt:stamp(),submittedAtMs:now(),correct,total:15,percent,passed,attemptNumber:(prior.attemptCount||0)+1,grading:"client-unverified"};
        tx.set(attempt(aid),record);
        tx.set(result(ONBOARD),{uid,email,name,attemptCount:record.attemptNumber,bestPercent:Math.max(prior.bestPercent||0,percent),passedCount:(prior.passedCount||0)+(passed?1:0),lastPercent:percent,lastSubmittedAtMs:record.submittedAtMs,lastAttemptId:aid,grading:"client-unverified"});
        if(passed)tx.set(completion(),{uid,attemptId:aid,completedAt:stamp()});
      });
      return await get(attempt(aid));
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
        docs.push(...page.filter(d=>d.data().course!=="onboarding"&&d.data().closeAtMs>now()&&(!data.course||d.data().course===data.course)));
        if(page.length<100)break;
        cursor=page[page.length-1];
      }
      docs.sort((a,b)=>a.data().closeAtMs-b.data().closeAtMs||a.id.localeCompare(b.id));
      const rs=await Promise.all(docs.map(async d=>{const p=d.data(),r=await get(result(d.id));return {id:d.id,...p,attemptCount:r?.attemptCount||0,bestPercent:r?.bestPercent??null};}));
      return {periods:rs,nowMs:now()};
    }
    function makeSession(s,p,b,id){const startedAtMs=s.startedAt.toMillis(),expiresAtMs=Math.min(startedAtMs+p.durationMinutes*60000,p.closeAtMs);return {id:s.id,course:p.course,periodId:id,periodTitle:p.title,version:b.version,passPercent:p.passPercent,startedAtMs,expiresAtMs,questions:randomized(b,s.id,p.questionCount).map(({correctId,...q})=>q)};}
    async function start(data){
      const id=data.periodId;must(validId(id),"Chọn kỳ đánh giá.");if(id===ONBOARD)return startOnboarding();const p=await get(period(id));requireOpen(p);if(p.course==="onboarding")fail("Nhân viên mới sử dụng bài đánh giá thường trực.");const b=versioned(await get(snapshot(id)));must(b.questions.length>=p.questionCount,"Ngân hàng đề không đủ câu.");
      const currentPeriod=await runTransaction(db,async tx=>{
        const fresh=(await tx.get(period(id))).data(),s=(await tx.get(session(id))).data(),r=(await tx.get(result(id))).data();requireOpen(fresh);
        if(fresh.maxAttempts>0&&(r?.attemptCount||0)>=fresh.maxAttempts)fail("Đã hết số lượt thi.");
        const old=s?.id?(await tx.get(attempt(s.id))).exists():false;
        if(s?.startedAt&&now()<s.startedAt.toMillis()+fresh.durationMinutes*60000&&!old)return fresh;
        tx.set(session(id),{id:crypto.randomUUID(),periodId:id,startedAt:stamp()});return fresh;
      });
      const s=await get(session(id));return makeSession(s,currentPeriod,b,id);
    }
    async function submit(data){
      const id=data.periodId,aid=data.id;if(id===ONBOARD)return submitOnboarding(data);must(validId(id)&&typeof aid==="string"&&/^[a-f0-9-]{36}$/.test(aid),"Mã lượt không hợp lệ.");
      const existing=await get(attempt(aid));if(existing){must(existing.periodId===id,"Kỳ không khớp.");return existing;}
      const b=versioned(await get(snapshot(id)));
      await runTransaction(db,async tx=>{
        const saved=await tx.get(attempt(aid));if(saved.exists()){must(saved.data().periodId===id,"Kỳ không khớp.");return;}
        const p=(await tx.get(period(id))).data(),s=(await tx.get(session(id))).data(),prior=(await tx.get(result(id))).data()||{};
        requireOpen(p);if(p.course==="onboarding")fail("Nhân viên mới sử dụng bài đánh giá thường trực.");if(!s?.startedAt||s.id!==aid||now()>=s.startedAt.toMillis()+p.durationMinutes*60000)fail("Lượt thi hết hạn. Hãy mở lượt mới.");
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
    async function listUsers(d){const [p,q]=await Promise.all([get(policyRef),paged(col("portalUsers"),"email",d.cursor)]);return {mode:p?.mode==="whitelist"?"whitelist":"domain",users:q.rows.map(s=>{const v=s.data();return {...v,deleted:!!v.deletedAt,deletedAtMs:v.deletedAt?.toMillis?.()||null,registered:!!v.uid};}),nextCursor:q.nextCursor};}
    async function saveUser(d){const e=String(d.email||"").trim().toLowerCase();must(validEmail(e)&&e!==ADMIN&&e!==email&&["admin","employee"].includes(d.role)&&typeof d.enabled==="boolean","Email hoặc quyền không hợp lệ; không thể sửa admin mặc định hoặc chính mình.");const r=ref("portalUsers",e);await runTransaction(db,async tx=>{const old=(await tx.get(r)).data();if(old?.deletedAt)fail("Tài khoản đã xóa. Hãy khôi phục trước khi sửa.");tx.set(r,old?{...old,role:d.role,enabled:d.enabled,updatedAtMs:now()}:{email:e,role:d.role,enabled:d.enabled,createdAtMs:now(),updatedAtMs:now()});audit(tx,"user.save",e);});return {ok:true};}
    async function deleteUser(d){const e=String(d.email||"").trim().toLowerCase();must(validEmail(e)&&e!==ADMIN&&e!==email&&d.confirmed===true,"Không thể xóa tài khoản này.");const r=ref("portalUsers",e);await runTransaction(db,async tx=>{const old=(await tx.get(r)).data();must(old,"Không tìm thấy tài khoản.");if(old.deletedAt)return;tx.set(r,{...old,enabled:false,deletedAt:stamp(),deletedBy:email,updatedAtMs:now()});audit(tx,"user.delete",e);});return {ok:true};}
    async function restoreUser(d){const e=String(d.email||"").trim().toLowerCase();must(validEmail(e)&&e!==ADMIN&&e!==email&&d.confirmed===true,"Không thể khôi phục tài khoản này.");const r=ref("portalUsers",e);await runTransaction(db,async tx=>{const old=(await tx.get(r)).data();must(old?.deletedAt,"Tài khoản chưa bị xóa.");const {deletedAt,deletedBy,...kept}=old;tx.set(r,{...kept,enabled:false,updatedAtMs:now()});audit(tx,"user.restore",e);});return {ok:true};}
    async function setMode(d){must(["domain","whitelist"].includes(d.mode),"Chế độ không hợp lệ.");const tx=writeBatch(db);tx.set(policyRef,{mode:d.mode,updatedAtMs:now(),updatedBy:email});audit(tx,"access.mode",d.mode);await tx.commit();return {ok:true};}
    async function listAdminPeriods(d){const [q,g,o,t]=await Promise.all([paged(col("assessmentPeriods"),"createdAtMs",d.cursor),get(bank("general")),get(bank("onboarding")),get(bank("technical"))]);const info=b=>({version:b?.version||null,count:b?.questions?.length||0});return {periods:q.rows.map(s=>({id:s.id,...s.data()})),nextCursor:q.nextCursor,banks:{general:info(g),onboarding:info(o),technical:info(t)}};}
    async function savePeriod(d){
      const x=d.period||{},title=String(x.title||"").trim(),p={title,course:x.course,openAtMs:x.openAtMs,closeAtMs:x.closeAtMs,questionCount:x.questionCount,passPercent:x.passPercent,durationMinutes:x.durationMinutes,maxAttempts:x.maxAttempts};
      must(title&&title.length<=150&&["general","technical"].includes(p.course)&&Number.isSafeInteger(p.openAtMs)&&Number.isSafeInteger(p.closeAtMs)&&p.closeAtMs>p.openAtMs&&p.closeAtMs-p.openAtMs<=366*86400000&&Number.isInteger(p.questionCount)&&p.questionCount>=5&&p.questionCount<=50&&Number.isInteger(p.passPercent)&&p.passPercent>=1&&p.passPercent<=100&&Number.isInteger(p.durationMinutes)&&p.durationMinutes>=5&&p.durationMinutes<=1440&&Number.isInteger(p.maxAttempts)&&p.maxAttempts>=0&&p.maxAttempts<=100,"Cấu hình kỳ không hợp lệ.");
      const r=d.id?period(d.id):doc(col("assessmentPeriods"));if(d.id)must(validId(d.id),"Mã kỳ không hợp lệ.");
      await runTransaction(db,async tx=>{
        const old=(await tx.get(r)).data();
        if(d.id&&!old)fail("Kỳ đánh giá không tồn tại.");
        if(!old||old.status==="draft"){
          tx.set(r,{...p,status:"draft",createdAtMs:old?.createdAtMs||now(),createdBy:old?.createdBy||email,updatedAtMs:now()});
        }else if(old.status==="published"){
          if(p.course!==old.course)fail("Không đổi khóa sau khi công bố.");
          const b=(await tx.get(snapshot(r.id))).data();
          must(Array.isArray(b?.questions)&&b.questions.length>=p.questionCount,"Đề đã chốt không đủ số câu.");
          if(now()>=old.openAtMs){
            for(const key of ["openAtMs","questionCount","passPercent","durationMinutes"])if(p[key]!==old[key])fail("Kỳ đã mở: không đổi ngày bắt đầu, số câu, điểm đạt hoặc thời lượng.");
            if(p.closeAtMs<old.closeAtMs)fail("Chỉ được gia hạn ngày đóng của kỳ đã mở.");
            if(p.maxAttempts!==old.maxAttempts&&!(old.maxAttempts>0&&(p.maxAttempts===0||p.maxAttempts>=old.maxAttempts)))fail("Chỉ được tăng số lượt hoặc chuyển sang không giới hạn.");
          }
          tx.update(r,{...p,updatedAtMs:now()});
        }else fail("Kỳ đã đóng thủ công không thể sửa. Tạo kỳ mới.");
        audit(tx,old?.status==="published"?"period.update":"period.save",r.id);
      });return {id:r.id};
    }
    async function publish(d){must(validId(d.id),"Mã kỳ không hợp lệ.");await runTransaction(db,async tx=>{const r=period(d.id),p=(await tx.get(r)).data();if(p?.status!=="draft"||p.course==="onboarding"||p.closeAtMs<=now())fail("Chỉ công bố kỳ nháp chưa hết hạn.");const b=versioned((await tx.get(bank(p.course))).data());must(b.questions.length>=p.questionCount,"Ngân hàng chưa đủ câu.");if(b.version.startsWith("DEMO")&&!d.confirmDemo)fail("Cần xác nhận đề DEMO.");tx.set(snapshot(d.id),b);tx.update(r,{status:"published",bankVersion:b.version,publishedAtMs:now(),publishedBy:email});audit(tx,"period.publish",d.id);});return {ok:true};}
    async function close(d){must(validId(d.id),"Mã kỳ không hợp lệ.");await runTransaction(db,async tx=>{const r=period(d.id),p=(await tx.get(r)).data();if(!p||!["draft","published"].includes(p.status))fail("Kỳ không thể đóng.");tx.update(r,{status:"closed",closedAtMs:now(),closedBy:email});audit(tx,"period.close",d.id);});return {ok:true};}
    async function adminResults(d){must(validId(d.id),"Mã kỳ không hợp lệ.");const q=await paged(col("assessmentPeriods",d.id,"results"),"email",d.cursor);return {results:q.rows.map(r=>r.data()),nextCursor:q.nextCursor};}
    async function allPages(c,field){
      const rows=[];let cursor=null;for(;;){const q=await paged(c,field,cursor);rows.push(...q.rows);if(!q.nextCursor)return rows;cursor=q.nextCursor;}
    }
    async function reportPeriods(){
      const rows=await allPages(col("assessmentPeriods"),"createdAtMs");
      return {periods:[{id:"onboarding-always",course:"onboarding",title:"Nhân viên mới — tổng hợp mọi lượt",status:"always"},...rows.map(r=>({id:r.id,...r.data()})).filter(p=>p.status!=="draft"&&p.id!=="onboarding-always")]};
    }
    async function assessmentReport(d){
      must(validId(d.id),"Chọn kỳ đánh giá.");
      const onboard=d.id==="onboarding-always";
      const roster=(await allPages(col("portalUsers"),"email")).map(r=>({email:r.id,...r.data()}));
      let ids=[d.id];
      if(onboard){const ps=await allPages(col("assessmentPeriods"),"createdAtMs");ids.push(...ps.filter(p=>p.data().course==="onboarding"&&p.id!==d.id).map(p=>p.id));}
      else{const p=await get(period(d.id));must(p&&p.status!=="draft","Kỳ đánh giá không tồn tại hoặc chưa công bố.");}
      const reports=new Map();
      for(const id of ids){
        const rows=await allPages(col("assessmentPeriods",id,"results"),"email");
        for(const row of rows){const r=row.data(),key=r.uid||row.id,old=reports.get(key);
          if(!old){reports.set(key,{...r,uid:key});continue;}
          const latest=(r.lastSubmittedAtMs||0)>(old.lastSubmittedAtMs||0)?r:old;
          reports.set(key,{...old,email:latest.email||old.email,name:latest.name||old.name,attemptCount:(old.attemptCount||0)+(r.attemptCount||0),passedCount:(old.passedCount||0)+(r.passedCount||0),bestPercent:Math.max(old.bestPercent||0,r.bestPercent||0),lastPercent:latest.lastPercent,lastSubmittedAtMs:latest.lastSubmittedAtMs});
        }
      }
      if(onboard){
        // Read completion markers (including migrated legacy passes), using default document ordering.
        let cursor=null;for(;;){
          const qs=cursor?[startAfter(cursor),limit(50)]:[limit(50)];
          const docs=(await getDocsFromServer(query(col("onboardingCompletion"),...qs))).docs;
          for(const row of docs){const v=row.data(),old=reports.get(row.id);
            if(old?.passedCount>0)continue;
            const proof=(await getDocFromServer(ref("assessmentResults",row.id,"attempts",v.attemptId))).data();
            if(proof?.course==="onboarding"&&proof.passed===true){
              if(old){reports.set(row.id,{...old,passedCount:Math.max(1,old.passedCount||0),bestPercent:Math.max(old.bestPercent||0,proof.percent||0),completionOnly:true});}
              else reports.set(row.id,{uid:row.id,attemptCount:null,passedCount:1,bestPercent:proof.percent,lastPercent:proof.percent,lastSubmittedAtMs:proof.submittedAtMs,completionOnly:true});
            }
          }
          if(docs.length<50)break;cursor=docs[docs.length-1];
        }
      }
      const rows=[],matched=new Set(),byEmail=new Map();
      for(const r of reports.values())if(r.email&&!byEmail.has(r.email.toLowerCase()))byEmail.set(r.email.toLowerCase(),r);
      for(const u of roster){const r=u.uid?reports.get(u.uid):byEmail.get(String(u.email).toLowerCase());if(r)matched.add(r.uid);
        rows.push({...r,email:u.email,name:u.name||r?.name||"",role:u.role,enabled:u.enabled,deleted:!!u.deletedAt,registered:!!u.uid,roster:true,outcome:r?.passedCount>0?"passed":r?"failed":"not-started"});}
      for(const [uid,r] of reports)if(!matched.has(uid))rows.push({...r,email:r.email||uid,name:r.name||"",role:"unknown",enabled:null,registered:true,roster:false,outcome:r.passedCount>0?"passed":"failed"});
      rows.sort((a,b)=>a.email.localeCompare(b.email));return {rows,asOf:now()};
    }
    // Reading acknowledgments are explicit self-attestations, not verified comprehension.
    const readingVersion="atv-study-2026-11-v1",readingKeys=["rules","general:0","general:1","general:2","general:3","general:4","general:5","onboard:0","onboard:1","onboard:2","onboard:3","onboard:4","technical:0","technical:1","technical:2","technical:3","technical:4","technical:5","technical:6","technical:7"];
    const readingRef=()=>ref("learningVersions",readingVersion,"readings",uid);
    function readingItems(raw){const out={};for(const key of readingKeys){const t=raw?.items?.[key];if(t&&typeof t.toMillis==="function")out[key]=t.toMillis();}return out;}
    async function getReadings(){return {version:readingVersion,items:readingItems(await get(readingRef()))};}
    async function confirmReading(d){
      must(d.version===readingVersion&&readingKeys.includes(d.item)&&d.confirmed===true,"Phiên bản hoặc xác nhận học liệu không hợp lệ.");
      const r=readingRef();
      await runTransaction(db,async tx=>{const old=(await tx.get(r)).data();if(old?.items?.[d.item])return;
        tx.set(r,{uid,email,items:{...(old?.items||{}),[d.item]:stamp()},lastItem:d.item,updatedAt:stamp()});
      });
      return getReadings();
    }
    async function readingReport(){
      const roster=(await allPages(col("portalUsers"),"email")).map(s=>({email:s.id,...s.data()}));
      const docs=await allPages(col("learningVersions",readingVersion,"readings"),"email"),byUid=new Map(docs.map(s=>[s.id,s.data()]));
      return {version:readingVersion,asOf:now(),rows:roster.map(u=>({email:u.email,name:u.name||"",role:u.role,enabled:u.enabled===true,deleted:!!u.deletedAt,registered:!!u.uid,items:readingItems(byUid.get(u.uid))}))};
    }
    async function practiceBank(d){
      must(["general","onboarding","technical"].includes(d.course),"Khóa ôn tập không hợp lệ.");
      let raw;try{raw=await get(bank(d.course));}catch(err){if(err?.code==="permission-denied")fail("Không có quyền đọc ngân hàng ôn tập. Admin cần Publish Firestore Rules v0.6.15.","permission-denied");throw err;}
      if(!raw)fail("Ngân hàng khóa này chưa được nhập. Vui lòng liên hệ Admin.");
      const b=versioned(raw);
      return {version:b.version,questions:b.questions.map(({prompt,options,correctIndex,topic,explanation})=>({prompt,options,correctIndex,topic:topic||"",explanation:explanation||""}))};
    }
    async function saveBank(d){must(["general","onboarding","technical"].includes(d.course),"Khóa không hợp lệ.");const b=versioned(d.bank);const tx=writeBatch(db);tx.set(bank(d.course),b);audit(tx,"bank.save",d.course);await tx.commit();return {version:b.version,count:b.questions.length};}
    async function importBanks(d){
      const bundle=d.bundle,keys=["general","onboarding","technical"];
      must(bundle?.schemaVersion===1&&bundle.banks&&keys.every(k=>Object.prototype.hasOwnProperty.call(bundle.banks,k))&&Object.keys(bundle.banks).length===3,"JSON phải chứa đủ ba ngân hàng General, Onboarding, Technical.");
      const validated=keys.map(k=>[k,versioned(bundle.banks[k])]);
      for(const [k,b] of validated){must(new TextEncoder().encode(JSON.stringify(b)).length<700000,"Ngân hàng "+k+" vượt kích thước cho phép.");const ids=b.questions.map(q=>q.id).filter(Boolean);must(new Set(ids).size===ids.length,"Mã câu bị trùng trong "+k);}
      const tx=writeBatch(db);for(const [k,b] of validated)tx.set(bank(k),b);audit(tx,"bank.import","general,onboarding,technical");await tx.commit();
      return {banks:Object.fromEntries(validated.map(([k,b])=>[k,{version:b.version,count:b.questions.length}]))};
    }
    const handlers={getPortalProfile:profile,getReadings,confirmReading,adminReadingReport:readingReport,getPracticeBank:practiceBank,getOnboardingStatus:onboardingStatus,listAssessmentPeriods:listPeriods,startAssessment:start,submitAssessment:submit,getAssessmentHistory:history,adminListUsers:listUsers,adminSaveUser:saveUser,adminDeleteUser:deleteUser,adminRestoreUser:restoreUser,adminSetAccessMode:setMode,adminListPeriods:listAdminPeriods,adminSavePeriod:savePeriod,adminPublishPeriod:publish,adminClosePeriod:close,adminPeriodResults:adminResults,adminReportPeriods:reportPeriods,adminAssessmentReport:assessmentReport,adminSaveBank:saveBank,adminImportBanks:importBanks};
    return {call:async(name,data={})=>{if(!handlers[name])fail("Chức năng không hợp lệ.");return handlers[name](data);}};
  }
  return {create};
})();
