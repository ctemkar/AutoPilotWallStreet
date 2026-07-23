
const fs = require('fs');

const API_KEY = 'AKQ3LMU3ETYDFBPDA6ZJL4KSVP';
const API_SECRET = '2fp8XjsQuxPHcDh2cWkE3f37aRfqwi7miiJDGE6trJB5';

async function pruneTickers() {
    const content = fs.readFileSync('app/tickerList.ts', 'utf8');
    const match = content.match(/\[([\s\S]*?)\]/);
    if (!match) return;
    const tickers = match[1].replace(/"/g, '').split(',').map(s => s.trim()).filter(s => s);

    const symbols = tickers.join(',');
    const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols}`;
    
    const resp = await fetch(url, {
        headers: {
            'APCA-API-KEY-ID': API_KEY,
            'APCA-API-SECRET-KEY': API_SECRET
        }
    });

    if (!resp.ok) return;
    const data = await resp.json();
    
    // Price < $120 means each share is < 5% of a $2.4k account
    // This allows for at least 20 positions without fractional short rejections
    const MAX_PRICE = 120;
    
    const valid = tickers.filter(t => {
        const snap = data[t];
        if (!snap) return false;
        const price = snap.latestTrade?.p || snap.prevDailyBar?.c || 0;
        return price > 1 && price < MAX_PRICE;
    });

    console.log(`Pruned ${tickers.length} -> ${valid.length} tickers (Price < $${MAX_PRICE})`);
    
    const newList = `export const quickTickers = [\n  "${valid.join('","')}"\n];`;
    fs.writeFileSync('app/tickerList.ts', newList);
}

pruneTickers();
