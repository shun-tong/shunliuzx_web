(function(){
  var theme=localStorage.getItem("sl-theme")||"wolf";
  document.body.setAttribute("data-theme",theme);
  document.querySelectorAll("[data-theme-set]").forEach(function(btn){
    btn.classList.toggle("active",btn.dataset.themeSet===theme);
    btn.addEventListener("click",function(){
      localStorage.setItem("sl-theme",btn.dataset.themeSet);
      document.body.setAttribute("data-theme",btn.dataset.themeSet);
      document.querySelectorAll("[data-theme-set]").forEach(function(x){x.classList.toggle("active",x===btn)});
    });
  });
  var page=document.body.dataset.page;
  var read=function(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch(e){return fallback}};
  var write=function(key,value){localStorage.setItem(key,JSON.stringify(value))};
  var esc=function(value){return String(value||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})};
  var fmt=function(value){return value?new Date(value).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"未设定"};
  function renderHome(){
    var qs=read("sl-quotes",[]);
    var tasks=read("sl-tasks",[]).filter(function(t){return !t.done});
    var status=read("sl-status",null);
    var q=document.getElementById("homeQuotes"),t=document.getElementById("homeTasks"),s=document.getElementById("homeStatus");
    if(q)q.textContent=qs.length;
    if(t)t.textContent=tasks.length;
    if(s&&status)s.textContent=status.now+" / "+status.mode;
  }
  function quotes(){
    var list=document.getElementById("quoteList"),form=document.getElementById("quoteForm");
    if(!list||!form)return;
    function draw(){
      var data=read("sl-quotes",[]);
      list.innerHTML=data.length?data.map(function(x,i){return '<div class="item"><b>'+esc(x.text)+'</b><div class="meta">'+esc(x.source||"未标注来源")+' / '+esc(x.tag)+'</div><button class="danger" data-del="'+i+'">删除</button></div>'}).join(""):'<div class="item"><b>暂无记录</b><span class="meta">第一条会出现在这里</span></div>';
      list.querySelectorAll("[data-del]").forEach(function(btn){btn.onclick=function(){data.splice(+btn.dataset.del,1);write("sl-quotes",data);draw()}});
    }
    form.onsubmit=function(e){e.preventDefault();var data=read("sl-quotes",[]);data.unshift({text:quoteText.value.trim(),source:quoteSource.value.trim(),tag:quoteTag.value.trim()||"未分类"});write("sl-quotes",data);form.reset();draw()};
    draw();
  }
  function schedule(){
    var list=document.getElementById("taskList"),form=document.getElementById("taskForm");
    if(!list||!form)return;
    function draw(){
      var data=read("sl-tasks",[]).sort(function(a,b){return String(a.time).localeCompare(String(b.time))});
      list.innerHTML=data.length?data.map(function(x,i){return '<div class="item"><b>'+(x.done?"[完成] ":"")+esc(x.title)+'</b><div class="meta">'+fmt(x.time)+' / '+esc(x.level)+'</div><p>'+esc(x.note)+'</p><button data-done="'+i+'">'+(x.done?"撤回":"完成")+'</button> <button class="danger" data-del="'+i+'">删除</button></div>'}).join(""):'<div class="item"><b>没有待办</b><span class="meta">保持安静也是一种状态</span></div>';
      list.querySelectorAll("[data-done]").forEach(function(btn){btn.onclick=function(){data[+btn.dataset.done].done=!data[+btn.dataset.done].done;write("sl-tasks",data);draw()}});
      list.querySelectorAll("[data-del]").forEach(function(btn){btn.onclick=function(){data.splice(+btn.dataset.del,1);write("sl-tasks",data);draw()}});
    }
    form.onsubmit=function(e){e.preventDefault();var data=read("sl-tasks",[]);data.push({title:taskTitle.value.trim(),time:taskTime.value,level:taskLevel.value,note:taskNote.value.trim(),done:false});write("sl-tasks",data);form.reset();draw()};
    draw();
  }
  function status(){
    var form=document.getElementById("statusForm"),box=document.getElementById("statusBox");
    if(!form||!box)return;
    function draw(){
      var x=read("sl-status",{now:"未记录",mode:"UNKNOWN",battery:50,focus:50,note:""});
      box.innerHTML='<div class="matrix"><div class="item"><b>当前</b><span class="meta">'+esc(x.now)+'</span></div><div class="item"><b>模式</b><span class="meta">'+esc(x.mode)+'</span></div><div class="item"><b>电量</b><div class="meter" style="--value:'+esc(x.battery)+'%"><i></i></div></div><div class="item"><b>专注</b><div class="meter" style="--value:'+esc(x.focus)+'%"><i></i></div></div></div><p>'+esc(x.note)+'</p>';
    }
    form.onsubmit=function(e){e.preventDefault();write("sl-status",{now:phoneNow.value.trim(),mode:phoneMode.value,battery:phoneBattery.value,focus:phoneFocus.value,note:phoneNote.value.trim(),time:Date.now()});draw()};
    draw();
  }
  renderHome();quotes();schedule();status();
})();
