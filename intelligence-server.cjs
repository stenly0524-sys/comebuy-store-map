const http=require('node:http');
const PORT=Number(process.env.PORT||10000);
const ORIGIN=process.env.ALLOWED_ORIGIN||'https://comebuy-store-map.onrender.com';
const cats=['品牌活動','加盟與展店資訊','企業經營與商業資訊','網路事件與消費者評論','競爭品牌與市場動態'];
const categoryTerms=['活動 聯名 促銷 行銷 公關','加盟 展店 新店 開幕 搬遷 歇業 招商','長沂國際 營運 財報 企業 策略 規劃','評價 爭議 消費者 社群','手搖飲 飲料 市場 競爭 加盟'];
const escapeXml=x=>x.replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/<[^>]*>/g,'').trim();
const tag=(s,k)=>escapeXml((s.match(new RegExp('<'+k+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+k+'>','i'))||[])[1]||'');
const fetchWithTimeout=async(url)=>{for(let attempt=0;attempt<2;attempt++){const c=new AbortController();const t=setTimeout(()=>c.abort(),9000);try{const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'COMEBUY-MAPS-Intelligence/1.0'}});if(!r.ok)throw Error('HTTP '+r.status);return await r.text()}catch(e){if(attempt)throw e}finally{clearTimeout(t)}}};
const recentRequests=new Map();
const json=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':ORIGIN,'vary':'Origin','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj))};
http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'POST,GET,OPTIONS','access-control-allow-headers':'content-type'});return res.end()}
 if(req.url==='/health')return json(res,200,{ok:true,provider:'Google News public RSS',ai:false});
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
  const activityPattern=/活動|聯名|優惠|促銷|新品|新飲|上市|限定|買一送一|折扣|集點|會員|抽獎|贈送|節慶|合作|快閃|行銷|公關/i;
  const marketPattern=/手搖飲|飲料|茶飲|加盟|品牌|市場|連鎖|展店|開店|消費|競爭|新品|聯名/i;
  const specs=selected.flatMap(category=>{
   if(category==='品牌活動')return [
    {category,q:'("COMEBUY" OR "COMEBUY TEA" OR "長沂國際") (活動 OR 聯名 OR 優惠 OR 促銷 OR 新品 OR 限定)'},
    {category,q:'("COMEBUY" OR "康沛" OR "長沂國際") (會員 OR 集點 OR 抽獎 OR 買一送一 OR 上市 OR 合作)'},
    {category,q:'site:comebuy2002.com.tw (活動 OR 新品 OR 優惠 OR 聯名)'}
   ];
   if(category==='競爭品牌與市場動態')return [
    {category,q:'("手搖飲" OR "飲料加盟" OR "茶飲市場") (市場 OR 趨勢 OR 聯名 OR 新品 OR 加盟)'},
    {category,q:'("CoCo都可" OR "五桐號" OR "迷客夏" OR "可不可熟成紅茶") (展店 OR 活動 OR 聯名 OR 新品 OR 加盟)'}
   ];
   const i=cats.indexOf(category);
   return [{category,q:'("COMEBUY" OR "COMEBUY TEA" OR "長沂國際") ('+categoryTerms[i].split(' ').join(' OR ')+')'}];
  });
  const queries=specs.map(x=>x.q+' after:'+after+' before:'+before);
  const responses=await Promise.allSettled(queries.map(q=>fetchWithTimeout('https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=zh-TW&gl=TW&ceid=TW:zh-Hant')));
  const entries=[],limitations=[];
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
    }
    entries.push({id:Buffer.from((title+'|'+url).slice(0,250)).toString('base64url'),title,url,publishedAt:new Date(ts).toISOString(),category,source:source||'Google 新聞索引',sourceType:'第三方索引（未核實官方原文）',summary:description.slice(0,300)||title,importance:/歇業|撤店|加盟|展店|開幕|裁罰|食安|爭議/.test(title)?'高':/促銷|優惠|營運|市場|新品|聯名/.test(title)?'中':'低',impact:/開幕|展店|加盟/.test(title)?'可能涉及展店機會，須核對官方門市清單':/歇業|搬遷/.test(title)?'可能涉及門市異動，須人工查證':'供加盟拓展與品牌營運參考，尚需查證'});
   }
  });
  const unique=new Map();for(const x of entries){const key=x.title.replace(/\s*[-–|｜].*$/,'').replace(/\s/g,'').toLowerCase();if(!unique.has(key))unique.set(key,x)}
  const items=[...unique.values()].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,120);
  return json(res,200,{searchedAt:now.toISOString(),provider:'Google News 公開 RSS（非所有平台完整搜尋）',items,limitations:[...limitations,{category:'其他官方社群及商工登記',reason:'本階段未接入官方網站、Facebook、Instagram、LINE、104、1111、商工登記及你訂的專屬資料介面；不得視為已搜尋'}],analysis:{type:'規則式摘要（非生成式 AI）',top:items.slice(0,5).map(x=>x.title),newStores:items.filter(x=>/開幕|新店|搬遷|歇業/.test(x.title)).length,marketing:items.filter(x=>/活動|促銷|優惠|聯名/.test(x.title)).length,competition:items.filter(x=>/市場|競爭|加盟/.test(x.title)).length,note:'以下僅為公開新聞索引的關鍵字整理，非 AI 查證結論。啟用生成式 AI 需另行確認 API 與費用。'}});
 }catch(e){return json(res,502,{error:'搜尋失敗：'+String(e.message||e).slice(0,140)})}
}).listen(PORT,'0.0.0.0');
