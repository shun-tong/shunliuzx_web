(async()=>{
  const {api,esc,date,toast}=Site;
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const theme=localStorage.getItem("sl-theme")||"wolf";document.body.dataset.theme=theme;
  document.querySelectorAll("[data-theme-set]").forEach(button=>{
    button.classList.toggle("active",button.dataset.themeSet===theme);
    button.onclick=()=>{localStorage.setItem("sl-theme",button.dataset.themeSet);document.body.dataset.theme=button.dataset.themeSet;document.querySelectorAll("[data-theme-set]").forEach(b=>b.classList.toggle("active",b===button))};
  });
  const entries=[["/","控制台","HOME"],["/quotes/","名句档案","Q-01"],["/schedule/","日程备忘","S-02"],["/blog/","记录库","B-03"],["/review/","复习计划","R-04"],["/timetable/","课表","T-05"],["/chat/","对话","C-06"]];
  const current=location.pathname.replace(/index\.html$/,"");
  document.querySelectorAll(".nav").forEach(nav=>nav.innerHTML=entries.map(([href,label,code])=>'<a href="'+href+'"'+(current===href?' class="active" aria-current="page"':'')+'><b>'+label+'</b><span>'+code+'</span></a>').join(""));
  let session;
  try{session=await api("/api/session")}catch{session={role:"local",cloudReady:false}}
  const role=session.role,editable=role==="admin"||role==="local";
  const auth=document.querySelector(".themebox");
  if(auth){
    auth.insertAdjacentHTML("beforeend",'<div class="auth"><small>'+(role==="admin"?"管理员 · 云端保存":role==="local"?"离线模式 · 仅保存于此浏览器":"游客 · 登录后可修改")+'</small><form id="authForm"><div class="auth-row"><input id="adminPassword" type="password" autocomplete="current-password" placeholder="管理员口令" required><button>登录</button></div></form><button id="logoutBtn" type="button">退出管理员</button><button id="backupBtn" type="button">导出备份</button></div>');
    document.getElementById("authForm").hidden=role==="admin";
    document.getElementById("authForm").onsubmit=async e=>{e.preventDefault();await api("/api/auth",{method:"POST",body:JSON.stringify({password:document.getElementById("adminPassword").value})});location.reload()};
    document.getElementById("logoutBtn").hidden=role!=="admin";
    document.getElementById("logoutBtn").onclick=async()=>{await api("/api/auth",{method:"POST",body:JSON.stringify({action:"logout"})});location.reload()};
    const backup=document.getElementById("backupBtn");backup.hidden=!editable;
    backup.onclick=async()=>{
      const data=role==="admin"?await api("/api/backup"):{format:"shunliuzx-local-backup",version:1,exportedAt:new Date().toISOString(),tables:{tasks:read("sl-tasks",[]),quotes:read("sl-quotes",[]),status:read("sl-status",null)}};
      const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="shunliuzx-backup-"+date()+".json";link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast("备份已导出，请妥善保存其中的私人记录");
    };
  }
  const load=async(path,key)=>role==="local"?read(key,[]):(await api(path)).items||[];
  const fmt=value=>value?new Date(value).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"未设日期";
  if(document.body.dataset.page==="home"){
    const host=document.querySelector(".grid");
    host.insertAdjacentHTML("afterbegin",'<section class="panel span-12"><h3>今日概览</h3><div class="matrix"><div id="todayTasks">正在加载待办…</div><div id="nextExam">登录后查看考试安排</div><div id="nextCourse">登录后查看下一节课</div></div></section>');
    try{
      const [tasks,quotes]=await Promise.all([load("/api/tasks","sl-tasks"),load("/api/quotes","sl-quotes")]);
      document.getElementById("homeTasks").textContent=tasks.filter(x=>!x.done).length;
      document.getElementById("homeQuotes").textContent=quotes.length;
      const due=tasks.filter(x=>!x.done&&x.time&&x.time.slice(0,10)<=date()).sort((a,b)=>a.time.localeCompare(b.time));
      document.getElementById("todayTasks").innerHTML='<b>今天与逾期待办</b>'+ (due.length?due.slice(0,5).map(x=>'<p><a href="/schedule/">'+esc(x.title)+'</a> · '+esc(fmt(x.time))+'</p>').join(""):'<p>暂无到期待办</p>');
    }catch(error){document.getElementById("todayTasks").textContent=error.message}
    if(role==="admin"){
      api("/api/review").then(data=>{
        const next=data.subjects.filter(s=>s.exam_date>=date()).sort((a,b)=>a.exam_date.localeCompare(b.exam_date))[0];
        document.getElementById("nextExam").innerHTML='<b>最近考试</b><p>'+(next?'<a href="/review/">'+esc(next.name)+'</a> · '+esc(next.exam_date)+' · 剩余 '+Math.max(0,next.total_hours-next.spent_hours).toFixed(1)+' 小时':'暂无考试安排')+'</p>';
      }).catch(e=>document.getElementById("nextExam").textContent=e.message);
      api("/api/timetable").then(data=>{
        const start=localStorage.getItem("sl-term-start");const box=document.getElementById("nextCourse");
        if(!start){box.innerHTML='<a href="/timetable/">先设置本学期第一周周一</a>';return}
        const times=["08:00","08:55","10:00","10:55","12:10","13:05","14:00","14:55","15:50","16:55","17:50","19:20","20:15","21:10"];
        const now=new Date();let found;
        for(let offset=0;offset<210&&!found;offset++){
          const day=new Date();day.setDate(day.getDate()+offset);
          const week=Math.floor((Date.parse(date(day))-Date.parse(start))/604800000)+1;
          const matches=data.items.filter(x=>x.weekday===(day.getDay()||7)&&Site.weekMatches(x.weeks,week)).sort((a,b)=>a.start_section-b.start_section);
          for(const item of matches){const time=times[item.start_section-1];if(time&&new Date(date(day)+"T"+time)>now){found={item,when:date(day)+" "+time};break}}
        }
        box.innerHTML='<b>下一节课</b><p>'+(found?'<a href="/timetable/">'+esc(found.item.course_name)+'</a> · '+esc(found.when)+' · '+esc(found.item.location):'当前课表中没有后续课程')+'</p>';
      }).catch(e=>document.getElementById("nextCourse").textContent=e.message);
    }
  }
  if(document.body.dataset.page==="schedule"){
    const form=document.getElementById("taskForm"),list=document.getElementById("taskList");
    form.insertAdjacentHTML("afterbegin",'<div class="notice">'+(role==="local"?"离线模式：修改仅保存在此浏览器":editable?"保存到云端":"游客只读")+'</div>');
    list.insertAdjacentHTML("beforebegin",'<label><input id="showDone" type="checkbox" style="width:auto"> 显示已完成</label>');
    let editing=null;
    const cancel=document.createElement("button");cancel.type="button";cancel.textContent="取消编辑";cancel.hidden=true;form.append(cancel);
    function reset(){editing=null;form.reset();cancel.hidden=true;form.querySelector("button.primary").textContent="加入"}
    cancel.onclick=reset;
    if(!editable)form.querySelectorAll("input,textarea,select,button").forEach(el=>el.disabled=true);
    function localTasks(){
      const tasks=read("sl-tasks",[]);tasks.forEach(x=>{if(!x.id)x.id=crypto.randomUUID()});write("sl-tasks",tasks);return tasks;
    }
    async function draw(){
      const tasks=role==="local"?localTasks():await load("/api/tasks","sl-tasks");
      const showDone=document.getElementById("showDone").checked;
      const groups=[["逾期",x=>!x.done&&x.time&&x.time.slice(0,10)<date()],["今天",x=>!x.done&&x.time&&x.time.slice(0,10)===date()],["以后 / 未设日期",x=>!x.done&&(!x.time||x.time.slice(0,10)>date())],["已完成",x=>showDone&&x.done]];
      list.innerHTML=groups.map(([label,filter])=>{
        const items=tasks.filter(filter).sort((a,b)=>String(a.time||"9999").localeCompare(String(b.time||"9999")));
        return items.length?'<section><h3>'+label+'</h3>'+items.map(x=>'<div class="item"><b>'+esc(x.title)+'</b><p>'+esc(fmt(x.time))+' · '+esc(x.level)+'</p><p>'+esc(x.note)+'</p>'+(editable?'<button data-edit="'+esc(x.id)+'">编辑</button> <button data-done="'+esc(x.id)+'">'+(x.done?"设为未完成":"完成")+'</button> <button data-delete="'+esc(x.id)+'">删除</button>':"")+'</div>').join("")+'</section>':"";
      }).join("")||'<p>暂无待办</p>';
      list.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{
        const task=tasks.find(x=>String(x.id)===b.dataset.edit);editing=task.id;
        for(const [id,key] of [["taskTitle","title"],["taskTime","time"],["taskLevel","level"],["taskNote","note"]])document.getElementById(id).value=task[key]||"";
        cancel.hidden=false;form.querySelector("button.primary").textContent="保存修改";form.scrollIntoView({behavior:"smooth",block:"center"});
      });
      list.querySelectorAll("[data-done]").forEach(b=>b.onclick=async()=>{
        if(role==="admin")await api("/api/tasks",{method:"PATCH",body:JSON.stringify({id:b.dataset.done,toggle:true})});
        else{const data=localTasks();const x=data.find(x=>String(x.id)===b.dataset.done);if(x)x.done=!x.done;write("sl-tasks",data)}
        await draw();
      });
      list.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{
        if(role==="admin")await api("/api/tasks?id="+encodeURIComponent(b.dataset.delete),{method:"DELETE"});
        else{const data=localTasks(),item=data.find(x=>String(x.id)===b.dataset.delete);write("sl-tasks",data.filter(x=>String(x.id)!==b.dataset.delete));const box=toast("已删除，可撤销");const undo=document.createElement("button");undo.textContent="撤销";box.append(undo);undo.onclick=()=>{const latest=localTasks();if(item&&!latest.some(x=>x.id===item.id)){latest.push(item);write("sl-tasks",latest)}draw();toast("已恢复")}}
        await draw();
      });
    }
    document.getElementById("showDone").onchange=()=>draw().catch(e=>toast(e.message));
    form.onsubmit=async e=>{
      e.preventDefault();const item={title:document.getElementById("taskTitle").value.trim(),time:document.getElementById("taskTime").value,level:document.getElementById("taskLevel").value,note:document.getElementById("taskNote").value};
      if(!item.title)throw Error("请输入任务名称");
      if(role==="admin")await api("/api/tasks",{method:editing?"PATCH":"POST",body:JSON.stringify({...item,id:editing})});
      else{const data=localTasks();if(editing){const task=data.find(x=>x.id===editing);Object.assign(task,item)}else data.push({...item,id:crypto.randomUUID(),done:false});write("sl-tasks",data)}
      reset();await draw();
    };
    draw().catch(e=>toast(e.message));
  }
  if(document.body.dataset.page==="quotes"){
    const list=document.getElementById("quoteList"),form=document.getElementById("quoteForm");
    if(!editable)form.querySelectorAll("input,textarea,button").forEach(x=>x.disabled=true);
    async function draw(){
      const items=await load("/api/quotes","sl-quotes");
      list.innerHTML=items.map((x,i)=>'<div class="item"><b>'+esc(x.text)+'</b><p>'+esc(x.source)+' · '+esc(x.tag)+'</p>'+(editable?'<button data-id="'+esc(x.id??i)+'">删除</button>':"")+'</div>').join("")||"暂无记录";
      list.querySelectorAll("[data-id]").forEach(b=>b.onclick=async()=>{
        if(role==="admin")await api("/api/quotes?id="+b.dataset.id,{method:"DELETE"});
        else{const data=read("sl-quotes",[]),item=data.splice(+b.dataset.id,1)[0];write("sl-quotes",data);const box=toast("已删除，可撤销"),undo=document.createElement("button");undo.textContent="撤销";box.append(undo);undo.onclick=()=>{const latest=read("sl-quotes",[]);latest.unshift(item);write("sl-quotes",latest);draw();toast("已恢复")}}
        await draw();
      });
    }
    form.onsubmit=async e=>{e.preventDefault();const item={text:document.getElementById("quoteText").value.trim(),source:document.getElementById("quoteSource").value.trim(),tag:document.getElementById("quoteTag").value.trim()||"未分类"};if(role==="admin")await api("/api/quotes",{method:"POST",body:JSON.stringify(item)});else{const items=read("sl-quotes",[]);items.unshift(item);write("sl-quotes",items)}form.reset();await draw()};
    draw().catch(e=>toast(e.message));
  }
})().catch(error=>Site.toast(error.message));
