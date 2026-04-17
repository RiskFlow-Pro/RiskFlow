// ═══════════════════════════════════════════════════════════════
//  riskflow-mobile-patch.js  v3
//  Carica PRIMA di riskflow.js nel mobile.html
// ═══════════════════════════════════════════════════════════════

;(function () {
  'use strict';

  // ── 1. MAPPA ID desktop → ID mobile ──────────────────────────
  var ID_MAP = {
    'auth-overlay':       'm-auth-overlay',
    'userBadge':          'm-userBadge',
    'apiModal':           'm-apiModal',
    'apiStatus':          'm-apiStatus',
    'apiBitgetBalance':   'm-apiBitgetBalance',
    'apiBitgetUpnl':      'm-apiBitgetUpnl',
    'exBtnBitget':        'm-exBtnBitget',
    'exBtnBybit':         'm-exBtnBybit',
    'exBtnBybitDemo':     'm-exBtnBybitDemo',
    'exBtnWeex':          'm-exBtnWeex',
    'exBtnBingx':         'm-exBtnBingx',
    'posModal':           'm-posModal',
    'posList':            'm-posList',
  };

  // ── 2. GHOST — oggetti plain che simulano elementi DOM ────────
  function makeGhost(id) {
    return {
      id: id, _ghost: true,
      textContent: '', innerHTML: '', className: '', value: '',
      disabled: false, checked: false,
      style: { display: '' },
      classList: {
        _c: {},
        add:     function(c){ this._c[c]=1; },
        remove:  function(c){ delete this._c[c]; },
        toggle:  function(c,f){ if(f===undefined)f=!this._c[c]; f?this._c[c]=1:delete this._c[c]; },
        contains:function(c){ return !!this._c[c]; },
      },
      getAttribute: function(){ return null; },
      setAttribute: function(){},
      addEventListener: function(){},
      removeEventListener: function(){},
      getBoundingClientRect: function(){ return {top:0,left:0,width:0,height:0,right:0,bottom:0}; },
      querySelectorAll: function(){ return []; },
      querySelector: function(){ return null; },
      appendChild: function(){},
      focus: function(){}, blur: function(){},
      click: function(){},
      remove: function(){},
    };
  }

  var GHOST_IDS = [
    'accBalance','accAvail','accPnl','accMargin',
    'tbPnl',
    'apiBitgetPositions','apiSyncTime',
    'panelResize','panel',
    'moneyShotModal','msShotCanvas',
    'dllSw','dllLbl','dllToggle','dllSettings','dllBanner','dllPct','dllCountdown',
    'betaPopupOverlay',
    'chartHint',   // desktop-only hint element
  ];

  var _ghosts = {};
  GHOST_IDS.forEach(function(id){ _ghosts[id] = makeGhost(id); });

  // ── 3. OVERRIDE getElementById ────────────────────────────────
  var _orig = document.getElementById.bind(document);

  document.getElementById = function(id) {
    if (ID_MAP[id]) {
      return _orig(ID_MAP[id]) || _orig(id) || makeGhost(id);
    }
    if (_ghosts[id]) return _ghosts[id];
    var found = _orig(id);
    if (!found) {
      _ghosts[id] = makeGhost(id);
      return _ghosts[id];
    }
    return found;
  };

  // ── 4. loadAccount() ridefinita IMMEDIATAMENTE ────────────────
  window.loadAccount = function() {
    var setText = function(id, val){
      var el = document.getElementById(id); if(el && !el._ghost) el.textContent = val;
    };
    setText('accBalance', '—');
    setText('accAvail',   '—');
    setText('accPnl',     '—');
    setText('accMargin',  '—');
    setText('tbBalance',  '—');
    setText('tbPnl',      '—');
    setText('posCount',   '0');
    var pl = document.getElementById('posList');
    if (pl && !pl._ghost) pl.innerHTML = '<div class="no-pos">Connetti il tuo exchange per vedere le posizioni</div>';
  };

  // ── 5. SYNC ghost account → elementi panel mobile ─────────────
  var ACC_SYNC = {
    'accBalance': 'm-acc-balance',
    'accAvail':   'm-acc-avail',
    'accPnl':     'm-acc-pnl',
    'accMargin':  'm-acc-margin',
  };
  Object.keys(ACC_SYNC).forEach(function(gid) {
    var mid = ACC_SYNC[gid];
    var g = _ghosts[gid];
    if (!g) return;
    var _tv = '—', _cv = '';
    Object.defineProperty(g, 'textContent', {
      get: function(){ return _tv; },
      set: function(v){ _tv = v; var m=_orig(mid); if(m) m.textContent=v; },
      configurable: true,
    });
    Object.defineProperty(g, 'className', {
      get: function(){ return _cv; },
      set: function(v){ _cv = v; var m=_orig(mid); if(m) m.className=v; },
      configurable: true,
    });
  });

  // ── 6. PATCH FUNZIONI AUTH con polling ────────────────────────
  function patchWhen(name, fn) {
    if (window[name]) { fn(window[name]); return; }
    var n = 0, t = setInterval(function(){
      if (window[name]) { clearInterval(t); fn(window[name]); }
      else if (++n > 150) clearInterval(t);
    }, 100);
  }

  patchWhen('rfSwitchTab', function() {
    window.rfSwitchTab = function(tab) {
      ['login','register','forgot'].forEach(function(t) {
        var f = _orig('rf-form-'+t); if(f) f.classList.toggle('hidden', t!==tab);
      });
      document.querySelectorAll('.m-auth-tab').forEach(function(btn,i) {
        btn.classList.toggle('active', ['login','register','forgot'][i] === tab);
      });
    };
  });

  patchWhen('rfShowApp', function(orig) {
    window.rfShowApp = function(username) {
      // Nascondi overlay
      var ov = _orig('m-auth-overlay');
      if (ov) { ov.style.display='none'; ov.classList.add('hidden'); }
      // Mostra badge
      var bd = _orig('m-userBadge');
      if (bd) { bd.style.display='flex'; bd.classList.add('visible'); }
      // Username
      var u1 = _orig('rfUsername');     if(u1) u1.textContent=username;
      var u2 = _orig('rfUsername2');    if(u2) u2.textContent=username;
      try { orig(username); } catch(e){}
    };
  });

  patchWhen('rfDoLogout', function(orig) {
    window.rfDoLogout = async function() {
      try { await orig(); } catch(e){}
      var ov = _orig('m-auth-overlay');
      if (ov) { ov.style.display='flex'; ov.classList.remove('hidden'); }
      var bd = _orig('m-userBadge');
      if (bd) { bd.style.display='none'; bd.classList.remove('visible'); }
    };
  });

  patchWhen('rfSaveApiKeys', function(orig) {
    window.rfSaveApiKeys = function() {
      try { orig(); } catch(e){}
      var m = _orig('m-apiModal'); if(m) m.classList.remove('open');
    };
  });

  patchWhen('rfDeleteApiKeys', function(orig) {
    window.rfDeleteApiKeys = function() {
      try { orig(); } catch(e){}
      var m = _orig('m-apiModal'); if(m) m.classList.remove('open');
    };
  });

  // ── 7. DOMContentLoaded ───────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    // Crea m-posList se manca
    if (!_orig('m-posList')) {
      var panel = _orig('panel-positions');
      if (panel) {
        var div = document.createElement('div');
        div.id = 'm-posList';
        panel.insertBefore(div, panel.firstChild);
      }
    }
    // Sync rfUsername → rfUsername2
    var u1 = _orig('rfUsername');
    if (u1) {
      new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          var u2 = _orig('rfUsername2');
          if(u2) u2.textContent = m.target.textContent;
        });
      }).observe(u1, {childList:true,characterData:true,subtree:true});
    }
  });

  // ── 8. CHART RESIZE — forza ridimensionamento dopo layout ─────
  // riskflow.js crea la chart con offsetWidth/offsetHeight al momento
  // del parse — spesso sono 0 su mobile. Forziamo il resize dopo il load.
  window.addEventListener('load', function() {
    setTimeout(function() {
      try {
        if (window.chart) {
          var chartEl = _orig('chart');
          if (chartEl && chartEl.offsetWidth > 0) {
            window.chart.resize(chartEl.offsetWidth, chartEl.offsetHeight);
          }
        }
      } catch(e) { console.warn('[mobile-patch] chart resize:', e); }
    }, 200);

    // Anche al resize della finestra
    window.addEventListener('resize', function() {
      try {
        if (window.chart) {
          var chartEl = _orig('chart');
          if (chartEl) window.chart.resize(chartEl.offsetWidth, chartEl.offsetHeight);
        }
      } catch(e){}
    });
  });

})();
