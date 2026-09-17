
(()=>{
 if(window.__MRU32)return; window.__MRU32=true;
 let formats=new Map(), button;
 const SRC="MRU32";
 function q(v){
   if(v==null)return null;
   if(typeof v==="number"&&v>100)return v;
   const s=String(v);
   let m=s.match(/^(\d{3,4})p$/i); if(m)return +m[1];
   m=s.match(/(\d{3,4})p/i); if(m)return +m[1];
   m=s.match(/(?:height|video_height|h)[=_:-]?(\d{3,4})/i); return m?+m[1]:null;
 }
 function add(o){
   if(!o||typeof o!=="object")return;
   let u=o.url||o.src||o.videoUrl||o.file||o.downloadUrl;
   if(typeof u!=="string")return;
   try{u=new URL(u,location.href).href}catch(e){return}
   if(!/^https?:/i.test(u))return;
   const quality=q(o.key)||q(o.quality)||q(o.name)||q(o.height)||q(u);
   if(!quality)return;
   const kind=/\.m3u8/i.test(u)?"HLS":/\.mpd/i.test(u)?"DASH":"MP4";
   const old=formats.get(quality);
   // Prefer an MP4 URL when several entries have the same height.
   if(!old||old.kind!=="MP4"&&kind==="MP4") formats.set(quality,{quality,url:u,kind});
 }
 function walk(x,depth=0,seen=new Set()){
   if(!x||depth>12||typeof x!=="object"||seen.has(x))return;
   seen.add(x);
   if(Array.isArray(x)){for(const v of x)walk(v,depth+1,seen);return}
   // Mail.ru's documented/known structure: videos[] entries with url + key.
   if(Array.isArray(x.videos)) x.videos.forEach(v=>add(v));
   if(Array.isArray(x.formats)) x.formats.forEach(v=>add(v));
   if(Array.isArray(x.streams)) x.streams.forEach(v=>add(v));
   for(const k of Object.keys(x)) {
     const v=x[k];
     if(k==="videos"||k==="formats"||k==="streams") continue;
     walk(v,depth+1,seen);
   }
 }
 function parseScript(s){
   const t=s.textContent||"";
   if(!t)return;
   // Exact page-config is the primary source.
   if(s.classList&&s.classList.contains("sp-video__page-config")){
     try{walk(JSON.parse(t))}catch(e){}
     return;
   }
   // Search JSON-looking script blocks without fragile greedy regex.
   if(!/metaUrl|metadataUrl|videos|formats|streams/i.test(t))return;
   try{walk(JSON.parse(t))}catch(e){}
   const urls=[...t.matchAll(/https?:\/\/[^"'\\\s<>]+/g)];
   for(const m of urls){
     const u=m[0].replace(/\\u0026/g,"&").replace(/\\\//g,"/");
     add({url:u,key:(t.slice(Math.max(0,m.index-100),m.index+100).match(/(\d{3,4}p)/i)||[])[1]});
   }
 }
 function findMetaUrls(){
   const out=new Set();
   document.querySelectorAll("script.sp-video__page-config").forEach(s=>{
     try{
       const j=JSON.parse(s.textContent);
       const u=j.metaUrl||j.video?.metaUrl;
       if(typeof u==="string")out.add(new URL(u,location.href).href);
       walk(j);
     }catch(e){}
   });
   // Fallback: locate quoted metaUrl values.
   for(const s of document.scripts){
     const t=s.textContent||"";
     if(!/metaUrl|metadataUrl/i.test(t))continue;
     const re=/(?:metaUrl|metadataUrl)\s*["']?\s*:\s*["']([^"']+)["']/g;
     let m; while((m=re.exec(t)))try{out.add(new URL(m[1],location.href).href)}catch(e){}
   }
   const html=document.documentElement?.outerHTML||"";
   const id=html.match(/(?:video\/embed|\/\+\/video\/meta)\/(\d+)/i);
   if(id)out.add("https://my.mail.ru/+/video/meta/"+id[1]);
   return [...out];
 }
 async function getMeta(){
   const urls=findMetaUrls();
   for(const u of urls){
     try{
       const r=await fetch(u,{credentials:"include",cache:"no-store"});
       if(!r.ok)continue;
       const j=await r.json();
       walk(j);
     }catch(e){}
   }
 }
 function scan(){
   document.querySelectorAll("script").forEach(parseScript);
   document.querySelectorAll("video,source").forEach(e=>{
     const u=e.currentSrc||e.src; if(u)add({url:u,height:e.getAttribute("height")});
   });
 }
 async function show(){
   scan(); await getMeta();
   try{
     const r=await chrome.runtime.sendMessage({type:"GET_NETWORK"});
     (r?.items||[]).forEach(x=>add(x));
   }catch(e){}
   render();
 }
 function launch(url){
   try{
     const u=new URL(url);
     location.href=`intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.slice(0,-1)};action=android.intent.action.VIEW;type=video/*;end`;
   }catch(e){location.href=url}
 }
 function render(){
   const old=document.getElementById("mru32panel"); if(old)old.remove();
   const p=document.createElement("div"); p.id="mru32panel";
   Object.assign(p.style,{position:"fixed",left:"10px",right:"10px",bottom:"110px",zIndex:2147483647,
    background:"#fff",color:"#111",borderRadius:"16px",padding:"15px",boxShadow:"0 5px 28px #0008",
    fontFamily:"Arial,sans-serif",maxHeight:"70vh",overflow:"auto"});
   const h=document.createElement("div");h.textContent="Выберите качество";
   Object.assign(h.style,{fontSize:"18px",fontWeight:"700",marginBottom:"10px"});p.appendChild(h);
   const a=[...formats.values()].sort((x,y)=>y.quality-x.quality);
   if(!a.length){
     const t=document.createElement("div");t.textContent="Качество пока не найдено. Запусти видео на 2–3 секунды и нажми кнопку ещё раз.";
     t.style.lineHeight="1.4";p.appendChild(t);
   } else a.forEach(x=>{
     const b=document.createElement("button");b.textContent=`${x.quality}p`;
     Object.assign(b.style,{display:"block",width:"100%",padding:"12px",margin:"6px 0",
       borderRadius:"10px",border:"1px solid #ccc",background:"#f4f4f4",fontSize:"16px"});
     b.onclick=()=>launch(x.url);p.appendChild(b);
   });
   const c=document.createElement("button");c.textContent="Закрыть";
   Object.assign(c.style,{width:"100%",padding:"10px",marginTop:"7px",border:0,borderRadius:"10px"});
   c.onclick=()=>p.remove();p.appendChild(c);document.body.appendChild(p);
 }
 function boot(){
   button=document.createElement("button");button.textContent="▶ Внешний плеер";
   Object.assign(button.style,{position:"fixed",right:"12px",bottom:"65px",zIndex:2147483647,
     padding:"11px 15px",border:0,borderRadius:"22px",background:"#111",color:"#fff",fontSize:"14px"});
   button.onclick=show;document.body.appendChild(button);
   scan();
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
