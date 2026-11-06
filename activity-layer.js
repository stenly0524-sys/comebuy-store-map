/* COMEBUY 商圈活躍度代理指標圖層。僅呈現經授權的指標資料，不代表實測人流。 */
(function(){
'use strict';
let map=null,layer=null,points=[],meta=null,enabled=false,loaded=false;
const button=document.getElementById('activityToggle');
const info=document.getElementById('activityInfo');
if(!button||!info)return;
function message(t){info.textContent=t;info.style.display='block';info.style.color='#211d1d';info.style.fontWeight='700';info.style.padding='10px 12px';info.setAttribute('role','status')}
function valid(p){return p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lng)&&Number.isFinite(+p.score)&&+p.score>=0&&+p.score<=100}
class ActivityOverlay extends google.maps.OverlayView{
 constructor(){super();this.canvas=null}
 onAdd(){this.canvas=document.createElement('canvas');this.canvas.style.cssText='position:absolute;pointer-events:none;opacity:.62';this.getPanes().overlayLayer.appendChild(this.canvas)}
 draw(){
  if(!this.canvas)return;
  const projection=this.getProjection(),bounds=map.getBounds();if(!projection||!bounds)return;
  const ne=projection.fromLatLngToDivPixel(bounds.getNorthEast()),sw=projection.fromLatLngToDivPixel(bounds.getSouthWest());
  const left=Math.min(ne.x,sw.x),top=Math.min(ne.y,sw.y),w=Math.max(1,Math.abs(ne.x-sw.x)),h=Math.max(1,Math.abs(ne.y-sw.y));
  const dpr=Math.min(devicePixelRatio||1,2);this.canvas.style.left=left+'px';this.canvas.style.top=top+'px';this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';
  this.canvas.width=Math.ceil(w*dpr);this.canvas.height=Math.ceil(h*dpr);
  const ctx=this.canvas.getContext('2d');ctx.scale(dpr,dpr);
  for(const p of points){const pixel=projection.fromLatLngToDivPixel(new google.maps.LatLng(+p.lat,+p.lng));if(!pixel)continue;const x=pixel.x-left,y=pixel.y-top;const radius=Math.max(25,Math.min(85,32+ +p.score*.5));const g=ctx.createRadialGradient(x,y,0,x,y,radius);g.addColorStop(0,'rgba(215,25,32,'+(.18+.7*(+p.score/100))+')');g.addColorStop(.35,'rgba(255,150,0,.45)');g.addColorStop(.7,'rgba(255,224,0,.18)');g.addColorStop(1,'rgba(255,224,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill()}
 }
 onRemove(){this.canvas?.remove();this.canvas=null}
}
const categoryWeights={restaurant:3,cafe:3,fast_food:3,bar:2,bank:2,pharmacy:2,supermarket:4,convenience:3,department_store:5,mall:5,marketplace:4,school:3,university:4,hospital:3,clinic:2,cinema:3,bus_station:4,station:5};
const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter','https://overpass-api.de/api/interpreter'];
const cache=new Map();
async function queryEndpoint(endpoint,query){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
 try{
  const response=await fetch(endpoint,{method:'POST',body:'data='+encodeURIComponent(query),headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},signal:ctrl.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.elements))throw Error('資料格式不符');
  return data.elements;
 }finally{clearTimeout(timer)}
}
async function load(){
 const center=map?.getCenter();
 if(!center){message('地圖尚未載入');return}
 if(map.getZoom()<14){message('正在自動放大至商圈分析範圍…');map.setZoom(15);await new Promise(resolve=>google.maps.event.addListenerOnce(map,'idle',resolve));}
 const lat=center.lat(),lng=center.lng(),key=lat.toFixed(2)+','+lng.toFixed(2);
 if(cache.has(key)){points=cache.get(key);meta={source:'OpenStreetMap / Overpass（暫存）',updated_at:'本次瀏覽'};return}
 const query='[out:json][timeout:12];(node(around:650,'+lat+','+lng+')[amenity~"^(restaurant|cafe|fast_food|bar|bank|pharmacy|school|university|hospital|clinic|cinema|bus_station)$"];node(around:650,'+lat+','+lng+')[shop~"^(supermarket|convenience|department_store|mall)$"];way(around:650,'+lat+','+lng+')[shop~"^(supermarket|department_store|mall)$"];node(around:650,'+lat+','+lng+')[railway=station];);out center 180;';
 let elements=null;
 for(let i=0;i<endpoints.length;i++){
  try{message('正在查詢公開商業設施資料（來源 '+(i+1)+'/'+endpoints.length+'）…');elements=await queryEndpoint(endpoints[i],query);break}
  catch(e){if(i===endpoints.length-1){message('公開資料服務目前繁忙，三個來源均未成功；請稍後重試');points=[];return}}
 }
 const items=elements.map(e=>{const lat=e.lat??e.center?.lat,lng=e.lon??e.center?.lon,tag=e.tags||{},category=tag.amenity||tag.shop||tag.railway;return {lat,lng,category,score:Math.min(100,25+(categoryWeights[category]||1)*13)}}).filter(valid);
 const dedup=new Map();for(const p of items){const key=p.lat.toFixed(5)+','+p.lng.toFixed(5);if(!dedup.has(key))dedup.set(key,p)}
 points=[...dedup.values()];meta={source:'OpenStreetMap / Overpass',updated_at:new Date().toLocaleDateString('zh-TW'),methodology:'公開設施種類加權，非實測人流'};
 if(points.length)cache.set(key,points);
 else message('此範圍未取得公開商業設施，請移至其他商圈再試');
}
async function toggle(){
 message(enabled?'正在關閉商圈圖層…':'正在檢查商圈活躍度資料…');
 enabled=!enabled;button.setAttribute('aria-pressed',String(enabled));button.style.background=enabled?'#242424':'#d71920';
 if(!enabled){layer?.setMap(null);message('代理指標｜非實測人流');return}
 await load();
 if(!points.length){enabled=false;button.setAttribute('aria-pressed','false');button.style.background='#d71920';return}
 if(!layer)layer=new ActivityOverlay();
 layer.setMap(map);
 message('已顯示 '+points.length+' 處公開設施｜OSM 活躍度代理指標，非實測人流｜'+meta.updated_at);
}
button.addEventListener('click',()=>{message('正在檢查商圈活躍度資料…');if(map)toggle().catch(e=>message('圖層發生錯誤：'+e.message));else message('地圖尚未載入，請稍候再試')});
window.COMEBUY_ACTIVITY={attach(m){map=m},setData(data){if(!data||!Array.isArray(data.points))return;points=data.points.filter(valid);meta=data;loaded=true;if(enabled&&layer)layer.draw()}};
})();
