
const fs = require('fs');

const API_KEY = 'AKQ3LMU3ETYDFBPDA6ZJL4KSVP';
const API_SECRET = '2fp8XjsQuxPHcDh2cWkE3f37aRfqwi7miiJDGE6trJB5';

async function auditTickers() {
    // Read tickerList.ts
    const content = fs.readFileSync('app/tickerList.ts', 'utf8');
    const match = content.match(/\[([\s\S]*?)\]/);
    if (!match) return;
    const tickers = match[1].replace(/"/g, '').split(',').map(s => s.trim()).filter(s => s);

    console.log(`Auditing ${tickers.length} tickers for account compatibility...`);

    const symbols = tickers.join(',');
    const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols}`;
    
    const resp = await fetch(url, {
        headers: {
            'APCA-API-KEY-ID': API_KEY,
            'APCA-API-SECRET-KEY': API_SECRET
        }
    });

    if (!resp.ok) {
        console.error('Failed to fetch snapshots:', await resp.text());
        return;
    }

    const data = await resp.json();
    const equity = 2400;
    const maxLeverage = 2;
    const totalBP = equity * maxLeverage;
    const maxPosValue = 200; // 8% of equity

    const highPrice = [];
    const illiquid = [];

    for (const ticker of tickers) {
        const snap = data[ticker];
        if (!snap) continue;
        const price = snap.latestTrade?.p || snap.prevDailyBar?.c || 0;
        
        if (price > maxPosValue) {
            highPrice.push({ticker, price});
        }
    }

    console.log('\n--- Budget Violations (Price > $200) ---');
    console.log(`These symbols represent >8% of your total equity for just 1 share!`);
    highPrice.sort((a,b) => b.price - a.price).slice(0, 20).forEach(x => {
        console.log(`${x.ticker.padEnd(8)}: $${x.price.toFixed(2)} (${((x.price/equity)*100).toFixed(1)}% of equity per share)`);
    });

    console.log(`\nTotal High-Price Symbols to PRUNE: ${highPrice.length}`);
}

auditTickers();
