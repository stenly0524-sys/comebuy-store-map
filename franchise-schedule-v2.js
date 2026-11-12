(function(){
'use strict';
const KEY='cb_schedule_templates_v2';
const PHASES=[
 ['加盟開發','首次接洽日期','首次追蹤日期','第二次追蹤日期','加盟意向確認日期','預定簽約日期'],
 ['加盟簽約','正式簽約日期','訂金繳納期限','訂金確認日期','加盟款項確認日期'],
 ['教育訓練','受訓安排日期','開始受訓日期','預計完訓日期','實際完訓日期','完訓考核日期','補考日期'],
 ['店面開發','店面勘查日期','店面評估完成日期','租約簽訂日期','店面交屋日期','工程丈量日期'],
 ['工程裝潢','平面規劃完成日期','設計確認日期','工程報價確認日期','預定開工日期','實際開工日期','水電工程完成日期','裝潢工程完成日期','工程驗收日期','缺失改善完成日期'],
 ['開幕籌備','設備進場日期','招牌安裝日期','POS設備安裝日期','原物料進場日期','人員到店準備日期','設備測試日期','開幕前驗收日期','試營業日期'],
 ['正式開幕','預計正式開幕日期','確認正式開幕日期','開幕活動日期','開幕後7天追蹤日期','開幕後30天追蹤日期'],
 ['營運輔導','首次到店輔導日期','每月定期輔導日期','改善事項完成期限','改善複查日期','特殊輔導日期']
];
const DEFAULT_TRIGGERS=[
 ['首次接洽日期','首次追蹤日期',7,'加盟開發'],
 ['加盟意向確認日期','加盟條件確認任務',3,'加盟開發'],
 ['加盟意向確認日期','簽約安排任務',3,'加盟開發'],
 ['正式簽約日期','訂金確認任務',3,'加盟簽約'],
 ['正式簽約日期','加盟款項追蹤任務',3,'加盟簽約'],
 ['正式簽約日期','受訓安排日期',3,'教育訓練'],
 ['租約簽訂日期','工程丈量日期',3,'店面開發'],
 ['租約簽訂日期','平面配置規劃任務',3,'工程裝潢'],
 ['租約簽訂日期','工程報價確認日期',7,'工程裝潢'],
 ['確認正式開幕日期','開幕後7天追蹤日期',7,'正式開幕'],
 ['確認正式開幕日期','開幕後30天追蹤日期',30,'正式開幕']
].map(([source,target,offset,phase],i)=>({id:'rule-'+i,source,target,offset,phase,enabled:true,dayMode:'calendar',reminders:target==='首次追蹤日期'?[2,1,0]:[3,1,0],dependency:source}));
const DEFAULT_DEPENDENCIES=[
 ['裝潢工程完成日期','工程驗收日期',1],['工程驗收日期','設備測試日期',2],
 ['設備測試日期','原物料進場日期',1],['原物料進場日期','開幕前驗收日期',1],
 ['開幕前驗收日期','試營業日期',1],['試營業日期','預計正式開幕日期',2]
].map(([source,target,offset])=>({source,target,offset,mode:'calendar'}));
const clone=v=>JSON.parse(JSON.stringify(v));
const now=()=>new Date().toISOString();
const valid=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s};
function addDays(date,count,mode='calendar'){
 if(!valid(date)||!Number.isInteger(count)||count<0||count>3660)return '';
 let d=new Date(date+'T00:00:00Z'),n=0;
 while(n<count){d.setUTCDate(d.getUTCDate()+1);if(mode!=='workday'||![0,6].includes(d.getUTCDay()))n++}
 return d.toISOString().slice(0,10);
}
function defaultTemplate(){
 return {id:'default',name:'系統預設加盟流程',version:2,locked:true,phases:PHASES.map(([name,...tasks])=>({name,tasks:tasks.map(title=>({id:'t-'+encodeURIComponent(name+'|'+title),title,enabled:true,dependsOn:''}))})),triggers:clone(DEFAULT_TRIGGERS),dependencies:clone(DEFAULT_DEPENDENCIES),constructionDays:45,constructionFollowDays:7,monthlyCoaching:true,createdAt:now(),updatedAt:now()};
}
function registry(){
 try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&Array.isArray(saved.templates))return saved}catch{}
 return {activeId:'default',templates:[defaultTemplate()]};
}
function saveRegistry(r){localStorage.setItem(KEY,JSON.stringify(r))}
function getTemplate(r=registry(),id=r.activeId){return r.templates.find(t=>t.id===id)||r.templates[0]||defaultTemplate()}
function makeTask(lead,phase,title,templateId='default'){
 const stamp=now();
 return {id:'v2-'+encodeURIComponent(phase+'|'+title),leadId:String(lead.id),phase,title,plannedStart:'',plannedEnd:'',deadline:'',completedAt:'',remindAt:'',owner:'',status:'未安排',note:'',changes:[],createdAt:stamp,updatedAt:stamp,triggerSource:'',triggerDate:'',suggestedDate:'',confirmedDate:'',dateLocked:false,vendorConfirmed:false,reviewRequired:false,templateId,dependsOn:''};
}
const allTasks=lead=>Array.isArray(lead.scheduleTasks)?lead.scheduleTasks:[];
const find=(lead,title)=>allTasks(lead).find(t=>t.title===title);
const dateOf=t=>t?.confirmedDate||(t?.status==='已完成'&&valid(t.completedAt)?t.completedAt:'')||'';
function audit(t,changes,reason,actor='local-user'){
 if(!Array.isArray(t.changes))t.changes=[];
 t.changes.push({at:now(),reason,actor,changes:clone(changes)});
 t.updatedAt=now();
}
function suggest(t,date,source,sourceDate,reason,deadline=true){
 if(!valid(date)||!t||t.status==='已完成'||t.status==='已取消'||t.dateLocked||t.vendorConfirmed)return false;
 if(t.confirmedDate||t.plannedStart||t.plannedEnd||t.deadline||t.suggestedDate)return false;
 t.suggestedDate=date;t.triggerSource=source;t.triggerDate=sourceDate;
 if(deadline)t.deadline=date;
 t.status=deadline?'已排程':'未安排';
 audit(t,{suggestedDate:{from:'',to:date},deadline:{from:'',to:t.deadline}},reason,'auto-rule');
 return true;
}
function ensure(lead,phase,title,templateId){
 let t=find(lead,title);
 if(!t){t=makeTask(lead,phase,title,templateId);lead.scheduleTasks.push(t);return [t,true]}
 return [t,false]
}
function seed(lead,phasesIgnored,rulesIgnored){
 if(!lead||!lead.id)return false;
 if(!Array.isArray(lead.scheduleTasks))lead.scheduleTasks=[];
 const cfg=registry(),template=getTemplate(cfg,lead.scheduleTemplateId||cfg.activeId);let changed=false;
 if(!lead.scheduleTemplateId){lead.scheduleTemplateId=template.id;changed=true}
 for(const p of template.phases)for(const j of p.tasks){
  if(!j.enabled)continue;const [t,added]=ensure(lead,p.name,j.title,template.id);changed=changed||added;
  if(j.dependsOn&&!t.dependsOn){t.dependsOn=j.dependsOn;changed=true}
 }
 const conf=(title,date,source)=>{if(!valid(date))return;const t=find(lead,title);if(!t||t.confirmedDate||t.status==='已完成'||t.dateLocked)return;
  t.confirmedDate=date;t.plannedStart=t.plannedStart||date;t.plannedEnd=t.plannedEnd||date;
  t.triggerSource=source;t.triggerDate=date;t.status='已排程';audit(t,{confirmedDate:{from:'',to:date}},'既有案件已確認日期帶入');changed=true};
 conf('開始受訓日期',lead.trainingStart,'加盟案件受訓日期');
 conf('預計完訓日期',lead.trainingEnd,'加盟案件預計完訓');
 for(const rule of template.triggers){
  if(!rule.enabled)continue;
  const source=find(lead,rule.source),srcDate=dateOf(source);if(!valid(srcDate))continue;
  const [dest,added]=ensure(lead,rule.phase,rule.target,template.id);changed=changed||added;
  const targetDate=addDays(srcDate,Number(rule.offset),rule.dayMode);
  changed=suggest(dest,targetDate,rule.source,srcDate,'根據已確認事件建立建議期限')||changed;
  if(dest.triggerSource===rule.source&&!dest.remindDays){dest.remindDays=clone(rule.reminders||[3,1,0]);changed=true}
 }
 const started=dateOf(find(lead,'實際開工日期'));
 if(valid(started)){
  const days=Number(template.constructionDays)||45;const projected=addDays(started,days);
  let t,added;[t,added]=ensure(lead,'工程裝潢','裝潢工程完成日期',template.id);changed=changed||added;
  changed=suggest(t,projected,'實際開工日期',started,'預估工期（未確認完工日期）',false)||changed;
  const weekly=Number(template.constructionFollowDays)||7;
  for(let n=1;n<=Math.ceil(days/weekly);n++){
   const d=addDays(started,n*weekly);if(d>projected)break;
   [t,added]=ensure(lead,'工程裝潢','工程進度追蹤（第'+n+'週）',template.id);changed=changed||added;
   changed=suggest(t,d,'實際開工日期',started,'依開工日排定工程週追蹤')||changed;
  }
  [t,added]=ensure(lead,'工程裝潢','工程驗收日期',template.id);changed=changed||added;
  changed=suggest(t,addDays(projected,1),'預估完工','', '預估驗收日期，需人工確認',false)||changed;
  let cursor=projected;for(const dependency of template.dependencies){
   if(dependency.source==='裝潢工程完成日期'||template.dependencies.some(x=>x.target===dependency.source)){
    cursor=addDays(cursor,Number(dependency.offset),dependency.mode);
    [t,added]=ensure(lead,template.phases.find(p=>p.tasks.some(j=>j.title===dependency.target))?.name||'開幕籌備',dependency.target,template.id);changed=changed||added;
    changed=suggest(t,cursor,dependency.source,projected,'工程後續建議日期（非正式確認）',false)||changed;
   }
  }
 }
 const trained=dateOf(find(lead,'開始受訓日期'));
 if(valid(trained)){
  let t,added;[t,added]=ensure(lead,'教育訓練','完訓考核日期',template.id);changed=changed||added;
  const end=dateOf(find(lead,'預計完訓日期'));
  if(valid(end))changed=suggest(t,end,'預計完訓日期',end,'考核待安排（非通過）',false)||changed;
 }
 const exam=find(lead,'完訓考核日期');
 if(exam?.examResult==='未通過'){
  const [t,added]=ensure(lead,'教育訓練','補考日期',template.id);changed=changed||added;
  if(t.status==='未安排'&&!t.note){t.note='考核未通過，補考日期待安排';changed=true}
 }
 const opened=find(lead,'確認正式開幕日期');
 const openedDate=dateOf(opened);
 if(valid(openedDate)&&opened?.status==='已完成'){
  if(lead.workflowStage!=='營運輔導'){lead.workflowStage='營運輔導';changed=true}
 }
 if(valid(openedDate)&&opened?.status==='已完成'&&template.monthlyCoaching!==false){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  const localMonth=parts.find(x=>x.type==='year').value+'-'+parts.find(x=>x.type==='month').value;
  const baseMonth=openedDate.slice(0,7)>localMonth?openedDate.slice(0,7):localMonth;
  const [y,m]=baseMonth.split('-').map(Number);
  for(let i=0;i<12;i++){
   const month=new Date(Date.UTC(y,m-1+i,1)).toISOString().slice(0,7);
   const title='每月營運輔導（'+month+'）';const [t,added]=ensure(lead,'營運輔導',title,template.id);changed=changed||added;
   if(added){t.note='待安排 '+month+' 到店輔導，尚無確認日期';t.month=month}
  }
 }
 return changed;
}
function shiftDate(s,n){
 if(!valid(s)||!Number.isInteger(n))return '';
 const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
function markWithdrawn(lead,sourceTitle){
 const t=find(lead,sourceTitle);if(!t)return 0;let n=0;
 for(const x of allTasks(lead))if(x.triggerSource===sourceTitle&&!x.reviewRequired&&!['已完成','已取消'].includes(x.status)){
  x.reviewRequired=true;audit(x,{reviewRequired:{from:false,to:true}},'觸發事件已撤回，需人工檢查');n++
 }
 return n;
}
function previewDelay(lead,sourceTitle,newDate,template=getTemplate(registry(),lead.scheduleTemplateId)){
 const original=find(lead,sourceTitle);
 if(!original||!valid(newDate))return [];
 const oldDate=original.confirmedDate||original.plannedEnd||original.suggestedDate||original.deadline;
 if(!valid(oldDate))return [];
 const diff=Math.round((Date.parse(newDate+'T00:00:00Z')-Date.parse(oldDate+'T00:00:00Z'))/86400000);
 if(!diff)return [];
 const extra=template.phases.flatMap(p=>p.tasks.filter(x=>x.dependsOn).map(x=>({source:x.dependsOn,target:x.title,offset:1})));
 const downstream=new Set(),queue=[sourceTitle];
 while(queue.length){const current=queue.shift();for(const dep of [...template.dependencies,...extra]){
  if(dep.source!==current||downstream.has(dep.target))continue;
  downstream.add(dep.target);queue.push(dep.target)
 }}
 return [...downstream].map(title=>{const t=find(lead,title);if(!t)return null;
  const current=t.confirmedDate||t.plannedEnd||t.plannedStart||t.suggestedDate||t.deadline;
  return {title,id:t.id,current:current||'',proposed:valid(current)?shiftDate(current,diff):addDays(newDate,1),delta:diff,locked:!!(t.dateLocked||t.vendorConfirmed||t.status==='已完成'||t.userNoMove||t.confirmedDate),reason:t.dateLocked?'日期已鎖定':t.vendorConfirmed?'廠商已確認':t.confirmedDate?'已確認日期':t.status==='已完成'?'已完成':''}
 }).filter(Boolean);
}
function applyDelay(lead,items,reason){
 let n=0;for(const item of items){if(!item.accept)continue;const t=allTasks(lead).find(x=>x.id===item.id);if(!t||t.dateLocked||t.vendorConfirmed||t.userNoMove||t.confirmedDate||t.status==='已完成')continue;
  const prev=t.suggestedDate||t.plannedStart||'';
  if(!valid(item.proposed)||prev===item.proposed)continue;
  const changes={suggestedDate:{from:t.suggestedDate||'',to:item.proposed}};
  t.suggestedDate=item.proposed;
  for(const key of ['plannedStart','plannedEnd','deadline'])if(t[key]){
   changes[key]={from:t[key],to:item.proposed};t[key]=item.proposed;
  }
  audit(t,changes,reason||'工程改期確認');n++
 }return n;
}
function createCustomTemplate(name){const cfg=registry(),t=clone(defaultTemplate());t.id='custom-'+Date.now().toString(36);t.name=String(name||'自訂流程').slice(0,50);t.locked=false;cfg.templates.push(t);cfg.activeId=t.id;saveRegistry(cfg);return t}
window.ComebuyScheduleV2={KEY,PHASES,defaultTemplate,registry,saveRegistry,getTemplate,createCustomTemplate,seed,addDays,valid,find,dateOf,ensure,audit,previewDelay,applyDelay,markWithdrawn};
})();