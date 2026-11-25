/* COMEBUY MAPS — Project Center V4: one master record, three read-only views. */
(function(){
'use strict';
const PHASES=['加盟開發','加盟簽約','教育訓練','店面開發','工程裝潢','開幕籌備','正式開幕','營運輔導'];
const SIGNED=['已簽約','受訓中','已開幕'];
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=k=>parts.find(x=>x.type===k)?.value||'';return get('year')+'-'+get('month')+'-'+get('day')};
const taskDate=t=>t.confirmedDate||t.deadline||t.plannedEnd||t.plannedStart||t.suggestedDate||'';
const done=t=>t.status==='已完成'||t.status==='已取消';
const iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(cls==='cb-v4-section-title')e.style.cssText='display:table;width:max-content;max-width:100%;background:#fbe9ea;color:#a71924;border-radius:5px;padding:3px 7px;box-sizing:border-box';if(text!=null)e.textContent=text;return e};
const btn=(text,fn,cls)=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b};
let context=null,tab='calendar',folderId=null,month=today().slice(0,7),pickedDay=today(),active=false;
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
 for(const [id,name] of [['calendar','時程中心'],['work','工作任務'],['develop','加盟開發']]){
  const b=btn(name,()=>{tab=id;folderId=null;render()},'cb-v4-tab'+(tab===id?' active':''));
  b.setAttribute('aria-selected',String(tab===id));tabs.append(b)
 }
 context.body.append(tabs);
 if(folderId&&tab!=='calendar'){folder();return}
 if(tab==='calendar')calendar();else if(tab==='work')workPage();else list();
}
function render(){page()}
function addHeader(label,action,fn){const row=el('div','cb-v4-bar');row.append(el('strong','',label));if(action)row.append(btn(action,fn,'cb-v4-button'));context.body.append(row)}
function list(){
 const leads=all();addHeader('加盟開發（'+leads.length+'）','＋ 新增加盟開發',openAdd);
 for(const signedMode of [false,true]){const group=leads.filter(l=>signed(l)===signedMode);context.body.append(el('h3','cb-v4-section-title',(signedMode?'已簽約案件':'未簽約開發')+'（'+group.length+'）'));
 if(!leads.length)context.body.append(el('p','cb-v4-empty','目前沒有此類加盟專案'));
 for(const l of group){
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
 }}
}
function folder(){
 const l=get(folderId);if(!l){folderId=null;render();return}
 const go=()=>{folderId=null;render()};
 const top=el('div','cb-v4-project-head');top.append(btn('‹ 返回清單',go,'cb-v4-back'),el('strong','',l.name||'未命名加盟主'));context.body.append(top);
 context.body.append(el('p','cb-v4-project-meta','案件 ID：'+l.id+'｜'+fullAddress(l)));
 const opts=el('div','cb-v4-project-actions');
 opts.append(btn('店舖／聯絡資訊',()=>editLead(l),'cb-v4-button'));
 if(!signed(l))opts.append(btn('正式簽約',()=>signLead(l),'cb-v4-button primary'));
 const remove=btn('刪除加盟主',()=>deleteLead(l),'cb-v4-button');remove.style.color='#d71920';opts.append(remove);
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
function deleteLead(l){
 const related=matchingVacancy(l);
 popup('刪除加盟主確認',(body,close)=>{
  body.append(el('p','cb-v4-help','確定刪除「'+(l.name||'未命名加盟主')+'」？案件資料及其時程將一併移除，空舖資料不會刪除。此操作無法直接復原。'));
  if(related.length){body.append(el('p','cb-v4-help','此案件仍有 '+related.length+' 筆關聯空舖，請先解除關聯後再刪除，以避免留下無效關聯。'));body.append(btn('返回',close,'cb-v4-button'));return}
  const actions=el('div','cb-v4-project-actions');
  const confirm=btn('確認刪除',()=>{const leads=all(),i=leads.findIndex(x=>String(x.id)===String(l.id));if(i<0)return;const removed=leads.splice(i,1)[0];try{if(!context.save())throw Error('儲存失敗')}catch(e){leads.splice(i,0,removed);alert('刪除失敗，原資料已保留');return}close();folderId=null;render()},'cb-v4-button primary');confirm.style.background='#d71920';confirm.style.color='#fff';actions.append(btn('取消',close,'cb-v4-button'),confirm);body.append(actions)
 })
}
function openPhase(lead,phase,taskId=''){
 if(!window.ComebuySchedule){alert('流程模組尚未載入');return}
 window.ComebuySchedule.open(context.getLeads,context.save,()=>{render()},context.linked,String(lead.id),phase,taskId)
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
   // A real first-contact date is an actual completed event; auto-rules then
   // suggest the first follow-up in 7 days, never a duplicated task.
   if(window.ComebuySchedule?.seed(l)&&iso(l.firstContactDate)){
    const contact=taskByTitle(l,'首次接洽日期');
    if(contact&&!contact.confirmedDate){
     contact.confirmedDate=l.firstContactDate;
     contact.completedAt=l.firstContactDate;
     contact.status='已完成';
     contact.changes.push({at:new Date().toISOString(),reason:'首次接洽建檔',actor:'local-user',changes:{confirmedDate:{from:'',to:l.firstContactDate}}});
    }
    window.ComebuySchedule.seed(l);
   }
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
   close();folderId=null;tab='develop';render()
  };body.append(form)
 })
}

const WEEKLY_KEY='comebuy_weekly_tasks_v1';
function weeklyRead(){try{const a=JSON.parse(localStorage.getItem(WEEKLY_KEY)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
function weeklySave(a){try{localStorage.setItem(WEEKLY_KEY,JSON.stringify(a));return true}catch{alert('儲存失敗，請檢查本機空間');return false}}
function weeklyStart(d){return addDays(d,-((new Date(d+'T00:00:00Z').getUTCDay()+6)%7))}
function weeklyEdit(task){popup(task?'編輯每週任務':'新增每週任務',(body,close)=>{
 const form=el('form','cb-v4-form'),label=el('label','','任務名稱'),input=el('input');input.required=true;input.maxLength=120;input.value=task?.title||'';input.placeholder='智能升級專案會議';label.append(input);form.append(label);
 const dayLabel=el('label','','固定星期（選填）'),day=el('select');['不限星期','週一','週二','週三','週四','週五','週六','週日'].forEach((n,i)=>{const o=el('option','',n);o.value=String(i);day.append(o)});day.value=String(task?.day||0);dayLabel.append(day);form.append(dayLabel);
 const save=btn('儲存任務',()=>{},'cb-v4-primary');save.type='submit';const actions=el('div');actions.style.cssText='display:grid;grid-template-columns:'+(task?'minmax(0,2fr) minmax(0,1fr)':'minmax(0,1fr)')+';gap:8px;align-items:stretch;width:100%';save.style.cssText='width:100%;min-width:0;margin:0;box-sizing:border-box';actions.append(save);form.onsubmit=e=>{e.preventDefault();const title=input.value.trim();if(!title)return;const a=weeklyRead(),v={...task,id:task?.id||String(Date.now())+'-'+Math.random().toString(36).slice(2),title,day:Number(day.value)};const i=a.findIndex(x=>x.id===v.id);if(i<0)a.push(v);else a[i]=v;if(weeklySave(a)){close();render()}};
 if(task){const del=btn('刪除任務',()=>{if(confirm('確定刪除此每週任務？')&&weeklySave(weeklyRead().filter(x=>x.id!==task.id))){close();render()}},'cb-v4-secondary');del.style.cssText='width:100%;min-width:0;margin:0;box-sizing:border-box';actions.append(del)}form.append(actions);body.append(form)
})}
function taskSubheading(label,action){const row=el('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;width:calc(100% - 12px);margin:6px auto;box-sizing:border-box;padding:5px 8px;border-radius:6px;background:linear-gradient(90deg,#c51d29 0%,#fbe9ea 100%)';const title=el('strong','',label);title.style.cssText='color:#fff;font-size:14px;line-height:22px';const b=btn('＋ 新增任務',action,'cb-v4-secondary');b.style.cssText='width:auto;min-width:0;margin:0;flex:0 0 auto';row.append(title,b);context.body.append(row)}
function weeklySection(){const a=weeklyRead(),week=weeklyStart(pickedDay);taskSubheading('每週任務（'+a.length+'）',()=>weeklyEdit(null));
 if(!a.length)context.body.append(el('p','cb-v4-empty','尚無每週任務'));
 for(const t of a){const row=el('div','cb-v4-job');row.style.cssText='display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:flex-start;gap:6px;padding:4px 8px;margin:2px 0;min-height:30px;height:auto;box-sizing:border-box';const check=el('input');check.type='checkbox';check.style.cssText='flex:0 0 16px;width:16px;height:16px;margin:0';check.checked=!!t.completed?.[week];check.setAttribute('aria-label','完成 '+t.title);check.onchange=()=>{const next=weeklyRead(),v=next.find(x=>x.id===t.id);if(!v)return;v.completed={...v.completed,[week]:check.checked};if(weeklySave(next))render();else check.checked=!check.checked};const title=el('strong','',t.title+'（每週）'+(t.day?'｜週'+'一二三四五六日'[t.day-1]:''));title.style.cssText='flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;line-height:20px';title.title=t.title;if(check.checked)title.style.textDecoration='line-through';const edit=btn('編輯',()=>weeklyEdit(t),'cb-v4-secondary');edit.style.cssText='flex:0 0 auto;width:auto;min-width:0;min-height:24px;padding:2px 6px;margin:0;font-size:12px;line-height:18px';row.append(check,title,edit);context.body.append(row)}
}


const DAILY_KEY='comebuy_daily_tasks_v1';
function dailyRead(){try{const a=JSON.parse(localStorage.getItem(DAILY_KEY)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
function dailySave(a){try{localStorage.setItem(DAILY_KEY,JSON.stringify(a));return true}catch{alert('儲存失敗');return false}}
function dailyEdit(date,task){const meeting=!task||task.kind==='meeting';popup(meeting?(task?'編輯會議':'新增會議'):'編輯任務',(body,close)=>{
 const form=el('form','cb-v4-form'),fields=[['title',meeting?'會議名稱':'任務名稱','text',task?.title||''],['date','日期','date',date],['time','時間','time',task?.time||''],['note','備註','textarea',task?.note||'']];
 for(const [key,label,type,value] of fields){const l=el('label','',label),i=el(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;i.name=key;i.value=value;i.required=key==='title'||key==='date'||(meeting&&key==='time');l.style.cssText='display:block;min-width:0;max-width:100%;box-sizing:border-box';i.style.cssText='display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box';if(type==='time'||type==='date'){i.style.webkitAppearance='none';i.style.appearance='none';i.style.textAlign='left'}l.append(i);form.append(l)}
 const b=btn('儲存任務',()=>{},'cb-v4-primary');b.type='submit';const actions=el('div');actions.style.cssText='display:grid;grid-template-columns:'+(task?'minmax(0,2fr) minmax(0,1fr)':'minmax(0,1fr)')+';gap:8px;width:100%;align-items:stretch';b.style.cssText='width:100%;min-width:0;margin:0;box-sizing:border-box';actions.append(b);form.append(actions);form.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form));v.title=v.title.trim();if(!v.title||!iso(v.date)||(meeting&&!v.time))return;const a=dailyRead(),item={...task,...v,kind:meeting?'meeting':'task',id:task?.id||String(Date.now())+'-'+Math.random().toString(36).slice(2)};const i=a.findIndex(x=>x.id===item.id);if(i<0)a.push(item);else a[i]=item;if(dailySave(a)){pickedDay=v.date;month=v.date.slice(0,7);close();render()}};
 if(task){const del=btn('刪除任務',()=>{if(confirm('確定刪除任務？')&&dailySave(dailyRead().filter(x=>x.id!==task.id))){close();render()}},'cb-v4-secondary');del.style.cssText='width:100%;min-width:0;margin:0;box-sizing:border-box';actions.append(del)}body.append(form)
})}
function dailyRow(t){const row=el('div','cb-v4-job');row.style.cssText='display:flex;flex-direction:row;align-items:center;gap:6px;padding:4px 8px;min-height:30px';const c=el('input');c.type='checkbox';c.checked=!!t.done;c.style.cssText='width:16px;height:16px;flex:0 0 16px';c.onchange=()=>{const a=dailyRead(),v=a.find(x=>x.id===t.id);if(v){v.done=c.checked;if(dailySave(a))render();else c.checked=!c.checked}};const title=el('strong','',(t.time?t.time+' ':'')+t.title);title.style.cssText='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px'+(t.done?';text-decoration:line-through':'');row.append(c,title,btn('編輯',()=>dailyEdit(t.date,t),'cb-v4-secondary'));return row}


const ROUTINE_KEY='comebuy_routine_tasks_v1';
function routineRead(){try{const a=JSON.parse(localStorage.getItem(ROUTINE_KEY)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
function routineSave(a){try{localStorage.setItem(ROUTINE_KEY,JSON.stringify(a));return true}catch{alert('儲存失敗');return false}}
function routineEdit(t){popup(t?'編輯待辦任務':'新增待辦任務',(body,close)=>{const f=el('form','cb-v4-form'),l=el('label','','任務名稱'),i=el('input');i.required=true;i.value=t?.title||'';l.append(i);f.append(l);const date=el('input'),time=el('input');for(const [label,field,type,value] of [['日期（選填）',date,'date',t?.date||''],['時間（選填）',time,'time',t?.time||'']]){const wrap=el('label','',label);field.type=type;field.value=value;field.style.cssText='display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;appearance:none;-webkit-appearance:none';wrap.append(field);f.append(wrap)}const a=el('div');a.style.cssText='display:grid;gap:8px;grid-template-columns:'+(t?'2fr 1fr':'1fr');const b=btn('儲存任務',()=>{},'cb-v4-primary');b.type='submit';a.append(b);if(t)a.append(btn('刪除任務',()=>{if(confirm('確定刪除？')&&routineSave(routineRead().filter(x=>x.id!==t.id))){close();render()}},'cb-v4-secondary'));f.append(a);f.onsubmit=e=>{e.preventDefault();const title=i.value.trim();if(!title)return;if(time.value&&!date.value){alert('設定時間時請選擇日期');return}const rows=routineRead(),v={...t,title,date:date.value,time:time.value,id:t?.id||String(Date.now())+'-'+Math.random().toString(36).slice(2)},idx=rows.findIndex(x=>x.id===v.id);if(idx<0)rows.push(v);else rows[idx]=v;if(routineSave(rows)){close();render()}};body.append(f)})}
function routineSection(){const a=routineRead();taskSubheading('待辦任務（'+a.length+'）',()=>routineEdit(null));if(!a.length)context.body.append(el('p','cb-v4-empty','尚無待辦任務'));for(const t of a){const row=el('div','cb-v4-job');row.style.cssText='display:flex;flex-direction:row;align-items:center;gap:6px;padding:4px 8px;min-height:30px';const c=el('input');c.type='checkbox';c.checked=!!t.done;c.style.cssText='width:16px;height:16px;flex:0 0 16px';c.onchange=()=>{const a=routineRead(),v=a.find(x=>x.id===t.id);if(v){v.done=c.checked;if(routineSave(a))render();else c.checked=!c.checked}};const title=el('strong','',t.title+(t.date?'｜'+t.date+(t.time?' '+t.time:''):''));title.style.cssText='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px'+(t.done?';text-decoration:line-through':'');row.append(c,title,btn('編輯',()=>routineEdit(t),'cb-v4-secondary'));context.body.append(row)}}
function workPage(){pickedDay=today();routineSection();weeklySection()}

function calendar(){
 const meetings=dailyRead().filter(t=>t.kind==='meeting'),personal=[...dailyRead().filter(t=>t.kind!=='meeting'),...routineRead().filter(t=>iso(t.date)).map(t=>({...t,routine:true}))],jobs=work(),todayStr=today();const year=Number(month.slice(0,4)),mon=Number(month.slice(5,7));
 const heading=el('div','cb-v4-month');heading.append(btn('‹',()=>{month=new Date(Date.UTC(year,mon-2,1)).toISOString().slice(0,7);calendarRefresh()},'cb-v4-month-arrow'),el('strong','',month),btn('›',()=>{month=new Date(Date.UTC(year,mon,1)).toISOString().slice(0,7);calendarRefresh()},'cb-v4-month-arrow'));context.body.append(heading);
 const grid=el('div','cb-v4-calendar');for(const day of ['日','一','二','三','四','五','六'])grid.append(el('span','cb-v4-week',day));
 const first=new Date(Date.UTC(year,mon-1,1)),offset=first.getUTCDay(),last=new Date(Date.UTC(year,mon,0)).getUTCDate();
 for(let i=0;i<offset;i++)grid.append(el('span','cb-v4-empty',''));
 for(let n=1;n<=last;n++){
  const d=month+'-'+String(n).padStart(2,'0'),count=jobs.filter(x=>x.date===d).length+personal.filter(x=>x.date===d&&!x.done).length+meetings.filter(x=>x.date===d).length;
  const day=btn(String(n),()=>{pickedDay=d;render()},'cb-v4-day'+(d===todayStr?' today':'')+(d===pickedDay?' selected':''));
  if(count)day.append(el('span','cb-v4-dot','●'));const events=[...meetings,...personal].filter(x=>x.date===d);if(events.length){day.title=events.map(x=>(x.time||'')+' '+x.title).join('\n');day.setAttribute('aria-label',d+' '+day.title)}
  grid.append(day)
 }context.body.append(grid);const meetingHead=el('div');meetingHead.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px';const plus=btn('+',()=>dailyEdit(pickedDay),'cb-v4-secondary');plus.setAttribute('aria-label','新增會議');plus.style.cssText='width:32px;min-width:32px;height:32px;padding:0;margin:0;font-size:22px;flex:0 0 32px';meetingHead.append(el('h3','cb-v4-section-title','會議（'+meetings.length+'）'),plus);context.body.append(meetingHead);for(const t of meetings.sort((a,b)=>Number(b.date===pickedDay)-Number(a.date===pickedDay)||(a.date+a.time).localeCompare(b.date+b.time))){const b=btn(t.date+' '+t.time+'｜'+t.title,()=>dailyEdit(t.date,t),'cb-v4-job');b.style.cssText='display:block;text-align:left;padding:5px 8px;min-height:30px;white-space:normal';context.body.append(b)}
 const sections=[
  ['當日待辦',jobs.filter(x=>x.date===pickedDay)],
  ['即將到期（7天）',jobs.filter(x=>x.date>todayStr&&x.date<=addDays(todayStr,7)).sort((a,b)=>a.date.localeCompare(b.date))],
  ['已逾期',jobs.filter(x=>x.date<todayStr).sort((a,b)=>a.date.localeCompare(b.date))]
 ];
 for(const [label,items] of sections){
  const extra=personal.filter(t=>label==='當日待辦'?t.date===pickedDay:!t.done&&(label==='已逾期'?t.date<todayStr:t.date>todayStr&&t.date<=addDays(todayStr,7)));context.body.append(el('h3','cb-v4-section-title',label+'（'+(items.length+extra.length)+'）'));for(const t of extra){if(t.routine){const b=btn(t.date+' '+(t.time||'')+'｜'+t.title,()=>routineEdit(t),'cb-v4-job');context.body.append(b)}else context.body.append(dailyRow(t));}
  if(!items.length&&!extra.length)context.body.append(el('p','cb-v4-empty','無待辦項目'));
  for(const x of items.slice(0,40)){
   const button=btn('',()=>openPhase(x.lead,x.task.phase,x.task.id),'cb-v4-job');
   button.append(el('strong','',x.lead.name+'｜'+x.task.title),el('span','',x.date+'｜'+x.task.phase+'｜'+fullAddress(x.lead)));
   context.body.append(button)
  }
 }
 context.body.append(el('h3','cb-v4-section-title','加盟主專案清單（'+all().length+'）'));
 for(const lead of all()){
  const b=btn((lead.name||'未命名')+'｜'+fullAddress(lead),()=>{tab='develop';folderId=String(lead.id);render()},'cb-v4-project-link');
  context.body.append(b)
 }
}
function addDays(date,n){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function calendarRefresh(){render()}
function open(ctx){
 context=ctx;tab='calendar';folderId=null;month=today().slice(0,7);pickedDay=today();active=true;
 if(!window.ComebuySchedule||!safeSeed()){active=false;return}
 render()
}
function refresh(){if(active)render()}
document.addEventListener('cb:franchise-schedule-saved',refresh);
window.ComebuyProjectV4={open,refresh,phases:PHASES};
})();