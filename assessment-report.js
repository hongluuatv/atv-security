"use strict";
window.ATV_REPORT=(()=>{
  const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt=x=>Number.isFinite(x)?new Intl.DateTimeFormat("vi-VN",{dateStyle:"short",timeStyle:"short"}).format(new Date(x)):"—";
  const labels={passed:"Đã đạt",failed:"Chưa đạt (đã thi)","not-started":"Chưa nộp bài"};
  const courses={general:"ATTT định kỳ",onboarding:"Nhân viên mới",technical:"Kỹ thuật"};
  const admin=()=>window.ATV_MANAGEMENT.isAdmin();
  const call=(name,data={})=>window.ATV_ASSESSMENT.call(name,data);
  let state,epoch=0;
  function reset(){epoch++;state={periods:[],selected:"",rows:[],loaded:false,ready:false,busy:false,error:"",asOf:null,filter:"all",scope:"active",search:""};}
  reset();
  const paint=()=>{if(admin()&&document.getElementById("reportRoot"))render("assessment-results",false);};
  const scoped=()=>state.rows.filter(r=>state.scope==="all"||state.scope==="active"&&r.roster&&r.enabled===true&&r.role==="employee"||state.scope==="admins"&&r.role==="admin"||state.scope==="other"&&(!r.roster||r.enabled!==true&&r.role!=="admin"));
  const visible=()=>scoped().filter(r=>(state.filter==="all"||state.filter===r.outcome||state.filter==="pending"&&r.outcome!=="passed")&&[r.email,r.name].join(" ").toLowerCase().includes(state.search.trim().toLowerCase()));
  function page(){
    if(!admin())return head("QUẢN TRỊ","Không có quyền","Chỉ Admin được phép xem kết quả đánh giá.");
    const base=scoped(),passed=base.filter(r=>r.outcome==="passed").length,failed=base.filter(r=>r.outcome==="failed").length,none=base.filter(r=>r.outcome==="not-started").length;
    const metric=(label,count,color)=>'<div class="card"><div class="small">'+label+'</div><strong style="font-size:28px;color:'+color+'">'+(state.ready?count:"—")+'</strong></div>';
    const opt=(value,label,current)=>'<option value="'+esc(value)+'" '+(value===current?"selected":"")+'>'+esc(label)+'</option>';
    const rows=visible().map(r=>'<tr><td><strong>'+esc(r.name||r.email)+'</strong><div class="small">'+esc(r.name?r.email:"")+'</div></td><td>'+esc(!r.roster?"Ngoài danh sách":r.role==="admin"?"Admin":!r.enabled?"Đã khóa":r.registered?"Nhân viên":"Chưa đăng nhập")+'</td><td class="'+(r.outcome==="passed"?"qcorrect":r.outcome==="failed"?"qwrong":"small")+'">'+esc(labels[r.outcome])+'</td><td>'+esc(r.attemptCount??(r.outcome==="not-started"?0:"—"))+'</td><td>'+esc(r.bestPercent!=null?r.bestPercent+"%":"—")+'</td><td>'+esc(r.lastPercent!=null?r.lastPercent+"%":"—")+'</td><td>'+esc(fmt(r.lastSubmittedAtMs))+'</td></tr>').join("");
    return head("QUẢN TRỊ · ĐÁNH GIÁ","Kết quả đánh giá","Theo dõi người đã đạt, chưa đạt và chưa nộp bài theo từng kỳ.")+
      '<div id="reportRoot"><div class="card"><div class="field"><label for="reportPeriod">Chọn kỳ / khóa đánh giá</label><select id="reportPeriod" '+(state.busy?'disabled':'')+'>'+state.periods.map(p=>opt(p.id,p.title+" · "+(courses[p.course]||p.course)+(p.status==="always"?"":p.status==="closed"||p.closeAtMs<=Date.now()?" · Đã đóng":p.openAtMs>Date.now()?" · Sắp mở":" · Đang mở"),state.selected)).join("")+'</select></div><div class="actions"><button class="btn alt" id="reportRefresh" '+(state.busy?'disabled':'')+'>Làm mới</button><button class="btn alt" id="reportExport" '+(state.busy||!state.ready?'disabled':'')+'>Xuất CSV</button></div><p class="small">Mặc định: nhân viên đang hoạt động trong Portal. Chưa nộp bài không đồng nghĩa đã được phân công. Điểm do trình duyệt tự chấm, chưa xác minh.</p></div>'+
      (state.error?'<p class="notice" role="alert">'+esc(state.error)+'</p>':'')+(state.busy?'<p role="status">Đang tải toàn bộ danh sách và kết quả…</p>':'')+
      '<div class="grid" style="margin:16px 0;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">'+metric("Tổng người",base.length,"var(--ink)")+metric("Đã đạt",passed,"#087d55")+metric("Chưa đạt",failed,"#a43f21")+metric("Chưa nộp bài",none,"var(--muted)")+metric("Tỷ lệ đạt",base.length?Math.round(passed*100/base.length)+"%":"—","var(--blue)")+'</div>'+
      '<div class="card"><div class="twocol"><div class="field"><label for="reportScope">Đối tượng</label><select id="reportScope">'+[["active","Nhân viên đang hoạt động"],["all","Tất cả tài khoản và lịch sử"],["admins","Admin"],["other","Tài khoản khóa / ngoài danh sách"]].map(([v,t])=>opt(v,t,state.scope)).join("")+'</select></div><div class="field"><label for="reportFilter">Trạng thái</label><select id="reportFilter">'+[["all","Tất cả"],["passed","Đã đạt"],["failed","Chưa đạt (đã thi)"],["not-started","Chưa nộp bài"],["pending","Chưa hoàn thành"]].map(([v,t])=>opt(v,t,state.filter)).join("")+'</select></div></div><div class="field"><label for="reportSearch">Tìm theo tên hoặc email</label><input id="reportSearch" type="search" value="'+esc(state.search)+'" placeholder="Nhập tên / email"></div><p class="small">'+(state.ready?visible().length+" / "+base.length+" người · Cập nhật "+fmt(state.asOf):"Chưa tải dữ liệu")+'</p><div class="assessment-table"><table><thead><tr><th>Nhân viên</th><th>Tài khoản</th><th>Kết quả</th><th>Lượt</th><th>Cao nhất</th><th>Gần nhất</th><th>Nộp cuối</th></tr></thead><tbody>'+(rows||'<tr><td colspan="7">'+(state.ready?"Không có kết quả phù hợp.":"Chưa có dữ liệu.")+'</td></tr>')+'</tbody></table></div></div></div>';
  }
  async function load(refresh=false){
    if(!admin()||state.busy)return;const token=epoch;
    state.busy=true;state.ready=false;state.rows=[];state.error="";paint();
    try{
      if(refresh||!state.loaded){const d=await call("adminReportPeriods");if(token!==epoch)return;state.periods=d.periods||[];state.loaded=true;if(!state.periods.some(p=>p.id===state.selected))state.selected=state.periods.find(p=>p.status!=="always")?.id||state.periods[0]?.id||"";}
      if(state.selected){const d=await call("adminAssessmentReport",{id:state.selected});if(token!==epoch)return;state.rows=d.rows||[];state.asOf=d.asOf;state.ready=true;}
    }catch(err){if(token===epoch)state.error=err?.code==="permission-denied"?"Firestore từ chối đọc báo cáo. Kiểm tra quyền Admin và Rules v0.6.10 trở lên.":err?.message||"Không tải được báo cáo.";}
    finally{if(token===epoch){state.busy=false;paint();}}
  }
  function exportCsv(){
    if(!admin()||!state.ready)return;
    const cell=x=>{let s=String(x??"");if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const p=state.periods.find(p=>p.id===state.selected);
    const data=[["Kỳ đánh giá","Email","Họ tên","Vai trò","Trạng thái tài khoản","Kết quả","Số lượt","Điểm cao nhất (%)","Điểm gần nhất (%)","Nộp cuối","Nguồn điểm"],...visible().map(r=>[p?.title,r.email,r.name,r.role,r.enabled===true?"Hoạt động":r.enabled===false?"Khóa":"Ngoài danh sách",labels[r.outcome],r.attemptCount??(r.outcome==="not-started"?0:""),r.bestPercent,r.lastPercent,fmt(r.lastSubmittedAtMs),"client-unverified"])];
    const blob=new Blob(["\ufeff"+data.map(r=>r.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ATV-Ket-qua-"+state.selected+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function bind(){
    if(!admin()||!document.getElementById("reportRoot"))return;
    const $=id=>document.getElementById(id);
    $("reportPeriod").onchange=e=>{state.selected=e.target.value;load();};
    $("reportRefresh").onclick=()=>load(true);
    $("reportExport").onclick=exportCsv;
    $("reportScope").onchange=e=>{state.scope=e.target.value;paint();};
    $("reportFilter").onchange=e=>{state.filter=e.target.value;paint();};
    $("reportSearch").onchange=e=>{state.search=e.target.value;paint();};
    if(!state.loaded&&!state.busy&&!state.error)load();
  }
  function open(id){if(!admin())return;state.selected=id;state.ready=false;state.loaded=false;state.rows=[];state.error="";if(location.hash==="#assessment-results"){paint();if(!state.busy)load();}else location.hash="assessment-results";}
  return {page,bind,reset,open};
})();
