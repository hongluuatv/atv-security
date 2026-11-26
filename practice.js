"use strict";
window.ATV_PRACTICE=(()=>{
  const e=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const labels={general:"ATTT định kỳ",onboarding:"Nhân viên mới",technical:"Bảo mật kỹ thuật"};
  const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  let state,epoch=0;
  function reset(){epoch++;state={course:"general",count:10,bank:null,questions:[],answers:{},index:0,marked:[],wrongOnly:false,graded:false,busy:false,error:"",loaded:false};}
  reset();
  const paint=()=>{if(document.getElementById("practiceRoot"))render("quiz",false);};
  function choose(k){const course=k==="onboard"?"onboarding":k;if(!labels[course])return;epoch++;state={...state,course,count:10,bank:null,questions:[],answers:{},index:0,marked:[],wrongOnly:false,graded:false,busy:false,error:"",loaded:false};}
  async function load(start=false){
    if(state.busy)return;const token=epoch;
    state.busy=true;state.error="";paint();
    try{const b=await window.ATV_ASSESSMENT.call("getPracticeBank",{course:state.course});if(token!==epoch)return;state.bank=b;state.loaded=true;if(state.count!=="all")state.count=Math.min(Number(state.count),b.questions.length);
      if(start){const n=state.count==="all"?b.questions.length:Math.min(state.count,b.questions.length);
        const groups=new Map();for(const q of b.questions){const topic=q.topic||"Khác";if(!groups.has(topic))groups.set(topic,[]);groups.get(topic).push(q);}
        const pools=shuffle([...groups.values()]).map(shuffle),selected=[];while(selected.length<n&&pools.some(p=>p.length)){for(const p of pools){if(p.length&&selected.length<n)selected.push(p.pop());}}
        state.questions=shuffle(selected).map(q=>({...q,choices:shuffle(q.options.map((label,i)=>({label,correct:i===q.correctIndex})))}));state.answers={};state.index=0;state.marked=[];state.wrongOnly=false;state.graded=false;
      }
    }catch(err){if(token===epoch){state.error=err?.message||"Không tải được ngân hàng câu hỏi.";state.loaded=true;}}
    finally{if(token===epoch){state.busy=false;paint();}}
  }
  function page(){
    const b=state.bank,qs=state.questions,disabled=state.busy?"disabled":"",answered=Object.keys(state.answers).length;
    const correct=qs.filter((q,i)=>q.choices[state.answers[i]]?.correct).length;
    const options=b?[...new Set([5,10,15,20,30,40,50,b.questions.length].filter(n=>n<=b.questions.length))].sort((a,b)=>a-b):[10];
    if(b&&state.count!=="all"&&!options.includes(state.count))options.push(state.count);
    const settings='<div class="card"><div class="twocol"><div class="field"><label for="practiceCourse">Khóa ôn tập</label><select id="practiceCourse" '+disabled+'>'+Object.entries(labels).map(([k,t])=>'<option value="'+e(k)+'" '+(k===state.course?"selected":"")+'>'+e(t)+'</option>').join("")+'</select></div><div class="field"><label for="practiceCount">Số câu mỗi lượt</label><select id="practiceCount" '+(state.busy||!b?"disabled":"")+'>'+options.map(n=>'<option value="'+n+'" '+(state.count===n?"selected":"")+'>'+n+' câu</option>').join("")+'<option value="all" '+(state.count==="all"?"selected":"")+'>Toàn bộ ngân hàng</option></select></div></div><p class="small">'+(b?e(b.version)+" · "+b.questions.length+" câu trong ngân hàng":"Chưa tải ngân hàng")+'</p><div class="actions"><button id="practiceStart" class="btn" '+(state.busy||!b?"disabled":"")+'>'+(qs.length?"Tạo lượt ôn mới":"Bắt đầu ôn tập")+'</button><button id="practiceRefresh" class="btn alt" '+disabled+'>Tải lại ngân hàng</button></div></div>';
    const score=state.graded?'<div class="card" style="margin-top:16px"><div class="tag">KẾT QUẢ ÔN TẬP</div><h2>'+correct+'/'+qs.length+' câu đúng · '+Math.round(correct*100/qs.length)+'%</h2><p>Không ghi nhận vào kết quả đánh giá chính thức. Xem giải thích bên dưới và ôn lại các câu chưa đúng.</p></div>':"";
    const wrong=qs.map((q,i)=>i).filter(i=>!qs[i].choices[state.answers[i]]?.correct),indices=state.graded&&state.wrongOnly?wrong:qs.map((_,i)=>i);
    if(indices.length&&!indices.includes(state.index))state.index=indices[0];
    const i=state.index,q=qs[i],pos=indices.indexOf(i);
    const numbers=indices.map(j=>'<button type="button" data-practice-jump="'+j+'" class="question-number '+(state.graded?(qs[j].choices[state.answers[j]]?.correct?"answered":"incorrect"):state.answers[j]!=null?"answered":"")+' '+(state.marked.includes(j)?"marked ":"")+(i===j?"current":"")+'" '+(i===j?'aria-current="step"':'')+'>'+ (j+1)+(state.marked.includes(j)?' ⚑':'')+'</button>').join("");
    const form=qs.length?'<div class="exam-toolbar card"><div><h2>Ôn tập kiến thức</h2><p class="small">Không giới hạn thời gian</p></div><div class="exam-progress"><div class="progress"><span id="practiceProgress" style="width:'+answered/qs.length*100+'%"></span></div><p class="small" id="practiceAnswered">'+answered+'/'+qs.length+' câu đã trả lời</p></div></div>'+(indices.length?'<div class="quiz-workspace"><form id="practiceForm" class="card question-card" novalidate><div class="tag">CÂU '+(i+1)+' / '+qs.length+(q.topic?' · <span data-bank-text>'+e(q.topic)+'</span>':"")+'</div><h2 tabindex="-1" id="practiceQuestionTitle" data-bank-text>'+e(q.prompt)+'</h2><fieldset class="answer-fieldset"><legend class="sr-only">Chọn một đáp án mỗi câu.</legend>'+q.choices.map((a,j)=>'<label class="option '+(state.graded&&a.correct?"qcorrect":state.graded&&state.answers[i]===j?"qwrong":"")+'"><input type="radio" name="q'+i+'" value="'+j+'" '+(state.answers[i]===j?"checked":"")+' '+(state.graded||state.busy?"disabled":"")+'><span class="option-letter">'+String.fromCharCode(65+j)+'</span><span data-bank-text>'+e(a.label)+'</span>'+(state.graded&&a.correct?" ✓":"")+'</label>').join("")+'</fieldset>'+(state.graded?'<div class="example"><strong class="'+(q.choices[state.answers[i]]?.correct?"qcorrect":"qwrong")+'">'+(q.choices[state.answers[i]]?.correct?"Đúng":"Chưa đúng")+'</strong><p>Đáp án đúng: <span data-bank-text>'+e(q.choices.find(a=>a.correct)?.label)+'</span></p><p '+(q.explanation?'data-bank-text':'')+'>'+e(q.explanation||"Chưa có giải thích trong ngân hàng.")+'</p></div>':'<label class="review-toggle"><input id="practiceMark" type="checkbox" '+(state.marked.includes(i)?"checked":"")+' '+disabled+'> Đánh dấu xem lại</label>')+'<div class="question-actions"><button id="practicePrev" type="button" class="btn alt" '+(pos<=0||state.busy?"disabled":"")+'>← Câu trước</button><button id="practiceNext" type="button" class="btn" '+(pos>=indices.length-1||state.busy?"disabled":"")+'>Câu tiếp →</button></div></form><aside class="card question-sidebar"><h3>Danh sách câu hỏi</h3><div class="question-grid">'+numbers+'</div><p class="question-legend"><span class="legend-answered"></span> '+(state.graded?"Đúng":"Đã trả lời")+'</p><p class="question-legend">'+(state.graded?"✕ Chưa đúng":"⚑ Xem lại")+'</p>'+(state.graded?'<button type="button" class="btn alt full" id="practiceWrong" '+(wrong.length?"":"disabled")+'>'+(state.wrongOnly?"Xem tất cả câu":"Xem lại câu sai")+'</button><button class="btn full" type="button" id="practiceRetry" '+disabled+'>Tạo lượt ôn mới</button>':'<button type="submit" form="practiceForm" class="btn full" '+disabled+'>Chấm điểm và xem giải thích</button>')+'</aside></div>':''):"";
    return head("TỰ KIỂM TRA","Ôn tập kiến thức","Luyện tập từ ngân hàng câu hỏi của từng khóa, không giới hạn số lượt.")+'<div id="practiceRoot"><p class="small">Ôn tập và đánh giá dùng chung ngân hàng. Điểm ôn tập chỉ hiển thị trong phiên này, không lưu vào lịch sử thi.</p><p class="small">Nội dung câu hỏi và giải thích hiển thị theo ngôn ngữ của ngân hàng đã nhập.</p>'+settings+(state.error?'<p class="notice" role="alert">'+e(state.error)+'</p>':"")+(state.busy?'<p role="status">Đang tải ngân hàng câu hỏi…</p>':"")+score+form+'</div>';
  }
  function bind(){
    if(!document.getElementById("practiceRoot"))return;const $=id=>document.getElementById(id);
    $("practiceCourse").onchange=ev=>{if(state.questions.length&&!state.graded&&!window.ATV_I18N.confirm("Đổi khóa sẽ bỏ lượt ôn chưa hoàn thành. Tiếp tục?")){ev.target.value=state.course;return;}choose(ev.target.value);load();};
    $("practiceCount").onchange=ev=>{state.count=ev.target.value==="all"?"all":Number(ev.target.value);};
    $("practiceStart").onclick=()=>{if(state.questions.length&&!state.graded&&!window.ATV_I18N.confirm("Tạo lượt mới sẽ bỏ lựa chọn chưa chấm. Tiếp tục?"))return;load(true);};
    $("practiceRefresh").onclick=()=>load();
    if($("practiceRetry"))$("practiceRetry").onclick=()=>load(true);
    if($("practiceForm")){
      const indices=state.questions.map((_,i)=>i).filter(i=>!state.graded||!state.wrongOnly||!state.questions[i].choices[state.answers[i]]?.correct);
      const jump=i=>{state.index=i;paint();document.getElementById("practiceQuestionTitle")?.focus({preventScroll:true});};
      $("practicePrev").onclick=()=>jump(indices[Math.max(0,indices.indexOf(state.index)-1)]);
      $("practiceNext").onclick=()=>jump(indices[Math.min(indices.length-1,indices.indexOf(state.index)+1)]);
      document.querySelectorAll("[data-practice-jump]").forEach(b=>b.onclick=()=>jump(Number(b.dataset.practiceJump)));
      if($("practiceMark"))$("practiceMark").onchange=ev=>{state.marked=ev.target.checked?[...new Set([...state.marked,state.index])]:state.marked.filter(i=>i!==state.index);paint();};
      if($("practiceWrong"))$("practiceWrong").onclick=()=>{state.wrongOnly=!state.wrongOnly;paint();};
      $("practiceForm").onchange=ev=>{if(ev.target.type!=="radio"||state.graded)return;state.answers[Number(ev.target.name.slice(1))]=Number(ev.target.value);const n=Object.keys(state.answers).length;$("practiceAnswered").textContent=n+"/"+state.questions.length+" câu đã trả lời";$("practiceProgress").style.width=n/state.questions.length*100+"%";document.querySelector('[data-practice-jump="'+state.index+'"]')?.classList.add("answered");};
      $("practiceForm").onsubmit=ev=>{ev.preventDefault();if(state.busy||state.graded)return;const missing=state.questions.findIndex((_,i)=>state.answers[i]==null);if(missing!==-1){jump(missing);window.alert(window.ATV_I18N.tr("Vui lòng trả lời tất cả câu hỏi trước khi nộp."));return;}state.graded=true;state.index=0;paint();window.scrollTo(0,0);};
    }
    if(!state.loaded&&!state.busy)load();
  }
  return {page,bind,choose,reset};
})();
