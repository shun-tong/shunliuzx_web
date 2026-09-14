(() => {
  const date = (value=new Date()) => {const d=new Date(value);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
  const esc = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const nativeFetch=window.fetch.bind(window);
  function toast(message) {
    let box=document.getElementById("siteFeedback");
    if(!box){box=document.createElement("div");box.id="siteFeedback";box.className="notice feedback";box.setAttribute("role","status");document.body.append(box)}
    clearTimeout(box.hideTimer);box.hidden=false;box.textContent=message;
    box.hideTimer=setTimeout(()=>{box.hidden=true},8000);return box;
  }
  window.fetch=async (resource,options={})=>{
    const url=new URL(typeof resource==="string"?resource:resource.url,location.href);
    if(url.origin===location.origin && options.method?.toUpperCase()==="DELETE"){
      if(!url.searchParams.has("id")){
        if(!confirm("确定清空全部记录？此操作无法撤销，建议先导出备份。"))return new Response('{"ok":true,"cancelled":true}',{status:200,headers:{"content-type":"application/json"}});
      }else{
        const cancelled=await new Promise(resolve=>{
          const box=document.createElement("div");box.className="notice undo";box.setAttribute("role","status");
          box.append(document.createTextNode("将在 7 秒后删除。"));
          const button=document.createElement("button");button.textContent="撤销";
          box.append(button);
          let stack=document.getElementById("undoStack");
          if(!stack){stack=document.createElement("div");stack.id="undoStack";stack.className="undo-stack";document.body.append(stack)}
          stack.append(box);
          const timer=setTimeout(()=>{box.remove();resolve(false)},7000);
          button.onclick=()=>{clearTimeout(timer);box.remove();toast("已撤销删除");resolve(true)};
        });
        if(cancelled)return new Response('{"ok":true,"cancelled":true}',{status:200,headers:{"content-type":"application/json"}});
      }
    }
    return nativeFetch(resource,options);
  };
  async function api(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(path,{...options,headers:{"content-type":"application/json",...options.headers},cache:"no-store",signal:options.signal||controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(data.error||"请求失败，请重试");error.data=data;throw error}
      return data;
    }catch(error){if(error.name==="AbortError")throw new Error("请求超时，请重试；你的输入已保留");throw error}
    finally{clearTimeout(timer)}
  }
  function weekMatches(weeks,week){
    return !weeks || String(weeks).split(/[，,]/).some(part=>{
      const range=part.match(/(\d+)(?:-(\d+))?/);if(!range)return false;
      return week>=+range[1]&&week<=+(range[2]||range[1])&&(!/单/.test(part)||week%2===1)&&(!/双/.test(part)||week%2===0);
    });
  }
  window.Site={date,esc,api,toast,weekMatches};
  // Run form handlers once, preserving input and restoring controls after errors.
  document.addEventListener("submit",event=>{
    const form=event.target;
    if(!form.onsubmit || form.id==="chatForm")return;
    event.preventDefault();event.stopPropagation();
    if(form.dataset.saving)return;
    const handler=form.onsubmit;form.dataset.saving="true";
    const buttons=[...form.querySelectorAll("button")],states=buttons.map(b=>b.disabled);
    buttons.forEach(b=>b.disabled=true);toast("正在保存…");
    Promise.resolve().then(()=>handler.call(form,event)).then(()=>toast("已保存")).catch(error=>toast(error.message||"保存失败，输入已保留")).finally(()=>{
      delete form.dataset.saving;buttons.forEach((b,i)=>b.disabled=states[i]);
    });
  },true);
  document.addEventListener("click",event=>{
    const button=event.target.closest("button");
    if(!button?.onclick || button.onclick.constructor.name!=="AsyncFunction")return;
    event.preventDefault();event.stopPropagation();
    if(button.disabled)return;
    button.disabled=true;
    Promise.resolve().then(()=>button.onclick.call(button,event)).catch(error=>toast(error.message||"操作失败，请重试")).finally(()=>button.disabled=false);
  },true);
})();
