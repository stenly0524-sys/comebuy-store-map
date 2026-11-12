const sources=require('./intelligence-sources.json');
const investmentRegistry=require('./franchise-investment-sources.json');
const http=require('node:http');
const PORT=Number(process.env.PORT||10000);
const ORIGIN=process.env.ALLOWED_ORIGIN||'https://comebuy-store-map.onrender.com';
const cats=['品牌活動','加盟與展店資訊','企業經營與商業資訊','網路事件與消費者評論','競爭品牌與市場動態'];
const categoryTerms=['活動 聯名 促銷 行銷 公關','加盟 展店 新店 開幕 搬遷 歇業 招商','長沂國際 營運 財報 企業 策略 規劃','評價 爭議 消費者 社群','手搖飲 飲料 市場 競爭 加盟'];
const escapeXml=x=>x.replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/<[^>]*>/g,'').trim();
const tag=(s,k)=>escapeXml((s.match(new RegExp('<'+k+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+k+'>','i'))||[])[1]||'');
const fetchWithTimeout=async(url)=>{for(let attempt=0;attempt<2;attempt++){const c=new AbortController();const t=setTimeout(()=>c.abort(),9000);try{const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'COMEBUY-MAPS-Intelligence/1.0'}});if(!r.ok)throw Error('HTTP '+r.status);return await r.text()}catch(e){if(attempt)throw e}finally{clearTimeout(t)}}};
const SIPSPOT_URL='https://sipspot.wisplu.com.tw/brands/';
let sipspotCache=null;
const decodeEntities=x=>x.replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
function parseSipspot(html){
 const plain=decodeEntities(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim());
 const intro=plain.indexOf('點品牌看全台門市分布、菜單與價格');
 const body=intro>=0?plain.slice(intro).replace(/^.*?價格[。.]\s*/,''):plain;
 const pattern=/全台\s*([\d,]+)\s*家/g;let prev=0,match;const items=[];
 while((match=pattern.exec(body))){
  const raw=body.slice(prev,match.index).trim();
  const name=items.length?raw:raw.replace(/^.*?(?:品牌總覽|價格[。.]|數千間門市[。.]|數千間門市。)/,'').trim();
  const count=Number(match[1].replace(/,/g,''));
  if(name&&name.length<=60&&Number.isSafeInteger(count)&&count>=0)items.push({name,count});
  prev=pattern.lastIndex;
 }
 const declared=plain.match(/收錄全台\s*(\d+)\s*個手搖飲品牌/);
 if(items.length<20||declared&&items.length!==Number(declared[1])||!items.some(x=>x.name==='COMEBUY'))throw Error('來源頁面結構變更或品牌數量不完整');
 if(new Set(items.map(x=>x.name)).size!==items.length)throw Error('品牌資料重複，拒絕不完整結果');
 return items.sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-Hant'));
}
const recentRequests=new Map();
const json=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':ORIGIN,'vary':'Origin','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj))};
http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'POST,GET,OPTIONS','access-control-allow-headers':'content-type'});return res.end()}
 if(req.url==='/health')return json(res,200,{ok:true,provider:'Google News public RSS + official page reachability checks',ai:false});
 if(req.url==='/sources'&&req.method==='GET')return json(res,200,{sources});
 if(req.url==='/sipspot-brands'&&req.method==='GET'){
  try{const html=await fetchWithTimeout(SIPSPOT_URL);const items=parseSipspot(html).map(row=>{
    const record=investmentRegistry.brands[row.name]||{};
    const fee=record.franchiseFee||null,opening=record.openingTotal||null;
    // Market-wide scenario for missing brand quotes, NEVER a brand-specific factual price.
    const generic=(min,max,label)=>({amount:min,maxAmount:max,currency:'TWD',qualifier:'約',status:'generic_market_model',sourceName:'2026 手搖飲加盟市場通用情境',sourceUrl:'https://suanlisuo.com/franchise',scope:label+'：通用產業區間，非此品牌實際報價或承諾'});
    const feeEstimate=fee||generic(100000,500000,'加盟授權費');
    let openingEstimate=opening;
    if(!openingEstimate&&fee?.status==='official_package_quote'){
     openingEstimate={...generic(Math.max(1500000,fee.amount),Math.max(3500000,Math.ceil(fee.amount*1.5/100000)*100000),'含設備裝修等開辦費'),status:'package_based_model',sourceName:fee.sourceName,sourceUrl:fee.sourceUrl};
    }
    if(!openingEstimate&&fee?.status==='third_party_package_quote'){
     openingEstimate={...generic(Math.max(1500000,fee.amount),Math.max(3500000,Math.ceil(fee.amount*1.5/100000)*100000),'含設備裝修等開辦費'),status:'package_based_model',sourceName:fee.sourceName,sourceUrl:fee.sourceUrl};
    }
    if(!openingEstimate)openingEstimate=generic(1500000,3500000,'整店開辦資金');
    if(openingEstimate.status==='third_party_preparation_estimate'&&!Number.isFinite(openingEstimate.maxAmount)){
      // Allow for cost fluctuation around a third-party point estimate, with clear model flag.
      const a=openingEstimate.amount;
      openingEstimate={...openingEstimate,amount:Math.floor(a*.8/100000)*100000,maxAmount:Math.ceil(a*1.2/100000)*100000,status:'third_party_range_model',scope:(openingEstimate.scope||'')+'；以第三方單點估算上下20%規劃緩衝，非品牌正式區間'};
    }
    return {...row,franchiseFee:fee,openingTotal:opening,franchiseFeeRange:feeEstimate,openingRange:openingEstimate};
   });sipspotCache={items,fetchedAt:new Date().toISOString(),investmentDataUpdatedAt:investmentRegistry.updatedAt,investmentSource:'已查證來源表；無資料顯示未公開／待查證',source:'SipSpot',sourceUrl:SIPSPOT_URL};return json(res,200,{...sipspotCache,stale:false})}
  catch(e){if(sipspotCache)return json(res,200,{...sipspotCache,stale:true,error:'來源暫時無法讀取，顯示上次成功資料'});return json(res,503,{items:[],stale:true,error:'目前無法取得資料'})}
 }
 if(req.url!=='/search'||req.method!=='POST')return json(res,404,{error:'not found'});
 const client=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0];const nowMs=Date.now();const hits=(recentRequests.get(client)||[]).filter(t=>nowMs-t<60000);if(hits.length>=8)return json(res,429,{error:'搜尋過於頻繁，請稍後再試'});hits.push(nowMs);recentRequests.set(client,hits);if(recentRequests.size>500)recentRequests.clear();
 if(req.headers.origin&&req.headers.origin!==ORIGIN)return json(res,403,{error:'Origin not allowed'});
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>15000)return json(res,413,{error:'too large'})}
 try{
  const body=JSON.parse(raw);const selected=(Array.isArray(body.categories)?body.categories:cats).filter(x=>cats.includes(x));if(!selected.length)return json(res,400,{error:'請選擇分類'});
  const now=new Date(),days={day:1,week:7,month:30,quarter:90}[body.period]||7;
  const start=body.period==='custom'?new Date(body.start+'T00:00:00+08:00'):new Date(now.getTime()-days*86400000);
  const end=body.period==='custom'?new Date(body.end+'T23:59:59+08:00'):now;
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||start>end||end>new Date(now.getTime()+86400000)||end-start>366*86400000)return json(res,400,{error:'日期範圍無效或超過366天'});
  const after=start.toISOString().slice(0,10),before=new Date(end.getTime()+86400000).toISOString().slice(0,10);
  // Search several narrow queries per category. Official-site indexing is explicitly
  // supplementary: Google News does not guarantee coverage of official posts.
  const brandPattern=/(?:comebuy|come[\s-]*buy|長沂國際|康沛|comebuytea)/i;
  const activityPattern=/活動|聯名|優惠|促銷|新品|新飲|上市|限定|買一送一|折扣|集點|會員|抽獎|贈送|節慶|合作|快閃|行銷|公關|再婚皇后|黑糖珍珠|黑糖系列|珍珠系列|新品系列|聯名款/i;
  const marketPattern=/(?:CoCo都可|五桐號|迷客夏|可不可熟成紅茶|UG(?:樂己)?|鶴茶樓|得正|清心福全|50嵐|茶湯會|龜記|一沐日|萬波|手搖飲市場|茶飲市場|飲料市場|手搖飲產業|茶飲產業)/i;
  const specs=selected.flatMap(category=>{
   if(category==='品牌活動')return [
    {category,q:'("COMEBUY" OR "COMEBUY TEA" OR "長沂國際") (活動 OR 聯名 OR 優惠 OR 促銷 OR 新品 OR 限定)'},
    {category,q:'("COMEBUY" OR "康沛" OR "長沂國際") (會員 OR 集點 OR 抽獎 OR 買一送一 OR 上市 OR 合作)'},
    {category,q:'site:comebuy2002.com.tw (活動 OR 新品 OR 優惠 OR 聯名)'},
    {category,q:'("COMEBUY" OR "COMEBUYTEA" OR "康沛") "再婚皇后"'},
    {category,q:'("COMEBUY" OR "COMEBUYTEA" OR "康沛") ("黑糖珍珠" OR "黑糖系列" OR "珍珠系列")'},
    {category,q:'("COMEBUY" OR "COMEBUYTEA") ("聯名" OR "新品上市" OR "期間限定" OR "品牌活動")'},
    {category,q:'site:comebuy2002.com.tw ("再婚皇后" OR "黑糖珍珠" OR "聯名" OR "新品")'}
   ];
   if(category==='競爭品牌與市場動態')return [
    {category,q:'("手搖飲" OR "飲料加盟" OR "茶飲市場") (市場 OR 趨勢 OR 聯名 OR 新品 OR 加盟)'},
    {category,q:'("CoCo都可" OR "五桐號" OR "迷客夏" OR "可不可熟成紅茶") (展店 OR 活動 OR 聯名 OR 新品 OR 加盟)'}
   ];
   const i=cats.indexOf(category);
   return [
    {category,q:'("COMEBUY" OR "COMEBUY TEA" OR "長沂國際") ('+categoryTerms[i].split(' ').join(' OR ')+')'},
    {category,q:'("COMEBUY" OR "COMEBUYTEA") '+(category==='加盟與展店資訊'?'(新店 OR 開幕 OR 歇業 OR 搬遷 OR 加盟 OR 展店)':category==='企業經營與商業資訊'?'(企業 OR 經營 OR 投資 OR 股權 OR 營收 OR 招募)':'(評價 OR 食安 OR 客訴 OR 爭議 OR 消費者)')}
   ];
  });
  const queries=specs.map(x=>x.q+' after:'+after+' before:'+before);
  const responses=await Promise.allSettled(queries.map(q=>fetchWithTimeout('https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=zh-TW&gl=TW&ceid=TW:zh-Hant')));
  const entries=[],limitations=[];
  const sourceStatuses=sources.map(x=>({...x}));
  const setStatus=(id,status,reason)=>{const x=sourceStatuses.find(s=>s.id===id);if(x){x.status=status;x.lastSearchedAt=now.toISOString();if(reason)x.detail=reason}};
  // Official pages: availability probe only. Never label this as content extraction.
  const officialChecks=await Promise.allSettled([1,10,12].map(async id=>{const source=sources.find(x=>x.id===id);const html=await fetchWithTimeout(source.url);return {id,hasHtml:/<html|<!doctype/i.test(html)}}));
  officialChecks.forEach((r,i)=>{const id=[1,10,12][i];if(r.status==='fulfilled')setStatus(id,r.value.hasHtml?'reachable_not_extracted':'unexpected_content','頁面連線測試；未解析發布日期或門市異動');else setStatus(id,'access_limited','官方網站存取失敗或逾時')});
  responses.forEach((r,i)=>{
   const category=specs[i].category;
   if(r.status!=='fulfilled'){limitations.push({category,reason:'公開 RSS 來源無法存取或逾時'});return}
   const blocks=r.value.match(new RegExp('<item>[\\s\\S]*?</item>','g'))||[];
   for(const item of blocks){
    const title=tag(item,'title'),url=tag(item,'link'),dateText=tag(item,'pubDate'),source=tag(item,'source'),description=tag(item,'description');
    const ts=Date.parse(dateText),combined=title+' '+description;
    if(!title||!url.startsWith('https://')||!Number.isFinite(ts)||ts<+start||ts>+end)continue;
    if(category==='競爭品牌與市場動態'){if(!marketPattern.test(combined))continue}
    else {
     if(!brandPattern.test(combined))continue;
     if(category==='品牌活動'&&!activityPattern.test(combined))continue;
     if(category==='加盟與展店資訊'&&!/新店|開幕|歇業|搬遷|加盟|展店|招商|門市|據點|籌備/.test(combined))continue;
     if(category==='企業經營與商業資訊'&&!/企業|經營|投資|股權|營收|財報|招募|資本|董事|登記|長沂國際/.test(combined))continue;
     if(category==='網路事件與消費者評論'&&!/評價|食安|客訴|爭議|消費者|評論|抱怨|投訴|事件/.test(combined))continue;
    }
    entries.push({id:Buffer.from((title+'|'+url).slice(0,250)).toString('base64url'),title,url,publishedAt:new Date(ts).toISOString(),category,source:source||'Google 新聞索引',sourceType:'第三方索引（未核實官方原文）',summary:description.slice(0,300)||title,importance:/歇業|撤店|加盟|展店|開幕|裁罰|食安|爭議/.test(title)?'高':/促銷|優惠|營運|市場|新品|聯名/.test(title)?'中':'低',impact:/開幕|展店|加盟/.test(title)?'可能涉及展店機會，須核對官方門市清單':/歇業|搬遷/.test(title)?'可能涉及門市異動，須人工查證':'供加盟拓展與品牌營運參考，尚需查證'});
   }
  });
  const okRss=responses.filter(r=>r.status==='fulfilled').length;
  setStatus(13,okRss===responses.length?'success':okRss?'partial':'failed',`RSS 查詢成功 ${okRss}/${responses.length} 組；只涵蓋新聞索引，不代表已直接搜尋其他來源`);
  const unique=new Map();for(const x of entries){const key=x.category+'|'+x.title.replace(/\s*[-–|｜].*$/,'').replace(/\s/g,'').toLowerCase();if(!unique.has(key))unique.set(key,x)}
  const items=[...unique.values()].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,120);
  return json(res,200,{searchedAt:now.toISOString(),provider:'Google News 公開 RSS + 官方頁面連線檢查（非27站內容搜尋）',items,sources:sourceStatuses,limitations:[...limitations,{category:'來源覆蓋限制',reason:'官方頁面僅連線測試；其餘平台未直接擷取，新聞 RSS 索引不等於逐站搜尋。商工登記、招募與門市異動尚未建立可核驗的結構化擷取。'}],analysis:{type:'規則式摘要（非生成式 AI）',top:items.slice(0,5).map(x=>x.title),newStores:items.filter(x=>/開幕|新店|搬遷|歇業/.test(x.title)).length,marketing:items.filter(x=>/活動|促銷|優惠|聯名/.test(x.title)).length,competition:items.filter(x=>/市場|競爭|加盟/.test(x.title)).length,note:'以下僅為公開新聞索引的關鍵字整理，非 AI 查證結論。啟用生成式 AI 需另行確認 API 與費用。'}});
 }catch(e){return json(res,502,{error:'搜尋失敗：'+String(e.message||e).slice(0,140)})}
}).listen(PORT,'0.0.0.0');
