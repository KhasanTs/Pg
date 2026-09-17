const api = chrome;
const seen = new Set();
let host=null, latest=null, dismissed=false;
const isHttp=u=>typeof u==='string'&&/^https?:\/\//i.test(u);
const isManifest=u=>isHttp(u)&&(/\.m3u8(?:[?#]|$)|\.mpd(?:[?#]|$)/i.test(u)||/(?:^|[?&])(format|type|mime|content_type)=(?:m3u8|mpd|application(?:%2F|\/)vnd(?:%2E|\.)apple(?:%2F|\/)mpegurl|application(?:%2F|\/)dash(?:%2B|\+)xml)/i.test(u));
const siteHost=location.hostname.toLowerCase();
const isKnownSite=/rutube\.ru$|rutube\.video$|(^|\.)ok\.ru$|(^|\.)odnoklassniki\.ru$|(^|\.)mail\.ru$|(^|\.)my\.mail\.ru$|(^|\.)cloud\.mail\.ru$/i.test(siteHost);
const isDirect=u=>isHttp(u)&&/\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(u);
function send(u,source='page',contentType=''){
  if(!isHttp(u))return;
  if(!(isManifest(u)||isDirect(u)||/^video\//i.test(contentType)||/mpegurl|dash\+xml/i.test(contentType)))return;
  let abs;try{abs=new URL(u,location.href).href}catch{return;}
  if(seen.has(abs))return;seen.add(abs);
  api.runtime.sendMessage({type:'FOUND_VIDEO_TAGS',items:[{url:abs,source,contentType}]}).catch(()=>{});
}

function decodeCandidate(s){
  try{let x=String(s).replace(/\\u0026/g,'&').replace(/\\u003d/g,'=').replace(/\\\//g,'/'); x=JSON.parse('\"'+x.replace(/\"/g,'\\\"')+'\"'); return x}catch{return String(s)}
}
function scanTextForStreams(text){
  if(!text)return;
  const pats=[
    /https?:\\\/\\\/[^\"'<>\\\s]+(?:\.m3u8|\.mpd)[^\"'<>\\\s]*/ig,
    /https?:\\\/\\\/[^\"'<>\\\s]+(?:videoPlayer_(?:hls|dash)|videoplayback|playback|manifest|playlist)[^\"'<>\\\s]*/ig,
    /(?:\"|')((?:https?:)?\\\/\\\/[^\"']+(?:okcdn\\.ru|vkvd|vkuser|mycdn|mail\\.ru)[^\"']+)(?:\"|')/ig
  ];
  for(const re of pats){let m,n=0;while((m=re.exec(text))&&n++<200){let u=decodeCandidate(m[1]||m[0]);u=u.replace(/^\\\//,'/');if(/^https?:/i.test(u))send(u,'page-json','');}}
  const okHls=/\"(?:hlsMasterPlaylistUrl|hlsManifestUrl|liveDashManifestUrl)\"\s*:\s*\"([^\"]+)\"/ig;
  let om; while((om=okHls.exec(text))){send(decodeCandidate(om[1]),'ok-metadata','')}
  const okVideo=/\{\s*\"name\"\s*:\s*\"([^\"]+)\"\s*,\s*\"url\"\s*:\s*\"([^\"]+)\"/ig;
  while((om=okVideo.exec(text))){const q=om[1].match(/(?:2160|1440|1080|720|576|540|480|360|240|144)\s*p?/i);let u=decodeCandidate(om[2]);if(/^https?:/i.test(u)){let absu;try{absu=new URL(u,location.href).href}catch{absu=u}api.runtime.sendMessage({type:'FOUND_VIDEO_TAGS',items:[{url:absu,source:'ok-video',contentType:'video/mp4',quality:q?q[0].replace(/\s+/g,''):om[1]}]}).catch(()=>{})}}

}

function scan(){
  document.querySelectorAll('video,source').forEach(e=>send(e.currentSrc||e.src,'dom',e.getAttribute('type')||''));
  document.querySelectorAll('[src],[href],[data-src],[data-url],[data-video-url],[data-hls],[data-mpd],[data-stream],[data-video],[data-player-url],[data-video-url-hls]').forEach(e=>{
    for(const a of ['src','href','data-src','data-url','data-video-url','data-hls','data-mpd','data-stream','data-video','data-player-url','data-video-url-hls']){const v=e.getAttribute(a);if(v)send(v,'dom-attr','');}
  });
  try{performance.getEntriesByType('resource').forEach(e=>send(e.name,'performance',''));}catch{}
  try{document.querySelectorAll('[data-module="OKVideo"], [data-options]').forEach(e=>{const v=e.getAttribute('data-options');if(v)scanTextForStreams(v)});document.querySelectorAll('script').forEach(sc=>scanTextForStreams(sc.textContent||''));}catch{}
  if(isKnownSite){
    try{
      const text=document.documentElement?.innerHTML||'';
      scanTextForStreams(text);
      if(/ok\.ru|odnoklassniki|vk\.com|vkvideo|vkvd/i.test(location.hostname)) api.runtime.sendMessage({type:'SCAN_EMBEDDED_DATA',text:text.slice(0,2000000)}).catch(()=>{});
    }catch{}
  }
}
function installHooks(){
  // Do not use inline <script>: the host page CSP can reject it.
  // Load the hook as an extension resource instead.
  const s=document.createElement('script');
  s.src=api.runtime.getURL('page-hook.js');
  s.async=false;
  s.onload=()=>s.remove();
  s.onerror=()=>s.remove();
  (document.documentElement||document.head||document.body)?.appendChild(s);
}
window.addEventListener('message',e=>{if(e.source!==window||!e.data?.__v2p6)return;const d=e.data;if(!isHttp(d.url))return;let abs;try{abs=new URL(d.url,location.href).href}catch{return}api.runtime.sendMessage({type:'FOUND_VIDEO_TAGS',items:[{url:abs,source:d.kind||'page',contentType:d.ct||'',quality:d.quality||'',height:d.height||0,width:d.width||0,bandwidth:d.bandwidth||0}]}).catch(()=>{})});
installHooks();scan();
[500,1200,2500,5000,9000,15000].forEach(t=>setTimeout(scan,t));
setInterval(scan,10000);

function css(){return `:host{all:initial;position:fixed;z-index:2147483647;right:18px;bottom:18px;font-family:Arial,sans-serif}.bar{display:flex;gap:10px;align-items:center;background:#101010;color:#fff;padding:10px;border-radius:14px;box-shadow:0 8px 30px #0009}.go,.close,.q.warn{background:#6a4a00}.q{font-family:inherit;font-weight:900;border:3px solid transparent;border-radius:12px;background:#e63946;color:#fff;min-height:54px;padding:12px 18px;font-size:17px}.close{background:#444;min-width:54px;padding:8px}.go:focus,.close:focus,.q:focus{outline:none;border-color:#fff;box-shadow:0 0 0 3px #e63946}.panel{position:absolute;right:0;bottom:74px;width:min(620px,calc(100vw - 36px));background:#151515;color:#eee;border-radius:18px;padding:18px;box-shadow:0 10px 40px #000c}.title{font-size:25px;font-weight:900}.status{color:#aaa;font-size:14px;margin:9px 0}.error{color:#ff9f95}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.q{background:#303030;min-height:64px}.q.auto{background:#e63946}.note{color:#888;font-size:12px;margin-top:12px}`}
function ensure(){if(host)return;host=document.createElement('div');host.id='v2p6';const sh=host.attachShadow({mode:'open'});sh.innerHTML=`<style>${css()}</style><div class=panel id=p hidden><div class=title>Видеопоток · качество · размер</div><div class=status id=s>Ожидание…</div><div class=grid id=g></div><div class=note>Пульт: стрелки — выбор, OK — открыть, BACK — закрыть.</div></div><div class=bar><button class=go id=go>▶ НАЙТИ ВИДЕО</button><button class=close id=x>✕</button></div>`;document.documentElement.appendChild(host);
  sh.getElementById('go').onclick=choose;sh.getElementById('x').onclick=()=>{dismissed=true;host.remove();host=null};[sh.getElementById('go'),sh.getElementById('x')].forEach(b=>b.addEventListener('keydown',nav));sh.getElementById('go').focus();
}
function nav(e){if(!host)return;if(e.key==='Escape'||e.key==='Backspace'){dismissed=true;host.remove();host=null;return}const bs=[...host.shadowRoot.querySelectorAll('button')].filter(b=>!b.disabled&&!b.hidden);const i=bs.indexOf(e.currentTarget);if(i<0)return;let j=i;if(e.key==='ArrowRight'||e.key==='ArrowDown')j=(i+1)%bs.length;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')j=(i-1+bs.length)%bs.length;else return;e.preventDefault();bs[j].focus()}
function status(t,err=false){const e=host?.shadowRoot?.getElementById('s');if(e){e.textContent=t;e.className='status'+(err?' error':'')}}
function mime(kind,url){if(kind==='hls'||/\.m3u8(?:[?#]|$)/i.test(url)||/(?:[?&](?:format|type|mime)=m3u8)/i.test(url))return'application/vnd.apple.mpegurl';if(kind==='dash'||/\.mpd(?:[?#]|$)/i.test(url))return'application/dash+xml';if(/\.webm/i.test(url))return'video/webm';return'video/mp4'}
function mimeFor(kind,url){if(kind==='hls'||/\.m3u8(?:[?#]|$)/i.test(url))return'application/vnd.apple.mpegurl';if(kind==='dash'||/\.mpd(?:[?#]|$)/i.test(url))return'application/dash+xml';if(/\.webm/i.test(url))return'video/webm';return'video/mp4'}
function openExternal(url,kind){
  if(!url)return;
  const direct=String(url);
  try{
    const u=new URL(direct);
    const target=u.host+u.pathname+(u.search||'');
    const scheme=u.protocol.replace(':','');
    const type=mimeFor(kind,direct);
    const fallback=encodeURIComponent(direct);
    const intent=`intent://${target}#Intent;scheme=${scheme};action=android.intent.action.VIEW;type=${type};S.browser_fallback_url=${fallback};end`;
    window.location.href=intent;
    return;
  }catch{}
  try{window.open(direct,'_blank','noopener,noreferrer')}catch{}
}

function playUrlForVariant(v,r){
  if(!v)return r?.playableUrl||r?.finalUrl||'';
  // A separate HLS audio rendition cannot be muxed by a browser extension into a new
  // network URL. In that case always open the master playlist so the external player
  // can select the matching audio rendition. Muxed variants can be opened directly.
  return r?.hasSeparateAudio && r?.isMaster ? (r.finalUrl||r.playableUrl||v.url) : (v.url||r?.playableUrl||r?.finalUrl||'');
}
function focusGrid(){const bs=[...host.shadowRoot.querySelectorAll('.q')];bs.forEach(b=>b.addEventListener('keydown',nav));bs[0]?.focus()}
function render(r,item){const g=host.shadowRoot.getElementById('g');g.innerHTML='';if(r?.error){status('Не удалось прочитать поток: '+r.error,true);return}
  if(item.kind==='dash'&&r?.segmentTemplate){status('DASH использует сегменты. Для сохранения видео+аудио откройте исходный MPD — плеер сам выберет качество.');const b=document.createElement('button');b.className='q auto';b.textContent='ОТКРЫТЬ MPD';b.onclick=()=>openExternal(r.finalUrl||item.url,'dash');g.appendChild(b);focusGrid();return}
  if(r?.type==='hls'&&!r.isMaster){status('Найден отдельный HLS-плейлист без списка качеств. Ищу master-плейлист…',true);const b=document.createElement('button');b.className='q auto';b.textContent='ОТКРЫТЬ ОСНОВНОЙ ПОТОК';b.onclick=()=>openExternal(r.playableUrl||r.finalUrl||item.url,'hls');g.appendChild(b);focusGrid();return}
  const auto=document.createElement('button');auto.className='q auto';auto.textContent='▶ Авто / видео + аудио';auto.onclick=()=>openExternal(r?.playableUrl||r?.finalUrl||item.url,item.kind);g.appendChild(auto);
  const groups=new Map();for(const v of r?.variants||[]){if(v.audioOnly)continue;const k=v.height?`${v.height}p`:(v.quality||'Авто');const old=groups.get(k);if(!old||(v.bandwidth||0)>(old.bandwidth||0))groups.set(k,v)}
  if(!groups.size){status('Качества не описаны. Откройте основной поток после окончания рекламы.');focusGrid();return}
  status(r.hasSeparateAudio?'RUTUBE отдаёт видео и аудио раздельно. Кнопки качества показывают доступные уровни; воспроизведение запускается через master, чтобы не потерять звук.':'Размер рядом с качеством — ориентир; короткие варианты помечаются ⚠.');
  for(const v of [...groups.values()].sort((a,b)=>(b.height||0)-(a.height||0)||(b.bandwidth||0)-(a.bandwidth||0))){const b=document.createElement('button');b.className='q'+(v.short?' warn':'');b.textContent=v.label+(v.sizeLabel?` · ${v.sizeLabel}`:'')+(v.durationLabel?` · ${v.durationLabel}`:'')+(v.bandwidth?` · ${(v.bandwidth/1e6).toFixed(1)} Mbps`:'');b.title=v.muxed?'Открыть именно выбранное качество с видео+аудио':'Открыть выбранное качество';b.onclick=()=>openExternal(playUrlForVariant(v,r),item.kind);g.appendChild(b)}focusGrid();
}
async function choose(){if(!host)return;const r=host.shadowRoot;r.getElementById('p').hidden=false;r.getElementById('g').innerHTML='';status('Ищем основной видеопоток, а не отдельное аудио и не рекламу…');const items=await api.runtime.sendMessage({type:'GET_FOUND'});const list=(items||[]).filter(x=>!x.adLike&&!x.segmentLike);if(!list.length){status('Поток ещё не найден. Запустите видео и подождите несколько секунд.',true);return}status('Проверяем HLS/DASH манифесты и ищем список качеств…');try{const best=await api.runtime.sendMessage({type:'RESOLVE_BEST_STREAM',items:list});if(best?.error){status('Ошибка: '+best.error,true);return}latest=best.sourceItem||list[0];render(best,latest)}catch(e){status('Ошибка: '+(e.message||e),true)}}
api.runtime.onMessage.addListener(m=>{if(m?.type==='NEW_VIDEO_URL'&&!dismissed){latest=m.item;ensure()}});
setTimeout(ensure,1800);
