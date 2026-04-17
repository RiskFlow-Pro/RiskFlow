// ═══════════════════════════════════════════════════════════════
//  riskflow-mobile-patch.js
//  Da caricare PRIMA di riskflow.js nel mobile.html
//  Risolve tutti i crash causati da ID desktop mancanti nel DOM mobile
// ═══════════════════════════════════════════════════════════════

(function () {

  // ── Mappa: ID desktop → ID mobile ──────────────────────────────
  // Tutte le discrepanze tra desktop HTML e mobile HTML
  const ID_MAP = {
    // Auth overlay
    'auth-overlay':       'm-auth-overlay',
    'userBadge':          'm-userBadge',

    // Account tab (desktop ha accBalance/accAvail/accPnl/accMargin, mobile no)
    // Li creiamo come elementi virtuali in memoria (vedi sotto)

    // API modal
    'apiModal':           'm-apiModal',
    'apiStatus':          'm-apiStatus',
    'apiBitgetBalance':   'm-apiBitgetBalance',
    'apiBitgetUpnl':      'm-apiBitgetUpnl',
    'apiBitgetPositions': null,   // non esiste nel mobile, restituiamo null
    'apiSyncTime':        null,

    // Exchange buttons
    'exBtnBitget':        'm-exBtnBitget',
    'exBtnBybit':         'm-exBtnBybit',
    'exBtnBybitDemo':     'm-exBtnBybitDemo',
    'exBtnWeex':          'm-exBtnWeex',
    'exBtnBingx':         'm-exBtnBingx',

    // Pos modal
    'posModal':           'm-posModal',
    'pmTitle':            'pmTitle',
    'pmSub':              'pmSub',
    'pmRows':             'pmRows',
    'pmConfirmBtn':       'pmConfirmBtn',

    // Pos list
    'posList':            'm-posList',

    // tbPnl non esiste nel mobile TF bar — creiamo un ghost
    'tbPnl':              null,

    // Panel resize (desktop only)
    'panelResize':        null,
    'panel':              null,

    // moneyShot modal
    'moneyShotModal':     null,
    'msShotCanvas':       null,

    // DLL (desktop only — nel mobile non ci sono questi elementi)
    'dllSw':              null,
    'dllLbl':             null,
    'dllToggle':          null,
    'dllSettings':        null,
    'dllBanner':          null,
    'dllPct':             null,
    'dllCountdown':       null,
  };

  // ── Elementi ghost in memoria per campi che non esistono nel mobile ──
  // riskflow.js fa .textContent = '...' su questi — usiamo un proxy silenzioso
  function makeGhost(id) {
    const ghost = document.createElement('span');
    ghost.id = id;
    ghost.style.display = 'none';
    ghost.setAttribute('data-ghost', '1');
    document.body.appendChild(ghost);
    return ghost;
  }

  // Ghost per elementi account che nel mobile sono nel panel-account
  const GHOST_IDS = [
    'accBalance', 'accAvail', 'accPnl', 'accMargin',
    'tbPnl',
    'apiBitgetPositions', 'apiSyncTime',
    'moneyShotModal', 'msShotCanvas',
    'panelResize', 'panel',
  ];

  // Crea tutti i ghost subito, prima che riskflow.js li cerchi
  const _ghostMap = {};
  GHOST_IDS.forEach(id => {
    _ghostMap[id] = makeGhost('_ghost_' + id);
  });

  // ── Override document.getElementById ──────────────────────────
  const _origGetById = document.getElementById.bind(document);

  document.getElementById = function (id) {
    // 1. Mappa diretta a ID mobile
    if (id in ID_MAP) {
      const mobileId = ID_MAP[id];
      if (mobileId === null) {
        // Restituisce ghost silenzioso
        return _ghostMap[id] || makeGhost('_ghost_' + id);
      }
      const el = _origGetById(mobileId);
      if (el) return el;
      // fallback all'ID originale se il mobile ID non esiste
      return _origGetById(id);
    }

    // 2. Ghost per ID che sappiamo non esistono
    if (_ghostMap[id]) return _ghostMap[id];

    // 3. Passthrough normale
    return _origGetById(id);
  };

  // ── Patch rfShowApp: usa gli ID mobili per auth overlay ─────────
  // rfShowApp viene chiamata da riskflow.js dopo login riuscito.
  // Dobbiamo intercettarla e aggiornare anche gli elementi mobile.
  const _patchRfShowApp = () => {
    const origShow = window.rfShowApp;
    if (origShow) {
      window.rfShowApp = function (username) {
        // Nascondi overlay mobile
        const overlay = _origGetById('m-auth-overlay');
        if (overlay) overlay.style.display = 'none';
        // Aggiorna badge mobile
        const badge = _origGetById('m-userBadge');
        if (badge) badge.style.display = 'flex';
        const uname = _origGetById('rfUsername');
        if (uname) uname.textContent = username;
        const uname2 = _origGetById('rfUsername2');
        if (uname2) uname2.textContent = username;
        // Chiama originale se esiste
        try { origShow(username); } catch(e) {}
      };
    } else {
      // rfShowApp non ancora definita — riprova tra poco
      setTimeout(_patchRfShowApp, 100);
    }
  };

  // ── Patch onAuthStateChanged logout: ripristina overlay mobile ──
  // rfDoLogout in riskflow.js fa getElementById('auth-overlay') → già mappato
  // ma dobbiamo anche mostrare l'overlay mobile
  const _patchRfDoLogout = () => {
    const origLogout = window.rfDoLogout;
    if (origLogout) {
      window.rfDoLogout = async function () {
        await origLogout();
        // Mostra overlay mobile
        const overlay = _origGetById('m-auth-overlay');
        if (overlay) overlay.style.display = 'flex';
        const badge = _origGetById('m-userBadge');
        if (badge) badge.style.display = 'none';
      };
    } else {
      setTimeout(_patchRfDoLogout, 200);
    }
  };

  // ── Patch rfSwitchTab: usa classi mobile ─────────────────────────
  // Il desktop usa '.auth-tab', il mobile usa '.m-auth-tab'
  const _patchRfSwitchTab = () => {
    const orig = window.rfSwitchTab;
    if (orig) {
      window.rfSwitchTab = function (tab) {
        // Mostra/nascondi i form (questi hanno gli stessi ID rf-form-*)
        ['login', 'register', 'forgot'].forEach(t => {
          const form = _origGetById('rf-form-' + t);
          if (form) form.classList.toggle('hidden', t !== tab);
        });
        // Aggiorna i tab button con classe mobile
        document.querySelectorAll('.m-auth-tab').forEach((btn, i) => {
          const tabs = ['login', 'register', 'forgot'];
          btn.classList.toggle('active', tabs[i] === tab);
        });
      };
    } else {
      setTimeout(_patchRfSwitchTab, 100);
    }
  };

  // ── Patch rfSaveApiKeys: chiude il modal mobile, non quello desktop ──
  const _patchRfSaveApiKeys = () => {
    const orig = window.rfSaveApiKeys;
    if (orig) {
      window.rfSaveApiKeys = function () {
        orig();
        // riskflow.js prova a chiudere 'apiModal' → già mappato a 'm-apiModal'
        // ma per sicurezza forziamo anche la chiusura del modal mobile
        const modal = _origGetById('m-apiModal');
        if (modal) modal.classList.remove('open');
      };
    } else {
      setTimeout(_patchRfSaveApiKeys, 200);
    }
  };

  // ── Patch rfDeleteApiKeys: chiude modal mobile ───────────────────
  const _patchRfDeleteApiKeys = () => {
    const orig = window.rfDeleteApiKeys;
    if (orig) {
      window.rfDeleteApiKeys = function () {
        orig();
        const modal = _origGetById('m-apiModal');
        if (modal) modal.classList.remove('open');
      };
    } else {
      setTimeout(_patchRfDeleteApiKeys, 200);
    }
  };

  // ── Patch accBalance: sincronizza il panel-account mobile ────────
  // riskflow.js scrive su 'accBalance' (ghost) — noi osserviamo e rispecchiamo
  // nel panel-account mobile (se presente)
  const _syncAccountPanel = () => {
    const fieldMap = {
      'accBalance': 'm-acc-balance',
      'accAvail':   'm-acc-avail',
      'accPnl':     'm-acc-pnl',
      'accMargin':  'm-acc-margin',
    };
    Object.entries(fieldMap).forEach(([ghostId, mobileId]) => {
      const ghost = _ghostMap[ghostId] || _origGetById('_ghost_' + ghostId);
      if (!ghost) return;
      const observer = new MutationObserver(() => {
        const mEl = _origGetById(mobileId);
        if (mEl) {
          mEl.textContent = ghost.textContent;
          mEl.className = ghost.className;
        }
      });
      observer.observe(ghost, { childList: true, characterData: true, subtree: true });
    });
  };

  // ── Aggiungi posList al panel-positions mobile ───────────────────
  // riskflow.js fa getElementById('posList').innerHTML = ...
  // Nel mobile questo elemento si chiama 'm-posList' → già mappato in ID_MAP
  // Dobbiamo assicurarci che esista nel DOM mobile
  const _ensurePosListExists = () => {
    if (!_origGetById('m-posList')) {
      // Crealo dentro il panel-positions
      const panel = _origGetById('panel-positions');
      if (panel) {
        const div = document.createElement('div');
        div.id = 'm-posList';
        div.className = 'pos-list';
        panel.appendChild(div);
      }
    }
    // Mappa 'posList' → 'm-posList' (già in ID_MAP)
  };

  // ── Auth overlay: mostra subito l'overlay mobile ─────────────────
  // riskflow.js gestisce onAuthStateChanged che mostra/nasconde 'auth-overlay'
  // Il nostro ID_MAP lo redirige a 'm-auth-overlay', ma dobbiamo assicurarci
  // che l'overlay sia visibile prima che Firebase risponda
  const _initAuthOverlay = () => {
    const overlay = _origGetById('m-auth-overlay');
    if (overlay) {
      // Lascialo visibile (è il default nel HTML) — non serve fare nulla
      // Se Firebase ha già l'utente in sessione, onAuthStateChanged chiamerà
      // rfShowApp che lo nasconderà
    }
  };

  // ── Esegui tutte le patch dopo che riskflow.js ha caricato ───────
  // Usiamo un observer su window per le funzioni che vengono definite async
  window.addEventListener('load', function () {
    _patchRfShowApp();
    _patchRfDoLogout();
    _patchRfSwitchTab();
    _patchRfSaveApiKeys();
    _patchRfDeleteApiKeys();
    _syncAccountPanel();
    _ensurePosListExists();
    _initAuthOverlay();
  });

  // Alcune funzioni sono definite dentro l'IIFE async di Firebase —
  // potrebbero non essere pronte al 'load'. Riapplica le patch dopo 1s.
  window.addEventListener('load', function () {
    setTimeout(function () {
      _patchRfShowApp();
      _patchRfDoLogout();
      _patchRfSwitchTab();
      _patchRfSaveApiKeys();
      _patchRfDeleteApiKeys();
    }, 1000);
  });

  // ── Patch immediata: loadAccount() a riga 3697 di riskflow.js ───
  // loadAccount() cerca 'accBalance', 'accAvail', 'accPnl', 'accMargin', 'tbPnl', 'posList'
  // Tutti già gestiti dal ghost + ID_MAP sopra.
  // L'unico che può crashare è 'posList' se il DOM non è pronto.
  // Sovrascriviamo loadAccount prima che venga chiamata.
  window.loadAccount = function () {
    // Sicuro: usa l'ID_MAP per trovare gli elementi (o i ghost)
    const safe = (id) => document.getElementById(id); // usa il nostro override
    const set = (id, val, cls) => {
      const el = safe(id);
      if (!el) return;
      el.textContent = val;
      if (cls) el.className = cls;
    };
    set('accBalance', '—');
    set('accAvail',   '—');
    set('accPnl',     '—');
    set('accMargin',  '—');
    set('tbBalance',  '—');
    set('tbPnl',      '—');
    set('posCount',   '0');
    const posListEl = safe('posList');
    if (posListEl) posListEl.innerHTML = '<div style="padding:16px;color:var(--muted2);font-size:12px;text-align:center">Connetti il tuo exchange per vedere le posizioni</div>';
  };

})();
