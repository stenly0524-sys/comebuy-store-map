/* COMEBUY MAPS / 2026-11-24 historical evaluation batch.
 * Non-destructive, idempotent import. Coordinates come exclusively from Google Maps Geocoder.
 * Original storefront address is never replaced by a geocoded landmark address.
 */
(function(){
'use strict';
const KEY='COMEBUY-EVAL-20261124';
const VACANCIES='comebuy_vacancies_v1';
const BACKUP='cb_eval_20261124_preimport_backup_v1';
const PROGRESS='cb_eval_20261124_progress_v1';
const SOURCE='eval-locations-20261124.json';
let running=null,lastReport=null;
const today='2026/11/24 COMEBUY 實際展店評估名單';
const normalize=s=>String(s||'').normalize('NFKC').replace(/臺/g,'台').replace(/台灣/g,'').replace(/[\s　,，、。．.／/\\（）()\[\]【】\-－:：]/g,'').trim().toLowerCase();
const validPosition=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(+p.lat)<=90&&Math.abs(+p.lng)<=180;
const dateNow=()=>new Date().toISOString();
function backup(){
 if(localStorage.getItem(BACKUP))return true;
 // Save a full portable V1 backup, not just a duplicate array of newly created rows.
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
 const data={
  format:'comebuy-map-backup',version:1,exportedAt:dateNow(),backupPurpose:KEY,
  vacancies:read(VACANCIES,[]),
  franchiseLeads:read('comebuy_franchise_leads_v1',[]),
  storeOpeningDates:read('comebuy_store_opening_dates_v1',{}),
  storeEdits:read('comebuy_store_edits_v1',{}),
  scheduleRules:read('cb_schedule_rules_v1',null),
  scheduleTemplates:read('cb_schedule_templates_v2',null)
 };
 if(!Array.isArray(data.vacancies)||!Array.isArray(data.franchiseLeads))throw Error('原始資料格式異常，停止匯入');
 localStorage.setItem(BACKUP,JSON.stringify(data));
 return true;
}
function downloadBackup(){
 const raw=localStorage.getItem(BACKUP);
 if(!raw){alert('尚無批次匯入前的備份');return}
 const blob=new Blob([raw],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='COMEBUY-MAPS-20261124-before-batch.json';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function same(v,e){
 if(String(v.importSourceId||'')===e.id||String(v.id||'')===e.id)return true;
 const addr=normalize(v.address);
 const proposed=normalize(e.exact?e.query:e.city+e.district+e.label);
 if(addr===proposed)return true;
 const label=normalize(e.label),city=normalize(e.city),district=normalize(e.district);
 const sourceText=normalize(v.importOriginalLabel||v.originalEvaluationLocation||'');
 if(sourceText===label&&normalize(v.region?.city)===city&&normalize(v.region?.district)===district)return true;
 // Do not merge unrelated shops merely because they share a commercial district.
 return false;
}
function record(e){
 const address=e.exact?e.query:e.city+e.district+e.label;
 const original=e.city+e.originalDistrict+' '+e.label;
 const lines=[today,'原始評估地點：'+original];
 if(e.correction)lines.push('核對說明：'+e.correction);
 if(!e.exact)lines.push('正確地址確認中');
 return {
  id:e.id,address,region:{city:e.city,district:e.district,neighborhood:''},
  status:'vacant',developmentStage:'待評估',developmentNote:lines.join('\n'),
  rent:'',size:'',front:'',contact:'',phone:'',messenger:'',
  position:null,areaTypes:[],areaManual:true,
  importBatchId:KEY,importSourceId:e.id,importOriginalLabel:e.label,
  importOriginalDistrict:e.originalDistrict,
  geoQuery:e.query,geoAccuracy:'待定位',isTemporaryLocation:!e.exact,
  importedAt:dateNow()
 };
}
function getReport(api,entries){
 const existing=api.getVacancies();
 const rows=entries.map(e=>({entry:e,record:existing.find(v=>same(v,e))}));
 const imported=rows.filter(x=>x.record?.importBatchId===KEY);
 return {
  total:entries.length,
  accounted:rows.filter(x=>x.record).length,
  imported:imported.length,
  matchedExisting:rows.filter(x=>x.record&&x.record.importBatchId!==KEY).length,
  precise:imported.filter(x=>x.record.geoAccuracy==='精準門牌').length,
  temporary:imported.filter(x=>x.record.geoAccuracy==='商圈暫時定位').length,
  unlocated:imported.filter(x=>!validPosition(x.record.position)).length,
  unresolved:imported.filter(x=>x.record.geoAccuracy==='待定位'||!validPosition(x.record.position)).map(x=>x.entry.id+' '+x.entry.label),
  savedAt:dateNow()
 };
}
function notify(report){lastReport=report;try{localStorage.setItem(PROGRESS,JSON.stringify(report))}catch(_){}
 document.dispatchEvent(new CustomEvent('cb:evaluation-batch-updated',{detail:report}));
}
function cityDistrictMatches(result,e){
 const comps=result.address_components||[],values=comps.map(x=>String(x.long_name||'').replace(/臺/g,'台'));
 const formatted=String(result.formatted_address||'').replace(/臺/g,'台');
 const whole=values.join(' ')+formatted;
 // Geocoder sometimes labels municipality as administrative_area_level_1,
 // or uses county-level administrative_area_level_2.
 const expectedCity=e.city.replace(/臺/g,'台'),expectedDistrict=e.district;
 return whole.includes(expectedCity)&&whole.includes(expectedDistrict);
}
function hasHouseNumber(result,e){
 const expected=String(e.label).match(/\d+(?:之\d+)?號/);
 if(!expected)return false;
 const normalized=normalize(result.formatted_address||'');
 return normalized.includes(normalize(expected[0]))&&normalized.includes(normalize(e.query).replace(normalize(expected[0]),'').slice(0,8));
}
async function geocodeOne(api,e){
 const query=e.query;
 let response;
 try{response=await api.geocode(query)}
 catch(err){return {reason:'Google Maps 查詢失敗'}};
 if(response?.status==='OVER_QUERY_LIMIT')return {retry:true,reason:'Google Maps 配額限制'};
 const result=response?.status==='OK'?response.results?.[0]:null;
 if(!result?.geometry?.location)return {reason:'無法取得 Google Maps 座標'};
 if(!cityDistrictMatches(result,e))return {reason:'Google Maps 返回不同縣市或行政區'};
 const point=result.geometry.location;
 const pos={lat:typeof point.lat==='function'?point.lat():point.lat,lng:typeof point.lng==='function'?point.lng():point.lng};
 if(!validPosition(pos))return {reason:'座標格式不合法'};
 const genericOnly=Array.isArray(result.types)&&result.types.every(t=>['political','locality','administrative_area_level_1','administrative_area_level_2','administrative_area_level_3','sublocality','sublocality_level_1'].includes(t));
 if(genericOnly)return {reason:'僅查得行政區中心，不能代表評估地點'};
 if(e.exact&&(!hasHouseNumber(result,e)||result.geometry.location_type!=='ROOFTOP')){
  return {reason:'Google Maps 未確認精準門牌位置'};
 }
 return {position:pos,accuracy:e.exact?'精準門牌':'商圈暫時定位',formattedAddress:result.formatted_address||''};
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function begin(api,force=false){
 if(!api||typeof api.getVacancies!=='function'||typeof api.persist!=='function'||typeof api.geocode!=='function')throw Error('空舖匯入介面未備妥');
 const response=await fetch(SOURCE+'?v=20261124',{cache:'no-store'});
 if(!response.ok)throw Error('評估來源檔讀取失敗');
 const data=await response.json(),entries=data.entries;
 if(data.batchId!==KEY||!Array.isArray(entries)||entries.length!==43||new Set(entries.map(e=>e.id)).size!==43)throw Error('43筆來源清單驗證失敗');
 const existing=api.getVacancies();
 // A fully reversible local snapshot MUST succeed before the first write.
 backup();
 const created=[];
 for(const e of entries){
  if(existing.some(v=>same(v,e)))continue;
  created.push(record(e));
 }
 if(created.length){
  // Re-read the master at commit time to avoid clobbering edits made while fetching.
  const latest=api.getVacancies(),toWrite=created.filter(v=>!latest.some(x=>x.id===v.id||normalize(x.address)===normalize(v.address)));
  if(toWrite.length&&!api.persist([...toWrite,...latest]))throw Error('本機儲存失敗，未更動原始資料');
 }
 let report=getReport(api,entries);notify(report);
 api.refresh();
 // Resume only unfinished coordinates. Never replace existing manual positions.
 const targets=entries.filter(e=>{
  const item=api.getVacancies().find(v=>v.importBatchId===KEY&&v.importSourceId===e.id);
  return item&&!validPosition(item.position);
 });
 for(const e of targets){
  if(!api.mapReady())break;
  let geo=await geocodeOne(api,e);
  if(geo.retry){await sleep(1800);geo=await geocodeOne(api,e)}
  if(geo.position){
   const latest=api.getVacancies(),i=latest.findIndex(v=>v.importBatchId===KEY&&v.importSourceId===e.id);
   if(i>=0&&!validPosition(latest[i].position)){
    const copy={...latest[i],position:geo.position,geoAccuracy:geo.accuracy,geocodedAt:dateNow(),geoReturnedAddress:geo.formattedAddress};
    const next=latest.slice();next[i]=copy;
    if(api.persist(next))api.refresh();
   }
  }else{
   // Store a failure reason, not an invented coordinate. Keep the listing visible.
   const latest=api.getVacancies(),i=latest.findIndex(v=>v.importBatchId===KEY&&v.importSourceId===e.id);
   if(i>=0&&!validPosition(latest[i].position)){
    const next=latest.slice();next[i]={...latest[i],geoFailure:geo.reason||'待查核',geoLastCheckedAt:dateNow()};
    api.persist(next);
   }
  }
  report=getReport(api,entries);notify(report);
  await sleep(180);
 }
 api.refresh();
 return report;
}
function run(api,force=false){
 if(running)return running;
 running=begin(api,force).catch(e=>{
  const message='COMEBUY 43筆展店評估名單尚未完整匯入：'+(e?.message||e);
  console.warn(message);
  notify({error:message,savedAt:dateNow()});
  return lastReport;
 }).finally(()=>{running=null});
 return running;
}
function report(){return lastReport||(()=>{try{return JSON.parse(localStorage.getItem(PROGRESS)||'null')}catch{return null}})()}
window.ComebuyEvalBatch={run,report,downloadBackup,batchId:KEY};
})();