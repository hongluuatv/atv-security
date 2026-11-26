"use strict";
window.ATV_ASSESSMENT=(()=>{
  const labels={general:"Đánh giá ATTT định kỳ",onboarding:"Đánh giá nhân viên mới",technical:"Đánh giá kỹ thuật định kỳ"};
  const safe=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let user=null,app=null,epoch=0,sdkPromise=null,fn=null;
  let state;
  function reset(){state={course:"general",periodId:"",periods:[],nowMs:0,session:null,answers:{},result:null,history:[],summary:{},cursor:null,loaded:false,busy:false,error:"",status:""};}
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
    if(code.endsWith("failed-precondition")||code.endsWith("invalid-argument")||code.endsWith("permission-denied")||code.endsWith("unauthenticated"))return err.message||"Không thể xử lý yêu cầu.";
    if(code.endsWith("not-found")||code.endsWith("unavailable")||code.endsWith("internal"))return "Chưa kết nối được dịch vụ đánh giá. Quản trị viên cần kiểm tra Firestore, Security Rules và Indexes. Có thể thử lại.";
    return "Không thể kết nối hoặc xử lý yêu cầu. Hãy kiểm tra mạng và thử lại.";
  }
  function paint(){if(document.querySelector("#assessmentRoot"))render("assessment",false);}
  function resultHTML(r){
    return '<div class="card assess-result"><div class="tag">LƯỢT '+safe(r.attemptNumber)+' · '+safe(r.periodTitle||labels[r.course])+'</div><h2>'+safe(r.percent)+'% <span class="'+(r.passed?'qcorrect':'qwrong')+'">'+(r.passed?'Đạt':'Chưa đạt')+'</span></h2><p>'+safe(r.correct)+'/'+safe(r.total)+' câu đúng · '+safe(when(r.submittedAtMs))+'</p><p class="small">Đã lưu trên Firebase · Điểm tự chấm (chưa xác minh) · Mã lượt: '+safe(r.id)+' · Đề: '+safe(r.bankVersion)+'</p>'+(r.periodId?'<button class="btn" id="assessmentRetake">Thi lại</button>':'')+'</div>';
  }
  function periodInfo(){const p=state.periods.find(x=>x.id===state.periodId);if(!p)return '<p>Chưa có kỳ đánh giá đang hoặc sắp mở.</p>';return '<p class="small">'+safe(p.questionCount)+' câu · đạt '+safe(p.passPercent)+'% · '+safe(p.durationMinutes)+' phút · '+safe(p.attemptCount)+'/'+(p.maxAttempts?safe(p.maxAttempts):'không giới hạn')+' lượt đã nộp<br>Mở '+safe(when(p.openAtMs))+' — đóng '+safe(when(p.closeAtMs))+' · '+(p.openAtMs>Date.now()?'Chưa mở':'Đang mở')+'</p>';}
  async function loadPeriods(){const data=await call("listAssessmentPeriods");state.periods=data.periods||[];state.nowMs=data.nowMs||Date.now();if(!state.periods.some(p=>p.id===state.periodId))state.periodId=state.periods[0]?.id||"";}
  function dashboard(){
    const stats=Object.entries(labels).map(([k,title])=>{
      const s=state.summary[k]||{};
      return '<div class="card"><div class="tag">'+safe(title)+'</div><div class="assess-metrics"><div><strong>'+safe(s.attemptCount??0)+'</strong><small>Lượt đã tải</small></div><div><strong>'+(s.attemptCount?safe(s.bestPercent)+"%":"—")+'</strong><small>Cao nhất (đã tải)</small></div><div><strong>'+safe(s.passedCount??0)+'</strong><small>Lượt đạt (đã tải)</small></div></div></div>';
    }).join("");
    const rows=state.history.map(r=>'<tr><td>'+safe(when(r.submittedAtMs))+'</td><td>'+safe(r.periodTitle||labels[r.course]||r.course)+'</td><td>'+safe(r.attemptNumber)+'</td><td>'+safe(r.correct)+'/'+safe(r.total)+'</td><td><strong>'+safe(r.percent)+'%</strong></td><td class="'+(r.passed?'qcorrect':'qwrong')+'">'+(r.passed?'Đạt':'Chưa đạt')+'</td></tr>').join("");
    return '<div class="twocol">'+stats+'</div><div class="card" style="margin-top:16px"><h2>Bắt đầu đánh giá</h2><p>Thống kê bên trên tính theo các lượt đã tải; chọn Tải thêm để xem lịch sử cũ. Chọn kỳ do quản trị viên công bố. Số câu, điểm đạt, thời gian và số lượt do kỳ quy định. Lựa chọn chưa nộp chỉ lưu trong phiên trang.</p><div class="field"><label for="assessmentCourse">Kỳ đánh giá</label><select id="assessmentCourse" '+(state.busy?'disabled':'')+'>'+state.periods.map(p=>'<option value="'+safe(p.id)+'" '+(state.periodId===p.id?'selected':'')+'>'+safe(p.title)+' · '+safe(labels[p.course])+'</option>').join("")+'</select></div><div id="assessmentPeriodInfo">'+periodInfo()+'</div><button class="btn" id="assessmentStart" '+(state.busy||!state.periodId?'disabled':'')+'>Bắt đầu / tiếp tục lượt thi</button></div><div class="card" style="margin-top:16px"><div class="sectionhead" style="margin-top:0"><h2>Lịch sử đánh giá</h2><button id="assessmentRefresh" class="btn alt" '+(state.busy?'disabled':'')+'>Làm mới</button></div>'+(!state.loaded?'<p>Chưa tải được lịch sử. Nhấn Làm mới để thử lại.</p>':rows?'<div class="assessment-table"><table><thead><tr><th>Thời điểm</th><th>Kỳ đánh giá</th><th>Lượt</th><th>Đúng</th><th>Điểm</th><th>Kết quả</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p>Chưa có lượt thi đã nộp.</p>')+(state.cursor?'<button id="assessmentMore" class="btn alt" style="margin-top:14px" '+(state.busy?'disabled':'')+'>Tải thêm</button>':'')+'</div>';
  }
  function exam(){
    const s=state.session,answered=Object.keys(state.answers).length;
    return '<div class="card"><h2>'+safe(s.periodTitle||labels[s.course])+'</h2><p>Đề '+safe(s.version)+' · Đạt từ '+safe(s.passPercent)+'% · Hết hạn '+safe(when(s.expiresAtMs))+' · Chọn một đáp án mỗi câu.</p><div class="progress"><span id="assessmentProgress" style="width:'+(answered/s.questions.length*100)+'%"></span></div><p id="assessmentCount" class="small">'+answered+'/'+s.questions.length+' câu đã trả lời</p></div><form id="assessmentForm">'+s.questions.map((q,i)=>'<article class="card" style="margin-top:12px"><div class="tag">CÂU '+(i+1)+' / '+s.questions.length+'</div><h3>'+safe(q.prompt)+'</h3>'+q.options.map((o,j)=>'<label class="option"><input type="radio" name="'+safe(q.id)+'" value="'+safe(o.id)+'" '+(state.answers[q.id]===o.id?'checked':'')+' '+(state.busy?'disabled':'')+' required>'+String.fromCharCode(65+j)+'. '+safe(o.label)+'</label>').join("")+'</article>').join("")+'<div class="actions"><button id="assessmentSubmit" class="btn" type="submit" '+(state.busy?'disabled':'')+'>Nộp bài và lưu điểm</button><button type="button" id="assessmentBack" class="btn alt" '+(state.busy?'disabled':'')+'>Về lịch sử</button></div></form>';
  }
  function page(){
    return head("ĐÁNH GIÁ & LỊCH SỬ","Đánh giá định kỳ","Thi theo khóa học, chấm điểm trên trình duyệt và lưu từng lượt thi trên Firebase.")+'<div id="assessmentRoot"><div class="notice">Điểm do trình duyệt tự chấm, không chống được can thiệp điểm hoặc xem đáp án. Không dùng làm bằng chứng thi chính thức nếu chưa có quy trình xác minh. Đề DEMO chỉ dùng thử.</div>'+(state.error?'<p class="notice" role="alert">'+safe(state.error)+'</p>':'')+(state.status?'<p class="small" role="status">'+safe(state.status)+'</p>':'')+(state.session?exam():(state.result?resultHTML(state.result):"")+dashboard())+'</div>';
  }
  async function run(status,operation){
    if(state.busy)return;const e=epoch;
    state.busy=true;state.error="";state.status=status;paint();
    try{await operation(e);}catch(err){if(e===epoch)state.error=errorText(err);}
    finally{if(e===epoch){state.busy=false;state.status="";paint();}}
  }
  async function loadHistory(more=false){
    const data=await call("getAssessmentHistory",{cursor:more?state.cursor:null});
    state.history=more?state.history.concat(data.attempts||[]):data.attempts||[];state.summary={};for(const r of state.history){const x=state.summary[r.course]||={attemptCount:0,bestPercent:0,passedCount:0};x.attemptCount++;x.bestPercent=Math.max(x.bestPercent,r.percent);if(r.passed)x.passedCount++;}state.cursor=data.nextCursor||null;state.loaded=true;
  }
  function bind(){
    const $=id=>document.getElementById(id);
    if(!user||!app)return;
    if($("assessmentCourse"))$("assessmentCourse").onchange=e=>{state.periodId=e.target.value;$("assessmentPeriodInfo").innerHTML=periodInfo();};
    if($("assessmentStart"))$("assessmentStart").onclick=()=>run("Đang tạo hoặc mở lại lượt thi…",async()=>{
      const s=await call("startAssessment",{periodId:state.periodId});
      if(state.session?.id!==s.id&&state.lastSessionId!==s.id)state.answers={};
      state.lastSessionId=s.id;state.session=s;state.periodId=s.periodId;state.result=null;window.scrollTo(0,0);
    });
    if($("assessmentRetake"))$("assessmentRetake").onclick=()=>run("Đang tạo lượt thi mới…",async()=>{
      const s=await call("startAssessment",{periodId:state.result.periodId});state.course=s.course;state.periodId=s.periodId;state.session=s;state.lastSessionId=s.id;state.answers={};state.result=null;window.scrollTo(0,0);
    });
    if($("assessmentRefresh"))$("assessmentRefresh").onclick=()=>run("Đang tải lịch sử…",async()=>{await loadPeriods();await loadHistory();});
    if($("assessmentMore"))$("assessmentMore").onclick=()=>run("Đang tải thêm…",()=>loadHistory(true));
    if($("assessmentForm")){
      $("assessmentForm").onchange=e=>{if(e.target.type==="radio"){state.answers[e.target.name]=e.target.value;const n=Object.keys(state.answers).length;const total=state.session.questions.length;$("assessmentCount").textContent=n+"/"+total+" câu đã trả lời";$("assessmentProgress").style.width=n/total*100+"%";}};
      $("assessmentForm").onsubmit=e=>{e.preventDefault();if(!e.currentTarget.reportValidity()||state.busy)return;const session=state.session,answers=session.questions.map(q=>({questionId:q.id,optionId:state.answers[q.id]}));if(answers.some(x=>!x.optionId))return;run("Đang chấm và lưu điểm…",async()=>{
        const result=await call("submitAssessment",{id:session.id,periodId:session.periodId,answers});
        state.result=result;state.session=null;state.answers={};state.lastSessionId=null;state.loaded=false;window.scrollTo(0,0);
        try{await loadPeriods();await loadHistory();}catch{state.error="Bài đã được lưu. Chưa tải được lịch sử; chọn Làm mới.";}
      });};
      $("assessmentBack").onclick=()=>{state.session=null;paint();};
    }
    if(!state.loaded&&!state.busy&&!state.session&&!state.error)run("Đang tải kỳ và lịch sử từ Firebase…",async()=>{await loadPeriods();await loadHistory();});
  }
  return {connect,disconnect,page,bind,call};
})();
