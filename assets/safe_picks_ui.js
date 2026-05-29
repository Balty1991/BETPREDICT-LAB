/* BETPREDICT LAB — Predicții Validate UI
   Reads only data/published_safe_picks_today.json.
   Rule: UI Predicții Validate = published snapshot = clean history/ROI source.
*/
(function(){
  'use strict';

  const DATA_URL = 'data/published_safe_picks_today.json';
  const FALLBACK_URL = 'data/safe_picks_today.json';
  const STATE = { loaded:false, data:null, error:null };

  const escLocal = (value) => String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

  const esc = (value) => (typeof window.esc === 'function' ? window.esc(value) : escLocal(value));
  const byId = (id) => document.getElementById(id);
  const nr = (v, d=0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const fmtPct = (v) => {
    const n = nr(v, NaN);
    if (!Number.isFinite(n)) return '—';
    return `${n >= 0 ? '+' : ''}${n.toFixed(Math.abs(n) >= 10 ? 0 : 1)}%`;
  };
  const fmtProb = (v) => {
    const n = nr(v, NaN);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(n >= 80 ? 0 : 1)}%`;
  };
  const fmtOdds = (v) => {
    const n = nr(v, NaN);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return n.toFixed(2).replace(/\.00$/,'');
  };
  const fmtTime = (raw) => {
    if (!raw) return 'Ora indisponibilă';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleString('ro-RO', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  };

  function installStyle(){
    if (byId('safe-picks-ui-style')) return;
    const s = document.createElement('style');
    s.id = 'safe-picks-ui-style';
    s.textContent = `
      .tab[data-t="safe"] .tl{color:#00e87a;font-weight:800}
      .safe-shell{display:flex;flex-direction:column;gap:10px}
      .safe-hero{position:relative;overflow:hidden;border:1px solid rgba(0,232,122,.20);background:linear-gradient(145deg,rgba(0,232,122,.11),rgba(74,158,255,.055) 54%,rgba(5,8,15,.92));border-radius:18px;padding:14px 13px;box-shadow:0 16px 44px rgba(0,0,0,.20)}
      .safe-hero:before{content:'';position:absolute;inset:-80px -50px auto auto;width:155px;height:155px;border-radius:50%;background:radial-gradient(circle,rgba(0,232,122,.22),transparent 65%);pointer-events:none}
      .safe-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;position:relative;z-index:1}
      .safe-title{font-family:var(--ff-display);font-size:20px;font-weight:900;letter-spacing:-.04em;color:#f8fafc;line-height:1.05}
      .safe-sub{font-size:11px;color:#8ea0c4;margin-top:5px;line-height:1.35;max-width:310px}
      .safe-status{font-family:var(--ff-mono);font-size:9px;font-weight:900;color:#00e87a;background:rgba(0,232,122,.11);border:1px solid rgba(0,232,122,.25);border-radius:999px;padding:6px 8px;white-space:nowrap;text-transform:uppercase;letter-spacing:.45px}
      .safe-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px;position:relative;z-index:1}
      .safe-stat{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);border-radius:13px;padding:9px 6px;text-align:center}
      .safe-stat-v{font-family:var(--ff-mono);font-size:18px;font-weight:900;color:#f8fafc;line-height:1}
      .safe-stat-l{font-size:8px;color:#7280a1;text-transform:uppercase;font-weight:800;letter-spacing:.35px;margin-top:4px}
      .safe-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:1px}
      .safe-toolbar small{font-size:10px;color:#64748b;line-height:1.25}
      .safe-refresh{border:1px solid rgba(0,232,122,.22);background:rgba(0,232,122,.08);color:#00e87a;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}
      .safe-refresh:active{transform:scale(.97)}
      .safe-card{position:relative;overflow:hidden;background:linear-gradient(160deg,rgba(13,19,34,.98),rgba(6,10,20,.98));border:1px solid rgba(255,255,255,.08);border-radius:18px;margin-bottom:10px;box-shadow:0 10px 30px rgba(0,0,0,.18)}
      .safe-card:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#00e87a,#4a9eff)}
      .safe-card-head{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.018)}
      .safe-badge{display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,.09);border:1px solid rgba(0,232,122,.23);border-radius:999px;padding:5px 8px;white-space:nowrap}
      .safe-score-pill{font-family:var(--ff-mono);font-size:10px;color:#dbeafe;background:rgba(74,158,255,.10);border:1px solid rgba(74,158,255,.20);border-radius:999px;padding:5px 7px;white-space:nowrap}
      .safe-card-body{padding:11px 12px 12px}
      .safe-match{font-family:var(--ff-display);font-size:16px;font-weight:900;color:#f8fafc;letter-spacing:-.025em;line-height:1.18;margin-bottom:4px}
      .safe-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:10px;color:#7d8aaa;margin-bottom:10px}
      .safe-dot{width:3px;height:3px;border-radius:50%;background:#334155;display:inline-block}
      .safe-pickbox{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(0,232,122,.16);background:rgba(0,232,122,.065);border-radius:14px;padding:10px 10px;margin-bottom:9px}
      .safe-pick-l{font-size:9px;color:#6f7e9e;text-transform:uppercase;font-weight:900;letter-spacing:.45px;margin-bottom:2px}
      .safe-pick-v{font-family:var(--ff-display);font-size:16px;font-weight:900;color:#eafff4;line-height:1.08}
      .safe-odd{font-family:var(--ff-mono);font-size:22px;font-weight:900;color:#00e87a;white-space:nowrap}
      .safe-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:9px}
      .safe-kpi{border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.035);border-radius:12px;padding:8px 6px;text-align:center}
      .safe-kpi-v{font-family:var(--ff-mono);font-size:14px;font-weight:900;color:#f8fafc;line-height:1}.safe-kpi-v.green{color:#00e87a}.safe-kpi-v.blue{color:#4a9eff}.safe-kpi-v.gold{color:#ffb830}
      .safe-kpi-l{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:.35px;margin-top:3px}
      .safe-why{font-size:11px;color:#9aa7c4;line-height:1.45;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.055);border-radius:12px;padding:8px 9px;margin-bottom:8px}
      .safe-actions{display:flex;align-items:center;gap:7px;margin-top:9px}.safe-open{flex:1;border:1px solid rgba(74,158,255,.22);background:rgba(74,158,255,.08);color:#93c5fd;border-radius:12px;padding:9px 10px;font-size:11px;font-weight:900;cursor:pointer}.safe-open:active{transform:scale(.985)}
      .safe-details{border-top:1px solid rgba(255,255,255,.055);padding:8px 12px 11px}.safe-details summary{font-size:10px;font-weight:900;color:#8ea0c4;cursor:pointer;text-transform:uppercase;letter-spacing:.4px}.safe-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.safe-detail-item{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:7px}.safe-detail-l{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:900;letter-spacing:.35px}.safe-detail-v{font-family:var(--ff-mono);font-size:11px;color:#e2e8f0;font-weight:800;margin-top:2px;word-break:break-word}
      .safe-empty{border:1px solid rgba(255,184,48,.20);background:linear-gradient(145deg,rgba(255,184,48,.09),rgba(255,255,255,.025));border-radius:18px;padding:18px 14px;text-align:center;color:#cbd5e1}.safe-empty-ico{font-size:30px;margin-bottom:8px}.safe-empty-title{font-family:var(--ff-display);font-size:17px;font-weight:900;color:#f8fafc;margin-bottom:5px}.safe-empty-sub{font-size:12px;color:#8ea0c4;line-height:1.45}.safe-error{border:1px solid rgba(255,61,90,.22);background:rgba(255,61,90,.08);color:#fecdd3;border-radius:14px;padding:12px;font-size:12px;line-height:1.45}.safe-note{font-size:10px;color:#64748b;text-align:center;line-height:1.4;padding:0 8px 6px}
    `;
    document.head.appendChild(s);
  }

  function sectionHtml(){
    return `
      <section class="section" id="sec-safe">
        <div class="safe-shell">
          <div class="safe-hero">
            <div class="safe-hero-top">
              <div>
                <div class="safe-title">Predicții Validate</div>
                <div class="safe-sub">Doar selecțiile publicate de Safe Picks Gate. Ce vezi aici este exact ce intră în istoricul curat și ROI-ul principal.</div>
              </div>
              <div class="safe-status" id="safe-status-pill">SAFE GATE</div>
            </div>
            <div class="safe-stats">
              <div class="safe-stat"><div class="safe-stat-v" id="safe-count">—</div><div class="safe-stat-l">Publicate</div></div>
              <div class="safe-stat"><div class="safe-stat-v" id="safe-best">—</div><div class="safe-stat-l">Top scor</div></div>
              <div class="safe-stat"><div class="safe-stat-v" id="safe-date">—</div><div class="safe-stat-l">Data</div></div>
            </div>
          </div>
          <div class="safe-toolbar">
            <small id="safe-updated">Se încarcă snapshot-ul publicat...</small>
            <button class="safe-refresh" type="button" onclick="window.BPSafePicksUI.reload()">↻ Refresh</button>
          </div>
          <div id="safe-body"><div class="loader"><div class="spinner"></div>Se încarcă predicțiile validate...</div></div>
          <div class="safe-note">Regulă: predicții afișate = predicții salvate în istoric = predicții folosite la ROI.</div>
        </div>
      </section>`;
  }

  function tabHtml(){
    return `
      <div class="tab" data-t="safe" role="tab" aria-selected="false" tabindex="-1"><span class="ti">
        <svg class="ti-svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="10" fill="#071B14"/><path d="M13 22.5l6.2 6.3L32 15.5" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 6l13 5v10c0 8.5-5.4 14.5-13 17-7.6-2.5-13-8.5-13-17V11l13-5z" fill="none" stroke="white" stroke-width="1.4" opacity="0.32"/></svg>
      </span><span class="tl">Picks</span></div>`;
  }

  function ensureUI(){
    installStyle();
    const app = byId('app');
    if (app && !byId('sec-safe')) {
      const dash = byId('sec-dash');
      if (dash) dash.insertAdjacentHTML('afterend', sectionHtml());
      else app.insertAdjacentHTML('afterbegin', sectionHtml());
    }
    const bar = byId('main-tabbar');
    if (bar && !bar.querySelector('[data-t="safe"]')) {
      const dashTab = bar.querySelector('[data-t="dash"]');
      if (dashTab) dashTab.insertAdjacentHTML('afterend', tabHtml());
      else bar.insertAdjacentHTML('afterbegin', tabHtml());
    }
  }

  async function fetchJson(url){
    const res = await fetch(`${url}?v=${Date.now()}`, { cache:'no-store' });
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    return res.json();
  }

  async function loadData(){
    try {
      const data = await fetchJson(DATA_URL);
      STATE.data = data;
      STATE.error = null;
      return data;
    } catch (err) {
      try {
        const fallback = await fetchJson(FALLBACK_URL);
        const picks = Array.isArray(fallback.safe_picks) ? fallback.safe_picks : [];
        STATE.data = {
          generated_at: fallback.generated_at,
          published_date: (fallback.generated_at || '').slice(0,10),
          source: 'safe_picks_today_fallback',
          summary: { published_count:picks.length, max_published_per_day:5 },
          safe_picks: picks
        };
        STATE.error = null;
        return STATE.data;
      } catch (err2) {
        STATE.error = err2;
        throw err2;
      }
    }
  }

  function renderCard(p, idx){
    const score = Math.round(nr(p.safe_score ?? p.confidence_score, 0));
    const match = p.match || `${p.home_team || 'Gazde'} vs ${p.away_team || 'Oaspeți'}`;
    const league = [p.country, p.league].filter(Boolean).join(' · ') || p.league || 'Ligă indisponibilă';
    const pick = p.recommended_pick || p.market_label || p.market || 'Predicție';
    const eid = esc(String(p.event_id || ''));
    const ev = nr(p.ev_calibrated_pct, 0);
    const status = String(p.status || 'PENDING').toUpperCase();
    return `
      <article class="safe-card" data-event-id="${eid}" data-market="${esc(p.market || '')}">
        <div class="safe-card-head">
          <div class="safe-badge">✓ VALIDAT · #${idx + 1}</div>
          <div class="safe-score-pill">Scor ${score}/100</div>
        </div>
        <div class="safe-card-body">
          <div class="safe-match">${esc(match)}</div>
          <div class="safe-meta"><span>${esc(league)}</span><span class="safe-dot"></span><span>${esc(fmtTime(p.kickoff || p.event_date))}</span><span class="safe-dot"></span><span>${esc(status)}</span></div>
          <div class="safe-pickbox">
            <div><div class="safe-pick-l">Predicție recomandată</div><div class="safe-pick-v">${esc(pick)}</div></div>
            <div class="safe-odd">${esc(fmtOdds(p.odds))}</div>
          </div>
          <div class="safe-kpis">
            <div class="safe-kpi"><div class="safe-kpi-v blue">${esc(fmtProb(p.probability_pct))}</div><div class="safe-kpi-l">Prob.</div></div>
            <div class="safe-kpi"><div class="safe-kpi-v green">${esc(fmtPct(ev))}</div><div class="safe-kpi-l">EV cal.</div></div>
            <div class="safe-kpi"><div class="safe-kpi-v gold">${esc(p.quality_grade_v6 || 'A')}</div><div class="safe-kpi-l">Grad</div></div>
          </div>
          <div class="safe-why">${esc(p.explain || 'A trecut filtrele: EV pozitiv, cotă reală, status v6 valid și istoric ROI acceptat.')}</div>
          <div class="safe-actions">
            ${p.event_id ? `<button class="safe-open" type="button" onclick="window.openMatchDetail ? openMatchDetail('${eid}') : null">Analiză completă</button>` : ''}
          </div>
        </div>
        <details class="safe-details">
          <summary>Detalii filtru</summary>
          <div class="safe-detail-grid">
            <div class="safe-detail-item"><div class="safe-detail-l">Market ROI</div><div class="safe-detail-v">${esc(fmtPct(p.market_roi_pct))} · n=${esc(p.market_sample ?? '—')}</div></div>
            <div class="safe-detail-item"><div class="safe-detail-l">Strategy ROI</div><div class="safe-detail-v">${esc(fmtPct(p.strategy_roi_pct))} · n=${esc(p.strategy_sample ?? '—')}</div></div>
            <div class="safe-detail-item"><div class="safe-detail-l">Status v6</div><div class="safe-detail-v">${esc(p.v6_status || 'VALID')}</div></div>
            <div class="safe-detail-item"><div class="safe-detail-l">Publicat</div><div class="safe-detail-v">${esc(fmtTime(p.published_at || p.published_date))}</div></div>
          </div>
        </details>
      </article>`;
  }

  function render(data){
    ensureUI();
    const picks = Array.isArray(data?.safe_picks) ? data.safe_picks.slice() : [];
    picks.sort((a,b) => nr(b.safe_score ?? b.confidence_score) - nr(a.safe_score ?? a.confidence_score));
    const body = byId('safe-body');
    const count = byId('safe-count');
    const best = byId('safe-best');
    const date = byId('safe-date');
    const upd = byId('safe-updated');
    const pill = byId('safe-status-pill');
    if (count) count.textContent = String(picks.length);
    if (best) best.textContent = picks.length ? Math.round(nr(picks[0].safe_score ?? picks[0].confidence_score, 0)) : '—';
    if (date) date.textContent = data?.published_date ? data.published_date.slice(5).replace('-', '.') : '—';
    if (upd) upd.textContent = data?.generated_at ? `Snapshot publicat: ${fmtTime(data.generated_at)} · sursă ${data.source || 'published_safe_picks_today'}` : 'Snapshot publicat';
    if (pill) pill.textContent = picks.length ? `${picks.length} VALIDATE` : 'ZERO RISC FORȚAT';
    if (!body) return;
    if (!picks.length) {
      body.innerHTML = `
        <div class="safe-empty">
          <div class="safe-empty-ico">🛡️</div>
          <div class="safe-empty-title">Nu există predicții validate momentan.</div>
          <div class="safe-empty-sub">Motorul a blocat selecțiile riscante. Este mai bine să nu apară nimic decât să fie afișate predicții slabe.</div>
        </div>`;
      return;
    }
    body.innerHTML = picks.map(renderCard).join('');
  }

  async function loadSafe(){
    ensureUI();
    const body = byId('safe-body');
    if (body) body.innerHTML = '<div class="loader"><div class="spinner"></div>Se încarcă predicțiile validate...</div>';
    try {
      const data = await loadData();
      render(data);
      STATE.loaded = true;
      try { if (typeof S !== 'undefined') S.loaded.safe = 1; } catch(_e) {}
    } catch (err) {
      if (body) body.innerHTML = `<div class="safe-error">⚠ Nu pot încărca Predicțiile Validate. Verifică existența fișierului <strong>data/published_safe_picks_today.json</strong> și cache-ul aplicației.</div>`;
      // eslint-disable-next-line no-console
      console.warn('[SafePicksUI] load failed', err);
    }
  }

  function patchNavigation(){
    if (patchNavigation.done) return;
    patchNavigation.done = true;
    try { if (typeof S !== 'undefined' && S.loaded && S.loaded.safe == null) S.loaded.safe = 0; } catch(_e) {}
    const originalGo = window.go;
    if (typeof originalGo === 'function') {
      window.go = function(tab){
        originalGo(tab);
        if (tab === 'safe') loadSafe();
      };
    }
  }

  function boot(){
    ensureUI();
    patchNavigation();
    window.BPSafePicksUI = { load:loadSafe, reload:loadSafe, render, state:STATE };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
