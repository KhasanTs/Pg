
const data = new Map();
function add(id,item){
  if(id<0)return;
  if(!data.has(id))data.set(id,[]);
  const a=data.get(id);
  const old=a.find(x=>x.url===item.url);
  if(old)Object.assign(old,item); else a.push(item);
}
function quality(u){
  try{
    const s=decodeURIComponent(u);
    let m=s.match(/(?:^|[^\d])(\d{3,4})p(?:[^\d]|$)/i);
    if(m)return +m[1];
    m=s.match(/(?:height|video_height|h)[=_:-]?(\d{3,4})/i);
    return m?+m[1]:null;
  }catch(e){return null}
}
chrome.webRequest.onBeforeRequest.addListener(d=>{
  if(d.tabId<0)return;
  if(!/\.(mp4|m3u8|mpd)(?:$|[?#])/i.test(d.url)&&!/\/(video|stream|hls|dash)\//i.test(d.url))return;
  add(d.tabId,{url:d.url,quality:quality(d.url),source:"network"});
},{urls:["https://*/*","http://*/*"]});
chrome.tabs.onRemoved.addListener(id=>data.delete(id));
chrome.runtime.onMessage.addListener((m,s,r)=>{
  const id=s.tab?.id;
  if(m.type==="GET_NETWORK"){r({items:data.get(id)||[]});return true}
});
