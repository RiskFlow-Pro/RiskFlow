// ─── RISKFLOW HOTKEYS SYSTEM ───
// Gestisce hotkeys personalizzabili + combo fisse Alt+S / Alt+L
// Persiste in localStorage: 'rf_hotkeys'

(function () {

  // ── DEFINIZIONE AZIONI ──
  // fixed: true → non personalizzabile (combo Alt/Ctrl)
  // group: per raggruppare nel modal
  const HK_ACTIONS = [
    // Trading
    { id: 'openTrade',    label: 'Open Trade (confirm)',     group: 'Trading',    def: 'Enter',  fixed: false },
    { id: 'clearAll',     label: 'Clear all',                group: 'Trading',    def: 'C',      fixed: false },
    { id: 'toggleTP',     label: 'Toggle Take Profits',      group: 'Trading',    def: 'T',      fixed: false },
    // Chart
    { id: 'gotoPrice',    label: 'Vai al prezzo live',        group: 'Chart',      def: 'G',      fixed: false },
    { id: 'setEntry',     label: 'Set Entry (click chart)',   group: 'Chart',      def: 'E',      fixed: false },
    { id: 'setSL',        label: 'Set Stop Loss (click chart)',group: 'Chart',     def: 'S',      fixed: false },
    { id: 'setTP1',       label: 'Set TP1 (click chart)',     group: 'Chart',      def: 'F1',     fixed: false },
    { id: 'setTP2',       label: 'Set TP2 (click chart)',     group: 'Chart',      def: 'F2',     fixed: false },
    { id: 'setTP3',       label: 'Set TP3 (click chart)',     group: 'Chart',      def: 'F3',     fixed: false },
    // Timeframe
    { id: 'tf1m',         label: 'Timeframe 1m',             group: 'Timeframe',  def: '1',      fixed: false },
    { id: 'tf5m',         label: 'Timeframe 5m',             group: 'Timeframe',  def: '2',      fixed: false },
    { id: 'tf15m',        label: 'Timeframe 15m',            group: 'Timeframe',  def: '3',      fixed: false },
    { id: 'tf1h',         label: 'Timeframe 1h',             group: 'Timeframe',  def: '4',      fixed: false },
    { id: 'tf4h',         label: 'Timeframe 4h',             group: 'Timeframe',  def: '5',      fixed: false },
    { id: 'tf1d',         label: 'Timeframe 1D',             group: 'Timeframe',  def: '6',      fixed: false },
    // Navigazione
    { id: 'openPair',     label: 'Apri selettore pair',       group: 'Navigazione',def: 'P',      fixed: false },
    { id: 'orderMarket',  label: 'Order type: Market',        group: 'Navigazione',def: 'M',      fixed: false },
    { id: 'orderLimit',   label: 'Order type: Limit',         group: 'Navigazione',def: 'L',      fixed: false },
    { id: 'syncAccount',  label: 'Sync account',              group: 'Navigazione',def: 'R',      fixed: false },
    // API — combo fisse
    { id: 'exportApi',    label: 'Esporta API keys (JSON)',   group: 'API Keys',   def: 'Alt+S',  fixed: true  },
    { id: 'importApi',    label: 'Importa API keys (JSON)',   group: 'API Keys',   def: 'Alt+L',  fixed: true  },
  ];

  const LS_KEY = 'rf_hotkeys';

  // ── LOAD / SAVE ──
  function hkLoad() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function hkSave(map) {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  }

  // Ritorna il tasto attivo per un'azione (personalizzato o default)
  function hkGetKey(id) {
    const map = hkLoad();
    const action = HK_ACTIONS.find(a => a.id === id);
    return map[id] || (action ? action.def : null);
  }

  // Ritorna la mappa completa id→key
  function hkGetAll() {
    const map = hkLoad();
    const result = {};
    HK_ACTIONS.forEach(a => { result[a.id] = map[a.id] || a.def; });
    return result;
  }

  // ── ESECUZIONE AZIONI ──
  function hkExecute(id) {
    switch (id) {
      case 'openTrade':
        if (typeof openModal === 'function') openModal();
        break;
      case 'clearAll':
        if (typeof clearAll === 'function') clearAll();
        break;
      case 'toggleTP':
        if (typeof toggleTP === 'function') toggleTP();
        break;
      case 'gotoPrice':
        if (typeof gotoPrice === 'function') gotoPrice();
        break;
      case 'setEntry':
        if (typeof activateClick === 'function') activateClick('entry');
        break;
      case 'setSL':
        if (typeof activateClick === 'function') activateClick('sl');
        break;
      case 'setTP1':
        if (typeof activateClick === 'function') activateClick('tp1');
        break;
      case 'setTP2':
        if (typeof activateClick === 'function') activateClick('tp2');
        break;
      case 'setTP3':
        if (typeof activateClick === 'function') activateClick('tp3');
        break;
      case 'tf1m':
        if (typeof setTF === 'function') setTF('1m');
        break;
      case 'tf5m':
        if (typeof setTF === 'function') setTF('5m');
        break;
      case 'tf15m':
        if (typeof setTF === 'function') setTF('15m');
        break;
      case 'tf1h':
        if (typeof setTF === 'function') setTF('1H');
        break;
      case 'tf4h':
        if (typeof setTF === 'function') setTF('4H');
        break;
      case 'tf1d':
        if (typeof setTF === 'function') setTF('1D');
        break;
      case 'openPair':
        if (typeof openPairModal === 'function') openPairModal();
        break;
      case 'orderMarket':
        if (typeof setOType === 'function') setOType('market');
        break;
      case 'orderLimit':
        if (typeof setOType === 'function') setOType('limit');
        break;
      case 'syncAccount':
        if (typeof refreshAccount === 'function') refreshAccount();
        break;
      case 'exportApi':
        if (typeof rfExportApiKeys === 'function') rfExportApiKeys();
        break;
      case 'importApi':
        // Apre il file picker nascosto
        const imp = document.getElementById('apiImportInput');
        if (imp) imp.click();
        break;
    }
  }

  // ── NORMALIZZA KEY STRING ──
  // Converte un KeyboardEvent in una stringa canonica (es. "Shift+A", "F1", "Enter")
  function hkNormalizeEvent(e) {
    const parts = [];
    if (e.altKey)   parts.push('Alt');
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    // Key display
    let key = e.key;
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();
    parts.push(key);
    return parts.join('+');
  }

  // Verifica se due key string sono uguali (case-insensitive per lettere singole)
  function hkMatch(keyStr, event) {
    return hkNormalizeEvent(event) === keyStr;
  }

  // ── GUARD: non attivare se focus è su un input/textarea/select ──
  function hkIsInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }

  // ── LISTENER GLOBALE ──
  document.addEventListener('keydown', function (e) {
    // Se stiamo catturando un tasto → gestito separatamente
    if (_capturing) return;

    // Alt+S → esporta API (fisso, sempre attivo anche con focus su input)
    if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      hkExecute('exportApi');
      return;
    }
    // Alt+L → importa API
    if (e.altKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      hkExecute('importApi');
      return;
    }

    // Tutti gli altri: non attivare se su input
    if (hkIsInputFocused()) return;

    // Escape chiude modal hotkeys
    if (e.key === 'Escape') {
      const modal = document.getElementById('hkModal');
      if (modal && modal.classList.contains('open')) {
        hkCloseModal();
        return;
      }
    }

    const keyStr = hkNormalizeEvent(e);
    const allKeys = hkGetAll();

    for (const id in allKeys) {
      const action = HK_ACTIONS.find(a => a.id === id);
      if (action && action.fixed) continue; // le fisse sono già gestite sopra
      if (allKeys[id] === keyStr) {
        e.preventDefault();
        hkExecute(id);
        return;
      }
    }
  });

  // ── CAPTURE STATE ──
  let _capturing = null; // id dell'azione in cattura, o null

  function hkStartCapture(id) {
    const action = HK_ACTIONS.find(a => a.id === id);
    if (!action || action.fixed) return;

    _capturing = id;

    // Mostra overlay
    const overlay = document.getElementById('hkCaptureOverlay');
    const subEl   = document.getElementById('hkCaptureAction');
    if (overlay) overlay.style.display = 'flex';
    if (subEl)   subEl.textContent = action.label;

    // Evidenzia il tasto nel modal
    const btn = document.querySelector(`[data-hk-id="${id}"]`);
    if (btn) btn.classList.add('capturing');

    // Listener capture
    function onCapture(e) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        hkCancelCapture();
        document.removeEventListener('keydown', onCapture, true);
        return;
      }

      // Tasti non validi da soli
      const modOnly = ['Alt','Control','Shift','Meta','CapsLock','Tab'];
      if (modOnly.includes(e.key)) return;

      const keyStr = hkNormalizeEvent(e);

      // Controlla conflitti con altri tasti (non fissi)
      const allKeys = hkGetAll();
      for (const otherId in allKeys) {
        if (otherId === id) continue;
        const otherAction = HK_ACTIONS.find(a => a.id === otherId);
        if (otherAction && otherAction.fixed) continue;
        if (allKeys[otherId] === keyStr) {
          // Conflitto — libera il vecchio
          const map = hkLoad();
          map[otherId] = '—'; // disassegnato
          hkSave(map);
          break;
        }
      }

      // Salva
      const map = hkLoad();
      map[id] = keyStr;
      hkSave(map);

      hkCancelCapture();
      document.removeEventListener('keydown', onCapture, true);
      hkRenderModal(); // aggiorna UI
    }

    document.addEventListener('keydown', onCapture, true);
  }

  function hkCancelCapture() {
    _capturing = null;
    const overlay = document.getElementById('hkCaptureOverlay');
    if (overlay) overlay.style.display = 'none';
    // Rimuovi classe capturing da tutti i bottoni
    document.querySelectorAll('.hk-key.capturing').forEach(el => el.classList.remove('capturing'));
  }

  // ── RESET DEFAULT ──
  function hkResetDefaults() {
    localStorage.removeItem(LS_KEY);
    hkRenderModal();
    if (typeof notify === 'function') notify('Hotkeys ripristinate ai default ✓', 'ok');
  }

  // ── RENDER MODAL ──
  function hkRenderModal() {
    const body = document.getElementById('hkModalBody');
    if (!body) return;

    const allKeys = hkGetAll();

    // Raggruppa per group
    const groups = {};
    HK_ACTIONS.forEach(a => {
      if (!groups[a.group]) groups[a.group] = [];
      groups[a.group].push(a);
    });

    let html = '';
    for (const groupName in groups) {
      html += `<div class="hk-group">
        <div class="hk-group-title">${groupName}</div>`;
      groups[groupName].forEach(a => {
        const key = allKeys[a.id] || '—';
        const fixedClass = a.fixed ? ' fixed' : '';
        const titleAttr  = a.fixed ? 'title="Combo fissa, non personalizzabile"' : 'title="Clicca per cambiare"';
        html += `<div class="hk-row">
          <span class="hk-row-label">${a.label}</span>
          <div class="hk-row-right">
            <span class="hk-key${fixedClass}" data-hk-id="${a.id}" ${titleAttr}>${hkFmtKey(key)}</span>
          </div>
        </div>`;
      });
      html += `</div>`;
    }

    body.innerHTML = html;

    // Aggiungi click listener ai tasti non fissi
    body.querySelectorAll('.hk-key:not(.fixed)').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-hk-id');
        if (id) hkStartCapture(id);
      });
    });
  }

  // Formatta la stringa chiave per display (es. "Enter" → "↵ Enter", "F1" → "F1")
  function hkFmtKey(key) {
    if (!key || key === '—') return '—';
    const map = {
      'Enter': '↵ Enter',
      'Space': '␣ Space',
      'Backspace': '⌫',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'Escape': 'Esc',
    };
    // Sostituisci singoli token
    return key.split('+').map(k => map[k] || k).join(' + ');
  }

  // ── OPEN / CLOSE MODAL ──
  window.hkOpenModal = function () {
    hkRenderModal();
    const modal = document.getElementById('hkModal');
    if (modal) modal.classList.add('open');
  };

  window.hkCloseModal = function () {
    const modal = document.getElementById('hkModal');
    if (modal) modal.classList.remove('open');
    hkCancelCapture();
  };

  window.hkResetDefaults = hkResetDefaults;

})();
