(()=>{
  const emit=(url,meta={})=>{try{if(url&&/^https?:\/\//i.test(url))window.postMessage({__v2p6:1,url:String(url),ct:String(meta.ct||''),kind:String(meta.kind||'page'),quality:String(meta.quality||''),height:Number(meta.height||0)||0,width:Number(meta.width||0)||0,bandwidth:Number(meta.bandwidth||0)||0},location.origin)}catch{}};
  const scan=(text)=>{
    if(!text)return;
    const src=String(text).replace(/\\\//g,'/').replace(/\\u0026/gi,'&').replace(/\\u003d/gi,'=');
    const re=/"(hlsMasterPlaylistUrl|hlsManifestUrl|liveDashManifestUrl)"\s*:\s*"([^"]+)"/ig;
    let m; while((m=re.exec(src))) emit(m[2],{kind:'page-json'});
    const vr=/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"url"\s*:\s*"([^"]+)"/ig;
    while((m=vr.exec(src))){
      const name=m[1], url=m[2];
      const q=name.match(/(?:2160|1440|1080|720|576|540|480|360|240|144)\s*p?/i);
      emit(url,{kind:'page-json',ct:'video/mp4',quality:q?q[0].replace(/\s+/g,''):name});
    }
    const urls=/(https?:\/\/[^"'<>\s\\]+(?:\.m3u8|\.mpd)(?:\?[^"'<>\s\\]*)?)/ig;
    while((m=urls.exec(src))) emit(m[1],{kind:'page-json'});
  };

  const parseJSON=(x)=>{try{return JSON.parse(String(x).replace(/&quot;/g,'"').replace(/\\u0026/gi,'&').replace(/\\u003d/gi,'=').replace(/\\\//g,'/'))}catch{return null}};
  const scanOK=()=>{
    try{
      document.querySelectorAll('[data-module="OKVideo"][data-options], [data-module="OKVideo"] [data-options]').forEach(el=>{
        const raw=el.getAttribute('data-options'); if(!raw)return;
        const opt=parseJSON(raw); const fv=opt?.flashvars||{};
        let md=fv.metadata;
        if(typeof md==='string') md=parseJSON(md);
        if(md && typeof md==='object'){
          for(const k of ['hlsMasterPlaylistUrl','hlsManifestUrl','liveDashManifestUrl','rtmpUrl']) if(typeof md[k]==='string') emit(md[k],{kind:'ok-dom-metadata'});
          if(Array.isArray(md.videos)) for(const v of md.videos){
            if(!v||typeof v.url!=='string')continue;
            const q=String(v.name||'').match(/(?:2160|1440|1080|720|576|540|480|360|240|144)\s*p?/i);
            emit(v.url,{kind:'ok-dom-video',ct:'video/mp4',quality:q?q[0].replace(/\s+/g,''):String(v.name||'')});
          }
        }
        const mu=fv.metadataUrl;
        if(typeof mu==='string' && /^https?:/i.test(mu)){
          emit(mu,{kind:'ok-metadata-url'});
          fetch(mu,{credentials:'include',cache:'no-store'}).then(r=>r.text()).then(t=>scan(t)).catch(()=>{});
        }
        scan(raw);
      });
    }catch{}
  };

  const of=window.fetch;
  scanOK();
  const mo=new MutationObserver(()=>scanOK());
  try{mo.observe(document.documentElement||document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-options']})}catch{}
  if(of) window.fetch=function(input,init){
    const u=typeof input==='string'?input:input?.url||''; emit(u,{kind:'fetch'});
    const p=of.apply(this,arguments);
    return Promise.resolve(p).then(async r=>{emit(r.url||u,{ct:r.headers?.get?.('content-type')||'',kind:'fetch-response'});try{const c=r.clone();const t=await c.text();if(/(?:hlsMasterPlaylistUrl|hlsManifestUrl|liveDashManifestUrl|"videos"\s*:|\.m3u8|\.mpd)/i.test(t))scan(t)}catch{}return r;});
  };
  const xo=XMLHttpRequest.prototype.open,xs=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(m,u){this.__v2pu=u;return xo.apply(this,arguments)};
  XMLHttpRequest.prototype.send=function(){emit(this.__v2pu,{kind:'xhr'});this.addEventListener('load',()=>{emit(this.responseURL||this.__v2pu,{ct:this.getResponseHeader?.('content-type')||'',kind:'xhr-response'});try{if(typeof this.responseText==='string')scan(this.responseText)}catch{}});return xs.apply(this,arguments)};
})();
