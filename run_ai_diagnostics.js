async function runDiagnostics() {
  const accountData = {
    account: {
      last_equity: 2448.76,
      cash: 2696.84,
      equity: 2422.27,
      buying_power: 5624.82,
      long_market_value: 1556.16,
      short_market_value: -1830.73
    },
    positions: [
      {symbol:"BA",qty:1.1016,side:"long",avg_entry_price:209.67,current_price:208.1,market_value:229.25},
      {symbol:"CAT",qty:0.1527,side:"long",avg_entry_price:893.76,current_price:892.05,market_value:136.22},
      {symbol:"CRM",qty:-2,side:"short",avg_entry_price:168.27,current_price:168.95,market_value:-337.9},
      {symbol:"HD",qty:-1,side:"short",avg_entry_price:333.04,current_price:331.93,market_value:-331.93},
      {symbol:"LLY",qty:-1,side:"short",avg_entry_price:1159.27,current_price:1160.9,market_value:-1160.9},
      {symbol:"MTD",qty:0.1160,side:"long",avg_entry_price:1292.39,current_price:1293.78,market_value:150.15},
      {symbol:"NXST",qty:1.2467,side:"long",avg_entry_price:185.27,current_price:184.56,market_value:230.09},
      {symbol:"ORCL",qty:2.1520,side:"long",avg_entry_price:126.15,current_price:125.89,market_value:270.93}
    ]
  };

  const payload = {
    positions: accountData.positions,
    cash: accountData.account.cash,
    equity: accountData.account.equity,
    buyingPower: accountData.account.buying_power,
    leverage: (accountData.account.long_market_value + Math.abs(accountData.account.short_market_value)) / accountData.account.equity
  };

  try {
    const res = await fetch('http://localhost:3000/api/gemini/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log(data.diagnosis);
  } catch (err) {
    console.error("AI Diagnostic Failed:", err.message);
  }
}

runDiagnostics();