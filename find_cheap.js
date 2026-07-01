import fs from 'fs';
import fetch from 'node-fetch';

(async ()=>{
  const txt = fs.readFileSync('app/tickerList.ts','utf8');
  const m = txt.match(/"([A-Z0-9.]+)"/g).map(s=>s.replace(/"/g,''));
  const seen = new Set();
  for(const s of m){
    if(seen.has(s)) continue; seen.add(s);
  }
  for(const s of Array.from(seen)){
    try{
      const r = await fetch('http://localhost:3000/api/alpaca/quote?symbol='+encodeURIComponent(s));
      const j = await r.json();
      if(j.price && Number(j.price)<=10) console.log(s, j.price, j.source);
    }catch(e){ }
  }
})();
