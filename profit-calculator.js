/* COMEBUY MAPS: per-vacancy financial planning model (illustrative only). */
(function(){
'use strict';
const FIELDS=[
 ['rent','每月房租',80000,0,100000000,1],
 ['fullCount','正職人員數量',3,0,1000,1],
 ['fullSalary','正職平均月薪',35000,0,10000000,1],
 ['partCount','兼職人員數量',2,0,1000,1],
 ['partSalary','兼職平均月薪',18000,0,10000000,1],
 ['utilities','每月水電費',18000,0,100000000,1],
 ['misc','每月雜支',10000,0,100000000,1],
 ['margin','產品平均毛利率（%）',65,0.01,100,0.01],
 ['price','平均每杯售價（元）',65,0.01,1000000,0.01],
 ['cups','預估每日銷售杯數',300,0,10000000,1],
 ['days','每月營業天數',30,1,31,1]
];
const DEFAULTS=Object.fromEntries(FIELDS.map(x=>[x[0],x[2]]));
const money=n=>Number.isFinite(n)?'NT$ '+Math.round(n).toLocaleString('zh-TW'):'無法保本';
const fmt=(n,kind='money')=>kind==='money'?money(n):kind==='cups'?(Number.isFinite(n)?Math.ceil(n).toLocaleString('zh-TW')+' 杯':'無法保本'):n.toFixed(2)+'%';
const MODES={fixed:'固定租金',share:'營業額抽成',max:'保底與抽成擇高',plus:'保底加抽成'};
function lease(v){return {mode:'fixed',fixed:v.rent??'',base:0,rate:0,feeMode:'fixed',fee:0,feeRate:0,basis:'gross',note:'',...(v.lease||{})}}
function leaseIssue(l){if(!Object.hasOwn(MODES,l.mode)||!['gross','net'].includes(l.basis)||!['fixed','share'].includes(l.feeMode))return '租賃模式或計算基礎無效';for(const k of [...(l.mode==='fixed'?['fixed']:l.mode==='share'?['rate']:['base','rate']),l.feeMode==='fixed'?'fee':'feeRate']){if(l[k]===''||l[k]==null||!Number.isFinite(Number(l[k]))||Number(l[k])<0||(['rate','feeRate'].includes(k)&&Number(l[k])>100))return '請輸入有效租賃金額或比例'}return ''}
function leaseForm(v){const l=lease(v),box=document.createElement('fieldset');box.style.cssText='min-width:0;margin:8px 0;padding:10px;border:1px solid #ddd;border-radius:8px;display:grid;gap:8px';const legend=document.createElement('legend');legend.textContent='租賃條件';box.append(legend);const inputs={},rows={};
function field(k,label,options){const row=document.createElement('label');row.textContent=label;const input=document.createElement(options?'select':k==='note'?'textarea':'input');if(options){for(const [value,name] of Object.entries(options)){const o=document.createElement('option');o.value=value;o.textContent=name;input.append(o)}}else if(k!=='note'){input.type='number';input.min='0';input.step='any';if(['rate','feeRate'].includes(k))input.max='100'}input.style.cssText='width:100%;min-width:0;box-sizing:border-box';input.value=l[k]??'';row.append(input);box.append(row);inputs[k]=input;rows[k]=row}
field('mode','租賃模式',MODES);field('fixed','固定月租金');field('base','每月保底租金');field('rate','營業額抽成率（%）');field('feeMode','管理費計算方式',{fixed:'固定金額',share:'營業額比例'});field('fee','固定管理費');field('feeRate','管理費比例（%）');field('basis','抽成及管理費計算基礎',{gross:'含稅營業額',net:'未稅營業額'});field('note','租賃備註');
function refresh(){const m=inputs.mode.value;for(const [k,show] of Object.entries({fixed:m==='fixed',base:m==='max'||m==='plus',rate:m!=='fixed',fee:inputs.feeMode.value==='fixed',feeRate:inputs.feeMode.value==='share'})){rows[k].hidden=!show;inputs[k].disabled=!show}}inputs.mode.onchange=inputs.feeMode.onchange=refresh;refresh();return {box,read:()=>({...l,...Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.value]))})}}
function leaseSummary(v){const l=lease(v),m=l.mode;return MODES[m]+'｜'+(m==='fixed'?(l.fixed===''?'待確認':money(Number(l.fixed))): (m==='share'?'':money(Number(l.base))+' / ')+l.rate+'%')+'｜管理費 '+(l.feeMode==='fixed'?money(Number(l.fee)):l.feeRate+'%')+'｜'+(l.basis==='gross'?'含稅':'未稅')+(l.note?'｜'+l.note:'')}
function calculate(v){
 const l=v.lease||lease(v),k=l.basis==='net'?1/1.05:1,a=Number(l.rate)/100*k,b=l.feeMode==='share'?Number(l.feeRate)/100*k:0,f=l.feeMode==='fixed'?Number(l.fee):0;
 const fixed=v.fullCount*v.fullSalary+v.partCount*v.partSalary+v.utilities+v.misc;
 const revenue=v.cups*v.price*v.days,vat=revenue*5/105,netSales=revenue-vat,grossProfit=netSales*v.margin/100;
 const base=Number(l.base),r=Number(l.fixed),rent=l.mode==='fixed'?r:l.mode==='share'?a*revenue:l.mode==='max'?Math.max(base,a*revenue):base+a*revenue;
 const management=f+b*revenue,site=rent+management,c=fixed+f,m=v.margin/105-b;
 const solve=(n,d)=>d>0?n/d:n===0?0:Infinity;
 const grossBreakEven=l.mode==='fixed'?solve(c+r,m):l.mode==='share'?solve(c,m-a):l.mode==='max'?Math.max(solve(c+base,m),solve(c,m-a)):solve(c+base,m-a);
 const pretaxBreakEven=grossBreakEven/1.05,dailyBreakEven=grossBreakEven/v.days,cupsBreakEven=Math.ceil(dailyBreakEven/v.price),operatingProfit=grossProfit-fixed-site;
 return {fixed,rent,management,site,pretaxBreakEven,grossBreakEven,dailyBreakEven,cupsBreakEven,revenue,vat,netSales,grossProfit,operatingProfit,profitRate:revenue===0?null:operatingProfit/revenue*100};
}
function validate(v){
 for(const [key,label,,min,max,step] of FIELDS){
  if(key==='rent'&&v.lease)continue;
  const n=v[key];
  if(!Number.isFinite(n)||n<min||n>max)return label+'：請輸入有效範圍內的數值';
  if(step===1&&!Number.isInteger(n))return label+'：不得輸入小數';
 }
 return v.lease?leaseIssue(v.lease):'';
}
function open(v,saveVacancies){
 if(!v||!v.id||typeof saveVacancies!=='function')throw Error('空舖資料不存在');
 const previous=v.profitCalc&&typeof v.profitCalc==='object'?v.profitCalc:null;
 const values={...DEFAULTS,...(previous||{})}; const terms=lease(v);
 if(!previous&&v.rent!==''&&v.rent!=null&&Number.isFinite(Number(v.rent))&&Number(v.rent)>=0)values.rent=Number(v.rent);
 const overlay=document.createElement('div');overlay.className='cb-profit-overlay';
 overlay.innerHTML='<section class="cb-profit-modal" role="dialog" aria-modal="true" aria-label="門市損益試算器"><header class="cb-profit-header"><strong>門市損益試算器</strong><button type="button" class="cb-profit-close" aria-label="關閉">×</button></header><div class="cb-profit-scroll"><div class="cb-profit-address"></div><section class="cb-profit-section" data-section="fixed"><h3>A. 其他固定開銷</h3><div class="cb-profit-inputs"></div><div class="cb-profit-total"><span>其他固定開銷合計</span><b data-output="fixed">—</b></div></section><section class="cb-profit-section" data-section="revenue"><h3>B. 營收設定</h3><div class="cb-profit-inputs"></div></section><section class="cb-profit-section"><h3>C. 保本分析</h3><div class="cb-profit-results cb-profit-be"><div><span>稅前保本營業額／月</span><strong data-output="pretaxBreakEven">—</strong></div><div><span>含5%稅預估保本額／月</span><strong data-output="grossBreakEven">—</strong></div><div><span>每日保本營業額</span><strong data-output="dailyBreakEven">—</strong></div><div><span>每日保本杯數</span><strong data-output="cupsBreakEven">—</strong></div></div></section><section class="cb-profit-section"><h3>D. 預估損益</h3><div class="cb-profit-quick" aria-label="快速杯數切換"></div><div class="cb-profit-results cb-profit-pnl"><div><span>預估每月營業額（含稅）</span><strong data-output="revenue">—</strong></div><div><span>估算營業稅</span><strong data-output="vat">—</strong></div><div><span>扣稅後產品毛利</span><strong data-output="grossProfit">—</strong></div><div><span>其他固定開銷</span><strong data-output="pnlFixed">—</strong></div><div><span>租金／抽成</span><strong data-output="rent">—</strong></div><div><span>管理費</span><strong data-output="management">—</strong></div><div><span>場地費用合計</span><strong data-output="site">—</strong></div><div><span>預估每月營運利益</span><strong data-output="operatingProfit">—</strong></div><div><span>營運利益率</span><strong data-output="profitRate">—</strong></div></div></section><p class="cb-profit-disclaimer">本試算僅供門市營運評估，非正式財報。毛利率以未稅銷售額計算；營業稅採含稅營業額的 5/105 簡化估算，不等同實際應繳稅額，未扣進項稅。未另外計入雇主勞健保、勞退、設備折舊、貸款利息、所得稅及其他未填列支出；如需評估，請自行納入成本欄位。租賃條件與店鋪資料共用，請返回店鋪資料修改。</p><p class="cb-profit-error" role="alert" aria-live="polite"></p><button type="button" class="cb-profit-save">儲存試算</button></div></section>';
 const $=x=>overlay.querySelector(x);
 const close=()=>{overlay.remove();document.removeEventListener('keydown',escape)};
 const escape=e=>{if(e.key==='Escape')close()};
 $('.cb-profit-close').onclick=close;
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 document.addEventListener('keydown',escape);
 $('.cb-profit-address').textContent=v.address||'未命名空舖';
 const termsLabel=document.createElement('p');termsLabel.textContent=leaseSummary(v);$('.cb-profit-address').after(termsLabel);
 const fields={};
 FIELDS.forEach(([key,label,def,min,max,step],i)=>{
  const input=document.createElement('input');input.type=key==='rent'?'hidden':'number';input.inputMode=step===1?'numeric':'decimal';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(values[key]);input.dataset.field=key;input.setAttribute('aria-label',label);
  if(key==='rent'){overlay.append(input)}else if(key==='cups'){
   // Keep the saved daily cup value and the quick-selector calculation without a B-section input.
   input.style.cssText='width:100%;min-width:0;box-sizing:border-box';$('.cb-profit-quick').appendChild(input);
  }else{
   const wrap=document.createElement('label');wrap.className='cb-profit-field';
   const caption=document.createElement('span');caption.textContent=label;
   wrap.append(caption,input);$(i<7?'[data-section="fixed"] .cb-profit-inputs':'[data-section="revenue"] .cb-profit-inputs').appendChild(wrap);
  }
  fields[key]=input;
 });
 const quick=$('.cb-profit-quick');
 [150,200,250,300,350,400,500].forEach(c=>{
  const button=document.createElement('button');button.type='button';button.textContent=c+' 杯';button.dataset.cups=String(c);button.onclick=()=>{fields.cups.value=String(c);refresh()};quick.appendChild(button);
 });
 const error=$('.cb-profit-error'),save=$('.cb-profit-save');
 const out=(key,text)=>{const el=$('[data-output="'+key+'"]');if(el)el.textContent=text};
 function read(){
  const v={};
  FIELDS.forEach(([key])=>{const raw=fields[key].value.trim();v[key]=raw===''?NaN:Number(raw)});
  v.lease=terms;return v;
 }
 function refresh(){
  const n=read(),issue=validate(n);error.textContent=issue;save.disabled=!!issue;
  quick.querySelectorAll('button').forEach(b=>b.classList.toggle('active',Number(b.dataset.cups)===n.cups));
  if(issue){overlay.querySelectorAll('[data-output]').forEach(el=>{el.textContent='—';el.classList.remove('gain','loss')});return}
  const r=calculate(n);
  out('fixed',money(r.fixed));out('pretaxBreakEven',money(r.pretaxBreakEven));out('grossBreakEven',money(r.grossBreakEven));
  out('dailyBreakEven',money(r.dailyBreakEven));out('cupsBreakEven',fmt(r.cupsBreakEven,'cups'));
  out('revenue',money(r.revenue));out('vat',money(r.vat));out('grossProfit',money(r.grossProfit));out('pnlFixed',money(r.fixed));
  out('rent',money(r.rent));out('management',money(r.management));out('site',money(r.site));out('operatingProfit',money(r.operatingProfit));out('profitRate',r.profitRate===null?'—':fmt(r.profitRate,'percent'));
  ['operatingProfit','profitRate'].forEach(key=>{const el=$('[data-output="'+key+'"]');el.classList.toggle('gain',r.operatingProfit>=0);el.classList.toggle('loss',r.operatingProfit<0)});
 }
 FIELDS.forEach(([key])=>fields[key].addEventListener('input',refresh));
 save.onclick=()=>{
  const n=read(),issue=validate(n);if(issue){error.textContent=issue;return}
  const old=v.profitCalc;delete n.lease;delete n.rent;v.profitCalc={...n,updatedAt:new Date().toISOString(),version:2};
  if(!saveVacancies()){if(old===undefined)delete v.profitCalc;else v.profitCalc=old;error.textContent='儲存失敗，已還原原試算資料';return}
  close();
 };
 document.body.appendChild(overlay);
 refresh();
}
window.ComebuyProfitCalculator={open,calculate,validate,defaults:DEFAULTS,lease,leaseForm,leaseIssue,leaseSummary};
})();