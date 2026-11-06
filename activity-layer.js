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
async function load(){
 if(loaded)return;loaded=true;
 try{
  const response=await fetch('/activity-data.json',{cache:'no-store'});
  if(!response.ok)throw Error('資料尚未提供');
  const data=await response.json();
  if(data.type!=='commercial_activity_proxy'||!Array.isArray(data.points))throw Error('資料格式不符');
  const arr=data.points.filter(valid);
  if(!arr.length)throw Error('尚無有效商圈活躍度資料');
  points=arr;meta=data;
 }catch(e){points=[];message('尚無商圈活躍度資料｜非實測人流');}
}
async function toggle(){
 message(enabled?'正在關閉商圈圖層…':'正在檢查商圈活躍度資料…');
 enabled=!enabled;button.setAttribute('aria-pressed',String(enabled));button.style.background=enabled?'#242424':'#d71920';
 if(!enabled){layer?.setMap(null);message('代理指標｜非實測人流');return}
 await load();
 if(!points.length){message('尚無商圈活躍度代理指標資料，無法顯示熱力圖｜非實測人流');enabled=false;button.setAttribute('aria-pressed','false');button.style.background='#d71920';return}
 if(!layer)layer=new ActivityOverlay();
 layer.setMap(map);
 message('商圈活躍度代理指標｜非實測人流｜'+(meta.source||'資料來源未註明')+'｜'+(meta.updated_at||'日期未註明'));
}
button.addEventListener('click',()=>{message('正在檢查商圈活躍度資料…');if(map)toggle().catch(e=>message('圖層發生錯誤：'+e.message));else message('地圖尚未載入，請稍候再試')});
window.COMEBUY_ACTIVITY={attach(m){map=m},setData(data){if(!data||!Array.isArray(data.points))return;points=data.points.filter(valid);meta=data;loaded=true;if(enabled&&layer)layer.draw()}};
})();
