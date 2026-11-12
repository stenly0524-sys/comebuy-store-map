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
const due=t=>t.deadline||t.plannedEnd||t.plannedStart||t.confirmedDate||t.suggestedDate||'';
function displayedStatus(t,today=localToday()){const scheduled=t.deadline||t.plannedEnd||t.plannedStart||t.confirmedDate||'';return !isDone(t)&&t.status!=='暫停'&&scheduled&&scheduled<today?'已逾期':t.status}
function reminderText(t,now=localToday(),rules=defaults()){
 if(isDone(t)||t.status==='暫停')return '';
 const target=due(t);if(!target)return '';
 const diff=daysBetween(now,target);
 if(diff<0)return '逾期 '+(-diff)+' 天';
 if(diff===0)return '今日到期';
 if((t.remindDays||rules.reminders||[3,1,0]).includes(diff))return '提醒：'+diff+' 天後到期';
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
   const line=elem('div','cb-schedule-rowline');line.append(elem('strong','',x.lead.name||'未命名加盟主'),elem('span','',due(t)||'未安排'));box.append(line,elem('div','',t.phase+'｜'+t.title+'｜'+displayedStatus(t)+(t.reviewRequired?'｜⚠需檢查觸發來源':'')+(reminderText(t)?'｜'+reminderText(t):'')));box.onclick=()=>editTask(x.lead,t);container.append(box)}
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
 function templateSettings(){
  const v2=window.ComebuyScheduleV2;if(!v2)return;
  let registry=v2.registry(),editingId=registry.activeId,dirty=false;
  const modal=popup('流程模板設定',root=>{
   const head=elem('div','cb-schedule-template-bar'),select=elem('select');
   const loadOptions=()=>{select.replaceChildren();opts(select,registry.templates.map(t=>[t.id,t.name+(t.locked?'（系統預設）':'')]));select.value=editingId};
   const add=button('＋新增自訂模板',()=>{
    const nameInput=elem('input');nameInput.placeholder='自訂模板名稱';nameInput.maxLength=50;
    const editor=popup('建立自訂流程模板',area=>{
     area.append(nameInput,button('建立',()=>{
      const name=nameInput.value.trim();if(!name){nameInput.focus();return}
      const source=registry.templates.find(t=>t.id===editingId),copy=JSON.parse(JSON.stringify(source));
      copy.id='custom-'+Date.now().toString(36);copy.name=name;copy.locked=false;copy.version=(copy.version||2)+1;copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;
      registry.templates.push(copy);registry.activeId=copy.id;editingId=copy.id;v2.saveRegistry(registry);editor.remove();loadOptions();draw();
     },'cb-schedule-primary'))
    });nameInput.focus();
   });
   head.append(select,add);root.append(head);
   const body=elem('div','cb-schedule-template-body');root.append(body);
   select.onchange=()=>{editingId=select.value;draw()};
   const draw=()=>{
    const t=registry.templates.find(x=>x.id===editingId);if(!t)return;
    body.replaceChildren();
    const intro=elem('p','cb-schedule-note',t.locked?'系統預設模板不可直接修改。請先新增自訂模板。':'模板修改不會直接覆蓋已排程案件；可選擇是否套用新模板。');body.append(intro);
    const locked=!!t.locked;
    const controls=elem('div','cb-schedule-template-controls');
    const activate=button('設為新案件預設模板',()=>{registry.activeId=t.id;v2.saveRegistry(registry);draw()},'cb-schedule-primary');
    controls.append(activate);
    if(!locked)controls.append(button('儲存模板',()=>{t.updatedAt=new Date().toISOString();v2.saveRegistry(registry);dirty=false;alert('模板已儲存，原有案件排程未變更')} ,'cb-schedule-primary'));
    controls.append(button('套用至既有案件（需確認）',()=>{
     if(locked)return;
     const c=popup('確認套用模板',zone=>{
      const options=[];
      zone.append(elem('p','cb-schedule-note','只新增缺少的任務，不覆蓋已存在的日期、已完成項目或歷史紀錄。'));
      for(const lead of getLeads()){
       const label=elem('label','cb-schedule-template-apply');const cb=elem('input');cb.type='checkbox';
       label.append(cb,elem('span','',(lead.name||lead.id)+'｜'+lead.stage));zone.append(label);options.push([lead,cb])
      }
      zone.append(button('確認套用至所選案件',()=>{
       const selected=options.filter(x=>x[1].checked).map(x=>x[0]);if(!selected.length){alert('請選擇案件');return}
       const snapshots=selected.map(x=>[x,JSON.parse(JSON.stringify(x))]);
       try{v2.saveRegistry(registry);for(const lead of selected){lead.scheduleTemplateId=t.id;v2.seed(lead)}
        if(!saveFranchise())throw Error('無法儲存案件');
        c.remove();render();alert('已套用，既有日期與歷史保留')
       }catch(e){for(const [lead,old] of snapshots){Object.keys(lead).forEach(k=>delete lead[k]);Object.assign(lead,old)}alert('套用失敗：'+e.message)}
      },'cb-schedule-primary'))
     })
    }));
    body.append(controls);
    const sections=elem('div','cb-schedule-template-sections');
    t.phases.forEach((p,i)=>{
     const group=elem('details','cb-schedule-template-stage');group.open=i===0;
     const summary=elem('summary','','第'+(i+1)+'階段：'+p.name+'（'+p.tasks.length+' 項）');group.append(summary);
     p.tasks.forEach((j,k)=>{
      const row=elem('div','cb-schedule-template-task');
      const title=elem('input');title.type='text';title.maxLength=80;title.value=j.title;title.disabled=locked;
      title.onchange=()=>{if(!title.value.trim()){title.value=j.title;return}j.title=title.value.trim();dirty=true};
      const enable=elem('input');enable.type='checkbox';enable.checked=j.enabled!==false;enable.disabled=locked;enable.onchange=()=>{j.enabled=enable.checked;dirty=true};
      const up=button('↑',()=>{if(k===0||locked)return;[p.tasks[k-1],p.tasks[k]]=[p.tasks[k],p.tasks[k-1]];dirty=true;draw()});up.disabled=locked;
      const down=button('↓',()=>{if(k===p.tasks.length-1||locked)return;[p.tasks[k+1],p.tasks[k]]=[p.tasks[k],p.tasks[k+1]];dirty=true;draw()});down.disabled=locked;
      const dep=elem('select');opts(dep,[['','無前置依賴'],...t.phases.flatMap(x=>x.tasks.map(y=>[y.title,y.title]))].filter(x=>x[0]!==j.title));dep.value=j.dependsOn||'';dep.disabled=locked;dep.onchange=()=>{j.dependsOn=dep.value;dirty=true};
      row.append(title,enable,up,down,dep);group.append(row)
     });
     if(!locked){const newTitle=elem('input');newTitle.placeholder='新增工作名稱';newTitle.maxLength=80;
      const addTask=button('＋新增工作',()=>{const title=newTitle.value.trim();if(!title||p.tasks.some(x=>x.title===title)){alert('請填寫未重複的工作名稱');return}p.tasks.push({id:'custom-'+Date.now(),title,enabled:true,dependsOn:''});dirty=true;draw()});
      const addRow=elem('div','cb-schedule-template-add');addRow.append(newTitle,addTask);group.append(addRow)
     }
     sections.append(group)
    });body.append(sections);
    const settings=elem('div','cb-schedule-template-rules');settings.append(elem('h3','','事件觸發與提醒規則'));
    t.triggers.forEach((r,i)=>{
     const row=elem('div','cb-schedule-rule-row');
     const check=elem('input');check.type='checkbox';check.checked=r.enabled!==false;check.disabled=locked;check.onchange=()=>{r.enabled=check.checked;dirty=true};
     const caption=elem('strong','',r.source+' → '+r.target);
     const eventSel=elem('select');const jobs=t.phases.flatMap(p=>p.tasks.map(x=>[x.title,x.title]));opts(eventSel,jobs);eventSel.value=r.source;eventSel.disabled=locked;
     eventSel.onchange=()=>{r.source=eventSel.value;dirty=true;caption.textContent=r.source+' → '+r.target};
     const targetSel=elem('select');opts(targetSel,jobs);targetSel.value=r.target;targetSel.disabled=locked;
     targetSel.onchange=()=>{r.target=targetSel.value;r.phase=t.phases.find(p=>p.tasks.some(x=>x.title===r.target))?.name||r.phase;dirty=true;caption.textContent=r.source+' → '+r.target};
     const offset=elem('input');offset.type='number';offset.min='0';offset.max='365';offset.step='1';offset.value=r.offset;offset.disabled=locked;offset.onchange=()=>{const n=Number(offset.value);if(!Number.isInteger(n)||n<0||n>365){offset.value=r.offset;return}r.offset=n;dirty=true};
     const mode=elem('select');opts(mode,[['calendar','日曆天'],['workday','工作天（不計週末）']]);mode.value=r.dayMode||'calendar';mode.disabled=locked;mode.onchange=()=>{r.dayMode=mode.value;dirty=true};
     const remind=elem('input');remind.type='text';remind.value=(r.reminders||[3,1,0]).join(',');remind.placeholder='提醒 3,1,0';remind.disabled=locked;
     remind.onchange=()=>{const val=remind.value.split(',').map(x=>Number(x.trim()));if(val.some(x=>!Number.isInteger(x)||x<0||x>30)){remind.value=(r.reminders||[3,1,0]).join(',');return}r.reminders=[...new Set(val)];dirty=true};
     row.append(check,caption,eventSel,targetSel,offset,mode,remind);settings.append(row)
    });
    if(!locked){
     const addRow=elem('div','cb-schedule-template-add'),src=elem('select'),target=elem('select'),offset=elem('input'),addRule=button('新增觸發規則',()=>{if(!src.value||!target.value||src.value===target.value){alert('請選擇不同的觸發與目標工作');return}const p=t.phases.find(p=>p.tasks.some(x=>x.title===target.value));if(t.triggers.some(r=>r.source===src.value&&r.target===target.value)){alert('已存在相同規則');return}t.triggers.push({id:'custom-rule-'+Date.now(),source:src.value,target:target.value,phase:p.name,offset:Number(offset.value)||0,dayMode:'calendar',reminders:[3,1,0],enabled:true});dirty=true;draw()});
     const choices=t.phases.flatMap(x=>x.tasks.map(j=>[j.title,j.title]));
     opts(src,[['','觸發事件'],...choices]);opts(target,[['','目標工作'],...choices]);
     offset.type='number';offset.min='0';offset.max='365';offset.value='3';addRow.append(src,target,offset,addRule);settings.append(addRow)
    }
    const span=elem('label','','預設工程工期（天）'),length=elem('input');length.type='number';length.min='1';length.max='365';length.value=t.constructionDays||45;length.disabled=locked;
    length.onchange=()=>{const n=Number(length.value);if(Number.isInteger(n)&&n>=1&&n<=365){t.constructionDays=n;dirty=true}else length.value=t.constructionDays};
    span.append(length);settings.append(span);
    body.append(settings)
   };
   loadOptions();draw();
  });
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
    const changedExistingDate=dateChanged&&['plannedStart','plannedEnd','deadline','suggestedDate','confirmedDate'].some(k=>String(t[k]||'')&&next[k]!==String(t[k]||''));
    if(changedExistingDate&&!controls.reason.value.trim()){alert('修改已存在的日期須填寫原因');return}
    const newFinish=next.confirmedDate||next.plannedEnd||next.suggestedDate||next.deadline||next.plannedStart;
    const v2=window.ComebuyScheduleV2;
    const impacted=t.title==='裝潢工程完成日期'&&dateChanged&&v2?v2.previewDelay(lead,t.title,newFinish):[];
    if(impacted.length&&form.dataset.delayConfirmed!=='yes'){
     let notice=form.querySelector('.cb-schedule-delay-warning');
     if(!notice){
      notice=elem('div','cb-schedule-delay-warning');
      notice.append(elem('p','','工程改期 '+(impacted[0]?.delta>0?'+':'')+(impacted[0]?.delta||0)+' 天。以下是受影響工作；已完成、已鎖定、廠商已確認及已正式確認日期不可自動調整：'));
      const picks=[];
      impacted.forEach(item=>{
       const line=elem('label','cb-schedule-delay-item');
       const check=elem('input');check.type='checkbox';check.checked=!item.locked;check.disabled=item.locked;
       const text=elem('span','',item.title+'｜原 '+(item.current||'未安排')+' → 建議 '+item.proposed+(item.locked?'（日期保護：'+item.reason+'）':''));
       const edit=elem('input');edit.type='date';edit.value=item.proposed;edit.disabled=item.locked;
       line.append(check,text,edit);notice.append(line);picks.push({item,check,edit});
      });
      const approve=button('確認本次改期與選取的建議',()=>{
       if(picks.some(p=>p.check.checked&&!v2.valid(p.edit.value))){alert('請輸入正確的建議日期');return}
       form._delayProposal=picks.map(p=>({...p.item,accept:p.check.checked&&!p.item.locked,proposed:p.edit.value}));
       form.dataset.delayConfirmed='yes';form.requestSubmit();
      });
      notice.append(approve);form.insertBefore(notice,actions);
     }
     return;
    }
    const snapshot=JSON.parse(JSON.stringify(lead.scheduleTasks));
    const previousStage=lead.stage;
    const eventWithdrawn=(!!t.confirmedDate&&!next.confirmedDate)||(t.status==='已完成'&&next.status!=='已完成'&&!next.confirmedDate);

    changeTask(t,next,controls.reason.value.trim()||'編輯時程');
    if(window.ComebuyScheduleV2&&dateChanged){
     window.ComebuyScheduleV2.audit(t,{confirmedDate:{from:snapshot.find(x=>x.id===t.id)?.confirmedDate||'',to:next.confirmedDate},suggestedDate:{from:snapshot.find(x=>x.id===t.id)?.suggestedDate||'',to:next.suggestedDate}},controls.reason.value.trim()||'日期調整');
    }
    if(next.status==='已完成'&&!next.completedAt)t.completedAt=today();

    if(eventWithdrawn&&window.ComebuyScheduleV2)window.ComebuyScheduleV2.markWithdrawn(lead,t.title);
    if(t.title==='正式簽約日期'&&next.status==='已完成'&&next.confirmedDate&&!isSigned(lead))lead.stage='已簽約';
    seed(lead);
    if(form._delayProposal?.length&&window.ComebuyScheduleV2){
     window.ComebuyScheduleV2.applyDelay(lead,form._delayProposal,controls.reason.value.trim()||'工程改期');
    }
    if(!saveFranchise()){lead.scheduleTasks=snapshot;lead.stage=previousStage;alert('儲存失敗，原資料未變動');return}
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