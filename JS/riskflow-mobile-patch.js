// ═══════════════════════════════════════════════════════════════
//  riskflow-mobile-patch.js  v4
//  Carica PRIMA di riskflow.js nel mobile.html
// ═══════════════════════════════════════════════════════════════
;(function () {
  'use strict';

  // ── 1. ID desktop → ID mobile (solo quelli che DAVVERO differiscono) ──
  var ID_MAP = {
    'auth-overlay':  'm-auth-overlay',
    'userBadge':     'm-userBadge',
    'apiModal':      'm-apiModal',
    'apiStatus':     'm-apiStatus',
    'apiBitgetBalance': 'm-apiBitgetBalance',
    'apiBitgetUpnl':    'm-apiBitgetUpnl',
    'exBtnBitget':      'm-exBtnBitget',
    'exBtnBybit':       'm-exBtnBybit',
    'exBtnBybitDemo':   'm-exBtnBybitDemo',
    'exBtnWeex':        'm-exBtnWeex',
    'exBtnBingx':       'm-exBtnBingx',
    'posModal':         'm-posModal',
  };

  // ── 2. Ghost per ID che NON esistono nel mobile ───────────────
  // Solo quelli puramente desktop — accBalance/dllSw/ecc esistono nel panel mobile!
  function makeGhost(id) {
    var g = {
      id:id, _ghost:true, textContent:'', innerHTML:'', className:'', value:'',
      disabled:false, checked:false,
      style:{ display:'' },
      classList:{
        _c:{},
        add:     function(c){ this._c[c]=1; },
        remove:  function(c){ delete this._c[c]; },
        toggle:  function(c,f){ f===undefined?( this._c[c]?delete this._c[c]:this._c[c]=1 ):(f?this._c[c]=1:delete this._c[c]); },
        contains:function(c){ return !!this._c[c]; },
      },
      getAttribute:function(){ return null; },
      setAttribute:function(){},
      addEventListener:function(){},
      removeEventListener:function(){},
      getBoundingClientRect:function(){ return {top:0,left:0,right:0,bottom:0,width:0,height:0}; },
      querySelectorAll:function(){ return []; },
      querySelector:function(){ return null; },
      appendChild:function(){}, remove:function(){},
      focus:function(){}, blur:function(){}, click:function(){},
    };
    return g;
  }

  // Solo ID che davvero non hanno equivalente mobile
  var GHOST_IDS = [
    'panelResize','panel',
    'moneyShotModal','msShotCanvas',
    'chartHint',
    'betaPopupOverlay',
    'apiBitgetPositions','apiSyncTime',
    'tbPnl',
  ];
  var _ghosts = {};
  GHOST_IDS.forEach(function(id){ _ghosts[id] = makeGhost(id); });

  // ── 3. Override getElementById ────────────────────────────────
  var _orig = document.getElementById.bind(document);

  document.getElementById = function(id) {
    // Remappa a ID mobile
    if (ID_MAP[id]) return _orig(ID_MAP[id]) || _orig(id) || makeGhost(id);
    // Ghost per ID desktop-only
    if (_ghosts[id]) return _ghosts[id];
    // Normale
    var el = _orig(id);
    // Ghost on-the-fly solo se non trovato E non è un ID mobile legittimo
    if (!el) { _ghosts[id] = makeGhost(id); return _ghosts[id]; }
    return el;
  };

  // ── 4. loadAccount() — evita il crash a riga ~3697 ───────────
  // NB: accBalance/accAvail/accPnl/accMargin esistono nel panel-account mobile
  //     quindi NON sono ghost — getElementById li trova normalmente
  window.loadAccount = function() {
    var set = function(id, val) {
      var el = document.getElementById(id);
      if (el && !el._ghost) el.textContent = val;
    };
    set('accBalance','—'); set('accAvail','—');
    set('accPnl','—');     set('accMargin','—');
    set('tbBalance','—');  set('posCount','0');
    var pl = _orig('posList');
    if (pl) pl.innerHTML = '<div class="no-pos">Connetti il tuo exchange per vedere le posizioni</div>';
  };

  // ── 5. Patch funzioni auth — polling (definite in async IIFE) ─
  function patchWhen(name, fn) {
    if (window[name]) { fn(window[name]); return; }
    var n=0, t=setInterval(function(){
      if (window[name]) { clearInterval(t); fn(window[name]); }
      else if (++n>200) clearInterval(t);
    }, 50);
  }

  // rfSwitchTab: desktop usa '.auth-tab', mobile usa '.m-auth-tab'
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

  // rfShowApp: nasconde overlay mobile, mostra badge
  patchWhen('rfShowApp', function(orig) {
    window.rfShowApp = function(username) {
      var ov = _orig('m-auth-overlay');
      if (ov) { ov.style.display='none'; ov.classList.add('hidden'); }
      var bd = _orig('m-userBadge');
      if (bd) { bd.style.display='flex'; bd.classList.add('visible'); }
      ['rfUsername','rfUsername2'].forEach(function(id){
        var el=_orig(id); if(el) el.textContent=username;
      });
      try { orig(username); } catch(e){}
    };
  });

  // rfDoLogout: mostra overlay mobile dopo logout
  patchWhen('rfDoLogout', function(orig) {
    window.rfDoLogout = async function() {
      try { await orig(); } catch(e){}
      var ov = _orig('m-auth-overlay');
      if (ov) { ov.style.display='flex'; ov.classList.remove('hidden'); }
      var bd = _orig('m-userBadge');
      if (bd) { bd.style.display='none'; bd.classList.remove('visible'); }
    };
  });

  // rfSaveApiKeys / rfDeleteApiKeys: chiudono modal mobile
  patchWhen('rfSaveApiKeys', function(orig) {
    window.rfSaveApiKeys = function() {
      try { orig(); } catch(e){}
      var m=_orig('m-apiModal'); if(m) m.classList.remove('open');
    };
  });
  patchWhen('rfDeleteApiKeys', function(orig) {
    window.rfDeleteApiKeys = function() {
      try { orig(); } catch(e){}
      var m=_orig('m-apiModal'); if(m) m.classList.remove('open');
    };
  });

  // ── 6. Chart resize dopo load ─────────────────────────────────
  // riskflow.js inizializza la chart con offsetWidth/Height che potrebbero
  // essere 0 se il layout flex non è ancora calcolato. Forziamo resize dopo.
  window.addEventListener('load', function() {
    function doResize() {
      try {
        var chartEl = _orig('chart');
        if (window.chart && chartEl && chartEl.offsetWidth > 0 && chartEl.offsetHeight > 0) {
          window.chart.resize(chartEl.offsetWidth, chartEl.offsetHeight);
          if (typeof resizeCanvas === 'function') resizeCanvas();
        }
      } catch(e){}
    }
    // Multipli tentativi per essere sicuri
    setTimeout(doResize, 100);
    setTimeout(doResize, 500);
    setTimeout(doResize, 1000);

    // Resize on window resize
    window.addEventListener('resize', doResize);
  });

  // ── 7. DOMContentLoaded ───────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    // Sync rfUsername → rfUsername2
    var u1 = _orig('rfUsername');
    if (u1) {
      new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          var u2=_orig('rfUsername2'); if(u2) u2.textContent=m.target.textContent;
        });
      }).observe(u1, {childList:true,characterData:true,subtree:true});
    }
  });

})();
