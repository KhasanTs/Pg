const api=typeof browser!=='undefined'?browser:chrome;
function mime(kind,url){if(kind==='hls'||/\.m3u8(?:[?#]|$)/i.test(url)||/(?:[?&](?:format|type|mime)=m3u8)/i.test(url))return'application/vnd.apple.mpegurl';if(kind==='dash'||/\.mpd(?:[?#]|$)/i.test(url))return'application/dash+xml';if(/\.webm/i.test(url))return'video/webm';return'video/mp4'}
function openExternal(url,kind){
  if(!url)return;
  const direct=String(url);
  try{
    const u=new URL(direct);
    const target=u.host+u.pathname+(u.search||'');
    const scheme=u.protocol.replace(':','');
    const type=mime(kind,direct);
    const fallback=encodeURIComponent(direct);
    const intent=`intent://${target}#Intent;scheme=${scheme};action=android.intent.action.VIEW;type=${type};S.browser_fallback_url=${fallback};end`;
    api.tabs.create({url:intent}).catch(()=>api.tabs.create({url:direct}));
  }catch{api.tabs.create({url:direct}).catch(()=>{})}
}
function playUrlForVariant(v,r){
  if(!v)return r?.playableUrl||r?.finalUrl||'';
  return r?.hasSeparateAudio && r?.isMaster ? (r.finalUrl||r.playableUrl||v.url) : (v.url||r?.playableUrl||r?.finalUrl||'');
}
const btn=(t,c='')=>{const b=document.createElement('button');b.textContent=t;b.className=c;return b};
function fmtBytes(n){if(!n)return '';const u=['B','KB','MB','GB'];let i=0,x=n;while(x>=1024&&i<3){x/=1024;i++;}return `${x<10&&i>1?x.toFixed(1):Math.round(x)} ${u[i]}`}
async function analyze(d,item){
  const s=document.createElement('div');s.className='status';s.textContent='Анализируем поток и ищем объединённые видео+аудио варианты…';d.appendChild(s);
  try{
    const r=await api.runtime.sendMessage({type:'RESOLVE_STREAM',kind:item.kind,url:item.url});
    s.remove();
    if(r?.error){const e=document.createElement('div');e.className='status error';e.textContent='Ошибка: '+r.error;d.appendChild(e);return}
    const wrap=document.createElement('div');wrap.className='qualityWrap';
    const title=document.createElement('div');title.className='qualityTitle';
    title.textContent=(item.site||'Другой сайт')+' · '+(r.hasSeparateAudio?'звук подключён через master-поток':'видео + аудио');
    wrap.appendChild(title);
    const grid=document.createElement('div');grid.className='quality';
    const auto=btn('▶ Авто / до 4K','auto');
    auto.onclick=()=>openExternal(r.playableUrl||r.finalUrl||item.url,item.kind);grid.appendChild(auto);
    if(r.segmentTemplate){
      const note=document.createElement('div');note.className='status';
      note.textContent='DASH использует отдельные сегменты. Открывается общий MPD, а не отдельная аудио- или видеодорожка.';
      wrap.appendChild(note);wrap.appendChild(grid);d.appendChild(wrap);return;
    }
    const groups=new Map();
    for(const v of r.variants||[]){
      const h=Number(v.height||0);if(h>2160)continue;
      const k=h?`${h>=2160?'4K (2160p)':h+'p'}`:`${Math.round((v.bandwidth||0)/1000)} kbps`;
      const old=groups.get(k);if(!old||(v.bandwidth||0)>(old.bandwidth||0))groups.set(k,v)
    }
    const vals=[...groups.values()].sort((a,b)=>(b.height||0)-(a.height||0)||(b.bandwidth||0)-(a.bandwidth||0));
    for(const v of vals){
      const q=btn(`${v.height>=2160?'4K (2160p)':v.label}${v.sizeLabel?' · '+v.sizeLabel:''}${v.durationLabel?' · '+v.durationLabel:''}`);
      q.title='Открыть именно выбранное качество';
      if(v.short){q.textContent+=' ⚠ короткий';q.className+=' warn'}
      q.onclick=()=>openExternal(playUrlForVariant(v,r),item.kind);
      grid.appendChild(q)
    }
    if(!vals.length){const e=document.createElement('div');e.className='status error';e.textContent='Качества до 4K не найдены.';wrap.appendChild(e)}
    const note=document.createElement('div');note.className='status';
    note.textContent=r.hasSeparateAudio?'Для раздельного HLS-аудио выбранное качество открывается через master-плейлист: так сохраняется звук. Точный выбор уровня зависит от возможностей внешнего плеера.':'Показываются только реальные качества до 4K (2160p).';
    wrap.appendChild(grid);wrap.appendChild(note);d.appendChild(wrap)
  }catch(e){s.textContent='Ошибка: '+(e.message||e);s.className='status error'}
}
async function render(items){const list=document.getElementById('list');list.innerHTML='';const candidates=(items||[]).filter(x=>!x.adLike&&!x.segmentLike);if(!candidates.length){list.innerHTML='<div class=empty>Поток не найден.<br>Запустите именно видео, подождите 2–5 секунд и откройте меню снова.</div>';return}for(const item of candidates){const d=document.createElement('div');d.className='item';const label=item.kind==='hls'?'HLS':item.kind==='dash'?'DASH':'ФАЙЛ';d.innerHTML=`<div class=kind>${label}</div><div class=url></div><div class=meta></div><div class=actions></div>`;d.querySelector('.url').textContent=item.url;d.querySelector('.meta').textContent=`${item.site||'Другой сайт'} · ${item.source||'network'}${item.repeat>1?' · обнаружен '+item.repeat+' раз':''}`;const a=d.querySelector('.actions');if(item.kind==='hls'||item.kind==='dash'){const q=btn('▶ АНАЛИЗИРОВАТЬ');q.onclick=()=>analyze(d,item);a.appendChild(q)}else{const q=btn('▶ ПРОВЕРИТЬ РАЗМЕР');q.onclick=async()=>{q.textContent='Проверяем…';const r=await api.runtime.sendMessage({type:'PROBE_DIRECT',url:item.url});q.textContent=r.sizeLabel?`▶ ОТКРЫТЬ · ${r.sizeLabel}`:'▶ ОТКРЫТЬ';q.onclick=()=>openExternal(item.url,item.kind)};a.appendChild(q)}const c=btn('Копировать','secondary');c.onclick=async()=>{await navigator.clipboard.writeText(item.url);c.textContent='Скопировано'};a.appendChild(c);list.appendChild(d)}}
(async()=>{const tabs=await api.tabs.query({active:true,currentWindow:true});const id=tabs[0]?.id;document.getElementById('clear').onclick=async()=>{if(id!=null){await api.runtime.sendMessage({type:'CLEAR_FOUND',tabId:id});render([])}};if(id==null)return render([]);render(await api.runtime.sendMessage({type:'GET_FOUND',tabId:id}))})();
document.addEventListener('keydown',e=>{const bs=[...document.querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent!==null);if(!bs.length)return;let i=bs.indexOf(document.activeElement);if(i<0){bs[0].focus();return}if(e.key==='ArrowDown'||e.key==='ArrowRight'){e.preventDefault();bs[(i+1)%bs.length].focus()}else if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();bs[(i-1+bs.length)%bs.length].focus()}});
