"use strict";
function atvAssessmentCourse(course,route){
  const labels={general:"Đánh giá ATTT định kỳ",onboarding:"Đánh giá nhân viên mới",technical:"Đánh giá kỹ thuật định kỳ"};
  const safe=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let user=null,app=null,epoch=0,sdkPromise=null,fn=null;
  let state,ticker=null;
  function reset(){clearInterval(ticker);ticker=null;state={questionIndex:0,marked:[],course,onboarding:null,periodId:"",periods:[],nowMs:0,session:null,answers:{},result:null,history:[],summary:{},cursor:null,loaded:false,busy:false,error:"",status:""};}
  reset();
  function connect(u,firebaseApp){epoch++;user=u;app=firebaseApp;fn=null;sdkPromise=null;reset();}
  function disconnect(){epoch++;user=null;app=null;fn=null;sdkPromise=null;reset();}
  async function call(name,data={}){
    if(!user||!app)throw Error("Cần đăng nhập.");
    const e=epoch,currentApp=app;
    if(!sdkPromise)sdkPromise=window.ATV_FIRESTORE.create(user,currentApp).catch(err=>{if(epoch===e)sdkPromise=null;throw err;});
    const adapter=await sdkPromise;
    if(e!==epoch)throw Error("Phiên đã thay đổi.");
    const response=await adapter.call(name,data);
    if(e!==epoch)throw Error("Phiên đã thay đổi.");
    return response;
  }
  const when=ms=>Number.isFinite(ms)?new Intl.DateTimeFormat("vi-VN",{dateStyle:"short",timeStyle:"short"}).format(new Date(ms)):"—";
  function errorText(err){
    const code=String(err?.code||"");
    if(code.endsWith("failed-precondition")&&/requires an index|create_composite/i.test(err.message||""))return "Không tải được dữ liệu do cấu hình chỉ mục Firestore. Vui lòng thông báo quản trị viên hoặc tải lại trang.";
    if(code.endsWith("failed-precondition")||code.endsWith("invalid-argument")||code.endsWith("permission-denied")||code.endsWith("unauthenticated"))return err.message||"Không thể xử lý yêu cầu.";
    if(code.endsWith("not-found")||code.endsWith("unavailable")||code.endsWith("internal"))return "Chưa kết nối được dịch vụ đánh giá. Quản trị viên cần kiểm tra Firestore, Security Rules và Indexes. Có thể thử lại.";
    return "Không thể kết nối hoặc xử lý yêu cầu. Hãy kiểm tra mạng và thử lại.";
  }
  function paint(){if(document.querySelector("#assessmentRoot")?.dataset.route===route)render(route,false);}
  function resultHTML(r){
    return '<div class="card assess-result"><div class="tag">LƯỢT '+safe(r.attemptNumber)+' · '+safe(r.periodTitle||labels[r.course])+'</div><h2>'+safe(r.percent)+'% <span class="'+(r.passed?'qcorrect':'qwrong')+'">'+(r.passed?'Đạt':'Chưa đạt')+'</span></h2><p>'+safe(r.correct)+'/'+safe(r.total)+' câu đúng · '+safe(when(r.submittedAtMs))+'</p><p class="small">Đã lưu trên Firebase · Điểm tự chấm (chưa xác minh) · Mã lượt: '+safe(r.id)+' · Đề: '+safe(r.bankVersion)+'</p>'+(r.periodId&&course!=="onboarding"?'<button class="btn" id="assessmentRetake">Thi lại</button>':'')+'</div>';
  }
  function periodInfo(){const p=state.periods.find(x=>x.id===state.periodId);if(!p)return '<p>Chưa có kỳ đánh giá đang hoặc sắp mở.</p>';return '<p class="small">'+safe(p.questionCount)+' câu · đạt '+safe(p.passPercent)+'% · '+safe(p.durationMinutes)+' phút · '+safe(p.attemptCount)+'/'+(p.maxAttempts?safe(p.maxAttempts):'không giới hạn')+' lượt đã nộp<br>Mở '+safe(when(p.openAtMs))+' — đóng '+safe(when(p.closeAtMs))+' · '+(p.openAtMs>Date.now()?'Chưa mở':'Đang mở')+'</p>';}
  async function loadPeriods(){if(course==="onboarding"){state.onboarding=await call("getOnboardingStatus");state.periodId=state.onboarding.completed?"":"onboarding-always";return;}const data=await call("listAssessmentPeriods",{course});state.periods=(data.periods||[]).filter(p=>p.course===course);state.nowMs=data.nowMs||Date.now();if(!state.periods.some(p=>p.id===state.periodId))state.periodId=state.periods[0]?.id||"";}
  function dashboard(){
    const stats=[[course,labels[course]]].map(([k,title])=>{
      const s=state.summary[k]||{};
      return '<div class="card"><div class="tag">'+safe(title)+'</div><div class="assess-metrics"><div><strong>'+safe(s.attemptCount??0)+'</strong><small>Lượt đã tải</small></div><div><strong>'+(s.attemptCount?safe(s.bestPercent)+"%":"—")+'</strong><small>Cao nhất (đã tải)</small></div><div><strong>'+safe(s.passedCount??0)+'</strong><small>Lượt đạt (đã tải)</small></div></div></div>';
    }).join("");
    const rows=state.history.filter(r=>r.course===course).map(r=>'<tr><td>'+safe(when(r.submittedAtMs))+'</td><td>'+safe(r.periodTitle||labels[r.course]||r.course)+'</td><td>'+safe(r.attemptNumber)+'</td><td>'+safe(r.correct)+'/'+safe(r.total)+'</td><td><strong>'+safe(r.percent)+'%</strong></td><td class="'+(r.passed?'qcorrect':'qwrong')+'">'+(r.passed?'Đạt':'Chưa đạt')+'</td></tr>').join("");
    const onboardingCard=course==="onboarding"?(state.onboarding?.completed?'<div class="card" style="margin-top:16px"><h2 class="qcorrect">✓ Đã hoàn thành đánh giá nhân viên mới</h2><p>Bạn đã đạt yêu cầu. Không cần làm lại.</p>'+(state.onboarding.attempt?'<p><strong>'+safe(state.onboarding.attempt.percent)+'%</strong> · '+safe(when(state.onboarding.attempt.submittedAtMs))+'</p>':"")+'</div>':'<div class="card" style="margin-top:16px"><h2>Đánh giá nhân viên mới</h2><p>15 câu · 30 phút · đạt từ 80% (12/15 câu). Thi lại đến khi đạt, không cần chờ kỳ đánh giá.</p>'+(state.onboarding&&!state.onboarding.ready?'<p>Ngân hàng đề chưa sẵn sàng. Liên hệ Admin.</p>':"")+'<button class="btn" id="assessmentStart" '+(!state.onboarding?.ready||state.busy?'disabled':'')+'>'+(state.history.length?"Thi lại / tiếp tục":"Bắt đầu đánh giá")+'</button></div>'):null;
    return '<div class="twocol">'+stats+'</div>'+(onboardingCard??'<div class="card" style="margin-top:16px"><h2>Bắt đầu đánh giá</h2><p>Thống kê bên trên tính theo các lượt đã tải; chọn Tải thêm để xem lịch sử cũ. Chọn kỳ do quản trị viên công bố. Số câu, điểm đạt, thời gian và số lượt do kỳ quy định. Lựa chọn chưa nộp được lưu tạm trên tab này.</p><div class="field"><label for="assessmentCourse">Kỳ đánh giá</label><select id="assessmentCourse" '+(state.busy?'disabled':'')+'>'+state.periods.map(p=>'<option value="'+safe(p.id)+'" '+(state.periodId===p.id?'selected':'')+'>'+safe(p.title)+' · '+safe(labels[p.course])+'</option>').join("")+'</select></div><div id="assessmentPeriodInfo">'+periodInfo()+'</div><button class="btn" id="assessmentStart" '+(!canStart()?'disabled':'')+'>Bắt đầu / tiếp tục lượt thi</button></div>')+'<div class="card" style="margin-top:16px"><div class="sectionhead" style="margin-top:0"><h2>Lịch sử đánh giá</h2><button id="assessmentRefresh" class="btn alt" '+(state.busy?'disabled':'')+'>Làm mới</button></div>'+(!state.loaded?'<p>Chưa tải được lịch sử. Nhấn Làm mới để thử lại.</p>':rows?'<div class="assessment-table"><table><thead><tr><th>Thời điểm</th><th>Kỳ đánh giá</th><th>Lượt</th><th>Đúng</th><th>Điểm</th><th>Kết quả</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p>Chưa có lượt thi đã nộp.</p>')+(state.cursor?'<button id="assessmentMore" class="btn alt" style="margin-top:14px" '+(state.busy?'disabled':'')+'>Tải thêm</button>':'')+'</div>';
  }
  const draftKey=s=>"atv-assessment-draft-v1:"+user.uid+":"+s.id;
  function saveDraft(){if(!user||!state.session)return;try{sessionStorage.setItem(draftKey(state.session),JSON.stringify({answers:state.answers,index:state.questionIndex,marked:state.marked}));}catch{}}
  function restoreDraft(s){let draft={};try{draft=JSON.parse(sessionStorage.getItem(draftKey(s))||"{}")||{};}catch{}state.answers={};for(const q of s.questions){const answer=draft.answers?.[q.id];if(q.options.some(o=>o.id===answer))state.answers[q.id]=answer;}state.questionIndex=Math.min(s.questions.length-1,Math.max(0,Number.isInteger(draft.index)?draft.index:0));state.marked=Array.isArray(draft.marked)?draft.marked.filter(x=>s.questions.some(q=>q.id===x)):[];}
  function clearDraft(s){try{sessionStorage.removeItem(draftKey(s));}catch{}}
  function navigateQuestion(i){state.questionIndex=Math.max(0,Math.min(state.session.questions.length-1,i));saveDraft();paint();document.getElementById("examQuestionTitle")?.focus({preventScroll:true});}
  function tick(){const el=document.getElementById("examClock");if(!el||document.querySelector("#assessmentRoot")?.dataset.route!==route||!state.session){clearInterval(ticker);ticker=null;return;}const left=Math.max(0,Math.ceil((state.session.expiresAtMs-Date.now())/1000));el.textContent=[Math.floor(left/3600),Math.floor(left%3600/60),left%60].map(x=>String(x).padStart(2,"0")).join(":");el.parentElement.classList.toggle("exam-urgent",left<=300);if(left===0){document.getElementById("assessmentSubmit").disabled=true;document.getElementById("examExpired").hidden=false;document.querySelectorAll("#assessmentForm input").forEach(x=>x.disabled=true);clearInterval(ticker);ticker=null;}}
  function active(){return !!state.session&&state.session.expiresAtMs>Date.now();}
  function canStart(){if(state.busy)return false;if(course==="onboarding")return !!state.onboarding?.ready&&!state.onboarding.completed;const p=state.periods.find(x=>x.id===state.periodId);return !!p&&p.openAtMs<=Date.now()&&p.closeAtMs>Date.now()&&(!p.maxAttempts||p.attemptCount<p.maxAttempts);}
  function exam(){
    const s=state.session,i=state.questionIndex,q=s.questions[i],n=s.questions.length,answered=s.questions.filter(x=>state.answers[x.id]).length,disabled=state.busy||s.expiresAtMs<=Date.now()?"disabled":"";
    const numbers=s.questions.map((x,j)=>'<button type="button" data-exam-jump="'+j+'" class="question-number '+(state.answers[x.id]?"answered ":"")+(state.marked.includes(x.id)?"marked ":"")+(i===j?"current":"")+'" '+(i===j?'aria-current="step"':'')+' aria-label="Câu '+(j+1)+(state.answers[x.id]?' · Đã trả lời':' · Chưa trả lời')+(state.marked.includes(x.id)?' · Xem lại':'')+'">'+(j+1)+(state.marked.includes(x.id)?'<span aria-hidden="true">⚑</span>':'')+'</button>').join("");
    return '<div class="exam-toolbar card"><div><div class="tag">ĐÁNH GIÁ</div><h2>'+safe(s.periodTitle||labels[s.course])+'</h2><p class="small">Đạt từ '+safe(s.passPercent)+'% · Đề '+safe(s.version)+'</p></div><div class="exam-clock"><span class="small">Thời gian còn lại</span><strong id="examClock" role="timer">--:--:--</strong></div><div class="exam-progress"><div class="progress"><span id="assessmentProgress" style="width:'+answered/n*100+'%"></span></div><p class="small" id="assessmentCount">'+answered+'/'+n+' câu đã trả lời</p></div></div><p class="notice" id="examExpired" hidden>Hết giờ làm bài. Không thể nộp lượt này; quay lại lịch sử để bắt đầu lượt mới nếu còn quyền.</p><div class="quiz-workspace"><form id="assessmentForm" class="card question-card" novalidate><div class="tag">CÂU '+(i+1)+' / '+n+'</div><h2 id="examQuestionTitle" tabindex="-1" data-bank-text>'+safe(q.prompt)+'</h2><fieldset class="answer-fieldset"><legend class="sr-only">Chọn một đáp án mỗi câu.</legend>'+q.options.map((o,j)=>'<label class="option"><input type="radio" name="'+safe(q.id)+'" value="'+safe(o.id)+'" '+(state.answers[q.id]===o.id?'checked':'')+' '+disabled+'><span class="option-letter">'+String.fromCharCode(65+j)+'</span><span data-bank-text>'+safe(o.label)+'</span></label>').join("")+'</fieldset><label class="review-toggle"><input id="examMark" type="checkbox" '+(state.marked.includes(q.id)?'checked':'')+' '+disabled+'> Đánh dấu xem lại</label><div class="question-actions"><button type="button" class="btn alt" id="examPrev" '+(i===0||state.busy?'disabled':'')+'>← Câu trước</button><button type="button" class="btn" id="examNext" '+(i===n-1||state.busy?'disabled':'')+'>Câu tiếp →</button></div></form><aside class="card question-sidebar"><h3>Danh sách câu hỏi</h3><div class="question-grid">'+numbers+'</div><p class="question-legend"><span class="legend-answered"></span> Đã trả lời</p><p class="question-legend"><span class="legend-empty"></span> Chưa trả lời</p><p class="question-legend">⚑ Xem lại</p><button type="submit" form="assessmentForm" class="btn full" id="assessmentSubmit" '+disabled+'>Nộp bài và lưu điểm</button><button type="button" id="assessmentBack" class="btn alt full" '+(state.busy?'disabled':'')+'>Về lịch sử</button><p class="small">Lựa chọn được lưu tạm trên tab này. Thời gian vẫn chạy khi rời bài.</p></aside></div><p class="small">Nội dung câu hỏi và giải thích hiển thị theo ngôn ngữ của ngân hàng đã nhập.</p>';
  }
  function page(){
    return head("ĐÁNH GIÁ & LỊCH SỬ",labels[course],course==="onboarding"?"Hoàn thành một lần; thi lại nếu chưa đạt.":"Tham gia kỳ đánh giá, xem điểm và lịch sử các lượt thi.")+'<div id="assessmentRoot" data-route="'+route+'"><div class="notice">Kết quả được lưu tự động sau khi nộp bài. Điểm tự chấm cần được xác minh nếu sử dụng làm bằng chứng chính thức.</div>'+(state.error?'<p class="notice" role="alert">'+safe(state.error)+'</p>':'')+(state.status?'<p class="small" role="status">'+safe(state.status)+'</p>':'')+(state.session?exam():(state.result?resultHTML(state.result):"")+dashboard())+'</div>';
  }
  async function run(status,operation){
    if(state.busy)return;const e=epoch;
    state.busy=true;state.error="";state.status=status;paint();
    try{await operation(e);}catch(err){if(e===epoch)state.error=errorText(err);}
    finally{if(e===epoch){state.busy=false;state.status="";paint();}}
  }
  async function loadHistory(more=false){
    const data=await call("getAssessmentHistory",{course,cursor:more?state.cursor:null});
    const attempts=(data.attempts||[]).filter(r=>r.course===course);state.history=more?state.history.concat(attempts):attempts;state.summary={};for(const r of state.history){const x=state.summary[r.course]||={attemptCount:0,bestPercent:0,passedCount:0};x.attemptCount++;x.bestPercent=Math.max(x.bestPercent,r.percent);if(r.passed)x.passedCount++;}state.cursor=data.nextCursor||null;state.loaded=true;
  }
  function bind(){
    const $=id=>document.getElementById(id);
    if(!user||!app)return;
    if($("assessmentCourse"))$("assessmentCourse").onchange=e=>{state.periodId=e.target.value;paint();};
    if($("assessmentStart"))$("assessmentStart").onclick=()=>run("Đang tạo hoặc mở lại lượt thi…",async()=>{
      const s=await call("startAssessment",{periodId:state.periodId});
      if(state.session?.id!==s.id&&state.lastSessionId!==s.id)state.answers={};
      state.lastSessionId=s.id;state.session=s;restoreDraft(s);state.periodId=s.periodId;state.result=null;if(document.querySelector("#assessmentRoot")?.dataset.route===route)window.scrollTo(0,0);
    });
    if($("assessmentRetake"))$("assessmentRetake").onclick=()=>run("Đang tạo lượt thi mới…",async()=>{
      const s=await call("startAssessment",{periodId:state.result.periodId});state.periodId=s.periodId;state.session=s;state.lastSessionId=s.id;restoreDraft(s);state.result=null;window.scrollTo(0,0);
    });
    if($("assessmentRefresh"))$("assessmentRefresh").onclick=()=>run("Đang tải lịch sử…",async()=>{await loadPeriods();await loadHistory();});
    if($("assessmentMore"))$("assessmentMore").onclick=()=>run("Đang tải thêm…",()=>loadHistory(true));
    if($("assessmentForm")){
      clearInterval(ticker);tick();if(state.session.expiresAtMs>Date.now())ticker=setInterval(tick,1000);
      $("examPrev").onclick=()=>navigateQuestion(state.questionIndex-1);$("examNext").onclick=()=>navigateQuestion(state.questionIndex+1);
      document.querySelectorAll("[data-exam-jump]").forEach(btn=>btn.onclick=()=>navigateQuestion(Number(btn.dataset.examJump)));
      $("examMark").onchange=ev=>{const id=state.session.questions[state.questionIndex].id;state.marked=ev.target.checked?[...new Set([...state.marked,id])]:state.marked.filter(x=>x!==id);saveDraft();paint();};
      $("assessmentForm").onchange=ev=>{if(ev.target.type==="radio"){state.answers[ev.target.name]=ev.target.value;saveDraft();const n=state.session.questions.filter(q=>state.answers[q.id]).length;$("assessmentCount").textContent=n+"/"+state.session.questions.length+" câu đã trả lời";$("assessmentProgress").style.width=n/state.session.questions.length*100+"%";document.querySelector('[data-exam-jump="'+state.questionIndex+'"]')?.classList.add("answered");}};
      $("assessmentForm").onsubmit=ev=>{ev.preventDefault();if(state.busy||!active())return;const session=state.session,answers=session.questions.map(q=>({questionId:q.id,optionId:state.answers[q.id]}));const missing=answers.findIndex(x=>!x.optionId);if(missing!==-1){navigateQuestion(missing);window.alert(window.ATV_I18N.tr("Vui lòng trả lời tất cả câu hỏi trước khi nộp."));return;}if(!window.ATV_I18N.confirm("Xác nhận nộp bài? Bạn không thể sửa đáp án sau khi nộp."))return;run("Đang chấm và lưu điểm…",async()=>{
        const result=await call("submitAssessment",{id:session.id,periodId:session.periodId,answers});
        clearDraft(session);state.result=result;if(course==="onboarding"&&result.passed)state.onboarding={completed:true,attempt:result};state.session=null;state.answers={};state.lastSessionId=null;state.loaded=false;window.scrollTo(0,0);
        try{await loadPeriods();await loadHistory();}catch{state.error="Bài đã được lưu. Chưa tải được lịch sử; chọn Làm mới.";}
      });};
      $("assessmentBack").onclick=()=>{if(active()&&!window.ATV_I18N.confirm("Rời bài thi? Thời gian vẫn tiếp tục chạy."))return;saveDraft();state.session=null;clearInterval(ticker);ticker=null;paint();};
    }
    if(!state.loaded&&!state.busy&&!state.session&&!state.error)run("Đang tải kỳ và lịch sử từ Firebase…",async()=>{await loadPeriods();await loadHistory();});
  }
  return {connect,disconnect,page,bind,call,active,saveDraft};
}

window.ATV_ASSESSMENT=(()=>{
  const modules={assessment:atvAssessmentCourse("general","assessment"),"assessment-onboarding":atvAssessmentCourse("onboarding","assessment-onboarding"),"assessment-technical":atvAssessmentCourse("technical","assessment-technical")};
  const choose=route=>modules[route]||modules.assessment;
  return {connect(user,app){Object.values(modules).forEach(m=>m.connect(user,app));},disconnect(){Object.values(modules).forEach(m=>m.disconnect());},page(route){return choose(route).page();},bind(route){choose(route).bind();},call(name,data){return modules.assessment.call(name,data);},hasActive(route){return !!modules[route]?.active();},saveDraft(route){modules[route]?.saveDraft();}};
})();
