const http=require('node:http');
const PORT=Number(process.env.PORT||10000);
const ORIGIN=process.env.ALLOWED_ORIGIN||'https://comebuy-store-map.onrender.com';
const cats=['品牌活動','加盟與展店資訊','企業經營與商業資訊','網路事件與消費者評論','競爭品牌與市場動態'];
const keywords=['COMEBUY','COMEBUY TEA','長沂國際'];
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
  const queries=selected.map(c=>{const i=cats.indexOf(c);const brand=c==='競爭品牌與市場動態'?'("手搖飲" OR "飲料加盟" OR "CoCo都可" OR "五桐號" OR "迷客夏")':'("COMEBUY" OR "COMEBUY TEA" OR "長沂國際")';return brand+' ('+categoryTerms[i].split(' ').join(' OR ')+') after:'+after+' before:'+before});
  const responses=await Promise.allSettled(queries.map(q=>fetchWithTimeout('https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=zh-TW&gl=TW&ceid=TW:zh-Hant')));
  const entries=[],limitations=[];responses.forEach((r,i)=>{if(r.status!=='fulfilled'){limitations.push({category:selected[i],reason:'公開 RSS 來源無法存取或逾時'});return}const blocks=r.value.match(/<item>[\s\S]*?<\/item>/g)||[];for(const block of blocks){const title=tag(block,'title'),url=tag(block,'link'),dateText=tag(block,'pubDate'),source=tag(block,'source');const ts=Date.parse(dateText);if(!title||!url.startsWith('https://')||!Number.isFinite(ts)||ts<+start||ts>+end)continue;if(selected[i]!=='競爭品牌與市場動態'&&!/comebuy|come buy|長沂國際/i.test(title+' '+tag(block,'description')))continue;entries.push({id:Buffer.from((title+'|'+url).slice(0,250)).toString('base64url'),title,url,publishedAt:new Date(ts).toISOString(),category:selected[i],source:source||'Google 新聞索引',sourceType:'第三方索引（未核實官方原文）',summary:tag(block,'description').slice(0,300)||title,importance:/歇業|撤店|加盟|展店|開幕|裁罰|食安|爭議/.test(title)?'高':/促銷|優惠|營運|市場/.test(title)?'中':'低',impact:/開幕|展店|加盟/.test(title)?'可能涉及展店機會，須核對官方門市清單':/歇業|搬遷/.test(title)?'可能涉及門市異動，須人工查證':'供加盟拓展與品牌營運參考，尚需查證'})}});
  const unique=new Map();for(const x of entries){const key=x.title.replace(/\s*[-–|｜].*$/,'').replace(/\s/g,'').toLowerCase();if(!unique.has(key))unique.set(key,x)}
  const items=[...unique.values()].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,120);
  return json(res,200,{searchedAt:now.toISOString(),provider:'Google News 公開 RSS（非所有平台完整搜尋）',items,limitations:[...limitations,{category:'其他官方社群及商工登記',reason:'本階段未接入官方網站、Facebook、Instagram、LINE、104、1111、商工登記及你訂的專屬資料介面；不得視為已搜尋'}],analysis:{type:'規則式摘要（非生成式 AI）',top:items.slice(0,5).map(x=>x.title),newStores:items.filter(x=>/開幕|新店|搬遷|歇業/.test(x.title)).length,marketing:items.filter(x=>/活動|促銷|優惠|聯名/.test(x.title)).length,competition:items.filter(x=>/市場|競爭|加盟/.test(x.title)).length,note:'以下僅為公開新聞索引的關鍵字整理，非 AI 查證結論。啟用生成式 AI 需另行確認 API 與費用。'}});
 }catch(e){return json(res,502,{error:'搜尋失敗：'+String(e.message||e).slice(0,140)})}
}).listen(PORT,'0.0.0.0');
