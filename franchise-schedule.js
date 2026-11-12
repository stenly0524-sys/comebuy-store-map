(function(){
'use strict';
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
const STATUS=['未安排','已排程','進行中','已完成','已逾期','暫停','已取消'];
const DEFAULT_RULES={firstFollowDays:7,intentSignDays:3,signTrainingDays:3,handOverSurveyDays:3,constructionFollowDays:7,openFollow7Days:7,openFollow30Days:30,coachingMonthly:true,reminders:[3,1,0]};
const RULE_KEY='cb_schedule_rules_v1';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const localToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/\//g,'-');
const dateRe=/^\d{4}-\d{2}-\d{2}$/;
const dayUTC=s=>Date.parse(s+'T00:00:00Z');
function addDays(s,n){if(!dateRe.test(s)||!Number.isFinite(dayUTC(s)))return '';return new Date(dayUTC(s)+Math.trunc(n)*86400000).toISOString().slice(0,10)}
function daysBetween(a,b){return Math.round((dayUTC(b)-dayUTC(a))/86400000)}
const isSigned=v=>['已簽約','受訓中'].includes(v.stage);
const isDone=t=>t.status==='已完成'||t.status==='已取消';
const due=t=>t.deadline||t.plannedEnd||t.plannedStart||'';
function displayedStatus(t,today=localToday()){return !isDone(t)&&t.status!=='暫停'&&due(t)&&due(t)<today?'已逾期':t.status}
function reminderText(t,now=localToday(),rules=defaults()){
 if(isDone(t)||t.status==='暫停')return '';
 const target=due(t);if(!target)return '';
 const diff=daysBetween(now,target);
 if(diff<0)return '逾期 '+(-diff)+' 天';
 if(diff===0)return '今日到期';
 if((rules.reminders||[3,1,0]).includes(diff))return '提醒：'+diff+' 天後到期';
 return '';
}
function defaults(){try{return {...DEFAULT_RULES,...JSON.parse(localStorage.getItem(RULE_KEY)||'{}')}}catch{return {...DEFAULT_RULES}}}
const idFor=(phase,title)=>{const p=PHASES.find(x=>x[0]===phase),i=p?.indexOf(title)??-1;return i>=1?'schedule-'+(PHASES.indexOf(p)+1)+'-'+i:'schedule-extra-'+encodeURIComponent(phase+'|'+title)};
function blank(lead,phase,title){const now=new Date().toISOString();return {id:idFor(phase,title),leadId:String(lead.id),phase,title,plannedStart:'',plannedEnd:'',deadline:'',completedAt:'',remindAt:'',owner:'',status:'未安排',note:'',changes:[],createdAt:now,updatedAt:now}}
function allTasks(lead){const tasks=Array.isArray(lead.scheduleTasks)?lead.scheduleTasks:[];return tasks.filter(t=>t&&typeof t.id==='string'&&t.leadId===String(lead.id))}
function task(lead,title){return allTasks(lead).find(x=>x.title===title)}
function changeTask(t,updates,reason='系統自動排程'){
 const old={plannedStart:t.plannedStart||'',plannedEnd:t.plannedEnd||'',deadline:t.deadline||''};
 const changes=Object.fromEntries(['plannedStart','plannedEnd','deadline'].filter(k=>Object.hasOwn(updates,k)&&updates[k]!==old[k]).map(k=>[k,{from:old[k],to:updates[k]}]));
 if(Object.keys(changes).length)t.changes.push({at:new Date().toISOString(),reason,changes});
 Object.assign(t,updates);t.updatedAt=new Date().toISOString();
}
function scheduleIfBlank(lead,title,date,reason){
 if(!date)return false;const t=task(lead,title);if(!t||t.plannedStart||t.plannedEnd||t.deadline||isDone(t))return false;
 changeTask(t,{plannedStart:date,plannedEnd:date,deadline:date,status:'已排程'},reason);return true
}
function seed(lead,rules=defaults()){return window.ComebuyScheduleV2?window.ComebuyScheduleV2.seed(lead,PHASES,rules):false}

function all(leads){return leads.flatMap(l=>allTasks(l).map(t=>({lead:l,task:t})))}
function createApp(getLeads,saveFranchise,showFranchise,linkedVacancyAddress,initialLeadId=''){
 let view=initialLeadId?'timeline':'list',filterLead=initialLeadId,filterPhase='',filterState='',filterType='',filterOwner='',dateFrom='',dateTo='',month=localToday().slice(0,7);
 const leads=getLeads();let touched=false;for(const lead of leads)touched=seed(lead)||touched;if(touched&&!saveFranchise())throw Error('時程初始化儲存失敗');
 const overlay=document.createElement('div');overlay.className='cb-schedule-overlay';
 overlay.innerHTML='<section role="dialog" aria-modal="true" class="cb-schedule-modal"><header class="cb-schedule-header"><strong>加盟時程中心</strong><div class="cb-schedule-head-actions"><button type="button" class="cb-schedule-template" aria-label="流程模板設定" title="流程模板設定">⚙</button><button type="button" class="cb-schedule-close" aria-label="關閉">×</button></div></header><div class="cb-schedule-body"></div></section>';
 document.body.appendChild(overlay);
 const body=overlay.querySelector('.cb-schedule-body');
 const close=()=>{document.removeEventListener('keydown',key);overlay.remove()};
 const key=e=>{if(e.key==='Escape')close()};
 document.addEventListener('keydown',key);overlay.querySelector('.cb-schedule-close').onclick=close;
 overlay.querySelector('.cb-schedule-template').onclick=()=>templateSettings();
 overlay.onclick=e=>{if(e.target===overlay)close()};
 const button=(label,fn,cls='')=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className=cls;b.onclick=fn;return b};
 const elem=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
 const opts=(select,options)=>{for(const [value,label] of options){const o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o)}};
 const today=()=>localToday();
 const active=()=>all(getLeads());
 const visible=()=>active().filter(({lead,task:t})=>(!filterLead||lead.id===filterLead)&&(!filterType||(filterType==='signed'?isSigned(lead):!isSigned(lead)))&&(!filterPhase||t.phase===filterPhase)&&(!filterState||displayedStatus(t)===filterState)&&(!filterOwner||t.owner===filterOwner)&&(!dateFrom||due(t)>=dateFrom)&&(!dateTo||due(t)<=dateTo));
 const card=(title,value)=>{const e=elem('div','cb-schedule-kpi');e.append(elem('span','',title),elem('strong','',String(value)));return e};
 function render(){
  const records=visible(),allRecords=active(),now=today(),in7=addDays(now,7),ym=now.slice(0,7);
  const actionable=allRecords.filter(({task:t})=>!isDone(t)&&t.status!=='暫停'&&due(t));
  const planned=(title)=>allRecords.filter(({task:t})=>t.title===title&&due(t)?.startsWith(ym)&&!isDone(t)).length;
  body.replaceChildren();
  const kpis=elem('div','cb-schedule-kpis');
  [['今日待辦',actionable.filter(x=>due(x.task)===now).length],['未來7天待辦',actionable.filter(x=>due(x.task)>now&&due(x.task)<=in7).length],['已逾期',actionable.filter(x=>due(x.task)<now).length],['本月預計簽約',planned('預定簽約日期')],['本月預計開幕',planned('預計正式開幕日期')],['本月待執行輔導',allRecords.filter(({task:t})=>t.phase==='營運輔導'&&!isDone(t)&&(due(t).startsWith(ym)||t.title.includes('（'+ym+'）'))).length]].forEach(([name,count])=>kpis.append(card(name,count)));
  body.append(kpis);
  const toolbar=elem('div','cb-schedule-toolbar');
  [['list','待辦清單'],['calendar','月曆'],['timeline','案件時間軸'],['gantt','工程甘特圖'],['coaching','營運輔導']].forEach(([v,l])=>toolbar.append(button(l,()=>{view=v;render()},v===view?'active':'')));
  body.append(toolbar);
  const filters=elem('div','cb-schedule-filters');
  const makeSelect=(label,values,val,cb)=>{const wrap=elem('label','',label),sel=elem('select');opts(sel,values);sel.value=val;sel.onchange=()=>{cb(sel.value);render()};wrap.append(sel);filters.append(wrap)};
  makeSelect('案件',[['','全部案件'],...getLeads().map(l=>[l.id,l.name||l.id])],filterLead,x=>filterLead=x);
  makeSelect('階段',[['','全部階段'],...PHASES.map(x=>[x[0],x[0]])],filterPhase,x=>filterPhase=x);
  makeSelect('狀態',[['','全部狀態'],...STATUS.map(x=>[x,x])],filterState,x=>filterState=x);
  makeSelect('案件類型',[['','全部類型'],['unsigned','加盟開發'],['signed','加盟案件']],filterType,x=>filterType=x);
  makeSelect('負責人',[['','全部負責人'],...[...new Set(allRecords.map(x=>x.task.owner).filter(Boolean))].sort().map(x=>[x,x])],filterOwner,x=>filterOwner=x);
  for(const [name,value,setValue] of [['開始日期',dateFrom,x=>dateFrom=x],['結束日期',dateTo,x=>dateTo=x]]){
   const label=elem('label','',name),input=elem('input');input.type='date';input.value=value;
   input.onchange=()=>{setValue(input.value);render()};label.append(input);filters.append(label);
  }
  body.append(filters);
  const main=elem('div','cb-schedule-content');body.append(main);
  if(view==='calendar')calendar(main,records);
  else if(view==='timeline')timeline(main,records);
  else if(view==='gantt')gantt(main,records);
  else if(view==='coaching')listing(main,records.filter(x=>x.task.phase==='營運輔導'));
  else listing(main,records.filter(x=>due(x.task)||x.task.status!=='未安排'));
  const foot=elem('p','cb-schedule-note','日期以台灣時間判讀。此系統僅在開啟網頁時檢查待辦，沒有背景推播；資料儲存在此裝置瀏覽器，請定期匯出 JSON 備份。');body.append(foot);
 }
 function listing(container,records){
  const add=elem('div','cb-schedule-actions');add.append(button('新增／編輯案件時程',()=>chooseLead(), 'primary'),button('管理提醒規則',()=>editRules()));container.append(add);
  records.sort((a,b)=>(due(a.task)||'9999').localeCompare(due(b.task)||'9999'));
  if(!records.length)container.append(elem('p','cb-schedule-note','此範圍尚無已安排的時程，請先為案件設定日期。'));
  for(const x of records){const t=x.task,box=elem('button','cb-schedule-row'+(displayedStatus(t)==='已逾期'?' overdue':''));box.type='button';
   const line=elem('div','cb-schedule-rowline');line.append(elem('strong','',x.lead.name||'未命名加盟主'),elem('span','',due(t)||'未安排'));box.append(line,elem('div','',t.phase+'｜'+t.title+'｜'+displayedStatus(t)+(reminderText(t)?'｜'+reminderText(t):'')));box.onclick=()=>editTask(x.lead,t);container.append(box)}
 }
 function chooseLead(){
  const box=popup('選擇案件',e=>{
   for(const lead of getLeads()){e.append(button((lead.name||'未命名')+'｜'+(isSigned(lead)?'加盟案件':'加盟開發'),()=>{box.remove();timelineFor(lead)}))}
  });
 }
 function timelineFor(lead){
  filterLead=lead.id;view='timeline';render();
 }
 function timeline(container,records){
  const leads=filterLead?getLeads().filter(l=>l.id===filterLead):getLeads();
  for(const lead of leads){
   const section=elem('section','cb-schedule-phase');
   const title=button(lead.name+'｜'+(isSigned(lead)?'加盟案件':'加盟開發'),()=>{close();showFranchise(isSigned(lead)?'cases':'owners')});title.className='cb-schedule-lead-link';section.append(title);
   const addr=linkedVacancyAddress(lead)||lead.storeAddress||'尚未關聯空舖';section.append(elem('div','cb-schedule-note','店面：'+addr));
   const next=allTasks(lead).filter(t=>!isDone(t)&&due(t)).sort((a,b)=>due(a).localeCompare(due(b)))[0];const expected=task(lead,'預計正式開幕日期');section.append(elem('div','cb-schedule-note','下一個重要日期：'+(next?next.title+' '+due(next):'尚未安排')+'｜預計開幕：'+(expected&&due(expected)||'未安排')));
   for(const p of PHASES){
    const tasks=allTasks(lead).filter(t=>t.phase===p[0]),done=tasks.filter(t=>t.status==='已完成').length;
    const group=elem('details','cb-schedule-stage');group.open=p[0]==='加盟開發';
    const summary=elem('summary','',p[0]+'｜'+done+'/'+tasks.length+' 已完成');group.append(summary);
    for(const t of tasks){const row=button(t.title+'　'+(due(t)||'未安排')+'　'+displayedStatus(t),()=>editTask(lead,t));row.className='cb-schedule-stage-item'+(displayedStatus(t)==='已逾期'?' overdue':'');group.append(row)}
    section.append(group);
   }
   container.append(section);
  }
 }
 function calendar(container,records){
  const top=elem('div','cb-schedule-month');top.append(button('‹',()=>{month=addDays(month+'-01',-1).slice(0,7);render()}),elem('strong','',month),button('›',()=>{const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);render()}));container.append(top);
  const grid=elem('div','cb-schedule-calendar');for(const day of ['日','一','二','三','四','五','六'])grid.append(elem('b','',day));
  const first=new Date(month+'-01T00:00:00Z'),weekday=first.getUTCDay(),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  for(let i=0;i<weekday;i++)grid.append(elem('span','cb-schedule-empty',''));
  for(let d=1;d<=last;d++){const date=month+'-'+String(d).padStart(2,'0'),hits=records.filter(x=>due(x.task)===date);const day=button(String(d)+(hits.length?' ●'+hits.length:''),()=>{const b=popup(date,e=>{if(!hits.length)e.append(elem('p','', '無已排程事項'));else hits.forEach(x=>e.append(button(x.lead.name+'｜'+x.task.title,()=>{b.remove();editTask(x.lead,x.task)})))})},date===today()?'today':'');grid.append(day)}container.append(grid);
 }
 function gantt(container,records){
  const projects=records.filter(x=>['工程裝潢','開幕籌備','正式開幕'].includes(x.task.phase)&&due(x.task));
  const title=elem('h3','','工程排程（可左右滑動）');container.append(title);
  if(!projects.length){container.append(elem('p','cb-schedule-note','尚無工程日期，請先在案件時間軸設定。'));return}
  const start=projects.map(x=>x.task.plannedStart||due(x.task)).sort()[0],finish=projects.map(x=>x.task.plannedEnd||due(x.task)).sort().at(-1);
  const days=Math.min(90,Math.max(14,daysBetween(start,finish)+7)),frame=elem('div','cb-schedule-gantt');
  const sheet=elem('div','cb-schedule-gantt-sheet');sheet.style.width=(Math.max(days*24,700))+'px';
  const head=elem('div','cb-schedule-gantt-days');for(let i=0;i<days;i++)head.append(elem('span','',addDays(start,i).slice(5)));sheet.append(head);
  for(const x of projects){const t=x.task,first=Math.max(0,daysBetween(start,t.plannedStart||due(t))),width=Math.max(1,daysBetween(t.plannedStart||due(t),t.plannedEnd||due(t))+1);const row=elem('div','cb-schedule-gantt-row');const late=Math.max(0,daysBetween(due(t),today()));row.title=x.lead.name+'：'+t.title+'｜狀態：'+displayedStatus(t)+'｜延期 '+(isDone(t)?0:late)+' 天';
   const bar=button(x.lead.name+'｜'+t.title,()=>editTask(x.lead,t));bar.style.left=(first*24)+'px';bar.style.width=(Math.min(width,days-first)*24)+'px';bar.className='cb-schedule-gantt-bar'+(displayedStatus(t)==='已逾期'?' overdue':'');row.append(bar);sheet.append(row)}
  frame.append(sheet);container.append(frame);
 }
 function editRules(){
  const box=popup('自動排程與提醒設定',root=>{
   const rules=defaults(),form=elem('form','cb-schedule-form');
   for(const [key,label] of [['firstFollowDays','首次接洽後追蹤天數'],['intentSignDays','加盟意向後簽約安排天數'],['signTrainingDays','簽約後安排受訓天數'],['handOverSurveyDays','交屋後丈量天數'],['constructionFollowDays','開工後工程追蹤間隔'],['openFollow7Days','開幕後第一次追蹤天數'],['openFollow30Days','開幕後第二次追蹤天數']]){
    const wrap=elem('label','',label),input=elem('input');input.type='number';input.min='1';input.max='365';input.step='1';input.name=key;input.value=rules[key];wrap.append(input);form.append(wrap)}
   const remind=elem('label','','提前提醒天數（逗號分隔）'),ri=elem('input');ri.name='reminders';ri.value=rules.reminders.join(',');remind.append(ri);form.append(remind);
   const submit=button('儲存規則',()=>{});submit.type='submit';form.append(submit);
   form.onsubmit=e=>{e.preventDefault();const next={};for(const el of form.querySelectorAll('input')){if(el.name==='reminders'){const nums=el.value.split(',').map(x=>Number(x.trim()));if(!nums.every(n=>Number.isInteger(n)&&n>=0&&n<=30)){alert('提醒日期格式不正確');return}next.reminders=[...new Set(nums)]}else{const n=Number(el.value);if(!Number.isInteger(n)||n<1||n>365){alert('規則天數須介於1至365天');return}next[el.name]=n}}
    try{localStorage.setItem(RULE_KEY,JSON.stringify(next));box.remove()}catch{alert('無法儲存提醒設定')}}
   root.append(form);
  });
 }
 function popup(title,contents){
  const mask=elem('div','cb-schedule-popup');const panel=elem('section','cb-schedule-pop-body');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');const head=elem('header','cb-schedule-header');head.append(elem('strong','',title),button('×',()=>mask.remove(),'cb-schedule-close'));
  const inside=elem('div','cb-schedule-pop-content');panel.append(head,inside);mask.append(panel);document.body.append(mask);
  mask.onclick=e=>{if(e.target===mask)mask.remove()};
  contents(inside);return mask;
 }
 function editTask(lead,t){
  const mask=popup(t.title,root=>{
   root.append(elem('div','cb-schedule-note',lead.name+'｜'+t.phase+'｜'+(linkedVacancyAddress(lead)||lead.storeAddress||'無綁定空舖')));
   const form=elem('form','cb-schedule-form');
   const defs=[['suggestedDate','建議日期（系統產生，不等於確認）','date'],['confirmedDate','正式確認日期','date'],['plannedStart','預定開始日期','date'],['plannedEnd','預定完成日期','date'],['deadline','最後期限','date'],['completedAt','實際完成日期','date'],['remindAt','提醒日期','date'],['owner','負責人','text'],['status','執行狀態','select'],['note','備註','textarea'],['reason','改期原因','text']];
   const controls={};
   for(const [key,label,type] of defs){const wrap=elem('label','',label);let input;
    if(type==='textarea'){input=elem('textarea');input.rows=3}
    else if(type==='select'){input=elem('select');opts(input,STATUS.map(x=>[x,x]))}
    else{input=elem('input');input.type=type}
    input.name=key;input.value=key==='reason'?'':t[key]||'';wrap.append(input);form.append(wrap);controls[key]=input}
   const lockWrap=elem('label','cb-schedule-check','鎖定日期（阻止自動變動）'),lock=elem('input');lock.type='checkbox';lock.checked=!!t.dateLocked;lockWrap.append(lock);form.append(lockWrap);
   const vendorWrap=elem('label','cb-schedule-check','外部廠商已確認日期'),vendor=elem('input');vendor.type='checkbox';vendor.checked=!!t.vendorConfirmed;vendorWrap.append(vendor);form.append(vendorWrap);
   const noMoveWrap=elem('label','cb-schedule-check','禁止自動改期'),noMove=elem('input');noMove.type='checkbox';noMove.checked=!!t.userNoMove;noMoveWrap.append(noMove);form.append(noMoveWrap);
   const trigger=elem('p','cb-schedule-trigger-note','觸發來源：'+(t.triggerSource||'手動／尚未觸發')+'　觸發日期：'+(t.triggerDate||'未設定'));form.append(trigger);
   if(t.title==='完訓考核日期'){const wrap=elem('label','','考核結果'),sel=elem('select');sel.name='examResult';opts(sel,[['','待評估'],['通過','通過'],['未通過','未通過']]);sel.value=t.examResult||'';wrap.append(sel);form.append(wrap);controls.examResult=sel}
   const history=elem('details','cb-schedule-history');history.append(elem('summary','','修改紀錄（'+(t.changes||[]).length+'）'));
   for(const h of t.changes||[])history.append(elem('p','',new Date(h.at).toLocaleString('zh-TW')+'｜'+h.reason+'｜'+JSON.stringify(h.changes)));
   if(t.phase==='營運輔導'){const issueWrap=elem('label','','發現問題與改善事項'),issueInput=elem('textarea');issueInput.name='issues';issueInput.rows=3;issueInput.value=t.issues||'';issueWrap.append(issueInput);form.append(issueWrap);controls.issues=issueInput}
   const actions=elem('div','cb-schedule-edit-actions');const submit=button('儲存時程',()=>{});submit.type='submit';actions.append(submit);
   form.append(actions,history);
   if(t.title==='裝潢工程完成日期'&&window.ComebuyScheduleV2){
    const notice=elem('p','cb-schedule-note','修改完工日期時，系統會提出後續任務建議；已確認或鎖定日期不會自動覆蓋。');form.append(notice)
   }
   form.onsubmit=e=>{e.preventDefault();const next={};for(const [key] of defs)if(key!=='reason')next[key]=controls[key].value.trim();
    if(t.phase==='營運輔導')next.issues=controls.issues.value.trim();
    next.dateLocked=lock.checked;next.vendorConfirmed=vendor.checked;next.userNoMove=noMove.checked;
    if(controls.examResult)next.examResult=controls.examResult.value;
    if(next.status==='已完成'&&!next.completedAt)next.completedAt=today();
    if(['suggestedDate','confirmedDate','plannedStart','plannedEnd','deadline','completedAt','remindAt'].some(k=>next[k]&&(!dateRe.test(next[k])||!Number.isFinite(dayUTC(next[k]))))){alert('日期格式不正確');return}
    if(next.plannedStart&&next.plannedEnd&&next.plannedEnd<next.plannedStart){alert('預定完成日期不得早於開始日期');return}
    const dateChanged=['plannedStart','plannedEnd','deadline','suggestedDate','confirmedDate'].some(k=>next[k]!==String(t[k]||''));
    if(dateChanged&&!controls.reason.value.trim()){alert('修改預定日期須填寫原因');return}
    const impacted=t.phase==='工程裝潢'&&dateChanged?['設備進場日期','試營業日期','預計正式開幕日期'].map(title=>task(lead,title)).filter(x=>x&&due(x)):[];
    if(impacted.length&&form.dataset.delayConfirmed!=='yes'){
     let notice=form.querySelector('.cb-schedule-delay-warning');
     if(!notice){
      notice=elem('div','cb-schedule-delay-warning');
      const warning=elem('p','','工程日期變更可能影響：'+impacted.map(x=>x.title+'（'+due(x)+'）').join('、')+'。現有下游日期不會自動變更，請確認後再儲存。');
      const approve=button('我已確認，儲存工程改期',()=>{form.dataset.delayConfirmed='yes';form.requestSubmit()});
      notice.append(warning,approve);form.insertBefore(notice,actions);
     }
     return;
    }
    const snapshot=JSON.parse(JSON.stringify(lead.scheduleTasks));
    changeTask(t,next,controls.reason.value.trim()||'編輯時程');
    if(window.ComebuyScheduleV2&&dateChanged){
     window.ComebuyScheduleV2.audit(t,{confirmedDate:{from:snapshot.find(x=>x.id===t.id)?.confirmedDate||'',to:next.confirmedDate},suggestedDate:{from:snapshot.find(x=>x.id===t.id)?.suggestedDate||'',to:next.suggestedDate}},controls.reason.value.trim()||'日期調整');
    }
    if(next.status==='已完成'&&!next.completedAt)t.completedAt=today();

    seed(lead);
    if(!saveFranchise()){lead.scheduleTasks=snapshot;alert('儲存失敗，原資料未變動');return}
    mask.remove();render();
   };
   form.addEventListener('input',()=>{form.dataset.delayConfirmed='';const warning=form.querySelector('.cb-schedule-delay-warning');if(warning)warning.remove()});
   root.append(form);
  });
 }
 render();
 return overlay
}
window.ComebuySchedule={open:createApp,phases:PHASES,seed,calculateDue:due,displayedStatus,addDays,daysBetween,defaults};
})();