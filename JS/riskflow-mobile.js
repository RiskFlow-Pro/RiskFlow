// ═══════════════════════════════════════════════════════════════
//  riskflow-mobile.js  — Standalone mobile build
//  Nessuna dipendenza da riskflow.js o riskflow-mobile-patch.js
//  Tutti gli ID usati sono quelli NATIVI del mobile.html (m-*)
// ═══════════════════════════════════════════════════════════════

'use strict';

// ─── DAILY LOSS LIMIT ─────────────────────────────────────────
const DLL_KEY_EN   = 'dll_enabled';
const DLL_KEY_PCT  = 'dll_pct';
const DLL_KEY_TS   = 'dll_triggered_at';
const DLL_KEY_SNAP = 'dll_balance_snapshot';
const DLL_LOCK_MS  = 24 * 60 * 60 * 1000;

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
function dllIsLocked() {
  const d = dllLoad();
  if (!d.enabled || !d.triggeredAt) return false;
  return (Date.now() - d.triggeredAt) < DLL_LOCK_MS;
}
function dllRemainingMs() {
  const d = dllLoad();
  if (!d.triggeredAt) return 0;
  const rem = DLL_LOCK_MS - (Date.now() - d.triggeredAt);
  return rem > 0 ? rem : 0;
}
function dllFmtCountdown(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
function dllRenderUI() {
  const sw    = document.getElementById('dllSw');
  if (!sw) return;
  const d      = dllLoad();
  const locked = dllIsLocked();
  const lbl    = document.getElementById('dllLbl');
  const tgl    = document.getElementById('dllToggle');
  const sett   = document.getElementById('dllSettings');
  const banner = document.getElementById('dllBanner');
  const pctEl  = document.getElementById('dllPct');
  sw.classList.toggle('on', d.enabled);
  if (lbl) lbl.textContent = d.enabled ? 'ON' : 'OFF';
  if (tgl) tgl.classList.toggle('locked', locked);
  if (sett)   sett.style.display   = (d.enabled && !locked) ? '' : 'none';
  if (banner) banner.style.display = locked ? '' : 'none';
  if (pctEl && d.pct) pctEl.value = d.pct;
}
window.dllToggleSwitch = function() {
  if (dllIsLocked()) { notify('Blocco attivo per altre ' + dllFmtCountdown(dllRemainingMs()), 'err'); return; }
  const d = dllLoad();
  d.enabled = !d.enabled;
  if (d.enabled) {
    const wb = (S.walletBalance > 0) ? S.walletBalance : (S.balance > 0 ? S.balance : 0);
    if (wb <= 0) { notify('⚠️ Sincronizza il conto prima di attivare il Daily Loss Limit', 'err'); return; }
    d.snapshot = wb;
  } else {
    d.triggeredAt = 0; d.snapshot = 0;
  }
  dllSave(d); dllRenderUI();
};
function dllCheckBalance(currentBalance) {
  const d = dllLoad();
  if (!d.enabled || dllIsLocked() || !d.snapshot || d.snapshot <= 0) return;
  const lossPct = ((d.snapshot - currentBalance) / d.snapshot) * 100;
  if (lossPct >= d.pct) {
    d.triggeredAt = Date.now(); dllSave(d); dllRenderUI();
    notify(`🛑 Daily Loss Limit scattato! (-${lossPct.toFixed(2)}%) — trading bloccato 24h`, 'err');
    dllStartCountdown();
  }
}
let _dllTimer = null;
function dllStartCountdown() {
  if (_dllTimer) clearInterval(_dllTimer);
  _dllTimer = setInterval(() => {
    const rem = dllRemainingMs();
    const el  = document.getElementById('dllCountdown');
    if (rem <= 0) {
      clearInterval(_dllTimer); _dllTimer = null;
      const d = dllLoad();
      d.triggeredAt = 0;
      d.snapshot = (S.walletBalance > 0 ? S.walletBalance : (S.balance > 0 ? S.balance : 0));
      dllSave(d); dllRenderUI();
      notify('✅ Daily Loss Limit: blocco scaduto, trading ripristinato', 'ok');
    } else {
      if (el) el.textContent = 'Sblocco tra: ' + dllFmtCountdown(rem);
    }
  }, 1000);
}
window.dllSaveSettings = function() {
  const el = document.getElementById('dllPct');
  if (!el) return;
  const pct = parseFloat(el.value);
  if (isNaN(pct) || pct <= 0) return;
  const d = dllLoad(); d.pct = pct; dllSave(d);
};
function dllGuard() {
  if (!dllIsLocked()) return false;
  notify(`🛑 Trading bloccato — DLL attivo. Sblocco tra ${dllFmtCountdown(dllRemainingMs())}`, 'err');
  return true;
}

// ─── SL PROTECT ───────────────────────────────────────────────
const SLP_KEY = 'slp_enabled';
function slpLoad() { return localStorage.getItem(SLP_KEY) === 'true'; }
function slpSave(v) { localStorage.setItem(SLP_KEY, v ? 'true' : 'false'); }
function slpIsLocked() { return slpLoad() && window._positions && window._positions.length > 0; }
function slpRenderUI() {
  const wrap  = document.getElementById('slpWrap');
  const state = document.getElementById('slpState');
  if (!wrap) return;
  const on = slpLoad(), locked = slpIsLocked();
  wrap.classList.toggle('on', on);
  wrap.classList.toggle('locked', locked);
  wrap.style.cursor = locked ? 'not-allowed' : 'pointer';
  if (state) state.textContent = locked ? '🔒' : on ? 'ON' : 'OFF';
}
window.slpToggle = function() {
  if (slpIsLocked()) { notify('🛡 SL Shield bloccato — posizioni aperte', 'err'); return; }
  const on = !slpLoad(); slpSave(on); slpRenderUI();
  notify(on ? '🛡 SL Shield ON' : 'SL Shield OFF', on ? 'ok' : '');
};
function slpCheck(newSL, refSL, side, silent) {
  if (!slpLoad() || !newSL || !refSL) return true;
  if (side === 'long'  && newSL < refSL) { if (!silent) notify(`🛡 SL Shield: min $${fmtPrice(refSL)}`, 'err'); return false; }
  if (side === 'short' && newSL > refSL) { if (!silent) notify(`🛡 SL Shield: max $${fmtPrice(refSL)}`, 'err'); return false; }
  return true;
}

// ─── ASSETS / PAIRS ───────────────────────────────────────────
let ASSETS = [];

function guessCat(sym) {
  const s = sym.replace('USDT','').replace('PERP','');
  if (/^1000|^10000/.test(s)) return 'Meme';
  const MAJOR  = new Set(['BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','TRX','SHIB','LTC','BCH','DOT','LINK','XLM','UNI','ATOM','ETC','SUI','STX','FIL','HBAR','IMX','VET','OP','ARB','MKR','AAVE','APT','NEAR','ICP']);
  const MEME   = new Set(['PEPE','WIF','BONK','FLOKI','MEME','POPCAT','BRETT','DOGS','NEIRO','TURBO','MOG','BABYDOGE','PNUT','GOAT','MOODENG','FWOG','SUNDOG','HMSTR','CATI','GORK','CROC','WOJAK','COPE','CHAD','CULT','FOXY','SILLY']);
  const DEFI   = new Set(['UNI','AAVE','MKR','CRV','SNX','COMP','LDO','RUNE','JUP','RAY','DYDX','GMX','PENDLE','ENA','EIGEN','CAKE','BAL','1INCH','SUSHI','YFI','CVX','FXS','OSMO','KAVA','TIA','PYTH','ORCA','PERP','DODO','ALPHA']);
  const L1L2   = new Set(['ARB','OP','SUI','APT','NEAR','FTM','ALGO','ATOM','ICP','FIL','HBAR','EGLD','FLOW','XTZ','MINA','KAS','STX','INJ','SEI','TAO','TON','MATIC','POL','ONE','CELO','ZIL','IOTA','THETA','STRK','ZETA','METIS','BOBA','CELR','SKL','LRC','DUSK','XDC','STORJ','NKN','BERA','HYPE','MOVE','VIRTUAL','ZK','MANTA','ALT','SONIC','S','BLAST','SCROLL']);
  const AI     = new Set(['FET','RENDER','WLD','ARKM','AGIX','OCEAN','GRT','TAO','AI','NMR','CTXC','ORAI','ALI','AIOZ','RNDR','RSS3','LPT','GRASS','AKT','IO','AIUS','VANA','MASA','TRAC','CERE']);
  const GAMING = new Set(['AXS','SAND','MANA','ENJ','GALA','ALICE','TLM','SLP','GHST','ILV','YGG','GODS','MC','RACA','MOBOX','SKILL','TOWER','DOSE','SPS','GLX','PIXEL','PORTAL','RON','BEAM','PRIME','GMEE','COMBO','PROM','CHESS','VOXEL','WEMIX','OAS','ACE','XAI','DRIFT','DUEL']);
  if (MEME.has(s))   return 'Meme';
  if (MAJOR.has(s))  return 'Major';
  if (GAMING.has(s)) return 'Gaming';
  if (AI.has(s))     return 'AI';
  if (DEFI.has(s))   return 'DeFi';
  if (L1L2.has(s))   return 'L1/L2';
  if (/(INU|MOON|SAFE|ELON|PEPE|SHIB|FLOKI|DOGE|APE|CHAD|WOJAK|CULT|COPE|BONK|WIF)/.test(s)) return 'Meme';
  return 'Altcoin';
}

// ─── PROXY URLs ───────────────────────────────────────────────
const BYBIT_PROXY  = 'https://bybit-proxy-2ggw.onrender.com';
const WEEX_PROXY   = 'https://weex-proxy.onrender.com';
const BINGX_PROXY  = 'https://bingx-proxy-7t7k.onrender.com';
const BITGET_BASE  = 'https://api.bitget.com/api/v2/mix/market';

// ─── STATO GLOBALE ────────────────────────────────────────────
const S = {
  dir: 'long', orderType: 'market', riskMode: 'pct', marginMode: 'crossed',
  tpEnabled: false, balance: 4250, symbol: 'BTCUSDT', tf: '15m',
  lastPrice: null, tickTimer: null, walletBalance: 0,
};

// ─── FEE ──────────────────────────────────────────────────────
const FEE_DEF_TAKER = { bitget:0.0006, bybit:0.00055, bybit_demo:0.00055, weex:0.0006, bingx:0.0005 };
const FEE_DEF_MAKER = { bitget:0.0002, bybit:0.0002,  bybit_demo:0.0002,  weex:0.0002, bingx:0.0002 };
function getTakerFeeRate() {
  const ex = window._activeExchange||'bitget';
  const saved = parseFloat(localStorage.getItem('rf_fee_taker_'+ex));
  return (!isNaN(saved)&&saved>=0) ? saved : (FEE_DEF_TAKER[ex]||0.0006);
}
function getMakerFeeRate() {
  const ex = window._activeExchange||'bitget';
  const saved = parseFloat(localStorage.getItem('rf_fee_maker_'+ex));
  return (!isNaN(saved)&&saved>=0) ? saved : (FEE_DEF_MAKER[ex]||0.0002);
}
function getRoundTripFeeRate(orderType) {
  const ot = orderType || S.orderType || 'market';
  return ot === 'limit' ? getMakerFeeRate() + getTakerFeeRate() : getTakerFeeRate() * 2;
}
function calcFeeUsd(sizeUsdt, orderType) { return sizeUsdt * getRoundTripFeeRate(orderType); }
function calcSizeWithFee(riskUsd, slDistPct, orderType) {
  const denom = (slDistPct/100) + getRoundTripFeeRate(orderType);
  return denom > 0 ? riskUsd / denom : 0;
}

// ─── UTILS ────────────────────────────────────────────────────
function notify(msg, type) {
  const el = document.getElementById('m-notif');
  if (!el) return;
  el.textContent = msg;
  el.className = 'm-notif show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = 'm-notif', 2800);
}
function fmt(n)   { return parseFloat(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmt6(n)  { if (!n) return '0'; return parseFloat(n.toPrecision(4)).toString(); }
function fmtPrice(p) {
  if (!p) return '0.00';
  if (p>10000) return p.toFixed(1);
  if (p>1000)  return p.toFixed(2);
  if (p>100)   return p.toFixed(3);
  if (p>1)     return p.toFixed(4);
  return p.toFixed(6);
}
function getPDec(p) {
  if (p>10000) return 1; if (p>1000) return 2; if (p>100) return 3; if (p>1) return 4; return 6;
}
function roundToTick(price, pricePlace) {
  const f = Math.pow(10, pricePlace);
  return Math.round(price*f)/f;
}
function roundToSizeStep(size, step) {
  if (!step||step<=0) return size;
  return Math.floor(size/step)*step;
}
function toBingxSym(symbol) {
  const s = symbol.endsWith('USDT') ? symbol : symbol+'USDT';
  return s.includes('-') ? s : s.replace('USDT','-USDT');
}

// ─── PRICE DISPLAY ────────────────────────────────────────────
function updatePriceDisp(last, prev) {
  const pEl  = document.getElementById('m-price');
  const cEl  = document.getElementById('m-chg');
  if (!pEl) return;
  pEl.textContent = '$' + fmtPrice(last);
  if (cEl && prev && prev > 0) {
    const pct = ((last - prev) / prev * 100).toFixed(2);
    cEl.textContent  = (pct >= 0 ? '+' : '') + pct + '%';
    cEl.className    = 'm-chg ' + (pct >= 0 ? 'pos' : 'neg');
  }
}

// ─── CHART ────────────────────────────────────────────────────
let chart, candleSeries;
const LINES      = {};
const DRAG_PRICES = { entry:null, sl:null, tp1:null, tp2:null, tp3:null };

function initChart() {
  const chartEl = document.getElementById('chart');
  if (!chartEl || !window.LightweightCharts) return;
  chart = LightweightCharts.createChart(chartEl, {
    width:  chartEl.offsetWidth,
    height: chartEl.offsetHeight,
    layout: { background:{color:'#07070a'}, textColor:'#686878', fontFamily:'DM Mono', fontSize:11 },
    grid:   { vertLines:{color:'#12121680',style:LightweightCharts.LineStyle.Dotted}, horzLines:{color:'#12121680',style:LightweightCharts.LineStyle.Dotted} },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color:'#a855f750', width:1, labelBackgroundColor:'#1c1c24' },
      horzLine: { color:'#a855f750', width:1, labelBackgroundColor:'#1c1c24' },
    },
    rightPriceScale: { borderColor:'#1a1a22', textColor:'#686878', scaleMargins:{top:0.08,bottom:0.08} },
    timeScale: { borderColor:'#1a1a22', timeVisible:true, secondsVisible:false },
    handleScroll: { mouseWheel:true, pressedMouseMove:true },
    handleScale:  { mouseWheel:true, pinch:true },
  });
  candleSeries = chart.addCandlestickSeries({
    upColor:'#00d17a', downColor:'#ff2d4a',
    borderUpColor:'#00d17a', borderDownColor:'#ff2d4a',
    wickUpColor:'#00d17a88', wickDownColor:'#ff2d4a88',
    priceLineVisible: false,
  });
  window.chart = chart;
  window.candleSeries = candleSeries;
  initDragCanvas();
  window.addEventListener('resize', () => {
    if (chart && chartEl.offsetWidth > 0 && chartEl.offsetHeight > 0) {
      chart.resize(chartEl.offsetWidth, chartEl.offsetHeight);
      resizeCanvas();
    }
  });
}

const LINE_CFG = {
  entry:{color:'#ffc940',title:' ENTRY',lineWidth:1,lineStyle:0},
  sl:   {color:'#ff2d4a',title:' SL',   lineWidth:2,lineStyle:2},
  tp1:  {color:'#00d17a',title:' TP1',  lineWidth:1,lineStyle:2},
  tp2:  {color:'#00ffcc',title:' TP2',  lineWidth:1,lineStyle:2},
  tp3:  {color:'#3dddff',title:' TP3',  lineWidth:1,lineStyle:2},
};
function setChartLine(type, price) {
  if (LINES[type]) { try { candleSeries.removePriceLine(LINES[type]); } catch(_){} }
  if (!price) { LINES[type]=null; return; }
  LINES[type] = candleSeries.createPriceLine({price:parseFloat(price),axisLabelVisible:false,...LINE_CFG[type]});
  DRAG_PRICES[type] = parseFloat(price);
}
function removeChartLine(type) {
  if (LINES[type]) { try { candleSeries.removePriceLine(LINES[type]); } catch(_){} LINES[type]=null; }
  DRAG_PRICES[type] = null;
}
window.syncLine = function(type) {
  const idMap = {entry:'entryVal',sl:'slVal',tp1:'tp1',tp2:'tp2',tp3:'tp3'};
  const el = document.getElementById(idMap[type]);
  if (!el) return;
  const v = parseFloat(el.value);
  if (v) setChartLine(type,v); else removeChartLine(type);
  drawCanvas();
};

// ─── DRAG CANVAS ──────────────────────────────────────────────
let dc, ctx_dc;
let dragState = null;
const GRAB_PX = 16;
if (!window._closeZones) window._closeZones = {};

function initDragCanvas() {
  dc = document.getElementById('dragCanvas');
  if (!dc) return;
  ctx_dc = dc.getContext('2d');
  resizeCanvas();
  // Touch drag per le linee
  dc.addEventListener('touchstart',  onTouchStart,  {passive:false});
  dc.addEventListener('touchmove',   onTouchMove,   {passive:false});
  dc.addEventListener('touchend',    onTouchEnd,    {passive:false});
  dc.addEventListener('touchcancel', onTouchEnd,    {passive:false});
}

function resizeCanvas() {
  if (!dc) return;
  const wrap = document.getElementById('m-chart-wrap') || dc.parentElement;
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  dc.width  = r.width;
  dc.height = r.height;
}

function rrect(c,x,y,w,h,r){
  c.beginPath();
  c.moveTo(x+r,y); c.lineTo(x+w-r,y);
  c.quadraticCurveTo(x+w,y,x+w,y+r); c.lineTo(x+w,y+h-r);
  c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h);
  c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r);
  c.quadraticCurveTo(x,y,x+r,y); c.closePath();
}

function drawCanvas() {
  if (!dc || !ctx_dc || !candleSeries) return;
  resizeCanvas();
  ctx_dc.clearRect(0,0,dc.width,dc.height);
  window._closeZones = {};
  const types = S.orderType==='market' ? ['sl','tp1','tp2','tp3'] : ['entry','sl','tp1','tp2','tp3'];
  types.forEach(t => {
    const price = DRAG_PRICES[t];
    if (!price) return;
    const y = candleSeries.priceToCoordinate(price);
    if (y===null||y===undefined) return;
    drawDragLine(t, price, y);
  });
  drawPosLines();
}
window.drawCanvas = drawCanvas;

function drawDragLine(type, price, y) {
  const W = dc.width;
  const colors = {entry:'#ffc940',sl:'#ff2d4a',tp1:'#00d17a',tp2:'#00ffcc',tp3:'#3dddff'};
  const labels = {entry:'ENTRY',sl:'SL',tp1:'TP1',tp2:'TP2',tp3:'TP3'};
  const c = colors[type]||'#aaa';
  ctx_dc.save();
  // linea tratteggiata
  ctx_dc.strokeStyle=c; ctx_dc.lineWidth=type==='sl'?1.5:1;
  ctx_dc.setLineDash(type==='entry'?[]:[6,4]); ctx_dc.globalAlpha=0.85;
  ctx_dc.beginPath(); ctx_dc.moveTo(0,y); ctx_dc.lineTo(W,y); ctx_dc.stroke();
  ctx_dc.setLineDash([]); ctx_dc.globalAlpha=1;
  // handle drag centrale
  const hw=70, hh=16;
  const hx=W/2-hw/2, hy=y-hh/2;
  ctx_dc.fillStyle=c; rrect(ctx_dc,hx,hy,hw,hh,4); ctx_dc.fill();
  ctx_dc.fillStyle='rgba(0,0,0,0.8)';
  ctx_dc.font='bold 9px "DM Mono",monospace'; ctx_dc.textAlign='center';
  ctx_dc.fillText('⇅  '+labels[type]+'  ⇅', W/2, y+3.5);
  ctx_dc.textAlign='left';
  // ✕ remove button
  const xBtnX=W/2, xBtnY=y-hh/2-10, xBtnR=7;
  ctx_dc.beginPath(); ctx_dc.arc(xBtnX,xBtnY,xBtnR,0,Math.PI*2);
  ctx_dc.fillStyle='rgba(14,14,16,0.95)'; ctx_dc.fill();
  ctx_dc.strokeStyle=c; ctx_dc.lineWidth=1.2; ctx_dc.stroke();
  ctx_dc.fillStyle=c; ctx_dc.font='bold 9px "DM Mono",monospace';
  ctx_dc.textAlign='center'; ctx_dc.textBaseline='middle';
  ctx_dc.fillText('✕',xBtnX,xBtnY);
  ctx_dc.textBaseline='alphabetic'; ctx_dc.textAlign='left';
  window._closeZones[type] = {x:xBtnX,y:xBtnY,r:xBtnR};
  // badge prezzo
  const pt='$'+fmtPrice(price);
  ctx_dc.font='9px "DM Mono",monospace';
  const pw=ctx_dc.measureText(pt).width+12;
  const px=W-pw-6;
  ctx_dc.fillStyle=c; rrect(ctx_dc,px,y-9,pw,18,3); ctx_dc.fill();
  ctx_dc.fillStyle='rgba(0,0,0,0.9)'; ctx_dc.fillText(pt,px+6,y+3.5);
  // badge SL: distanza %
  if (type==='sl') {
    const entry = S.orderType==='market' ? S.lastPrice : parseFloat((document.getElementById('entryVal')||{}).value||0);
    if (entry) {
      const pct = (Math.abs(entry-price)/entry*100).toFixed(2)+'%';
      const riskRaw = parseFloat((document.getElementById('riskVal')||{}).value||0);
      const riskUsd = riskRaw ? (S.riskMode==='pct' ? (S.balance*riskRaw/100) : riskRaw) : null;
      ctx_dc.font='bold 11px "DM Mono",monospace';
      const lw=ctx_dc.measureText(pct).width+20, lx=W/2-35-lw-8, py=y-11;
      ctx_dc.fillStyle=c; rrect(ctx_dc,lx,py,lw,22,5); ctx_dc.fill();
      ctx_dc.fillStyle='rgba(255,255,255,0.95)'; ctx_dc.fillText(pct,lx+10,y+4.5);
      if (riskUsd) {
        const rText='-$'+fmt(riskUsd);
        const rw=ctx_dc.measureText(rText).width+20, rx=W/2+35+8;
        ctx_dc.fillStyle=c; rrect(ctx_dc,rx,py,rw,22,5); ctx_dc.fill();
        ctx_dc.fillStyle='rgba(255,255,255,0.95)'; ctx_dc.fillText(rText,rx+10,y+4.5);
      }
    }
  }
  ctx_dc.restore();
}

// Posizioni aperte su chart
if (!window._posLineZones) window._posLineZones = {};

function drawPosLines() {
  if (!window._positions||!window._positions.length||!candleSeries) return;
  window._posLineZones = {};
  window._positions.forEach((p, idx) => {
    const side  = (p.holdSide||'long').toLowerCase();
    const entry = parseFloat(p.openPriceAvg||p.averageOpenPrice||p.openAvgPrice||0);
    const size  = parseFloat(p.total||p.available||0);
    const upnl  = parseFloat(p.unrealizedPL||p.unrealizedProfitLoss||p.unrealizedPnl||0);
    const sym   = (p.symbol||'').replace(/_?UMCBL|_?DMCBL/g,'').replace('USDT','');
    const curSym = (S.symbol||'').replace('USDT','');
    if (sym !== curSym || !entry || entry <= 0) return;
    const entryY = candleSeries.priceToCoordinate(entry);
    if (entryY===null||entryY===undefined) return;
    const isLong = side === 'long';
    const entryColor = isLong ? '#2962ff' : '#f7525f';
    const pnlColor   = upnl >= 0 ? '#26a69a' : '#ef5350';
    const W = dc.width;
    ctx_dc.save();
    // linea entry
    ctx_dc.strokeStyle=entryColor; ctx_dc.lineWidth=1; ctx_dc.globalAlpha=0.9;
    ctx_dc.beginPath(); ctx_dc.moveTo(0,entryY); ctx_dc.lineTo(W,entryY); ctx_dc.stroke();
    ctx_dc.globalAlpha=1;
    // pills
    const sideLabel=isLong?'Long':'Short';
    const coinStr=fmt6(size)+' '+sym;
    const pnlStr=(upnl>=0?'+':'')+fmt(upnl)+' USD';
    const PAD=8,GAP=6,H=22,R=4;
    ctx_dc.font='bold 11px "DM Mono",monospace';
    const sideW=ctx_dc.measureText(sideLabel).width;
    ctx_dc.font='11px "DM Mono",monospace';
    const coinW=ctx_dc.measureText(coinStr).width, pnlW=ctx_dc.measureText(pnlStr).width;
    const sidePillW=sideW+PAD*2, coinPillW=coinW+PAD*2, pnlPillW=pnlW+PAD*2;
    const totalGroupW=sidePillW+GAP+coinPillW+GAP+pnlPillW;
    const gx=W/2-totalGroupW/2, pillY=entryY-H/2;
    // pill Side
    ctx_dc.fillStyle=entryColor; rrect(ctx_dc,gx,pillY,sidePillW,H,R); ctx_dc.fill();
    ctx_dc.fillStyle='#fff'; ctx_dc.font='bold 11px "DM Mono",monospace';
    ctx_dc.textAlign='left'; ctx_dc.textBaseline='middle';
    ctx_dc.fillText(sideLabel,gx+PAD,entryY);
    // pill Coin
    const cx2=gx+sidePillW+GAP;
    ctx_dc.fillStyle='rgba(20,20,28,0.92)'; rrect(ctx_dc,cx2,pillY,coinPillW,H,R); ctx_dc.fill();
    ctx_dc.strokeStyle=entryColor; ctx_dc.lineWidth=1; ctx_dc.stroke();
    ctx_dc.fillStyle=entryColor; ctx_dc.font='11px "DM Mono",monospace';
    ctx_dc.fillText(coinStr,cx2+PAD,entryY);
    // pill PnL
    const px2=cx2+coinPillW+GAP;
    ctx_dc.fillStyle='rgba(20,20,28,0.92)'; rrect(ctx_dc,px2,pillY,pnlPillW,H,R); ctx_dc.fill();
    ctx_dc.strokeStyle=pnlColor; ctx_dc.lineWidth=1; ctx_dc.stroke();
    ctx_dc.fillStyle=pnlColor;
    ctx_dc.fillText(pnlStr,px2+PAD,entryY);
    ctx_dc.textAlign='left'; ctx_dc.textBaseline='alphabetic';
    ctx_dc.restore();
  });
}

// ─── TOUCH DRAG per linee ─────────────────────────────────────
function onTouchStart(e) {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  // check ✕ zones
  if (window._closeZones) {
    const wrap = dc.parentElement;
    const rect = wrap ? wrap.getBoundingClientRect() : dc.getBoundingClientRect();
    const cx = touch.clientX - rect.left, cy = touch.clientY - rect.top;
    for (const [t,z] of Object.entries(window._closeZones)) {
      if (Math.hypot(cx-z.x,cy-z.y) <= z.r+8) {
        const idMap={entry:'entryVal',sl:'slVal',tp1:'tp1',tp2:'tp2',tp3:'tp3'};
        if (idMap[t]) document.getElementById(idMap[t]).value='';
        removeChartLine(t);
        drawCanvas(); calc();
        notify('Rimossa linea '+t.toUpperCase(),'');
        e.preventDefault(); return;
      }
    }
  }
  const type = lineAtY(touch.clientY);
  if (!type) return;
  dragState = { type, startY: touch.clientY, pending: true };
  e.preventDefault();
}
function onTouchMove(e) {
  if (!dragState || e.touches.length !== 1) return;
  e.preventDefault();
  const touch = e.touches[0];
  if (dragState.pending) {
    if (Math.abs(touch.clientY - dragState.startY) < 4) return;
    dragState.pending = false;
  }
  const wrap = dc.parentElement;
  const rect = wrap ? wrap.getBoundingClientRect() : dc.getBoundingClientRect();
  const y = touch.clientY - rect.top;
  const price = candleSeries.coordinateToPrice(y);
  if (!price || price <= 0) return;
  const type = dragState.type;
  DRAG_PRICES[type] = price;
  if (LINES[type]) { try { candleSeries.removePriceLine(LINES[type]); }catch(_){} }
  LINES[type] = candleSeries.createPriceLine({price,...LINE_CFG[type],axisLabelVisible:false});
  const idMap={entry:'entryVal',sl:'slVal',tp1:'tp1',tp2:'tp2',tp3:'tp3'};
  if (idMap[type]) {
    const el=document.getElementById(idMap[type]);
    if (el) el.value=fmtPrice(price);
  }
  drawCanvas(); calc();
}
function onTouchEnd(e) {
  if (!dragState) return;
  const price = DRAG_PRICES[dragState.type];
  if (price && window.notify && window.fmtPrice) {
    notify('Set '+(dragState.type.toUpperCase())+' → $'+fmtPrice(price),'ok');
  }
  dragState = null;
}
function lineAtY(clientY) {
  if (!candleSeries) return null;
  const wrap = dc ? dc.parentElement : null;
  const rect = wrap ? wrap.getBoundingClientRect() : null;
  if (!rect) return null;
  const y = clientY - rect.top;
  let best=null, bestD=GRAB_PX;
  const types = S.orderType==='market' ? ['sl','tp1','tp2','tp3'] : ['entry','sl','tp1','tp2','tp3'];
  types.forEach(t => {
    const p=DRAG_PRICES[t]; if(!p) return;
    const ly=candleSeries.priceToCoordinate(p); if(ly===null) return;
    const d=Math.abs(y-ly);
    if(d<bestD){bestD=d;best=t;}
  });
  return best;
}

// ─── MARKET DATA — PUBLIC ──────────────────────────────────────

async function fetchCandles(symbol,tf){
  const granMap={'1m':'1m','5m':'5m','15m':'15m','1H':'1H','4H':'4H','1D':'1Dutc'};
  const gran = granMap[tf]||'15m';
  const PER=1000, MAX=200;
  const sym=symbol.endsWith('USDT')?symbol:symbol+'USDT';
  try {
    let all=[], end=Date.now();
    for(let i=0;i<MAX;i++){
      const r=await fetch(`${BITGET_BASE}/candles?symbol=${sym}&productType=USDT-FUTURES&granularity=${gran}&endTime=${end}&limit=${PER}`);
      if(!r.ok) break;
      const j=await r.json();
      if(j.code&&j.code!=='00000') break;
      const rows=j.data; if(!rows||!rows.length) break;
      const cs=rows.map(d=>({time:Math.floor(parseInt(d[0])/1000),open:parseFloat(d[1]),high:parseFloat(d[2]),low:parseFloat(d[3]),close:parseFloat(d[4])}));
      all=cs.concat(all);
      end=Math.min(...rows.map(d=>parseInt(d[0])))-1;
      if(rows.length<PER) break;
    }
    if(!all.length) return null;
    const seen=new Set();
    return all.filter(c=>{if(seen.has(c.time))return false;seen.add(c.time);return true;}).sort((a,b)=>a.time-b.time);
  } catch(e){ return null; }
}
async function fetchTicker(symbol){
  const sym=symbol.endsWith('USDT')?symbol:symbol+'USDT';
  try {
    const r=await fetch(`${BITGET_BASE}/ticker?symbol=${sym}&productType=USDT-FUTURES`);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    const d=Array.isArray(j.data)?j.data[0]:j.data;
    if(!d||!d.lastPr) throw new Error('no price');
    return {last:parseFloat(d.lastPr),open24h:parseFloat(d.open24h||d.lastPr)};
  }catch(e){ return null; }
}
async function loadBitgetPairs(){
  try{
    const r=await fetch('https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES');
    const j=await r.json();
    if(j.code==='00000'&&j.data?.length){
      ASSETS=j.data.filter(x=>x.symbol&&x.symbol.endsWith('USDT')).map(x=>({sym:x.symbol,cat:guessCat(x.symbol)})).sort((a,b)=>a.sym.localeCompare(b.sym));
    }
  }catch(e){}
  if(!ASSETS.length) ASSETS=[{sym:'BTCUSDT',cat:'Major'},{sym:'ETHUSDT',cat:'Major'},{sym:'SOLUSDT',cat:'Major'},{sym:'BNBUSDT',cat:'Major'},{sym:'XRPUSDT',cat:'Major'},{sym:'ADAUSDT',cat:'Major'}];
}

// Bybit
async function bybitPublicFetch(endpoint,params={}){
  const qs=new URLSearchParams({endpoint,...params}).toString();
  const r=await fetch(`${BYBIT_PROXY}?${qs}`);
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
async function loadBybitPairs(){
  try{
    const j=await bybitPublicFetch('/v5/market/instruments-info',{category:'linear',limit:'1000'});
    if(j.retCode===0&&j.result?.list?.length){
      ASSETS=j.result.list.filter(x=>x.symbol&&x.symbol.endsWith('USDT')&&x.status==='Trading').map(x=>({sym:x.symbol,cat:guessCat(x.symbol)})).sort((a,b)=>a.sym.localeCompare(b.sym));
    }
  }catch(e){}
  if(!ASSETS.length) ASSETS=[{sym:'BTCUSDT',cat:'Major'},{sym:'ETHUSDT',cat:'Major'},{sym:'SOLUSDT',cat:'Major'}];
}
async function fetchBybitCandles(symbol,tf){
  const map={'1m':'1','5m':'5','15m':'15','1H':'60','4H':'240','1D':'D'};
  const interval=map[tf]||'15';
  const sym=symbol.endsWith('USDT')?symbol:symbol+'USDT';
  const PER=200, MAX=10;
  try{
    let all=[],end=Date.now();
    for(let i=0;i<MAX;i++){
      const qs=new URLSearchParams({endpoint:'/v5/market/kline',category:'linear',symbol:sym,interval,end:String(end),limit:String(PER)}).toString();
      const r=await fetch(`${BYBIT_PROXY}?${qs}`);
      if(!r.ok) break;
      const j=await r.json();
      if(j.retCode!==0||!j.result?.list?.length) break;
      const rows=j.result.list;
      const cs=rows.map(d=>({time:Math.floor(parseInt(d[0])/1000),open:parseFloat(d[1]),high:parseFloat(d[2]),low:parseFloat(d[3]),close:parseFloat(d[4])}));
      all=cs.concat(all);
      end=Math.min(...rows.map(d=>parseInt(d[0])))-1;
      if(rows.length<PER) break;
    }
    if(!all.length) return null;
    const seen=new Set();
    return all.filter(c=>{if(seen.has(c.time))return false;seen.add(c.time);return true;}).sort((a,b)=>a.time-b.time);
  }catch(e){ return null; }
}
async function fetchBybitTicker(symbol){
  const sym=symbol.endsWith('USDT')?symbol:symbol+'USDT';
  try{
    const j=await bybitPublicFetch('/v5/market/tickers',{category:'linear',symbol:sym});
    if(j.retCode!==0) throw new Error(j.retMsg);
    const d=j.result?.list?.[0];
    if(!d||!d.lastPrice) throw new Error('no price');
    return {last:parseFloat(d.lastPrice),open24h:parseFloat(d.prevPrice24h||d.lastPrice)};
  }catch(e){ return null; }
}
async function fetchBybitContractInfo(symbol){
  const sym=symbol.endsWith('USDT')?symbol:symbol+'USDT';
  try{
    const j=await bybitPublicFetch('/v5/market/instruments-info',{category:'linear',symbol:sym});
    const d=j.result?.list?.[0]; if(!d) throw new Error('no data');
    const tickSize=parseFloat(d.priceFilter?.tickSize||'0.01');
    const pricePlace=tickSize<1?String(tickSize).split('.')[1]?.length??2:0;
    const lotStep=parseFloat(d.lotSizeFilter?.qtyStep||'0.001');
    const minQty=parseFloat(d.lotSizeFilter?.minOrderQty||'0.001');
    return {pricePlace,sizeMultiplier:lotStep,minTradeNum:minQty};
  }catch(e){ return {pricePlace:4,sizeMultiplier:0.001,minTradeNum:0.001}; }
}

// Weex
async function weexPublicFetch(endpoint,params={}){
  const qs=new URLSearchParams({endpoint,...params}).toString();
  const r=await fetch(`${WEEX_PROXY}?${qs}`);
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
async function loadWeexPairs(){
  try{
    const j=await weexPublicFetch('/capi/v3/market/exchangeInfo');
    if(j.symbols?.length) ASSETS=j.symbols.filter(x=>x.symbol&&x.symbol.endsWith('USDT')&&x.forwardContractFlag).map(x=>({sym:x.symbol,cat:guessCat(x.symbol)})).sort((a,b)=>a.sym.localeCompare(b.sym));
  }catch(e){}
  if(!ASSETS.length) ASSETS=[{sym:'BTCUSDT',cat:'Major'},{sym:'ETHUSDT',cat:'Major'}];
}
async function fetchWeexCandles(symbol,tf){
  const map={'1m':'1m','5m':'5m','15m':'15m','1H':'1h','4H':'4h','1D':'1d'};
  const interval=map[tf]||'15m';
  const sym=symbol.endsWith('USDT')?symbol:symbol+'USDT';
  const PER=1000,MAX=10;
  try{
    let all=[],end=Date.now();
    for(let i=0;i<MAX;i++){
      const qs=new URLSearchParams({endpoint:'/capi/v3/market/history/klines',symbol:sym,interval,endTime:String(end),limit:String(PER)}).toString();
      const r=await fetch(`${WEEX_PROXY}?${qs}`);
      if(!r.ok) break;
      const rows=await r.json();
      if(!Array.isArray(rows)||!rows.length) break;
      const cs=rows.map(d=>({time:Math.floor(parseInt(d[0])/1000),open:parseFloat(d[1]),high:parseFloat(d[2]),low:parseFloat(d[3]),close:parseFloat(d[4])}));
      all=cs.concat(all);
      end=Math.min(...rows.map(d=>parseInt(d[0])))-1;
      if(rows.length<PER) break;
    }
    if(!all.length) return null;
    const seen=new Set();
    return all.filter(c=>{if(seen.has(c.time))return false;seen.add(c.time);return true;}).sort((a,b)=>a.time-b.time);
  }catch(e){ return null; }
}
async function fetchWeexTicker(symbol){
  const sym=symbol.endsWith('USDT')?symbol:symbol+'USDT';
  try{
    const j=await weexPublicFetch('/capi/v3/market/ticker/24hr',{symbol:sym});
    const d=Array.isArray(j)?j[0]:j;
    if(!d||!d.lastPrice) throw new Error('no price');
    return {last:parseFloat(d.lastPrice),open24h:parseFloat(d.openPrice||d.lastPrice)};
  }catch(e){ return null; }
}
async function fetchWeexContractInfo(symbol){
  const sym=symbol.endsWith('USDT')?symbol:symbol+'USDT';
  try{
    const j=await weexPublicFetch('/capi/v3/market/exchangeInfo',{symbol:sym});
    const d=j.symbols?.[0]; if(!d) throw new Error();
    return {pricePlace:parseInt(d.pricePrecision??2),sizeMultiplier:parseFloat(d.minOrderSize??0.001),minTradeNum:parseFloat(d.minOrderSize??0.001)};
  }catch(e){ return {pricePlace:2,sizeMultiplier:0.001,minTradeNum:0.001}; }
}

// BingX
async function bingxPublicFetch(endpoint,params={}){
  const qs=new URLSearchParams({endpoint,...params}).toString();
  const r=await fetch(`${BINGX_PROXY}?${qs}`);
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
async function loadBingxPairs(){
  try{
    const j=await bingxPublicFetch('/openApi/swap/v2/quote/contracts');
    if(j.code===0&&j.data?.length) ASSETS=j.data.filter(x=>x.symbol&&x.symbol.endsWith('-USDT')&&x.status===1).map(x=>({sym:x.symbol.replace('-',''),cat:guessCat(x.symbol.replace('-','')),_bingxSym:x.symbol})).sort((a,b)=>a.sym.localeCompare(b.sym));
  }catch(e){}
  if(!ASSETS.length) ASSETS=[{sym:'BTCUSDT',cat:'Major'},{sym:'ETHUSDT',cat:'Major'}];
}
async function fetchBingxCandles(symbol,tf){
  const map={'1m':'1m','5m':'5m','15m':'15m','1H':'1h','4H':'4h','1D':'1d'};
  const interval=map[tf]||'15m';
  const sym=toBingxSym(symbol);
  const PER=1000,MAX=10;
  try{
    let all=[],end=Date.now();
    for(let i=0;i<MAX;i++){
      const qs=new URLSearchParams({endpoint:'/openApi/swap/v3/quote/klines',symbol:sym,interval,endTime:String(end),limit:String(PER)}).toString();
      const r=await fetch(`${BINGX_PROXY}?${qs}`);
      if(!r.ok) break;
      const j=await r.json();
      if(j.code!==0||!j.data?.length) break;
      const cs=j.data.map(d=>({time:Math.floor(parseInt(d.time)/1000),open:parseFloat(d.open),high:parseFloat(d.high),low:parseFloat(d.low),close:parseFloat(d.close)}));
      all=cs.concat(all);
      end=Math.min(...j.data.map(d=>parseInt(d.time)))-1;
      if(j.data.length<PER) break;
    }
    if(!all.length) return null;
    const seen=new Set();
    return all.filter(c=>{if(seen.has(c.time))return false;seen.add(c.time);return true;}).sort((a,b)=>a.time-b.time);
  }catch(e){ return null; }
}
async function fetchBingxTicker(symbol){
  const sym=toBingxSym(symbol);
  try{
    const j=await bingxPublicFetch('/openApi/swap/v2/quote/ticker',{symbol:sym});
    if(j.code!==0||!j.data) throw new Error('no data');
    const d=j.data;
    return {last:parseFloat(d.lastPrice),open24h:parseFloat(d.openPrice||d.lastPrice)};
  }catch(e){ return null; }
}
async function fetchBingxContractInfo(symbol){
  const sym=toBingxSym(symbol);
  try{
    const j=await bingxPublicFetch('/openApi/swap/v2/quote/contracts',{symbol:sym});
    const d=j.code===0?(Array.isArray(j.data)?j.data[0]:j.data):null;
    if(!d) throw new Error();
    const qp=parseInt(d.quantityPrecision??3);
    const step=Math.pow(10,-qp);
    return {pricePlace:parseInt(d.pricePrecision??2),sizeMultiplier:step,minTradeNum:step};
  }catch(e){ return {pricePlace:2,sizeMultiplier:0.001,minTradeNum:0.001}; }
}

// Contract info cache
const _contractInfoCache = {};
async function fetchContractInfo(symbol){
  if (_contractInfoCache[symbol]) return _contractInfoCache[symbol];
  const isBingx=window._activeExchange==='bingx', isWeex=window._activeExchange==='weex';
  const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
  let info;
  if      (isBingx) info=await fetchBingxContractInfo(symbol);
  else if (isWeex)  info=await fetchWeexContractInfo(symbol);
  else if (isBybit) info=await fetchBybitContractInfo(symbol);
  else {
    try{
      const r=await fetch(`https://api.bitget.com/api/v2/mix/market/contracts?symbol=${symbol}&productType=USDT-FUTURES`);
      const j=await r.json();
      const d=j?.data?.[0]; if(!d) throw new Error();
      info={pricePlace:parseInt(d.pricePlace??2),sizeMultiplier:parseFloat(d.sizeMultiplier??1),minTradeNum:parseFloat(d.minTradeNum??0.001)};
    }catch(e){ info={pricePlace:4,sizeMultiplier:0.001,minTradeNum:0.001}; }
  }
  _contractInfoCache[symbol]=info; return info;
}

// Demo data fallback
function loadDemo(symbol,tf){
  const count=200; const data=[];
  let t=Math.floor(Date.now()/1000)-count*900;
  let price=30000+Math.random()*5000;
  for(let i=0;i<count;i++){
    const open=price, chg=(Math.random()-.5)*500;
    const high=open+Math.abs(chg)+Math.random()*200;
    const low=open-Math.abs(chg)-Math.random()*200;
    price=open+chg;
    data.push({time:t,open,high,low,close:price});
    t+=900;
  }
  candleSeries.setData(data);
  S.lastPrice=price; S._prevClose=price;
  updatePriceDisp(price,price);
}

// ─── CANDLES LOAD + TICK ───────────────────────────────────────
async function loadCandles(symbol,tf){
  const loadEl=document.getElementById('m-chart-loading');
  if(loadEl) loadEl.classList.remove('hidden');
  const isBingx=window._activeExchange==='bingx', isWeex=window._activeExchange==='weex';
  const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
  const data=isBingx?await fetchBingxCandles(symbol,tf):isWeex?await fetchWeexCandles(symbol,tf):isBybit?await fetchBybitCandles(symbol,tf):await fetchCandles(symbol,tf);
  if(loadEl) loadEl.classList.add('hidden');
  if(data&&data.length){
    candleSeries.setData(data);
    chart.priceScale('right').applyOptions({autoScale:true});
    const nb=data.length;
    chart.timeScale().setVisibleLogicalRange({from:nb-100,to:nb+5});
    const last=data[data.length-1];
    S.lastPrice=last.close; S._prevClose=last.close; S._lastCandleTime=null;
    updatePriceDisp(last.close,data[data.length-2]?.close||last.open);
    startTick(symbol);
    const exchLabel=isBingx?'BingX':isWeex?'Weex':isBybit?'Bybit':'Bitget';
    notify(exchLabel+' · '+symbol,'ok');
  } else {
    notify('Dati offline — demo data','err');
    loadDemo(symbol,tf);
  }
  onPriceUpdate();
}
window.loadCandles = loadCandles;

function startTick(symbol){
  if(S.tickTimer){clearInterval(S.tickTimer);S.tickTimer=null;}
  let curOpen=null,curHigh=null,curLow=null,firstTick=true;
  const initClose=S._prevClose;
  S.tickTimer=setInterval(async()=>{
    const isBingx=window._activeExchange==='bingx', isWeex=window._activeExchange==='weex';
    const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
    const t=isBingx?await fetchBingxTicker(symbol):isWeex?await fetchWeexTicker(symbol):isBybit?await fetchBybitTicker(symbol):await fetchTicker(symbol);
    if(!t) return;
    S.lastPrice=t.last; _priceCache[symbol]=t.last;
    updatePriceDisp(t.last,t.open24h);
    onPriceUpdate();
    try{
      const tfSec={'1m':60,'5m':300,'15m':900,'1H':3600,'4H':14400,'1D':86400}[S.tf]||900;
      const nowSec=Math.floor(Date.now()/1000);
      const candleTime=Math.floor(nowSec/tfSec)*tfSec;
      if(curOpen===null||S._lastCandleTime!==candleTime){
        curOpen=(curOpen===null?initClose:S._prevClose)||t.last;
        curHigh=Math.max(curOpen,t.last); curLow=Math.min(curOpen,t.last);
        S._lastCandleTime=candleTime;
      }
      curHigh=Math.max(curHigh,t.last); curLow=Math.min(curLow,t.last); S._prevClose=t.last;
      candleSeries.update({time:candleTime,open:curOpen,high:curHigh,low:curLow,close:t.last});
      firstTick=false;
    }catch(_){}
  },1500);
}

// ─── REALTIME PnL ─────────────────────────────────────────────
const _priceCache = {};
let _rtPnlTimer=null, _bgPriceFetcher=null;

function startBgPriceFetch(){
  if(_bgPriceFetcher) clearInterval(_bgPriceFetcher);
  _bgPriceFetcher=setInterval(async()=>{
    if(!window._positions||!window._positions.length) return;
    const syms=[...new Set(window._positions.map(p=>(p.symbol||'').replace(/_?(UMCBL|DMCBL)/gi,'').replace(/USDT$/,'')))].filter(s=>s!==S.symbol.replace('USDT',''));
    if(!syms.length) return;
    await Promise.all(syms.map(async sym=>{
      try{
        const isBingx=window._activeExchange==='bingx',isWeex=window._activeExchange==='weex';
        const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
        const t=isBingx?await fetchBingxTicker(sym):isWeex?await fetchWeexTicker(sym):isBybit?await fetchBybitTicker(sym):await fetchTicker(sym);
        if(t) _priceCache[sym]=t.last;
      }catch(_){}
    }));
  },2000);
}

function startRealtimePnl(){
  if(_rtPnlTimer) clearInterval(_rtPnlTimer);
  startBgPriceFetch();
  _rtPnlTimer=setInterval(()=>{
    if(!_positions||!_positions.length) return;
    let totalPnl=0;
    _positions.forEach((p,idx)=>{
      const sym=(p.symbol||'').replace(/_?(UMCBL|DMCBL)/gi,'').replace(/USDT$/,'');
      const markPx=_priceCache[sym]; if(!markPx) return;
      const entry=parseFloat(p.openPriceAvg||p.averageOpenPrice||p.openAvgPrice||0);
      const size=parseFloat(p.total||p.available||p.totalPos||0);
      const lev=parseFloat(p.leverage||1);
      const side=(p.holdSide||'long').toLowerCase();
      const notional=size*markPx, margin=notional/lev;
      const upnl=side==='long'?(markPx-entry)*size:(entry-markPx)*size;
      const roe=margin>0?(upnl/margin*100):0;
      p.unrealizedPL=upnl; p.markPrice=markPx;
      const pnlEl=document.getElementById('pos-pnl-'+idx);
      const markEl=document.getElementById('pos-mark-'+idx);
      const marginEl=document.getElementById('pos-margin-'+idx);
      const notEl=document.getElementById('pos-notional-'+idx);
      if(pnlEl){ pnlEl.className='pnl '+(upnl>=0?'pos':'neg'); pnlEl.innerHTML=`${upnl>=0?'+':'-'}$${fmt(Math.abs(upnl))} <span style="font-size:9px;opacity:.7">(${roe>=0?'+':''}${roe.toFixed(2)}%)</span>`; }
      if(markEl) markEl.textContent='$'+fmtPrice(markPx);
      if(marginEl) marginEl.textContent='$'+fmt(margin);
      if(notEl) notEl.textContent=fmt(size)+' cont · $'+fmt(notional);
      totalPnl+=upnl;
    });
    const accPnlEl=document.getElementById('accPnl');
    if(accPnlEl){ accPnlEl.textContent=(totalPnl>=0?'+':'-')+'$'+fmt(Math.abs(totalPnl)); accPnlEl.className='av '+(totalPnl>=0?'pos':'neg'); }
    if(S.walletBalance>0){
      const eq=S.walletBalance+totalPnl; S.balance=eq;
      const accBal=document.getElementById('accBalance');
      if(accBal) accBal.textContent='$'+fmt(eq);
    }
    drawCanvas();
  },1000);
}
function stopRealtimePnl(){
  if(_rtPnlTimer){clearInterval(_rtPnlTimer);_rtPnlTimer=null;}
  if(_bgPriceFetcher){clearInterval(_bgPriceFetcher);_bgPriceFetcher=null;}
}

// ─── PAIR SEARCH / MODAL ──────────────────────────────────────
window.openPairModal = function() {
  const modal=document.getElementById('m-pairModal');
  if(!modal) return;
  modal.style.display='flex';
  setTimeout(()=>modal.classList.add('open'),10);
  renderPairList('');
  const inp=document.getElementById('m-pair-search');
  if(inp){ inp.value=''; inp.focus(); }
};
window.closePairModal = function() {
  const modal=document.getElementById('m-pairModal');
  if(!modal) return;
  modal.classList.remove('open');
  setTimeout(()=>{ modal.style.display='none'; }, 300);
};
window.filterPairs = function(q) { renderPairList(q.trim().toUpperCase()); };
function renderPairList(q){
  const list=document.getElementById('m-pair-list');
  if(!list) return;
  const filtered=ASSETS.filter(a=>!q||a.sym.includes(q));
  list.innerHTML=filtered.slice(0,200).map(a=>`
    <div class="m-pair-item" onclick="selectPair('${a.sym}')">
      <span class="m-pair-sym">${a.sym.replace('USDT','')}<span style="font-size:9px;color:var(--muted2)">/USDT</span></span>
      <span class="m-pair-cat">${a.cat}</span>
    </div>`).join('');
  if(!filtered.length) list.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted2)">Nessun risultato</div>';
}
window.selectPair = function(sym) {
  S.symbol=sym;
  const btn=document.getElementById('m-sym-btn');
  if(btn){ btn.textContent=sym.replace('USDT',''); }
  closePairModal();
  clearAll();
  loadCandles(sym,S.tf);
};

// ─── TF BUTTONS ───────────────────────────────────────────────
window.setTF = function(tf) {
  S.tf=tf;
  document.querySelectorAll('.m-tf-btn').forEach(el=>{
    el.classList.toggle('active', el.dataset.tf===tf||el.textContent.trim()===tf);
  });
  loadCandles(S.symbol,tf);
};

// ─── PRICE UPDATE ─────────────────────────────────────────────
function onPriceUpdate(){
  if(S.orderType==='market'&&S.lastPrice){
    const entryMktEl=document.getElementById('entryMktVal');
    if(entryMktEl) entryMktEl.value=fmtPrice(S.lastPrice);
    setChartLine('entry',S.lastPrice);
    DRAG_PRICES.entry=S.lastPrice;
  }
  calc();
}

// ─── CALC / RISK ──────────────────────────────────────────────
function calc(){
  const entry=S.orderType==='market'?S.lastPrice:parseFloat((document.getElementById('entryVal')||{}).value||0);
  const slEl=document.getElementById('slVal');
  const riskEl=document.getElementById('riskVal');
  const levEl=document.getElementById('levVal');
  const sl=parseFloat(slEl?.value||0);
  const riskRaw=parseFloat(riskEl?.value||0);
  const lev=parseFloat(levEl?.value||1)||1;
  const bal=S.balance||1000;

  const outIds=['calcSize','calcMargin','cdSlDist','cdRiskUsd','cdRR'];
  if(!entry||!sl||!riskRaw){
    outIds.forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent='—'; });
    const btnEl=document.getElementById('chartCalcBtn');
    if(btnEl) btnEl.classList.remove('visible');
    return;
  }

  const slDist=Math.abs(entry-sl);
  const slDistPct=slDist/entry*100;
  if(!slDistPct) return;

  if(sl<entry&&S.dir!=='long')  setDir('long');
  if(sl>entry&&S.dir!=='short') setDir('short');

  const riskUsd=S.riskMode==='pct'?(bal*riskRaw/100):riskRaw;
  const size=calcSizeWithFee(riskUsd,slDistPct,S.orderType);
  const feeUsd=calcFeeUsd(size,S.orderType);
  const margin=size/lev;

  const sizeEl=document.getElementById('calcSize');
  const marginEl=document.getElementById('calcMargin');
  const slDistEl=document.getElementById('cdSlDist');
  const riskUsdEl=document.getElementById('cdRiskUsd');
  const feeEl=document.getElementById('cdFee');
  const calcSizeBtn=document.getElementById('chartCalcSize');
  const btnEl=document.getElementById('chartCalcBtn');

  if(sizeEl) sizeEl.textContent=fmt(size);
  if(marginEl) marginEl.textContent='$'+fmt(margin);
  if(slDistEl) slDistEl.textContent=slDistPct.toFixed(2)+'%';
  if(riskUsdEl) riskUsdEl.textContent='$'+fmt(riskUsd);
  if(feeEl){
    const ot=S.orderType||'market';
    const feeLabel=ot==='limit'?`maker+taker (${(getMakerFeeRate()*100).toFixed(3)}%+${(getTakerFeeRate()*100).toFixed(3)}%)`:(`taker×2 (${(getTakerFeeRate()*100).toFixed(3)}%)`);
    feeEl.textContent='$'+fmt(feeUsd)+' ('+feeLabel+')';
  }
  if(calcSizeBtn) calcSizeBtn.textContent=fmt(size);
  if(btnEl) btnEl.classList.add('visible');

  // RR
  const tp1Val=parseFloat((document.getElementById('tp1')||{}).value||0);
  const rrEl=document.getElementById('cdRR');
  if(rrEl) rrEl.textContent=tp1Val&&S.tpEnabled?'1:'+(Math.abs(tp1Val-entry)/slDist).toFixed(2):'—';
  updateTPRR(entry,sl);
  drawCanvas();
}
window.calc=calc;
window.updateCalc=calc;

function updateTPRR(entry,sl){
  if(!entry||!sl) return;
  const d=Math.abs(entry-sl);
  [1,2,3].forEach(n=>{
    const tp=parseFloat((document.getElementById('tp'+n)||{}).value||0);
    const rrEl=document.getElementById('rr'+n);
    if(rrEl) rrEl.textContent=tp&&d?'1:'+(Math.abs(tp-entry)/d).toFixed(1):'—';
  });
}

// ─── DIRECTION / ORDER TYPE ───────────────────────────────────
function setDir(dir){
  S.dir=dir;
  const btnLong=document.getElementById('btnLong');
  const btnShort=document.getElementById('btnShort');
  const btnOpen=document.getElementById('btnOpen');
  if(btnLong) btnLong.className='dir-btn long'+(dir==='long'?' active':'');
  if(btnShort) btnShort.className='dir-btn short'+(dir==='short'?' active':'');
  if(btnOpen){ btnOpen.textContent=dir==='long'?'OPEN LONG':'OPEN SHORT'; btnOpen.className='btn-open '+dir; }
  calc();
}
window.setDir=setDir;

window.setOType = function(type){
  S.orderType=type;
  const isMarket=type==='market', isLimit=type==='limit', isStop=type==='stop';
  ['market','limit','stop'].forEach(t=>{
    const el=document.getElementById('ot'+t.charAt(0).toUpperCase()+t.slice(1));
    if(el) el.classList.toggle('active',t===type);
  });
  const entryMktRow=document.getElementById('entryMktRow');
  const entryLimRow=document.getElementById('entryLimRow');
  if(entryMktRow) entryMktRow.style.display=isMarket?'':'none';
  if(entryLimRow) entryLimRow.style.display=isMarket?'none':'';
  if(isMarket&&S.lastPrice){ setChartLine('entry',S.lastPrice); DRAG_PRICES.entry=S.lastPrice; }
  else if(!isMarket){ DRAG_PRICES.entry=null; const v=parseFloat((document.getElementById('entryVal')||{}).value||0); if(v) setChartLine('entry',v); else removeChartLine('entry'); }
  drawCanvas(); calc();
};

window.setRiskMode = function(m){
  const prevMode=S.riskMode;
  const riskEl=document.getElementById('riskVal');
  const bal=S.balance||1000;
  if(riskEl){
    if(prevMode==='pct'&&m==='usd'){ const pct=parseFloat(riskEl.value)||0; riskEl.value=parseFloat((bal*pct/100).toFixed(2)); riskEl.step='1'; }
    else if(prevMode==='usd'&&m==='pct'){ const usdt=parseFloat(riskEl.value)||0; riskEl.value=parseFloat((usdt/bal*100).toFixed(2)); riskEl.step='0.5'; }
  }
  S.riskMode=m;
  const tabPct=document.getElementById('tabPct'), tabUsd=document.getElementById('tabUsd');
  if(tabPct) tabPct.className='risk-tab'+(m==='pct'?' active':'');
  if(tabUsd) tabUsd.className='risk-tab'+(m==='usd'?' active':'');
  const riskUnit=document.getElementById('riskUnit');
  if(riskUnit) riskUnit.textContent=m==='pct'?'%':'$';
  calc();
};

window.setLev = function(v){ const el=document.getElementById('levVal'); if(el) el.value=v; updateLevPresets(); calc(); };
function updateLevPresets(){
  const el=document.getElementById('levVal'); if(!el) return;
  const v=parseInt(el.value);
  document.querySelectorAll('.lev-p').forEach(el=>{
    el.className='lev-p'+(parseInt(el.textContent)===v?' active':'');
  });
}
window.updateLevPresets=updateLevPresets;

window.step = function(id,d){
  const el=document.getElementById(id); if(!el) return;
  el.value=Math.max(parseFloat(el.min||0),parseFloat(el.value||0)+d);
  calc();
};
window.stepP = function(id,dir){
  const el=document.getElementById(id); if(!el) return;
  const v=parseFloat(el.value||S.lastPrice||100);
  const tick=v>10000?10:v>1000?1:v>100?.1:v>1?.01:.0001;
  el.value=(v+dir*tick).toFixed(getPDec(v));
  const type=id==='entryVal'?'entry':id==='slVal'?'sl':id.replace('Val','');
  window.syncLine && window.syncLine(type);
};

window.toggleTP = function(){
  S.tpEnabled=!S.tpEnabled;
  const sw=document.getElementById('tpSw'), lbl=document.getElementById('tpLbl');
  if(sw) sw.className='tgl-sw'+(S.tpEnabled?' on':'');
  if(lbl) lbl.textContent=S.tpEnabled?'ON':'OFF';
  ['tpRow1','tpRow2','tpRow3'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.className='tp-row-grid'+(S.tpEnabled?' on':'');
  });
  calc();
};

window.setMarginMode = function(m){
  S.marginMode=m==='isolated'?'isolated':'crossed';
  const tabCross=document.getElementById('tabCross'), tabIso=document.getElementById('tabIso');
  if(tabCross) tabCross.className='risk-tab'+(m==='cross'?' active':'');
  if(tabIso)   tabIso.className='risk-tab'+(m==='isolated'?' active':'');
};

function clearAll(){
  ['entryVal','slVal','tp1','tp2','tp3'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['entry','sl','tp1','tp2','tp3'].forEach(t=>removeChartLine(t));
  drawCanvas(); calc();
}
window.clearAll=clearAll;

window.activateClick = function(type){
  if(type==='entry'&&S.orderType==='market') return;
  if(!chart) return;
  S.clickMode=type;
  notify('Tocca la chart → '+type.toUpperCase(),'');
  chart.subscribeClick(function handler(param){
    if(!param.point) return;
    const price=candleSeries.coordinateToPrice(param.point.y);
    if(price){ setField(type,price); S.clickMode=null; }
    chart.unsubscribeClick(handler);
  });
};

function setField(type,price){
  const idMap={entry:'entryVal',sl:'slVal',tp1:'tp1',tp2:'tp2',tp3:'tp3'};
  const el=document.getElementById(idMap[type]);
  if(el) el.value=fmtPrice(price);
  if(type.startsWith('tp')&&!S.tpEnabled) window.toggleTP();
  setChartLine(type,price);
  drawCanvas(); calc();
  notify('Set '+type.toUpperCase()+' → $'+fmtPrice(price),'ok');
}
window.setField=setField;

window.gotoPrice = function(){
  if(!chart) return;
  chart.priceScale('right').applyOptions({autoScale:true});
  chart.timeScale().scrollToRealTime();
  requestAnimationFrame(()=>chart.priceScale('right').applyOptions({autoScale:true}));
};

// ─── CONFIRM ORDER MODAL ──────────────────────────────────────
window.openModal = function(){
  if(dllGuard()) return;
  const sizeEl=document.getElementById('calcSize');
  if(!sizeEl||sizeEl.textContent==='—'){notify('Imposta Risk e SL prima','err');return;}
  const entry=S.orderType==='market'?S.lastPrice:parseFloat((document.getElementById('entryVal')||{}).value||0);
  const sl=(document.getElementById('slVal')||{}).value||'—';
  const lev=(document.getElementById('levVal')||{}).value||'—';
  const margin=(document.getElementById('calcMargin')||{}).textContent||'—';
  const riskUsd=(document.getElementById('cdRiskUsd')||{}).textContent||'—';
  const slDist=(document.getElementById('cdSlDist')||{}).textContent||'—';
  let tpH='';
  if(S.tpEnabled)[1,2,3].forEach(n=>{
    const v=(document.getElementById('tp'+n)||{}).value;
    const en=(document.getElementById('tp'+n+'en')||{}).checked;
    if(v&&en) tpH+=`<div class="mrow"><span class="ml">TP${n}</span><span class="mv grn">$${v}</span></div>`;
  });
  const rows=document.getElementById('modalRows');
  if(rows) rows.innerHTML=`
    <div class="mrow"><span class="ml">Symbol</span><span class="mv acc">${S.symbol}</span></div>
    <div class="mrow"><span class="ml">Direction</span><span class="mv" style="color:var(--${S.dir==='long'?'green':'red'})">${S.dir.toUpperCase()}</span></div>
    <div class="mrow"><span class="ml">Type</span><span class="mv">${S.orderType.toUpperCase()}</span></div>
    <div class="mrow"><span class="ml">Entry</span><span class="mv">$${fmtPrice(entry||0)}${S.orderType==='market'?' <span style="font-size:8px;color:var(--muted2)">(market)</span>':''}</span></div>
    <div class="mrow"><span class="ml">Leva</span><span class="mv">${lev}x</span></div>
    <div class="mdiv"></div>
    <div class="mrow"><span class="ml">Size</span><span class="mv acc">${sizeEl.textContent} USDT</span></div>
    <div class="mrow"><span class="ml">Margin</span><span class="mv">${margin}</span></div>
    <div class="mrow"><span class="ml">Stop Loss</span><span class="mv red">$${sl} <span style="font-size:8px;color:var(--muted2)">(${slDist})</span></span></div>
    <div class="mrow"><span class="ml">Max Risk</span><span class="mv red">${riskUsd}</span></div>
    <div class="mrow"><span class="ml">Fee est.</span><span class="mv" style="color:var(--muted2)">$${fmt(calcFeeUsd(parseFloat(sizeEl.textContent.replace(/,/g,'')),S.orderType))}</span></div>
    ${tpH}`;
  const modal=document.getElementById('m-posModal');
  if(modal) modal.classList.add('open');
};
window.closeModal = window.closePosModal = function(){
  const modal=document.getElementById('m-posModal');
  if(modal) modal.classList.remove('open');
};

// ─── EXECUTE ORDER ────────────────────────────────────────────
window.executeOrder = async function(){
  window.closePosModal();
  const isBingx=window._activeExchange==='bingx', isWeex=window._activeExchange==='weex';
  const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
  const entry=S.orderType==='market'?null:parseFloat((document.getElementById('entryVal')||{}).value||0);
  const sl=parseFloat((document.getElementById('slVal')||{}).value||0);
  const sizeText=(document.getElementById('calcSize')||{}).textContent||'0';
  const lev=(document.getElementById('levVal')||{}).value||'1';
  const tpList=[];
  if(S.tpEnabled)[1,2,3].forEach(n=>{
    const v=parseFloat((document.getElementById('tp'+n)||{}).value||0);
    const en=(document.getElementById('tp'+n+'en')||{}).checked;
    if(v&&en) tpList.push(v);
  });
  const sizeUsdt=parseFloat(sizeText.replace(/,/g,''));
  const entryPrice=S.orderType==='market'?S.lastPrice:entry;
  if(!entryPrice||entryPrice<=0){notify('Prezzo entry non disponibile','err');return;}
  notify('Invio ordine...','');
  try{
    const cInfo=await fetchContractInfo(S.symbol);
    const {pricePlace,sizeMultiplier,minTradeNum}=cInfo;
    const fp=(p)=>roundToTick(p,pricePlace).toFixed(pricePlace);
    const contracts=roundToSizeStep(sizeUsdt/entryPrice,sizeMultiplier);
    if(contracts<minTradeNum){notify(`Size troppo piccola (min ${minTradeNum} contratti)`,'err');return;}
    const side=S.dir, slStr=fp(sl), levInt=parseInt(lev)||1;
    if(isBingx){
      const bsym=toBingxSym(S.symbol);
      const bSide=side==='long'?'BUY':'SELL', bPosSide=side==='long'?'LONG':'SHORT';
      const bType=S.orderType==='market'?'MARKET':'LIMIT';
      const body={symbol:bsym,side:bSide,positionSide:bPosSide,type:bType,quantity:String(contracts)};
      if(S.orderType!=='market') body.price=fp(entryPrice);
      await window._bingxRequest('/openApi/swap/v2/trade/order',{},{method:'POST',body:JSON.stringify(body)});
      if(sl>0) await window._bingxRequest('/openApi/swap/v2/trade/order',{},{method:'POST',body:JSON.stringify({symbol:bsym,side:side==='long'?'SELL':'BUY',positionSide:bPosSide,type:'STOP_MARKET',quantity:String(contracts),stopPrice:slStr,workingType:'MARK_PRICE'})});
      for(const tp of tpList) await window._bingxRequest('/openApi/swap/v2/trade/order',{},{method:'POST',body:JSON.stringify({symbol:bsym,side:side==='long'?'SELL':'BUY',positionSide:bPosSide,type:'TAKE_PROFIT_MARKET',quantity:String(contracts),stopPrice:fp(tp),workingType:'MARK_PRICE'})});
    } else if(isWeex){
      const otype=S.orderType==='market'?'MARKET':'LIMIT';
      const body={symbol:S.symbol,side:side==='long'?'BUY':'SELL',positionSide:side==='long'?'LONG':'SHORT',type:otype,quantity:String(contracts),lever:String(levInt),marginType:'CROSSED',newClientOrderId:'rf_'+Date.now()};
      if(S.orderType!=='market') body.price=fp(entryPrice);
      await window._weexRequest('/capi/v3/order',{},{method:'POST',body:JSON.stringify(body)});
      if(sl>0) await window._weexRequest('/capi/v3/placeTpSlOrder',{},{method:'POST',body:JSON.stringify({symbol:S.symbol,clientAlgoId:'rf_sl_'+Date.now(),planType:'STOP_LOSS',triggerPrice:slStr,executePrice:'0',quantity:String(contracts),positionSide:side==='long'?'LONG':'SHORT',triggerPriceType:'MARK_PRICE'})});
    } else if(isBybit){
      const bSide=side==='long'?'Buy':'Sell';
      const body={category:'linear',symbol:S.symbol,side:bSide,orderType:S.orderType==='market'?'Market':'Limit',qty:String(contracts),timeInForce:'GoodTillCancel'};
      if(S.orderType!=='market') body.price=fp(entryPrice);
      if(sl>0){body.stopLoss=slStr;body.slTriggerBy='MarkPrice';}
      if(tpList[0]){body.takeProfit=fp(tpList[0]);body.tpTriggerBy='MarkPrice';}
      await window._bybitRequest('/v5/order/create',{},{method:'POST',body:JSON.stringify(body)});
    } else {
      const oType=S.orderType==='market'?'market':S.orderType==='stop'?'stop':'limit';
      const bSide=side==='long'?'buy':'sell';
      const body={symbol:S.symbol,productType:'USDT-FUTURES',marginMode:S.marginMode||'crossed',marginCoin:'USDT',size:String(contracts),side:bSide,tradeSide:'open',orderType:oType,leverage:String(levInt)};
      if(oType!=='market') body.price=fp(entryPrice);
      await window._bitgetRequest('/api/v2/mix/order/place-order',{},{method:'POST',body:JSON.stringify(body)});
      if(sl>0) await window._bitgetRequest('/api/v2/mix/order/place-tpsl-order',{},{method:'POST',body:JSON.stringify({symbol:S.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',planType:'loss_plan',triggerPrice:slStr,triggerType:'mark_price',executePrice:'0',holdSide:side,size:String(contracts),clientOid:'rf_sl_'+Date.now()})});
      for(const tp of tpList) await window._bitgetRequest('/api/v2/mix/order/place-tpsl-order',{},{method:'POST',body:JSON.stringify({symbol:S.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',planType:'profit_plan',triggerPrice:fp(tp),triggerType:'mark_price',executePrice:'0',holdSide:side,size:String(contracts),clientOid:'rf_tp_'+Date.now()})});
    }
    notify('✓ Ordine inviato!','ok');
    setTimeout(()=>{ if(window.rfBitgetSync) window.rfBitgetSync(); },1500);
  }catch(e){ notify('✗ '+e.message,'err'); }
};

// ─── ACCOUNT / POSITIONS UI ───────────────────────────────────
window.loadAccount = function(){
  const set=(id,val)=>{ const el=document.getElementById(id); if(el&&!el._ghost) el.textContent=val; };
  set('accBalance','—'); set('accAvail','—'); set('accPnl','—'); set('accMargin','—'); set('posCount','0');
  const pl=document.getElementById('posList');
  if(pl) pl.innerHTML='<div class="no-pos">Connetti exchange per vedere le posizioni</div>';
};

let _positions = [];
window._positions = _positions;
window._getPosition = (idx)=>_positions[idx]||null;

function renderPositions(positions){
  _positions=positions; window._positions=positions;
  const list=document.getElementById('posList');
  const countEl=document.getElementById('posCount');
  if(countEl) countEl.textContent=positions.length;
  if(!list) return;
  if(!positions.length){
    list.innerHTML='<div class="no-pos">No open positions</div>';
    stopRealtimePnl(); return;
  }
  list.innerHTML=positions.map((p,idx)=>{
    const sym=(p.symbol||'').replace(/_?UMCBL|_?DMCBL/g,'').replace('UMCBL','').replace('DMCBL','');
    const side=(p.holdSide||'long').toLowerCase();
    const upnl=parseFloat(p.unrealizedPL||p.unrealizedProfitLoss||p.unrealizedPnl||0);
    const entry=parseFloat(p.openPriceAvg||p.averageOpenPrice||p.openAvgPrice||0);
    const markPx=parseFloat(p.markPrice||p.marketPrice||0);
    const size=parseFloat(p.total||p.available||p.totalPos||0);
    const notional=size*(markPx||entry);
    const lev=parseFloat(p.leverage||1);
    const margin=notional/lev;
    const roe=margin>0?(upnl/margin*100):0;
    const liqPx=parseFloat(p.liquidationPrice||p.liqPrice||0);
    const slPx=parseFloat(p.stopLoss||p.stopLossPrice||p.presetStopLossPrice||0);
    const tpPx=parseFloat(p.takeProfit||p.takeProfitPrice||p.presetTakeProfitPrice||0);
    const slDist=slPx>0&&entry>0?Math.abs(entry-slPx)/entry*100:0;
    return `<div class="pos-item ${side}" id="pos-item-${idx}" onclick="togglePosExpand(${idx})" data-entry="${entry}" data-size="${size}" data-lev="${lev}" data-side="${side}" data-sym="${sym}">
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
        <div id="pos-tpsl-info-${idx}" style="display:flex;gap:4px;margin-bottom:8px">
          <div style="flex:1;background:var(--red-dim);border:1px solid var(--red);border-radius:4px;padding:5px 8px">
            <div style="font-size:8px;color:var(--muted2);text-transform:uppercase;margin-bottom:2px">Stop Loss</div>
            <div style="font-size:12px;font-weight:700;color:var(--red)">${slPx>0?'$'+fmtPrice(slPx):'—'}</div>
            ${slPx>0&&slDist>0?`<div style="font-size:9px;color:var(--muted2);margin-top:1px">−${slDist.toFixed(2)}%</div>`:''}
          </div>
          <div style="flex:1;background:var(--green-dim);border:1px solid var(--green);border-radius:4px;padding:5px 8px">
            <div style="font-size:8px;color:var(--muted2);text-transform:uppercase;margin-bottom:2px">Take Profit</div>
            <div style="font-size:12px;font-weight:700;color:var(--green)">${tpPx>0?'$'+fmtPrice(tpPx):'—'}</div>
          </div>
        </div>
        <div class="pos-modify-sl" onclick="event.stopPropagation()">
          <span class="pml">Mod SL</span>
          <div class="pos-sl-wrap">
            <input type="number" id="pos-sl-input-${idx}" placeholder="${entry>0?fmtPrice(entry*(side==='long'?0.98:1.02)):''}" step="0.01" onclick="event.stopPropagation()" oninput="event.stopPropagation()" value=""/>
            <span class="unit">$</span>
          </div>
          <button class="pos-sl-btn" onclick="event.stopPropagation();modifyPositionSL(${idx})">Set SL</button>
          <button class="pos-be-btn" onclick="event.stopPropagation();moveToBreakeven(${idx})" title="Breakeven">BE</button>
        </div>
        <div class="pos-modify-tp" onclick="event.stopPropagation()">
          ${[1,2,3].map(n=>`<div class="pos-tp-row" onclick="event.stopPropagation()">
            <span class="pml">TP${n}</span>
            <div class="pos-tp-wrap">
              <input type="number" id="pos-tp${n}-input-${idx}" placeholder="—" step="0.01" onclick="event.stopPropagation()" value=""/>
              <span class="unit">$</span>
            </div>
            <button class="pos-tp-btn" onclick="event.stopPropagation();modifyPositionTP(${idx},${n})">Set</button>
          </div>`).join('')}
        </div>
        <div class="pct-row" onclick="event.stopPropagation()" style="margin-top:8px">
          <span class="pct-label">Close</span>
          <input type="range" class="pct-slider" id="pct-slider-${idx}" min="1" max="100" value="25" onclick="event.stopPropagation()" oninput="event.stopPropagation();updatePctDisplay(${idx},${size},${upnl})"/>
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
          <button class="pos-btn-partial" onclick="event.stopPropagation();openPosCloseModal(${idx},'partial')">⚡ Parziale</button>
          <button class="pos-btn-close" onclick="event.stopPropagation();openPosCloseModal(${idx},'full')">✕ Chiudi tutto</button>
        </div>
      </div>
    </div>`;
  }).join('');
  if(window.refreshPosSLLines) window.refreshPosSLLines(positions, window._tpslOrdersMap||{});
  if(window.refreshPosTPLines) window.refreshPosTPLines([], positions, window._tpslOrdersMap||{});
  startRealtimePnl();
}

window.togglePosExpand = function(idx){
  const exp=document.getElementById('pos-exp-'+idx);
  if(!exp) return;
  const isOpen=exp.classList.contains('open');
  document.querySelectorAll('.pos-expand').forEach(e=>e.classList.remove('open'));
  if(!isOpen){
    exp.classList.add('open');
    const p=_positions[idx];
    if(p){
      const sym=(p.symbol||'').replace(/_?(UMCBL|DMCBL)/gi,'');
      if(sym&&sym!==S.symbol){ S.symbol=sym; const btn=document.getElementById('m-sym-btn'); if(btn) btn.textContent=sym.replace('USDT',''); clearAll(); loadCandles(sym,S.tf); }
    }
  }
};

window.updatePctDisplay = function(idx,size,upnl){
  const slider=document.getElementById('pct-slider-'+idx); if(!slider) return;
  const pct=parseInt(slider.value);
  const pnlSlice=upnl*(pct/100);
  const pctValEl=document.getElementById('pct-val-'+idx);
  const pctUsdEl=document.getElementById('pct-usd-'+idx);
  if(pctValEl) pctValEl.textContent=pct+'%';
  if(pctUsdEl) pctUsdEl.textContent=(pnlSlice>=0?'+':'')+'$'+fmt(pnlSlice)+' P&L · '+fmt(size*(pct/100))+' cont';
  document.querySelectorAll(`#pos-exp-${idx} .pct-preset`).forEach(el=>el.classList.toggle('active',parseInt(el.textContent)===pct));
};

window.setPct = function(idx,pct,size,upnl){
  const slider=document.getElementById('pct-slider-'+idx); if(!slider) return;
  slider.value=pct; window.updatePctDisplay(idx,size,upnl);
};

// ─── CLOSE POSITION MODAL ─────────────────────────────────────
let _posCloseAction = null;
window.openPosCloseModal = function(idx, type){
  if(event) event.stopPropagation();
  const p=_positions[idx]; if(!p) return;
  const sym=(p.symbol||'').replace(/_?UMCBL|_?DMCBL/g,'').replace('UMCBL','').replace('DMCBL','');
  const side=(p.holdSide||'long').toLowerCase();
  const upnl=parseFloat(p.unrealizedPL||0);
  const entry=parseFloat(p.openPriceAvg||p.averageOpenPrice||0);
  const markPx=parseFloat(p.markPrice||entry);
  const size=parseFloat(p.total||p.available||0);
  const notional=size*(markPx||entry);
  const lev=parseFloat(p.leverage||1);
  const margin=notional/lev;
  const slider=document.getElementById('pct-slider-'+idx);
  const pct=type==='full'?100:(slider?parseInt(slider.value):25);
  const closeSize=size*(pct/100);
  const closePnl=upnl*(pct/100);
  _posCloseAction={idx,type,pct,sym,side,closeSize,p};
  const modal=document.getElementById('m-posModal');
  const titleEl=document.getElementById('pmTitle');
  const subEl=document.getElementById('pmSub');
  const rowsEl=document.getElementById('pmRows');
  if(titleEl) titleEl.textContent=type==='full'?'Chiudi posizione':'Chiudi parziale';
  if(subEl) subEl.textContent=sym+' · '+side.toUpperCase()+' · Market';
  if(rowsEl) rowsEl.innerHTML=`
    <div class="pos-modal-row"><span class="pml">Chiudi</span><span class="pmv acc">${pct}% · ${fmt(closeSize)} cont</span></div>
    <div class="pos-modal-divider"></div>
    <div class="pos-modal-row"><span class="pml">P&L stimato</span><span class="pmv ${closePnl>=0?'grn':'red'}">${closePnl>=0?'+':''}$${fmt(closePnl)}</span></div>
    <div class="pos-modal-row"><span class="pml">Margin liberato</span><span class="pmv">~$${fmt(margin*(pct/100))}</span></div>`;
  const btn=document.getElementById('pmConfirmBtn');
  if(btn){ btn.disabled=false; btn.textContent=type==='full'?'Chiudi tutto':`Chiudi ${pct}%`; }
  if(modal) modal.classList.add('open');
};

window.confirmPosClose = async function(){
  if(!_posCloseAction) return;
  const {idx,type,pct,sym,side,closeSize,p}=_posCloseAction;
  const btn=document.getElementById('pmConfirmBtn');
  if(btn){btn.disabled=true;btn.textContent='Invio...';}
  const isBingx=window._activeExchange==='bingx',isWeex=window._activeExchange==='weex';
  const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
  try{
    const totalSize=parseFloat(p.total||p.totalPos||p.available||0);
    if(!totalSize||totalSize<=0) throw new Error('Nessuna posizione aperta');
    if(isBingx){
      const bsym=p._bingxSymbol||toBingxSym(p.symbol);
      if(type==='full'){
        await window._bingxRequest('/openApi/swap/v2/trade/closeAllPositions',{},{method:'POST',body:JSON.stringify({symbol:bsym})});
      } else {
        const qty=String(Math.floor(totalSize*(pct/100)*1000)/1000||totalSize);
        await window._bingxRequest('/openApi/swap/v2/trade/order',{},{method:'POST',body:JSON.stringify({symbol:bsym,side:side==='long'?'SELL':'BUY',positionSide:side==='long'?'LONG':'SHORT',type:'MARKET',quantity:qty})});
      }
    } else if(isWeex){
      if(type==='full'){
        await window._weexRequest('/capi/v3/closePositions',{},{method:'POST',body:JSON.stringify({symbol:p.symbol})});
      } else {
        const qty=Math.floor(totalSize*(pct/100)*1000)/1000||totalSize;
        await window._weexRequest('/capi/v3/order',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,side:side==='long'?'SELL':'BUY',positionSide:side==='long'?'LONG':'SHORT',type:'MARKET',quantity:String(qty),newClientOrderId:'rf_close_'+Date.now()})});
      }
    } else if(isBybit){
      const bSide=side==='long'?'Sell':'Buy';
      const qty=type==='full'?String(totalSize):String(Math.floor(totalSize*(pct/100)*10000)/10000||totalSize);
      await window._bybitRequest('/v5/order/create',{},{method:'POST',body:JSON.stringify({category:'linear',symbol:p.symbol,side:bSide,orderType:'Market',qty,reduceOnly:true})});
    } else {
      if(type==='full'){
        await window._bitgetRequest('/api/v2/mix/order/close-positions',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,productType:'USDT-FUTURES',holdSide:side})});
      } else {
        const raw=totalSize*(pct/100);
        const dec=(String(totalSize).split('.')[1]||'').length;
        const qty=dec>0?Math.floor(raw*Math.pow(10,dec))/Math.pow(10,dec):Math.floor(raw);
        if(qty<=0){
          await window._bitgetRequest('/api/v2/mix/order/close-positions',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,productType:'USDT-FUTURES',holdSide:side})});
        } else {
          await window._bitgetRequest('/api/v2/mix/order/place-order',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,productType:'USDT-FUTURES',marginMode:p.marginMode||'crossed',marginCoin:'USDT',size:String(qty),side:side==='long'?'buy':'sell',tradeSide:'close',orderType:'market'})});
        }
      }
    }
    window.closePosModal();
    notify(type==='full'?`Chiusa ${sym}`:`Parziale ${sym} -${pct}%`,'ok');
    setTimeout(()=>{ if(window.rfBitgetSync) window.rfBitgetSync(); },1500);
  }catch(e){
    notify('Errore: '+e.message,'err');
    if(btn){btn.disabled=false;btn.textContent=type==='full'?'Chiudi tutto':`Chiudi ${pct}%`;}
  }
};

window.closeAllPositions = async function(){
  if(!_positions.length){notify('Nessuna posizione aperta','err');return;}
  if(!confirm(`Chiudere tutte le ${_positions.length} posizioni?`)) return;
  notify('Chiusura posizioni...','');
  const isBingx=window._activeExchange==='bingx',isWeex=window._activeExchange==='weex';
  const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
  let ok=0,fail=0;
  for(const p of _positions){
    const side=(p.holdSide||'long').toLowerCase();
    try{
      if(isBingx){ await window._bingxRequest('/openApi/swap/v2/trade/closeAllPositions',{},{method:'POST',body:JSON.stringify({symbol:p._bingxSymbol||toBingxSym(p.symbol)})}); }
      else if(isWeex){ await window._weexRequest('/capi/v3/closePositions',{},{method:'POST',body:JSON.stringify({symbol:p.symbol})}); }
      else if(isBybit){
        try{ await window._bybitRequest('/v5/order/cancel-all-orders',{},{method:'POST',body:JSON.stringify({category:'linear',symbol:p.symbol})}); }catch(_){}
        await window._bybitRequest('/v5/order/create',{},{method:'POST',body:JSON.stringify({category:'linear',symbol:p.symbol,side:side==='long'?'Sell':'Buy',orderType:'Market',qty:String(parseFloat(p.size||p.total||0)),reduceOnly:true})});
      } else { await window._bitgetRequest('/api/v2/mix/order/close-positions',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,productType:'USDT-FUTURES',holdSide:side})}); }
      ok++;
    }catch(e){ fail++; console.warn('closeAll:',p.symbol,e.message); }
  }
  notify(fail===0?`✓ ${ok} posizioni chiuse`:`${ok} chiuse, ${fail} errori`,fail===0?'ok':'err');
  setTimeout(()=>{ if(window.rfBitgetSync) window.rfBitgetSync(); },1500);
};

// ─── MODIFY SL / TP / BREAKEVEN ───────────────────────────────
window.modifyPositionSL = async function(idx){
  const p=_positions[idx]; if(!p) return;
  const isBingx=window._activeExchange==='bingx',isWeex=window._activeExchange==='weex';
  const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
  const inp=document.getElementById('pos-sl-input-'+idx);
  const newSL=inp?parseFloat(inp.value):0;
  if(!newSL||newSL<=0){notify('Inserisci un prezzo SL valido','err');return;}
  const side=(p.holdSide||'long').toLowerCase();
  const entry=parseFloat(p.openPriceAvg||p.averageOpenPrice||0);
  if(side==='long'&&newSL>=entry){notify('SL long deve essere sotto entry','err');return;}
  if(side==='short'&&newSL<=entry){notify('SL short deve essere sopra entry','err');return;}
  if(!slpCheck(newSL,window._posSLLines?.[idx]?._refSL||0,side)){return;}
  notify('Imposto SL...','');
  try{
    const cInfo=await fetchContractInfo(p.symbol);
    const slStr=roundToTick(newSL,cInfo.pricePlace).toFixed(cInfo.pricePlace);
    if(isBingx){
      const bsym=p._bingxSymbol||toBingxSym(p.symbol);
      await window._bingxRequest('/openApi/swap/v2/trade/order',{},{method:'POST',body:JSON.stringify({symbol:bsym,side:side==='long'?'SELL':'BUY',positionSide:side==='long'?'LONG':'SHORT',type:'STOP_MARKET',quantity:String(parseFloat(p.total||p.available||0)),stopPrice:slStr,workingType:'MARK_PRICE'})});
    } else if(isWeex){
      await window._weexRequest('/capi/v3/placeTpSlOrder',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,clientAlgoId:'rf_sl_'+Date.now(),planType:'STOP_LOSS',triggerPrice:slStr,executePrice:'0',quantity:String(parseFloat(p.total||p.available||0)),positionSide:side==='long'?'LONG':'SHORT',triggerPriceType:'MARK_PRICE'})});
    } else if(isBybit){
      await window._bybitRequest('/v5/position/trading-stop',{},{method:'POST',body:JSON.stringify({category:'linear',symbol:p.symbol,stopLoss:slStr,slTriggerBy:'MarkPrice',positionIdx:0})});
    } else {
      let existingSLIds=[];
      try{
        const d=await window._bitgetRequest('/api/v2/mix/order/orders-plan-pending',{productType:'USDT-FUTURES',planType:'profit_loss'});
        let arr=d.data?.entrustedList||d.data?.list||d.data||[];
        if(!Array.isArray(arr)) arr=arr?[arr]:[];
        existingSLIds=arr.filter(o=>(o.posSide||o.holdSide||'').toLowerCase()===side&&(o.planType||'').toLowerCase().includes('loss')).map(o=>({orderId:o.orderId,planType:o.planType})).filter(o=>o.orderId);
      }catch(_){}
      for(const sl of existingSLIds){
        try{ await window._bitgetRequest('/api/v2/mix/order/cancel-plan-order',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',orderId:sl.orderId,planType:sl.planType})}); }catch(_){}
      }
      await window._bitgetRequest('/api/v2/mix/order/place-tpsl-order',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',planType:'loss_plan',triggerPrice:slStr,triggerType:'mark_price',executePrice:'0',holdSide:side,size:String(parseFloat(p.total||p.available||0)),clientOid:'rf_sl_'+Date.now()})});
    }
    notify(`✓ SL impostato a $${fmtPrice(newSL)}`,'ok');
    setTimeout(()=>{ if(window.rfBitgetSync) window.rfBitgetSync(); },1500);
  }catch(e){ notify('✗ SL: '+e.message,'err'); }
};

window.modifyPositionTP = async function(posIdx,tpN){
  const p=_positions[posIdx]; if(!p) return;
  const isBingx=window._activeExchange==='bingx',isWeex=window._activeExchange==='weex';
  const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
  const inp=document.getElementById(`pos-tp${tpN}-input-${posIdx}`);
  const newTP=inp?parseFloat(inp.value):0;
  if(!newTP||newTP<=0){notify('Inserisci un prezzo TP valido','err');return;}
  const side=(p.holdSide||'long').toLowerCase();
  const entry=parseFloat(p.openPriceAvg||p.averageOpenPrice||0);
  if(side==='long'&&newTP<=entry){notify("TP long sopra l'entry",'err');return;}
  if(side==='short'&&newTP>=entry){notify("TP short sotto l'entry",'err');return;}
  notify(`Modifica TP${tpN}...`,'');
  try{
    const cInfo=await fetchContractInfo(p.symbol);
    const tpStr=roundToTick(newTP,cInfo.pricePlace).toFixed(cInfo.pricePlace);
    if(isBingx){
      const bsym=p._bingxSymbol||toBingxSym(p.symbol);
      await window._bingxRequest('/openApi/swap/v2/trade/order',{},{method:'POST',body:JSON.stringify({symbol:bsym,side:side==='long'?'SELL':'BUY',positionSide:side==='long'?'LONG':'SHORT',type:'TAKE_PROFIT_MARKET',quantity:String(parseFloat(p.total||p.available||0)),stopPrice:tpStr,workingType:'MARK_PRICE'})});
    } else if(isWeex){
      await window._weexRequest('/capi/v3/placeTpSlOrder',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,clientAlgoId:'rf_tp_'+tpN+'_'+Date.now(),planType:'TAKE_PROFIT',triggerPrice:tpStr,executePrice:'0',quantity:String(parseFloat(p.total||p.available||0)),positionSide:side==='long'?'LONG':'SHORT',triggerPriceType:'MARK_PRICE'})});
    } else if(isBybit){
      await window._bybitRequest('/v5/position/trading-stop',{},{method:'POST',body:JSON.stringify({category:'linear',symbol:p.symbol,takeProfit:tpStr,tpTriggerBy:'MarkPrice',positionIdx:0})});
    } else {
      await window._bitgetRequest('/api/v2/mix/order/place-tpsl-order',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',planType:'profit_plan',triggerPrice:tpStr,triggerType:'mark_price',executePrice:'0',holdSide:side,size:String(parseFloat(p.total||p.available||0)),clientOid:'rf_tp'+tpN+'_'+Date.now()})});
    }
    notify(`✓ TP${tpN} impostato a $${fmtPrice(newTP)}`,'ok');
    setTimeout(()=>{ if(window.rfBitgetSync) window.rfBitgetSync(); },1500);
  }catch(e){ notify(`✗ TP${tpN}: `+e.message,'err'); }
};

window.moveToBreakeven = async function(idx){
  const p=_positions[idx]; if(!p) return;
  const entry=parseFloat(p.openPriceAvg||p.averageOpenPrice||0);
  if(!entry||entry<=0){notify('Entry non disponibile','err');return;}
  const side=(p.holdSide||'long').toLowerCase();
  const sym=(p.symbol||'').replace(/_?(UMCBL|DMCBL)/gi,'');
  if(!confirm('Spostare SL a Breakeven ($'+fmtPrice(entry)+') per '+sym+' '+side.toUpperCase()+'?')) return;
  const isBingx=window._activeExchange==='bingx',isWeex=window._activeExchange==='weex';
  const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
  notify('Imposto BE...','');
  try{
    const cInfo=await fetchContractInfo(p.symbol);
    const beStr=roundToTick(entry,cInfo.pricePlace).toFixed(cInfo.pricePlace);
    if(isBingx){
      const bsym=p._bingxSymbol||toBingxSym(p.symbol);
      await window._bingxRequest('/openApi/swap/v2/trade/order',{},{method:'POST',body:JSON.stringify({symbol:bsym,side:side==='long'?'SELL':'BUY',positionSide:side==='long'?'LONG':'SHORT',type:'STOP_MARKET',quantity:String(parseFloat(p.total||p.available||0)),stopPrice:beStr,workingType:'MARK_PRICE'})});
    } else if(isWeex){
      await window._weexRequest('/capi/v3/placeTpSlOrder',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,clientAlgoId:'rf_be_'+Date.now(),planType:'STOP_LOSS',triggerPrice:beStr,executePrice:'0',quantity:String(parseFloat(p.total||p.available||0)),positionSide:side==='long'?'LONG':'SHORT',triggerPriceType:'MARK_PRICE'})});
    } else if(isBybit){
      await window._bybitRequest('/v5/position/trading-stop',{},{method:'POST',body:JSON.stringify({category:'linear',symbol:p.symbol,stopLoss:beStr,slTriggerBy:'MarkPrice',positionIdx:0})});
    } else {
      await window._bitgetRequest('/api/v2/mix/order/place-tpsl-order',{},{method:'POST',body:JSON.stringify({symbol:p.symbol,productType:'USDT-FUTURES',marginCoin:'USDT',planType:'loss_plan',triggerPrice:beStr,triggerType:'mark_price',executePrice:'0',holdSide:side,size:String(parseFloat(p.total||p.available||0)),clientOid:'rf_be_'+Date.now()})});
    }
    notify('✓ BE impostato a $'+fmtPrice(entry)+' per '+sym,'ok');
    setTimeout(()=>{ if(window.rfBitgetSync) window.rfBitgetSync(); },1500);
  }catch(e){ notify('✗ BE: '+e.message,'err'); }
};

window.cancelBitgetOrder = async function(symbol,orderId){
  if(!confirm('Cancellare questo ordine?')) return;
  const isBingx=window._activeExchange==='bingx',isWeex=window._activeExchange==='weex';
  const isBybit=window._activeExchange==='bybit'||window._activeExchange==='bybit_demo';
  try{
    if(isBingx){ await window._bingxRequest('/openApi/swap/v2/trade/order',{},{method:'POST',body:JSON.stringify({symbol:toBingxSym(symbol),orderId:String(orderId)})}); }
    else if(isWeex){ await window._weexRequest('/capi/v3/order/cancel',{},{method:'POST',body:JSON.stringify({symbol,orderId,newClientOrderId:'rf_cancel_'+Date.now()})}); }
    else if(isBybit){ await window._bybitRequest('/v5/order/cancel',{},{method:'POST',body:JSON.stringify({category:'linear',symbol,orderId})}); }
    else { await window._bitgetRequest('/api/v2/mix/order/cancel-order',{},{method:'POST',body:JSON.stringify({symbol,productType:'USDT-FUTURES',orderId})}); }
    notify('Ordine cancellato ✓','ok');
    setTimeout(()=>{ if(window.rfBitgetSync) window.rfBitgetSync(); },800);
  }catch(e){ notify('Errore cancellazione: '+e.message,'err'); }
};

// ─── API PANEL / MODAL ────────────────────────────────────────
window.openApiModal = function(){
  const modal=document.getElementById('m-apiModal');
  if(!modal) return;
  modal.style.display='flex';
  setTimeout(()=>modal.classList.add('open'),10);
  window.rfLoadApiKeysUI && window.rfLoadApiKeysUI();
};
window.closeApiModal = function(){
  const modal=document.getElementById('m-apiModal');
  if(!modal) return;
  modal.classList.remove('open');
  setTimeout(()=>{ modal.style.display='none'; },300);
};

// ─── FIREBASE + AUTH ──────────────────────────────────────────
(async ()=>{
  const {initializeApp}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const {getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,sendPasswordResetEmail,onAuthStateChanged,signOut}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const {getFirestore,doc,setDoc,getDoc,collection,query,where,getDocs}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const fbApp=initializeApp({
    apiKey:"AIzaSyCk4EmpRqx0RH3qUh_YNp1u4eylYgfbCgo",
    authDomain:"trading-challenge-f3eb1.firebaseapp.com",
    projectId:"trading-challenge-f3eb1",
    storageBucket:"trading-challenge-f3eb1.firebasestorage.app",
  });
  const auth=getAuth(fbApp);
  const db=getFirestore(fbApp);
  let currentUser=null;

  const BITGET_PROXY='https://bitget-proxy-mze2.onrender.com';
  let _activeExchange=localStorage.getItem('rf_exchange')||'bitget';
  window._activeExchange=_activeExchange;
  let _appInitDone=false;

  // ── Key helpers ──
  function _lsKeysFor(ex){
    if(ex==='bybit'||ex==='bybit_demo') return {k:'bybit_api_key',s:'bybit_api_secret',p:null};
    if(ex==='weex')  return {k:'weex_api_key', s:'weex_api_secret', p:'weex_api_passphrase'};
    if(ex==='bingx') return {k:'bingx_api_key',s:'bingx_api_secret',p:null};
    return {k:'bitget_api_key',s:'bitget_api_secret',p:'bitget_api_passphrase'};
  }
  function loadBitgetKeys()  { return {apiKey:localStorage.getItem('bitget_api_key')||'',secret:localStorage.getItem('bitget_api_secret')||'',passphrase:localStorage.getItem('bitget_api_passphrase')||''}; }
  function loadBybitKeys()   { return {apiKey:localStorage.getItem('bybit_api_key')||'',secret:localStorage.getItem('bybit_api_secret')||''}; }
  function loadWeexKeys()    { return {apiKey:localStorage.getItem('weex_api_key')||'',secret:localStorage.getItem('weex_api_secret')||'',passphrase:localStorage.getItem('weex_api_passphrase')||''}; }
  function loadBingxKeys()   { return {apiKey:localStorage.getItem('bingx_api_key')||'',secret:localStorage.getItem('bingx_api_secret')||''}; }
  function loadActiveKeys()  {
    const ex=_activeExchange||'bitget';
    if(ex==='bybit'||ex==='bybit_demo') return loadBybitKeys();
    if(ex==='weex')  return loadWeexKeys();
    if(ex==='bingx') return loadBingxKeys();
    return loadBitgetKeys();
  }

  // ── Proxy request functions ──
  async function bitgetRequest(endpoint,params={},options={}){
    const {apiKey,secret,passphrase}=loadBitgetKeys();
    if(!apiKey||!secret) throw new Error('Chiavi API non configurate');
    const method=options.method||'GET';
    let url,fetchOpts;
    if(method==='GET'){
      const qs=new URLSearchParams({endpoint,...params}).toString();
      url=`${BITGET_PROXY}?${qs}`;
      fetchOpts={method:'GET',headers:{'x-bitget-key':apiKey,'x-bitget-secret':secret,'x-bitget-passphrase':passphrase||''}};
    } else {
      url=`${BITGET_PROXY}?endpoint=${encodeURIComponent(endpoint)}`;
      fetchOpts={method:'POST',headers:{'x-bitget-key':apiKey,'x-bitget-secret':secret,'x-bitget-passphrase':passphrase||'','Content-Type':'application/json'},body:options.body||'{}'};
    }
    const res=await fetch(url,fetchOpts); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(data.code&&data.code!=='00000'&&data.code!==0) throw new Error(data.msg||`Errore API: ${data.code}`);
    return data;
  }
  async function bybitRequest(endpoint,params={},options={}){
    const {apiKey,secret}=loadBybitKeys();
    if(!apiKey||!secret) throw new Error('Chiavi Bybit non configurate');
    const isDemo=_activeExchange==='bybit_demo';
    const method=options.method||'GET';
    const headers={'x-bybit-key':apiKey,'x-bybit-secret':secret,...(isDemo?{'x-bybit-demo':'true'}:{})};
    let url,fetchOpts;
    if(method==='GET'){
      const qs=new URLSearchParams({endpoint,...params}).toString();
      url=`${BYBIT_PROXY}?${qs}`; fetchOpts={method:'GET',headers};
    } else {
      url=`${BYBIT_PROXY}?endpoint=${encodeURIComponent(endpoint)}`;
      fetchOpts={method:'POST',headers:{...headers,'Content-Type':'application/json'},body:options.body||'{}'};
    }
    const res=await fetch(url,fetchOpts); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(data.retCode!==undefined&&data.retCode!==0) throw new Error(data.retMsg||`Errore Bybit: ${data.retCode}`);
    return data;
  }
  async function weexRequest(endpoint,params={},options={}){
    const {apiKey,secret,passphrase}=loadWeexKeys();
    if(!apiKey||!secret) throw new Error('Chiavi Weex non configurate');
    const method=options.method||'GET';
    const headers={'x-weex-key':apiKey,'x-weex-secret':secret,'x-weex-passphrase':passphrase||''};
    let url,fetchOpts;
    if(method==='GET'){
      const qs=new URLSearchParams({endpoint,...params}).toString();
      url=`${WEEX_PROXY}?${qs}`; fetchOpts={method:'GET',headers};
    } else {
      url=`${WEEX_PROXY}?endpoint=${encodeURIComponent(endpoint)}`;
      fetchOpts={method:'POST',headers:{...headers,'Content-Type':'application/json'},body:options.body||'{}'};
    }
    const res=await fetch(url,fetchOpts); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(data.code!==undefined&&data.code!==0&&data.code!=='0') throw new Error(data.msg||`Errore Weex: ${data.code}`);
    return data;
  }
  async function bingxRequest(endpoint,params={},options={}){
    const {apiKey,secret}=loadBingxKeys();
    if(!apiKey||!secret) throw new Error('Chiavi BingX non configurate');
    const method=options.method||'GET';
    const headers={'x-bingx-key':apiKey,'x-bingx-secret':secret};
    let url,fetchOpts;
    if(method==='GET'){
      const qs=new URLSearchParams({endpoint,...params}).toString();
      url=`${BINGX_PROXY}?${qs}`; fetchOpts={method:'GET',headers};
    } else if(method==='DELETE'){
      const qs=new URLSearchParams({endpoint,...params}).toString();
      url=`${BINGX_PROXY}?${qs}`; fetchOpts={method:'DELETE',headers};
    } else {
      const bodyParams=options.body?JSON.parse(options.body):{};
      const qs=new URLSearchParams({endpoint,...bodyParams}).toString();
      url=`${BINGX_PROXY}?${qs}`; fetchOpts={method:'POST',headers};
    }
    const res=await fetch(url,fetchOpts); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text=await res.text();
    if(!text||!text.trim()){if(method==='DELETE') return {};throw new Error('Risposta vuota');}
    const data=JSON.parse(text);
    if(data.code!==undefined&&data.code!==0) throw new Error(data.msg||`Errore BingX: ${data.code}`);
    return data;
  }

  // Esponi globalmente
  window._bitgetRequest=bitgetRequest;
  window._bybitRequest=bybitRequest;
  window._weexRequest=weexRequest;
  window._bingxRequest=bingxRequest;

  // ── AUTH STATE ──
  onAuthStateChanged(auth,async user=>{
    if(user){
      currentUser=user;
      try{
        const snap=await getDoc(doc(db,'profiles',user.uid));
        const username=snap.exists()?snap.data().username:user.email;
        const savedEx=localStorage.getItem('rf_exchange');
        if(savedEx&&['bitget','bybit','bybit_demo','weex','bingx'].includes(savedEx)){ _activeExchange=savedEx; window._activeExchange=savedEx; }
        _rfShowApp(username);
        const activeKeys=loadActiveKeys();
        if(activeKeys.apiKey) setTimeout(()=>fetchDashboard(),1500);
      }catch(e){ _rfShowApp(user.email); }
    } else {
      currentUser=null;
      const ov=document.getElementById('m-auth-overlay');
      if(ov){ ov.style.display='flex'; ov.classList.remove('hidden'); }
      const bd=document.getElementById('m-userBadge');
      if(bd){ bd.style.display='none'; bd.classList.remove('visible'); }
    }
  });

  function _rfShowApp(username){
    const ov=document.getElementById('m-auth-overlay');
    if(ov){ ov.style.display='none'; ov.classList.add('hidden'); }
    const bd=document.getElementById('m-userBadge');
    if(bd){ bd.style.display='flex'; bd.classList.add('visible'); }
    ['rfUsername','rfUsername2'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=username; });
    // Beta popup
    const betaKey='rf_mobile_beta_seen';
    if(!localStorage.getItem(betaKey)){
      localStorage.setItem(betaKey,'1');
      const ov=document.getElementById('m-betaPopupOverlay');
      if(ov) ov.style.display='flex';
    }
    if(!_appInitDone){
      _appInitDone=true;
      const isBingx=_activeExchange==='bingx',isWeex=_activeExchange==='weex';
      const isBybit=_activeExchange==='bybit'||_activeExchange==='bybit_demo';
      (isBingx?loadBingxPairs():isWeex?loadWeexPairs():isBybit?loadBybitPairs():loadBitgetPairs()).then(()=>loadCandles(S.symbol,S.tf));
      dllRenderUI();
      if(dllIsLocked()) dllStartCountdown();
      slpRenderUI();
    }
    _initExchangeUI();
  }
  window.rfShowApp=_rfShowApp;

  // ── AUTH TABS ──
  window.rfSwitchTab=function(tab){
    ['login','register','forgot'].forEach((t,i)=>{
      const f=document.getElementById('rf-form-'+t);
      if(f) f.classList.toggle('hidden',t!==tab);
    });
    document.querySelectorAll('.m-auth-tab').forEach((btn,i)=>{
      btn.classList.toggle('active',['login','register','forgot'][i]===tab);
    });
  };

  // ── LOGIN ──
  window.rfDoLogin=async function(){
    const user=document.getElementById('rf-login-user')?.value.trim();
    const pass=document.getElementById('rf-login-pass')?.value;
    const errEl=document.getElementById('rf-login-err');
    const btn=document.getElementById('rf-login-btn');
    if(!user||!pass){if(errEl) errEl.textContent='Compila tutti i campi.';return;}
    if(btn) btn.disabled=true;
    if(errEl) errEl.textContent='';
    try{
      const q=query(collection(db,'usernames'),where('username','==',user.toLowerCase()));
      const snap=await getDocs(q);
      if(snap.empty){if(errEl) errEl.textContent='Username non trovato.';if(btn) btn.disabled=false;return;}
      await signInWithEmailAndPassword(auth,snap.docs[0].data().email,pass);
    }catch(e){
      if(errEl) errEl.textContent=e.code==='auth/wrong-password'?'Password errata.':'Credenziali non valide.';
      if(btn) btn.disabled=false;
    }
  };

  // ── REGISTER ──
  window.rfDoRegister=async function(){
    const user=document.getElementById('rf-reg-user')?.value.trim().toLowerCase();
    const email=document.getElementById('rf-reg-email')?.value.trim();
    const pass=document.getElementById('rf-reg-pass')?.value;
    const gdpr=document.getElementById('rf-reg-gdpr')?.checked;
    const errEl=document.getElementById('rf-reg-err');
    const btn=document.getElementById('rf-reg-btn');
    if(!gdpr){if(errEl) errEl.textContent='Accetta la Privacy Policy.';return;}
    if(!user||!email||!pass){if(errEl) errEl.textContent='Compila tutti i campi.';return;}
    if(user.length<3){if(errEl) errEl.textContent='Username minimo 3 caratteri.';return;}
    if(pass.length<6){if(errEl) errEl.textContent='Password minimo 6 caratteri.';return;}
    if(btn) btn.disabled=true;
    if(errEl) errEl.textContent='';
    try{
      const unameDoc=await getDoc(doc(db,'usernames',user));
      if(unameDoc.exists()){if(errEl) errEl.textContent='Username già in uso.';if(btn) btn.disabled=false;return;}
      const cred=await createUserWithEmailAndPassword(auth,email,pass);
      await setDoc(doc(db,'usernames',user),{username:user,email,uid:cred.user.uid});
      await setDoc(doc(db,'profiles',cred.user.uid),{username:user,createdAt:Date.now()});
    }catch(e){
      let msg='Errore durante la registrazione.';
      if(e.code==='auth/email-already-in-use') msg='Email già registrata.';
      if(e.code==='auth/invalid-email') msg='Email non valida.';
      if(errEl) errEl.textContent=msg;
      if(btn) btn.disabled=false;
    }
  };

  // ── FORGOT ──
  window.rfDoForgot=async function(){
    const email=document.getElementById('rf-forgot-email')?.value.trim();
    const errEl=document.getElementById('rf-forgot-err');
    const okEl=document.getElementById('rf-forgot-ok');
    const btn=document.getElementById('rf-forgot-btn');
    if(!email){if(errEl) errEl.textContent='Inserisci la tua email.';return;}
    if(btn) btn.disabled=true;
    try{
      await sendPasswordResetEmail(auth,email);
      if(okEl) okEl.textContent='Email inviata!';
      if(errEl) errEl.textContent='';
    }catch(e){
      if(errEl) errEl.textContent='Email non trovata.';
      if(okEl) okEl.textContent='';
    }
    if(btn) btn.disabled=false;
  };

  // ── LOGOUT ──
  window.rfDoLogout=async function(){
    try{ await signOut(auth); }catch(_){}
    ['bitget_api_key','bitget_api_secret','bitget_api_passphrase','bybit_api_key','bybit_api_secret','weex_api_key','weex_api_secret','weex_api_passphrase','bingx_api_key','bingx_api_secret'].forEach(k=>localStorage.removeItem(k));
    const ov=document.getElementById('m-auth-overlay');
    if(ov){ ov.style.display='flex'; ov.classList.remove('hidden'); }
    const bd=document.getElementById('m-userBadge');
    if(bd){ bd.style.display='none'; bd.classList.remove('visible'); }
    _appInitDone=false;
  };

  // ── EXCHANGE SELECTOR ──
  function _initExchangeUI(){
    const ex=_activeExchange;
    ['bitget','bybit','bybit_demo','weex','bingx'].forEach(e=>{
      const idMap={bitget:'m-exBtnBitget',bybit:'m-exBtnBybit',bybit_demo:'m-exBtnBybitDemo',weex:'m-exBtnWeex',bingx:'m-exBtnBingx'};
      const btn=document.getElementById(idMap[e]);
      if(btn) btn.classList.toggle('active',e===ex);
    });
    const passRow=document.getElementById('apiPassRow');
    if(passRow) passRow.style.display=(ex==='bitget'||ex==='weex')?'':'none';
    const keyInp=document.getElementById('apiKeyInput');
    if(keyInp) keyInp.placeholder=ex==='weex'?'API key Weex':ex==='bingx'?'API key BingX':ex==='bitget'?'API key Bitget':'API key Bybit';
  }

  window.rfSelectExchange=function(ex){
    _activeExchange=ex; window._activeExchange=ex;
    localStorage.setItem('rf_exchange',ex);
    _initExchangeUI();
    // reset inputs
    ['apiKeyInput','apiSecretInput','apiPassInput'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    const statusEl=document.getElementById('m-apiStatus');
    if(statusEl){ statusEl.textContent=''; statusEl.className='m-api-status'; }
    if(window.rfLoadApiKeysUI) window.rfLoadApiKeysUI();
    if(_appInitDone){
      if(window._contractInfoCache) Object.keys(window._contractInfoCache).forEach(k=>delete window._contractInfoCache[k]);
      ASSETS.length=0;
      const isBingx=ex==='bingx',isWeex=ex==='weex',isBybit=ex==='bybit'||ex==='bybit_demo';
      (isBingx?loadBingxPairs():isWeex?loadWeexPairs():isBybit?loadBybitPairs():loadBitgetPairs()).then(()=>loadCandles(S.symbol,S.tf));
    }
  };

  // ── API KEYS UI ──
  window.rfLoadApiKeysUI=function(){
    _initExchangeUI();
    const statusEl=document.getElementById('m-apiStatus');
    const ex=_activeExchange||'bitget';
    const lsKey=_lsKeysFor(ex).k;
    const localKey=localStorage.getItem(lsKey);
    const dots='••••••••••••••••';
    if(localKey){
      const ki=document.getElementById('apiKeyInput'), si=document.getElementById('apiSecretInput'), pi=document.getElementById('apiPassInput');
      if(ki) ki.value=dots; if(si) si.value=dots;
      if(pi){
        const p=_lsKeysFor(ex).p;
        pi.value=(p&&localStorage.getItem(p))?'••••••••':'';
      }
      if(statusEl){ statusEl.textContent='✓ API keys caricate'; statusEl.className='m-api-status ok'; }
    } else {
      if(statusEl){ statusEl.textContent='Nessuna API key per '+ex; statusEl.className='m-api-status err'; }
    }
  };

  window.rfSaveApiKeys=function(){
    const k=document.getElementById('apiKeyInput')?.value.trim();
    const s=document.getElementById('apiSecretInput')?.value.trim();
    const p=document.getElementById('apiPassInput')?.value.trim();
    const statusEl=document.getElementById('m-apiStatus');
    const ex=_activeExchange||'bitget';
    if(!k||!s){ if(statusEl){ statusEl.textContent='API Key e Secret obbligatori'; statusEl.className='m-api-status err'; } return; }
    const lsKeys=_lsKeysFor(ex);
    const finalK=k.includes('•')?localStorage.getItem(lsKeys.k)||k:k;
    const finalS=s.includes('•')?localStorage.getItem(lsKeys.s)||s:s;
    const finalP=lsKeys.p&&p.includes('•')?localStorage.getItem(lsKeys.p)||p:p;
    localStorage.setItem(lsKeys.k,finalK);
    localStorage.setItem(lsKeys.s,finalS);
    if(lsKeys.p&&finalP) localStorage.setItem(lsKeys.p,finalP);
    localStorage.setItem('rf_exchange',ex);
    window.closeApiModal();
    notify('API keys salvate ✓','ok');
    setTimeout(()=>fetchDashboard(),500);
  };

  window.rfDeleteApiKeys=function(){
    const ex=_activeExchange||'bitget';
    if(!confirm('Eliminare le API keys per '+ex+'?')) return;
    const lsKeys=_lsKeysFor(ex);
    localStorage.removeItem(lsKeys.k); localStorage.removeItem(lsKeys.s);
    if(lsKeys.p) localStorage.removeItem(lsKeys.p);
    ['apiKeyInput','apiSecretInput','apiPassInput'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    const statusEl=document.getElementById('m-apiStatus');
    if(statusEl){ statusEl.textContent='Nessuna API key per '+ex; statusEl.className='m-api-status err'; }
    window.closeApiModal();
    const accBal=document.getElementById('accBalance'); if(accBal) accBal.textContent='—';
    S.balance=4250;
    notify('API keys '+ex+' eliminate ✓','ok');
  };

  // ── EXPORT / IMPORT ──
  window.rfExportApiKeys=function(){
    const exchanges=['bitget','bybit','bybit_demo','weex','bingx'];
    const data={version:1,exportedAt:new Date().toISOString(),keys:{}};
    exchanges.forEach(ex=>{
      const lk=_lsKeysFor(ex);
      const k=localStorage.getItem(lk.k),s=localStorage.getItem(lk.s),p=lk.p?localStorage.getItem(lk.p):null;
      if(k) data.keys[ex]={apiKey:k,secret:s||'',passphrase:p||''};
    });
    data.activeExchange=localStorage.getItem('rf_exchange')||'bitget';
    if(!Object.keys(data.keys).length){notify('Nessuna API key da esportare','err');return;}
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='riskflow-api-keys.json'; a.click();
    URL.revokeObjectURL(url);
    notify('Chiavi esportate ✓','ok');
  };
  window.rfImportApiKeys=function(input){
    const file=input.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=function(e){
      try{
        const data=JSON.parse(e.target.result);
        if(!data.keys||typeof data.keys!=='object') throw new Error('Formato non valido');
        const exchanges=['bitget','bybit','bybit_demo','weex','bingx'];
        let count=0;
        exchanges.forEach(ex=>{
          const entry=data.keys[ex]; if(!entry||!entry.apiKey) return;
          const lk=_lsKeysFor(ex);
          localStorage.setItem(lk.k,entry.apiKey); localStorage.setItem(lk.s,entry.secret||'');
          if(lk.p&&entry.passphrase) localStorage.setItem(lk.p,entry.passphrase);
          count++;
        });
        if(data.activeExchange&&exchanges.includes(data.activeExchange)){
          localStorage.setItem('rf_exchange',data.activeExchange);
          _activeExchange=data.activeExchange; window._activeExchange=data.activeExchange;
        }
        notify(count+' exchange importati ✓','ok');
        if(window.rfLoadApiKeysUI) window.rfLoadApiKeysUI();
      }catch(err){ notify('Errore importazione: '+err.message,'err'); }
      input.value='';
    };
    reader.readAsText(file);
  };

  // ── DASHBOARD FETCH ──
  async function fetchDashboard(){
    const statusEl=document.getElementById('m-apiStatus');
    const balEl=document.getElementById('m-apiBitgetBalance');
    const upnlEl=document.getElementById('m-apiBitgetUpnl');
    const isBingx=_activeExchange==='bingx',isWeex=_activeExchange==='weex';
    const isBybit=_activeExchange==='bybit'||_activeExchange==='bybit_demo';
    const exchLabel=isBingx?'BingX':isWeex?'Weex':isBybit?(_activeExchange==='bybit_demo'?'Bybit Demo':'Bybit'):'Bitget';
    try{
      let equity=0,available=0,upnl=0,margin=0,positions=[];

      if(isBingx){
        const balData=await bingxRequest('/openApi/swap/v3/user/balance');
        const balArr=Array.isArray(balData.data)?balData.data:[balData.data||{}];
        const usdt=balArr.find(x=>x.asset==='USDT')||balArr[0]||{};
        equity=parseFloat(usdt.equity||0); available=parseFloat(usdt.availableMargin||0);
        upnl=parseFloat(usdt.unrealizedProfit||0); margin=parseFloat(usdt.usedMargin||0);
        const posData=await bingxRequest('/openApi/swap/v2/user/positions');
        const rawPos=Array.isArray(posData.data)?posData.data:[];
        positions=rawPos.filter(p=>parseFloat(p.positionAmt||0)!==0).map(p=>{
          const amt=parseFloat(p.positionAmt||0);
          const side=amt>0?'long':'short';
          const sym=(p.symbol||'').replace('-','');
          return {symbol:sym,_bingxSymbol:p.symbol,holdSide:side,total:Math.abs(amt),available:Math.abs(amt),openPriceAvg:parseFloat(p.avgPrice||p.entryPrice||0),markPrice:parseFloat(p.markPrice||0),unrealizedPL:parseFloat(p.unrealizedProfit||0),leverage:parseFloat(p.leverage||1),liquidationPrice:parseFloat(p.liquidatePrice||0),stopLoss:parseFloat(p.stopLossPrice||0),takeProfit:parseFloat(p.takeProfitPrice||0),marginMode:(p.marginType||'CROSSED').toLowerCase()==='isolated'?'isolated':'crossed',_bingx:true};
        });
      } else if(isWeex){
        const balData=await weexRequest('/capi/v3/account/balance');
        const rawBal=Array.isArray(balData)?balData:(balData.data||[]);
        const usdt=rawBal.find(a=>(a.asset||'').toUpperCase()==='USDT')||rawBal[0]||{};
        equity=parseFloat(usdt.balance||0); available=parseFloat(usdt.availableBalance||0);
        upnl=parseFloat(usdt.unrealizePnl||0); margin=equity-available;
        const posData=await weexRequest('/capi/v3/account/position/allPosition');
        const rawPos=Array.isArray(posData)?posData:(posData.data||[]);
        positions=rawPos.filter(p=>parseFloat(p.size||0)>0).map(p=>{
          const openVal=parseFloat(p.openValue||0),sz=parseFloat(p.size||0),openAvg=sz>0?openVal/sz:0;
          return {symbol:p.symbol,holdSide:(p.side||'LONG').toLowerCase(),total:sz,available:sz,openPriceAvg:openAvg,markPrice:0,unrealizedPL:parseFloat(p.unrealizePnl||0),leverage:parseFloat(p.leverage||1),liquidationPrice:parseFloat(p.liquidatePrice||0),stopLoss:0,takeProfit:0,marginMode:(p.marginType||'CROSSED').toLowerCase(),_weex:true};
        });
        try{
          const algoData=await weexRequest('/capi/v3/openAlgoOrders');
          const algos=Array.isArray(algoData)?algoData:(algoData.data||[]);
          for(const pos of positions){
            const sym=pos.symbol,posSide=pos.holdSide.toUpperCase();
            const symAlgos=algos.filter(o=>o.symbol===sym&&o.positionSide===posSide);
            const slOrd=symAlgos.find(o=>o.orderType==='STOP_MARKET'&&o.algoStatus==='UNTRIGGERED');
            const tpOrd=symAlgos.find(o=>o.orderType==='TAKE_PROFIT_MARKET'&&o.algoStatus==='UNTRIGGERED');
            if(slOrd) pos.stopLoss=parseFloat(slOrd.triggerPrice||0);
            if(tpOrd) pos.takeProfit=parseFloat(tpOrd.triggerPrice||0);
          }
        }catch(_){}
      } else if(isBybit){
        const balData=await bybitRequest('/v5/account/wallet-balance',{accountType:'UNIFIED'});
        const coins=balData.result?.list?.[0]?.coin||[];
        const usdt=coins.find(c=>c.coin==='USDT')||coins[0]||{};
        equity=parseFloat(usdt.equity||usdt.walletBalance||0);
        available=parseFloat(usdt.availableToWithdraw||usdt.availableBalance||0);
        upnl=parseFloat(usdt.unrealisedPnl||0); margin=parseFloat(usdt.totalPositionMM||0);
        const posData=await bybitRequest('/v5/position/list',{category:'linear',settleCoin:'USDT'});
        positions=(posData.result?.list||[]).filter(p=>parseFloat(p.size||0)>0).map(p=>({
          symbol:p.symbol,holdSide:p.side==='Buy'?'long':'short',total:parseFloat(p.size||0),
          available:parseFloat(p.size||0),openPriceAvg:parseFloat(p.avgPrice||0),
          markPrice:parseFloat(p.markPrice||0),unrealizedPL:parseFloat(p.unrealisedPnl||0),
          leverage:parseFloat(p.leverage||1),liquidationPrice:parseFloat(p.liqPrice||0),
          stopLoss:parseFloat(p.stopLoss||0),takeProfit:parseFloat(p.takeProfit||0),
          marginMode:p.tradeMode===0?'crossed':'isolated',_bybit:true,
        }));
      } else {
        const balData=await bitgetRequest('/api/v2/mix/account/accounts',{productType:'USDT-FUTURES'});
        let rawBal=balData.data||[]; if(!Array.isArray(rawBal)) rawBal=[rawBal];
        const usdt=rawBal.find(a=>(a.marginCoin||'').toUpperCase()==='USDT')||rawBal[0]||{};
        equity=parseFloat(usdt.accountEquity||usdt.usdtEquity||usdt.equity||usdt.crossedMaxAvailable||usdt.available||0);
        available=parseFloat(usdt.crossedMaxAvailable||usdt.available||0);
        upnl=parseFloat(usdt.unrealizedPL||usdt.unrealizedProfit||usdt.crossedUnrealizedPL||0);
        margin=parseFloat(usdt.crossedRiskRate||usdt.locked||usdt.margin||0);
        const posData=await bitgetRequest('/api/v2/mix/position/all-position',{productType:'USDT-FUTURES',marginCoin:'USDT'});
        positions=(posData.data||[]).filter(p=>parseFloat(p.total||p.available||0)>0);
      }

      // Aggiorna UI balance nel modal API
      if(balEl) balEl.textContent='$'+equity.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
      if(upnlEl){ upnlEl.textContent=(upnl>=0?'+':'-')+'$'+Math.abs(upnl).toFixed(2); upnlEl.style.color=upnl>=0?'var(--green)':'var(--red)'; }
      // Aggiorna panel account
      const accBal=document.getElementById('accBalance'); if(accBal) accBal.textContent='$'+fmt(equity);
      const accAv=document.getElementById('accAvail');   if(accAv)  accAv.textContent='$'+fmt(available);
      const accPnlEl=document.getElementById('accPnl');
      if(accPnlEl){ accPnlEl.textContent=(upnl>=0?'+':'-')+'$'+fmt(Math.abs(upnl)); accPnlEl.className='av '+(upnl>=0?'pos':'neg'); }
      const accMar=document.getElementById('accMargin'); if(accMar) accMar.textContent='$'+fmt(Math.abs(margin));
      S.balance=equity;
      const walletBalance=equity-upnl; S.walletBalance=walletBalance;
      if(positions.length===0) dllCheckBalance(walletBalance);
      dllRenderUI();
      renderPositions(positions);
      if(statusEl){ statusEl.textContent='✓ Connesso'; statusEl.className='m-api-status ok'; }
      // Sync time — mostrato nel tasto Sync, NON rimane fisso
      notify(exchLabel+' sync ✓','ok');
    }catch(e){
      if(statusEl){ statusEl.textContent='✗ '+e.message; statusEl.className='m-api-status err'; }
      notify(exchLabel+': '+e.message,'err');
    }
  }

  window.rfBitgetSync=function(){ fetchDashboard(); };
  window.refreshAccount=function(){
    const {apiKey}=loadActiveKeys();
    if(apiKey) fetchDashboard();
    else notify('API non configurate per '+(_activeExchange||'bitget'),'err');
  };

})(); // fine IIFE Firebase

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',function(){
  // Init chart
  if(window.LightweightCharts){ initChart(); }
  else {
    // LightweightCharts caricato via script sync — aspetta
    const script=document.querySelector('script[src*="lightweight-charts"]');
    if(script){ script.addEventListener('load',initChart); }
    else { window.addEventListener('load',initChart); }
  }

  // Imposta stato iniziale UI
  window.setOType && window.setOType('market');
  updateLevPresets();

  // TF buttons — collega
  document.querySelectorAll('.m-tf-btn').forEach(btn=>{
    btn.addEventListener('click',function(){
      const tf=this.dataset.tf||this.textContent.trim();
      if(tf) window.setTF(tf);
    });
  });

  // Pair search input live
  const pairSearch=document.getElementById('m-pair-search');
  if(pairSearch) pairSearch.addEventListener('input',function(){ window.filterPairs(this.value); });

  // Close modali su click backdrop
  ['m-apiModal','m-pairModal'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('click',function(e){
      if(e.target===this){
        if(id==='m-apiModal') window.closeApiModal && window.closeApiModal();
        if(id==='m-pairModal') window.closePairModal && window.closePairModal();
      }
    });
  });

  // Tab panel mobile — bottom nav
  document.querySelectorAll('.m-tab-btn').forEach(btn=>{
    btn.addEventListener('click',function(){
      const target=this.dataset.panel||this.dataset.tab;
      if(!target) return;
      document.querySelectorAll('.m-tab-btn').forEach(b=>b.classList.toggle('active',b===this));
      document.querySelectorAll('.m-panel').forEach(p=>{
        p.classList.toggle('active', p.id==='m-panel-'+target||p.dataset.panel===target);
      });
    });
  });

  // Rimuovi patch.js se presente (non serve più)
  document.querySelectorAll('script[src*="mobile-patch"]').forEach(s=>s.remove());
});

window.addEventListener('load',function(){
  // Resize chart dopo layout completo
  setTimeout(()=>{
    const chartEl=document.getElementById('chart');
    if(chart&&chartEl&&chartEl.offsetWidth>0&&chartEl.offsetHeight>0){
      chart.resize(chartEl.offsetWidth,chartEl.offsetHeight);
      resizeCanvas();
    }
  },200);
});
