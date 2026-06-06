(function(){
  var theme=localStorage.getItem("sl-theme")||"wolf";
  var role="visitor";
  var cloudReady=false;
  document.body.setAttribute("data-theme",theme);
  document.querySelectorAll("[data-theme-set]").forEach(function(btn){
    btn.classList.toggle("active",btn.dataset.themeSet===theme);
    btn.addEventListener("click",function(){
      localStorage.setItem("sl-theme",btn.dataset.themeSet);
      document.body.setAttribute("data-theme",btn.dataset.themeSet);
      document.querySelectorAll("[data-theme-set]").forEach(function(x){x.classList.toggle("active",x===btn)});
    });
  });
  var read=function(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch(e){return fallback}};
  var write=function(key,value){localStorage.setItem(key,JSON.stringify(value))};
  var esc=function(value){return String(value||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})};
  var fmt=function(value){return value?new Date(value).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"未设定"};
  async function api(path,options){
    var res=await fetch(path,Object.assign({headers:{"content-type":"application/json"}},options||{}));
    var data=await res.json().catch(function(){return {}});
    if(!res.ok)throw new Error(data.error||"请求失败");
    return data;
  }
  function setFormEnabled(form,enabled){
    if(!form)return;
    form.querySelectorAll("input,textarea,select,button").forEach(function(x){x.disabled=!enabled});
    var note=form.querySelector(".notice");
    if(note)note.textContent=enabled?"管理员模式：数据将保存到云端。":"游客模式：可以查看云端数据，登录后才能修改。";
  }
  async function initSession(){
    try{
      var data=await api("/api/session");
      role=data.role||"visitor";
      cloudReady=!!data.cloudReady;
    }catch(e){
      role="local";
      cloudReady=false;
    }
    drawAuth();
  }
  function drawAuth(){
    var box=document.querySelector(".themebox");
    if(!box||box.querySelector(".auth"))return;
    var html='<div class="auth"><small id="roleText"></small><div class="auth-row"><input id="adminPassword" type="password" placeholder="管理员口令"><button id="loginBtn">登录</button></div><button id="logoutBtn">退出管理员</button></div>';
    box.insertAdjacentHTML("beforeend",html);
    var roleText=document.getElementById("roleText");
    var loginBtn=document.getElementById("loginBtn");
    var logoutBtn=document.getElementById("logoutBtn");
    function sync(){
      roleText.textContent=cloudReady?(role==="admin"?"ADMIN / 云端可写":"VISITOR / 云端只读"):"LOCAL / 等待 Cloudflare D1 绑定";
      logoutBtn.style.display=role==="admin"?"block":"none";
    }
    loginBtn.onclick=async function(){
      try{
        await api("/api/auth",{method:"POST",body:JSON.stringify({password:adminPassword.value})});
        adminPassword.value="";
        await initSession();
        location.reload();
      }catch(e){roleText.textContent=e.message}
    };
    logoutBtn.onclick=async function(){await api("/api/auth",{method:"POST",body:JSON.stringify({action:"logout"})}).catch(function(){});location.reload()};
    sync();
  }
  async function getCloud(path,fallbackKey,fallback){
    try{return (await api(path)).items||await api(path)}catch(e){return read(fallbackKey,fallback)}
  }
  function renderHome(){
    Promise.all([getCloud("/api/quotes","sl-quotes",[]),getCloud("/api/tasks","sl-tasks",[]),api("/api/status").catch(function(){return read("sl-status",null)})]).then(function(values){
      var qs=values[0]||[];
      var tasks=(values[1]||[]).filter(function(t){return !t.done});
      var status=values[2];
      var q=document.getElementById("homeQuotes"),t=document.getElementById("homeTasks"),s=document.getElementById("homeStatus");
      if(q)q.textContent=qs.length;
      if(t)t.textContent=tasks.length;
      if(s&&status)s.textContent=(status.now||"未记录")+" / "+(status.mode||"UNKNOWN");
    });
  }
  async function quotes(){
    var list=document.getElementById("quoteList"),form=document.getElementById("quoteForm");
    if(!list||!form)return;
    form.insertAdjacentHTML("afterbegin",'<div class="notice"></div>');
    setFormEnabled(form,role==="admin"||role==="local");
    async function draw(){
      var data=await getCloud("/api/quotes","sl-quotes",[]);
      list.innerHTML=data.length?data.map(function(x,i){return '<div class="item"><b>'+esc(x.text)+'</b><div class="meta">'+esc(x.source||"未标注来源")+' / '+esc(x.tag)+'</div>'+(role==="admin"||role==="local"?'<button class="danger" data-id="'+esc(x.id||i)+'">删除</button>':"")+'</div>'}).join(""):'<div class="item"><b>暂无记录</b><span class="meta">第一条会出现在这里</span></div>';
      list.querySelectorAll("[data-id]").forEach(function(btn){btn.onclick=async function(){if(role==="admin"){await api("/api/quotes?id="+encodeURIComponent(btn.dataset.id),{method:"DELETE"})}else{var d=read("sl-quotes",[]);d.splice(+btn.dataset.id,1);write("sl-quotes",d)}draw()}});
    }
    form.onsubmit=async function(e){e.preventDefault();var item={text:quoteText.value.trim(),source:quoteSource.value.trim(),tag:quoteTag.value.trim()||"未分类"};if(role==="admin"){await api("/api/quotes",{method:"POST",body:JSON.stringify(item)})}else{var data=read("sl-quotes",[]);data.unshift(item);write("sl-quotes",data)}form.reset();draw()};
    draw();
  }
  async function schedule(){
    var list=document.getElementById("taskList"),form=document.getElementById("taskForm");
    if(!list||!form)return;
    form.insertAdjacentHTML("afterbegin",'<div class="notice"></div>');
    setFormEnabled(form,role==="admin"||role==="local");
    async function draw(){
      var data=(await getCloud("/api/tasks","sl-tasks",[])).sort(function(a,b){return String(a.time).localeCompare(String(b.time))});
      list.innerHTML=data.length?data.map(function(x,i){var id=esc(x.id||i);return '<div class="item"><b>'+(x.done?"[完成] ":"")+esc(x.title)+'</b><div class="meta">'+fmt(x.time)+' / '+esc(x.level)+'</div><p>'+esc(x.note)+'</p>'+(role==="admin"||role==="local"?'<button data-done="'+id+'">'+(x.done?"撤回":"完成")+'</button> <button class="danger" data-del="'+id+'">删除</button>':"")+'</div>'}).join(""):'<div class="item"><b>没有待办</b><span class="meta">保持安静也是一种状态</span></div>';
      list.querySelectorAll("[data-done]").forEach(function(btn){btn.onclick=async function(){if(role==="admin"){await api("/api/tasks",{method:"PATCH",body:JSON.stringify({id:btn.dataset.done,toggle:true})})}else{var d=read("sl-tasks",[]);d[+btn.dataset.done].done=!d[+btn.dataset.done].done;write("sl-tasks",d)}draw()}});
      list.querySelectorAll("[data-del]").forEach(function(btn){btn.onclick=async function(){if(role==="admin"){await api("/api/tasks?id="+encodeURIComponent(btn.dataset.del),{method:"DELETE"})}else{var d=read("sl-tasks",[]);d.splice(+btn.dataset.del,1);write("sl-tasks",d)}draw()}});
    }
    form.onsubmit=async function(e){e.preventDefault();var item={title:taskTitle.value.trim(),time:taskTime.value,level:taskLevel.value,note:taskNote.value.trim(),done:false};if(role==="admin"){await api("/api/tasks",{method:"POST",body:JSON.stringify(item)})}else{var data=read("sl-tasks",[]);data.push(item);write("sl-tasks",data)}form.reset();draw()};
    draw();
  }
  async function status(){
    var form=document.getElementById("statusForm"),box=document.getElementById("statusBox");
    if(!form||!box)return;
    form.insertAdjacentHTML("afterbegin",'<div class="notice"></div>');
    setFormEnabled(form,role==="admin"||role==="local");
    async function draw(){
      var x=await api("/api/status").catch(function(){return read("sl-status",{now:"未记录",mode:"UNKNOWN",battery:50,focus:50,note:""})});
      box.innerHTML='<div class="matrix"><div class="item"><b>当前</b><span class="meta">'+esc(x.now)+'</span></div><div class="item"><b>模式</b><span class="meta">'+esc(x.mode)+'</span></div><div class="item"><b>电量</b><div class="meter" style="--value:'+esc(x.battery)+'%"><i></i></div></div><div class="item"><b>专注</b><div class="meter" style="--value:'+esc(x.focus)+'%"><i></i></div></div></div><p>'+esc(x.note)+'</p>';
    }
    form.onsubmit=async function(e){e.preventDefault();var item={now:phoneNow.value.trim(),mode:phoneMode.value,battery:phoneBattery.value,focus:phoneFocus.value,note:phoneNote.value.trim(),time:Date.now()};if(role==="admin"){await api("/api/status",{method:"POST",body:JSON.stringify(item)})}else{write("sl-status",item)}draw()};
    draw();
  }
  initSession().then(function(){renderHome();quotes();schedule();status()});
})();
