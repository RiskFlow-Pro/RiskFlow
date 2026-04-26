// ─── DAILY LOSS LIMIT (DLL)   ───
// Persistenza: localStorage keys
// dll_enabled: 'true'/'false'
// dll_pct: soglia percentuale (default 2)
// dll_triggered_at: timestamp ms quando è scattato il blocco
// dll_balance_snapshot: balance al momento dell'attivazione / reset giornaliero

const DLL_KEY_EN   = 'dll_enabled';
const DLL_KEY_PCT  = 'dll_pct';
const DLL_KEY_TS   = 'dll_triggered_at';
const DLL_KEY_SNAP = 'dll_balance_snapshot';
const DLL_LOCK_MS  = 24 * 60 * 60 * 1000; // 24 ore in ms

function dllLoad() {
  return {
    enabled:     localStorage.getItem(DLL_KEY_EN) === 'true',
    pct:         parseFloat(localStorage.getItem(DLL_KEY_PCT) || '2'),
    triggeredAt: parseInt(localStorage.getItem(DLL_KEY_TS) || '0'),
    snapshot:    parseFloat(localStorage.getItem(DLL_KEY_SNAP) || '0'),
  };
}

function dllSave(d) {
  localStorage.setItem(DLL_KEY_EN,   d.enabled ? 'true' : 'false');
  localStorage.setItem(DLL_KEY_PCT,  String(d.pct));
  localStorage.setItem(DLL_KEY_TS,   String(d.triggeredAt || 0));
  localStorage.setItem(DLL_KEY_SNAP, String(d.snapshot || 0));
}

// Ritorna true se il blocco è attivo (triggered + entro 24h)
function dllIsLocked() {
  const d = dllLoad();
  if (!d.enabled) return false;
  if (!d.triggeredAt) return false;
  return (Date.now() - d.triggeredAt) < DLL_LOCK_MS;
}

// Ritorna ms rimanenti al reset (0 se non locked)
function dllRemainingMs() {
  const d = dllLoad();
  if (!d.triggeredAt) return 0;
  const rem = DLL_LOCK_MS - (Date.now() - d.triggeredAt);
  return rem > 0 ? rem : 0;
}

// Formatta ms in "HH:mm:ss"
function dllFmtCountdown(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

// Aggiorna UI toggle + banner + settings
function dllRenderUI() {
  const d     = dllLoad();
  const sw    = document.getElementById('dllSw');
  const lbl   = document.getElementById('dllLbl');
  const tgl   = document.getElementById('dllToggle');
  const sett  = document.getElementById('dllSettings');
  const banner= document.getElementById('dllBanner');
  const pctEl = document.getElementById('dllPct');
  if (!sw) return;

  const locked = dllIsLocked();

  // Toggle switch
  sw.classList.toggle('on', d.enabled);
  lbl.textContent = d.enabled ? 'ON' : 'OFF';

  // Se locked, il toggle non si può toccare
  tgl.classList.toggle('locked', locked);

  // Settings (visibili solo se ON e non locked)
  sett.style.display  = (d.enabled && !locked) ? '' : 'none';
  banner.style.display = locked ? '' : 'none';

  if (pctEl && d.pct) pctEl.value = d.pct;
}

// Toggle ON/OFF — se locked, niente
function dllToggleSwitch() {
  if (dllIsLocked()) {
    notify('Impossibile disattivare: blocco attivo per altre ' + dllFmtCountdown(dllRemainingMs()), 'err');
    return;
  }
  const d = dllLoad();
  d.enabled = !d.enabled;
  // Al momento dell'attivazione, salva snapshot del wallet balance (saldo realizzato, senza unrealized PnL)
  // Lo snapshot DEVE essere preso qui, mai durante un sync con trade aperti
  if (d.enabled) {
    const wb = (S.walletBalance > 0) ? S.walletBalance : (S.balance > 0 ? S.balance : 0);
    if (wb <= 0) {
      // Balance non ancora disponibile — blocca l'attivazione e chiedi sync prima
      notify('⚠️ Sincronizza il conto prima di attivare il Daily Loss Limit', 'err');
      return;
    }
    d.snapshot = wb;
  }
  // Al momento della disattivazione, resetta tutto
  if (!d.enabled) {
    d.triggeredAt = 0;
    d.snapshot    = 0;
  }
  dllSave(d);
  dllRenderUI();
}

// Chiamata quando arriva nuovo balance dall'exchange — controlla soglia
function dllCheckBalance(currentBalance) {
  const d = dllLoad();
  if (!d.enabled) return;
  if (dllIsLocked()) return; // già lockato
  // Se snapshot non è ancora disponibile, aspetta il prossimo toggle ON
  // NON inizializzare qui: potremmo essere in mezzo a un trade e il balance è già sporco
  if (!d.snapshot || d.snapshot <= 0) return;
  const lossPct = ((d.snapshot - currentBalance) / d.snapshot) * 100;
  if (lossPct >= d.pct) {
    // TRIGGER!
    d.triggeredAt = Date.now();
    dllSave(d);
    dllRenderUI();
    notify(`🛑 Daily Loss Limit scattato! (-${lossPct.toFixed(2)}%) — trading bloccato 24h`, 'err');
    dllStartCountdown();
  }
}

// Countdown timer aggiornato ogni secondo
let _dllTimer = null;
function dllStartCountdown() {
  if (_dllTimer) clearInterval(_dllTimer);
  _dllTimer = setInterval(() => {
    const rem = dllRemainingMs();
    const el  = document.getElementById('dllCountdown');
    if (!el) return;
    if (rem <= 0) {
      clearInterval(_dllTimer);
      _dllTimer = null;
      // Reset snapshot per il nuovo giorno — triggered_at azzerato, wallet balance snapshot aggiornato
      const d = dllLoad();
      d.triggeredAt = 0;
      d.snapshot    = (S.walletBalance > 0 ? S.walletBalance : (S.balance > 0 ? S.balance : 0));
      dllSave(d);
      dllRenderUI();
      notify('✅ Daily Loss Limit: blocco scaduto, trading ripristinato', 'ok');
    } else {
      el.textContent = 'Sblocco tra: ' + dllFmtCountdown(rem);
    }
  }, 1000);
}

// Salva la soglia % quando viene modificata
function dllSaveSettings() {
  const el = document.getElementById('dllPct');
  if (!el) return;
  const pct = parseFloat(el.value);
  if (isNaN(pct) || pct <= 0) return;
  const d = dllLoad();
  d.pct = pct;
  dllSave(d);
}

// Guard da chiamare all'inizio di openModal e openLadderModal
function dllGuard() {
  if (!dllIsLocked()) return false; // tutto ok, non bloccato
  const rem = dllRemainingMs();
  notify(`🛑 Trading bloccato — Daily Loss Limit attivo. Sblocco tra ${dllFmtCountdown(rem)}`, 'err');
  return true; // bloccato
}

// ─── SL PROTECT ───
// Quando attivo: dopo aver impostato entry + SL, non permette di allargare lo SL.
// LONG  (sl < entry): nuova sl NON può scendere sotto lo sl attuale
// SHORT (sl > entry): nuova sl NON può salire sopra lo sl attuale
// Persiste in localStorage: 'slp_enabled'

const SLP_KEY = 'slp_enabled';

function slpLoad() {
  return localStorage.getItem(SLP_KEY) === 'true';
}
function slpSave(v) {
  localStorage.setItem(SLP_KEY, v ? 'true' : 'false');
}

// Ritorna true se ci sono posizioni aperte (il toggle non può essere disattivato)
function slpIsLocked() {
  return slpLoad() && window._positions && window._positions.length > 0;
}

// Aggiorna lo stato visivo del toggle nella topbar
function slpRenderUI() {
  const on     = slpLoad();
  const locked = slpIsLocked();
  const wrap   = document.getElementById('slpWrap');
  const state  = document.getElementById('slpState');
  if (!wrap) return;
  wrap.classList.toggle('on', on);
  wrap.classList.toggle('locked', locked);
  wrap.style.cursor = locked ? 'not-allowed' : 'pointer';
  wrap.title = locked
    ? '🛡 SL Shield attivo — non puoi disattivarlo mentre hai posizioni aperte'
    : "SL Shield: impedisce di allargare lo stop loss sulle posizioni aperte";
  if (state) state.textContent = locked ? '🔒' : on ? 'ON' : 'OFF';
}

// Click sul toggle
function slpToggle() {
  if (slpIsLocked()) {
    notify('🛡 SL Shield bloccato — non puoi disattivarlo mentre hai posizioni aperte.', 'err');
    return;
  }
  const on = !slpLoad();
  slpSave(on);
  slpRenderUI();
  notify(on ? '🛡 SL Shield ON — lo SL delle posizioni non può essere allargato' : 'SL Shield disattivato', on ? 'ok' : '');
}

/**
 * Aggiorna il _refSL di una posizione dopo un Set SL confermato sull'exchange.
 * Questo è l'UNICO punto in cui il floor invalicabile avanza.
 * @param {number} idx   - indice della posizione
 * @param {number} newSL - nuovo SL confermato
 */
function slpCommitRef(idx, newSL) {
  if (!slpLoad()) return;
  if (!newSL || newSL <= 0) return;
  const entry = window._posSLLines && window._posSLLines[idx];
  if (!entry) return;
  entry._refSL = newSL;
}

/**
 * Controlla se il nuovo SL proposto per una posizione aperta è ammesso.
 * @param {number} newSL   - nuovo prezzo SL proposto
 * @param {number} refSL   - SL originale della posizione (riferimento)
 * @param {string} side    - 'long' | 'short'
 * @param {boolean} silent - se true, non mostra notify
 */
function slpCheck(newSL, refSL, side, silent = false) {
  if (!slpLoad()) return true;
  if (!newSL || newSL <= 0 || !refSL || refSL <= 0) return true;

  if (side === 'long') {
    // LONG: SL sotto entry. Non si può scendere sotto il ref (allargare).
    if (newSL < refSL) {
      if (!silent) notify(`🛡 SL Shield: non puoi allargare lo SL (min $${fmtPrice(refSL)})`, 'err');
      return false;
    }
  } else {
    // SHORT: SL sopra entry. Non si può salire sopra il ref (allargare).
    if (newSL > refSL) {
      if (!silent) notify(`🛡 SL Shield: non puoi allargare lo SL (max $${fmtPrice(refSL)})`, 'err');
      return false;
    }
  }
  return true;
}

// ─── ASSETS ───
// Caricati dinamicamente da Bitget all'avvio
let ASSETS = [];

// Categorie euristiche basate su simbolo
function guessCat(sym){
  const s = sym.replace('USDT','').replace('PERP','');

  // Prefisso 1000x/10000x → sempre Meme
  if(/^1000|^10000/.test(s)) return 'Meme';

  const MAJOR   = new Set(['BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','TRX','SHIB','LTC','BCH','DOT','LINK','XLM','UNI','ATOM','ETC','SUI','STX','FIL','HBAR','IMX','VET','OP','ARB','MKR','AAVE','APT','NEAR','ICP']);
  const MEME    = new Set(['PEPE','WIF','BONK','FLOKI','MEME','POPCAT','BRETT','DOGS','NEIRO','TURBO','MOG','BABYDOGE','SAMO','CHEEMS','MYRO','BOME','SLERF','PONKE','GIGA','PNUT','GOAT','MOODENG','FWOG','SUNDOG','HMSTR','CATI','DOGE2','BABYPEPE','PEPE2','LADYS','SNEK','COQ','KISHU','AKITA','ELON','BOOMER','NORMIE','TOSHI','DEGEN','HIGHER','BENJI','ROCKY','BILLY','ANDY','RATS','ORDI','PIZZA','KEKIUS','SIGMA','GORK','CROC','LANDWOLF','WOJAK','COPE','CHAD','CULT','FOXY','SILLY']);
  const DEFI    = new Set(['UNI','AAVE','MKR','CRV','SNX','COMP','LDO','RUNE','JUP','RAY','DYDX','GMX','PENDLE','ENA','EIGEN','CAKE','BAL','1INCH','SUSHI','YFI','CVX','FXS','OSMO','KAVA','TIA','PYTH','ORCA','PERP','DODO','ALPHA','BOND','BIFI','BADGER','ANKR','CREAM','WEN','MNGO']);
  const L1L2    = new Set(['ARB','OP','SUI','APT','NEAR','FTM','ALGO','ATOM','ICP','FIL','HBAR','EGLD','FLOW','XTZ','MINA','KAS','STX','INJ','SEI','TAO','TON','MATIC','POL','ONE','CELO','ZIL','IOTA','THETA','QTUM','WAVES','NEO','LUNA','LUNC','KLAY','ROSE','MOVR','GLMR','ASTR','SDN','STRK','ZETA','METIS','BOBA','CELR','SKL','LRC','DUSK','XDC','STORJ','NKN','BERA','HYPE','MOVE','VIRTUAL','ZK','MANTA','ALT','SONIC','S','BLAST','SCROLL']);
  const AI      = new Set(['FET','RENDER','WLD','ARKM','AGIX','OCEAN','GRT','TAO','AI','NMR','CTXC','ORAI','ALI','AIOZ','RNDR','RSS3','LPT','GRASS','AKT','IO','AIUS','VANA','MASA','TRAC','CERE']);
  const GAMING  = new Set(['AXS','SAND','MANA','ENJ','GALA','ALICE','TLM','SLP','GHST','ILV','YGG','GODS','MC','RACA','MOBOX','SKILL','TOWER','DOSE','SPS','GLX','PIXEL','PORTAL','RON','BEAM','PRIME','GMEE','COMBO','PROM','CHESS','VOXEL','WEMIX','OAS','ACE','XAI','DRIFT','DUEL']);
  const EXCHANGE= new Set(['OKB','GT','HT','FTT','CRO','KCS','MX','WOO','NEXO','LEO','VGX']);

  if(MEME.has(s))     return 'Meme';
  if(MAJOR.has(s))    return 'Major';
  if(GAMING.has(s))   return 'Gaming';
  if(AI.has(s))       return 'AI';
  if(DEFI.has(s))     return 'DeFi';
  if(L1L2.has(s))     return 'L1/L2';
  if(EXCHANGE.has(s)) return 'Exchange';
  // Pattern meme aggiuntivi per nuovi token non in lista
  if(/(INU|MOON|SAFE|ELON|PEPE|SHIB|FLOKI|DOGE|APE|CHAD|WOJAK|CULT|COPE|BONK|WIF)/.test(s)) return 'Meme';
  return 'Altcoin';
}

async function loadBitgetPairs(){
  try{
    const r = await fetch('https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES');
    const j = await r.json();
    if(j.code==='00000' && j.data?.length){
      ASSETS = j.data
        .filter(x=>x.symbol&&x.symbol.endsWith('USDT'))
        .map(x=>({ sym:x.symbol, cat:guessCat(x.symbol) }))
        .sort((a,b)=>a.sym.localeCompare(b.sym));
    }
  }catch(e){
    console.warn('Bitget contracts fallback',e);
  }
  // Fallback se API non risponde
  if(!ASSETS.length){
    ASSETS = [
      {sym:'BTCUSDT',cat:'Major'},{sym:'ETHUSDT',cat:'Major'},{sym:'SOLUSDT',cat:'Major'},
      {sym:'BNBUSDT',cat:'Major'},{sym:'XRPUSDT',cat:'Major'},{sym:'ADAUSDT',cat:'Major'},
      {sym:'DOGEUSDT',cat:'Major'},{sym:'AVAXUSDT',cat:'Major'},{sym:'TRXUSDT',cat:'Major'},
      {sym:'LTCUSDT',cat:'Major'},{sym:'BCHUSDT',cat:'Major'},{sym:'DOTUSDT',cat:'Major'},
      {sym:'LINKUSDT',cat:'Major'},{sym:'UNIUSDT',cat:'DeFi'},{sym:'AAVEUSDT',cat:'DeFi'},
      {sym:'SUIUSDT',cat:'L1/L2'},{sym:'APTUSDT',cat:'L1/L2'},{sym:'ARBUSDT',cat:'L1/L2'},
      {sym:'OPUSDT',cat:'L1/L2'},{sym:'NEARUSDT',cat:'L1/L2'},{sym:'INJUSDT',cat:'L1/L2'},
      {sym:'PEPEUSDT',cat:'Meme'},{sym:'WIFUSDT',cat:'Meme'},{sym:'BONKUSDT',cat:'Meme'},
      {sym:'FETUSDT',cat:'AI'},{sym:'RENDERUSDT',cat:'AI'},{sym:'WLDUSDT',cat:'AI'},
    ];
  }
}

// ─── BYBIT PUBLIC API (market data) ───
// Proxy dedicato Bybit — separato dal proxy Bitget, non interferisce
const BYBIT_PROXY = 'https://bybit-proxy-2ggw.onrender.com';

async function bybitPublicFetch(endpoint, params = {}) {
  const qstr = new URLSearchParams({ endpoint, ...params }).toString();
  const r = await fetch(`${BYBIT_PROXY}?${qstr}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function loadBybitPairs() {
  try {
    const j = await bybitPublicFetch('/v5/market/instruments-info', { category: 'linear', limit: '1000' });
    if (j.retCode === 0 && j.result?.list?.length) {
      ASSETS = j.result.list
        .filter(x => x.symbol && x.symbol.endsWith('USDT') && x.status === 'Trading')
        .map(x => ({ sym: x.symbol, cat: guessCat(x.symbol) }))
        .sort((a, b) => a.sym.localeCompare(b.sym));
    }
  } catch(e) { console.warn('Bybit pairs fallback', e); }
  if (!ASSETS.length) {
    ASSETS = [
      {sym:'BTCUSDT',cat:'Major'},{sym:'ETHUSDT',cat:'Major'},{sym:'SOLUSDT',cat:'Major'},
      {sym:'BNBUSDT',cat:'Major'},{sym:'XRPUSDT',cat:'Major'},{sym:'ADAUSDT',cat:'Major'},
    ];
  }
}

async function fetchBybitCandles(symbol, tf) {
  const intervalMap = { '1m':'1','5m':'5','15m':'15','1H':'60','4H':'240','1D':'D' };
  const interval = intervalMap[tf] || '15';
  const PER_CALL = 200;
  const MAX_CALLS = 10;
  const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';

  try {
    let allCandles = [];
    let endTime = Date.now();

    for (let i = 0; i < MAX_CALLS; i++) {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 12000);
      let r;
      try {
        const qstr = new URLSearchParams({ endpoint: '/v5/market/kline', category: 'linear', symbol: sym, interval, end: String(endTime), limit: String(PER_CALL) }).toString();
        r = await fetch(`${BYBIT_PROXY}?${qstr}`, { signal: ctrl.signal });
      } finally { clearTimeout(tid); }
      if (!r || !r.ok) { console.warn('Bybit /kline HTTP', r?.status); break; }
      const j = await r.json();
      if (j.retCode !== 0) { console.warn('Bybit /kline err', j.retCode, j.retMsg); break; }
      const rows = j.result?.list;
      if (!rows || !rows.length) break;
      // Bybit returns newest first: [ts, open, high, low, close, volume, turnover]
      const candles = rows.map(d => ({
        time:  Math.floor(parseInt(d[0]) / 1000),
        open:  parseFloat(d[1]),
        high:  parseFloat(d[2]),
        low:   parseFloat(d[3]),
        close: parseFloat(d[4]),
      }));
      allCandles = candles.concat(allCandles);
      const oldestTs = Math.min(...rows.map(d => parseInt(d[0])));
      endTime = oldestTs - 1;
      if (rows.length < PER_CALL) break;
    }

    if (!allCandles.length) { console.warn('Bybit: no candles for', sym, tf); return null; }
    const seen = new Set();
    return allCandles
      .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
      .sort((a, b) => a.time - b.time);
  } catch(e) { console.error('Bybit fetchCandles', e); return null; }
}

async function fetchBybitTicker(symbol) {
  const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    let j;
    try {
      j = await bybitPublicFetch('/v5/market/tickers', { category: 'linear', symbol: sym });
    } finally { clearTimeout(tid); }
    if (j.retCode !== 0) throw new Error(j.retMsg);
    const d = j.result?.list?.[0];
    if (!d || !d.lastPrice) throw new Error('no lastPrice');
    return {
      last:    parseFloat(d.lastPrice),
      open24h: parseFloat(d.prevPrice24h || d.lastPrice),
      high24h: parseFloat(d.highPrice24h || d.lastPrice),
      low24h:  parseFloat(d.lowPrice24h  || d.lastPrice),
    };
  } catch(e) { console.warn('Bybit fetchTicker', e); return null; }
}

// ─── WEEX PUBLIC API (market data) ───
const WEEX_PROXY = 'https://weex-proxy.onrender.com';

async function weexPublicFetch(endpoint, params = {}) {
  const qstr = new URLSearchParams({ endpoint, ...params }).toString();
  const r = await fetch(`${WEEX_PROXY}?${qstr}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function loadWeexPairs() {
  try {
    const j = await weexPublicFetch('/capi/v3/market/exchangeInfo');
    if (j.symbols?.length) {
      ASSETS = j.symbols
        .filter(x => x.symbol && x.symbol.endsWith('USDT') && x.forwardContractFlag)
        .map(x => ({ sym: x.symbol, cat: guessCat(x.symbol) }))
        .sort((a, b) => a.sym.localeCompare(b.sym));
    }
  } catch(e) { console.warn('Weex pairs fallback', e); }
  if (!ASSETS.length) {
    ASSETS = [
      {sym:'BTCUSDT',cat:'Major'},{sym:'ETHUSDT',cat:'Major'},{sym:'SOLUSDT',cat:'Major'},
      {sym:'BNBUSDT',cat:'Major'},{sym:'XRPUSDT',cat:'Major'},{sym:'ADAUSDT',cat:'Major'},
    ];
  }
}

async function fetchWeexCandles(symbol, tf) {
  const intervalMap = { '1m':'1m','5m':'5m','15m':'15m','1H':'1h','4H':'4h','1D':'1d' };
  const interval = intervalMap[tf] || '15m';
  const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
  const PER_CALL = 1000;
  const MAX_CALLS = 10;

  try {
    let allCandles = [];
    let endTime = Date.now();

    for (let i = 0; i < MAX_CALLS; i++) {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 12000);
      let r;
      try {
        const qstr = new URLSearchParams({
          endpoint: '/capi/v3/market/history/klines',
          symbol: sym, interval, endTime: String(endTime), limit: String(PER_CALL)
        }).toString();
        r = await fetch(`${WEEX_PROXY}?${qstr}`, { signal: ctrl.signal });
      } finally { clearTimeout(tid); }
      if (!r || !r.ok) { console.warn('Weex /klines HTTP', r?.status); break; }
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) break;
      // Weex: [openTime, open, high, low, close, volume, closeTime, ...]
      const candles = rows.map(d => ({
        time:  Math.floor(parseInt(d[0]) / 1000),
        open:  parseFloat(d[1]),
        high:  parseFloat(d[2]),
        low:   parseFloat(d[3]),
        close: parseFloat(d[4]),
      }));
      allCandles = candles.concat(allCandles);
      const oldestTs = Math.min(...rows.map(d => parseInt(d[0])));
      endTime = oldestTs - 1;
      if (rows.length < PER_CALL) break;
    }

    // Fallback: simple klines (no pagination)
    if (!allCandles.length) {
      const qstr = new URLSearchParams({ endpoint: '/capi/v3/market/klines', symbol: sym, interval, limit: '1000' }).toString();
      const r2 = await fetch(`${WEEX_PROXY}?${qstr}`);
      const rows2 = await r2.json();
      if (Array.isArray(rows2) && rows2.length) {
        allCandles = rows2.map(d => ({
          time:  Math.floor(parseInt(d[0]) / 1000),
          open:  parseFloat(d[1]),
          high:  parseFloat(d[2]),
          low:   parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));
      }
    }

    if (!allCandles.length) { console.warn('Weex: no candles for', sym, tf); return null; }
    const seen = new Set();
    return allCandles
      .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
      .sort((a, b) => a.time - b.time);
  } catch(e) { console.error('Weex fetchCandles', e); return null; }
}

async function fetchWeexTicker(symbol) {
  const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    let j;
    try {
      j = await weexPublicFetch('/capi/v3/market/ticker/24hr', { symbol: sym });
    } finally { clearTimeout(tid); }
    const d = Array.isArray(j) ? j[0] : j;
    if (!d || !d.lastPrice) throw new Error('no lastPrice');
    return {
      last:    parseFloat(d.lastPrice),
      open24h: parseFloat(d.openPrice  || d.lastPrice),
      high24h: parseFloat(d.highPrice  || d.lastPrice),
      low24h:  parseFloat(d.lowPrice   || d.lastPrice),
    };
  } catch(e) { console.warn('Weex fetchTicker', e); return null; }
}

async function fetchWeexContractInfo(symbol) {
  const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
  try {
    const j = await weexPublicFetch('/capi/v3/market/exchangeInfo', { symbol: sym });
    const d = j.symbols?.[0];
    if (!d) throw new Error('No contract info');
    const pricePlace = parseInt(d.pricePrecision ?? 2);
    const lotStep    = parseFloat(d.minOrderSize ?? 0.001);
    return { pricePlace, sizeMultiplier: lotStep, minTradeNum: lotStep };
  } catch(e) {
    console.warn('fetchWeexContractInfo fallback:', e.message);
    return { pricePlace: 2, sizeMultiplier: 0.001, minTradeNum: 0.001 };
  }
}

// ─── BINGX PUBLIC API (market data) ───
const BINGX_PROXY = 'https://bingx-proxy-7t7k.onrender.com';

// BingX usa simboli con trattino: BTC-USDT
function toBingxSym(symbol) {
  const s = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
  return s.includes('-') ? s : s.replace('USDT', '-USDT');
}

async function bingxPublicFetch(endpoint, params = {}) {
  const qstr = new URLSearchParams({ endpoint, ...params }).toString();
  const r = await fetch(`${BINGX_PROXY}?${qstr}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function loadBingxPairs() {
  try {
    const j = await bingxPublicFetch('/openApi/swap/v2/quote/contracts');
    if (j.code === 0 && j.data?.length) {
      ASSETS = j.data
        .filter(x => x.symbol && x.symbol.endsWith('-USDT') && x.status === 1)
        .map(x => ({
          sym: x.symbol.replace('-', ''),  // store as BTCUSDT internamente
          cat: guessCat(x.symbol.replace('-', '')),
          _bingxSym: x.symbol,             // conserva BTC-USDT per le API
        }))
        .sort((a, b) => a.sym.localeCompare(b.sym));
    }
  } catch(e) { console.warn('BingX pairs fallback', e); }
  if (!ASSETS.length) {
    ASSETS = [
      {sym:'BTCUSDT',cat:'Major'},{sym:'ETHUSDT',cat:'Major'},{sym:'SOLUSDT',cat:'Major'},
      {sym:'BNBUSDT',cat:'Major'},{sym:'XRPUSDT',cat:'Major'},{sym:'ADAUSDT',cat:'Major'},
    ];
  }
}

async function fetchBingxCandles(symbol, tf) {
  const intervalMap = { '1m':'1m','5m':'5m','15m':'15m','1H':'1h','4H':'4h','1D':'1d' };
  const interval = intervalMap[tf] || '15m';
  const sym = toBingxSym(symbol);
  const PER_CALL = 1000;
  const MAX_CALLS = 10;

  try {
    let allCandles = [];
    let endTime = Date.now();

    for (let i = 0; i < MAX_CALLS; i++) {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 12000);
      let r;
      try {
        const qstr = new URLSearchParams({
          endpoint: '/openApi/swap/v3/quote/klines',
          symbol: sym, interval, endTime: String(endTime), limit: String(PER_CALL)
        }).toString();
        r = await fetch(`${BINGX_PROXY}?${qstr}`, { signal: ctrl.signal });
      } finally { clearTimeout(tid); }
      if (!r || !r.ok) { console.warn('BingX /klines HTTP', r?.status); break; }
      const j = await r.json();
      if (j.code !== 0 || !j.data?.length) break;
      // BingX v3 klines: [{time, open, high, low, close, volume}]
      const candles = j.data.map(d => ({
        time:  Math.floor(parseInt(d.time) / 1000),
        open:  parseFloat(d.open),
        high:  parseFloat(d.high),
        low:   parseFloat(d.low),
        close: parseFloat(d.close),
      }));
      allCandles = candles.concat(allCandles);
      const oldestTs = Math.min(...j.data.map(d => parseInt(d.time)));
      endTime = oldestTs - 1;
      if (j.data.length < PER_CALL) break;
    }

    if (!allCandles.length) { console.warn('BingX: no candles for', sym, tf); return null; }
    const seen = new Set();
    return allCandles
      .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
      .sort((a, b) => a.time - b.time);
  } catch(e) { console.error('BingX fetchCandles', e); return null; }
}

async function fetchBingxTicker(symbol) {
  const sym = toBingxSym(symbol);
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    let j;
    try {
      j = await bingxPublicFetch('/openApi/swap/v2/quote/ticker', { symbol: sym });
    } finally { clearTimeout(tid); }
    if (j.code !== 0 || !j.data) throw new Error('no data');
    const d = j.data;
    return {
      last:    parseFloat(d.lastPrice),
      open24h: parseFloat(d.openPrice  || d.lastPrice),
      high24h: parseFloat(d.highPrice  || d.lastPrice),
      low24h:  parseFloat(d.lowPrice   || d.lastPrice),
    };
  } catch(e) { console.warn('BingX fetchTicker', e); return null; }
}

async function fetchBingxContractInfo(symbol) {
  const sym = toBingxSym(symbol);
  try {
    const j = await bingxPublicFetch('/openApi/swap/v2/quote/contracts', { symbol: sym });
    const d = j.code === 0 ? (Array.isArray(j.data) ? j.data[0] : j.data) : null;
    if (!d) throw new Error('No contract info');
    const pricePrecision = parseInt(d.pricePrecision ?? 2);
    const quantityPrecision = parseInt(d.quantityPrecision ?? 3);
    const step = Math.pow(10, -quantityPrecision);
    return { pricePlace: pricePrecision, sizeMultiplier: step, minTradeNum: step };
  } catch(e) {
    console.warn('fetchBingxContractInfo fallback:', e.message);
    return { pricePlace: 2, sizeMultiplier: 0.001, minTradeNum: 0.001 };
  }
}

async function fetchBybitContractInfo(symbol) {
  const sym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
  try {
    const j = await bybitPublicFetch('/v5/market/instruments-info', { category: 'linear', symbol: sym });
    const d = j.result?.list?.[0];
    if (!d) throw new Error('No contract info');
    const tickSize   = parseFloat(d.priceFilter?.tickSize || '0.01');
    const pricePlace = tickSize < 1 ? String(tickSize).split('.')[1]?.length ?? 2 : 0;
    const lotStep    = parseFloat(d.lotSizeFilter?.qtyStep || '0.001');
    const minQty     = parseFloat(d.lotSizeFilter?.minOrderQty || '0.001');
    return { pricePlace, sizeMultiplier: lotStep, minTradeNum: minQty };
  } catch(e) {
    console.warn('fetchBybitContractInfo fallback:', e.message);
    return { pricePlace: 4, sizeMultiplier: 0.001, minTradeNum: 0.001 };
  }
}

// ─── STATE ───
const S = {
  dir:'long', orderType:'market', riskMode:'pct', marginMode:'crossed',
  tpEnabled:false, balance:4250, symbol:'BTCUSDT', tf:'15m',
  lastPrice:null, clickMode:null, tickTimer:null,
};


// ─── FEE RATES ───
// Taker fee one-way per exchange — modificabili via localStorage: rf_fee_<exchange>
// Taker fee defaults one-way per exchange
const FEE_DEFAULTS_TAKER = {
  bitget:     0.0006,   // 0.06%
  bybit:      0.00055,  // 0.055%
  bybit_demo: 0.00055,
  weex:       0.0006,   // 0.06%
  bingx:      0.0005,   // 0.05%
};
// Maker fee defaults one-way per exchange (tutti 0.02%)
const FEE_DEFAULTS_MAKER = {
  bitget:     0.0002,
  bybit:      0.0002,
  bybit_demo: 0.0002,
  weex:       0.0002,
  bingx:      0.0002,
};

function getTakerFeeRate() {
  const ex = window._activeExchange || 'bitget';
  const saved = parseFloat(localStorage.getItem('rf_fee_taker_' + ex));
  return (!isNaN(saved) && saved >= 0) ? saved : (FEE_DEFAULTS_TAKER[ex] || 0.0006);
}

function getMakerFeeRate() {
  const ex = window._activeExchange || 'bitget';
  const saved = parseFloat(localStorage.getItem('rf_fee_maker_' + ex));
  return (!isNaN(saved) && saved >= 0) ? saved : (FEE_DEFAULTS_MAKER[ex] || 0.0002);
}

// Ritorna il fee round-trip (apertura + chiusura) in base al tipo ordine:
// market/stop/ladder → taker + taker
// limit              → maker + taker (SL è sempre market)
function getRoundTripFeeRate(orderType) {
  const ot = orderType || S.orderType || 'market';
  if (ot === 'limit') {
    return getMakerFeeRate() + getTakerFeeRate(); // maker apertura + taker chiusura
  }
  return getTakerFeeRate() * 2; // taker apertura + taker chiusura
}

function calcFeeUsd(sizeUsdt, orderType) {
  return sizeUsdt * getRoundTripFeeRate(orderType);
}

// size = riskUsd / (slDistPct/100 + feeRoundTrip)
function calcSizeWithFee(riskUsd, slDistPct, orderType) {
  const feeRate = getRoundTripFeeRate(orderType);
  const denom = (slDistPct / 100) + feeRate;
  return denom > 0 ? riskUsd / denom : 0;
}
// Aggiorna i campi taker/maker nell'UI in base all'exchange attivo
function feeRenderUI() {
  const takerEl = document.getElementById('feeTakerInput');
  const makerEl = document.getElementById('feeMakerInput');
  if (takerEl) takerEl.value = (getTakerFeeRate() * 100).toFixed(3);
  if (makerEl) makerEl.value = (getMakerFeeRate() * 100).toFixed(3);
}

// Salva taker fee
function saveTakerFee() {
  const el = document.getElementById('feeTakerInput');
  if (!el) return;
  const pct = parseFloat(el.value);
  if (isNaN(pct) || pct < 0) return;
  const ex = window._activeExchange || 'bitget';
  localStorage.setItem('rf_fee_taker_' + ex, String(pct / 100));
  updateCalc();
}

// Salva maker fee
function saveMakerFee() {
  const el = document.getElementById('feeMakerInput');
  if (!el) return;
  const pct = parseFloat(el.value);
  if (isNaN(pct) || pct < 0) return;
  const ex = window._activeExchange || 'bitget';
  localStorage.setItem('rf_fee_maker_' + ex, String(pct / 100));
  updateCalc();
}

// ─── CHART ───
const chartEl = document.getElementById('chart');
const chartWrap = document.getElementById('chartWrap');
const chart = LightweightCharts.createChart(chartEl,{
  width:chartEl.offsetWidth, height:chartEl.offsetHeight,
  layout:{background:{color:'#07070a'},textColor:'#686878',fontFamily:'DM Mono',fontSize:11},
  grid:{vertLines:{color:'#12121680',style:LightweightCharts.LineStyle.Dotted},horzLines:{color:'#12121680',style:LightweightCharts.LineStyle.Dotted}},
  crosshair:{mode:LightweightCharts.CrosshairMode.Normal,
    vertLine:{color:'#a855f750',width:1,style:LightweightCharts.LineStyle.Solid,labelBackgroundColor:'#1c1c24'},
    horzLine:{color:'#a855f750',width:1,style:LightweightCharts.LineStyle.Solid,labelBackgroundColor:'#1c1c24'}},
  rightPriceScale:{borderColor:'#1a1a22',textColor:'#686878',scaleMargins:{top:0.08,bottom:0.08}},
  timeScale:{borderColor:'#1a1a22',timeVisible:true,secondsVisible:false},
  handleScroll:{mouseWheel:true,pressedMouseMove:true},
  handleScale:{mouseWheel:true,pinch:true},
});
const candleSeries = chart.addCandlestickSeries({
  upColor:'#00d17a',downColor:'#ff2d4a',
  borderUpColor:'#00d17a',borderDownColor:'#ff2d4a',
  wickUpColor:'#00d17a88',wickDownColor:'#ff2d4a88',
  priceLineVisible:false,
});

// price lines registry
const LINES = {}; // key → priceLine object

const LINE_CFG = {
  entry:{color:'#ffc940',title:' ENTRY',lineWidth:1,lineStyle:0},
  sl:   {color:'#ff2d4a',title:' SL',   lineWidth:2,lineStyle:2},
  tp1:  {color:'#00d17a',title:' TP1',  lineWidth:1,lineStyle:2},
  tp2:  {color:'#00ffcc',title:' TP2',  lineWidth:1,lineStyle:2},
  tp3:  {color:'#3dddff',title:' TP3',  lineWidth:1,lineStyle:2},
};

// draggable line prices (independent from chart lines)
const DRAG_PRICES = {entry:null, sl:null, tp1:null, tp2:null, tp3:null};

function setChartLine(type, price){
  if(LINES[type]) candleSeries.removePriceLine(LINES[type]);
  if(!price){ LINES[type]=null; return; }
  LINES[type] = candleSeries.createPriceLine({price:parseFloat(price),axisLabelVisible:false,...LINE_CFG[type]});
  DRAG_PRICES[type] = parseFloat(price);
}
function removeChartLine(type){
  if(LINES[type]){ candleSeries.removePriceLine(LINES[type]); LINES[type]=null; }
  DRAG_PRICES[type]=null;
}

// sync chart line from input field
function syncLine(type){
  const idMap={entry:'entryVal',sl:'slVal',tp1:'tp1',tp2:'tp2',tp3:'tp3'};
  const v = parseFloat(document.getElementById(idMap[type]).value);
  if(v) setChartLine(type,v); else removeChartLine(type);
  drawCanvas();
}

// ═══════════════════════════════════════════════════
// DRAG CANVAS — tutte le linee draggabili
// Il canvas copre tutta la chart.
// pointer-events:none di default → la chart funziona normalmente.
// Quando una linea è impostata → pointer-events:all sul canvas,
// ma passiamo i click/scroll alla chart se non siamo in zona drag.
// ═══════════════════════════════════════════════════
const dc = document.getElementById('dragCanvas');
const ctx = dc.getContext('2d');

let dragState = null; // {type, startY, startPrice}
const GRAB_PX = 14; // zone in pixel attorno alla linea per iniziare drag

function resizeCanvas(){
  const r = chartWrap.getBoundingClientRect();
  dc.width  = r.width;
  dc.height = r.height;
}

function drawCanvas(){
  resizeCanvas();
  ctx.clearRect(0,0,dc.width,dc.height);
  window._closeZones = {}; // reset hit zones ogni frame

  // disegna tutte le linee che hanno un prezzo impostato
  let types;
  if(S.orderType==='market'){
    types = ['sl','tp1','tp2','tp3'];
  } else if(S.orderType==='ladder'){
    // ladder: linee ld1..ld4 + sl + tp
    types = [];
    for(let i=1;i<=4;i++) types.push('ld'+i);
    types.push('sl','tp1','tp2','tp3');
  } else {
    types = ['entry','sl','tp1','tp2','tp3'];
  }

  types.forEach(t => {
    const price = DRAG_PRICES[t];
    if(!price) return;
    const y = candleSeries.priceToCoordinate(price);
    if(y===null||y===undefined) return;
    drawDragLine(t, price, y);
  });

  // disegna overlay posizioni aperte (stile TradingView)
  drawPosLines();

  // Il canvas è sempre trasparente agli eventi — gli eventi vengono gestiti su chartEl
  dc.style.pointerEvents = 'none';
}

// registry delle zone ✕ per hit-test nel mousedown
if(!window._closeZones) window._closeZones = {};

function drawDragLine(type, price, y){
  const W = dc.width;
  const colors = {
    entry:'#ffc940', sl:'#ff2d4a',
    tp1:'#00d17a',   tp2:'#00ffcc', tp3:'#3dddff',
    ld1:LADDER_COLORS[0], ld2:LADDER_COLORS[1], ld3:LADDER_COLORS[2], ld4:LADDER_COLORS[3],
  };
  const labels = {entry:'ENTRY',sl:'SL',tp1:'TP1',tp2:'TP2',tp3:'TP3',
    ld1:'L1',ld2:'L2',ld3:'L3',ld4:'L4'};
  const c = colors[type] || '#aaa';

  // Per linee ladder: mostra info size/% nel badge
  const isLadder = type.startsWith('ld');
  const lIdx = isLadder ? parseInt(type[2])-1 : -1;

  ctx.save();
  // linea tratteggiata
  ctx.strokeStyle = c;
  ctx.lineWidth = type==='sl' ? 1.5 : 1;
  ctx.setLineDash(type==='entry'?[]:[6,4]);
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // handle centrale — grippy
  const hw=70, hh=16;
  const hx=W/2-hw/2, hy=y-hh/2;
  ctx.fillStyle=c;
  rrect(ctx,hx,hy,hw,hh,4); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,0.8)';
  ctx.font='bold 9px "DM Mono",monospace';
  ctx.textAlign='center';
  ctx.fillText('⇅  '+labels[type]+'  ⇅', W/2, y+3.5);
  ctx.textAlign='left';

  // ✕ remove button — cerchietto SOPRA la linea, centrato sull'handle
  const xBtnX = W/2;
  const xBtnY = y - hh/2 - 10; // sopra l'handle
  const xBtnR = 7;
  // cerchio sfondo
  ctx.beginPath();
  ctx.arc(xBtnX, xBtnY, xBtnR, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(14,14,16,0.95)';
  ctx.fill();
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // × symbol
  ctx.fillStyle = c;
  ctx.font = 'bold 9px "DM Mono",monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✕', xBtnX, xBtnY);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // registra zona click per hit-test
  window._closeZones[type] = { x: xBtnX, y: xBtnY, r: xBtnR };

  // badge prezzo destra
  const pt='$'+fmtPrice(price);
  ctx.font='9px "DM Mono",monospace';
  const pw=ctx.measureText(pt).width+12;
  const px=W-pw-6;
  ctx.fillStyle=c; rrect(ctx,px,y-9,pw,18,3); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,0.9)';
  ctx.fillText(pt,px+6,y+3.5);

  // helper: pill centrato sulla linea, testo colore customizzabile
  const drawInfoPill = (text, offsetX, textColor) => {
    ctx.font = 'bold 9px "DM Mono",monospace';
    const tw = ctx.measureText(text).width;
    const pw = tw + 14, ph = 17;
    const px = W/2 + offsetX;
    const py = y - ph/2;
    ctx.fillStyle = c;
    rrect(ctx, px, py, pw, ph, 4); ctx.fill();
    ctx.fillStyle = textColor || 'rgba(255,255,255,0.95)';
    ctx.fillText(text, px + 7, y + 3.5);
  };

  // badge ENTRY: size USDT a sinistra, qty coin a destra — testo nero
  if(type==='entry'){
    const sl      = parseFloat(document.getElementById('slVal').value);
    const riskRaw = parseFloat(document.getElementById('riskVal').value);
    const bal     = S.balance||1000;
    if(sl && riskRaw && price){
      const slDist    = Math.abs(price - sl);
      const slDistPct = slDist / price * 100;
      if(slDistPct > 0){
        const riskUsd  = S.riskMode==='pct' ? (bal*riskRaw/100) : riskRaw;
        const sizeUsdt = riskUsd / (slDistPct/100);
        const coin     = sizeUsdt / price;
        const sym      = S.symbol.replace('USDT','');
        const leftText  = '$'+fmt(sizeUsdt)+' USDT';
        const rightText = fmt(coin)+' '+sym;
        ctx.font = 'bold 12px "DM Mono",monospace';
        const lw = ctx.measureText(leftText).width + 20;
        const lx = W/2 - 35 - lw - 8;
        const entPy = y - 22/2;
        ctx.fillStyle = c; rrect(ctx, lx, entPy, lw, 22, 5); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillText(leftText, lx+10, y+4.5);
        const rw = ctx.measureText(rightText).width + 20;
        const rx = W/2 + 35 + 8;
        ctx.fillStyle = c; rrect(ctx, rx, entPy, rw, 22, 5); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillText(rightText, rx+10, y+4.5);
      }
    }
  }

  // badge SL: a sinistra del handle "% Δprice", a destra "-$risk" — testo bianco
  if(type==='sl'){
    const entry = S.orderType==='market' ? S.lastPrice : parseFloat(document.getElementById('entryVal').value);
    if(entry){
      const dist    = Math.abs(entry-price);
      const pct     = (dist/entry*100).toFixed(2);
      const riskRaw = parseFloat(document.getElementById('riskVal').value);
      const bal     = S.balance||1000;
      const riskUsd = riskRaw ? (S.riskMode==='pct' ? (bal*riskRaw/100) : riskRaw) : null;
      // pill a sinistra del handle centrale (handle è centrato in W/2 ± 35px)
      const leftText  = pct+'%';
      const rightText = riskUsd ? '–$'+fmt(riskUsd)+' RISK' : null;
      ctx.font = 'bold 12px "DM Mono",monospace';
      const lw = ctx.measureText(leftText).width + 20;
      const lx = W/2 - 35 - lw - 8;
      const py = y - 22/2;
      ctx.fillStyle = c; rrect(ctx, lx, py, lw, 22, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(leftText, lx+10, y+4.5);
      if(rightText){
        const rw = ctx.measureText(rightText).width + 20;
        const rx = W/2 + 35 + 8;
        ctx.fillStyle = c; rrect(ctx, rx, py, rw, 22, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillText(rightText, rx+10, y+4.5);
      }
    }
  }

  // badge TP: a sinistra "+$gain  %" e a destra "R:R 1:x" — testo nero
  if(type==='tp1'||type==='tp2'||type==='tp3'){
    const entry = S.orderType==='market' ? S.lastPrice : parseFloat(document.getElementById('entryVal').value);
    const sl    = parseFloat(document.getElementById('slVal').value);
    if(entry && sl){
      const slDist  = Math.abs(entry-sl);
      const tpDist  = Math.abs(price-entry);
      const pct     = (tpDist/entry*100).toFixed(2);
      const rr      = slDist>0 ? (tpDist/slDist).toFixed(2) : null;
      const riskRaw = parseFloat(document.getElementById('riskVal').value);
      const bal     = S.balance||1000;
      const riskUsd = riskRaw ? (S.riskMode==='pct' ? (bal*riskRaw/100) : riskRaw) : null;
      const tpNum = type==='tp1'?1:type==='tp2'?2:3;
      const tpPctEl = document.getElementById('tpPct'+tpNum);
      const tpPct = tpPctEl ? parseFloat(tpPctEl.value)||100 : 100;
      const gainUsd = (riskUsd && slDist>0) ? riskUsd*(tpDist/slDist)*(tpPct/100) : null;
      const leftText  = (gainUsd ? '+$'+fmt(gainUsd)+'  ' : '') + pct+'%';
      const rightText = rr ? 'R:R  1:'+rr : null;
      ctx.font = 'bold 12px "DM Mono",monospace';
      const lw = ctx.measureText(leftText).width + 20;
      const lx = W/2 - 35 - lw - 8;
      const py = y - 22/2;
      ctx.fillStyle = c; rrect(ctx, lx, py, lw, 22, 5); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(leftText, lx+10, y+4.5);
      if(rightText){
        const rw = ctx.measureText(rightText).width + 20;
        const rx = W/2 + 35 + 8;
        ctx.fillStyle = c; rrect(ctx, rx, py, rw, 22, 5); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillText(rightText, rx+10, y+4.5);
      }
    }
  }

  // badge LADDER: mostra % peso e size
  if(isLadder){
    const sl = parseFloat(document.getElementById('slVal').value);
    const riskRaw = parseFloat(document.getElementById('riskVal').value);
    const bal = S.balance||1000;
    const lev = parseFloat(document.getElementById('levVal').value)||1;
    const riskUsd = S.riskMode==='pct' ? (bal*riskRaw/100) : riskRaw;

    // Find weight for this order
    const n = LADDER.n;
    const activeOrders = [];
    for(let i=0;i<n;i++){
      const o=LADDER.orders[i];
      if(o.enabled!==false && o.price && o.price>0) activeOrders.push({i,price:o.price});
    }
    const aIdx = activeOrders.findIndex(o=>o.i===lIdx);
    if(aIdx>=0 && sl && riskRaw){
      const prices = activeOrders.map(o=>o.price);
      const manualPcts = activeOrders.map(o => o.manualPct);
      const hasManual = manualPcts.some(p => p != null);
      const weights = getLadderWeights(activeOrders.length, prices, hasManual ? manualPcts.map((p,i)=>p!=null?p:0) : null);
      const w = weights[aIdx]/100;
      const orderRisk = riskUsd * w;
      const slDist = Math.abs(price - sl);
      const slDistPct = slDist / price * 100;
      const size = slDistPct>0 ? calcSizeWithFee(orderRisk, slDistPct, 'ladder') : 0;
      const pctText = weights[aIdx].toFixed(1)+'%';
      const sizeText = '$'+fmt(size);
      ctx.font = 'bold 11px "DM Mono",monospace';
      const lw = ctx.measureText(pctText).width + 16;
      const lx = W/2 - 35 - lw - 8;
      const py2 = y - 20/2;
      ctx.fillStyle = c; rrect(ctx,lx,py2,lw,20,4); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(pctText, lx+8, y+3.5);
      const rw = ctx.measureText(sizeText).width + 16;
      const rx = W/2 + 35 + 8;
      ctx.fillStyle = c; rrect(ctx,rx,py2,rw,20,4); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(sizeText, rx+8, y+3.5);
    }
  }

  ctx.restore();
}

function rrect(c,x,y,w,h,r){
  c.beginPath();
  c.moveTo(x+r,y); c.lineTo(x+w-r,y);
  c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r);
  c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  c.lineTo(x+r,y+h);
  c.quadraticCurveTo(x,y+h,x,y+h-r);
  c.lineTo(x,y+r);
  c.quadraticCurveTo(x,y,x+r,y);
  c.closePath();
}

// ═══════════════════════════════════════════════════════════════
// POSITION OVERLAY LINES — TradingView-style labels per posizioni
// ═══════════════════════════════════════════════════════════════

// Registry hit zones per click su TP/SL buttons e X delle pos lines
if(!window._posLineZones) window._posLineZones = {};

function drawPosLines() {
  if (!window._positions || !window._positions.length) return;
  window._posLineZones = {};

  window._positions.forEach((p, idx) => {
    const side   = (p.holdSide || 'long').toLowerCase();
    const entry  = parseFloat(p.openPriceAvg || p.averageOpenPrice || p.openAvgPrice || 0);
    const size   = parseFloat(p.total || p.available || 0);
    const upnl   = parseFloat(p.unrealizedPL || p.unrealizedProfitLoss || p.unrealizedPnl || 0);
    const sl     = parseFloat(p.stopLoss || p.stopLossPrice || p.presetStopLossPrice || 0);
    const tp     = parseFloat(p.takeProfit || p.takeProfitPrice || p.presetTakeProfitPrice || 0);
    const sym    = (p.symbol || '').replace(/_?UMCBL|_?DMCBL/g, '').replace('USDT', '');

    // Mostra la posizione solo se il simbolo corrisponde al grafico attivo
    const currentSym = (S.symbol || '').replace('USDT', '');
    if (sym !== currentSym) return;

    if (!entry || entry <= 0) return;

    const entryY = candleSeries.priceToCoordinate(entry);
    if (entryY === null || entryY === undefined) return;

    const isLong = side === 'long';
    const entryColor = isLong ? '#2962ff' : '#f7525f'; // blu per long, rosso per short
    const pnlColor   = upnl >= 0 ? '#26a69a' : '#ef5350';

    const W = dc.width;

    // ── ENTRY LINE ──────────────────────────────────────────────
    // Linea sottile solida
    ctx.save();
    ctx.strokeStyle = entryColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(0, entryY); ctx.lineTo(W, entryY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Label principale CENTRATA: "Long  0.0018 BTC  +11.20 USD"
    const sideLabel  = isLong ? 'Long' : 'Short';
    const coinStr    = fmt6(size) + ' ' + sym;
    const pnlStr     = (upnl >= 0 ? '+' : '') + fmt(upnl) + ' USD';

    const FONT_LABEL = 'bold 11px "DM Mono",monospace';
    ctx.font = FONT_LABEL;

    // misure testo
    const sideW  = ctx.measureText(sideLabel).width;
    ctx.font = '11px "DM Mono",monospace';
    const coinW  = ctx.measureText(coinStr).width;
    const pnlW   = ctx.measureText(pnlStr).width;

    const PAD = 8, GAP = 6, H = 22, R = 4;

    // Calcola larghezza totale del gruppo di pill
    const sidePillW = sideW + PAD * 2;
    const coinPillW = coinW + PAD * 2;
    const pnlPillW  = pnlW  + PAD * 2;
    const totalGroupW = sidePillW + GAP + coinPillW + GAP + pnlPillW;

    // Centra il gruppo sull'asse X della chart
    const groupStartX = W / 2 - totalGroupW / 2;
    const pillY       = entryY - H / 2;

    // pill Side (sfondo entryColor)
    const startX = groupStartX;
    ctx.fillStyle = entryColor;
    rrect(ctx, startX, pillY, sidePillW, H, R); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = FONT_LABEL;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(sideLabel, startX + PAD, entryY);

    // pill Coin (sfondo scuro bordo entryColor)
    const coinX = startX + sidePillW + GAP;
    ctx.fillStyle = 'rgba(20,20,28,0.92)';
    rrect(ctx, coinX, pillY, coinPillW, H, R); ctx.fill();
    ctx.strokeStyle = entryColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = entryColor;
    ctx.font = '11px "DM Mono",monospace';
    ctx.fillText(coinStr, coinX + PAD, entryY);

    // pill PnL (sfondo scuro bordo pnlColor)
    const pnlX = coinX + coinPillW + GAP;
    ctx.fillStyle = 'rgba(20,20,28,0.92)';
    rrect(ctx, pnlX, pillY, pnlPillW, H, R); ctx.fill();
    ctx.strokeStyle = pnlColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = pnlColor;
    ctx.fillText(pnlStr, pnlX + PAD, entryY);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    // ── SL LINE ─────────────────────────────────────────────────
    // Priorità: registry _posSLLines (aggiornato da drag/sync) > campo grezzo posizione
    const slPrice = (window._posSLLines && window._posSLLines[idx] && window._posSLLines[idx].price)
      ? window._posSLLines[idx].price : sl;
    if (slPrice && slPrice > 0) {
      const slY = candleSeries.priceToCoordinate(slPrice);
      if (slY !== null && slY !== undefined) {
        _drawPosSubLine(idx, 'sl', slPrice, slY, upnl, entry, size, sym, isLong, W);
      }
    }

    // ── TP LINE ─────────────────────────────────────────────────
    // Priorità: registry _posTPLines > campo grezzo posizione
    const tpPrice = (window._posTPLines && window._posTPLines[idx+'_1'] && window._posTPLines[idx+'_1'].price)
      ? window._posTPLines[idx+'_1'].price : tp;
    if (tpPrice && tpPrice > 0) {
      const tpY = candleSeries.priceToCoordinate(tpPrice);
      if (tpY !== null && tpY !== undefined) {
        _drawPosSubLine(idx, 'tp', tpPrice, tpY, upnl, entry, size, sym, isLong, W);
      }
    }
  });
}

function fmt6(n) {
  if (!n) return '0';
  // mostra fino a 6 decimali significativi
  const s = n.toPrecision(4);
  return parseFloat(s).toString();
}

function _drawPosSubLine(idx, lineType, price, y, upnl, entry, size, sym, isLong, W) {
  const isSL = lineType === 'sl';
  const lineColor = isSL ? '#f7525f' : '#00b96b';

  ctx.save();

  // ── LINEA tratteggiata ──
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = isSL ? 1.5 : 1;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // ── calcola P&L a questo livello ──
  const pnlAtLevel = (isLong ? (price - entry) : (entry - price)) * size;
  const pnlColor   = pnlAtLevel >= 0 ? '#26a69a' : '#ef5350';
  const pnlStr     = (pnlAtLevel >= 0 ? '+' : '') + fmt(pnlAtLevel) + ' USD';

  // distanza % dall'entry
  const distPct = entry > 0 ? ((Math.abs(price - entry) / entry) * 100).toFixed(2) + '%' : '';

  // ── GRUPPO 3 PILL CENTRATO (identico alla entry line) ──
  // pill 1: tipo SL/TP (sfondo pieno lineColor)
  // pill 2: quantità token (sfondo scuro bordo lineColor)
  // pill 3: PnL at level (sfondo scuro bordo pnlColor)
  const typeLabel = (isSL ? 'SL' : 'TP') + '#' + (idx + 1);
  const coinStr   = fmt6(size) + ' ' + sym;

  const FONT_BOLD = 'bold 11px "DM Mono",monospace';
  const FONT_REG  = '11px "DM Mono",monospace';
  ctx.font = FONT_BOLD;
  const typeW = ctx.measureText(typeLabel).width;
  ctx.font = FONT_REG;
  const coinW = ctx.measureText(coinStr).width;
  const pnlW  = ctx.measureText(pnlStr).width;

  const PAD = 8, GAP = 6, H = 22, R = 4;
  const typePillW = typeW + PAD * 2;
  const coinPillW = coinW + PAD * 2;
  const pnlPillW  = pnlW  + PAD * 2;
  const totalGroupW = typePillW + GAP + coinPillW + GAP + pnlPillW;

  const groupStartX = W / 2 - totalGroupW / 2;
  const pillY = y - H / 2;

  // pill tipo
  ctx.fillStyle = lineColor;
  rrect(ctx, groupStartX, pillY, typePillW, H, R); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = FONT_BOLD;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(typeLabel, groupStartX + PAD, y);

  // pill coin
  const coinX = groupStartX + typePillW + GAP;
  ctx.fillStyle = 'rgba(20,20,28,0.92)';
  rrect(ctx, coinX, pillY, coinPillW, H, R); ctx.fill();
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = lineColor;
  ctx.font = FONT_REG;
  ctx.fillText(coinStr, coinX + PAD, y);

  // pill PnL
  const pnlX = coinX + coinPillW + GAP;
  ctx.fillStyle = 'rgba(20,20,28,0.92)';
  rrect(ctx, pnlX, pillY, pnlPillW, H, R); ctx.fill();
  ctx.strokeStyle = pnlColor; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = pnlColor;
  ctx.fillText(pnlStr, pnlX + PAD, y);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // ── ✕ remove button — cerchietto SOPRA il gruppo, centrato ──
  const xBtnX = W / 2;
  const xBtnY = pillY - 10;
  const xBtnR = 7;
  ctx.beginPath();
  ctx.arc(xBtnX, xBtnY, xBtnR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(14,14,16,0.95)'; ctx.fill();
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = lineColor;
  ctx.font = 'bold 9px "DM Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('✕', xBtnX, xBtnY);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  window._posLineZones[`${lineType}_x_${idx}`] = { x: xBtnX - xBtnR, y: xBtnY - xBtnR, w: xBtnR * 2, h: xBtnR * 2, idx, action: `remove_${lineType}` };

  // ── badge distanza % a SINISTRA del gruppo ──
  if (distPct) {
    ctx.font = 'bold 10px "DM Mono",monospace';
    const dw = ctx.measureText(distPct).width + 14;
    const dx = groupStartX - 8 - dw;
    const dy = y - 18 / 2;
    ctx.fillStyle = 'rgba(20,20,28,0.92)';
    rrect(ctx, dx, dy, dw, 18, 3); ctx.fill();
    ctx.strokeStyle = lineColor; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = lineColor;
    ctx.fillText(distPct, dx + 7, y + 3.5);
  }

  // ── BE button a DESTRA del gruppo (solo SL) ──
  if (isSL) {
    const beLabel = 'BE';
    ctx.font = 'bold 9px "DM Mono",monospace';
    const beW = ctx.measureText(beLabel).width + 16;
    const beH = 18;
    const beX = groupStartX + totalGroupW + 8;
    const beY = y - beH / 2;
    ctx.fillStyle = '#ffc940';
    rrect(ctx, beX, beY, beW, beH, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(beLabel, beX + beW / 2, y);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    window._posLineZones[`sl_be_${idx}`] = { x: beX, y: beY, w: beW, h: beH, idx, action: 'be' };
  }

  // ── badge prezzo vicino asse Y (destra) ──
  const priceStr = '$' + fmtPrice(price);
  ctx.font = '9px "DM Mono",monospace';
  const priceW2 = ctx.measureText(priceStr).width + 12;
  const priceX2 = W - priceW2 - 6;
  ctx.fillStyle = lineColor;
  rrect(ctx, priceX2, y - 9, priceW2, 18, 3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillText(priceStr, priceX2 + 6, y + 3.5);

  ctx.restore();
}

function lineAtY(clientY){
  // returns the type of the line closest to clientY, or null
  const rect = chartWrap.getBoundingClientRect();
  const y = clientY - rect.top;
  let types;
  if(S.orderType==='market'){
    types=['sl','tp1','tp2','tp3'];
  } else if(S.orderType==='ladder'){
    types=['ld1','ld2','ld3','ld4','sl','tp1','tp2','tp3'];
  } else {
    types=['entry','sl','tp1','tp2','tp3'];
  }
  let best=null, bestD=GRAB_PX;
  types.forEach(t=>{
    const p=DRAG_PRICES[t]; if(!p) return;
    const ly=candleSeries.priceToCoordinate(p);
    if(ly===null) return;
    const d=Math.abs(y-ly);
    if(d<bestD){bestD=d;best=t;}
  });
  return best;
}

// CANVAS EVENTS
chartEl.addEventListener('mousedown', e=>{
  if(S.clickMode) return;
  // Ignora right-click: viene gestito dal contextmenu listener
  if(e.button === 2) return;
  const rect0 = chartWrap.getBoundingClientRect();
  const cx = e.clientX - rect0.left, cy = e.clientY - rect0.top;
  // Se il click è nell'area dell'asse prezzi (ultimi ~60px a destra) lascia
  // gestire tutto a LightweightCharts — è lì che si fa il pan verticale
  const priceAxisWidth = 60;
  if(cx > rect0.width - priceAxisWidth) return;
  // ── controlla click su zone posizioni aperte (TP btn, SL btn, X, BE) ──
  if(window._posLineZones){
    for(const [key,z] of Object.entries(window._posLineZones)){
      const hit = cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
      if(hit){
        const idx = z.idx;
        const action = z.action;
        if(action === 'tp'){
          const el = document.getElementById('pos-tp1-input-'+idx);
          if(el){ el.focus(); el.select(); }
          notify('Modifica TP posizione '+(idx+1),'');
        } else if(action === 'sl'){
          const el = document.getElementById('pos-sl-input-'+idx);
          if(el){ el.focus(); el.select(); }
          notify('Modifica SL posizione '+(idx+1),'');
        } else if(action === 'be'){
          if(window.moveToBreakeven) window.moveToBreakeven(idx);
        } else if(action === 'remove_sl'){
          const slLine = window._posSLLines && window._posSLLines[idx];
          if(slLine && slLine.priceLine){
            try{ candleSeries.removePriceLine(slLine.priceLine); }catch(_){}
            slLine.priceLine = null; slLine.price = null;
          }
          if(window._positions && window._positions[idx]) window._positions[idx].stopLoss = 0;
          drawCanvas();
          notify('Linea SL rimossa dalla chart','');
        } else if(action === 'remove_tp'){
          const tpLine = window._posTPLines && window._posTPLines[idx+'_1'];
          if(tpLine && tpLine.priceLine){
            try{ candleSeries.removePriceLine(tpLine.priceLine); }catch(_){}
            tpLine.priceLine = null; tpLine.price = null;
          }
          if(window._positions && window._positions[idx]) window._positions[idx].takeProfit = 0;
          drawCanvas();
          notify('Linea TP rimossa dalla chart','');
        }
        e.preventDefault(); e.stopPropagation(); return;
      }
    }
  }
  if(window._closeZones){
    for(const [t,z] of Object.entries(window._closeZones)){
      if(Math.hypot(cx-z.x, cy-z.y) <= z.r+4){
        const idMap={entry:'entryVal',sl:'slVal',tp1:'tp1',tp2:'tp2',tp3:'tp3'};
        if(t.startsWith('ld')){
          const lIdx=parseInt(t[2])-1;
          LADDER.orders[lIdx].price=null;
          if(LADDER.orders[lIdx].priceLine){
            try{candleSeries.removePriceLine(LADDER.orders[lIdx].priceLine);}catch(_){}
            LADDER.orders[lIdx].priceLine=null;
          }
          DRAG_PRICES[t]=null;
          const el2=document.getElementById('ladd-price-'+lIdx); if(el2) el2.value='';
          calcLadder();
        } else {
          if(idMap[t]) document.getElementById(idMap[t]).value='';
          removeChartLine(t);
          if(t==='entry'){ DRAG_PRICES.entry=null; }
        }
        drawCanvas(); calc();
        notify('Rimossa linea '+t.toUpperCase(),'');
        e.preventDefault(); e.stopPropagation(); return;
      }
    }
  }
  // ── controlla drag posizioni SL/TP ──
  const posLine = posLineAtY(e.clientY);
  if(posLine){
    // Salva stato potenziale ma non preventDefault ancora — aspettiamo che si muova
    // Cattura _refSL (floor SL Shield, immutabile) — NON entry.price che cambia ad ogni drag
    let refSL = null;
    if(posLine.type === 'sl' && window._posSLLines){
      const slEntry = window._posSLLines[posLine.idx];
      if(slEntry) refSL = slEntry._refSL || slEntry.price; // _refSL è il floor reale
    }
    window._posDragState = { ...posLine, startY: e.clientY, pending: true, refSL };
    return;
  }
  const type = lineAtY(e.clientY);
  if(!type){
    // nessuna linea vicina — lascia passare tutto a LightweightCharts (pan verticale)
    return;
  }
  // Salva stato potenziale — confermiamo il drag solo quando il mouse si muove
  dragState = { type, startY: e.clientY, pending: true };
}, {capture: true});

// wheel: il canvas è già pointerEvents='none', la chart riceve lo scroll nativamente

// mousemove su document: gestisce drag e aggiorna cursore su chartEl
document.addEventListener('mousemove', e=>{
  if(!dragState && !window._posDragState){
    // Aggiorna cursore solo se il mouse è dentro la chart
    const rect0 = chartWrap.getBoundingClientRect();
    const cx = e.clientX - rect0.left, cy = e.clientY - rect0.top;
    if(cx < 0 || cy < 0 || cx > rect0.width || cy > rect0.height) return;

    // controlla hover su zone posizioni (TP btn, SL btn, X, BE)
    if(window._posLineZones){
      for(const z of Object.values(window._posLineZones)){
        if(cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h){
          chartEl.style.cursor='pointer';
          return;
        }
      }
    }
    // controlla hover su ✕
    if(window._closeZones){
      for(const z of Object.values(window._closeZones)){
        if(Math.hypot(cx-z.x, cy-z.y) <= z.r+4){
          chartEl.style.cursor='pointer';
          return;
        }
      }
    }
    // controlla hover su pos lines
    const posLine = posLineAtY(e.clientY);
    if(posLine){ chartEl.style.cursor='ns-resize'; return; }

    const nearLine = lineAtY(e.clientY);
    chartEl.style.cursor = nearLine ? 'ns-resize' : '';
    return;
  }

  // Siamo in drag (o drag pending): verifica se si è mossa abbastanza
  if(dragState?.pending || window._posDragState?.pending){
    const startY = dragState?.startY ?? window._posDragState?.startY;
    const movedPx = Math.abs(e.clientY - startY);
    if(movedPx < 4) return; // movimento minimo non raggiunto — lascia LightweightCharts fare pan
    // Conferma il drag
    if(dragState?.pending){
      dragState.pending = false;
      chartEl.style.cursor = 'ns-resize';
    }
    if(window._posDragState?.pending){
      window._posDragState.pending = false;
      chartEl.style.cursor = 'ns-resize';
    }
  }

  // Siamo in drag confermato: blocca LightweightCharts dal fare pan verticale
  // ma solo nell'area chart, non sull'asse prezzi
  const _r = chartWrap.getBoundingClientRect();
  const _cx = e.clientX - _r.left;
  if(_cx > _r.width - 60) { drawCanvas(); return; } // asse prezzi: lascia passare
  e.preventDefault();
  e.stopPropagation();
  const rect=chartWrap.getBoundingClientRect();
  const y=e.clientY-rect.top;
  const price=candleSeries.coordinateToPrice(y);
  if(!price||price<=0) return;

  // ── DRAG pos SL/TP ──
  if(window._posDragState){
    const pd = window._posDragState;
    if(pd.type === 'sl'){
      const entry = window._posSLLines[pd.idx];
      if(!entry) return;
      // ── SL Shield check ──
      const refSL = pd.refSL || entry.price; // refSL catturato al mousedown
      const side  = entry.side || 'long';
      // ── check: SL non può superare l'entry (in posizione) ──
      const posEntry = parseFloat(
        (window._positions && window._positions[pd.idx])
          ? (window._positions[pd.idx].openPriceAvg || window._positions[pd.idx].averageOpenPrice || window._positions[pd.idx].openAvgPrice || 0)
          : 0
      );
      if(posEntry > 0){
        if(side === 'long'  && price >= posEntry){ drawCanvas(); return; }
        if(side === 'short' && price <= posEntry){ drawCanvas(); return; }
      }
      if(!slpCheck(price, refSL, side, true)){
        // Blocca il drag: lascia la linea dove si trova attualmente (non al refSL)
        // Mostra notify solo se è il primo frame bloccato (evita spam)
        if(!pd._blocked){
          pd._blocked = true;
          notify(`🛡 SL Shield: non puoi andare oltre $${fmtPrice(refSL)}`, 'err');
        }
        drawCanvas(); return;
      }
      pd._blocked = false; // reset flag se si torna in zona valida
      // aggiorna prezzo
      entry.price = price;
      // aggiorna priceLine
      if(entry.priceLine){ try{candleSeries.removePriceLine(entry.priceLine);}catch(_){} }
      entry.priceLine = candleSeries.createPriceLine({
        price, color:'#ff2d4a', lineWidth:1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible:true, title:` SL#${pd.idx+1}`,
      });
      // aggiorna input nel pannello
      const inp = document.getElementById('pos-sl-input-'+pd.idx);
      if(inp) inp.value = fmtPrice(price);
      // aggiorna posizione in memoria per drawCanvas
      if(window._positions && window._positions[pd.idx]) window._positions[pd.idx].stopLoss = price;
    } else if(pd.type === 'tp'){
      const key = pd.key || `${pd.idx}_${pd.tpN||1}`;
      const entry = window._posTPLines[key];
      if(!entry) return;
      entry.price = price;
      if(entry.priceLine){ try{candleSeries.removePriceLine(entry.priceLine);}catch(_){} }
      entry.priceLine = candleSeries.createPriceLine({
        price, color: entry.color || '#00d17a', lineWidth:1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible:true, title:` TP${entry.tpN}#${entry.posIdx+1}`,
      });
      const inp = document.getElementById(`pos-tp${entry.tpN}-input-${entry.posIdx}`);
      if(inp) inp.value = fmtPrice(price);
      if(window._positions && window._positions[entry.posIdx]) window._positions[entry.posIdx].takeProfit = price;
    }
    drawCanvas();
    return;
  }

  DRAG_PRICES[dragState.type]=price;

  // aggiorna campo input
  const idMap={entry:'entryVal',sl:'slVal',tp1:'tp1',tp2:'tp2',tp3:'tp3'};
  if(dragState.type.startsWith('ld')){
    // aggiorna prezzo ordine ladder
    const lIdx = parseInt(dragState.type[2])-1;
    LADDER.orders[lIdx].price = price;
    const el2 = document.getElementById('ladd-price-'+lIdx);
    if(el2) el2.value = fmtPrice(price);
    // aggiorna priceLine
    if(LADDER.orders[lIdx].priceLine){
      try{ candleSeries.removePriceLine(LADDER.orders[lIdx].priceLine); }catch(_){}
    }
    LADDER.orders[lIdx].priceLine = candleSeries.createPriceLine({
      price, color:LADDER_COLORS[lIdx], title:'',
      lineWidth:1, lineStyle:0, axisLabelVisible:false,
    });
    calcLadder();
  } else {
    const el=document.getElementById(idMap[dragState.type]);
    if(el) el.value=fmtPrice(price);
    // aggiorna linea
    setChartLine(dragState.type, price);
  }
  drawCanvas();
}, {capture: true});

document.addEventListener('mouseup', e=>{
  // ── fine drag pos SL/TP → applica valore al pannello e mostra notify ──
  if(window._posDragState){
    const pd = window._posDragState;
    window._posDragState = null;
    chartEl.style.cursor = '';
    if(pd.type === 'sl'){
      const entry = window._posSLLines[pd.idx];
      if(entry && entry.price){
        // Aggiorna l'input nel pannello già fatto in mousemove; qui solo notify
        notify(`⇅ SL#${pd.idx+1} → $${fmtPrice(entry.price)} — premi Set SL per confermare`, '');
      }
    } else if(pd.type === 'tp'){
      const key = pd.key || `${pd.idx}_${pd.tpN||1}`;
      const entry = window._posTPLines[key];
      if(entry && entry.price){
        notify(`⇅ TP${entry.tpN}#${entry.posIdx+1} → $${fmtPrice(entry.price)} — premi Set per confermare`, '');
      }
    }
    drawCanvas();
    return;
  }
  if(dragState){
    const t=dragState.type;
    dragState=null;
    chartEl.style.cursor='';
    if(t.startsWith('ld')){
      calcLadder();
      notify('Set '+t.toUpperCase()+' → $'+fmtPrice(DRAG_PRICES[t]),'ok');
    } else {
      calc(); // calc solo al rilascio, non durante il drag
      notify('Set '+t.toUpperCase()+' → $'+fmtPrice(DRAG_PRICES[t]),'ok');
    }
  }
});

// mouseup gestito nel listener sopra

// ridisegna se la chart scrolla/zooma
chart.timeScale().subscribeVisibleTimeRangeChange(()=>drawCanvas());
chart.subscribeCrosshairMove(()=>{ if(!dragState) drawCanvas(); });
window.addEventListener('resize',()=>{
  chart.resize(chartEl.offsetWidth,chartEl.offsetHeight);
  drawCanvas();
});

// ─── RIGHT CLICK CONTEXT MENU ───
let ctxPrice=null;

function openCtxMenu(e){
  e.preventDefault();
  // Non aprire il menu se si è cliccato su una linea draggabile
  // (l'utente vuole iniziare a trascinare, non aprire il menu)
  if(lineAtY(e.clientY) || posLineAtY(e.clientY)) return;
  const rect=chartEl.getBoundingClientRect();
  ctxPrice=candleSeries.coordinateToPrice(e.clientY-rect.top);
  if(!ctxPrice) return;
  const m=document.getElementById('ctxMenu');
  // in market mode, hide "Set Entry"
  m.children[0].style.display = S.orderType==='market'?'none':'flex';
  // In ladder mode: show Set L1..L4 instead of Entry
  const isLadder = S.orderType==='ladder';
  m.children[0].style.display = (!isLadder && S.orderType!=='market') ? 'flex' : 'none';
  // Ladder-specific items (children 5-8)
  for(let i=5;i<=8;i++){
    const el=m.children[i]; if(!el) continue;
    el.style.display=isLadder?'flex':'none';
  }
  m.style.display='block';
  m.style.left=e.clientX+'px';
  m.style.top=e.clientY+'px';
  document.getElementById('chartHint').classList.add('hidden');
}

// Il contextmenu va ascoltato sia su chartEl che sul canvas dc
// (dc è sopra chartEl con pointerEvents='all' quando ci sono linee)
chartEl.addEventListener('contextmenu', openCtxMenu);
// Il contextmenu è gestito solo su chartEl (dc è sempre pointerEvents none)

document.addEventListener('click',()=>{
  document.getElementById('ctxMenu').style.display='none';
  // pair modal closed via closePairModal()
});

function ctxSet(type){
  if(!ctxPrice) return;
  if(type==='entry'&&S.orderType==='market') return;
  setField(type,ctxPrice);
  document.getElementById('ctxMenu').style.display='none';
}

function ctxSetLadder(i){
  if(!ctxPrice||S.orderType!=='ladder') return;
  LADDER.orders[i].price=ctxPrice;
  const el=document.getElementById('ladd-price-'+i);
  if(el) el.value=fmtPrice(ctxPrice);
  // aggiorna drag price e priceLine
  const k='ld'+(i+1);
  DRAG_PRICES[k]=ctxPrice;
  if(LADDER.orders[i].priceLine){
    try{candleSeries.removePriceLine(LADDER.orders[i].priceLine);}catch(_){}
  }
  LADDER.orders[i].priceLine=candleSeries.createPriceLine({
    price:ctxPrice, color:LADDER_COLORS[i], title:'',
    lineWidth:1, lineStyle:0, axisLabelVisible:false,
  });
  calcLadder(); drawCanvas();
  notify('Set L'+(i+1)+' → $'+fmtPrice(ctxPrice),'ok');
  document.getElementById('ctxMenu').style.display='none';
}

// click-to-set mode (from ⊕ buttons)
chart.subscribeClick(param=>{
  if(!S.clickMode) return;
  const price=candleSeries.coordinateToPrice(param.point.y);
  if(price){ setField(S.clickMode,price); S.clickMode=null; chartEl.style.cursor='default'; }
});

function activateClick(type){
  if(type==='entry'&&S.orderType==='market') return;
  S.clickMode=type;
  chartEl.style.cursor='crosshair';
  notify('Click sulla chart → '+type.toUpperCase(),'');
}

function setField(type,price){
  const idMap={entry:'entryVal',sl:'slVal',tp1:'tp1',tp2:'tp2',tp3:'tp3'};
  document.getElementById(idMap[type]).value=fmtPrice(price);
  if(type.startsWith('tp')&&!S.tpEnabled) toggleTP();
  setChartLine(type,price);
  drawCanvas();
  calc();
  notify('Set '+type.toUpperCase()+' → $'+fmtPrice(price),'ok');
}

// ─── BITGET FUTURES API ───
// USDT-M perpetuals — public endpoints, no auth required
// Docs: https://www.bitget.com/api-doc/contract/market/Get-History-Candles
const BITGET_BASE = 'https://api.bitget.com/api/v2/mix/market';

async function fetchCandles(symbol,tf){
  const granMap={'1m':'1m','5m':'5m','15m':'15m','1H':'1H','4H':'4H','1D':'1Dutc'};
  const granularity = granMap[tf]||'15m';
  const msPerCandle={'1m':60000,'5m':300000,'15m':900000,'1H':3600000,'4H':14400000,'1D':86400000}[tf]||900000;

  // No artificial target — keep paginating until Bitget returns less than PER_CALL (= end of history)
  const PER_CALL = 1000; // Bitget max per call
  const MAX_CALLS = 200; // safety ceiling: 200 × 1000 = 200k candles max
  const sym = symbol.endsWith('USDT') ? symbol : symbol+'USDT';

  try{
    let allCandles=[];
    let endTime = Date.now();

    for(let i=0;i<MAX_CALLS;i++){
      const url=`${BITGET_BASE}/candles?symbol=${sym}&productType=USDT-FUTURES&granularity=${granularity}&endTime=${endTime}&limit=${PER_CALL}`;
      const ctrl=new AbortController();
      const tid=setTimeout(()=>ctrl.abort(),12000);
      let r;
      try{ r=await fetch(url,{signal:ctrl.signal}); } finally{ clearTimeout(tid); }
      if(!r||!r.ok){ console.warn('Bitget /candles HTTP',r?.status); break; }
      const j=await r.json();
      if(j.code&&j.code!=='00000'){ console.warn('Bitget /candles err',j.code,j.msg); break; }
      const rows=j.data;
      if(!rows||!rows.length) break;
      // /candles returns descending (newest first)
      const candles=rows.map(d=>({
        time:Math.floor(parseInt(d[0])/1000),
        open:parseFloat(d[1]),high:parseFloat(d[2]),
        low:parseFloat(d[3]),close:parseFloat(d[4]),
      }));
      allCandles = candles.concat(allCandles);
      // oldest ts in this batch — go further back
      const oldestTs = Math.min(...rows.map(d=>parseInt(d[0])));
      endTime = oldestTs - 1;
      if(rows.length < PER_CALL) break; // no more history
    }

    if(!allCandles.length){ console.warn('Bitget: no candles for',sym,tf); return null; }
    const seen=new Set();
    return allCandles
      .filter(c=>{ if(seen.has(c.time)) return false; seen.add(c.time); return true; })
      .sort((a,b)=>a.time-b.time);
  }catch(e){ console.error('Bitget fetchCandles',e); return null; }
}

async function fetchTicker(symbol){
  const sym = symbol.endsWith('USDT') ? symbol : symbol+'USDT';
  try{
    const ctrl=new AbortController();
    const tid=setTimeout(()=>ctrl.abort(),5000);
    let r;
    try{ r=await fetch(`${BITGET_BASE}/ticker?symbol=${sym}&productType=USDT-FUTURES`,{signal:ctrl.signal}); }
    finally{ clearTimeout(tid); }
    if(!r||!r.ok) throw new Error('HTTP '+r?.status);
    const j=await r.json();
    if(j.code&&j.code!=='00000') throw new Error(j.msg);
    // data can be array or object depending on whether symbol is passed
    const d=Array.isArray(j.data)?j.data[0]:j.data;
    if(!d||!d.lastPr) throw new Error('no lastPr');
    return {
      last    : parseFloat(d.lastPr),
      open24h : parseFloat(d.open24h  || d.openUtc  || d.lastPr),
      high24h : parseFloat(d.high24h  || d.lastPr),
      low24h  : parseFloat(d.low24h   || d.lastPr),
    };
  }catch(e){ console.warn('Bitget fetchTicker',e); return null; }
}

async function loadCandles(symbol,tf){
  document.getElementById('chartLoading').classList.remove('hidden');
  const isBingx = window._activeExchange === 'bingx';
  const isWeex  = window._activeExchange === 'weex';
  const isBybit = window._activeExchange === 'bybit' || window._activeExchange === 'bybit_demo';
  const data = isBingx ? await fetchBingxCandles(symbol,tf)
             : isWeex  ? await fetchWeexCandles(symbol,tf)
             : isBybit ? await fetchBybitCandles(symbol,tf)
             : await fetchCandles(symbol,tf);
  document.getElementById('chartLoading').classList.add('hidden');
  const exchLabel = isBingx ? 'BingX' : isWeex ? 'Weex' : isBybit ? 'Bybit' : 'Bitget';
  if(data&&data.length){
    candleSeries.setData(data);
    // Reset esplicito di entrambi gli assi — indipendente dal pair precedente
    chart.priceScale('right').applyOptions({ autoScale: true });
    const _nb = data.length;
    chart.timeScale().setVisibleLogicalRange({ from: _nb - 100, to: _nb + 5 });
    const last=data[data.length-1];
    S.lastPrice=last.close;
    S._prevClose=last.close;
    S._lastCandleTime=null;
    updatePriceDisp(last.close,data[data.length-2]?.close||last.open);
    startTick(symbol);
    notify(exchLabel+' Futures: '+symbol,'ok');
  } else {
    console.error(exchLabel+': no data for',symbol,tf);
    notify(exchLabel+' offline — demo data','err');
    loadDemo(symbol,tf);
  }
  onPriceUpdate();
  // Ricarica linee SL/TP/posizioni filtrate per il simbolo appena caricato
  if (window._positions && window._positions.length) {
    if (window.refreshPosSLLines) window.refreshPosSLLines(window._positions);
    if (window.refreshPosTPLines) window.refreshPosTPLines([], window._positions);
    drawCanvas();
  }
}

function startTick(symbol){
  // Ferma SUBITO il timer precedente — evita che un tick stale del vecchio pair
  // scriva S._prevClose con il prezzo sbagliato prima che il nuovo tick lo usi
  if(S.tickTimer){ clearInterval(S.tickTimer); S.tickTimer=null; }

  let currentCandleOpen = null;
  let currentCandleHigh = null;
  let currentCandleLow  = null;
  let firstTick = true;
  // Snapshot isolato: immune a scritture successive da tick stale
  const initialPrevClose = S._prevClose;

  S.tickTimer=setInterval(async()=>{
    const isBingx = window._activeExchange === 'bingx';
    const isWeex  = window._activeExchange === 'weex';
    const isBybit = window._activeExchange === 'bybit' || window._activeExchange === 'bybit_demo';
    const t = isBingx ? await fetchBingxTicker(symbol)
            : isWeex  ? await fetchWeexTicker(symbol)
            : isBybit ? await fetchBybitTicker(symbol)
            : await fetchTicker(symbol);
    if(!t) return;

    S.lastPrice=t.last;
    _priceCache[symbol] = t.last;
    updatePriceDisp(t.last, t.open24h);
    onPriceUpdate();

    try{
      const tfSec={'1m':60,'5m':300,'15m':900,'1H':3600,'4H':14400,'1D':86400}[S.tf]||900;
      const nowSec = Math.floor(Date.now()/1000);
      const candleTime = Math.floor(nowSec/tfSec)*tfSec;

      // Nuovo periodo o primo tick: reset OHLC
      if(currentCandleOpen===null || S._lastCandleTime!==candleTime){
        // Primo tick: usa snapshot iniziale (close storico del nuovo pair)
        // Nuovi periodi: usa _prevClose aggiornato
        currentCandleOpen = (currentCandleOpen===null ? initialPrevClose : S._prevClose) || t.last;
        currentCandleHigh = Math.max(currentCandleOpen, t.last);
        currentCandleLow  = Math.min(currentCandleOpen, t.last);
        S._lastCandleTime = candleTime;
      }

      currentCandleHigh = Math.max(currentCandleHigh, t.last);
      currentCandleLow  = Math.min(currentCandleLow,  t.last);
      S._prevClose = t.last;

      candleSeries.update({
        time : candleTime,
        open : currentCandleOpen,
        high : currentCandleHigh,
        low  : currentCandleLow,
        close: t.last,
      });

      // Bug 2 fix: fitContent DOPO candleSeries.update al primo tick
      // così la price scale (asse Y) si adatta al range del nuovo pair
      if(firstTick){
        firstTick = false;
      }
    }catch(_){}
  },1500);
}

// ─── REALTIME PnL UPDATE per posizioni aperte ───
// Cache prezzi condivisa — popolata da startTick e dal fetcher background
const _priceCache = {};

let _rtPnlTimer = null;
let _bgPriceFetcher = null;

function _startBgPriceFetch() {
  if (_bgPriceFetcher) clearInterval(_bgPriceFetcher);
  _bgPriceFetcher = setInterval(async () => {
    if (!window._positions || !window._positions.length) return;
    const syms = [...new Set(window._positions.map(p =>
      (p.symbol||'').replace(/_?(UMCBL|DMCBL)/gi,'').replace(/USDT$/,'')
    ))].filter(s => s !== S.symbol);
    if (!syms.length) return;
    await Promise.all(syms.map(async sym => {
      try {
        const isBingx = window._activeExchange === 'bingx';
        const isWeex  = window._activeExchange === 'weex';
        const isBybit = window._activeExchange === 'bybit' || window._activeExchange === 'bybit_demo';
        const t = isBingx ? await fetchBingxTicker(sym)
                : isWeex  ? await fetchWeexTicker(sym)
                : isBybit ? await fetchBybitTicker(sym)
                : await fetchTicker(sym);
        if (t) _priceCache[sym] = t.last;
      } catch(_) {}
    }));
  }, 2000);
}

// Tracker per rilevare hit TP/SL in realtime
const _rtHitTracker = {}; // sym+side+idx → { slHit: bool, tpHit: bool }
let _rtRefreshPending = false;

function startRealtimePnl() {
  if (_rtPnlTimer) clearInterval(_rtPnlTimer);
  _startBgPriceFetch();
  _rtPnlTimer = setInterval(() => {
    if (!_positions || !_positions.length) return;

    let totalUnrealizedPnl = 0;
    let needRefresh = false;

    _positions.forEach((p, idx) => {
      const sym = (p.symbol||'').replace(/_?(UMCBL|DMCBL)/gi,'').replace(/USDT$/,'');
      const markPx = _priceCache[sym];
      if (!markPx) return;

      const entry = parseFloat(p.openPriceAvg||p.averageOpenPrice||p.openAvgPrice||0);
      const size  = parseFloat(p.total||p.available||p.totalPos||0);
      const lev   = parseFloat(p.leverage||1);
      const side  = (p.holdSide||'long').toLowerCase();
      const notional = size * markPx;
      const margin   = notional / lev;
      const upnl     = side === 'long'
        ? (markPx - entry) * size
        : (entry - markPx) * size;
      const roe = margin > 0 ? (upnl / margin * 100) : 0;

      const pnlEl      = document.getElementById('pos-pnl-' + idx);
      const markEl     = document.getElementById('pos-mark-' + idx);
      const marginEl   = document.getElementById('pos-margin-' + idx);
      const notionalEl = document.getElementById('pos-notional-' + idx);

      // Aggiorna upnl nella struttura dati per drawCanvas (overlay chart realtime)
      p.unrealizedPL = upnl;
      p.markPrice = markPx;

      if (pnlEl) {
        pnlEl.className = 'pnl ' + (upnl >= 0 ? 'pos' : 'neg');
        pnlEl.innerHTML = `${upnl>=0?'+':'-'}$${fmt(Math.abs(upnl))} <span style="font-size:9px;opacity:.7">(${roe>=0?'+':''}${roe.toFixed(2)}%)</span>`;
      }
      if (markEl)     markEl.textContent = '$' + fmtPrice(markPx);
      if (marginEl)   marginEl.textContent = '$' + fmt(margin);
      if (notionalEl) notionalEl.textContent = fmt(size) + ' cont · $' + fmt(notional);

      // Accumula PnL totale per aggiornare topbar
      totalUnrealizedPnl += upnl;

      // ── BUG 1 FIX: rileva hit TP/SL confrontando markPx con i livelli impostati ──
      // Usa i dati SL/TP dalla struttura posizione (aggiornati da fetchPositionTPSLOrders)
      const slPrice = (window._posSLLines && window._posSLLines[idx] && window._posSLLines[idx].price)
        ? window._posSLLines[idx].price
        : parseFloat(p.stopLoss||p.stopLossPrice||p.presetStopLossPrice||0);
      const tpKey = `${idx}_1`;
      const tpPrice = (window._posTPLines && window._posTPLines[tpKey] && window._posTPLines[tpKey].price)
        ? window._posTPLines[tpKey].price
        : parseFloat(p.takeProfit||p.takeProfitPrice||p.presetTakeProfitPrice||0);

      const trackKey = `${p.symbol}_${side}_${idx}`;
      if (!_rtHitTracker[trackKey]) _rtHitTracker[trackKey] = { slHit: false, tpHit: false };
      const tracker = _rtHitTracker[trackKey];

      if (!tracker.slHit && slPrice > 0) {
        const slHit = side === 'long' ? markPx <= slPrice : markPx >= slPrice;
        if (slHit) {
          tracker.slHit = true;
          needRefresh = true;
          notify(`🛑 SL hit su ${sym}! Sync in corso...`, 'err');
        }
      }
      if (!tracker.tpHit && tpPrice > 0) {
        const tpHit = side === 'long' ? markPx >= tpPrice : markPx <= tpPrice;
        if (tpHit) {
          tracker.tpHit = true;
          needRefresh = true;
          notify(`✅ TP hit su ${sym}! Sync in corso...`, 'ok');
        }
      }
    });

    // Aggiorna topbar PnL in tempo reale
    const tEl = document.getElementById('tbPnl');
    if (tEl) {
      tEl.textContent = (totalUnrealizedPnl>=0?'+':'-')+'$'+fmt(Math.abs(totalUnrealizedPnl));
      tEl.className = 'tv ' + (totalUnrealizedPnl>=0?'pos':'neg');
    }
    const pEl = document.getElementById('accPnl');
    if (pEl) {
      pEl.textContent = (totalUnrealizedPnl>=0?'+':'-')+'$'+fmt(Math.abs(totalUnrealizedPnl));
      pEl.className = 'av ' + (totalUnrealizedPnl>=0?'pos':'neg');
    }

    // ── BUG 2 FIX: aggiorna balance realtime = walletBalance + unrealizedPnl ──
    if (S.walletBalance > 0) {
      const realtimeEquity = S.walletBalance + totalUnrealizedPnl;
      S.balance = realtimeEquity;
      const tbBalEl = document.getElementById('tbBalance');
      if (tbBalEl) tbBalEl.textContent = '$' + fmt(realtimeEquity);
      const accBalEl = document.getElementById('accBalance');
      if (accBalEl) accBalEl.textContent = '$' + fmt(realtimeEquity);
    }

    // Ridisegna overlay chart con PnL aggiornato in tempo reale
    drawCanvas();

    // Refresh account se TP/SL hit rilevato (con debounce 2s per non spammare)
    if (needRefresh && !_rtRefreshPending) {
      _rtRefreshPending = true;
      setTimeout(() => {
        _rtRefreshPending = false;
        // Reset tracker per le posizioni che hanno hittato (verranno ricaricate dal dashboard)
        Object.keys(_rtHitTracker).forEach(k => delete _rtHitTracker[k]);
        if (window.refreshAccount) window.refreshAccount();
      }, 2000);
    }
  }, 500);
}

function stopRealtimePnl() {
  if (_rtPnlTimer) { clearInterval(_rtPnlTimer); _rtPnlTimer = null; }
  if (_bgPriceFetcher) { clearInterval(_bgPriceFetcher); _bgPriceFetcher = null; }
  // Reset hit tracker quando le posizioni vengono ricaricate dall'exchange
  Object.keys(_rtHitTracker).forEach(k => delete _rtHitTracker[k]);
}

function onPriceUpdate(){
  // In MARKET mode: entry line follows live price, SL is fixed
  if(S.orderType==='market'&&S.lastPrice){
    document.getElementById('entryMktVal').value=fmtPrice(S.lastPrice);
    setChartLine('entry',S.lastPrice);
    calc();
    drawCanvas();
  }
  // In LADDER mode: aggiorna badge
  if(S.orderType==='ladder'){
    calcLadder();
    drawCanvas();
  }
}

function loadDemo(symbol,tf){
  const seeds={BTCUSDT:83000,ETHUSDT:3200,SOLUSDT:178,BNBUSDT:560,XRPUSDT:0.52};
  let price=seeds[symbol]||100;
  const now=Math.floor(Date.now()/1000);
  const iv={1:60,'1m':60,'5m':300,'15m':900,'1H':3600,'4H':14400,'1D':86400}[tf]||900;
  const data=[];
  for(let i=200;i>=0;i--){
    const t=now-i*iv, vol=price*.012, open=price;
    const change=(Math.random()-.48)*vol, close=open+change;
    data.push({time:t,open,high:Math.max(open,close)+Math.random()*vol*.5,low:Math.min(open,close)-Math.random()*vol*.5,close});
    price=close;
  }
  S.lastPrice=data[data.length-1].close;
  updatePriceDisp(S.lastPrice,data[data.length-2].close);
  candleSeries.setData(data);
  chart.timeScale().fitContent();
  onPriceUpdate();
}

function updatePriceDisp(price,prev){
  const chg=(price-prev)/prev*100;
  document.getElementById('topPrice').textContent='$'+fmtPrice(price);
  const el=document.getElementById('topChg');
  el.textContent=(chg>=0?'+':'')+chg.toFixed(2)+'%';
  el.className='price-chg '+(chg>=0?'pos':'neg');
}

// ─── ORDER TYPE ───
function setOType(t){
  S.orderType=t;
  // update buttons — handle Market, Limit, Ladder
  ['otMarket','otLimit','otLadder'].forEach(id=>{
    const btn = document.getElementById(id);
    if(!btn) return;
    const bt = id==='otMarket'?'market':id==='otLimit'?'limit':'ladder';
    btn.className='otype-btn'+(t===bt?' active':'');
  });

  const isMarket = t==='market';
  const isLadder = t==='ladder';

  // entry rows visibility
  document.getElementById('entryRow').style.display     = (t==='limit')?'flex':'none';
  document.getElementById('entryMktRow').style.display  = isMarket?'flex':'none';
  document.getElementById('mktBanner').classList.toggle('hidden',!isMarket);

  // ladder panel
  document.getElementById('ladderPanel').style.display = isLadder ? 'block' : 'none';

  // in limit: rimuovi entry line live e rimetti quella manuale
  if(t==='limit'){
    removeChartLine('entry');
    DRAG_PRICES.entry=null;
    const v=parseFloat(document.getElementById('entryVal').value);
    if(v) setChartLine('entry',v);
  } else if(isMarket){
    // torna in market: ripristina live entry
    if(S.lastPrice){ setChartLine('entry',S.lastPrice); DRAG_PRICES.entry=S.lastPrice; }
    document.getElementById('entryMktVal').value=S.lastPrice?fmtPrice(S.lastPrice):'';
  } else if(isLadder){
    // ladder: rimuovi entry singola, mantieni linee ladder
    removeChartLine('entry');
    DRAG_PRICES.entry=null;
    renderLadderOrders();
  }

  drawCanvas();
  calc();
}

// ─── LADDER STATE ───
const LADDER = {
  n: 4,          // numero ordini attivi
  orders: [],    // [{price, pct, enabled, priceLine, dragPrice}]
};

// Aggiungi DRAG_PRICES ladder
for(let i=1;i<=4;i++) DRAG_PRICES['ld'+i] = null;

// Colori linee ladder
const LADDER_COLORS = ['#ffc940','#f59e0b','#fb923c','#ef4444'];

function setLadderN(n){
  LADDER.n = n;
  document.querySelectorAll('.ladder-n').forEach(el=>{
    const v = parseInt(el.textContent);
    el.className = 'lev-p ladder-n' + (v===n?' active':'');
  });
  renderLadderOrders();
  calcLadder();
  syncLadderLinesToChart();
}

function getLadderWeights(n, prices, manualPcts){
  // Se tutti i pesi manuali sono validi, usali direttamente
  if(manualPcts && manualPcts.length === n && manualPcts.every(p => p > 0)){
    const sum = manualPcts.reduce((a,b)=>a+b,0);
    // normalizza a 100 per sicurezza
    return manualPcts.map(p => Math.round(p/sum*1000)/10);
  }

  if(n === 1) return [100];

  // L1 fisso al 15%, il resto distribuito in modo crescente sugli altri livelli
  const L1_PCT = 15;
  const remaining = 100 - L1_PCT;
  const othersCount = n - 1;

  // Distribuzione crescente: peso proporzionale all'indice (1, 2, 3, ...)
  // es. con 3 altri: pesi relativi 1,2,3 → tot 6 → 16.7%, 33.3%, 50%
  const indexSum = (othersCount * (othersCount + 1)) / 2;
  const otherWeights = [];
  for(let i = 1; i <= othersCount; i++){
    otherWeights.push(Math.round(remaining * i / indexSum * 10) / 10);
  }

  // Aggiusta arrotondamento sull'ultimo per avere esattamente 100
  const total = L1_PCT + otherWeights.reduce((a,b)=>a+b, 0);
  const diff = Math.round((100 - total) * 10) / 10;
  otherWeights[otherWeights.length - 1] = Math.round((otherWeights[otherWeights.length - 1] + diff) * 10) / 10;

  return [L1_PCT, ...otherWeights];
}

function renderLadderOrders(){
  if(S.orderType !== 'ladder') return;
  const container = document.getElementById('ladderOrders');
  const n = LADDER.n;

  while(LADDER.orders.length < 4) LADDER.orders.push({price:null, enabled:true, priceLine:null, manualPct:null});

  // Calcola pesi default per mostrare i valori iniziali
  const defaultWeights = getLadderWeights(n, null, null);

  let html = '';
  for(let i=0;i<n;i++){
    const idx = i+1;
    const order = LADDER.orders[i];
    const enabled = order.enabled !== false;
    // Usa peso manuale se impostato, altrimenti default
    const pctVal = order.manualPct != null ? order.manualPct : defaultWeights[i];
    html += `
    <div class="ladd-order ${enabled?'active':'inactive'}" id="ladd-row-${i}">
      <div class="ladd-num" style="color:${LADDER_COLORS[i]}">L${idx}</div>
      <div class="ladd-price-wrap" style="border-color:${LADDER_COLORS[i]}44">
        <input type="number" id="ladd-price-${i}" placeholder="${i===0?(S.dir==='long'?'High':'Low'):i===n-1?(S.dir==='long'?'Low':'High'):'prezzo'}"
          step="0.01" value="${order.price?fmtPrice(order.price):''}"
          oninput="onLadderPriceInput(${i})" style="color:${LADDER_COLORS[i]}"/>
      </div>
      <div class="ladd-pct-wrap" title="Peso % ordine L${idx}">
        <input type="number" id="ladd-pct-input-${i}" min="1" max="99" step="0.1"
          value="${pctVal.toFixed(1)}"
          oninput="onLadderPctInput(${i})"
          style="color:${LADDER_COLORS[i]}"/>
        <span class="unit">%</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <div class="ladd-size" id="ladd-size-${i}">— USDT</div>
        <button class="ladd-toggle ${enabled?'on':'off'}" onclick="toggleLadderOrder(${i})" id="ladd-tog-${i}">${enabled?'✓':'○'}</button>
      </div>
    </div>`;
  }
  container.innerHTML = html;
  calcLadder();
}

function toggleLadderOrder(i){
  LADDER.orders[i].enabled = !LADDER.orders[i].enabled;
  renderLadderOrders();
  syncLadderLinesToChart();
}

function onLadderInput(){
  // Distribuisce i livelli equidistanti tra top e bottom.
  // Long:  L1 = prezzo più alto (prima entry DCA), L4 = più basso (vicino SL)
  // Short: L1 = prezzo più basso (prima entry DCA), L4 = più alto (vicino SL)
  const top = parseFloat(document.getElementById('ladderTop').value);
  const bot = parseFloat(document.getElementById('ladderBottom').value);
  const n = LADDER.n;
  if(!top || !bot) return;

  const isLong = S.dir === 'long';
  const high = Math.max(top, bot);
  const low  = Math.min(top, bot);

  for(let i=0;i<n;i++){
    // Long:  i=0 → high, i=n-1 → low
    // Short: i=0 → low,  i=n-1 → high
    const price = isLong
      ? high + (low - high) * (i / (n - 1))
      : low  + (high - low) * (i / (n - 1));
    LADDER.orders[i].price = price;
    const el = document.getElementById('ladd-price-'+i);
    if(el) el.value = fmtPrice(price);
  }
  calcLadder();
  syncLadderLinesToChart();
}

function onLadderPriceInput(i){
  const el = document.getElementById('ladd-price-'+i);
  const price = parseFloat(el.value);
  LADDER.orders[i].price = price || null;
  calcLadder();
  syncLadderLinesToChart();
}

function onLadderPctInput(i){
  const el = document.getElementById('ladd-pct-input-'+i);
  const val = parseFloat(el.value);
  LADDER.orders[i].manualPct = (!isNaN(val) && val > 0) ? val : null;
  calcLadder();
}

function calcLadder(){
  if(S.orderType !== 'ladder') return;

  const sl      = parseFloat(document.getElementById('slVal').value);
  const riskRaw = parseFloat(document.getElementById('riskVal').value);
  const lev     = parseFloat(document.getElementById('levVal').value)||1;
  const bal     = S.balance||1000;
  const n       = LADDER.n;

  const riskUsd = S.riskMode==='pct' ? (bal*riskRaw/100) : riskRaw;

  // Filtra ordini attivi con prezzo valido
  const activeOrders = [];
  for(let i=0;i<n;i++){
    const o = LADDER.orders[i];
    if(o.enabled !== false && o.price && o.price > 0) activeOrders.push({i, price:o.price});
  }

  if(!activeOrders.length || !sl || !riskRaw){
    // Azzera display
    for(let i=0;i<n;i++){
      const sz = document.getElementById('ladd-size-'+i);
      if(sz) sz.textContent = '— USDT';
    }
    document.getElementById('ladderSummary').style.display='none';
    document.getElementById('chartCalcBtn').classList.remove('visible');
    return;
  }

  const prices = activeOrders.map(o => o.price);
  const manualPcts = activeOrders.map(o => LADDER.orders[o.i].manualPct ?? null);
  const weights = getLadderWeights(activeOrders.length, prices, manualPcts.some(p=>p!=null) ? manualPcts.map(p=>p!=null?p:0) : null);

  let totalSize = 0, totalRisk = 0, weightedEntry = 0, totalWeight = 0;
  const orderData = activeOrders.map((o, j) => {
    const w = weights[j] / 100;
    const orderRisk = riskUsd * w;
    const slDist = Math.abs(o.price - sl);
    const slDistPct = slDist / o.price * 100;
    const size = slDistPct > 0 ? calcSizeWithFee(orderRisk, slDistPct, 'ladder') : 0;
    const margin = size / lev;
    return { ...o, weight:w, pct:weights[j], risk:orderRisk, size, margin, slDistPct };
  });

  // Aggiorna display ordini
  for(let i=0;i<n;i++){
    const sz = document.getElementById('ladd-size-'+i);
    const od = orderData.find(o=>o.i===i);
    if(!od){
      if(sz) sz.textContent='— USDT';
      continue;
    }
    // Aggiorna il campo % solo se non ha un valore manuale (non interferire con editing)
    const pctInput = document.getElementById('ladd-pct-input-'+i);
    if(pctInput && LADDER.orders[i].manualPct == null){
      pctInput.value = od.pct.toFixed(1);
    }
    if(sz) sz.textContent = fmt(od.size)+' U';
    totalSize += od.size;
    totalRisk += od.risk;
    weightedEntry += od.price * od.weight;
    totalWeight += od.weight;
  }

  const avgEntry = totalWeight > 0 ? weightedEntry / totalWeight : 0;

  // Summary
  const sumEl = document.getElementById('ladderSummary');
  sumEl.style.display = 'block';
  document.getElementById('laddTotalSize').textContent = fmt(totalSize)+' USDT';
  document.getElementById('laddTotalRisk').textContent = '$'+fmt(totalRisk);
  const laddFeeEl = document.getElementById('laddTotalFee');
  if(laddFeeEl) laddFeeEl.textContent = '$'+fmt(calcFeeUsd(totalSize, 'ladder'));
  document.getElementById('laddAvgEntry').textContent  = '$'+fmtPrice(avgEntry);

  // Update chart calc button
  document.getElementById('chartCalcSize').textContent = fmt(totalSize);
  document.getElementById('chartCalcBtn').classList.add('visible');

  // FIX: aggiorna il pannello POSITION SIZE con i totali del ladder
  // (in modalità ladder, calc() non viene chiamato con entry valida,
  //  quindi questi campi resterebbero sempre '—')
  const _calcSizeEl   = document.getElementById('calcSize');
  const _calcMarginEl = document.getElementById('calcMargin');
  const _cdSlDistEl   = document.getElementById('cdSlDist');
  const _cdRiskUsdEl  = document.getElementById('cdRiskUsd');
  const _cdFeeEl      = document.getElementById('cdFee');
  const _cdRREl       = document.getElementById('cdRR');
  if(_calcSizeEl)   _calcSizeEl.textContent   = fmt(totalSize);
  if(_calcMarginEl) _calcMarginEl.textContent  = '$' + fmt(totalSize / lev);
  const _avgSlDistPct = orderData.length > 0
    ? orderData.reduce((acc, o) => acc + o.slDistPct * o.weight, 0)
    : 0;
  if(_cdSlDistEl)  _cdSlDistEl.textContent  = _avgSlDistPct > 0 ? _avgSlDistPct.toFixed(2) + '%' : '—';
  if(_cdRiskUsdEl) _cdRiskUsdEl.textContent = '$' + fmt(totalRisk);
  if(_cdFeeEl) {
    const _feeUsd  = calcFeeUsd(totalSize, 'ladder');
    const _feeRate = (getTakerFeeRate() * 100).toFixed(3);
    _cdFeeEl.textContent = '$' + fmt(_feeUsd) + ' (taker×2 (' + _feeRate + '%))';
  }
  if(_cdRREl) _cdRREl.textContent = '—';

  // Auto-switch direction
  const firstActive = activeOrders[0];
  if(firstActive && sl < firstActive.price && S.dir !== 'long') setDir('long');
  if(firstActive && sl > firstActive.price && S.dir !== 'short') setDir('short');

  drawCanvas();
}

function syncLadderLinesToChart(){
  // Rimuovi linee precedenti
  for(let i=1;i<=4;i++){
    const k='ld'+i;
    if(DRAG_PRICES[k] !== null){
      // rimuovi priceline
      if(LADDER.orders[i-1]?.priceLine){
        try{ candleSeries.removePriceLine(LADDER.orders[i-1].priceLine); }catch(_){}
        LADDER.orders[i-1].priceLine=null;
      }
      DRAG_PRICES[k]=null;
    }
  }
  if(S.orderType!=='ladder') return;

  const n = LADDER.n;
  for(let i=0;i<n;i++){
    const o = LADDER.orders[i];
    if(!o.price || o.enabled===false) continue;
    const k='ld'+(i+1);
    DRAG_PRICES[k]=o.price;
    o.priceLine = candleSeries.createPriceLine({
      price:o.price,
      color:LADDER_COLORS[i],
      title:'',
      lineWidth:1,
      lineStyle:0,
      axisLabelVisible:false,
    });
  }
  drawCanvas();
}

// ─── SYMBOL / TF ───
function changeSymbol(){
  const sym=document.getElementById('symInput').textContent.toUpperCase().trim();
  if(!sym) return;
  S.symbol=sym;
  S._prevClose = null;
  S._lastCandleTime = null;
  clearAll(); loadCandles(sym,S.tf);
}
function setTF(tf){
  S.tf=tf;
  document.querySelectorAll('.tf-btn').forEach(b=>{
    b.className='tf-btn'+(b.textContent===({1:'1m','1m':'1m','5m':'5m','15m':'15m','1H':'1h','4H':'4h','1D':'1D'}[tf])?' active':'');
  });
  loadCandles(S.symbol,tf);
}

// ─── PAIR MODAL ───
let _pmActiveCat = 'All';

function openPairModal(){
  _pmActiveCat = 'All';
  document.getElementById('pairModal').classList.add('open');
  renderPairCats();
  renderPairModal('');
  setTimeout(()=>document.getElementById('pmSearch').focus(),80);
}
function closePairModal(){
  document.getElementById('pairModal').classList.remove('open');
  document.getElementById('pmSearch').value='';
}

function renderPairCats(){
  const cats = ['All', ...new Set(ASSETS.map(a=>a.cat))];
  const el = document.getElementById('pmCats');
  el.innerHTML = cats.map(c=>
    `<button class="pm-cat-btn${c===_pmActiveCat?' active':''}" onclick="setPmCat('${c}')">${c}</button>`
  ).join('');
}
function setPmCat(cat){
  _pmActiveCat = cat;
  renderPairCats();
  renderPairModal(document.getElementById('pmSearch').value);
}

function renderPairModal(filter=''){
  const fl = filter.toUpperCase().trim();
  let list = ASSETS.filter(a=>{
    const matchCat = _pmActiveCat==='All' || a.cat===_pmActiveCat;
    const matchSym = !fl || a.sym.includes(fl) || a.sym.replace('USDT','').includes(fl);
    return matchCat && matchSym;
  });

  const bycat = {};
  list.forEach(a=>{ if(!bycat[a.cat]) bycat[a.cat]=[]; bycat[a.cat].push(a); });

  const body = document.getElementById('pmBody');
  if(!list.length){
    body.innerHTML='<div class="pm-empty">Nessun pair trovato</div>';
    return;
  }

  let h='';
  for(const cat in bycat){
    if(_pmActiveCat==='All') h+=`<div class="pm-section-title">${cat}</div>`;
    h+=`<div class="pm-grid">`;
    bycat[cat].forEach(a=>{
      const base = a.sym.replace('USDT','');
      h+=`<div class="pm-item${a.sym===S.symbol?' active':''}" onclick="selectPair('${a.sym}')">
        <span class="pm-item-sym">${base}/USDT</span>
        <span class="pm-item-base">${a.cat}</span>
      </div>`;
    });
    h+=`</div>`;
  }
  body.innerHTML = h;
}

function selectPair(sym){
  S.symbol = sym;
  document.getElementById('symInput').textContent = sym;
  closePairModal();
  clearAll();
  // Reset live-candle state so the first tick of the new pair starts fresh
  S._prevClose = null;
  S._lastCandleTime = null;
  loadCandles(sym, S.tf);
}

// ESC chiude la modal
document.addEventListener('keydown', e=>{
  if(e.key==='Escape') closePairModal();
});

// ─── DIRECTION ───
function setDir(dir){
  S.dir=dir;
  document.getElementById('btnLong').className='dir-btn long'+(dir==='long'?' active':'');
  document.getElementById('btnShort').className='dir-btn short'+(dir==='short'?' active':'');
  document.getElementById('btnOpen').textContent=dir==='long'?'OPEN LONG':'OPEN SHORT';
  document.getElementById('btnOpen').className='btn-open '+dir;
  calc();
}

// ─── MARGIN MODE ───
function setMarginMode(m){
  S.marginMode = m === 'isolated' ? 'isolated' : 'crossed';
  document.getElementById('tabCross').className = 'risk-tab' + (m==='cross' ? ' active' : '');
  document.getElementById('tabIso').className   = 'risk-tab' + (m==='isolated' ? ' active' : '');
}

// ─── RISK MODE ───
function setRiskMode(m){
  const prevMode = S.riskMode;
  const riskEl = document.getElementById('riskVal');
  const bal = S.balance || 1000;

  if(prevMode === 'pct' && m === 'usd'){
    // Converti: da % a USDT
    const pct = parseFloat(riskEl.value) || 0;
    const usdt = parseFloat((bal * pct / 100).toFixed(2));
    riskEl.value = usdt;
    riskEl.step = '1';
  } else if(prevMode === 'usd' && m === 'pct'){
    // Converti: da USDT a %
    const usdt = parseFloat(riskEl.value) || 0;
    const pct = parseFloat((usdt / bal * 100).toFixed(2));
    riskEl.value = pct;
    riskEl.step = '0.5';
  }

  S.riskMode = m;
  document.getElementById('tabPct').className = 'risk-tab' + (m==='pct' ? ' active' : '');
  document.getElementById('tabUsd').className = 'risk-tab' + (m==='usd' ? ' active' : '');
  document.getElementById('riskUnit').textContent = m==='pct' ? '%' : '$';
  // Aggiorna anche i bottoni stepper delta
  document.querySelector('.stpr-btn[onclick="step(\'riskVal\',.5)"]').setAttribute('onclick', m==='pct' ? "step('riskVal',.5)" : "step('riskVal',10)");
  document.querySelector('.stpr-btn[onclick*="step(\'riskVal\',-.5)"]')?.setAttribute('onclick', m==='pct' ? "step('riskVal',-.5)" : "step('riskVal',-10)");
  calc();
}

// ─── LEVERAGE ───
function setLev(v){ document.getElementById('levVal').value=v; updateLevPresets(); calc(); }
function updateLevPresets(){
  const v=parseInt(document.getElementById('levVal').value);
  document.querySelectorAll('.lev-p').forEach(el=>{
    el.className='lev-p'+(parseInt(el.textContent)===v?' active':'');
  });
}

// ─── STEPPERS ───
function step(id,d){
  const el=document.getElementById(id);
  el.value=Math.max(parseFloat(el.min||0),parseFloat(el.value||0)+d);
  calc();
}
function stepP(id,dir){
  const el=document.getElementById(id);
  const v=parseFloat(el.value||S.lastPrice||100);
  const tick=v>10000?10:v>1000?1:v>100?.1:v>1?.01:.0001;
  el.value=(v+dir*tick).toFixed(getPDec(v));
  const type=id==='entryVal'?'entry':id==='slVal'?'sl':id.replace('Val','');
  syncLine(type);
}

// ─── TP TOGGLE ───
function toggleTP(){
  S.tpEnabled=!S.tpEnabled;
  document.getElementById('tpSw').className='tgl-sw'+(S.tpEnabled?' on':'');
  document.getElementById('tpLbl').textContent=S.tpEnabled?'ON':'OFF';
  ['tpRow1','tpRow2','tpRow3'].forEach(id=>{
    document.getElementById(id).className='tp-row-grid'+(S.tpEnabled?' on':'');
  });
  calc();
}

// ─── CALC ───
function calc(){
  // entry: in market mode = S.lastPrice; in limit/stop = campo input
  const entry = S.orderType==='market'
    ? S.lastPrice
    : parseFloat(document.getElementById('entryVal').value);
  const sl      = parseFloat(document.getElementById('slVal').value);
  const riskRaw = parseFloat(document.getElementById('riskVal').value);
  const lev     = parseFloat(document.getElementById('levVal').value)||1;
  const bal     = S.balance||1000;

  const ids=['calcSize','calcMargin','cdSlDist','cdRiskUsd','cdRR'];
  if(!entry||!sl||!riskRaw){
    ids.forEach(id=>document.getElementById(id).textContent='—');
    document.getElementById('chartCalcBtn').classList.remove('visible');
    updateTPRR(entry,sl); return;
  }

  const slDist=Math.abs(entry-sl);
  const slDistPct=slDist/entry*100;
  if(!slDistPct) return;

  // Auto-switch direction based on SL position
  if(sl<entry && S.dir!=='long')  setDir('long');
  if(sl>entry && S.dir!=='short') setDir('short');

  const riskUsd=S.riskMode==='pct'?(bal*riskRaw/100):riskRaw;
  const size=calcSizeWithFee(riskUsd, slDistPct, S.orderType);
  const feeUsd=calcFeeUsd(size, S.orderType);
  const margin=size/lev;

  document.getElementById('calcSize').textContent=fmt(size);
  document.getElementById('calcMargin').textContent='$'+fmt(margin);
  document.getElementById('cdSlDist').textContent=slDistPct.toFixed(2)+'%';
  document.getElementById('cdRiskUsd').textContent='$'+fmt(riskUsd);
  const feeEl=document.getElementById('cdFee');
  if(feeEl){
    const ot = S.orderType || 'market';
    const feeLabel = ot==='limit'
      ? `maker+taker (${(getMakerFeeRate()*100).toFixed(3)}%+${(getTakerFeeRate()*100).toFixed(3)}%)`
      : `taker×2 (${(getTakerFeeRate()*100).toFixed(3)}%)`;
    feeEl.textContent='$'+fmt(feeUsd)+' ('+feeLabel+')';
  }

  document.getElementById('chartCalcSize').textContent=fmt(size);
  document.getElementById('chartCalcBtn').classList.add('visible');

  const tp1=parseFloat(document.getElementById('tp1').value);
  document.getElementById('cdRR').textContent=tp1&&S.tpEnabled?'1:'+(Math.abs(tp1-entry)/slDist).toFixed(2):'—';

  updateTPRR(entry,sl);
  drawCanvas(); // ridisegna badge distanza SL aggiornato
}

function updateTPRR(entry,sl){
  if(!entry||!sl) return;
  const d=Math.abs(entry-sl);
  [1,2,3].forEach(n=>{
    const tp=parseFloat(document.getElementById('tp'+n).value);
    document.getElementById('rr'+n).textContent=tp&&d?'1:'+(Math.abs(tp-entry)/d).toFixed(1):'—';
  });
}

// ─── MODAL ───
async function openModal(){
  if(dllGuard()) return; // Daily Loss Limit check
  if(S.orderType==='ladder'){
    await openLadderModal(); return;
  }
  const size=document.getElementById('calcSize').textContent;
  if(size==='—'){notify('Imposta Risk e SL prima','err');return;}
  const entry=S.orderType==='market'?S.lastPrice:parseFloat(document.getElementById('entryVal').value);
  const sl=document.getElementById('slVal').value;
  const lev=document.getElementById('levVal').value;
  const margin=document.getElementById('calcMargin').textContent;
  const riskUsd=document.getElementById('cdRiskUsd').textContent;
  const slDist=document.getElementById('cdSlDist').textContent;
  let tpH='';
  if(S.tpEnabled) [1,2,3].forEach(n=>{
    const tp=document.getElementById('tp'+n).value;
    const en=document.getElementById('tp'+n+'en').checked;
    if(tp&&en) tpH+=`<div class="mrow"><span class="ml">TP${n}</span><span class="mv grn">$${tp}</span></div>`;
  });
  document.getElementById('modalRows').innerHTML=`
    <div class="mrow"><span class="ml">Symbol</span><span class="mv acc">${S.symbol}</span></div>
    <div class="mrow"><span class="ml">Direction</span><span class="mv" style="color:var(--${S.dir==='long'?'green':'red'})">${S.dir.toUpperCase()}</span></div>
    <div class="mrow"><span class="ml">Type</span><span class="mv">${S.orderType.toUpperCase()}</span></div>
    <div class="mrow"><span class="ml">Entry</span><span class="mv">$${fmtPrice(entry)}${S.orderType==='market'?' <span style="font-size:8px;color:var(--muted2)">(market)</span>':''}</span></div>
    <div class="mrow"><span class="ml">Leva</span><span class="mv">${lev}x</span></div>
    <div class="mdiv"></div>
    <div class="mrow"><span class="ml">Size</span><span class="mv acc">${size} USDT</span></div>
    <div class="mrow"><span class="ml">Margin</span><span class="mv">${margin}</span></div>
    <div class="mrow"><span class="ml">Stop Loss</span><span class="mv red">$${sl} <span style="font-size:8px;color:var(--muted2)">(${slDist})</span></span></div>
    <div class="mrow"><span class="ml">Max Risk</span><span class="mv red">${riskUsd}</span></div>
    <div class="mrow"><span class="ml">Fee est.</span><span class="mv" style="color:var(--muted2)">$${fmt(calcFeeUsd(parseFloat(size.replace(/,/g,"")), S.orderType))}</span></div>
    ${tpH}`;
  document.getElementById('modalBg').className='modal-bg open';
}
function closeModal(){ document.getElementById('modalBg').className='modal-bg'; }

async function openLadderModal(){
  if(dllGuard()) return; // Daily Loss Limit check
  const totalSize = document.getElementById('laddTotalSize').textContent;
  if(!totalSize || totalSize==='—'){notify('Imposta Range, Risk e SL prima','err');return;}
  const sl=parseFloat(document.getElementById('slVal').value);
  const lev=document.getElementById('levVal').value;
  const lev2=parseFloat(lev)||1;
  const totalRisk=document.getElementById('laddTotalRisk').textContent;
  const avgEntry=document.getElementById('laddAvgEntry').textContent;
  const n=LADDER.n;
  const riskRaw=parseFloat(document.getElementById('riskVal').value);
  const bal=S.balance||1000;
  const riskUsd=S.riskMode==='pct'?(bal*riskRaw/100):riskRaw;

  // Fetcha contract info per sapere minTradeNum e step prima ancora di aprire il modal
  const cInfo = await fetchContractInfo(S.symbol);
  const {pricePlace,sizeMultiplier,minTradeNum}=cInfo;

  const activeOrders=[];
  for(let i=0;i<n;i++){
    const o=LADDER.orders[i];
    if(o.enabled!==false&&o.price&&o.price>0) activeOrders.push({i,price:o.price});
  }
  if(!activeOrders.length){notify('Nessun ordine ladder con prezzo impostato','err');return;}

  const prices=activeOrders.map(o=>o.price);
  const manualPcts1=activeOrders.map(o=>o.manualPct);
  const weights=getLadderWeights(activeOrders.length,prices,manualPcts1.some(p=>p!=null)?manualPcts1.map(p=>p!=null?p:0):null);

  // Calcola per ogni ordine: size, contratti, se eseguibile
  let ordersHtml='';
  let executableCount=0;
  let skippedCount=0;
  let executableTotalSize=0;
  let executableTotalRisk=0;

  const orderDetails = activeOrders.map((o,j)=>{
    const w=weights[j]/100;
    const orderRisk=riskUsd*w;
    const slDist=Math.abs(o.price-sl);
    const slDistPct=slDist/o.price*100;
    const size=slDistPct>0?calcSizeWithFee(orderRisk,slDistPct,'ladder'):0;
    const rawContracts=size/o.price;
    const contracts=Math.floor(rawContracts/sizeMultiplier)*sizeMultiplier;
    const margin=size/lev2;
    const ok=contracts>=minTradeNum && size>0;
    return {o, j, w, orderRisk, size, contracts, margin, ok, pct:weights[j]};
  });

  orderDetails.forEach(d=>{
    if(d.ok){
      executableCount++;
      executableTotalSize+=d.size;
      executableTotalRisk+=d.orderRisk;
      ordersHtml+=`
        <div class="mrow">
          <span class="ml" style="color:${LADDER_COLORS[d.o.i]}">L${d.o.i+1} <span style="color:var(--muted2);font-size:8px">${d.pct.toFixed(1)}%</span></span>
          <span class="mv">
            <span style="color:var(--text)">$${fmtPrice(d.o.price)}</span>
            <span style="color:var(--muted2);font-size:9px"> → </span>
            <span style="color:var(--accent)">${fmt(d.size)} USDT</span>
            <span style="color:var(--muted2);font-size:8px"> (margin $${fmt(d.margin)})</span>
          </span>
        </div>`;
    } else {
      skippedCount++;
      // Motivo skip
      let reason='';
      if(d.size<=0) reason='SL coincide con entry';
      else if(d.contracts<minTradeNum){
        const needed=(minTradeNum*d.o.price).toFixed(2);
        reason=`size troppo piccola (min ~$${needed})`;
      }
      ordersHtml+=`
        <div class="mrow" style="opacity:.5">
          <span class="ml" style="color:${LADDER_COLORS[d.o.i]}">L${d.o.i+1} <span style="color:var(--yellow);font-size:8px">⚠ SKIP</span></span>
          <span class="mv" style="color:var(--muted2);font-size:9px">${reason}</span>
        </div>`;
    }
  });

  // Warning block se ci sono ordini saltati
  let warningHtml='';
  if(skippedCount>0 && executableCount>0){
    warningHtml=`
      <div style="background:var(--yellow-dim);border:1px solid var(--yellow);border-radius:5px;padding:7px 9px;margin:6px 0;font-size:9px;color:var(--yellow);line-height:1.5">
        ⚠ <strong>${skippedCount} ordine/i saltati</strong> — size troppo piccola per il balance disponibile.<br>
        Verranno inviati solo i <strong>${executableCount}</strong> ordini validi.<br>
        <span style="color:var(--muted2)">Aumenta il Risk%, la Leva, o usa un range più stretto.</span>
      </div>`;
  } else if(executableCount===0){
    warningHtml=`
      <div style="background:var(--red-dim);border:1px solid var(--red);border-radius:5px;padding:7px 9px;margin:6px 0;font-size:9px;color:var(--red);line-height:1.5">
        ✕ <strong>Nessun ordine eseguibile</strong> — tutte le size sono sotto il minimo di Bitget.<br>
        <span style="color:var(--muted2)">Aumenta il Risk%, la Leva, o riduci il numero di livelli.</span>
      </div>`;
    // Disabilita il bottone Confirm se non ci sono ordini eseguibili
    setTimeout(()=>{
      const btn=document.getElementById('modalConfirmBtn')||document.querySelector('.modal-btn.confirm');
      if(btn){ btn.disabled=true; btn.style.opacity='0.4'; btn.style.cursor='not-allowed'; }
    },50);
  }

  // Se tutti ok, re-abilita il bottone
  if(executableCount>0){
    setTimeout(()=>{
      const btn=document.getElementById('modalConfirmBtn')||document.querySelector('.modal-btn.confirm');
      if(btn){ btn.disabled=false; btn.style.opacity=''; btn.style.cursor=''; }
    },50);
  }

  let tpH='';
  if(S.tpEnabled) [1,2,3].forEach(nn=>{
    const tp=document.getElementById('tp'+nn).value;
    const en=document.getElementById('tp'+nn+'en').checked;
    if(tp&&en) tpH+=`<div class="mrow"><span class="ml">TP${nn}</span><span class="mv grn">$${tp}</span></div>`;
  });

  document.getElementById('modalRows').innerHTML=`
    <div class="mrow"><span class="ml">Symbol</span><span class="mv acc">${S.symbol}</span></div>
    <div class="mrow"><span class="ml">Direction</span><span class="mv" style="color:var(--${S.dir==='long'?'green':'red'})">${S.dir.toUpperCase()}</span></div>
    <div class="mrow"><span class="ml">Mode</span><span class="mv">LADDER — ${executableCount}/${activeOrders.length} ordini</span></div>
    <div class="mrow"><span class="ml">Entry avg</span><span class="mv">${avgEntry}</span></div>
    <div class="mrow"><span class="ml">Leva</span><span class="mv">${lev}x</span></div>
    <div class="mdiv"></div>
    ${ordersHtml}
    ${warningHtml}
    <div class="mdiv"></div>
    <div class="mrow"><span class="ml">Size effettiva</span><span class="mv acc">${fmt(executableTotalSize)} USDT</span></div>
    <div class="mrow"><span class="ml">Stop Loss</span><span class="mv red">$${sl}</span></div>
    <div class="mrow"><span class="ml">Risk effettivo</span><span class="mv red">$${fmt(executableTotalRisk)}</span></div>
    <div class="mrow"><span class="ml">Fee est.</span><span class="mv" style="color:var(--muted2)">$${fmt(calcFeeUsd(executableTotalSize, 'ladder'))}</span></div>
    ${tpH}`;
  document.getElementById('modalBg').className='modal-bg open';
}

// ─── FETCH CONTRACT INFO (tick size + size precision) ───
// Mette in cache per simbolo per non rifetchare ogni volta
const _contractInfoCache = {};
async function fetchContractInfo(symbol){
  if(_contractInfoCache[symbol]) return _contractInfoCache[symbol];
  const isBingx = window._activeExchange === 'bingx';
  const isWeex  = window._activeExchange === 'weex';
  const isBybit = window._activeExchange === 'bybit' || window._activeExchange === 'bybit_demo';
  if (isBingx) {
    const info = await fetchBingxContractInfo(symbol);
    _contractInfoCache[symbol] = info;
    return info;
  }
  if (isWeex) {
    const info = await fetchWeexContractInfo(symbol);
    _contractInfoCache[symbol] = info;
    return info;
  }
  if (isBybit) {
    const info = await fetchBybitContractInfo(symbol);
    _contractInfoCache[symbol] = info;
    return info;
  }
  try {
    const url = `https://api.bitget.com/api/v2/mix/market/contracts?symbol=${symbol}&productType=USDT-FUTURES`;
    const res = await fetch(url);
    const json = await res.json();
    const data = json?.data?.[0];
    if(!data) throw new Error('No contract info');
    const info = {
      pricePlace:    parseInt(data.pricePlace    ?? 2),   // decimali del prezzo
      sizeMultiplier: parseFloat(data.sizeMultiplier ?? 1), // step size contratti
      minTradeNum:   parseFloat(data.minTradeNum ?? 0.001),
    };
    _contractInfoCache[symbol] = info;
    return info;
  } catch(e){
    console.warn('fetchContractInfo fallback:', e.message);
    // fallback generico sicuro
    return { pricePlace: 4, sizeMultiplier: 0.001, minTradeNum: 0.001 };
  }
}

// Arrotonda un prezzo al tick size corretto del simbolo
function roundToTick(price, pricePlace){
  const factor = Math.pow(10, pricePlace);
  return Math.round(price * factor) / factor;
}

// Arrotonda la size al multiplo corretto di sizeMultiplier
function roundToSizeStep(size, step){
  if(!step || step <= 0) return size;
  return Math.floor(size / step) * step;
}

async function executeOrder(){
  closeModal();
  if(S.orderType==='ladder'){
    await executeLadderOrders(); return;
  }
  const isBingx = window._activeExchange === 'bingx';
  const isWeex  = window._activeExchange === 'weex';
  const isBybit = window._activeExchange === 'bybit' || window._activeExchange === 'bybit_demo';

  const entry   = S.orderType==='market' ? null : parseFloat(document.getElementById('entryVal').value);
  const sl      = parseFloat(document.getElementById('slVal').value);
  const size    = document.getElementById('calcSize').textContent;
  const lev     = document.getElementById('levVal').value;
  const tpList  = [];
  if(S.tpEnabled){
    [1,2,3].forEach(n=>{
      const v=parseFloat(document.getElementById('tp'+n).value);
      const en=document.getElementById('tp'+n+'en').checked;
      if(v&&en) tpList.push(v);
    });
  }

  const sizeUsdt   = parseFloat(size.replace(/,/g,''));
  const entryPrice = S.orderType==='market' ? S.lastPrice : entry;
  if (!entryPrice || entryPrice <= 0) { notify('Prezzo entry non disponibile','err'); return; }

  notify('Invio ordine...','');

  const cInfo = await fetchContractInfo(S.symbol);
  const { pricePlace, sizeMultiplier, minTradeNum } = cInfo;
  const fmtPrice_ = (p) => roundToTick(p, pricePlace).toFixed(pricePlace);

  const rawContracts = sizeUsdt / entryPrice;
  const contracts    = roundToSizeStep(rawContracts, sizeMultiplier);
  if (contracts < minTradeNum) { notify('Size troppo piccola per questo simbolo','err'); return; }
  const contractStr  = contracts.toFixed(String(sizeMultiplier).split('.')[1]?.length ?? 3);

  if (isBingx) {
    // ─── BINGX ORDER ───
    const bsym = toBingxSym(S.symbol);
    const posSide = S.dir === 'long' ? 'LONG' : 'SHORT';
    try {
      // BingX Hedge Mode richiede due chiamate separate (LONG e SHORT).
      // "BOTH" è valido solo in One-way mode ma causa errore in Hedge Mode.
      // Facciamo entrambe e ignoriamo errori non critici.
      const levInt = parseInt(lev);
      const levResults = await Promise.allSettled([
        window._bingxRequest('/openApi/swap/v2/trade/leverage', {}, {
          method: 'POST',
          body: JSON.stringify({ symbol: bsym, side: 'LONG', leverage: levInt }),
        }),
        window._bingxRequest('/openApi/swap/v2/trade/leverage', {}, {
          method: 'POST',
          body: JSON.stringify({ symbol: bsym, side: 'SHORT', leverage: levInt }),
        }),
      ]);
      console.log('[BingX LEV] LONG:', levResults[0].status, levResults[0].value || levResults[0].reason?.message);
      console.log('[BingX LEV] SHORT:', levResults[1].status, levResults[1].value || levResults[1].reason?.message);
    } catch(e){ console.warn('bingx set-leverage:', e.message); }
    try {
      const orderBody = {
        symbol:       bsym,
        side:         S.dir === 'long' ? 'BUY' : 'SELL',
        positionSide: posSide,
        type:         S.orderType === 'market' ? 'MARKET' : 'LIMIT',
        quantity:     contractStr,
        ...(S.orderType !== 'market' ? { price: fmtPrice_(entry) } : {}),
      };
      // NOTA: stopLoss/takeProfit NON vengono inclusi nell'ordine principale
      // perché URLSearchParams non serializza correttamente le stringhe JSON.
      // Vengono piazzati come ordini separati dopo l'apertura della posizione.
      console.log('[BingX ORDER] body inviato:', JSON.stringify(orderBody, null, 2));
      console.log('[BingX ORDER] query string:', new URLSearchParams(orderBody).toString());
      const orderResp = await window._bingxRequest('/openApi/swap/v2/trade/order', {}, { method:'POST', body:JSON.stringify(orderBody) });
      console.log('[BingX ORDER] risposta completa:', JSON.stringify(orderResp, null, 2));

      // Piazza SL e TP come ordini separati
      const orderId = orderResp?.data?.order?.orderId;
      if (sl && sl > 0) {
        try {
          await window._bingxRequest('/openApi/swap/v2/trade/order', {}, {
            method: 'POST',
            body: JSON.stringify({
              symbol: bsym, side: S.dir === 'long' ? 'SELL' : 'BUY',
              positionSide: posSide, type: 'STOP_MARKET',
              quantity: contractStr, stopPrice: fmtPrice_(sl),
              workingType: 'MARK_PRICE',
            }),
          });
          console.log('[BingX SL] piazzato a', fmtPrice_(sl));
        } catch(e) { console.warn('[BingX SL] errore:', e.message); }
      }
      if (tpList.length > 0) {
        try {
          await window._bingxRequest('/openApi/swap/v2/trade/order', {}, {
            method: 'POST',
            body: JSON.stringify({
              symbol: bsym, side: S.dir === 'long' ? 'SELL' : 'BUY',
              positionSide: posSide, type: 'TAKE_PROFIT_MARKET',
              quantity: contractStr, stopPrice: fmtPrice_(tpList[0]),
              workingType: 'MARK_PRICE',
            }),
          });
          console.log('[BingX TP] piazzato a', fmtPrice_(tpList[0]));
        } catch(e) { console.warn('[BingX TP] errore:', e.message); }
      }

      notify('✓ Ordine inviato su BingX!','ok');
      clearAll();
      setTimeout(()=>window.refreshAccount(), 2000);
    } catch(e){
      notify('✗ Errore ordine: '+e.message,'err');
      console.error('[BingX ORDER] errore:', e.message, e);
    }

  } else if (isWeex) {
    // ─── WEEX ORDER ───
    try {
      await window._weexRequest('/capi/v3/account/leverage', {}, {
        method: 'POST',
        body: JSON.stringify({ symbol: S.symbol, leverage: lev }),
      });
    } catch(e){ console.warn('weex set-leverage:', e.message); }

    try {
      const positionSide = S.dir === 'long' ? 'LONG' : 'SHORT';
      const orderBody = {
        symbol:         S.symbol,
        side:           S.dir === 'long' ? 'BUY' : 'SELL',
        positionSide,
        type:           S.orderType === 'market' ? 'MARKET' : 'LIMIT',
        quantity:       contractStr,
        newClientOrderId: 'rf_'+Date.now(),
        ...(S.orderType !== 'market' ? { price: fmtPrice_(entry), timeInForce: 'GTC' } : {}),
      };
      if (sl && sl > 0)      orderBody.slTriggerPrice = fmtPrice_(sl);
      if (tpList.length > 0) orderBody.tpTriggerPrice = fmtPrice_(tpList[0]);

      await window._weexRequest('/capi/v3/order', {}, { method:'POST', body:JSON.stringify(orderBody) });
      notify('✓ Ordine inviato su Weex!','ok');
      clearAll();
      setTimeout(()=>window.refreshAccount(), 2000);
    } catch(e){
      notify('✗ Errore ordine: '+e.message,'err');
      console.error('executeOrder weex error:', e);
    }

  } else if (isBybit) {
    // ─── BYBIT ORDER ───
    try {
      await window._bybitRequest('/v5/position/set-leverage', {}, {
        method: 'POST',
        body: JSON.stringify({category:'linear', symbol:S.symbol, buyLeverage:lev, sellLeverage:lev}),
      });
    } catch(e){ console.warn('bybit set-leverage:', e.message); }

    try {
      const orderBody = {
        category:  'linear',
        symbol:    S.symbol,
        side:      S.dir === 'long' ? 'Buy' : 'Sell',
        orderType: S.orderType === 'market' ? 'Market' : 'Limit',
        qty:       contractStr,
        ...(S.orderType !== 'market' ? {price: fmtPrice_(entry)} : {}),
        timeInForce: S.orderType === 'market' ? 'IOC' : 'GTC',
        reduceOnly:  false,
        closeOnTrigger: false,
        orderLinkId: 'rf_'+Date.now(),
      };
      if (sl && sl > 0)          orderBody.stopLoss   = fmtPrice_(sl);
      if (tpList.length > 0)     orderBody.takeProfit = fmtPrice_(tpList[0]);
      if (sl || tpList.length>0) orderBody.tpslMode   = 'Full';

      await window._bybitRequest('/v5/order/create', {}, {method:'POST', body:JSON.stringify(orderBody)});
      notify('✓ Ordine inviato su Bybit!','ok');
      clearAll();
      setTimeout(()=>window.refreshAccount(), 2000);
    } catch(e){
      notify('✗ Errore ordine: '+e.message,'err');
      console.error('executeOrder bybit error:', e);
    }

  } else {
    // ─── BITGET ORDER ───
    const side      = S.dir==='long' ? 'buy' : 'sell';
    const tradeSide = 'open';
    const orderType = S.orderType==='market' ? 'market' : 'limit';

    try {
      await window._bitgetRequest('/api/v2/mix/account/set-margin-mode',{},{
        method:'POST',
        body: JSON.stringify({symbol:S.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',marginMode:S.marginMode})
      });
    } catch(e){ console.warn('set-margin-mode error:',e.message); }

    try {
      await window._bitgetRequest('/api/v2/mix/account/set-leverage',{},{
        method:'POST',
        body: JSON.stringify({symbol:S.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',leverage:lev,holdSide:S.dir==='long'?'long':'short'})
      });
    } catch(e){ console.warn('set-leverage error:',e.message); }

    try {
      const orderBody = {
        symbol: S.symbol, productType:'USDT-FUTURES',
        marginMode:S.marginMode, marginCoin:'USDT',
        size:contractStr, side, tradeSide, orderType,
        ...(orderType==='limit' ? {price: fmtPrice_(entry)} : {}),
        clientOid:'rf_'+Date.now(),
      };
      if (sl)              orderBody.presetStopLossPrice   = fmtPrice_(sl);
      if (tpList.length>0) orderBody.presetTakeProfitPrice = fmtPrice_(tpList[0]);

      await window._bitgetRequest('/api/v2/mix/order/place-order',{},{method:'POST',body:JSON.stringify(orderBody)});
      notify('✓ Ordine inviato su Bitget!','ok');
      clearAll();
      setTimeout(()=>window.refreshAccount(), 2000);
    } catch(e){
      notify('✗ Errore ordine: '+e.message,'err');
      console.error('executeOrder error:', e);
    }
  }
}
document.getElementById('modalBg').addEventListener('click',e=>{ if(e.target===document.getElementById('modalBg')) closeModal(); });

async function executeLadderOrders(){
  const sl      = parseFloat(document.getElementById('slVal').value);
  const lev     = document.getElementById('levVal').value;
  const riskRaw = parseFloat(document.getElementById('riskVal').value);
  const bal     = S.balance||1000;
  const lev2    = parseFloat(lev)||1;
  const riskUsd = S.riskMode==='pct'?(bal*riskRaw/100):riskRaw;
  const n       = LADDER.n;

  const activeOrders=[];
  for(let i=0;i<n;i++){
    const o=LADDER.orders[i];
    if(o.enabled!==false&&o.price&&o.price>0) activeOrders.push({i,price:o.price});
  }
  if(!activeOrders.length){notify('Nessun ordine ladder valido','err');return;}

  const prices=activeOrders.map(o=>o.price);
  const manualPcts2=activeOrders.map(o=>o.manualPct);
  const weights=getLadderWeights(activeOrders.length,prices,manualPcts2.some(p=>p!=null)?manualPcts2.map(p=>p!=null?p:0):null);
  const isBingx  = window._activeExchange === 'bingx';
  const isWeex   = window._activeExchange === 'weex';
  const isBybit  = window._activeExchange === 'bybit' || window._activeExchange === 'bybit_demo';
  const bgSide   = S.dir==='long' ? 'buy' : 'sell'; // bitget
  const byitSide = S.dir==='long' ? 'Buy' : 'Sell'; // bybit
  const tradeSide = 'open';

  notify('Invio '+activeOrders.length+' ordini ladder...','');
  const cInfo = await fetchContractInfo(S.symbol);
  const {pricePlace,sizeMultiplier,minTradeNum}=cInfo;
  const fmtBP=(p)=>roundToTick(p,pricePlace).toFixed(pricePlace);

  try{
    if (isBingx) {
      const bsym = toBingxSym(S.symbol);
      const posSide = S.dir==='long'?'LONG':'SHORT';
      try {
        await window._bingxRequest('/openApi/swap/v2/trade/leverage',{},{
          method:'POST',
          body:JSON.stringify({symbol:bsym,side:'BOTH',leverage:parseInt(lev)})
        });
      } catch(e){ console.warn('bingx set-leverage ladder:', e.message); }
    } else if (isWeex) {
      try {
        await window._weexRequest('/capi/v3/account/leverage',{},{
          method:'POST',
          body:JSON.stringify({symbol:S.symbol,leverage:lev})
        });
      } catch(e){ console.warn('weex set-leverage ladder:', e.message); }
    } else if (isBybit) {
      try {
        await window._bybitRequest('/v5/position/set-leverage',{},{
          method:'POST',
          body:JSON.stringify({category:'linear',symbol:S.symbol,buyLeverage:lev,sellLeverage:lev})
        });
      } catch(e){ console.warn('bybit set-leverage ladder:', e.message); }
    } else {
      await window._bitgetRequest('/api/v2/mix/account/set-margin-mode',{},{
        method:'POST',
        body:JSON.stringify({symbol:S.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',marginMode:S.marginMode})
      });
      await window._bitgetRequest('/api/v2/mix/account/set-leverage',{},{
        method:'POST',
        body:JSON.stringify({symbol:S.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',leverage:lev,holdSide:S.dir==='long'?'long':'short'})
      });
    }

    let placed=0, skipped=0;
    const skippedDetails=[];
    for(let j=0;j<activeOrders.length;j++){
      const o=activeOrders[j];
      const w=weights[j]/100;
      const orderRisk=riskUsd*w;
      const slDist=Math.abs(o.price-sl);
      const slDistPct=slDist/o.price*100;
      const size=slDistPct>0?calcSizeWithFee(orderRisk,slDistPct,'ladder'):0;
      const rawContracts=size/o.price;
      const contracts=Math.floor(rawContracts/sizeMultiplier)*sizeMultiplier;
      if(contracts<minTradeNum){
        skipped++;
        const needed=(minTradeNum*o.price).toFixed(2);
        skippedDetails.push(`L${o.i+1}: size troppo piccola (min ~$${needed})`);
        continue;
      }
      const contractStr=contracts.toFixed(String(sizeMultiplier).split('.')[1]?.length??3);

      if (isBingx) {
        const bsym = toBingxSym(S.symbol);
        const posSide = S.dir==='long'?'LONG':'SHORT';
        const ob={symbol:bsym,side:S.dir==='long'?'BUY':'SELL',positionSide:posSide,
          type:'LIMIT',quantity:contractStr,price:fmtBP(o.price)};
        if(sl) ob.stopLoss=JSON.stringify({type:'STOP_MARKET',stopPrice:fmtBP(sl),price:'0',workingType:'MARK_PRICE'});
        await window._bingxRequest('/openApi/swap/v2/trade/order',{},{method:'POST',body:JSON.stringify(ob)});
      } else if (isWeex) {
        const ob={symbol:S.symbol,side:S.dir==='long'?'BUY':'SELL',positionSide:S.dir==='long'?'LONG':'SHORT',
          type:'LIMIT',quantity:contractStr,price:fmtBP(o.price),timeInForce:'GTC',
          newClientOrderId:'rf_ladd_'+Date.now()+'_'+j};
        if(sl) ob.slTriggerPrice=fmtBP(sl);
        await window._weexRequest('/capi/v3/order',{},{method:'POST',body:JSON.stringify(ob)});
      } else if (isBybit) {
        const ob={category:'linear',symbol:S.symbol,side:byitSide,orderType:'Limit',
          qty:contractStr,price:fmtBP(o.price),timeInForce:'GTC',reduceOnly:false,
          orderLinkId:'rf_ladd_'+Date.now()+'_'+j};
        if(sl) ob.stopLoss=fmtBP(sl);
        await window._bybitRequest('/v5/order/create',{},{method:'POST',body:JSON.stringify(ob)});
      } else {
        const ob={symbol:S.symbol,productType:'USDT-FUTURES',marginMode:S.marginMode,marginCoin:'USDT',
          size:contractStr,side:bgSide,tradeSide,orderType:'limit',price:fmtBP(o.price),
          clientOid:'rf_ladd_'+Date.now()+'_'+j};
        if(sl) ob.presetStopLossPrice=fmtBP(sl);
        await window._bitgetRequest('/api/v2/mix/order/place-order',{},{method:'POST',body:JSON.stringify(ob)});
      }
      placed++;
    }
    if(placed===0){
      notify('✗ Nessun ordine inviato — size troppo piccole','err');
      console.warn('Ladder skipped all:', skippedDetails);
      return;
    }
    let msg = '✓ '+placed+' ordini ladder inviati!';
    if(skipped>0) msg += ' ('+skipped+' saltati — size sotto min)';
    notify(msg, skipped>0?'':'ok');
    if(skipped>0) console.warn('Ordini ladder saltati:\n'+skippedDetails.join('\n'));
    clearAll();
    setTimeout(()=>window.refreshAccount(),2000);
  }catch(e){
    notify('✗ Errore ladder: '+e.message,'err');
    console.error('executeLadderOrders error:',e);
  }
}

// ─── CLEAR ───
function clearAll(){
  ['slVal','tp1','tp2','tp3'].forEach(id=>document.getElementById(id).value='');
  if(S.orderType!=='market') document.getElementById('entryVal').value='';
  Object.keys(DRAG_PRICES).forEach(t=>{
    if(t==='entry'&&S.orderType==='market') return;
    DRAG_PRICES[t]=null;
    if(!t.startsWith('ld')) removeChartLine(t);
  });
  // Clear ladder
  LADDER.orders.forEach((o,i)=>{
    if(o.priceLine){ try{candleSeries.removePriceLine(o.priceLine);}catch(_){} o.priceLine=null; }
    o.price=null;
    o.manualPct=null;
    const el=document.getElementById('ladd-price-'+i); if(el) el.value='';
  });
  const top=document.getElementById('ladderTop'); if(top) top.value='';
  const bot=document.getElementById('ladderBottom'); if(bot) bot.value='';
  document.getElementById('chartCalcBtn').classList.remove('visible');
  slpRenderUI(); // aggiorna stato toggle (potrebbe essersi liberato)
  drawCanvas(); calc();
}

// ═══════════════════════════════════════════════════════════════
// POSITION SL LINES — linee SL draggabili per posizioni aperte
// ═══════════════════════════════════════════════════════════════

// Registry: posIdx → { price, side, symbol, priceLine }
window._posSLLines = {};

// Chiamato quando renderBitgetPositions popola _positions
// Crea/aggiorna le linee SL sul grafico per ogni posizione
window.refreshPosSLLines = function(positions, tpslMap) {
  // Rimuovi price lines precedenti
  Object.values(window._posSLLines).forEach(l => {
    if (l.priceLine) { try { candleSeries.removePriceLine(l.priceLine); } catch(_){} }
  });
  window._posSLLines = {};

  const map = tpslMap || window._tpslOrdersMap || {};

  positions.forEach((p, idx) => {
    const side   = (p.holdSide || 'long').toLowerCase();
    const posSym = (p.symbol || '').replace(/_?(UMCBL|DMCBL)/gi, '').replace(/USDT$/, '');
    const curSym = (S.symbol || '').replace(/USDT$/, '');

    // Cerca SL: prima negli ordini TPSL (piu affidabile), poi nel campo grezzo
    const tpslKey  = (p.symbol || '').replace(/_?(UMCBL|DMCBL)/gi, '') + '_' + side;
    const tpslList = map[tpslKey] || [];
    const slOrder  = tpslList.find(o => o.type === 'sl');
    const slRaw    = parseFloat(p.stopLoss || p.stopLossPrice || p.presetStopLossPrice || 0);
    const sl       = slOrder ? slOrder.price : slRaw;

    window._posSLLines[idx] = {
      price: sl > 0 ? sl : null,
      _refSL: sl > 0 ? sl : null,  // riferimento SL Shield (immutabile per questa posizione)
      side, symbol: p.symbol,
      orderId: slOrder ? slOrder.orderId : (p.stopLossId || ''),
      idx, priceLine: null,
    };

    // Crea priceLine solo se il simbolo corrisponde al grafico attivo
    if (!sl || sl <= 0 || posSym !== curSym) return;

    const priceLine = candleSeries.createPriceLine({
      price: sl, color: '#ff2d4a', lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true, title: ` SL#${idx+1}`,
    });
    window._posSLLines[idx].priceLine = priceLine;

    const inp = document.getElementById('pos-sl-input-'+idx);
    if (inp) inp.value = fmtPrice(sl);
  });

  drawCanvas();
  slpRenderUI(); // aggiorna lock stato se ci sono posizioni
};

// Sincronizza la linea sul grafico quando l'utente digita nel campo
window.syncPosSlLine = function(idx) {
  const inp = document.getElementById('pos-sl-input-'+idx);
  if (!inp) return;
  const price = parseFloat(inp.value);
  const entry = window._posSLLines[idx];
  if (!entry) return;

  // ── check: SL non può superare l'entry (in posizione) ──
  if (price && price > 0) {
    const side = entry.side || 'long';
    const pos  = window._positions && window._positions[idx];
    const posEntry = parseFloat(pos ? (pos.openPriceAvg || pos.averageOpenPrice || pos.openAvgPrice || 0) : 0);
    if (posEntry > 0) {
      if (side === 'long'  && price >= posEntry) { inp.value = fmtPrice(entry.price || entry._refSL || ''); return; }
      if (side === 'short' && price <= posEntry) { inp.value = fmtPrice(entry.price || entry._refSL || ''); return; }
    }
  }
  // ── SL Shield check ──
  if (price && price > 0 && entry._refSL) {
    const side = entry.side || 'long';
    if (!slpCheck(price, entry._refSL, side)) {
      inp.value = fmtPrice(entry._refSL);
      return;
    }
  }

  if (entry.priceLine) {
    try { candleSeries.removePriceLine(entry.priceLine); } catch(_){}
  }
  if (price && price > 0) {
    entry.priceLine = candleSeries.createPriceLine({
      price, color:'#ff2d4a', lineWidth:1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible:true, title:` SL#${idx+1}`,
    });
    entry.price = price;
  }
  drawCanvas();
};

// Drag linee SL/TP posizioni rimosso — modifica manuale via input nel pannello

// ═══════════════════════════════════════════════════════════════
// POSITION LINE DRAG — drag handle per SL e TP delle posizioni
// ═══════════════════════════════════════════════════════════════

// Registry drag attivo per pos lines: { type:'sl'|'tp', idx, tpN }
window._posDragState = null;

// Grab zone: entro quanti px dalla linea si attiva il drag
const POS_GRAB_PX = 14;

// Trova linea SL/TP di posizione più vicina a clientY
function posLineAtY(clientY) {
  const rect = chartWrap.getBoundingClientRect();
  const y = clientY - rect.top;
  let best = null, bestD = POS_GRAB_PX;

  // SL lines
  if (window._posSLLines) {
    Object.entries(window._posSLLines).forEach(([idxStr, entry]) => {
      if (!entry || !entry.price) return;
      // Solo simbolo corrente
      const posSym = (entry.symbol || '').replace(/_?(UMCBL|DMCBL)/gi,'').replace(/USDT$/,'');
      const curSym = (S.symbol || '').replace(/USDT$/,'');
      if (posSym !== curSym) return;
      const ly = candleSeries.priceToCoordinate(entry.price);
      if (ly === null) return;
      const d = Math.abs(y - ly);
      if (d < bestD) { bestD = d; best = { type: 'sl', idx: parseInt(idxStr) }; }
    });
  }

  // TP lines
  if (window._posTPLines) {
    Object.entries(window._posTPLines).forEach(([key, entry]) => {
      if (!entry || !entry.price) return;
      const posSym = (entry.symbol || '').replace(/_?(UMCBL|DMCBL)/gi,'').replace(/USDT$/,'');
      const curSym = (S.symbol || '').replace(/USDT$/,'');
      if (posSym !== curSym) return;
      const ly = candleSeries.priceToCoordinate(entry.price);
      if (ly === null) return;
      const d = Math.abs(y - ly);
      if (d < bestD) { bestD = d; best = { type: 'tp', idx: entry.posIdx, tpN: entry.tpN, key }; }
    });
  }

  return best;
}

// ═══════════════════════════════════════════════════════════════
// POSITION TP LINES — linee TP draggabili per posizioni aperte
// ═══════════════════════════════════════════════════════════════

// Registry: key `${posIdx}_${tpN}` → { price, orderId, posIdx, tpN, priceLine }
window._posTPLines = {};

const TP_COLORS = ['#00d17a', '#00ffcc', '#3dddff'];

window.refreshPosTPLines = function(tpOrders, positions, tpslMap) {
  // Rimuovi linee precedenti
  Object.values(window._posTPLines).forEach(l => {
    if (l.priceLine) { try { candleSeries.removePriceLine(l.priceLine); } catch(_){} }
  });
  window._posTPLines = {};

  const map = tpslMap || window._tpslOrdersMap || {};

  positions.forEach((p, posIdx) => {
    const side   = (p.holdSide || 'long').toLowerCase();
    const posSym = (p.symbol || '').replace(/_?(UMCBL|DMCBL)/gi, '').replace(/USDT$/, '');
    const curSym = (S.symbol || '').replace(/USDT$/, '');

    // Cerca TP: prima negli ordini TPSL, poi nel campo grezzo
    const tpslKey  = (p.symbol || '').replace(/_?(UMCBL|DMCBL)/gi, '') + '_' + side;
    const tpslList = map[tpslKey] || [];
    const tpOrders2 = tpslList.filter(o => o.type === 'tp').sort((a,b) => a.price - b.price);
    const tpRaw    = parseFloat(p.takeProfit || p.takeProfitPrice || p.presetTakeProfitPrice || 0);

    // Se ci sono ordini TP dal map, usa quelli (supporta multipli TP1/TP2/TP3)
    const tpPrices = tpOrders2.length > 0
      ? tpOrders2.map(o => o.price)
      : (tpRaw > 0 ? [tpRaw] : []);

    tpPrices.forEach((tp, tpIdx) => {
      const tpN  = tpIdx + 1;
      const color = TP_COLORS[tpIdx] || TP_COLORS[0];
      const key  = `${posIdx}_${tpN}`;
      const ord  = tpOrders2[tpIdx];

      window._posTPLines[key] = {
        price: tp,
        orderId: ord ? ord.orderId : (p.takeProfitId || ''),
        posIdx, tpN, priceLine: null, color,
        symbol: p.symbol, holdSide: side,
        size: (ord && ord.size) ? String(ord.size) : (p.total || p.available || '0'),
      };

      // Crea priceLine solo se simbolo corrisponde al grafico attivo
      if (posSym !== curSym) return;

      const priceLine = candleSeries.createPriceLine({
        price: tp, color, lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true, title: ` TP${tpN}#${posIdx+1}`,
      });
      window._posTPLines[key].priceLine = priceLine;

      const inp = document.getElementById(`pos-tp${tpN}-input-${posIdx}`);
      if (inp) inp.value = fmtPrice(tp);

      const badge = document.getElementById(`pos-tp${tpN}-badge-${posIdx}`);
      if (badge) { badge.textContent = '$'+fmtPrice(tp); badge.className = 'pos-tp-badge'; }
    });
  });

  drawCanvas();
};

window.syncPosTpLine = function(posIdx, tpN) {
  const inp = document.getElementById(`pos-tp${tpN}-input-${posIdx}`);
  if (!inp) return;
  const price = parseFloat(inp.value);
  const key = `${posIdx}_${tpN}`;
  const entry = window._posTPLines[key];
  if (!entry) return;

  if (entry.priceLine) { try { candleSeries.removePriceLine(entry.priceLine); } catch(_){} }
  if (price && price > 0) {
    entry.priceLine = candleSeries.createPriceLine({
      price, color: entry.color, lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true, title: ` TP${tpN}#${posIdx+1}`,
    });
    entry.price = price;
  }
  drawCanvas();
};

// TP drag gestito dal sistema posLineAtY sopra

// ─── EXPORT ───

// ─── ACCOUNT (reale via Bitget, chiamato dopo login) ───
function loadAccount(){
  // mostra dash vuota — verrà popolata da fetchBitgetDashboard dopo login
  document.getElementById('accBalance').textContent='—';
  document.getElementById('accAvail').textContent='—';
  document.getElementById('accPnl').textContent='—';
  document.getElementById('accMargin').textContent='—';
  document.getElementById('tbBalance').textContent='—';
  document.getElementById('tbPnl').textContent='—';
  document.getElementById('posCount').textContent='0';
  document.getElementById('posList').innerHTML='<div class="no-pos">Connetti Bitget per vedere le posizioni</div>';
}
// refreshAccount è ridefinita nel blocco Firebase dopo login

// ─── UTILS ───
function notify(msg,type){
  const el=document.getElementById('notif');
  el.textContent=msg;
  el.className='notif show'+(type?' '+type:'');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.className='notif',2200);
}
function fmt(n){ return parseFloat(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtPrice(p){
  if(!p) return '0.00';
  if(p>10000) return p.toFixed(1);
  if(p>1000)  return p.toFixed(2);
  if(p>100)   return p.toFixed(3);
  if(p>1)     return p.toFixed(4);
  return p.toFixed(6);
}
function getPDec(p){
  if(p>10000) return 1; if(p>1000) return 2; if(p>100) return 3; if(p>1) return 4; return 6;
}

// ─── GOTO PRICE ───
function gotoPrice(){
  chart.priceScale('right').applyOptions({ autoScale: true });
  const _ls = chart.timeScale().getVisibleLogicalRange();
  const _bars = _ls ? Math.round(_ls.to - _ls.from) : 100;
  chart.timeScale().scrollToRealTime();
  requestAnimationFrame(() => {
    chart.priceScale('right').applyOptions({ autoScale: true });
  });
}

// ─── PANEL RESIZE ───
(function(){
  const handle = document.getElementById('panelResize');
  const panel  = document.getElementById('panel');
  if (!handle || !panel) return;
  const MIN = 220, MAX = 520;
  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = startX - e.clientX;
    const newW  = Math.min(MAX, Math.max(MIN, startW + delta));
    panel.style.width = newW + 'px';
    document.documentElement.style.setProperty('--panel', newW + 'px');
    // Forza il chart a ridimensionarsi in tempo reale
    if (typeof chart !== 'undefined') {
      const chartEl = document.getElementById('chart');
      if (chartEl) chart.resize(chartEl.offsetWidth, chartEl.offsetHeight);
    }
    if (typeof resizeCanvas === 'function') resizeCanvas();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    try { localStorage.setItem('rf_panel_w', panel.offsetWidth); } catch(_){}
    if (typeof chart !== 'undefined') {
      const chartEl = document.getElementById('chart');
      if (chartEl) chart.resize(chartEl.offsetWidth, chartEl.offsetHeight);
    }
    if (typeof resizeCanvas === 'function') resizeCanvas();
  });

  // Ripristina larghezza salvata
  try {
    const saved = parseInt(localStorage.getItem('rf_panel_w'));
    if (saved >= MIN && saved <= MAX) {
      panel.style.width = saved + 'px';
      document.documentElement.style.setProperty('--panel', saved + 'px');
      setTimeout(() => {
        if (typeof chart !== 'undefined') {
          const chartEl = document.getElementById('chart');
          if (chartEl) chart.resize(chartEl.offsetWidth, chartEl.offsetHeight);
        }
        if (typeof resizeCanvas === 'function') resizeCanvas();
      }, 50);
    }
  } catch(_){}
})();

// ─── INIT ───
loadAccount();
updateLevPresets();
setOType('market');
resizeCanvas();
// Init ladder orders array con 4 slots vuoti
for(let i=LADDER.orders.length;i<4;i++) LADDER.orders.push({price:null,enabled:true,priceLine:null});
// Imposta bottone 4 come attivo di default
document.querySelectorAll('.ladder-n').forEach(el=>{
  el.className='lev-p ladder-n'+(parseInt(el.textContent)===4?' active':'');
});
// loadCandles viene chiamato dopo il login

// ─── MONEYSHOT ───
window.openMoneyShot = function(idx) {
  // Get position from _positions (exposed below after Firebase init)
  const p = window._getPosition ? window._getPosition(idx) : null;
  if (!p) { notify('Posizione non trovata','err'); return; }
  drawMoneyShotCanvas(p);
  document.getElementById('moneyShotModal').classList.add('open');
};
window.closeMoneyShotModal = function() {
  document.getElementById('moneyShotModal').classList.remove('open');
};
window.msSave = function() {
  const c = document.getElementById('msShotCanvas');
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = 'moneyshot_'+Date.now()+'.png';
  a.click();
};

function drawMoneyShotCanvas(p) {
  const canvas = document.getElementById('msShotCanvas');
  const W = 520, H = 780;
  canvas.width = W; canvas.height = H;
  const cx = canvas.getContext('2d');

  const sym    = (p.symbol||'').replace(/_?UMCBL|_?DMCBL/g,'');
  const base   = sym.replace('USDT','').replace('USD','');
  const side   = (p.holdSide||'long').toLowerCase();
  const upnl   = parseFloat(p.unrealizedPL||p.unrealizedProfitLoss||p.unrealizedPnl||0);
  const entry  = parseFloat(p.openPriceAvg||p.averageOpenPrice||p.openAvgPrice||0);
  const markPx = parseFloat(p.markPrice||p.marketPrice||entry);
  const lev    = parseFloat(p.leverage||1);
  const size   = parseFloat(p.total||p.available||p.totalPos||0);
  const notional = size*(markPx||entry);
  const margin   = notional/lev;
  const roe    = margin>0 ? (upnl/margin*100) : 0;
  const isWin  = upnl >= 0;
  const now    = new Date();
  const dateStr = now.toISOString().slice(0,10)+' '+now.toTimeString().slice(0,5)+' UTC';
  const accentColor = isWin ? '#3dffa0' : '#ff3d5a';

  // ── SEED RNG (deterministic per frame) ──
  const rng = (seed) => { let x=Math.sin(seed+1)*10000; return x-Math.floor(x); };

  // ── BACKGROUND ──
  const bg = cx.createLinearGradient(0,0,W,H);
  if(isWin){
    bg.addColorStop(0,'#060e09'); bg.addColorStop(0.6,'#07100a'); bg.addColorStop(1,'#040a06');
  } else {
    bg.addColorStop(0,'#0e0608'); bg.addColorStop(0.6,'#100407'); bg.addColorStop(1,'#0a0306');
  }
  cx.fillStyle=bg; cx.fillRect(0,0,W,H);

  // subtle grid
  cx.save(); cx.globalAlpha=0.035; cx.strokeStyle='#fff'; cx.lineWidth=1;
  for(let gx=0;gx<W;gx+=40){ cx.beginPath();cx.moveTo(gx,0);cx.lineTo(gx,H);cx.stroke(); }
  for(let gy=0;gy<H;gy+=40){ cx.beginPath();cx.moveTo(0,gy);cx.lineTo(W,gy);cx.stroke(); }
  cx.restore();

  // noise grain
  for(let i=0;i<3500;i++){
    cx.fillStyle='rgba(255,255,255,'+Math.random()*0.025+')';
    cx.fillRect(Math.random()*W,Math.random()*H,1,1);
  }

  // glow blob center
  const blob = cx.createRadialGradient(W/2,H*0.42,0,W/2,H*0.42,240);
  blob.addColorStop(0, isWin?'rgba(61,255,160,0.10)':'rgba(255,61,90,0.10)');
  blob.addColorStop(1,'rgba(0,0,0,0)');
  cx.fillStyle=blob; cx.fillRect(0,0,W,H);

  // ── TOP BAR: RISKFLOW logo (protagonist) ──
  cx.save();
  // "RISKFLOW" big + accent green
  cx.font = 'bold 22px "Syne",sans-serif';
  cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
  cx.fillStyle = '#ffffff';
  cx.fillText('Risk', 28, 46);
  const _riskW = cx.measureText('Risk').width;
  cx.fillStyle = '#a855f7';
  cx.fillText('Flow', 28+_riskW, 46);
  // date top-right
  cx.textAlign = 'right';
  cx.font = '9px "DM Mono",monospace';
  cx.fillStyle = 'rgba(255,255,255,0.28)';
  cx.fillText(dateStr, W-28, 46);
  cx.restore();

  // separator
  cx.save(); cx.globalAlpha=0.12; cx.strokeStyle='#fff'; cx.lineWidth=1;
  cx.beginPath(); cx.moveTo(28,74); cx.lineTo(W-28,74); cx.stroke();
  cx.restore();

  // ── CHARACTER ──
  const charCX = W/2, charCY = 205;

  // Helper: disegna emoji grande su canvas
  function drawEmoji(em, x, y, size){
    cx.save();
    cx.font = size+'px serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(em, x, y);
    cx.restore();
  }

  if(isWin){
    // ── WIN: glow verde + emoji stack ──
    cx.save();
    const glowWin = cx.createRadialGradient(charCX,charCY,0,charCX,charCY,160);
    glowWin.addColorStop(0,'rgba(61,255,160,0.20)');
    glowWin.addColorStop(1,'rgba(0,0,0,0)');
    cx.fillStyle=glowWin; cx.fillRect(charCX-160,charCY-160,320,320);
    cx.restore();

    // Emoji principale — faccia con occhiali da sole
    cx.save();
    cx.shadowColor='#3dffa0'; cx.shadowBlur=40;
    drawEmoji('🤑', charCX, charCY-10, 120);
    cx.shadowBlur=0;
    cx.restore();

    // Emoji decorativi intorno
    const winDecos = [
      { em:'🚀', x:charCX-130, y:charCY-90, sz:38, rot:-0.4 },
      { em:'💰', x:charCX+135, y:charCY-75, sz:36, rot:0.3 },
      { em:'💸', x:charCX-145, y:charCY+40, sz:32, rot:-0.6 },
      { em:'💎', x:charCX+140, y:charCY+50, sz:34, rot:0.5 },
      { em:'🏆', x:charCX-70,  y:charCY-130, sz:30, rot:-0.2 },
      { em:'⭐', x:charCX+75,  y:charCY-125, sz:28, rot:0.4 },
      { em:'💵', x:charCX+160, y:charCY-10,  sz:28, rot:0.6 },
      { em:'💵', x:charCX-160, y:charCY+5,   sz:26, rot:-0.5 },
      { em:'🎯', x:charCX,     y:charCY+120, sz:30, rot:0 },
    ];
    winDecos.forEach(d=>{
      cx.save();
      cx.translate(d.x, d.y); cx.rotate(d.rot);
      cx.globalAlpha = 0.75 + rng(d.sz)*0.25;
      cx.font = d.sz+'px serif';
      cx.textAlign='center'; cx.textBaseline='middle';
      cx.fillText(d.em, 0, 0);
      cx.restore();
    });

    // Sparkle stelle dorate
    [[charCX-80,charCY-100],[charCX+85,charCY-95],[charCX-55,charCY-118],[charCX+65,charCY-108]].forEach(([sx,sy],i)=>{
      cx.save(); cx.globalAlpha=0.6+rng(i)*0.3;
      cx.fillStyle='#ffc940'; cx.strokeStyle='#ffc940'; cx.lineWidth=1.5;
      cx.translate(sx,sy);
      for(let s=0;s<4;s++){ cx.rotate(Math.PI/4); cx.beginPath(); cx.moveTo(0,0); cx.lineTo(0,6+i); cx.stroke(); }
      cx.restore();
    });

  } else {
    // ── LOSS: glow rosso + emoji stack ──
    cx.save();
    const glowLoss = cx.createRadialGradient(charCX,charCY,0,charCX,charCY,160);
    glowLoss.addColorStop(0,'rgba(255,61,90,0.22)');
    glowLoss.addColorStop(1,'rgba(0,0,0,0)');
    cx.fillStyle=glowLoss; cx.fillRect(charCX-160,charCY-160,320,320);
    cx.restore();

    // Emoji principale — faccia che piange / rekt
    cx.save();
    cx.shadowColor='#ff3d5a'; cx.shadowBlur=40;
    drawEmoji('😭', charCX, charCY-10, 120);
    cx.shadowBlur=0;
    cx.restore();

    // Emoji decorativi loss
    const lossDecos = [
      { em:'📉', x:charCX+140, y:charCY-80, sz:40, rot:0.2 },
      { em:'🔥', x:charCX-140, y:charCY-70, sz:38, rot:-0.3 },
      { em:'💀', x:charCX-130, y:charCY+55, sz:34, rot:-0.5 },
      { em:'🩸', x:charCX+135, y:charCY+60, sz:30, rot:0.4 },
      { em:'😱', x:charCX-65,  y:charCY-130, sz:30, rot:-0.3 },
      { em:'⚠️', x:charCX+70,  y:charCY-120, sz:28, rot:0.2 },
      { em:'💸', x:charCX+160, y:charCY+5,   sz:28, rot:0.7 },
      { em:'🪦', x:charCX,     y:charCY+120, sz:32, rot:0 },
    ];
    lossDecos.forEach(d=>{
      cx.save();
      cx.translate(d.x, d.y); cx.rotate(d.rot);
      cx.globalAlpha = 0.70 + rng(d.sz)*0.28;
      cx.font = d.sz+'px serif';
      cx.textAlign='center'; cx.textBaseline='middle';
      cx.fillText(d.em, 0, 0);
      cx.restore();
    });

    // Testo ironico REKT
    cx.save();
    cx.textAlign='center'; cx.textBaseline='middle';
    cx.font='bold 13px "DM Mono",monospace';
    cx.fillStyle='rgba(255,61,90,0.45)';
    cx.fillText('G G', charCX, charCY+148);
    cx.restore();

    // Particelle rosse
    for(let i=0;i<10;i++){
      cx.save(); cx.globalAlpha=0.2+rng(i*9)*0.3;
      cx.fillStyle='#ff3d5a';
      cx.beginPath(); cx.arc(50+rng(i*5)*420, 80+rng(i*11)*220, 2+rng(i)*3, 0, Math.PI*2); cx.fill();
      cx.restore();
    }
  }

  // ── SYMBOL BLOCK — dark pill with pair name ──
  cx.save();
  cx.textAlign = 'center';
  // dark rounded bg for symbol
  const symPillW = 220, symPillH = 52, symPillX = W/2-symPillW/2, symPillY = 290;
  cx.fillStyle = 'rgba(10,10,13,0.72)';
  roundRect(cx, symPillX, symPillY, symPillW, symPillH, 14); cx.fill();
  cx.strokeStyle = 'rgba(255,255,255,0.08)'; cx.lineWidth = 1;
  roundRect(cx, symPillX, symPillY, symPillW, symPillH, 14); cx.stroke();
  // pair text
  cx.font = 'bold 26px "Syne",sans-serif';
  cx.fillStyle = '#ffffff';
  cx.fillText(base+'/USDT', W/2, symPillY+32);
  cx.restore();

  // side + leverage pill
  cx.save(); cx.textAlign='center';
  const pillW2=110, pillH2=24, pillX2=W/2-pillW2/2, pillY2=352;
  cx.fillStyle = isWin?'rgba(61,255,160,0.13)':'rgba(255,61,90,0.13)';
  roundRect(cx,pillX2,pillY2,pillW2,pillH2,12); cx.fill();
  cx.strokeStyle=accentColor; cx.lineWidth=1;
  roundRect(cx,pillX2,pillY2,pillW2,pillH2,12); cx.stroke();
  cx.font='bold 11px "DM Mono",monospace';
  cx.fillStyle=accentColor;
  cx.fillText((side==='long'?'▲ LONG':'▼ SHORT')+' · '+lev+'x', W/2, pillY2+16);
  cx.restore();

  // ── PNL BIG ──
  cx.save(); cx.textAlign='center';
  const pnlStr=(upnl>=0?'+':'-')+' $'+fmt(Math.abs(upnl));
  cx.shadowColor=accentColor; cx.shadowBlur=35;
  cx.font='bold 72px "Syne",sans-serif';
  cx.fillStyle=accentColor;
  cx.fillText(pnlStr, W/2, 460);
  cx.shadowBlur=0;
  cx.font='bold 18px "DM Mono",monospace';
  cx.fillStyle=isWin?'rgba(61,255,160,0.6)':'rgba(255,61,90,0.6)';
  cx.fillText((roe>=0?'+':'')+roe.toFixed(2)+'%  ROE', W/2, 486);
  cx.restore();

  // ── DIVIDER ──
  cx.save(); cx.globalAlpha=0.10; cx.strokeStyle='#fff'; cx.lineWidth=1;
  cx.setLineDash([4,6]);
  cx.beginPath(); cx.moveTo(28,508); cx.lineTo(W-28,508); cx.stroke();
  cx.setLineDash([]); cx.restore();

  // ── STATS ROW — only ENTRY + MARK ──
  const stats=[
    {l:'ENTRY', v:'$'+fmtPrice(entry)},
    {l:'MARK',  v:'$'+fmtPrice(markPx)},
  ];
  cx.save(); cx.textAlign='center';
  stats.forEach((s,i)=>{
    const sx = W/4 + i*(W/2);
    cx.font='8px "DM Mono",monospace';
    cx.fillStyle='rgba(255,255,255,0.32)';
    cx.fillText(s.l, sx, 530);
    cx.font='bold 15px "DM Mono",monospace';
    cx.fillStyle='rgba(255,255,255,0.88)';
    cx.fillText(s.v, sx, 552);
    if(i===0){
      cx.save(); cx.globalAlpha=0.1;
      cx.strokeStyle='#fff'; cx.lineWidth=1;
      cx.beginPath(); cx.moveTo(W/2,518); cx.lineTo(W/2,558); cx.stroke();
      cx.restore();
    }
  });
  cx.restore();

  // ── BOTTOM BRANDING ──
  cx.save(); cx.globalAlpha=0.08; cx.strokeStyle='#fff'; cx.lineWidth=1;
  cx.beginPath(); cx.moveTo(28,580); cx.lineTo(W-28,580); cx.stroke();
  cx.restore();

  cx.save();
  cx.textAlign='center';
  // "Risk" bianco + "Flow" viola — grande centrato
  const brandY = 635;
  cx.font='bold 52px "Syne",sans-serif';
  // misura "Risk" per posizionare "Flow" subito dopo
  const riskW = cx.measureText('Risk').width;
  const flowW = cx.measureText('Flow').width;
  const totalW = riskW + flowW;
  const startX = W/2 - totalW/2;
  cx.textAlign='left'; cx.textBaseline='alphabetic';
  // glow viola su Flow
  cx.fillStyle='#a855f7';
  cx.fillText('Flow', startX+riskW, brandY);
  cx.fillStyle='#ffffff';
  cx.fillText('Risk', startX, brandY);
  // disclaimer piccolo
  cx.font='8px "DM Mono",monospace';
  cx.fillStyle='rgba(255,255,255,0.12)';
  cx.fillText('Not financial advice', W/2, brandY+38);
  cx.restore();

  // accent corner dots
  [[28,H-28],[W-28,H-28]].forEach(([dx,dy])=>{
    cx.save(); cx.globalAlpha=0.25;
    cx.fillStyle=accentColor;
    cx.beginPath(); cx.arc(dx,dy,3,0,Math.PI*2); cx.fill();
    cx.restore();
  });
}

function roundRect(cx,x,y,w,h,r){
  cx.beginPath();
  cx.moveTo(x+r,y); cx.lineTo(x+w-r,y);
  cx.quadraticCurveTo(x+w,y,x+w,y+r);
  cx.lineTo(x+w,y+h-r);
  cx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  cx.lineTo(x+r,y+h);
  cx.quadraticCurveTo(x,y+h,x,y+h-r);
  cx.lineTo(x,y+r);
  cx.quadraticCurveTo(x,y,x+r,y);
  cx.closePath();
}

// ─── FIREBASE + BITGET SYSTEM ───
(async () => {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const firebaseConfig = {
    apiKey: "AIzaSyCQxU_EoIIFay4fDXma-wER2Mi3rme7Kls",
    authDomain: "riskflow-2ab5a.firebaseapp.com",
    projectId: "riskflow-2ab5a",
    storageBucket: "riskflow-2ab5a.firebasestorage.app",
    messagingSenderId: "341254065374",
    appId: "1:341254065374:web:d018072e909bcefae6c64f",
  };

  const fbApp = initializeApp(firebaseConfig);
  const auth  = getAuth(fbApp);
  const db    = getFirestore(fbApp); // solo per auth (profiles/usernames)
  let currentUser = null;

  // ── BITGET PROXY ──
  const BITGET_PROXY = 'https://bitget-proxy-mze2.onrender.com';



  // ── LOCAL KEY HELPERS (localStorage only — no Firestore) ──
  // Le chiavi sono salvate in chiaro in localStorage, protette dal browser.
  function _lsKeysFor(ex) {
    if (ex === 'bybit' || ex === 'bybit_demo') return { k:'bybit_api_key', s:'bybit_api_secret', p:null };
    if (ex === 'weex')  return { k:'weex_api_key',  s:'weex_api_secret',  p:'weex_api_passphrase' };
    if (ex === 'bingx') return { k:'bingx_api_key', s:'bingx_api_secret', p:null };
    return { k:'bitget_api_key', s:'bitget_api_secret', p:'bitget_api_passphrase' };
  }
  async function saveKeysToFirestore(uid, apiKey, secret, passphrase, exchange) {
    // Salva solo in localStorage
    const ex = exchange || 'bitget';
    const keys = _lsKeysFor(ex);
    localStorage.setItem(keys.k, apiKey);
    localStorage.setItem(keys.s, secret);
    if (keys.p && passphrase) localStorage.setItem(keys.p, passphrase);
    localStorage.setItem('rf_exchange', ex);
  }
  async function loadKeysFromFirestore(uid, exchange) {
    // Legge solo da localStorage
    const ex = exchange || _activeExchange || 'bitget';
    const keys = _lsKeysFor(ex);
    const apiKey = localStorage.getItem(keys.k) || '';
    const secret = localStorage.getItem(keys.s) || '';
    const passphrase = keys.p ? (localStorage.getItem(keys.p) || '') : '';
    if (!apiKey) return null;
    return { apiKey, secret, passphrase, exchange: ex };
  }
  async function deleteKeysFromFirestore(uid) {
    // No-op: la cancellazione viene gestita direttamente in rfDeleteApiKeys
  }
  async function syncKeysFromFirestore(uid) {
    // No-op: le chiavi sono già in localStorage, non serve sincronizzare
    // Ripristina solo l'exchange attivo se presente
    const savedEx = localStorage.getItem('rf_exchange');
    if (savedEx && ['bitget','bybit','bybit_demo','weex','bingx'].includes(savedEx)) {
      _activeExchange = savedEx;
      window._activeExchange = savedEx;
    }
  }

  // ── LOCALSTORAGE HELPERS ──
  function loadBitgetKeys() {
    return {
      apiKey: localStorage.getItem('bitget_api_key')||'',
      secret: localStorage.getItem('bitget_api_secret')||'',
      passphrase: localStorage.getItem('bitget_api_passphrase')||''
    };
  }
  function loadBybitKeys() {
    return {
      apiKey: localStorage.getItem('bybit_api_key')||'',
      secret: localStorage.getItem('bybit_api_secret')||''
    };
  }
  function loadWeexKeys() {
    return {
      apiKey:     localStorage.getItem('weex_api_key')||'',
      secret:     localStorage.getItem('weex_api_secret')||'',
      passphrase: localStorage.getItem('weex_api_passphrase')||''
    };
  }
  function loadBingxKeys() {
    return {
      apiKey: localStorage.getItem('bingx_api_key')||'',
      secret: localStorage.getItem('bingx_api_secret')||''
    };
  }
  // Restituisce le chiavi dell'exchange attivo
  function loadActiveKeys() {
    const ex = _activeExchange||'bitget';
    if (ex === 'bybit' || ex === 'bybit_demo') return loadBybitKeys();
    if (ex === 'weex')  return loadWeexKeys();
    if (ex === 'bingx') return loadBingxKeys();
    return loadBitgetKeys();
  }

  // (syncKeysFromFirestore è definita sopra insieme agli altri helper localStorage)

  // ── BITGET REQUEST via Proxy ──
  async function bitgetRequest(endpoint, params={}, options={}) {
    const {apiKey,secret,passphrase} = loadBitgetKeys();
    if (!apiKey||!secret) throw new Error('Chiavi API non configurate');
    const method = options.method||'GET';
    let url, fetchOpts;
    if(method==='GET'){
      const qstr = new URLSearchParams({endpoint,...params}).toString();
      url = `${BITGET_PROXY}?${qstr}`;
      fetchOpts = {method:'GET', headers:{'x-bitget-key':apiKey,'x-bitget-secret':secret,'x-bitget-passphrase':passphrase||''}};
    } else {
      url = `${BITGET_PROXY}?endpoint=${encodeURIComponent(endpoint)}`;
      fetchOpts = {method:'POST', headers:{'x-bitget-key':apiKey,'x-bitget-secret':secret,'x-bitget-passphrase':passphrase||'','Content-Type':'application/json'}, body:options.body||'{}'};
    }
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.code && data.code!=='00000' && data.code!==0) throw new Error(data.msg||`Errore API: ${data.code}`);
    return data;
  }

  // ── BYBIT REQUEST via Proxy ──
  // Il proxy legge x-bybit-demo:true e usa api-demo.bybit.com automaticamente
  async function bybitRequest(endpoint, params={}, options={}) {
    const {apiKey,secret} = loadBybitKeys();
    if (!apiKey||!secret) throw new Error('Chiavi Bybit non configurate');
    const isDemo = _activeExchange === 'bybit_demo';
    const method = options.method||'GET';
    let url, fetchOpts;
    const bybitHeaders = {
      'x-bybit-key':    apiKey,
      'x-bybit-secret': secret,
      ...(isDemo ? {'x-bybit-demo':'true'} : {}),
    };
    if (method === 'GET') {
      const qstr = new URLSearchParams({endpoint,...params}).toString();
      url = `${BYBIT_PROXY}?${qstr}`;
      fetchOpts = {method:'GET', headers: bybitHeaders};
    } else {
      url = `${BYBIT_PROXY}?endpoint=${encodeURIComponent(endpoint)}`;
      fetchOpts = {method:'POST', headers:{...bybitHeaders,'Content-Type':'application/json'}, body:options.body||'{}'};
    }
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.retCode !== undefined && data.retCode !== 0) throw new Error(data.retMsg||`Errore Bybit: ${data.retCode}`);
    return data;
  }

  // ── WEEX REQUEST via Proxy ──
  async function weexRequest(endpoint, params={}, options={}) {
    const {apiKey, secret, passphrase} = loadWeexKeys();
    if (!apiKey||!secret) throw new Error('Chiavi Weex non configurate');
    const method = options.method||'GET';
    let url, fetchOpts;
    const weexHeaders = {
      'x-weex-key':        apiKey,
      'x-weex-secret':     secret,
      'x-weex-passphrase': passphrase||'',
    };
    if (method === 'GET') {
      const qstr = new URLSearchParams({endpoint,...params}).toString();
      url = `${WEEX_PROXY}?${qstr}`;
      fetchOpts = {method:'GET', headers: weexHeaders};
    } else {
      url = `${WEEX_PROXY}?endpoint=${encodeURIComponent(endpoint)}`;
      fetchOpts = {method:'POST', headers:{...weexHeaders,'Content-Type':'application/json'}, body:options.body||'{}'};
    }
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Weex V3 usa code=0 per successo (o assenza di code per array)
    if (data.code !== undefined && data.code !== 0 && data.code !== '0') {
      throw new Error(data.msg || `Errore Weex: ${data.code}`);
    }
    return data;
  }

  // ── BINGX REQUEST via Proxy ──
  async function bingxRequest(endpoint, params={}, options={}) {
    const {apiKey, secret} = loadBingxKeys();
    if (!apiKey||!secret) throw new Error('Chiavi BingX non configurate');
    const method = options.method||'GET';
    const bingxHeaders = { 'x-bingx-key': apiKey, 'x-bingx-secret': secret };
    let url, fetchOpts;
    if (method === 'GET') {
      const qstr = new URLSearchParams({endpoint, ...params}).toString();
      url = `${BINGX_PROXY}?${qstr}`;
      fetchOpts = {method:'GET', headers: bingxHeaders};
    } else if (method === 'DELETE') {
      // DELETE: params in query string, nessun body
      const qstr = new URLSearchParams({endpoint, ...params}).toString();
      url = `${BINGX_PROXY}?${qstr}`;
      fetchOpts = {method:'DELETE', headers: bingxHeaders};
    } else {
      // POST: tutti i params in query string — il proxy li legge e li firma
      const bodyParams = options.body ? JSON.parse(options.body) : {};
      const qstr = new URLSearchParams({endpoint, ...bodyParams}).toString();
      url = `${BINGX_PROXY}?${qstr}`;
      fetchOpts = {method:'POST', headers: bingxHeaders};
    }
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // Risposta vuota accettabile solo per DELETE (cancel ordine), non per GET/POST
    if (!text || !text.trim()) {
      if (method === 'DELETE') return {};
      throw new Error('BingX risposta vuota');
    }
    let data;
    try { data = JSON.parse(text); }
    catch(e) { throw new Error('BingX risposta non JSON: ' + text.slice(0, 100)); }
    if (data.code !== undefined && data.code !== 0) throw new Error(data.msg||`Errore BingX: ${data.code}`);
    return data;
  }

  // Helper: usa la request corretta in base all'exchange attivo
  function activeRequest(endpoint, params={}, options={}) {
    const ex = _activeExchange||'bitget';
    if (ex === 'bybit' || ex === 'bybit_demo') return bybitRequest(endpoint, params, options);
    if (ex === 'weex')  return weexRequest(endpoint, params, options);
    if (ex === 'bingx') return bingxRequest(endpoint, params, options);
    return bitgetRequest(endpoint, params, options);
  }

  // Esponi globalmente per executeOrder
  window._bitgetRequest = bitgetRequest;
  window._bybitRequest  = bybitRequest;
  window._weexRequest   = weexRequest;
  window._bingxRequest  = bingxRequest;
  window._activeRequest = activeRequest;

  // ── FETCH ORDINI PENDING ──
  async function fetchBitgetOrders() {
    const ex = _activeExchange||'bitget';
    const isBingx = ex === 'bingx';
    const isWeex  = ex === 'weex';
    const isBybit = ex === 'bybit' || ex === 'bybit_demo';
    const {apiKey} = isBingx ? loadBingxKeys() : isWeex ? loadWeexKeys() : isBybit ? loadBybitKeys() : loadBitgetKeys();
    if (!apiKey) return;
    try {
      let orders = [];
      if (isBingx) {
        const data = await bingxRequest('/openApi/swap/v2/trade/openOrders');
        const raw  = Array.isArray(data.data?.orders) ? data.data.orders : [];
        orders = raw.map(o => ({
          symbol:    (o.symbol||'').replace('-',''),
          side:      (o.side||'BUY').toLowerCase() === 'buy' ? 'buy' : 'sell',
          price:     o.price,
          size:      o.origQty||o.quantity,
          orderType: o.type,
          orderId:   o.orderId,
          _bingx:    true,
        }));
      } else if (isWeex) {
        const data = await weexRequest('/capi/v3/order/openOrders');
        const raw  = Array.isArray(data) ? data : (data.data||[]);
        orders = raw.map(o => ({
          symbol:    o.symbol,
          side:      (o.side||'BUY').toLowerCase() === 'buy' ? 'buy' : 'sell',
          price:     o.price,
          size:      o.quantity||o.qty||o.size,
          orderType: o.type,
          orderId:   o.orderId,
          _weex:     true,
        }));
      } else if (isBybit) {
        const data = await bybitRequest('/v5/order/realtime', {category:'linear', settleCoin:'USDT', limit:'50'});
        orders = (data.result?.list || []).map(o => ({
          symbol:    o.symbol,
          side:      o.side?.toLowerCase() === 'buy' ? 'buy' : 'sell',
          price:     o.price,
          size:      o.qty,
          orderType: o.orderType,
          orderId:   o.orderId,
          _bybit:    true,
        }));
      } else {
        const data = await bitgetRequest('/api/v2/mix/order/orders-pending', {productType:'USDT-FUTURES'});
        orders = data.data?.entrustedList || data.data || [];
      }
      renderBitgetOrders(Array.isArray(orders) ? orders : []);
    } catch(e) {
      console.warn('fetchOrders:', e.message);
    }
  }

  function renderBitgetOrders(orders) {
    const list = document.getElementById('ordList');
    const badge = document.getElementById('ordCount');
    if (!list) return;
    if (!orders.length) {
      list.innerHTML = '<div class="no-ord">Nessun ordine pending</div>';
      badge.textContent = '0';
      return;
    }
    badge.textContent = orders.length;
    list.innerHTML = orders.map(o => {
      const sym    = (o.symbol||'').replace('_UMCBL','').replace('_DMCBL','').replace('UMCBL','').replace('DMCBL','');
      const side   = (o.side||'buy').toLowerCase();
      const isLong = side === 'buy' || side === 'open_long';
      const price  = parseFloat(o.price||o.triggerPrice||0);
      const size   = parseFloat(o.size||o.baseVolume||0);
      const type   = (o.orderType||o.planType||'limit').replace('_',' ');
      const ordId  = o.orderId||o.clientOid||'';
      return `<div class="ord-item ${isLong?'long':'short'}">
        <div class="ord-top">
          <div class="ord-l">
            <div class="op">${sym} <span style="font-size:9px;color:var(--${isLong?'green':'red'})">${isLong?'▲ LONG':'▼ SHORT'}</span></div>
            <div class="od">${type.toUpperCase()} · ${size} cont</div>
          </div>
          <div class="ord-r">
            <span class="ord-price" style="color:var(--accent)">$${fmtPrice(price)}</span>
            <button class="ord-cancel" onclick="cancelBitgetOrder('${o.symbol}','${ordId}')">✕ Cancella</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  window.closeAllPositions = async function() {
    if (!_positions.length) { notify('Nessuna posizione aperta','err'); return; }
    if (!confirm(`Chiudere tutte le ${_positions.length} posizioni?`)) return;
    notify('Chiusura posizioni...','');
    const isBingx = _activeExchange === 'bingx';
    const isWeex  = _activeExchange === 'weex';
    const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';
    let ok=0, fail=0;
    for (const p of _positions) {
      const side = (p.holdSide||'long').toLowerCase();
      try {
        if (isBingx) {
          const bsym = p._bingxSymbol || toBingxSym(p.symbol);
          await bingxRequest('/openApi/swap/v2/trade/closeAllPositions', {}, {
            method: 'POST',
            body: JSON.stringify({ symbol: bsym }),
          });
        } else if (isWeex) {
          await weexRequest('/capi/v3/closePositions', {}, {
            method: 'POST',
            body: JSON.stringify({symbol: p.symbol}),
          });
        } else if (isBybit) {
          try {
            await bybitRequest('/v5/order/cancel-all-orders', {}, {
              method: 'POST',
              body: JSON.stringify({category:'linear', symbol:p.symbol}),
            });
          } catch(e) { /* ignora errori cancel-all, potrebbe non avere ordini */ }
          await bybitRequest('/v5/order/create', {}, {
            method: 'POST',
            body: JSON.stringify({
              category: 'linear',
              symbol:   p.symbol,
              side:     side === 'long' ? 'Sell' : 'Buy',
              orderType:'Market',
              qty:      String(parseFloat(p.size||p.total||0)),
              reduceOnly: true,
            }),
          });
        } else {
          await bitgetRequest('/api/v2/mix/order/close-positions', {}, {
            method: 'POST',
            body: JSON.stringify({symbol:p.symbol, productType:'USDT-FUTURES', holdSide:side}),
          });
        }
        ok++;
      } catch(e) { fail++; console.warn('closeAll error:', p.symbol, e.message); }
    }
    notify(fail===0 ? `✓ ${ok} posizioni chiuse` : `${ok} chiuse, ${fail} errori`, fail===0?'ok':'err');
    setTimeout(()=>fetchBitgetDashboard(), 1500);
  };

  window.cancelBitgetOrder = async function(symbol, orderId) {
    if (!confirm('Cancellare questo ordine?')) return;
    const isBingx = _activeExchange === 'bingx';
    const isWeex  = _activeExchange === 'weex';
    const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';
    try {
      if (isBingx) {
        await bingxRequest('/openApi/swap/v2/trade/order', {}, {
          method: 'POST',
          body: JSON.stringify({ symbol: toBingxSym(symbol), orderId: String(orderId) }),
        });
      } else if (isWeex) {
        await weexRequest('/capi/v3/order/cancel', {}, {
          method: 'POST',
          body: JSON.stringify({symbol, orderId, newClientOrderId:'rf_cancel_'+Date.now()}),
        });
      } else if (isBybit) {
        await bybitRequest('/v5/order/cancel', {}, {
          method: 'POST',
          body: JSON.stringify({category:'linear', symbol, orderId}),
        });
      } else {
        await bitgetRequest('/api/v2/mix/order/cancel-order', {}, {
          method: 'POST',
          body: JSON.stringify({symbol, productType:'USDT-FUTURES', orderId}),
        });
      }
      notify('Ordine cancellato ✓', 'ok');
      fetchBitgetOrders();
    } catch(e) {
      notify('Errore cancellazione: ' + e.message, 'err');
    }
  };

  // ── FETCH BALANCE + POSIZIONI ──
  async function fetchBitgetDashboard() {
    const statusEl = document.getElementById('apiStatus');
    const balEl    = document.getElementById('apiBitgetBalance');
    const upnlEl   = document.getElementById('apiBitgetUpnl');
    const posEl    = document.getElementById('apiBitgetPositions');
    const syncEl   = document.getElementById('apiSyncTime');
    const isBingx  = _activeExchange === 'bingx';
    const isWeex   = _activeExchange === 'weex';
    const isBybit  = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';
    const exchLabel= isBingx ? 'BingX' : isWeex ? 'Weex' : isBybit ? (_activeExchange==='bybit_demo'?'Bybit Demo':'Bybit') : 'Bitget';

    try {
      let equity=0, available=0, upnl=0, margin=0, positions=[];

      if (isBingx) {
        // ── BingX balance ──
        const balData = await bingxRequest('/openApi/swap/v3/user/balance');
        // data è un array — prendiamo il record USDT
        const balArr = Array.isArray(balData.data) ? balData.data : [balData.data || {}];
        const usdt = balArr.find(x => x.asset === 'USDT') || balArr[0] || {};
        equity    = parseFloat(usdt.equity           || 0);
        available = parseFloat(usdt.availableMargin  || 0);
        upnl      = parseFloat(usdt.unrealizedProfit || 0);
        margin    = parseFloat(usdt.usedMargin       || 0);

        // ── BingX positions ──
        const posData = await bingxRequest('/openApi/swap/v2/user/positions');
        const rawPos  = Array.isArray(posData.data) ? posData.data : [];
        positions = rawPos
          .filter(p => parseFloat(p.positionAmt||0) !== 0)
          .map(p => {
            const amt  = parseFloat(p.positionAmt||0);
            const side = amt > 0 ? 'long' : 'short';
            // BingX usa BTC-USDT — normalizziamo il symbol
            const sym  = (p.symbol||'').replace('-','');
            return {
              symbol:       sym,
              _bingxSymbol: p.symbol, // conserva BTC-USDT per le API
              holdSide:     side,
              total:        Math.abs(amt),
              available:    Math.abs(amt),
              openPriceAvg: parseFloat(p.avgPrice||p.entryPrice||0),
              markPrice:    parseFloat(p.markPrice||0),
              unrealizedPL: parseFloat(p.unrealizedProfit||0),
              leverage:     parseFloat(p.leverage||1),
              liquidationPrice: parseFloat(p.liquidatePrice||0),
              stopLoss:     parseFloat(p.stopLossPrice||0),
              takeProfit:   parseFloat(p.takeProfitPrice||0),
              marginMode:   (p.marginType||'CROSSED').toLowerCase() === 'isolated' ? 'isolated' : 'crossed',
              _bingx: true,
            };
          });

      } else if (isWeex) {
        // ── Weex balance ──
        const balData = await weexRequest('/capi/v3/account/balance');
        const rawBal  = Array.isArray(balData) ? balData : (balData.data || []);
        const usdt    = rawBal.find(a => (a.asset||'').toUpperCase() === 'USDT') || rawBal[0] || {};
        equity    = parseFloat(usdt.balance            || 0);
        available = parseFloat(usdt.availableBalance   || 0);
        upnl      = parseFloat(usdt.unrealizePnl       || 0);
        margin    = equity - available;

        // ── Weex positions ──
        const posData = await weexRequest('/capi/v3/account/position/allPosition');
        const rawPos  = Array.isArray(posData) ? posData : (posData.data || []);
        positions = rawPos
          .filter(p => parseFloat(p.size||0) > 0)
          .map(p => {
            const openVal = parseFloat(p.openValue||0);
            const sz      = parseFloat(p.size||0);
            const openAvg = sz > 0 ? openVal / sz : 0;
            return {
              symbol:       p.symbol,
              holdSide:     (p.side||'LONG').toLowerCase(),
              total:        sz,
              available:    sz,
              openPriceAvg: openAvg,
              markPrice:    0, // populated by realtime ticker
              unrealizedPL: parseFloat(p.unrealizePnl||0),
              leverage:     parseFloat(p.leverage||1),
              liquidationPrice: parseFloat(p.liquidatePrice||0),
              stopLoss:     0,
              takeProfit:   0,
              marginMode:   (p.marginType||'CROSSED').toLowerCase(),
              _weex: true,
            };
          });

        // u2500u2500 Abbina SL/TP dagli algo orders alle posizioni u2500u2500
        try {
          const algoData = await weexRequest('/capi/v3/openAlgoOrders');
          const algos    = Array.isArray(algoData) ? algoData : (algoData.data || []);
          for (const pos of positions) {
            const sym      = pos.symbol;
            const posSide  = pos.holdSide.toUpperCase();
            const symAlgos = algos.filter(o => o.symbol === sym && o.positionSide === posSide);
            const slOrder  = symAlgos.find(o => o.orderType === 'STOP_MARKET'        && o.algoStatus === 'UNTRIGGERED');
            const tpOrder  = symAlgos.find(o => o.orderType === 'TAKE_PROFIT_MARKET' && o.algoStatus === 'UNTRIGGERED');
            if (slOrder) pos.stopLoss   = parseFloat(slOrder.triggerPrice || 0);
            if (tpOrder) pos.takeProfit = parseFloat(tpOrder.triggerPrice || 0);
          }
        } catch(e) { console.warn('Weex SL/TP abbinamento:', e.message); }

      } else if (isBybit) {
        // ── Bybit balance ──
        const balData = await bybitRequest('/v5/account/wallet-balance', {accountType:'UNIFIED'});
        const coins   = balData.result?.list?.[0]?.coin || [];
        const usdt    = coins.find(c => c.coin === 'USDT') || coins[0] || {};
        equity    = parseFloat(usdt.equity||usdt.walletBalance||0);
        available = parseFloat(usdt.availableToWithdraw||usdt.availableBalance||0);
        upnl      = parseFloat(usdt.unrealisedPnl||0);
        margin    = parseFloat(usdt.totalPositionMM||0);

        // ── Bybit positions ──
        const posData = await bybitRequest('/v5/position/list', {category:'linear', settleCoin:'USDT'});
        const rawPos  = posData.result?.list || [];
        positions = rawPos
          .filter(p => parseFloat(p.size||0) > 0)
          .map(p => ({
            symbol:       p.symbol,
            holdSide:     p.side === 'Buy' ? 'long' : 'short',
            total:        parseFloat(p.size||0),
            available:    parseFloat(p.size||0),
            openPriceAvg: parseFloat(p.avgPrice||0),
            markPrice:    parseFloat(p.markPrice||0),
            unrealizedPL: parseFloat(p.unrealisedPnl||0),
            leverage:     parseFloat(p.leverage||1),
            liquidationPrice: parseFloat(p.liqPrice||0),
            stopLoss:     parseFloat(p.stopLoss||0),
            takeProfit:   parseFloat(p.takeProfit||0),
            marginMode:   p.tradeMode === 0 ? 'crossed' : 'isolated',
            _bybit: true,
          }));
      } else {
        // ── Bitget balance ──
        const balData = await bitgetRequest('/api/v2/mix/account/accounts', {productType:'USDT-FUTURES'});
        let rawBal = balData.data||[];
        if (!Array.isArray(rawBal)) rawBal=[rawBal];
        const usdt = rawBal.find(a=>(a.marginCoin||'').toUpperCase()==='USDT')||rawBal[0]||{};
        equity    = parseFloat(usdt.accountEquity||usdt.usdtEquity||usdt.equity||usdt.crossedMaxAvailable||usdt.available||0);
        available = parseFloat(usdt.crossedMaxAvailable||usdt.available||usdt.maxOpenPosAvailable||0);
        upnl      = parseFloat(usdt.unrealizedPL||usdt.unrealizedProfit||usdt.crossedUnrealizedPL||0);
        margin    = parseFloat(usdt.crossedRiskRate||usdt.locked||usdt.margin||0);

        // ── Bitget positions ──
        const posData = await bitgetRequest('/api/v2/mix/position/all-position', {productType:'USDT-FUTURES',marginCoin:'USDT'});
        positions = (posData.data||[]).filter(p=>parseFloat(p.total||p.available||0)>0);
      }

      // ── Aggiorna UI ──
      if (balEl) balEl.textContent = '$'+equity.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
      if (upnlEl) { upnlEl.textContent=(upnl>=0?'+':'-')+'$'+Math.abs(upnl).toFixed(2); upnlEl.style.color=upnl>=0?'var(--green)':'var(--red)'; }

      document.getElementById('accBalance').textContent='$'+fmt(equity);
      document.getElementById('accAvail').textContent='$'+fmt(available);
      const pEl=document.getElementById('accPnl');
      pEl.textContent=(upnl>=0?'+':'-')+'$'+fmt(Math.abs(upnl));
      pEl.className='av '+(upnl>=0?'pos':'neg');
      document.getElementById('accMargin').textContent='$'+fmt(Math.abs(margin));
      document.getElementById('tbBalance').textContent='$'+fmt(equity);
      const tEl=document.getElementById('tbPnl');
      tEl.textContent=(upnl>=0?'+':'-')+'$'+fmt(Math.abs(upnl));
      tEl.className='tv '+(upnl>=0?'pos':'neg');
      S.balance = equity;
      // DLL: controlla solo se NON ci sono posizioni aperte (perdita realizzata)
      // Con posizioni aperte il balance non è affidabile — aspettiamo che si chiudano
      const walletBalance = equity - upnl;
      S.walletBalance = walletBalance;
      if (positions.length === 0) {
        dllCheckBalance(walletBalance); // Daily Loss Limit check — solo a mercato pulito
      }
      dllRenderUI();           // aggiorna UI (banner/toggle/settings)
      renderBitgetPositions(positions);
      fetchPositionTPSLOrders(positions);

      if (statusEl) { statusEl.textContent='✓ Connesso'; statusEl.className='api-status ok'; }
      if (syncEl) { const n=new Date(); syncEl.textContent='Sync '+n.getHours().toString().padStart(2,'0')+':'+n.getMinutes().toString().padStart(2,'0')+':'+n.getSeconds().toString().padStart(2,'0'); }
      notify(exchLabel+' sync ✓','ok');
      fetchBitgetOrders();
    } catch(e) {
      if (statusEl) { statusEl.textContent='✗ '+e.message; statusEl.className='api-status err'; }
      notify(exchLabel+': '+e.message,'err');
    }
  }

    // Store positions globally for modal access
  let _positions = [];
  window._getPosition = function(idx){ return _positions[idx]||null; };

  function renderBitgetPositions(positions) {
    _positions = positions;
    window._positions = positions;
    const list = document.getElementById('posList');
    if (!list) return;
    if (!positions.length) {
      list.innerHTML='<div class="no-pos">No open positions</div>';
      // Rimuovi tutte le linee SL dal grafico
      if (window.refreshPosSLLines) window.refreshPosSLLines([]);
      stopRealtimePnl();
      return;
    }
    list.innerHTML = positions.map((p,idx)=>{
      const sym   = (p.symbol||'').replace('_UMCBL','').replace('_DMCBL','').replace('UMCBL','').replace('DMCBL','');
      const side  = (p.holdSide||'long').toLowerCase();
      const upnl  = parseFloat(p.unrealizedPL||p.unrealizedProfitLoss||p.unrealizedPnl||0);
      const entry = parseFloat(p.openPriceAvg||p.averageOpenPrice||p.openAvgPrice||0);
      const markPx= parseFloat(p.markPrice||p.marketPrice||0);
      const size  = parseFloat(p.total||p.available||p.totalPos||0);
      const notional = size * (markPx||entry);
      const lev   = parseFloat(p.leverage||1);
      const margin = notional / lev;
      const roe   = margin>0 ? (upnl/margin*100) : 0;
      const liqPx = parseFloat(p.liquidationPrice||p.liqPrice||0);
      const slPx  = parseFloat(p.stopLoss||p.stopLossPrice||p.presetStopLossPrice||0);
      const tpPx  = parseFloat(p.takeProfit||p.takeProfitPrice||p.presetTakeProfitPrice||0);
      const slDist = slPx>0 && entry>0 ? Math.abs(entry-slPx)/entry*100 : 0;
      return `<div class="pos-item ${side}" id="pos-item-${idx}" onclick="togglePosExpand(${idx})"
          data-entry="${entry}" data-size="${size}" data-lev="${lev}" data-side="${side}" data-sym="${sym}">
        <div class="pos-top">
          <div class="pos-l">
            <div class="pp">${sym} <span style="font-size:9px;color:var(--muted2)">${lev}x</span></div>
            <div class="pd">${side.toUpperCase()} · Entry $${fmtPrice(entry)}</div>
          </div>
          <div class="pos-r">
            <div class="pnl ${upnl>=0?'pos':'neg'}" id="pos-pnl-${idx}">${upnl>=0?'+':'-'}$${fmt(Math.abs(upnl))} <span style="font-size:9px;opacity:.7">(${roe>=0?'+':''}${roe.toFixed(2)}%)</span></div>
            <div class="psz" id="pos-notional-${idx}">${fmt(size)} cont · $${fmt(notional)}</div>
          </div>
        </div>
        <div class="pos-expand" id="pos-exp-${idx}">
          <div class="pos-stats">
            <div class="ps-cell"><div class="psl">Mark</div><div class="psv" id="pos-mark-${idx}">$${fmtPrice(markPx||entry)}</div></div>
            <div class="ps-cell"><div class="psl">Margin</div><div class="psv" id="pos-margin-${idx}">$${fmt(margin)}</div></div>
            <div class="ps-cell"><div class="psl">Liq.</div><div class="psv" style="color:var(--red)">${liqPx>0?'$'+fmtPrice(liqPx):'—'}</div></div>
          </div>
          <!-- SL/TP correnti — popolato da fetchPositionTPSLOrders -->
          <div id="pos-tpsl-info-${idx}" style="display:flex;gap:4px;margin-bottom:8px">
            <div style="flex:1;background:var(--red-dim);border:1px solid var(--red);border-radius:4px;padding:5px 8px">
              <div style="font-size:8px;color:var(--muted2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Stop Loss</div>
              <div style="font-size:12px;font-weight:700;color:var(--red);font-family:'Syne',sans-serif">${slPx>0?'$'+fmtPrice(slPx):'Caricamento...'}</div>
              ${slPx>0&&slDist>0?`<div style="font-size:9px;color:var(--muted2);margin-top:1px">−${slDist.toFixed(2)}% dall'entry</div>`:''}
            </div>
            <div style="flex:1;background:var(--green-dim);border:1px solid var(--green);border-radius:4px;padding:5px 8px">
              <div style="font-size:8px;color:var(--muted2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Take Profit</div>
              <div style="font-size:12px;font-weight:700;color:var(--green);font-family:'Syne',sans-serif">${tpPx>0?'$'+fmtPrice(tpPx):'—'}</div>
            </div>
          </div>
          <!-- Mod SL -->
          <div class="pos-modify-sl" onclick="event.stopPropagation()">
            <span class="pml">Mod SL</span>
            <div class="pos-sl-wrap">
              <input type="number" id="pos-sl-input-${idx}" placeholder="${liqPx>0?'Liq $'+fmtPrice(liqPx):'es. '+fmtPrice(entry*(side==='long'?0.98:1.02))}" step="0.01"
                onclick="event.stopPropagation()" oninput="event.stopPropagation();syncPosSlLine(${idx})" value=""/>
              <span class="unit">$</span>
            </div>
            <button class="pos-sl-btn" onclick="event.stopPropagation();modifyPositionSL(${idx})">Set SL</button>
            <button class="pos-be-btn" onclick="event.stopPropagation();moveToBreakeven(${idx})" title="Sposta SL all'entry (Breakeven)">BE</button>
          </div>
          <!-- Mod TP -->
          <div class="pos-modify-tp" onclick="event.stopPropagation()">
            ${[1,2,3].map(n=>`
            <div class="pos-tp-row" onclick="event.stopPropagation()">
              <span class="pml">TP${n}</span>
              <div class="pos-tp-wrap">
                <input type="number" id="pos-tp${n}-input-${idx}" placeholder="—" step="0.01"
                  onclick="event.stopPropagation()" oninput="event.stopPropagation();syncPosTpLine(${idx},${n})" value=""/>
                <span class="unit">$</span>
              </div>
              <span class="pos-tp-badge empty" id="pos-tp${n}-badge-${idx}">—</span>
              <button class="pos-tp-btn" onclick="event.stopPropagation();modifyPositionTP(${idx},${n})">Set</button>
            </div>`).join('')}
          </div>
          <!-- Partial close slider -->
          <div class="pct-row" onclick="event.stopPropagation()" style="margin-top:8px">
            <span class="pct-label">Close</span>
            <input type="range" class="pct-slider" id="pct-slider-${idx}" min="1" max="100" value="25"
              onclick="event.stopPropagation()" oninput="event.stopPropagation();updatePctDisplay(${idx},${size},${upnl})"/>
            <span class="pct-val" id="pct-val-${idx}">25%</span>
          </div>
          <div class="pct-usd" id="pct-usd-${idx}">${upnl>=0?'+':''}$${fmt(upnl*0.25)} P&L · ${fmt(size*0.25)} cont</div>
          <div class="pct-presets" onclick="event.stopPropagation()">
            <div class="pct-preset" onclick="event.stopPropagation();setPct(${idx},25,${size},${upnl})">25%</div>
            <div class="pct-preset" onclick="event.stopPropagation();setPct(${idx},50,${size},${upnl})">50%</div>
            <div class="pct-preset" onclick="event.stopPropagation();setPct(${idx},75,${size},${upnl})">75%</div>
            <div class="pct-preset active" onclick="event.stopPropagation();setPct(${idx},100,${size},${upnl})">100%</div>
          </div>
          <div class="pos-btns" onclick="event.stopPropagation()">
            <button class="pos-btn-partial" onclick="event.stopPropagation();openPosModal(${idx},'partial')">⚡ Parziale</button>
            <button class="pos-btn-close"   onclick="event.stopPropagation();openPosModal(${idx},'full')">✕ Chiudi tutto</button>
          </div>
          <button class="pos-btn-shot" onclick="event.stopPropagation();openMoneyShot(${idx})">📸 Money Shot</button>
        </div>
      </div>`;
    }).join('');
    document.getElementById('posCount').textContent = positions.length;
    // Aggiorna le linee SL sul grafico
    if (window.refreshPosSLLines) window.refreshPosSLLines(positions, window._tpslOrdersMap);
    if (window.refreshPosTPLines) window.refreshPosTPLines([], positions, window._tpslOrdersMap);
    // Avvia il loop realtime PnL
    startRealtimePnl();
  }

  // ── FETCH ORDINI TPSL ATTIVI DA BITGET ──
  // Registry globale: "SYMBOL_SIDE" → [ {type:'sl'|'tp', price, orderId, size}, ... ]
  window._tpslOrdersMap = {};

  async function fetchPositionTPSLOrders(positions) {
    const isBingx = _activeExchange === 'bingx';
    const isWeex  = _activeExchange === 'weex';
    const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';
    try {
      const map = {};

      if (isBingx) {
        // BingX: SL/TP sono ordini separati di tipo STOP_MARKET / TAKE_PROFIT_MARKET
        // L'endpoint /positions non restituisce più stopLossPrice/takeProfitPrice affidabili,
        // quindi recuperiamo gli ordini aperti e filtriamo per tipo.
        try {
          const ordData = await bingxRequest('/openApi/swap/v2/trade/openOrders');
          const rawOrds = Array.isArray(ordData.data?.orders) ? ordData.data.orders : [];
          rawOrds.forEach(o => {
            const type = (o.type||'').toUpperCase();
            if (type !== 'STOP_MARKET' && type !== 'TAKE_PROFIT_MARKET') return;
            const sym      = (o.symbol||'').replace('-','');
            // positionSide: LONG o SHORT (hedge mode); in one-way può essere BOTH
            const posSide  = (o.positionSide||'').toLowerCase(); // 'long','short','both'
            const side     = posSide === 'both'
              ? ((o.side||'').toUpperCase() === 'SELL' ? 'long' : 'short')  // SELL chiude LONG
              : posSide;
            const key      = sym + '_' + side;
            const price    = parseFloat(o.stopPrice || o.price || 0);
            const orderId  = String(o.orderId||'');
            if (!sym || !price) return;
            if (!map[key]) map[key] = [];
            map[key].push({
              type:      type === 'STOP_MARKET' ? 'sl' : 'tp',
              price,
              orderId,
              planType:  type,
              size:      parseFloat(o.origQty||o.quantity||0),
            });
          });
        } catch(e) { console.warn('[TPSL BingX] fetch openOrders fallito:', e.message); }

        // Fallback: se per una posizione non abbiamo trovato ordini, proviamo i campi embedded
        positions.forEach((p, idx) => {
          const sym  = p.symbol || '';
          const side = (p.holdSide||'long').toLowerCase();
          const key  = sym+'_'+side;
          if (!map[key] || map[key].length === 0) {
            const list = [];
            const slPx = parseFloat(p.stopLoss||p.stopLossPrice||0);
            const tpPx = parseFloat(p.takeProfit||p.takeProfitPrice||0);
            if (slPx > 0) list.push({ type:'sl', price:slPx, orderId:'', planType:'', size:0 });
            if (tpPx > 0) list.push({ type:'tp', price:tpPx, orderId:'', planType:'', size:0 });
            if (list.length > 0) map[key] = list;
          }
          updatePosSLTPDisplay(idx, map[key]||[], p);
        });
      } else if (isWeex) {
        // Weex: fetch pending TP/SL conditional orders
        try {
          const data = await weexRequest('/capi/v3/order/currentPendingOrders');
          const raw  = Array.isArray(data) ? data : (data.data || []);
          raw.forEach(o => {
            const sym  = o.symbol || '';
            const side = (o.positionSide||'LONG').toLowerCase();
            const pt   = (o.planType||'').toUpperCase();
            const price = parseFloat(o.triggerPrice||0);
            if (!sym || !price) return;
            const key = sym+'_'+side;
            if (!map[key]) map[key] = [];
            map[key].push({ type: pt === 'STOP_LOSS' ? 'sl' : 'tp', price, orderId: String(o.orderId||''), planType: pt, size: parseFloat(o.quantity||0) });
          });
        } catch(e) { console.warn('[TPSL Weex] failed:', e.message); }
        positions.forEach((p, idx) => {
          const sym  = p.symbol || '';
          const side = (p.holdSide||'long').toLowerCase();
          const key  = sym+'_'+side;
          updatePosSLTPDisplay(idx, map[key]||[], p);
        });
      } else if (isBybit) {
        // Bybit: SL/TP sono embedded nelle posizioni — già letti in fetchBitgetDashboard
        positions.forEach((p, idx) => {
          const sym  = p.symbol || '';
          const side = (p.holdSide || 'long').toLowerCase();
          const key  = sym + '_' + side;
          const list = [];
          const slPx = parseFloat(p.stopLoss || 0);
          const tpPx = parseFloat(p.takeProfit || 0);
          if (slPx > 0) list.push({ type:'sl', price:slPx, orderId:'', planType:'', size:0 });
          if (tpPx > 0) list.push({ type:'tp', price:tpPx, orderId:'', planType:'', size:0 });
          map[key] = list;
          updatePosSLTPDisplay(idx, list, p);
        });
      } else {
        // Bitget: fetch ordini TPSL pending
        let orders = [];
        try {
          const data = await bitgetRequest('/api/v2/mix/order/orders-plan-pending', {
            productType: 'USDT-FUTURES', planType: 'profit_loss',
          });
          let raw = data.data?.entrustedList || data.data?.list || data.data || [];
          if (!Array.isArray(raw)) raw = raw ? [raw] : [];
          orders = orders.concat(raw);
        } catch(e) { console.warn('[TPSL] tpsl-pending failed:', e.message); }

        if (orders.length === 0) {
          try {
            const data2 = await bitgetRequest('/api/v2/mix/order/orders-plan-pending', { productType: 'USDT-FUTURES' });
            let raw2 = data2.data?.entrustedList || data2.data?.list || data2.data || [];
            if (!Array.isArray(raw2)) raw2 = raw2 ? [raw2] : [];
            orders = orders.concat(raw2);
          } catch(e) { console.warn('[TPSL] tpsl-pending no planType failed:', e.message); }
        }

        orders.forEach(o => {
          const sym   = (o.symbol||'').replace(/_?(UMCBL|DMCBL)/gi,'');
          const side  = (o.posSide||o.holdSide||'').toLowerCase();
          const pt    = (o.planType||'').toLowerCase();
          const price = parseFloat(o.triggerPrice||o.stopLossTriggerPrice||0);
          if (!sym || !side || !price) return;
          const key = sym+'_'+side;
          if (!map[key]) map[key] = [];
          map[key].push({ type: pt.includes('loss') ? 'sl' : 'tp', price, orderId: o.orderId||'', planType: o.planType||'', size: parseFloat(o.size||0) });
        });

        positions.forEach((p, idx) => {
          const sym  = (p.symbol||'').replace(/_?(UMCBL|DMCBL)/gi,'');
          const side = (p.holdSide||'long').toLowerCase();
          const key  = sym+'_'+side;
          updatePosSLTPDisplay(idx, map[key]||[], p);
        });
      }

      window._tpslOrdersMap = map;
      if (window.refreshPosSLLines) window.refreshPosSLLines(positions, map);
      if (window.refreshPosTPLines) window.refreshPosTPLines([], positions, map);
    } catch(e) {
      console.warn('[TPSL] error generale:', e.message);
      positions.forEach((p, idx) => updatePosSLTPDisplay(idx, [], p));
    }
  }

  // Cancella singolo ordine TPSL
  window.cancelTpslOrder = async function(symbol, orderId, planType, label) {
    if (!confirm(`Eliminare ${label}?`)) return;
    const isBingx = _activeExchange === 'bingx';
    const isWeex  = _activeExchange === 'weex';
    const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';
    try {
      if (isBingx && orderId) {
        await bingxRequest('/openApi/swap/v2/trade/order', { symbol: toBingxSym(symbol), orderId: String(orderId) }, {
          method: 'DELETE',
        });
      } else if (isWeex && orderId) {
        await weexRequest('/capi/v3/cancelTpSlOrder', {}, {
          method: 'POST',
          body: JSON.stringify({ symbol, orderId }),
        });
      } else if (isBybit && orderId) {
        await bybitRequest('/v5/order/cancel', {}, {
          method: 'POST',
          body: JSON.stringify({ category:'linear', symbol, orderId }),
        });
      } else if (!isBybit && !isWeex && !isBingx) {
        await bitgetRequest('/api/v2/mix/order/cancel-plan-order', {}, {
          method: 'POST',
          body: JSON.stringify({ symbol, productType:'USDT-FUTURES', marginCoin:'USDT', orderId, planType }),
        });
      }
      notify(`✓ ${label} eliminato`, 'ok');
      setTimeout(() => fetchBitgetDashboard(), 1200);
    } catch(e) {
      console.error('[cancelTpsl] error:', e.message);
      notify('✗ Errore: ' + e.message, 'err');
    }
  };

  // Aggiorna il box SL/TP nel pannello posizione con i dati reali degli ordini TPSL
  function updatePosSLTPDisplay(idx, tpslList, p) {
    const container = document.getElementById('pos-tpsl-info-'+idx);
    if (!container) return;

    const entry  = parseFloat(p.openPriceAvg||p.averageOpenPrice||p.openAvgPrice||0);
    const symbol = p.symbol || '';
    const slOrders = tpslList.filter(o => o.type === 'sl').sort((a,b)=>a.price-b.price);
    const tpOrders = tpslList.filter(o => o.type === 'tp').sort((a,b)=>a.price-b.price);

    const slFallback = parseFloat(p.stopLoss||p.stopLossPrice||p.presetStopLossPrice||0);
    const tpFallback = parseFloat(p.takeProfit||p.takeProfitPrice||p.presetTakeProfitPrice||0);

    const xBtn = (orderId, planType, label) => orderId
      ? `<button onclick="event.stopPropagation();cancelTpslOrder('${symbol}','${orderId}','${planType}','${label}')"
           style="background:none;border:1px solid rgba(255,255,255,0.12);border-radius:3px;color:var(--muted2);
                  font-size:9px;cursor:pointer;padding:1px 5px;line-height:1.4;flex-shrink:0;transition:all .12s"
           onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)'"
           onmouseout="this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='var(--muted2)'">✕</button>`
      : '';

    let slHtml = '';
    if (slOrders.length > 0) {
      slOrders.forEach((o,i) => {
        const dist = entry>0 ? Math.abs(entry-o.price)/entry*100 : 0;
        slHtml += `<div style="display:flex;justify-content:space-between;align-items:center;gap:4px;${i>0?'margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,45,74,0.2)':''}">
          <span style="font-size:${slOrders.length>1?'11':'12'}px;font-weight:700;color:var(--red);font-family:'Syne',sans-serif">$${fmtPrice(o.price)}</span>
          <span style="font-size:8px;color:var(--muted2);flex:1">${o.size>0?o.size+' cont':''} −${dist.toFixed(2)}%</span>
          ${xBtn(o.orderId, o.planType, 'SL $'+fmtPrice(o.price))}
        </div>`;
      });
    } else if (slFallback > 0) {
      const dist = entry>0 ? Math.abs(entry-slFallback)/entry*100 : 0;
      slHtml = `<div style="font-size:12px;font-weight:700;color:var(--red);font-family:'Syne',sans-serif">$${fmtPrice(slFallback)}</div>
        <div style="font-size:9px;color:var(--muted2);margin-top:1px">−${dist.toFixed(2)}% dall'entry</div>`;
    } else {
      slHtml = `<div style="font-size:11px;color:var(--muted2);font-style:italic">Non impostato</div>`;
    }

    let tpHtml = '';
    if (tpOrders.length > 0) {
      tpOrders.forEach((o,i) => {
        tpHtml += `<div style="display:flex;justify-content:space-between;align-items:center;gap:4px;${i>0?'margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,209,122,0.2)':''}">
          <span style="font-size:${tpOrders.length>1?'11':'12'}px;font-weight:700;color:var(--green);font-family:'Syne',sans-serif">$${fmtPrice(o.price)}</span>
          ${o.size>0?`<span style="font-size:8px;color:var(--muted2);flex:1">${o.size} cont</span>`:'<span style="flex:1"></span>'}
          ${xBtn(o.orderId, o.planType, 'TP $'+fmtPrice(o.price))}
        </div>`;
      });
    } else if (tpFallback > 0) {
      tpHtml = `<div style="font-size:12px;font-weight:700;color:var(--green);font-family:'Syne',sans-serif">$${fmtPrice(tpFallback)}</div>`;
    } else {
      tpHtml = `<div style="font-size:11px;color:var(--muted2);font-style:italic">—</div>`;
    }

    container.innerHTML = `
      <div style="flex:1;background:var(--red-dim);border:1px solid var(--red);border-radius:4px;padding:5px 8px">
        <div style="font-size:8px;color:var(--muted2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">
          Stop Loss${slOrders.length>1?' ('+slOrders.length+')':''}
        </div>
        ${slHtml}
      </div>
      <div style="flex:1;background:var(--green-dim);border:1px solid var(--green);border-radius:4px;padding:5px 8px">
        <div style="font-size:8px;color:var(--muted2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">
          Take Profit${tpOrders.length>1?' ('+tpOrders.length+')':''}
        </div>
        ${tpHtml}
      </div>
    `;
  }

  // ── MODIFY TP POSIZIONE ──
  window.modifyPositionTP = async function(posIdx, tpN) {
    const p = _positions[posIdx];
    if (!p) return;
    const isBingx = _activeExchange === 'bingx';
    const isWeex  = _activeExchange === 'weex';
    const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';

    const inp = document.getElementById(`pos-tp${tpN}-input-${posIdx}`);
    let newTP = inp ? parseFloat(inp.value) : 0;

    const key = `${posIdx}_${tpN}`;
    if (!newTP && window._posTPLines[key]?.price) newTP = window._posTPLines[key].price;
    if (!newTP || newTP <= 0) { notify('Inserisci un prezzo TP valido', 'err'); return; }

    const side  = (p.holdSide || 'long').toLowerCase();
    const entry = parseFloat(p.openPriceAvg || p.averageOpenPrice || p.openAvgPrice || 0);

    if (side === 'long'  && newTP <= entry) { notify("TP long deve essere sopra l'entry", 'err'); return; }
    if (side === 'short' && newTP >= entry) { notify("TP short deve essere sotto l'entry", 'err'); return; }

    notify(`Modifica TP${tpN} in corso...`, '');

    try {
      const cInfo = await fetchContractInfo(p.symbol);
      const tpStr = roundToTick(newTP, cInfo.pricePlace).toFixed(cInfo.pricePlace);

      if (isBingx) {
        const bsym = p._bingxSymbol || toBingxSym(p.symbol);
        await bingxRequest('/openApi/swap/v2/trade/order', {}, {
          method: 'POST',
          body: JSON.stringify({
            symbol: bsym,
            side:   side === 'long' ? 'SELL' : 'BUY',
            positionSide: side === 'long' ? 'LONG' : 'SHORT',
            type: 'TAKE_PROFIT_MARKET',
            quantity: String(parseFloat(p.total||p.available||0)),
            stopPrice: tpStr,
            workingType: 'MARK_PRICE',
          }),
        });
        notify(`✓ TP${tpN}#${posIdx+1} impostato a $${fmtPrice(newTP)}`, 'ok');
        setTimeout(() => fetchBitgetDashboard(), 1200);
      } else if (isWeex) {
        await weexRequest('/capi/v3/placeTpSlOrder', {}, {
          method: 'POST',
          body: JSON.stringify({
            symbol: p.symbol,
            clientAlgoId: 'rf_modtp'+tpN+'_'+Date.now(),
            planType: 'TAKE_PROFIT',
            triggerPrice: tpStr,
            executePrice: '0',
            quantity: String(parseFloat(p.total||p.available||0)),
            positionSide: side === 'long' ? 'LONG' : 'SHORT',
            triggerPriceType: 'MARK_PRICE',
          }),
        });
        notify(`✓ TP${tpN}#${posIdx+1} impostato a $${fmtPrice(newTP)}`, 'ok');
        setTimeout(() => fetchBitgetDashboard(), 1200);
      } else if (isBybit) {
        await bybitRequest('/v5/position/trading-stop', {}, {
          method: 'POST',
          body: JSON.stringify({
            category: 'linear', symbol: p.symbol,
            takeProfit: tpStr, tpTriggerBy: 'MarkPrice',
            positionIdx: 0,
          }),
        });
        notify(`✓ TP${tpN}#${posIdx+1} impostato a $${fmtPrice(newTP)}`, 'ok');
        setTimeout(() => fetchBitgetDashboard(), 1200);
      } else {
        const existingEntry = window._posTPLines[key];
        const orderId = existingEntry?.orderId || p.takeProfitId || '';
        const size = existingEntry?.size || String(parseFloat(p.total||p.available||0));

        if (orderId) {
          try {
            await bitgetRequest('/api/v2/mix/order/modify-tpsl-order', {}, {
              method: 'POST',
              body: JSON.stringify({ symbol:p.symbol, productType:'USDT-FUTURES', marginCoin:'USDT', orderId, triggerPrice:tpStr, triggerType:'mark_price' }),
            });
            notify(`✓ TP${tpN}#${posIdx+1} aggiornato a $${fmtPrice(newTP)}`, 'ok');
            setTimeout(() => fetchBitgetDashboard(), 1200);
            return;
          } catch(e) { console.warn('modify-tp fallback to place:', e.message); }
        }

        await bitgetRequest('/api/v2/mix/order/place-tpsl-order', {}, {
          method: 'POST',
          body: JSON.stringify({
            symbol:p.symbol, productType:'USDT-FUTURES', marginCoin:'USDT',
            planType:'profit_plan', triggerPrice:tpStr, triggerType:'mark_price',
            executePrice:'0', holdSide:side, size:String(size),
            clientOid:'rf_modtp'+tpN+'_'+Date.now(),
          }),
        });
        notify(`✓ TP${tpN}#${posIdx+1} impostato a $${fmtPrice(newTP)}`, 'ok');
        setTimeout(() => fetchBitgetDashboard(), 1200);
      }

    } catch(e) {
      notify(`✗ Errore TP${tpN}: ` + e.message, 'err');
      console.error('modifyPositionTP:', e);
    }
  };
  // ── MODIFY STOP LOSS POSIZIONE ──
  window.modifyPositionSL = async function(idx) {
    const p = _positions[idx];
    if (!p) return;
    const isBingx = _activeExchange === 'bingx';
    const isWeex  = _activeExchange === 'weex';
    const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';

    const inp = document.getElementById('pos-sl-input-'+idx);
    let newSL = inp ? parseFloat(inp.value) : 0;
    if (!newSL && window._posSLLines[idx]?.price) newSL = window._posSLLines[idx].price;
    if (!newSL || newSL <= 0) { notify('Inserisci un prezzo SL valido', 'err'); return; }

    const side  = (p.holdSide || 'long').toLowerCase();
    const entry = parseFloat(p.openPriceAvg || p.averageOpenPrice || p.openAvgPrice || 0);

    if (side === 'long'  && newSL >= entry) { notify("SL long deve essere sotto l'entry", 'err'); return; }
    if (side === 'short' && newSL <= entry) { notify("SL short deve essere sopra l'entry", 'err'); return; }

    notify('Modifica SL in corso...', '');

    try {
      const cInfo = await fetchContractInfo(p.symbol);
      const slStr = roundToTick(newSL, cInfo.pricePlace).toFixed(cInfo.pricePlace);

      if (isBingx) {
        const bsym = p._bingxSymbol || toBingxSym(p.symbol);
        await bingxRequest('/openApi/swap/v2/trade/order', {}, {
          method: 'POST',
          body: JSON.stringify({
            symbol: bsym,
            side:   side === 'long' ? 'SELL' : 'BUY',
            positionSide: side === 'long' ? 'LONG' : 'SHORT',
            type: 'STOP_MARKET',
            quantity: String(parseFloat(p.total||p.available||0)),
            stopPrice: slStr,
            workingType: 'MARK_PRICE',
          }),
        });
        slpCommitRef(idx, newSL);
        notify(`✓ SL impostato a $${fmtPrice(newSL)}`, 'ok');
        setTimeout(() => fetchBitgetDashboard(), 1500);
      } else if (isWeex) {
        await weexRequest('/capi/v3/placeTpSlOrder', {}, {
          method: 'POST',
          body: JSON.stringify({
            symbol: p.symbol,
            clientAlgoId: 'rf_modsl_'+Date.now(),
            planType: 'STOP_LOSS',
            triggerPrice: slStr,
            executePrice: '0',
            quantity: String(parseFloat(p.total||p.available||0)),
            positionSide: side === 'long' ? 'LONG' : 'SHORT',
            triggerPriceType: 'MARK_PRICE',
          }),
        });
        slpCommitRef(idx, newSL);
        notify(`✓ SL impostato a $${fmtPrice(newSL)}`, 'ok');
        setTimeout(() => fetchBitgetDashboard(), 1500);
      } else if (isBybit) {
        await bybitRequest('/v5/position/trading-stop', {}, {
          method: 'POST',
          body: JSON.stringify({
            category: 'linear', symbol: p.symbol,
            stopLoss: slStr, slTriggerBy: 'MarkPrice',
            positionIdx: 0,
          }),
        });
        slpCommitRef(idx, newSL);
        notify(`✓ SL impostato a $${fmtPrice(newSL)}`, 'ok');
        setTimeout(() => fetchBitgetDashboard(), 1500);
      } else {
        let existingSLIds = [];
        try {
          const tpslData = await bitgetRequest('/api/v2/mix/order/orders-plan-pending', { productType:'USDT-FUTURES', planType:'profit_loss' });
          let tpslArr = tpslData.data?.entrustedList || tpslData.data?.list || tpslData.data || [];
          if (!Array.isArray(tpslArr)) tpslArr = tpslArr ? [tpslArr] : [];
          existingSLIds = tpslArr
            .filter(o => { const oSide=(o.posSide||o.holdSide||'').toLowerCase(); const pt=(o.planType||'').toLowerCase(); return pt.includes('loss') && oSide===side; })
            .map(o => ({ orderId:o.orderId, planType:o.planType }))
            .filter(o => o.orderId);
        } catch(e) { console.warn('[modSL] fetch failed:', e.message); }

        for (const slOrd of existingSLIds) {
          try {
            await bitgetRequest('/api/v2/mix/order/cancel-plan-order', {}, {
              method:'POST',
              body:JSON.stringify({ symbol:p.symbol, productType:'USDT-FUTURES', marginCoin:'USDT', orderId:slOrd.orderId, planType:slOrd.planType }),
            });
          } catch(e) { console.warn('[modSL] cancel failed:', slOrd.orderId, e.message); }
        }

        await bitgetRequest('/api/v2/mix/order/place-tpsl-order', {}, {
          method:'POST',
          body:JSON.stringify({
            symbol:p.symbol, productType:'USDT-FUTURES', marginCoin:'USDT',
            planType:'loss_plan', triggerPrice:slStr, triggerType:'mark_price',
            executePrice:'0', holdSide:side,
            size:String(parseFloat(p.total||p.available||0)),
            clientOid:'rf_modsl_'+Date.now(),
          }),
        });

        const msg = existingSLIds.length > 0
          ? `✓ SL aggiornato a $${fmtPrice(newSL)} (rimossi ${existingSLIds.length} SL precedenti)`
          : `✓ SL impostato a $${fmtPrice(newSL)}`;
        slpCommitRef(idx, newSL);
        notify(msg, 'ok');
        setTimeout(() => fetchBitgetDashboard(), 1500);
      }

    } catch(e) {
      notify('✗ Errore SL: ' + e.message, 'err');
      console.error('modifyPositionSL:', e);
    }
  };
  // ── MOVE TO BREAKEVEN ──
  window.moveToBreakeven = async function(idx) {
    const p = _positions[idx];
    if (!p) return;
    const isBingx = _activeExchange === 'bingx';
    const isWeex  = _activeExchange === 'weex';
    const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';

    const entry = parseFloat(p.openPriceAvg || p.averageOpenPrice || p.openAvgPrice || 0);
    if (!entry || entry <= 0) { notify('Prezzo entry non disponibile', 'err'); return; }

    const side = (p.holdSide || 'long').toLowerCase();
    const sym  = (p.symbol || '').replace('_UMCBL','').replace('_DMCBL','').replace('UMCBL','').replace('DMCBL','').replace('-USDT','USDT');

    if (!confirm('Spostare lo SL a Breakeven ($'+fmtPrice(entry)+') per '+sym+' '+side.toUpperCase()+'?')) return;

    notify('Imposto BE in corso...', '');

    try {
      const cInfo = await fetchContractInfo(p.symbol);
      const beStr = roundToTick(entry, cInfo.pricePlace).toFixed(cInfo.pricePlace);

      if (isBingx) {
        const bsym = p._bingxSymbol || toBingxSym(p.symbol);
        await bingxRequest('/openApi/swap/v2/trade/order', {}, {
          method: 'POST',
          body: JSON.stringify({
            symbol: bsym,
            side:   side === 'long' ? 'SELL' : 'BUY',
            positionSide: side === 'long' ? 'LONG' : 'SHORT',
            type: 'STOP_MARKET',
            quantity: String(parseFloat(p.total||p.available||0)),
            stopPrice: beStr,
            workingType: 'MARK_PRICE',
          }),
        });
      } else if (isWeex) {
        await weexRequest('/capi/v3/placeTpSlOrder', {}, {
          method: 'POST',
          body: JSON.stringify({
            symbol: p.symbol,
            clientAlgoId: 'rf_be_'+Date.now(),
            planType: 'STOP_LOSS',
            triggerPrice: beStr,
            executePrice: '0',
            quantity: String(parseFloat(p.total||p.available||0)),
            positionSide: side === 'long' ? 'LONG' : 'SHORT',
            triggerPriceType: 'MARK_PRICE',
          }),
        });
      } else if (isBybit) {
        await bybitRequest('/v5/position/trading-stop', {}, {
          method: 'POST',
          body: JSON.stringify({
            category: 'linear', symbol: p.symbol,
            stopLoss: beStr, slTriggerBy: 'MarkPrice',
            positionIdx: 0,
          }),
        });
      } else {
        let existingSLIds = [];
        try {
          const tpslData = await bitgetRequest('/api/v2/mix/order/orders-plan-pending', { productType:'USDT-FUTURES', planType:'profit_loss' });
          let tpslArr = tpslData.data?.entrustedList || tpslData.data?.list || tpslData.data || [];
          if (!Array.isArray(tpslArr)) tpslArr = tpslArr ? [tpslArr] : [];
          existingSLIds = tpslArr
            .filter(o => { const oSide=(o.posSide||o.holdSide||'').toLowerCase(); const pt=(o.planType||'').toLowerCase(); return pt.includes('loss') && oSide===side; })
            .map(o => ({ orderId:o.orderId, planType:o.planType }))
            .filter(o => o.orderId);
        } catch(e) { console.warn('[BE] fetch tpsl failed:', e.message); }

        for (const slOrd of existingSLIds) {
          try {
            await bitgetRequest('/api/v2/mix/order/cancel-plan-order', {}, {
              method:'POST',
              body:JSON.stringify({ symbol:p.symbol, productType:'USDT-FUTURES', marginCoin:'USDT', orderId:slOrd.orderId, planType:slOrd.planType }),
            });
          } catch(e) { console.warn('[BE] cancel SL failed:', e.message); }
        }

        await bitgetRequest('/api/v2/mix/order/place-tpsl-order', {}, {
          method:'POST',
          body:JSON.stringify({
            symbol:p.symbol, productType:'USDT-FUTURES', marginCoin:'USDT',
            planType:'loss_plan', triggerPrice:beStr, triggerType:'mark_price',
            executePrice:'0', holdSide:side,
            size:String(parseFloat(p.total||p.available||0)),
            clientOid:'rf_be_'+Date.now(),
          }),
        });
      }

      const inp = document.getElementById('pos-sl-input-' + idx);
      if (inp) { inp.value = fmtPrice(entry); syncPosSlLine(idx); }

      notify('✓ BE impostato a $'+fmtPrice(entry)+' per '+sym, 'ok');
      setTimeout(() => fetchBitgetDashboard(), 1500);

    } catch(e) {
      notify('✗ Errore BE: ' + e.message, 'err');
      console.error('moveToBreakeven:', e);
    }
  };

  window.togglePosExpand = function(idx) {
    const exp = document.getElementById('pos-exp-'+idx);
    if (!exp) return;
    const isOpen = exp.classList.contains('open');
    document.querySelectorAll('.pos-expand').forEach(e=>e.classList.remove('open'));
    if (!isOpen) {
      exp.classList.add('open');
      // Switch chart al simbolo della posizione
      const p = _positions[idx];
      if (p) {
        const sym = (p.symbol || '').replace(/_?(UMCBL|DMCBL)/gi,'');
        if (sym && sym !== S.symbol) {
          S.symbol = sym;
          document.getElementById('symInput').textContent = sym;
          clearAll();
          loadCandles(sym, S.tf);
        }
      }
    }
  };

  window.updatePctDisplay = function(idx, size, upnl) {
    const slider = document.getElementById('pct-slider-'+idx);
    const pct = parseInt(slider.value);
    const pnlSlice = upnl*(pct/100);
    document.getElementById('pct-val-'+idx).textContent = pct+'%';
    document.getElementById('pct-usd-'+idx).textContent =
      (pnlSlice>=0?'+':'')+'$'+fmt(pnlSlice)+' P&L · '+fmt(size*(pct/100))+' cont';
    document.querySelectorAll(`#pos-exp-${idx} .pct-preset`).forEach(el=>{
      el.classList.toggle('active', parseInt(el.textContent)===pct);
    });
  };

  window.setPct = function(idx, pct, size, upnl) {
    const slider = document.getElementById('pct-slider-'+idx);
    if (!slider) return;
    slider.value = pct;
    updatePctDisplay(idx, size, upnl);
  };

  // ── POSITION MODAL ──
  let _posAction = null; // {idx, type:'partial'|'full'}

  window.openPosModal = function(idx, type) {
    event.stopPropagation();
    const p = _positions[idx];
    if (!p) return;
    const sym   = (p.symbol||'').replace('_UMCBL','').replace('_DMCBL','').replace('UMCBL','').replace('DMCBL','');
    const side  = (p.holdSide||'long').toLowerCase();
    const upnl  = parseFloat(p.unrealizedPL||p.unrealizedProfitLoss||p.unrealizedPnl||0);
    const entry = parseFloat(p.openPriceAvg||p.averageOpenPrice||p.openAvgPrice||0);
    const markPx= parseFloat(p.markPrice||p.marketPrice||entry);
    const size  = parseFloat(p.total||p.available||p.totalPos||0);
    const notional = size*(markPx||entry);
    const lev   = parseFloat(p.leverage||1);
    const margin = notional/lev;

    const slider = document.getElementById('pct-slider-'+idx);
    const pct = type==='full' ? 100 : (slider ? parseInt(slider.value) : 25);
    const closeSize = size*(pct/100);
    const closeNotional = notional*(pct/100);
    const closePnl = upnl*(pct/100);

    _posAction = {idx, type, pct, sym, side, closeSize, p};

    document.getElementById('pmTitle').textContent = type==='full' ? 'Chiudi posizione' : 'Chiudi parziale';
    document.getElementById('pmSub').textContent = sym+' · '+side.toUpperCase()+' · Market';
    document.getElementById('pmRows').innerHTML = `
      <div class="pos-modal-row"><span class="pml">Chiudi</span><span class="pmv acc">${pct}% · ${fmt(closeSize)} cont</span></div>
      <div class="pos-modal-divider"></div>
      <div class="pos-modal-row"><span class="pml" style="font-size:11px;color:var(--text)">P&L stimato</span><span class="pmv" style="font-size:16px;font-family:'Syne',sans-serif;font-weight:700;color:var(--${closePnl>=0?'green':'red'})">${closePnl>=0?'+':''}$${fmt(Math.abs(closePnl))}</span></div>
      <div class="pos-modal-divider"></div>
      <div class="pos-modal-row"><span class="pml">Valore chiuso</span><span class="pmv">$${fmt(closeNotional)}</span></div>
      <div class="pos-modal-row"><span class="pml">Rimane aperto</span><span class="pmv yel">${fmt(size-closeSize)} cont (${100-pct}%)</span></div>
    `;
    const btn = document.getElementById('pmConfirmBtn');
    btn.textContent = type==='full' ? 'Chiudi tutto' : `Chiudi ${pct}%`;
    btn.className = 'pmb-confirm '+(type==='full'?'full':'partial');
    document.getElementById('posModal').classList.add('open');
  };

  window.closePosModal = function() {
    document.getElementById('posModal').classList.remove('open');
    _posAction = null;
  };

  window.executePosAction = async function() {
    if (!_posAction) return;
    const {idx, type, pct, sym, side, p} = _posAction;
    const btn = document.getElementById('pmConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Invio...';
    const isBingx = _activeExchange === 'bingx';
    const isWeex  = _activeExchange === 'weex';
    const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';

    try {
      const totalSize = parseFloat(p.total||p.totalPos||p.available||0);
      if (!totalSize || totalSize <= 0) throw new Error('Nessuna posizione aperta');

      if (isBingx) {
        // ─── BINGX CLOSE ───
        const bsym = p._bingxSymbol || toBingxSym(p.symbol);
        const closeSide = side === 'long' ? 'SELL' : 'BUY';
        const posSide   = side === 'long' ? 'LONG' : 'SHORT';
        if (type === 'full') {
          await bingxRequest('/openApi/swap/v2/trade/closeAllPositions', {}, {
            method: 'POST',
            body: JSON.stringify({ symbol: bsym }),
          });
        } else {
          const raw = totalSize * (pct / 100);
          const srcDecimals = (String(totalSize).split('.')[1]||'').length;
          const factor = Math.pow(10, Math.min(srcDecimals,6));
          const qty = String(Math.floor(raw * factor) / factor || totalSize);
          await bingxRequest('/openApi/swap/v2/trade/order', {}, {
            method: 'POST',
            body: JSON.stringify({
              symbol: bsym, side: closeSide, positionSide: posSide,
              type: 'MARKET', quantity: qty,
            }),
          });
        }
      } else if (isWeex) {
        // ─── WEEX CLOSE ───
        if (type === 'full') {
          await weexRequest('/capi/v3/closePositions', {}, {
            method: 'POST',
            body: JSON.stringify({symbol: p.symbol}),
          });
        } else {
          const raw = totalSize * (pct / 100);
          const srcDecimals = (String(totalSize).split('.')[1]||'').length;
          const factor = Math.pow(10, Math.min(srcDecimals,6));
          const qty = Math.floor(raw * factor) / factor || totalSize;
          await weexRequest('/capi/v3/order', {}, {
            method: 'POST',
            body: JSON.stringify({
              symbol: p.symbol,
              side:   side === 'long' ? 'SELL' : 'BUY',
              positionSide: side === 'long' ? 'LONG' : 'SHORT',
              type:   'MARKET',
              quantity: String(qty),
              newClientOrderId: 'rf_close_'+Date.now(),
            }),
          });
        }
      } else if (isBybit) {
        // ─── BYBIT CLOSE ───
        const bybitSide = side === 'long' ? 'Sell' : 'Buy';
        if (type === 'full') {
          await bybitRequest('/v5/order/create', {}, {
            method: 'POST',
            body: JSON.stringify({
              category:'linear', symbol:p.symbol, side:bybitSide,
              orderType:'Market', qty:String(totalSize), reduceOnly:true,
            }),
          });
        } else {
          const raw = totalSize * (pct / 100);
          const srcDecimals = (String(totalSize).split('.')[1]||'').length;
          const factor = Math.pow(10, Math.min(srcDecimals,4));
          const qty = Math.floor(raw * factor) / factor || totalSize;
          await bybitRequest('/v5/order/create', {}, {
            method: 'POST',
            body: JSON.stringify({
              category:'linear', symbol:p.symbol, side:bybitSide,
              orderType:'Market', qty:String(qty), reduceOnly:true,
            }),
          });
        }
      } else {
        // ─── BITGET CLOSE ───
        const closeSide = side==='long' ? 'buy' : 'sell';
        let endpoint, body;

        if (type === 'full') {
          endpoint = '/api/v2/mix/order/close-positions';
          body = JSON.stringify({symbol:p.symbol, productType:'USDT-FUTURES', holdSide:side});
        } else {
          const raw = totalSize * (pct / 100);
          const srcDecimals = (String(totalSize).split('.')[1]||'').length;
          const decimals = Math.min(srcDecimals, 4);
          const factor = Math.pow(10, decimals);
          const qty = decimals > 0 ? Math.floor(raw * factor) / factor : Math.floor(raw);
          if (qty <= 0) {
            endpoint = '/api/v2/mix/order/close-positions';
            body = JSON.stringify({symbol:p.symbol, productType:'USDT-FUTURES', holdSide:side});
          } else {
            endpoint = '/api/v2/mix/order/place-order';
            body = JSON.stringify({
              symbol:p.symbol, productType:'USDT-FUTURES',
              marginMode:p.marginMode||'crossed', marginCoin:'USDT',
              size:String(qty), side:closeSide, tradeSide:'close', orderType:'market',
            });
          }
        }
        await bitgetRequest(endpoint, {}, {method:'POST', body});
      }

      closePosModal();
      notify(type==='full'?`Chiusa ${sym}`:`Parziale ${sym} -${pct}%`, 'ok');
      setTimeout(()=>fetchBitgetDashboard(), 1500);
    } catch(e) {
      notify('Errore: '+e.message, 'err');
      btn.disabled = false;
      btn.textContent = type==='full' ? 'Chiudi tutto' : `Chiudi ${pct}%`;
    }
  }

  // ── AUTH STATE ──
  onAuthStateChanged(auth, async user => {
    if (user) {
      currentUser = user;
      try {
        const snap = await getDoc(doc(db,'profiles',user.uid));
        const username = snap.exists() ? snap.data().username : user.email;
        await syncKeysFromFirestore(user.uid);
        rfShowApp(username);
        // Auto-fetch dashboard se keys presenti per l'exchange attivo
        const activeKeys = loadActiveKeys();
        if (activeKeys.apiKey) setTimeout(()=>fetchBitgetDashboard(), 1500);
      } catch { rfShowApp(user.email); }
    } else {
      currentUser = null;
      document.getElementById('auth-overlay').classList.remove('hidden');
      document.getElementById('userBadge').classList.remove('visible');
    }
  });

  function rfShowBetaPopup() {
    const key = 'rf_beta_popup_shown';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const overlay = document.createElement('div');
    overlay.id = 'betaPopupOverlay';
    overlay.innerHTML = `
      <div class="beta-popup">
        <div class="beta-popup-header">
          <span class="beta-badge">🚧 BETA</span>
          <button class="beta-popup-close" onclick="document.getElementById('betaPopupOverlay').remove()">✕</button>
        </div>
        <p class="beta-popup-title">Siamo in Beta!</p>
        <p class="beta-popup-sub">Stiamo ancora testando e migliorando la piattaforma.</p>
        <ul class="beta-popup-list">
          <li>👉 Le informazioni presenti <strong>non sono consigli finanziari</strong> né inviti al trading</li>
          <li>👉 L'uso delle API è <strong>sotto la tua responsabilità</strong></li>
          <li>👉 Per maggiore sicurezza, ti consigliamo di utilizzare un <strong>subaccount</strong></li>
          <li>👉 Si consiglia di tenere <strong>disabilitata</strong> la funzione di withdraw</li>
        </ul>
        <p class="beta-popup-thanks">Grazie per aiutarci a migliorare 🙌</p>
        <button class="beta-popup-btn" onclick="document.getElementById('betaPopupOverlay').remove()">Ho capito</button>
      </div>`;
    document.body.appendChild(overlay);
  }

  function rfShowApp(username) {
    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('userBadge').classList.add('visible');
    document.getElementById('rfUsername').textContent = username;
    rfShowBetaPopup();
    if(!_appInitDone){ _appInitDone=true;
      const isBingx = _activeExchange === 'bingx';
      const isWeex  = _activeExchange === 'weex';
      const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';
      (isBingx ? loadBingxPairs() : isWeex ? loadWeexPairs() : isBybit ? loadBybitPairs() : loadBitgetPairs()).then(()=>loadCandles(S.symbol, S.tf));
      // ── Daily Loss Limit — init UI e riprendi countdown se era già scattato
      dllRenderUI();
      if(dllIsLocked()) dllStartCountdown();
      // ── SL Protect — init UI
      slpRenderUI();
      feeRenderUI();
    }
  }

  // ── TAB SWITCH ──
  window.rfSwitchTab = function(tab) {
    ['login','register','forgot'].forEach((t,i)=>{
      document.getElementById('rf-form-'+t).classList.toggle('hidden',t!==tab);
      document.querySelectorAll('.auth-tab')[i].classList.toggle('active',t===tab);
    });
  };

  // ── LOGIN ──
  window.rfDoLogin = async function() {
    const user = document.getElementById('rf-login-user').value.trim();
    const pass = document.getElementById('rf-login-pass').value;
    const errEl = document.getElementById('rf-login-err');
    const btn   = document.getElementById('rf-login-btn');
    if (!user||!pass) { errEl.textContent='Compila tutti i campi.'; return; }
    btn.disabled=true; errEl.textContent='';
    try {
      const q = query(collection(db,'usernames'), where('username','==',user.toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) { errEl.textContent='Username non trovato.'; btn.disabled=false; return; }
      await signInWithEmailAndPassword(auth, snap.docs[0].data().email, pass);
    } catch(e) {
      errEl.textContent = e.code==='auth/wrong-password' ? 'Password errata.' : 'Credenziali non valide.';
      btn.disabled=false;
    }
  };

  // ── REGISTER ──
  window.rfDoRegister = async function() {
    const user  = document.getElementById('rf-reg-user').value.trim().toLowerCase();
    const email = document.getElementById('rf-reg-email').value.trim();
    const pass  = document.getElementById('rf-reg-pass').value;
    const gdpr  = document.getElementById('rf-reg-gdpr').checked;
    const errEl = document.getElementById('rf-reg-err');
    const btn   = document.getElementById('rf-reg-btn');
    if (!gdpr)  { errEl.textContent='Accetta la Privacy Policy.'; return; }
    if (!user||!email||!pass) { errEl.textContent='Compila tutti i campi.'; return; }
    if (user.length<3) { errEl.textContent='Username minimo 3 caratteri.'; return; }
    if (pass.length<6) { errEl.textContent='Password minimo 6 caratteri.'; return; }
    btn.disabled=true; errEl.textContent='';
    try {
      const unameDoc = await getDoc(doc(db,'usernames',user));
      if (unameDoc.exists()) { errEl.textContent='Username già in uso.'; btn.disabled=false; return; }
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await setDoc(doc(db,'usernames',user), {username:user,email,uid:cred.user.uid});
      await setDoc(doc(db,'profiles',cred.user.uid), {username:user,createdAt:Date.now()});
    } catch(e) {
      let msg='Errore durante la registrazione.';
      if (e.code==='auth/email-already-in-use') msg='Email già registrata.';
      if (e.code==='auth/invalid-email') msg='Email non valida.';
      errEl.textContent=msg; btn.disabled=false;
    }
  };

  // ── FORGOT ──
  window.rfDoForgot = async function() {
    const email = document.getElementById('rf-forgot-email').value.trim();
    const errEl = document.getElementById('rf-forgot-err');
    const okEl  = document.getElementById('rf-forgot-ok');
    const btn   = document.getElementById('rf-forgot-btn');
    if (!email) { errEl.textContent='Inserisci la tua email.'; return; }
    btn.disabled=true;
    try {
      await sendPasswordResetEmail(auth, email);
      okEl.textContent='Email inviata!'; errEl.textContent='';
    } catch { errEl.textContent='Email non trovata.'; okEl.textContent=''; }
    btn.disabled=false;
  };

  // ── LOGOUT ──
  window.rfDoLogout = async function() {
    await signOut(auth);
    localStorage.removeItem('bitget_api_key');
    localStorage.removeItem('bitget_api_secret');
    localStorage.removeItem('bitget_api_passphrase');
    localStorage.removeItem('bybit_api_key');
    localStorage.removeItem('bybit_api_secret');
    localStorage.removeItem('weex_api_key');
    localStorage.removeItem('weex_api_secret');
    localStorage.removeItem('weex_api_passphrase');
    localStorage.removeItem('bingx_api_key');
    localStorage.removeItem('bingx_api_secret');
    document.getElementById('auth-overlay').classList.remove('hidden');
    document.getElementById('userBadge').classList.remove('visible');
  };

  // ── EXCHANGE SELECTOR ──
  // Exchange attivo: 'bitget' | 'bybit' | 'bybit_demo'
  let _activeExchange = localStorage.getItem('rf_exchange') || 'bitget';
  window._activeExchange = _activeExchange; // init globale
  let _appInitDone = false; // dichiarato qui per essere accessibile a rfSelectExchange

  window.rfSelectExchange = function(ex) {
    _activeExchange = ex;
    window._activeExchange = ex;
    localStorage.setItem('rf_exchange', ex);
    ['bitget','bybit','bybit_demo','weex','bingx'].forEach(e => {
      const idMap = {bitget:'exBtnBitget', bybit:'exBtnBybit', bybit_demo:'exBtnBybitDemo', weex:'exBtnWeex', bingx:'exBtnBingx'};
      const btn = document.getElementById(idMap[e]);
      if(btn) btn.classList.toggle('active', e === ex);
    });
    // Passphrase: solo Bitget e Weex
    const passRow = document.getElementById('apiPassRow');
    if(passRow) passRow.style.display = (ex === 'bitget' || ex === 'weex') ? '' : 'none';
    const keyInput = document.getElementById('apiKeyInput');
    if(keyInput) keyInput.placeholder = ex === 'weex' ? 'la tua API key Weex' : ex === 'bingx' ? 'la tua API key BingX' : ex === 'bitget' ? 'la tua API key Bitget' : 'la tua API key Bybit';
    document.getElementById('apiKeyInput').value = '';
    document.getElementById('apiSecretInput').value = '';
    document.getElementById('apiPassInput').value = '';
    const statusEl = document.getElementById('apiStatus');
    if(statusEl){ statusEl.textContent = ''; statusEl.className = 'api-status'; }
    if(window.rfLoadApiKeysUI) window.rfLoadApiKeysUI();
    feeRenderUI(); // aggiorna campo fee per il nuovo exchange
    if (_appInitDone) {
      _contractInfoCache && Object.keys(_contractInfoCache).forEach(k => delete _contractInfoCache[k]);
      ASSETS.length = 0;
      const isBingxEx = ex === 'bingx';
      const isWeexEx  = ex === 'weex';
      const isBybitEx = ex === 'bybit' || ex === 'bybit_demo';
      (isBingxEx ? loadBingxPairs() : isWeexEx ? loadWeexPairs() : isBybitEx ? loadBybitPairs() : loadBitgetPairs()).then(() => loadCandles(S.symbol, S.tf));
    }
  };

  // Inizializza UI exchange al caricamento del modal (solo aggiorna tab, NON ricarica chart)
  const _initExchangeUI = () => {
    const ex = _activeExchange;
    ['bitget','bybit','bybit_demo','weex','bingx'].forEach(e => {
      const idMap = {bitget:'exBtnBitget', bybit:'exBtnBybit', bybit_demo:'exBtnBybitDemo', weex:'exBtnWeex', bingx:'exBtnBingx'};
      const btn = document.getElementById(idMap[e]);
      if(btn) btn.classList.toggle('active', e === ex);
    });
    const passRow = document.getElementById('apiPassRow');
    if(passRow) passRow.style.display = (ex === 'bitget' || ex === 'weex') ? '' : 'none';
    const keyInput = document.getElementById('apiKeyInput');
    if(keyInput) keyInput.placeholder = ex === 'weex' ? 'la tua API key Weex' : ex === 'bingx' ? 'la tua API key BingX' : ex === 'bitget' ? 'la tua API key Bitget' : 'la tua API key Bybit';
  };

  // ── API KEYS UI ──
  window.rfLoadApiKeysUI = function() {
    _initExchangeUI();
    const statusEl = document.getElementById('apiStatus');
    const ex = _activeExchange || 'bitget';
    const isWeex  = ex === 'weex';
    const isBingx = ex === 'bingx';
    const isBybit = ex === 'bybit' || ex === 'bybit_demo';
    const lsKey = _lsKeysFor(ex).k;
    const localKey = localStorage.getItem(lsKey);
    if (localKey) {
      document.getElementById('apiKeyInput').value = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
      document.getElementById('apiSecretInput').value = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
      if (isWeex) document.getElementById('apiPassInput').value = localStorage.getItem('weex_api_passphrase') ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '';
      else if (!isBybit && !isBingx) document.getElementById('apiPassInput').value = localStorage.getItem('bitget_api_passphrase') ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '';
      if (statusEl) { statusEl.textContent='\u2713 API keys caricate'; statusEl.className='api-status ok'; }
    } else {
      if (statusEl) { statusEl.textContent='Nessuna API key salvata per ' + ex; statusEl.className='api-status err'; }
    }
  };

  window.rfSaveApiKeys = function() {
    const k = document.getElementById('apiKeyInput').value.trim();
    const s = document.getElementById('apiSecretInput').value.trim();
    const p = document.getElementById('apiPassInput').value.trim();
    const statusEl = document.getElementById('apiStatus');
    const ex = _activeExchange || 'bitget';
    const isWeex  = ex === 'weex';
    const isBingx = ex === 'bingx';
    const isBybit = ex === 'bybit' || ex === 'bybit_demo';
    if (!k||!s) { if(statusEl){statusEl.textContent='API Key e Secret obbligatori';statusEl.className='api-status err';} return; }

    const lsKeys = _lsKeysFor(ex);
    const lsKey    = lsKeys.k;
    const lsSecret = lsKeys.s;
    const lsPass   = lsKeys.p;
    const finalK = k.includes('•') ? localStorage.getItem(lsKey)||k : k;
    const finalS = s.includes('•') ? localStorage.getItem(lsSecret)||s : s;
    const finalP = lsPass && p.includes('•') ? localStorage.getItem(lsPass)||p : p;

    localStorage.setItem(lsKey, finalK);
    localStorage.setItem(lsSecret, finalS);
    if (lsPass && finalP) localStorage.setItem(lsPass, finalP);
    localStorage.setItem('rf_exchange', ex);
    document.getElementById('apiModal').classList.remove('open');
    notify('API keys salvate ✓','ok');
    setTimeout(()=>fetchBitgetDashboard(), 500);
  };

  window.rfDeleteApiKeys = function() {
    const ex = _activeExchange || 'bitget';
    const isWeex  = ex === 'weex';
    const isBingx = ex === 'bingx';
    const isBybit = ex === 'bybit' || ex === 'bybit_demo';
    if (!confirm('Eliminare le API keys per ' + ex + '?')) return;
    const lsKeys = _lsKeysFor(ex);
    localStorage.removeItem(lsKeys.k);
    localStorage.removeItem(lsKeys.s);
    if (lsKeys.p) localStorage.removeItem(lsKeys.p);
    document.getElementById('apiKeyInput').value='';
    document.getElementById('apiSecretInput').value='';
    document.getElementById('apiPassInput').value='';
    const statusEl = document.getElementById('apiStatus');
    if (statusEl) { statusEl.textContent='Nessuna API key salvata per ' + ex; statusEl.className='api-status err'; }
    document.getElementById('apiModal').classList.remove('open');
    document.getElementById('accBalance').textContent='—';
    S.balance=4250;
    notify('API keys ' + ex + ' eliminate ✓','ok');
  };

  // ── EXPORT / IMPORT JSON ──
  window.rfExportApiKeys = function() {
    const exchanges = ['bitget', 'bybit', 'bybit_demo', 'weex', 'bingx'];
    const data = { version: 1, exportedAt: new Date().toISOString(), keys: {} };
    exchanges.forEach(ex => {
      const lk = _lsKeysFor(ex);
      const k = localStorage.getItem(lk.k);
      const s = localStorage.getItem(lk.s);
      const p = lk.p ? localStorage.getItem(lk.p) : null;
      if (k) data.keys[ex] = { apiKey: k, secret: s || '', passphrase: p || '' };
    });
    data.activeExchange = localStorage.getItem('rf_exchange') || 'bitget';
    if (!Object.keys(data.keys).length) { notify('Nessuna API key da esportare', 'err'); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'riskflow-api-keys.json';
    a.click();
    URL.revokeObjectURL(url);
    notify('Chiavi esportate ✓', 'ok');
  };

  window.rfImportApiKeys = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.keys || typeof data.keys !== 'object') throw new Error('Formato non valido');
        const exchanges = ['bitget', 'bybit', 'bybit_demo', 'weex', 'bingx'];
        let count = 0;
        exchanges.forEach(ex => {
          const entry = data.keys[ex];
          if (!entry || !entry.apiKey) return;
          const lk = _lsKeysFor(ex);
          localStorage.setItem(lk.k, entry.apiKey);
          localStorage.setItem(lk.s, entry.secret || '');
          if (lk.p && entry.passphrase) localStorage.setItem(lk.p, entry.passphrase);
          count++;
        });
        if (data.activeExchange && exchanges.includes(data.activeExchange)) {
          localStorage.setItem('rf_exchange', data.activeExchange);
          _activeExchange = data.activeExchange;
          window._activeExchange = data.activeExchange;
        }
        notify(count + ' exchange importati ✓', 'ok');
        if (window.rfLoadApiKeysUI) window.rfLoadApiKeysUI();
      } catch(err) {
        notify('Errore importazione: ' + err.message, 'err');
      }
      // Reset input so the same file can be re-selected
      input.value = '';
    };
    reader.readAsText(file);
  };

  // ── SYNC MANUALE ──
  window.rfBitgetSync = function() { fetchBitgetDashboard(); };

  // Esponi per il refresh button del panel
  window.refreshAccount = function() {
    const isBingx = _activeExchange === 'bingx';
    const isWeex  = _activeExchange === 'weex';
    const isBybit = _activeExchange === 'bybit' || _activeExchange === 'bybit_demo';
    const {apiKey} = isBingx ? loadBingxKeys() : isWeex ? loadWeexKeys() : isBybit ? loadBybitKeys() : loadBitgetKeys();
    if (apiKey) fetchBitgetDashboard();
    else notify('API non configurate per ' + (_activeExchange||'bitget'), 'err');
  };

})();
