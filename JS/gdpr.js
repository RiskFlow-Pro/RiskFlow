// ─── RISKFLOW GDPR SYSTEM ───
// Cookie banner, consent management (localStorage + Firestore)
// Version: 1.0

(function () {
  'use strict';

  const CONSENT_VERSION = '1.0';
  const LS_KEY = 'rf_cookie_consent';

  // ── CONSENT STORAGE (localStorage) ──
  function consentLoad() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function consentSave(prefs) {
    const data = {
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      necessary: true, // sempre true
      analytics: !!prefs.analytics,
      marketing: !!prefs.marketing,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    return data;
  }

  // Espone lo stato attuale dei consensi
  window.rfGetConsent = function () {
    return consentLoad() || { necessary: true, analytics: false, marketing: false };
  };

  // ── FIRESTORE SYNC ──
  // Salva il consenso su Firestore /consents/{uid}
  // Chiamato quando l'utente è loggato (o appena dopo il login)
  window.rfSyncConsentToFirestore = async function (uid) {
    if (!uid) return;
    const prefs = consentLoad();
    if (!prefs) return;

    try {
      // Importa Firestore lazily (già importato da riskflow.js, ma usiamo il glob)
      if (typeof window._rfDb === 'undefined') return; // db non ancora pronto
      const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      await setDoc(doc(window._rfDb, 'consents', uid), {
        privacy:   true,
        terms:     true,
        marketing: !!prefs.marketing,
        analytics: !!prefs.analytics,
        timestamp: new Date().toISOString(),
        version:   CONSENT_VERSION,
      });
    } catch (e) {
      console.warn('[GDPR] Firestore sync failed:', e.message);
    }
  };

  // ── INJECT CSS ──
  function injectStyles() {
    if (document.getElementById('rf-gdpr-styles')) return;
    const style = document.createElement('style');
    style.id = 'rf-gdpr-styles';
    style.textContent = `
/* ── COOKIE BANNER ── */
#rf-cookie-banner {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 99999;
  background: rgba(13,13,17,.97);
  backdrop-filter: blur(16px);
  border-top: 1px solid #252530;
  padding: 16px 24px;
  display: flex;
  align-items: flex-start;
  gap: 20px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: #b0b0bf;
  animation: rfBannerIn .25s ease;
  box-shadow: 0 -4px 32px rgba(0,0,0,.5);
}
@keyframes rfBannerIn {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
#rf-cookie-banner .rf-cb-text {
  flex: 1;
  min-width: 0;
}
#rf-cookie-banner .rf-cb-title {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: #dddde8;
  margin-bottom: 4px;
}
#rf-cookie-banner .rf-cb-desc {
  font-size: 10.5px;
  color: #686878;
  line-height: 1.55;
  margin-bottom: 10px;
}
#rf-cookie-banner .rf-cb-links {
  font-size: 10px;
  color: #686878;
  margin-top: 4px;
}
#rf-cookie-banner .rf-cb-links a {
  color: #a855f7;
  text-decoration: none;
  margin-right: 12px;
}
#rf-cookie-banner .rf-cb-links a:hover { text-decoration: underline; }

/* Categories (expanded panel) */
#rf-cookie-expand {
  display: none;
  margin-top: 12px;
  display: none;
}
#rf-cookie-expand.open { display: block; }
.rf-cb-category {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #1a1a22;
}
.rf-cb-category:last-child { border-bottom: none; }
.rf-cb-cat-info { flex: 1; min-width: 0; margin-right: 12px; }
.rf-cb-cat-name {
  font-size: 11px;
  color: #dddde8;
  margin-bottom: 2px;
  font-weight: 500;
}
.rf-cb-cat-desc { font-size: 10px; color: #686878; line-height: 1.5; }

/* Toggle switch */
.rf-toggle {
  position: relative;
  width: 34px;
  height: 19px;
  flex-shrink: 0;
}
.rf-toggle input { opacity: 0; width: 0; height: 0; }
.rf-toggle-slider {
  position: absolute;
  inset: 0;
  background: #252530;
  border-radius: 20px;
  cursor: pointer;
  transition: background .2s;
  border: 1px solid #333344;
}
.rf-toggle-slider:before {
  content: '';
  position: absolute;
  height: 13px; width: 13px;
  left: 2px; bottom: 2px;
  background: #686878;
  border-radius: 50%;
  transition: transform .2s, background .2s;
}
.rf-toggle input:checked + .rf-toggle-slider { background: rgba(168,85,247,.2); border-color: #a855f7; }
.rf-toggle input:checked + .rf-toggle-slider:before { transform: translateX(15px); background: #a855f7; }
.rf-toggle input:disabled + .rf-toggle-slider { opacity: .5; cursor: not-allowed; }

/* Buttons */
#rf-cookie-banner .rf-cb-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  min-width: 130px;
}
.rf-cb-btn {
  padding: 8px 14px;
  border-radius: 5px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  cursor: pointer;
  border: none;
  transition: opacity .15s, background .15s;
  white-space: nowrap;
  text-align: center;
  font-weight: 500;
}
.rf-cb-btn:hover { opacity: .85; }
.rf-cb-btn-accept {
  background: #a855f7;
  color: #fff;
}
.rf-cb-btn-customize {
  background: transparent;
  border: 1px solid #252530;
  color: #686878;
}
.rf-cb-btn-customize:hover { color: #dddde8; border-color: #333344; }
.rf-cb-btn-save {
  background: #18181f;
  border: 1px solid #a855f7;
  color: #a855f7;
}
.rf-cb-btn-reject {
  background: transparent;
  border: 1px solid #252530;
  color: #686878;
  font-size: 10px;
}

/* ── COOKIE SETTINGS MODAL (from footer) ── */
#rf-cookie-modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.7);
  backdrop-filter: blur(6px);
  z-index: 99998;
  align-items: center;
  justify-content: center;
}
#rf-cookie-modal.open { display: flex; }
.rf-cm-card {
  background: #0d0d11;
  border: 1px solid #252530;
  border-radius: 10px;
  padding: 28px;
  width: 440px;
  max-width: calc(100vw - 32px);
  font-family: 'DM Mono', monospace;
}
.rf-cm-title {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: #fff;
  margin-bottom: 4px;
}
.rf-cm-sub {
  font-size: 10.5px;
  color: #686878;
  margin-bottom: 20px;
  line-height: 1.5;
}
.rf-cm-cats { margin-bottom: 20px; }
.rf-cm-category {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #1a1a22;
}
.rf-cm-category:last-child { border-bottom: none; }
.rf-cm-cat-name { font-size: 12px; color: #dddde8; margin-bottom: 3px; font-weight: 500; }
.rf-cm-cat-desc { font-size: 10px; color: #686878; line-height: 1.5; max-width: 300px; }
.rf-cm-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.rf-cm-btn {
  flex: 1;
  padding: 9px 16px;
  border-radius: 5px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  cursor: pointer;
  border: none;
  font-weight: 500;
}
.rf-cm-btn-save { background: #a855f7; color: #fff; }
.rf-cm-btn-accept { background: #18181f; border: 1px solid #252530; color: #dddde8; }
.rf-cm-btn-close { background: transparent; border: 1px solid #1a1a22; color: #686878; }
.rf-cm-links { margin-top: 14px; font-size: 10px; color: #686878; }
.rf-cm-links a { color: #a855f7; text-decoration: none; margin-right: 10px; }
.rf-cm-links a:hover { text-decoration: underline; }

/* ── APP FOOTER ── */
.rf-app-footer {
  background: var(--surface, #0d0d11);
  border-top: 1px solid var(--border, #1a1a22);
  padding: 10px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-family: 'DM Mono', monospace;
  font-size: 9.5px;
  color: var(--muted2, #686878);
  flex-shrink: 0;
}
.rf-app-footer a {
  color: var(--muted2, #686878);
  text-decoration: none;
  transition: color .15s;
}
.rf-app-footer a:hover { color: var(--text, #dddde8); }
.rf-app-footer .rf-footer-links { display: flex; gap: 14px; flex-wrap: wrap; }
.rf-app-footer .rf-footer-copy { color: var(--muted, #3a3a48); }
.rf-footer-logo { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 11px; }
.rf-footer-logo span { color: var(--text, #dddde8); }
.rf-footer-logo em { color: var(--accent, #a855f7); font-style: normal; }

@media (max-width: 600px) {
  #rf-cookie-banner { flex-direction: column; padding: 14px 16px; }
  #rf-cookie-banner .rf-cb-actions { flex-direction: row; flex-wrap: wrap; min-width: 0; }
  .rf-cb-btn { flex: 1; min-width: 100px; }
}
    `;
    document.head.appendChild(style);
  }

  // ── BUILD COOKIE BANNER ──
  function buildBanner() {
    const banner = document.createElement('div');
    banner.id = 'rf-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Preferenze cookie');
    banner.innerHTML = `
      <div class="rf-cb-text">
        <div class="rf-cb-title">🍪 Informativa sui Cookie</div>
        <div class="rf-cb-desc">
          Utilizziamo cookie tecnici necessari per il funzionamento dell'app.<br>
          Puoi scegliere se accettare anche cookie analitici e di marketing.
        </div>

        <div id="rf-cookie-expand">
          <div class="rf-cb-category">
            <div class="rf-cb-cat-info">
              <div class="rf-cb-cat-name">🔒 Cookie Necessari</div>
              <div class="rf-cb-cat-desc">Sessione, autenticazione Firebase, impostazioni app. Sempre attivi.</div>
            </div>
            <label class="rf-toggle" title="Sempre attivi">
              <input type="checkbox" id="rf-cb-necessary" checked disabled>
              <span class="rf-toggle-slider"></span>
            </label>
          </div>
          <div class="rf-cb-category">
            <div class="rf-cb-cat-info">
              <div class="rf-cb-cat-name">📊 Cookie Analitici</div>
              <div class="rf-cb-cat-desc">Statistiche di utilizzo anonime per migliorare il servizio. Attualmente non in uso.</div>
            </div>
            <label class="rf-toggle">
              <input type="checkbox" id="rf-cb-analytics">
              <span class="rf-toggle-slider"></span>
            </label>
          </div>
          <div class="rf-cb-category">
            <div class="rf-cb-cat-info">
              <div class="rf-cb-cat-name">📣 Cookie Marketing</div>
              <div class="rf-cb-cat-desc">Comunicazioni promozionali personalizzate. Attualmente non in uso.</div>
            </div>
            <label class="rf-toggle">
              <input type="checkbox" id="rf-cb-marketing">
              <span class="rf-toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="rf-cb-links">
          <a href="privacy.html" target="_blank">Privacy Policy</a>
          <a href="cookies.html" target="_blank">Cookie Policy</a>
          <a href="terms.html" target="_blank">Termini di Servizio</a>
        </div>
      </div>
      <div class="rf-cb-actions" id="rf-cb-actions-default">
        <button class="rf-cb-btn rf-cb-btn-accept" id="rf-cb-accept-all">Accetta tutti</button>
        <button class="rf-cb-btn rf-cb-btn-customize" id="rf-cb-customize">Personalizza</button>
        <button class="rf-cb-btn rf-cb-btn-reject" id="rf-cb-reject">Solo necessari</button>
      </div>
    `;
    document.body.appendChild(banner);

    // Events
    document.getElementById('rf-cb-accept-all').addEventListener('click', () => {
      saveAndClose({ analytics: true, marketing: true });
    });

    document.getElementById('rf-cb-reject').addEventListener('click', () => {
      saveAndClose({ analytics: false, marketing: false });
    });

    let expanded = false;
    document.getElementById('rf-cb-customize').addEventListener('click', () => {
      const panel = document.getElementById('rf-cookie-expand');
      const btn   = document.getElementById('rf-cb-customize');
      expanded = !expanded;
      panel.classList.toggle('open', expanded);
      btn.textContent = expanded ? 'Salva scelte' : 'Personalizza';
      if (expanded) {
        // Replace button action to save custom prefs
        btn.removeEventListener('click', arguments.callee);
        btn.onclick = () => {
          saveAndClose({
            analytics: document.getElementById('rf-cb-analytics').checked,
            marketing: document.getElementById('rf-cb-marketing').checked,
          });
        };
      }
    });
  }

  function saveAndClose(prefs) {
    const saved = consentSave(prefs);
    removeBanner();
    // Sync to Firestore se utente loggato
    if (window._rfCurrentUid) {
      window.rfSyncConsentToFirestore(window._rfCurrentUid);
    }
    // Dispatch event per altri script
    document.dispatchEvent(new CustomEvent('rf:consentSaved', { detail: saved }));
  }

  function removeBanner() {
    const b = document.getElementById('rf-cookie-banner');
    if (b) {
      b.style.animation = 'none';
      b.style.transform = 'translateY(100%)';
      b.style.opacity = '0';
      b.style.transition = 'transform .25s ease, opacity .25s ease';
      setTimeout(() => b.remove(), 260);
    }
  }

  // ── COOKIE SETTINGS MODAL ──
  function buildModal() {
    if (document.getElementById('rf-cookie-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'rf-cookie-modal';
    modal.innerHTML = `
      <div class="rf-cm-card">
        <div class="rf-cm-title">🍪 Preferenze Cookie</div>
        <div class="rf-cm-sub">Gestisci le tue preferenze. I cookie necessari non possono essere disabilitati.</div>
        <div class="rf-cm-cats">
          <div class="rf-cm-category">
            <div>
              <div class="rf-cm-cat-name">🔒 Cookie Necessari</div>
              <div class="rf-cm-cat-desc">Indispensabili per autenticazione e funzionamento dell'app.</div>
            </div>
            <label class="rf-toggle">
              <input type="checkbox" id="rf-cm-necessary" checked disabled>
              <span class="rf-toggle-slider"></span>
            </label>
          </div>
          <div class="rf-cm-category">
            <div>
              <div class="rf-cm-cat-name">📊 Cookie Analitici</div>
              <div class="rf-cm-cat-desc">Dati di utilizzo anonimi per migliorare il servizio.</div>
            </div>
            <label class="rf-toggle">
              <input type="checkbox" id="rf-cm-analytics">
              <span class="rf-toggle-slider"></span>
            </label>
          </div>
          <div class="rf-cm-category">
            <div>
              <div class="rf-cm-cat-name">📣 Cookie Marketing</div>
              <div class="rf-cm-cat-desc">Comunicazioni promozionali personalizzate.</div>
            </div>
            <label class="rf-toggle">
              <input type="checkbox" id="rf-cm-marketing">
              <span class="rf-toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="rf-cm-actions">
          <button class="rf-cm-btn rf-cm-btn-save" id="rf-cm-save">Salva preferenze</button>
          <button class="rf-cm-btn rf-cm-btn-accept" id="rf-cm-accept-all">Accetta tutti</button>
          <button class="rf-cm-btn rf-cm-btn-close" id="rf-cm-close">Chiudi</button>
        </div>
        <div class="rf-cm-links">
          <a href="privacy.html" target="_blank">Privacy Policy</a>
          <a href="cookies.html" target="_blank">Cookie Policy</a>
          <a href="terms.html" target="_blank">Termini</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Chiudi cliccando fuori
    modal.addEventListener('click', (e) => {
      if (e.target === modal) rfCloseCookieModal();
    });

    document.getElementById('rf-cm-close').addEventListener('click', rfCloseCookieModal);

    document.getElementById('rf-cm-accept-all').addEventListener('click', () => {
      saveAndClose({ analytics: true, marketing: true });
      rfCloseCookieModal();
    });

    document.getElementById('rf-cm-save').addEventListener('click', () => {
      saveAndClose({
        analytics: document.getElementById('rf-cm-analytics').checked,
        marketing: document.getElementById('rf-cm-marketing').checked,
      });
      rfCloseCookieModal();
    });
  }

  window.rfOpenCookieModal = function () {
    buildModal();
    const modal = document.getElementById('rf-cookie-modal');
    const prefs = consentLoad() || {};
    const analEl = document.getElementById('rf-cm-analytics');
    const markEl = document.getElementById('rf-cm-marketing');
    if (analEl) analEl.checked = !!prefs.analytics;
    if (markEl) markEl.checked = !!prefs.marketing;
    modal.classList.add('open');
  };

  window.rfCloseCookieModal = function () {
    const modal = document.getElementById('rf-cookie-modal');
    if (modal) modal.classList.remove('open');
  };

  // ── APP FOOTER (for index.html / app pages) ──
  window.rfInjectAppFooter = function () {
    if (document.getElementById('rf-app-footer')) return;
    const footer = document.createElement('footer');
    footer.id = 'rf-app-footer';
    footer.className = 'rf-app-footer';
    footer.innerHTML = `
      <span class="rf-footer-logo"><span>Risk</span><em>Flow</em></span>
      <nav class="rf-footer-links">
        <a href="privacy.html" target="_blank">Privacy</a>
        <a href="terms.html" target="_blank">Termini</a>
        <a href="cookies.html" target="_blank">Cookie</a>
        <a href="riskflowdocs.html" target="_blank">Docs</a>
        <a href="#" onclick="rfOpenCookieModal();return false;">Gestisci preferenze cookie</a>
      </nav>
      <span class="rf-footer-copy">© 2026 RiskFlow — Beta</span>
    `;
    document.body.appendChild(footer);
  };

  // ── INIT ──
  function init() {
    injectStyles();

    // Mostra banner solo se nessun consenso salvato (o versione diversa)
    const saved = consentLoad();
    if (!saved || saved.version !== CONSENT_VERSION) {
      // Aspetta che il DOM sia pronto
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildBanner);
      } else {
        // Piccolo delay per non bloccare il render principale
        setTimeout(buildBanner, 600);
      }
    }
  }

  init();

})();
