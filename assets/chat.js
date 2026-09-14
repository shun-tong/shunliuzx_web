(async()=>{
 const $=id=>document.getElementById(id),{api,esc}=Site;
 let messages=[],busy=false,retryMessage=null;
 const retry=document.createElement("button");retry.type="button";retry.textContent="重试上一条";retry.hidden=true;$("chatForm").after(retry);
 function draw(){
  $("countText").textContent=messages.length+" 条记录";
  $("chatLog").innerHTML=messages.map(msg=>'<div class="msg '+(msg.role==="user"?"user":"assistant")+'"><div class="bubble">'+esc(msg.content)+'</div></div>').join("")||"还没有对话";
  $("chatLog").scrollTop=$("chatLog").scrollHeight;
 }
 async function load(){
  const data=await api("/api/chat");messages=data.messages||[];
  $("characterName").value=data.settings.character_name||"Terminal";$("personaText").value=data.settings.persona||"";$("openingText").value=data.settings.opening||"";
  $("modelChip").textContent=data.model;$("readyText").textContent=data.deepseekReady?"线路就绪":"请配置 DeepSeek 密钥";draw();
 }
 const session=await api("/api/session");if(session.role!=="admin")return;
 $("chatLocked").style.display="none";$("chatApp").style.display="grid";
 await load().catch(e=>$("settingsNotice").textContent=e.message);
 $("personaForm").onsubmit=async e=>{e.preventDefault();await api("/api/chat",{method:"PATCH",body:JSON.stringify({character_name:$("characterName").value,persona:$("personaText").value,opening:$("openingText").value})});$("settingsNotice").textContent="人设已保存"};
 async function send(text,isRetry=false){
  if(busy||!text)return;busy=true;retry.hidden=true;retryMessage=text;
  const button=$("chatForm").querySelector("button");button.disabled=true;button.textContent="回复中…";$("clearChatBtn").disabled=true;
  $("settingsNotice").textContent="正在回复…";
  if(isRetry){
   try{messages=(await api("/api/chat")).messages||messages}catch{}
  }
  if(!isRetry||messages.at(-1)?.role!=="user"||messages.at(-1)?.content!==text)messages.push({role:"user",content:text});
  const partial={role:"assistant",content:""};messages.push(partial);draw();
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),100000);let completed=false;
  try{
   const response=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:text,retry:isRetry,stream:true}),signal:abort.signal});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||"发送失败")}
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";
   const consume=line=>{if(!line.trim())return;const data=JSON.parse(line);if(data.error)throw Error(data.error);if(data.delta){partial.content+=data.delta;draw()}if(data.done){messages=data.messages;completed=true;draw()}};
   while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop();lines.forEach(consume)}
   buffer+=decoder.decode();if(buffer.trim())consume(buffer);
   if(!completed)throw Error("连接中断，请重试");
   retryMessage=null;
   if($("messageText").value.trim()===text)$("messageText").value="";
   $("settingsNotice").textContent="回复已保存";
  }catch(e){$("settingsNotice").textContent=(e.name==="AbortError"?"回复超时":e.message)+"；可以重试，输入已保留";retry.hidden=false}
  finally{clearTimeout(timer);busy=false;button.disabled=false;button.textContent="发送";$("clearChatBtn").disabled=false}
 }
 $("chatForm").onsubmit=e=>{e.preventDefault();const text=$("messageText").value.trim();send(text,retryMessage===text).catch(e=>Site.toast(e.message))};
 retry.onclick=async()=>{await send(retryMessage,true)};
 $("messageText").addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();$("chatForm").requestSubmit()}});
 $("messageText").placeholder="输入消息（Ctrl + Enter 发送）";
 $("clearChatBtn").onclick=async()=>{if(busy)return;const result=await api("/api/chat",{method:"DELETE"});if(result.cancelled)return;messages=[];retryMessage=null;retry.hidden=true;draw();$("settingsNotice").textContent="对话已清空"};
})().catch(e=>Site.toast(e.message));
