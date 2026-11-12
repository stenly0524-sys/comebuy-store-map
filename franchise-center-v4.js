/* COMEBUY MAPS — Project Center V4: one master record, three read-only views. */
(function(){
'use strict';
const PHASES=['加盟開發','加盟簽約','教育訓練','店面開發','工程裝潢','開幕籌備','正式開幕','營運輔導'];
const SIGNED=['已簽約','受訓中','已開幕'];
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return /^\d{4}-\d{2}-\d{2}$/.test(d)?d:new Date().toISOString().slice(0,10)};
const taskDate=t=>t.confirmedDate||t.deadline||t.plannedEnd||t.plannedStart||t.suggestedDate||'';
const done=t=>t.status==='已完成'||t.status==='已取消';
const iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
const btn=(text,fn,cls)=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b};
let context=null,tab='develop',folderId=null,month=today().slice(0,7),pickedDay=today(),active=false;
function signed(l){return SIGNED.includes(l.stage)||!!l.signedAt}
function tasks(l){return (Array.isArray(l.scheduleTasks)?l.scheduleTasks:[]).filter(t=>t&&String(t.leadId)===String(l.id))}
function all(){return context.getLeads()}
function get(id){return all().find(l=>String(l.id)===String(id))}
function work(){return all().flatMap(lead=>tasks(lead).filter(t=>taskDate(t)&&!done(t)&&t.status!=='暫停').map(task=>({lead,task,date:taskDate(task)})))}
function address(l){return context.linked(l)||l.storeAddress||'尚未選定店址'}
function matchingVacancy(l){const byId=Array.isArray(l.vacancyIds)?l.vacancyIds.map(String):[String(l.vacancyId||'')];return context.vacancies().filter(v=>byId.includes(String(v.id))||String(v.franchiseLeadId||'')===String(l.id))}
function fullAddress(l){const list=matchingVacancy(l);return list.length?list.map(v=>v.address).join('；'):address(l)}
function nextTask(l){return tasks(l).filter(t=>taskDate(t)&&!done(t)).sort((a,b)=>taskDate(a).localeCompare(taskDate(b)))[0]}
function taskByTitle(l,title){return tasks(l).find(t=>t.title===title)}
function dayOf(l,title){const t=taskByTitle(l,title);return t?taskDate(t):''}
function progress(l){const rows=tasks(l),doneCount=rows.filter(t=>t.status==='已完成').length;return {total:rows.length,done:doneCount,pct:rows.length?Math.round(doneCount/rows.length*100):0}}
function record(l,kind,changes){if(!Array.isArray(l.projectHistory))l.projectHistory=[];l.projectHistory.push({at:new Date().toISOString(),type:kind,actor:'local-user',changes})}
function safeSeed(){
 const leads=all(), ids=leads.map(l=>String(l.id));
 if(ids.some(x=>!x)||new Set(ids).size!==ids.length){alert('案件 ID 存在重複或缺漏；為保護原有資料，本次停止整合操作。');return false}
 // An untouched copy of the original local data gives a reversible migration checkpoint.
 const key='cb_project_v4_precutover_v1';
 if(localStorage.getItem(key)===null){
  try{localStorage.setItem(key,localStorage.getItem('comebuy_franchise_leads_v1')||'[]')}
  catch(e){alert('無法建立改版前安全快照，請先匯出 JSON 備份。');return false}
 }
 const snapshot=JSON.stringify(leads);
 try{
  let changed=false;
  for(const l of leads){
   if(!Array.isArray(l.scheduleTasks)){changed=true}
   if(window.ComebuySchedule?.seed(l))changed=true;
  }
  if(ids.some((id,i)=>String(leads[i].id)!==id)||leads.length!==ids.length)throw Error('案件 ID 或數量異動');
  if(changed&&!context.save())throw Error('流程初始化儲存失敗');
  return true;
 }catch(e){
  // Never rewrite the master with an incomplete migration.
  try{const old=JSON.parse(snapshot);leads.forEach((l,i)=>{Object.keys(l).forEach(k=>delete l[k]);Object.assign(l,old[i])})}catch(_){}
  alert('無法安全初始化項目中心：'+e.message);return false;
 }
}
function page(){
 if(!active||!context)return;
 context.setLayout('compact');context.setNav();context.drawer.classList.add('open');
 context.setHeading();context.title.textContent='項目中心';
 context.body.replaceChildren();
 const tabs=el('div','cb-v4-tabs');
 for(const [id,name] of [['develop','加盟開發'],['signed','加盟案件'],['calendar','時程中心']]){
  const b=btn(name,()=>{tab=id;folderId=null;render()},'cb-v4-tab'+(tab===id?' active':''));
  b.setAttribute('aria-selected',String(tab===id));tabs.append(b)
 }
 context.body.append(tabs);
 if(folderId&&tab!=='calendar'){folder();return}
 if(tab==='calendar')calendar();else list();
}
function render(){page()}
function addHeader(label,action,fn){const row=el('div','cb-v4-bar');row.append(el('strong','',label));if(action)row.append(btn(action,fn,'cb-v4-button'));context.body.append(row)}
function list(){
 const signedMode=tab==='signed';const leads=all().filter(l=>signed(l)===signedMode);
 addHeader(signedMode?'已簽約案件（'+leads.length+'）':'未簽約開發（'+leads.length+'）',signedMode?'':'＋ 新增加盟開發',signedMode?null:openAdd);
 if(!leads.length)context.body.append(el('p','cb-v4-empty','目前沒有此類加盟專案'));
 for(const l of leads){
  const card=btn('',()=>{folderId=String(l.id);render()},'cb-v4-folder');
  const heading=el('div','cb-v4-folder-title');heading.append(el('strong','',l.name||'未命名加盟主'),el('span','','›'));card.append(heading);
  const lines=signedMode?[
   fullAddress(l),'階段：'+(tasks(l).find(t=>t.status==='進行中')?.phase||l.stage||'加盟簽約'),
   '下一重要日期：'+(nextTask(l)?nextTask(l).title+' '+taskDate(nextTask(l)):'未安排'),
   '預計開幕：'+(dayOf(l,'預計正式開幕日期')||l.expectedOpeningDate||'未安排'),
   '流程進度：'+progress(l).pct+'%（'+progress(l).done+'/'+progress(l).total+'）'
  ]:[
   (l.city||'')+(l.district||'')+'｜'+(l.phone||'未填電話'),
   '意向：'+(l.stage||'未設定')+'｜最近接洽：'+(l.lastContactDate||l.firstContactDate||'未記錄'),
   '下次追蹤：'+(dayOf(l,'首次追蹤日期')||l.nextFollowUpDate||'未安排'),
   '處理狀態：'+(l.stage||'未設定')
  ];
  for(const line of lines)card.append(el('div','cb-v4-folder-sub',line));
  const late=tasks(l).filter(t=>!done(t)&&taskDate(t)&&taskDate(t)<today()).length;
  if(late)card.append(el('span','cb-v4-alert','⚠ '+late+' 項逾期'));
  const id=el('div','cb-v4-caseid','案件 ID：'+l.id);card.append(id);
  context.body.append(card)
 }
}
function folder(){
 const l=get(folderId);if(!l){folderId=null;render();return}
 const go=()=>{folderId=null;render()};
 const top=el('div','cb-v4-project-head');top.append(btn('‹ 返回清單',go,'cb-v4-back'),el('strong','',l.name||'未命名加盟主'));context.body.append(top);
 context.body.append(el('p','cb-v4-project-meta','案件 ID：'+l.id+'｜'+fullAddress(l)));
 const opts=el('div','cb-v4-project-actions');
 opts.append(btn('店舖／聯絡資訊',()=>editLead(l),'cb-v4-button'));
 if(!signed(l))opts.append(btn('正式簽約',()=>signLead(l),'cb-v4-button primary'));
 context.body.append(opts);
 for(const phase of PHASES){
  const rows=tasks(l).filter(t=>t.phase===phase);
  const completed=rows.filter(t=>t.status==='已完成').length;
  const button=btn('',()=>openPhase(l,phase),'cb-v4-phase');
  button.append(el('strong','',phase),el('span','',completed+'／'+rows.length+'　›'));
  context.body.append(button)
 }
 const related=matchingVacancy(l);if(related.length)context.body.append(el('p','cb-v4-project-meta','關聯空舖 ID：'+related.map(v=>v.id).join('、')));
 const history=el('details','cb-v4-history');history.append(el('summary','','案件修改紀錄（'+(l.projectHistory||[]).length+'）'));
 for(const h of l.projectHistory||[])history.append(el('p','',new Date(h.at).toLocaleString('zh-TW')+'｜'+h.type+'｜'+JSON.stringify(h.changes)));
 context.body.append(history);
}
function openPhase(lead,phase){
 if(!window.ComebuySchedule){alert('流程模組尚未載入');return}
 window.ComebuySchedule.open(context.getLeads,context.save,()=>{render()},context.linked,String(lead.id),phase)
}
function popup(title,draw){
 const mask=el('div','cb-v4-mask'),modal=el('section','cb-v4-modal');
 modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 const header=el('header','cb-v4-modal-head');header.append(el('strong','',title),btn('×',()=>mask.remove(),'cb-v4-close'));
 const body=el('div','cb-v4-modal-content');modal.append(header,body);mask.append(modal);document.body.append(mask);
 mask.onclick=e=>{if(e.target===mask)mask.remove()};draw(body,()=>mask.remove());return mask;
}
function openAdd(){
 popup('新增加盟開發', (body,close)=>{
  const form=el('form','cb-v4-form');
  const fields=[['name','加盟主名稱','text',true],['phone','聯絡電話','tel',true],['messenger','通訊帳號','text'],['city','城市','text'],['district','區域','text'],['storeAddress','展店地址','text'],['firstContactDate','首次接洽日期','date'],['note','接洽備註','textarea']];
  for(const [key,label,type,required] of fields){const wrap=el('label','',label);let input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.name=key;input.required=!!required;wrap.append(input);form.append(wrap)}
  form.append(btn('建立加盟專案',()=>{},'cb-v4-primary'));form.lastElementChild.type='submit';
  form.onsubmit=e=>{
   e.preventDefault();const data=Object.fromEntries(new FormData(form).entries());
   if(!String(data.name||'').trim()||!String(data.phone||'').trim())return;
   const id=String(Date.now())+'-'+Math.random().toString(36).slice(2);
   if(get(id)){alert('案件 ID 重複，請重新建立');return}
   const l={id,franchiseType:'新加盟主',stage:'新名單',...data,region:(data.city||'')+(data.district||''),scheduleTasks:[],projectHistory:[]};
   record(l,'建立加盟開發',{id,name:l.name,firstContactDate:l.firstContactDate||''});
   all().unshift(l);
   if(!context.save()){all().shift();return}
   close();folderId=id;render()
  };
  body.append(form)
 })
}
function editLead(l){
 popup('加盟專案資料', (body,close)=>{
  const form=el('form','cb-v4-form');
  const defs=[['name','加盟主名稱'],['phone','聯絡電話'],['messenger','通訊帳號'],['city','城市'],['district','區域'],['storeAddress','展店地址'],['firstContactDate','首次接洽日期'],['lastContactDate','最近接洽日期'],['nextFollowUpDate','下次追蹤日期'],['expectedOpeningDate','預計開幕日期'],['actualOpeningDate','正式開幕日期'],['note','備註']];
  for(const [key,label] of defs){const wrap=el('label','',label),input=el('input');input.type=key.toLowerCase().includes('date')?'date':'text';input.name=key;input.value=l[key]||'';if(key==='name'||key==='phone')input.required=true;
   if(key==='storeAddress'&&matchingVacancy(l).length)input.readOnly=true;
   wrap.append(input);form.append(wrap)}
  form.append(btn('儲存修改',()=>{},'cb-v4-primary'));form.lastElementChild.type='submit';
  form.onsubmit=e=>{
   e.preventDefault();const previous=JSON.parse(JSON.stringify(l)),changes={};
   for(const [key] of defs){const v=String(form.elements.namedItem(key).value||'').trim();if(v!==String(l[key]||'')){changes[key]={from:l[key]||'',to:v};l[key]=v}}
   if(!l.name||!l.phone){Object.assign(l,previous);return}
   l.region=(l.city||'')+(l.district||'');
   if(Object.keys(changes).length)record(l,'修改案件主檔',changes);
   if(!context.save()){Object.keys(l).forEach(k=>delete l[k]);Object.assign(l,previous);return}
   close();render()
  };body.append(form)
 })
}
function signLead(l){
 popup('正式簽約確認',(body,close)=>{
  const form=el('form','cb-v4-form'),label=el('label','','正式簽約日期'),date=el('input');
  date.type='date';date.required=true;date.value=today();label.append(date);form.append(label);
  form.append(el('p','cb-v4-help','確認後會保留原接洽資料，並將同一案件移入「加盟案件」。'));
  form.append(btn('確認正式簽約',()=>{},'cb-v4-primary'));form.lastElementChild.type='submit';
  form.onsubmit=e=>{
   e.preventDefault();if(!iso(date.value))return;
   const previous=JSON.parse(JSON.stringify(l));
   const schedule=tasks(l).find(t=>t.title==='正式簽約日期');
   if(!schedule){alert('簽約工作尚未建立，請重新載入案件');return}
   if(schedule.confirmedDate&&schedule.confirmedDate!==date.value&&!window.confirm('已存在不同的正式簽約日期，確認變更？'))return;
   const old=schedule.confirmedDate||'';
   schedule.confirmedDate=date.value;schedule.status='已完成';schedule.completedAt=date.value;
   if(!Array.isArray(schedule.changes))schedule.changes=[];
   schedule.changes.push({at:new Date().toISOString(),reason:'正式簽約確認',actor:'local-user',changes:{confirmedDate:{from:old,to:date.value}}});
   l.stage='已簽約';l.signedAt=date.value;
   record(l,'正式簽約',{stage:{from:previous.stage,to:'已簽約'},signedAt:{from:previous.signedAt||'',to:date.value}});
   if(!context.save()){Object.keys(l).forEach(k=>delete l[k]);Object.assign(l,previous);return}
   close();folderId=null;tab='signed';render()
  };body.append(form)
 })
}
function calendar(){
 const jobs=work(),todayStr=today();const year=Number(month.slice(0,4)),mon=Number(month.slice(5,7));
 const heading=el('div','cb-v4-month');heading.append(btn('‹',()=>{month=new Date(Date.UTC(year,mon-2,1)).toISOString().slice(0,7);calendarRefresh()},'cb-v4-month-arrow'),el('strong','',month),btn('›',()=>{month=new Date(Date.UTC(year,mon,1)).toISOString().slice(0,7);calendarRefresh()},'cb-v4-month-arrow'));context.body.append(heading);
 const grid=el('div','cb-v4-calendar');for(const day of ['日','一','二','三','四','五','六'])grid.append(el('span','cb-v4-week',day));
 const first=new Date(Date.UTC(year,mon-1,1)),offset=first.getUTCDay(),last=new Date(Date.UTC(year,mon,0)).getUTCDate();
 for(let i=0;i<offset;i++)grid.append(el('span','cb-v4-empty',''));
 for(let n=1;n<=last;n++){
  const d=month+'-'+String(n).padStart(2,'0'),count=jobs.filter(x=>x.date===d).length;
  const day=btn(String(n),()=>{pickedDay=d;render()},'cb-v4-day'+(d===todayStr?' today':'')+(d===pickedDay?' selected':''));
  if(count)day.append(el('span','cb-v4-dot','●'));
  grid.append(day)
 }context.body.append(grid);
 const sections=[
  ['當日待辦',jobs.filter(x=>x.date===pickedDay)],
  ['即將到期（7天）',jobs.filter(x=>x.date>todayStr&&x.date<=addDays(todayStr,7)).sort((a,b)=>a.date.localeCompare(b.date))],
  ['已逾期',jobs.filter(x=>x.date<todayStr).sort((a,b)=>a.date.localeCompare(b.date))]
 ];
 for(const [label,items] of sections){
  context.body.append(el('h3','cb-v4-section-title',label+'（'+items.length+'）'));
  if(!items.length)context.body.append(el('p','cb-v4-empty','無待辦項目'));
  for(const x of items.slice(0,40)){
   const button=btn('',()=>openPhase(x.lead,x.task.phase),'cb-v4-job');
   button.append(el('strong','',x.lead.name+'｜'+x.task.title),el('span','',x.date+'｜'+x.task.phase+'｜'+fullAddress(x.lead)));
   context.body.append(button)
  }
 }
 context.body.append(el('h3','cb-v4-section-title','加盟主專案清單（'+all().length+'）'));
 for(const lead of all()){
  const b=btn((lead.name||'未命名')+'｜'+fullAddress(lead),()=>{tab=signed(lead)?'signed':'develop';folderId=String(lead.id);render()},'cb-v4-project-link');
  context.body.append(b)
 }
}
function addDays(date,n){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function calendarRefresh(){render()}
function open(ctx){
 context=ctx;tab='develop';folderId=null;month=today().slice(0,7);pickedDay=today();active=true;
 if(!window.ComebuySchedule||!safeSeed()){active=false;return}
 render()
}
function refresh(){if(active)render()}
document.addEventListener('cb:franchise-schedule-saved',refresh);
window.ComebuyProjectV4={open,refresh,phases:PHASES};
})();