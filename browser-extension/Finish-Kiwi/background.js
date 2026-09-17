const api = typeof browser !== 'undefined' ? browser : chrome;

const MAX_ITEMS_PER_TAB = 120;
const MAX_VARIANTS = 120;
const CACHE_MS = 15000;
const tabKey = id => `v2p_v6_${id}`;
const resolveCache = new Map();

const HLS_CT = /mpegurl|vnd\.apple\.mpegurl/i;
const DASH_CT = /dash\+xml/i;
const VIDEO_CT = /^video\//i;
const HLS_URL = /\.m3u8(?:[?#]|$)/i;
const DASH_URL = /\.mpd(?:[?#]|$)/i;
const DIRECT_URL = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i;
const FORMAT_HLS = /(?:^|[?&])(format|type|mime|content_type)=(?:m3u8|application(?:%2f|\/)vnd(?:%2e|\.)apple(?:%2f|\/)mpegurl)(?:&|$)/i;
const FORMAT_DASH = /(?:^|[?&])(format|type|mime|content_type)=(?:mpd|application(?:%2f|\/)dash(?:%2b|\+)xml)(?:&|$)/i;
const HINT = /(?:manifest|master|playlist|m3u8|mpd|dash|hls|stream|videoplayback|video_url|video-url|playback|media|videoPlayer|cmaf|fragment|segment|quality|url\d{3,4})(?:[._/?=&-]|$)/i;
const KNOWN_VIDEO_HOST = /(?:rutube\.ru|rutube\.video|ok\.ru|odnoklassniki\.ru|okcdn\.ru|mycdn\.me|mail\.ru|my\.mail\.ru|cloud\.mail\.ru|streaming\.mail\.ru|vk\.com|vkvideo\.ru|vkvd\.com|vkuser\.net)/i;
const AD_HINT = /(?:^|[._/?=&-])(?:ad|ads|advert|advertising|advertisement|preroll|pre-roll|midroll|mid-roll|postroll|vast|vmap|doubleclick|googlesyndication|adserver|adservice|imasdk|commercial|promo)(?:[._/?=&-]|$)/i;
const SEGMENT_HINT = /(?:^|[._/?=&-])(?:seg(?:ment)?[-_]?\d+|chunk[-_]?\d+|frag(?:ment)?[-_]?\d+|init[-_]?(?:segment|frag)?)(?:[._/?=&-]|$)/i;

async function getItems(tabId){ const d=await api.storage.local.get(tabKey(tabId)); return d[tabKey(tabId)]||[]; }
async function putItems(tabId,items){ await api.storage.local.set({[tabKey(tabId)]:items}); }
function abs(url,base){ try{return new URL(url,base).href}catch{return ''} }
const STREAM_URL_HINT = /(?:[?&](?:cmd|format|type|mime|content_type|mediaType)=?(?:[^&]*)(?:hls|dash|m3u8|mpd)|(?:^|[._/?=&-])(?:hls|dash|m3u8|mpd|master|playlist|manifest|videoPlayer|videoplayback|stream|playback)(?:[._/?=&-]|$)|(?:^|[?&])url(?:144|240|360|480|540|720|1080|1440|2160)=|(?:^|[?&])video(?:_url|Url)?=|(?:^|[?&])(?:manifest|playlist|playback|stream)=)/i;
const CDN_VIDEO_PATH = /(?:okcdn\.ru|vd\d+\.okcdn\.ru|mycdn\.me|streaming\.mail\.ru)/i;
function kindOf(url,ct=''){
  const u=String(url||''); const c=String(ct||'');
  if(HLS_URL.test(u)||HLS_CT.test(c)||FORMAT_HLS.test(u)) return 'hls';
  if(DASH_URL.test(u)||DASH_CT.test(c)||FORMAT_DASH.test(u)) return 'dash';
  if(DIRECT_URL.test(u)||VIDEO_CT.test(c)) return 'direct';
  if(/cmd=[^&]*videoPlayer_hls/i.test(u)||/(?:^|[._/?=&-])(?:hls|m3u8|master|playlist)(?:[._/?=&-]|$)/i.test(u)) return 'hls';
  if(/cmd=[^&]*videoPlayer_dash/i.test(u)||/(?:^|[._/?=&-])(?:dash|mpd)(?:[._/?=&-]|$)/i.test(u)) return 'dash';
  if(/(?:^|[?&])url(?:240|360|480|540|720|1080|1440|2160)=/i.test(u)) return 'direct';
  if(CDN_VIDEO_PATH.test(u) && (STREAM_URL_HINT.test(u) || /(?:video|stream|media|playback|master|playlist)/i.test(u))) return 'direct';
  return '';
}
function siteName(initiator,url){ const x=String(initiator||url||'').toLowerCase(); if(/rutube/.test(x))return'RUTUBE'; if(/ok\.ru|odnoklassniki|okcdn/.test(x))return'OK'; if(/mail\.ru/.test(x))return'Mail.ru'; if(/vk\.com|vkvideo|vkvd|vkuser/.test(x))return'VK'; return'Другой сайт'; }
function adLike(url){ return AD_HINT.test(String(url||'')); }
function segmentLike(url){ return SEGMENT_HINT.test(String(url||'')); }
function score(x){
  let s=0;
  if(x.kind==='hls') s=1000;
  else if(x.kind==='dash') s=900;
  else if(x.kind==='direct') s=200;
  if(x.isMaster) s+=500;
  if(x.hasVariants) s+=250;
  if(x.resourceType==='media') s+=80;
  if(x.resourceType==='xmlhttprequest') s+=40;
  if(x.repeat) s+=Math.min(x.repeat,20)*25;
  if(x.adLike) s-=1500;
  if(x.segmentLike) s-=1000;
  if(x.shortLived) s-=300;
  // RUTUBE and some other players request a separate audio playlist.
  // Prefer URLs that look like video/master manifests over audio-only manifests.
  if(/(?:^|[._/?=&-])audio(?:[._/?=&-]|$)/i.test(x.url)) s-=700;
  if(/(?:^|[._/?=&-])(?:master|video)(?:[._/?=&-]|$)/i.test(x.url)) s+=120;
  s += Math.min((Date.now()-x.time<12000)?120:0,120);
  return s;
}
function badge(tabId,n){ Promise.resolve(api.action.setBadgeText({tabId,text:n?String(Math.min(n,99)):''})).catch(()=>{}); }
function notify(tabId,item){ api.tabs.sendMessage(tabId,{type:'NEW_VIDEO_URL',item}).catch(()=>{}); }

async function addFound(tabId,url,meta={}){
  if(tabId==null||tabId<0||!/^https?:\/\//i.test(url))return;
  url=abs(url); if(!url)return;
  const kind=kindOf(url,meta.contentType); if(!kind)return;
  const ad=adLike(url), segment=segmentLike(url);
  // Never surface obvious ad/segment URLs as standalone playable candidates.
  if(ad||segment) return;
  const items=await getItems(tabId); const old=items.find(x=>x.url===url);
  if(old){ old.repeat=(old.repeat||1)+1; Object.assign(old,meta,{kind,time:Date.now(),adLike:ad,segmentLike:segment,quality:meta.quality||old.quality||'',height:Number(meta.height||old.height||0)||0,width:Number(meta.width||old.width||0)||0,bandwidth:Number(meta.bandwidth||old.bandwidth||0)||0}); await putItems(tabId,items); notify(tabId,old); return; }
  const item={url,kind,time:Date.now(),repeat:1,site:siteName(meta.initiator||'',url),source:meta.source||'network',contentType:meta.contentType||'',resourceType:meta.resourceType||'',frameId:meta.frameId??0,initiator:meta.initiator||'',adLike:ad,segmentLike:segment,quality:meta.quality||'',height:Number(meta.height||0)||0,width:Number(meta.width||0)||0,bandwidth:Number(meta.bandwidth||0)||0};
  items.push(item);
  items.sort((a,b)=>score(b)-score(a)||b.time-a.time);
  if(items.length>MAX_ITEMS_PER_TAB)items.length=MAX_ITEMS_PER_TAB;
  await putItems(tabId,items); badge(tabId,items.length); notify(tabId,item);
}

api.webRequest.onBeforeRequest.addListener(d=>{
  if(!d.url||d.tabId<0)return;
  const initiator=String(d.initiator||'');
  const knownPage=KNOWN_VIDEO_HOST.test(initiator);
  const knownUrl=KNOWN_VIDEO_HOST.test(d.url);
  if(HLS_URL.test(d.url)||DASH_URL.test(d.url)||FORMAT_HLS.test(d.url)||FORMAT_DASH.test(d.url)||DIRECT_URL.test(d.url)||kindOf(d.url,'')||(knownUrl&&HINT.test(d.url))||(knownPage&&STREAM_URL_HINT.test(d.url))||(knownPage&&/(?:okcdn|mycdn|mail|rutube|vkvd|vkuser|vkvideo|video|stream|media|playback|cmaf|manifest|playlist|videoplayback|video_url|url(?:144|240|360|480|540|720|1080|1440|2160))/i.test(d.url)&&!AD_HINT.test(d.url)&&!SEGMENT_HINT.test(d.url)))
    addFound(d.tabId,d.url,{source:'network-url',resourceType:d.type,frameId:d.frameId,initiator});
},{urls:['<all_urls>']});

api.webRequest.onHeadersReceived.addListener(d=>{
  const ct=(d.responseHeaders||[]).find(h=>String(h.name).toLowerCase()==='content-type')?.value||'';
  if(HLS_CT.test(ct)||DASH_CT.test(ct)||VIDEO_CT.test(ct)||(/(?:application\/octet-stream|binary\/octet-stream)/i.test(ct)&& (KNOWN_VIDEO_HOST.test(String(d.initiator||''))||KNOWN_VIDEO_HOST.test(d.url))))
    addFound(d.tabId,d.url,{source:'content-type',contentType:ct,resourceType:d.type,frameId:d.frameId,initiator:d.initiator||''});
},{urls:['<all_urls>'],types:['main_frame','sub_frame','media','xmlhttprequest','other']},['responseHeaders']);

api.tabs.onRemoved.addListener(id=>{api.storage.local.remove(tabKey(id)).catch(()=>{});});
api.webNavigation.onBeforeNavigate.addListener(d=>{if(d.frameId===0){api.storage.local.remove(tabKey(d.tabId)).catch(()=>{});badge(d.tabId,0);}});

function attrs(s){const o={};const re=/([A-Z0-9-]+)=((?:"[^"]*")|(?:[^,]*))/g;let m;while((m=re.exec(s)))o[m[1]]=m[2].replace(/^"|"$/g,'');return o;}
function resolution(v){const m=String(v||'').match(/^(\d+)x(\d+)$/);return m?{width:+m[1],height:+m[2]}:{width:0,height:0};}
function label(v){return v.height?`${v.height}p`:v.bandwidth?`${Math.round(v.bandwidth/1000)} kbps`:'Авто';}
function rank(v){return (v.height||0)*1e9+(v.width||0)*1e6+(v.bandwidth||0);}
const MAX_QUALITY_HEIGHT=2160;
function qualityHeight(v){return Number(v?.height||0);}
function inferHeightFromUrl(u){const m=String(u||'').match(/(?:url|quality|q|height|res)[_-]?(144|240|360|480|576|720|1080|1440|2160)(?:p)?(?:\D|$)/i);return m?Number(m[1]):0;}
function within4k(v){const h=qualityHeight(v);return !h||h<=MAX_QUALITY_HEIGHT;}
async function getText(url){const r=await fetch(url,{redirect:'follow',cache:'no-store',credentials:'include'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return{text:await r.text(),finalUrl:r.url||url,contentType:r.headers.get('content-type')||'',contentLength:Number(r.headers.get('content-length')||0)||0};}
function fmtDuration(sec){if(!Number.isFinite(sec)||sec<=0)return '';sec=Math.round(sec);const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
function fmtBytes(n){if(!Number.isFinite(n)||n<=0)return '';const u=['B','KB','MB','GB'];let i=0,x=n;while(x>=1024&&i<u.length-1){x/=1024;i++;}return `${x<10&&i>1?x.toFixed(1):Math.round(x)} ${u[i]}`;}
async function probeHlsPlaylist(url,bandwidth){
  try{const {text,finalUrl}=await getText(url);const lines=text.split(/\r?\n/);let duration=0;let segments=0;let target=0;let vod=/^#EXT-X-(?:ENDLIST|PLAYLIST-TYPE:VOD)/m.test(text);for(const line of lines){if(line.startsWith('#EXTINF:')){const m=line.match(/^#EXTINF:([0-9.]+)/);if(m){duration+=Number(m[1])||0;segments++;}}if(line.startsWith('#EXT-X-TARGETDURATION:'))target=Number(line.split(':')[1])||0;}const size=duration&&bandwidth?duration*bandwidth/8:0;return{duration,segments,sizeBytes:size,estimated:!!size,vod,finalUrl};}catch{return{duration:0,segments:0,sizeBytes:0,estimated:false,vod:false,finalUrl:url};}
}

async function resolveHls(url){
  const ck='hls:'+url,c=resolveCache.get(ck);if(c&&Date.now()-c.time<CACHE_MS)return c.value;
  const {text,finalUrl}=await getText(url);const base=new URL(finalUrl);const lines=text.split(/\r?\n/);const variants=[];const audio=new Map();let isMaster=false;
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(line.startsWith('#EXT-X-MEDIA:')){const a=attrs(line.slice(13));if(a.TYPE==='AUDIO'&&a.URI)audio.set(a['GROUP-ID']||'',{...a,uri:abs(a.URI,base)});continue;}
    if(!line.startsWith('#EXT-X-STREAM-INF:'))continue;
    isMaster=true;
    const a=attrs(line.slice(18));let uri='';for(let j=i+1;j<lines.length;j++){const x=lines[j].trim();if(x&&!x.startsWith('#')){uri=x;break;}}if(!uri)continue;
    const r=resolution(a.RESOLUTION);const bw=Number(a.BANDWIDTH||0);const u=abs(uri,base);if(!u||adLike(u))continue;
    const codecs=String(a.CODECS||'');
    const ag=a.AUDIO?audio.get(a.AUDIO):null;
    // OK/Mail.ru can expose audio-only and video renditions in the same master.
    // A rendition with no resolution and audio-only codecs must never be treated as video.
    const audioOnly=!r.height && (/(?:^|,|\s)(?:mp4a|ac-3|ec-3|opus|vorbis|aac)(?:[.,]|$)/i.test(codecs) || /(?:^|[._/?=&-])audio(?:[._/?=&-]|$)/i.test(u));
    const looksVideo=!!r.height || /(?:avc|h26[45]|hev|vp0?9|av01|avc1|vp8|theora)/i.test(codecs) || /(?:^|[._/?=&-])(?:video|high|medium|low|fullhd|hd|sd)(?:[._/?=&-]|$)/i.test(u) || /(?:quality|q|height|res)[_-]?(?:144|240|360|480|540|576|720|1080|1440|2160)/i.test(u);
    if(audioOnly && !looksVideo) continue;
    const inferred=inferHeightFromUrl(u);
    const height=r.height||inferred;
    const width=r.width||(height?Math.round(height*16/9):0);
    variants.push({url:u,width,height,bandwidth:bw,averageBandwidth:Number(a['AVERAGE-BANDWIDTH']||0),codecs,frameRate:a['FRAME-RATE']||'',videoRange:a['VIDEO-RANGE']||'',audioGroup:a.AUDIO||'',audioUri:ag?.uri||'',quality:a.QUALITY||a.quality||'',label:height?`${height}p`:((a.QUALITY||a.quality)?String(a.QUALITY||a.quality):label({height,bw})),audioOnly:false,muxed:!!( /(?:mp4a|ac-3|ec-3|opus|vorbis|aac)/i.test(codecs) && /(?:avc|h26[45]|hev|vp0?9|av01|vp8|theora)/i.test(codecs) )});
  }
  const unique=[...new Map(variants.map(v=>[v.url,v])).values()].filter(within4k).sort((a,b)=>rank(b)-rank(a));
  if(isMaster){
    const probes=await Promise.all(unique.slice(0,24).map(v=>probeHlsPlaylist(v.url,v.averageBandwidth||v.bandwidth||0)));
    unique.forEach((v,i)=>{const p=probes[i]||{};v.duration=p.duration||0;v.durationLabel=fmtDuration(p.duration);v.sizeBytes=p.sizeBytes||0;v.sizeLabel=fmtBytes(p.sizeBytes);v.sizeEstimated=!!p.estimated;v.segments=p.segments||0;v.vod=!!p.vod;v.short=!!p.duration&&p.duration<90;});
  }
  const separateAudio=unique.some(v=>!!v.audioUri);
  const value={type:'hls',isMaster,variants:unique,finalUrl,originalUrl:url,hasSeparateAudio:separateAudio,isMediaPlaylist:!isMaster,duration:0,sizeBytes:0,playableUrl:isMaster?finalUrl:url};
  resolveCache.set(ck,{time:Date.now(),value});return value;
}

function rutubeIdFromUrl(url){
  const m=String(url||'').match(/https?:\/\/rutube\.(?:ru|video)\/(?:(?:live\/)?video(?:\/private)?|(?:play\/)?embed)\/([a-z0-9]{32})(?:[/?#]|$)/i);
  return m?m[1]:'';
}
async function resolveRutubeApi(pageUrl){
  const id=rutubeIdFromUrl(pageUrl);
  if(!id) return null;
  const u=`https://rutube.ru/api/play/options/${id}/?format=json&no_404=true&referer=${encodeURIComponent(pageUrl)}&pver=v2`;
  let r=await fetch(u,{redirect:'follow',cache:'no-store',credentials:'include',headers:{'Accept':'application/json'}});
  if(!r.ok){
    const u2=`https://rutube.ru/api/play/options/${id}/?format=json&no_404=true&referer=${encodeURIComponent('https://rutube.ru/')}&pver=v2`;
    r=await fetch(u2,{redirect:'follow',cache:'no-store',credentials:'include',headers:{'Accept':'application/json'}});
  }
  if(!r.ok) throw new Error(`RUTUBE API HTTP ${r.status}`);
  const data=await r.json();
  const vb=data?.video_balancer||{};
  let m3u8=typeof vb.m3u8==='string'?vb.m3u8:'';
  if(!m3u8){
    const hls=data?.live_streams?.hls;
    if(Array.isArray(hls)) m3u8=hls.find(x=>typeof x?.url==='string')?.url||'';
    else if(typeof hls==='string') m3u8=hls;
  }
  if(!m3u8) return null;
  const r2=await resolveHls(m3u8);
  r2.rutubeApi=true;
  r2.playableUrl=r2.finalUrl||m3u8;
  return {r:r2,item:{url:m3u8,kind:'hls',source:'rutube-api',site:'RUTUBE',time:Date.now(),repeat:1}};
}

async function resolveBestStream(items,pageUrl=''){
  const list=(items||[]).filter(x=>x&&!x.adLike&&!x.segmentLike);
  const rutubePage=pageUrl&&/rutube\.(?:ru|video)/i.test(pageUrl)?pageUrl:(list.find(x=>/rutube\.(?:ru|video)/i.test(String(x.initiator||'')))?.initiator||'');
  if(rutubePage){
    try{const rr=await resolveRutubeApi(rutubePage); if(rr?.r?.variants?.length) return {...rr.r,sourceItem:rr.item};}catch(e){}
  }
  // Resolve several HLS candidates because network capture can see the audio
  // playlist before the master playlist. The old code simply selected the first
  // HLS URL, which is why an external player could open sound without video and
  // no quality ladder was shown.
  const hls=list.filter(x=>x.kind==='hls').slice(0,32);
  const resolved=[];
  for(const item of hls){
    try{ const r=await resolveHls(item.url); resolved.push({item,r}); }catch{}
  }
  const master=resolved.filter(x=>x.r.isMaster&&x.r.variants?.length).sort((a,b)=>{
    const ah=Math.max(0,...(a.r.variants||[]).map(v=>v.height||0));
    const bh=Math.max(0,...(b.r.variants||[]).map(v=>v.height||0));
    return (b.r.variants.length-a.r.variants.length)*100000 + (bh-ah);
  })[0];
  if(master) return {...master.r,sourceItem:master.item};
  const direct=list.filter(x=>x.kind==='direct');
  const directWithQuality=direct.filter(x=>x.height||x.quality);
  if(directWithQuality.length){
    const variants=[...new Map(directWithQuality.map(x=>[x.url,x])).values()]
      .filter(x=>!x.height||x.height<=MAX_QUALITY_HEIGHT)
      .sort((a,b)=>(b.height||0)-(a.height||0)||(b.bandwidth||0)-(a.bandwidth||0))
      .map(x=>({url:x.url,height:x.height||inferHeightFromUrl(x.url),width:x.width||0,bandwidth:x.bandwidth||0,quality:x.quality||'',label:x.height?`${x.height}p`:x.quality||'Видео'}));
    return {type:'direct',isMaster:true,variants,playableUrl:variants[0]?.url||directWithQuality[0].url,finalUrl:variants[0]?.url||directWithQuality[0].url,originalUrl:variants[0]?.url||directWithQuality[0].url,sourceItem:directWithQuality[0],hasSeparateAudio:false};
  }
  const dash=list.find(x=>x.kind==='dash');
  if(dash){try{return {...await resolveDash(dash.url),sourceItem:dash};}catch{}}
  if(direct[0])return {type:'direct',playableUrl:direct[0].url,finalUrl:direct[0].url,originalUrl:direct[0].url,sourceItem:direct[0]};
  if(resolved[0])return {...resolved[0].r,sourceItem:resolved[0].item};
  throw new Error('Основной видеоманифест не найден. Запустите видео и подождите 2–5 секунд.');
}

function parseXmlAttrs(s){
  const o={};
  const re=/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g; let m;
  while((m=re.exec(String(s||'')))) o[m[1]]=m[3];
  return o;
}
function xmlTagBlocks(xml,tag){
  const out=[]; const re=new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`,'gi'); let m;
  while((m=re.exec(xml))) out.push({attrs:parseXmlAttrs(m[1]),body:m[2]});
  return out;
}
function xmlSelfOrOpenTags(xml,tag){
  const out=[]; const re=new RegExp(`<${tag}\\b([^>]*)\\/?\\s*>`,'gi'); let m;
  while((m=re.exec(xml))) out.push({attrs:parseXmlAttrs(m[1]),index:m.index,end:re.lastIndex});
  return out;
}
function firstXmlText(body,tag){
  const m=String(body||'').match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'));
  return m ? m[1].trim() : '';
}
function firstXmlAttr(body,tag,attr){
  const m=String(body||'').match(new RegExp(`<${tag}\\b([^>]*)>`,'i'));
  return m ? (parseXmlAttrs(m[1])[attr]||'') : '';
}
async function resolveDash(url){
  const ck='dash:'+url,c=resolveCache.get(ck);if(c&&Date.now()-c.time<CACHE_MS)return c.value;
  const {text,finalUrl}=await getText(url);
  if(!/<MPD\b/i.test(text)) throw new Error('Некорректный MPD');
  const mpdAttrs=parseXmlAttrs((text.match(/<MPD\b([^>]*)>/i)||[])[1]||'');
  const mpdBase=firstXmlText(text,'BaseURL');
  const base=mpdBase?abs(mpdBase,finalUrl):finalUrl;
  const variants=[]; let segmentTemplate=false;
  const periods=xmlTagBlocks(text,'Period');
  const periodList=periods.length?periods:[{attrs:{},body:text}];
  for(const period of periodList){
    const sets=xmlTagBlocks(period.body,'AdaptationSet');
    for(const aset of sets){
      const mime=aset.attrs.mimeType||'', content=aset.attrs.contentType||'';
      if(content!=='video'&&!/^video\//i.test(mime)) continue;
      if(/<SegmentTemplate\b|<SegmentList\b/i.test(aset.body)) segmentTemplate=true;
      const reps=xmlTagBlocks(aset.body,'Representation');
      for(const rep of reps){
        const width=Number(rep.attrs.width||aset.attrs.width||0),height=Number(rep.attrs.height||aset.attrs.height||0),bandwidth=Number(rep.attrs.bandwidth||0);
        const codecs=rep.attrs.codecs||aset.attrs.codecs||''; const id=rep.attrs.id||'';
        const rb=firstXmlText(rep.body,'BaseURL');
        const ab=firstXmlText(aset.body,'BaseURL');
        const repBase=rb?abs(rb,base):(ab?abs(ab,base):'');
        variants.push({id,url:repBase,width,height,bandwidth,codecs,label:label({height,bandwidth}),directBase:!!repBase});
      }
    }
  }
  const unique=[...new Map(variants.map(v=>[v.id||`${v.width}x${v.height}:${v.bandwidth}:${v.url}`,v])).values()]
    .filter(within4k).sort((a,b)=>rank(b)-rank(a)).slice(0,MAX_VARIANTS);
  const hasAudio=/<AdaptationSet\b[^>]*(?:contentType=["']audio|mimeType=["']audio\/)/i.test(text) || /contentType=["']audio["']/i.test(text); const value={type:'dash',isMaster:true,variants:unique,finalUrl,originalUrl:url,segmentTemplate,hasSegmentTemplate:segmentTemplate,hasSeparateAudio:hasAudio,playableUrl:finalUrl};
  resolveCache.set(ck,{time:Date.now(),value});return value;
}


async function resolveOkPage(pageUrl){
  if(!/ok\.ru|odnoklassniki\.ru/i.test(pageUrl||'')) return null;
  const id=(String(pageUrl).match(/\/video\/(?:embed\/)?(\d+)/i)||[])[1]||'';
  const items=await getItems((arguments[1]??-1)).catch(()=>[]);
  return null;
}
function parseLooseJsonText(text){
  let s=String(text||'');
  s=s.replace(/&quot;/g,'"').replace(/&#34;/g,'"').replace(/&#x22;/gi,'"').replace(/&amp;/g,'&');
  s=s.replace(/\\u0026/gi,'&').replace(/\\u003d/gi,'=').replace(/\\u002f/gi,'/').replace(/\\\//g,'/');
  return s;
}
function extractQualityUrlObjects(text){
  const out=[]; const s=parseLooseJsonText(text);
  const re=/(?:"(?:name|quality|type)"\s*:\s*"([^"]{1,40})"\s*,\s*"url"\s*:\s*"([^"]+)"|"url"\s*:\s*"([^"]+)"\s*,\s*"(?:name|quality|type)"\s*:\s*"([^"]{1,40})")/ig;
  let m; while((m=re.exec(s))&&out.length<200){const name=m[1]||m[4]||'';const url=m[2]||m[3]||'';if(/^https?:/i.test(url))out.push({url,name});}
  return out;
}
function scanEmbeddedSiteData(tabId,text,initiator){
  if(!text||tabId==null)return;
  const s=parseLooseJsonText(text);
  const urls=[];
  const patterns=[
    /"(?:hlsMasterPlaylistUrl|hlsManifestUrl|liveDashManifestUrl|metadataUrl)"\s*:\s*"([^"]+)"/ig,
    /(https?:\/\/[^"'\s<>]+\.(?:m3u8|mpd)(?:\?[^"'\s<>]*)?)/ig,
    /(https?:\/\/[^"'\s<>]*(?:vkvd|vkuser|okcdn|mail\.ru)[^"'\s<>]*)/ig
  ];
  for(const re of patterns){let m;while((m=re.exec(s))&&urls.length<300){let u=m[1];u=u.replace(/\\\//g,'/');if(/^https?:/i.test(u))urls.push(u);}}
  for(const o of extractQualityUrlObjects(s)){const h=inferHeightFromUrl(o.url)||inferHeightFromUrl(o.name);addFound(tabId,o.url,{source:'embedded-quality',initiator,contentType:'video/mp4',quality:o.name,height:h});}
  for(const u of urls)addFound(tabId,u,{source:'embedded-site-data',initiator});
}

api.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type==='SCAN_EMBEDDED_DATA'&&sender.tab){scanEmbeddedSiteData(sender.tab.id,msg.text||'',sender.tab.url||'');return false;}
  if(msg?.type==='FOUND_VIDEO_TAGS'&&sender.tab){(async()=>{for(const x of msg.items||[])if(x?.url)await addFound(sender.tab.id,x.url,{source:x.source||'page',contentType:x.contentType||'',frameId:sender.frameId||0,quality:x.quality||'',height:x.height||inferHeightFromUrl(x.url)||0,width:x.width||0,bandwidth:x.bandwidth||0});})();return false;}
  if(msg?.type==='GET_FOUND'){const tabId=msg.tabId ?? sender?.tab?.id; if(tabId==null){sendResponse([]);return true;} getItems(tabId).then(items=>sendResponse(items.sort((a,b)=>score(b)-score(a)||b.time-a.time)));return true;}
  if(msg?.type==='CLEAR_FOUND'){api.storage.local.remove(tabKey(msg.tabId)).then(()=>{badge(msg.tabId,0);sendResponse({ok:true});});return true;}
  if(msg?.type==='RESOLVE_STREAM'){const fn=msg.kind==='dash'?resolveDash:resolveHls;fn(msg.url).then(sendResponse).catch(e=>sendResponse({error:String(e.message||e)}));return true;}
  if(msg?.type==='RESOLVE_BEST_STREAM'){const pageUrl=msg.pageUrl||sender?.tab?.url||'';resolveBestStream(msg.items||[],pageUrl).then(sendResponse).catch(e=>sendResponse({error:String(e.message||e)}));return true;}
  if(msg?.type==='PROBE_DIRECT'){(async()=>{try{const r=await fetch(msg.url,{method:'HEAD',redirect:'follow',cache:'no-store',credentials:'include'});const n=Number(r.headers.get('content-length')||0)||0;sendResponse({sizeBytes:n,sizeLabel:fmtBytes(n),contentType:r.headers.get('content-type')||'',finalUrl:r.url||msg.url});}catch(e){sendResponse({sizeBytes:0,sizeLabel:'',error:String(e.message||e)});}})();return true;}
});
