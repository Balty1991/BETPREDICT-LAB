/* BETPREDICT LAB — Predicții Validate + Istoric Publicat UI
   Reads only:
   - data/published_safe_picks_today.json for current validated picks
   - data/selection_journal_published.json for clean published history

   Rule:
   Predicții afișate = predicții publicate = istoric curat = sursa ROI principal.
*/
(function(){
  'use strict';

  const SAFE_DATA_URL = 'data/published_safe_picks_today.json';
  const SAFE_FALLBACK_URL = 'data/safe_picks_today.json';
  const HISTORY_URL = 'data/selection_journal_published.json';

  const STATE = {
    safeLoaded:false,
    historyLoaded:false,
    safeData:null,
    historyData:null,
    safeError:null,
    historyError:null
  };

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

  const fmtUnits = (v) => {
    const n = nr(v, NaN);
    if (!Number.isFinite(n)) return '—';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}u`;
  };

  const fmtTime = (raw) => {
    if (!raw) return 'Ora indisponibilă';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleString('ro-RO', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  };

  const itemKey = (p) => `${p?.event_id || ''}|${p?.market || ''}|${String(p?.published_date || p?.published_at || '').slice(0,10)}`;
  const APP_TZ = 'Europe/Bucharest';
  const localDateKey = (raw) => {
    const d = raw ? new Date(raw) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone:APP_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  };
  const isTodayPick = (p) => localDateKey(p?.kickoff || p?.event_date || p?.start_time || p?.date) === localDateKey();
  const isBadCurrentDayPending = (p) => String(p?.published_date || '').slice(0,10) === localDateKey() && String(p?.status || 'PENDING').toUpperCase() === 'PENDING' && !isTodayPick(p);

  function installStyle(){
    if (byId('safe-picks-ui-style')) return;
    const s = document.createElement('style');
    s.id = 'safe-picks-ui-style';
    s.textContent = `
      .tab[data-t="safe"] .tl,.tab[data-t="published"] .tl{font-weight:800}
      .tab[data-t="safe"] .tl{color:#00e87a}.tab[data-t="published"] .tl{color:#4a9eff}
      .ti-svg{display:block;width:24px;height:24px}

      .safe-shell,.pub-shell{display:flex;flex-direction:column;gap:10px}
      .safe-hero,.pub-hero{position:relative;overflow:hidden;border-radius:18px;padding:14px 13px;box-shadow:0 16px 44px rgba(0,0,0,.20)}
      .safe-hero{border:1px solid rgba(0,232,122,.20);background:linear-gradient(145deg,rgba(0,232,122,.11),rgba(74,158,255,.055) 54%,rgba(5,8,15,.92))}
      .pub-hero{border:1px solid rgba(74,158,255,.20);background:linear-gradient(145deg,rgba(74,158,255,.12),rgba(0,232,122,.045) 58%,rgba(5,8,15,.92))}
      .safe-hero:before,.pub-hero:before{content:'';position:absolute;inset:-80px -50px auto auto;width:155px;height:155px;border-radius:50%;pointer-events:none}
      .safe-hero:before{background:radial-gradient(circle,rgba(0,232,122,.22),transparent 65%)}
      .pub-hero:before{background:radial-gradient(circle,rgba(74,158,255,.22),transparent 65%)}

      .safe-hero-top,.pub-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;position:relative;z-index:1}
      .safe-title,.pub-title{font-family:var(--ff-display);font-size:20px;font-weight:900;letter-spacing:-.04em;color:#f8fafc;line-height:1.05}
      .safe-sub,.pub-sub{font-size:11px;color:#8ea0c4;margin-top:5px;line-height:1.35;max-width:315px}
      .safe-status,.pub-status{font-family:var(--ff-mono);font-size:9px;font-weight:900;border-radius:999px;padding:6px 8px;white-space:nowrap;text-transform:uppercase;letter-spacing:.45px}
      .safe-status{color:#00e87a;background:rgba(0,232,122,.11);border:1px solid rgba(0,232,122,.25)}
      .pub-status{color:#93c5fd;background:rgba(74,158,255,.11);border:1px solid rgba(74,158,255,.25)}

      .safe-stats,.pub-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px;position:relative;z-index:1}
      .safe-stat,.pub-stat{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);border-radius:13px;padding:9px 6px;text-align:center}
      .safe-stat-v,.pub-stat-v{font-family:var(--ff-mono);font-size:18px;font-weight:900;color:#f8fafc;line-height:1}
      .safe-stat-l,.pub-stat-l{font-size:8px;color:#7280a1;text-transform:uppercase;font-weight:800;letter-spacing:.35px;margin-top:4px}

      .safe-toolbar,.pub-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:1px}
      .safe-toolbar small,.pub-toolbar small{font-size:10px;color:#64748b;line-height:1.25}
      .safe-refresh,.pub-refresh{border-radius:999px;padding:7px 10px;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}
      .safe-refresh{border:1px solid rgba(0,232,122,.22);background:rgba(0,232,122,.08);color:#00e87a}
      .pub-refresh{border:1px solid rgba(74,158,255,.22);background:rgba(74,158,255,.08);color:#93c5fd}
      .safe-refresh:active,.pub-refresh:active{transform:scale(.97)}

      .safe-card,.pub-card{position:relative;overflow:hidden;background:linear-gradient(160deg,rgba(13,19,34,.98),rgba(6,10,20,.98));border:1px solid rgba(255,255,255,.08);border-radius:18px;margin-bottom:10px;box-shadow:0 10px 30px rgba(0,0,0,.18)}
      .safe-card:before,.pub-card:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px}
      .safe-card:before{background:linear-gradient(180deg,#00e87a,#4a9eff)}
      .pub-card:before{background:linear-gradient(180deg,#4a9eff,#00e87a)}
      .safe-card-head,.pub-card-head{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.018)}
      .safe-badge,.pub-badge{display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;border-radius:999px;padding:5px 8px;white-space:nowrap}
      .safe-badge{color:#00e87a;background:rgba(0,232,122,.09);border:1px solid rgba(0,232,122,.23)}
      .pub-badge{color:#93c5fd;background:rgba(74,158,255,.09);border:1px solid rgba(74,158,255,.23)}
      .safe-score-pill,.pub-status-pill{font-family:var(--ff-mono);font-size:10px;border-radius:999px;padding:5px 7px;white-space:nowrap}
      .safe-score-pill{color:#dbeafe;background:rgba(74,158,255,.10);border:1px solid rgba(74,158,255,.20)}
      .pub-status-pill{color:#f8fafc;background:rgba(255,255,255,.065);border:1px solid rgba(255,255,255,.11)}
      .pub-status-pill.win{color:#00e87a;background:rgba(0,232,122,.09);border-color:rgba(0,232,122,.22)}
      .pub-status-pill.lost{color:#ff8da0;background:rgba(255,61,90,.09);border-color:rgba(255,61,90,.22)}

      .safe-card-body,.pub-card-body{padding:11px 12px 12px}
      .safe-match,.pub-match{font-family:var(--ff-display);font-size:16px;font-weight:900;color:#f8fafc;letter-spacing:-.025em;line-height:1.18;margin-bottom:4px}
      .safe-meta,.pub-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:10px;color:#7d8aaa;margin-bottom:10px}
      .safe-dot,.pub-dot{width:3px;height:3px;border-radius:50%;background:#334155;display:inline-block}

      .safe-pickbox,.pub-pickbox{display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:14px;padding:10px 10px;margin-bottom:9px}
      .safe-pickbox{border:1px solid rgba(0,232,122,.16);background:rgba(0,232,122,.065)}
      .pub-pickbox{border:1px solid rgba(74,158,255,.16);background:rgba(74,158,255,.065)}
      .safe-pick-l,.pub-pick-l{font-size:9px;color:#6f7e9e;text-transform:uppercase;font-weight:900;letter-spacing:.45px;margin-bottom:2px}
      .safe-pick-v,.pub-pick-v{font-family:var(--ff-display);font-size:16px;font-weight:900;color:#eafff4;line-height:1.08}
      .safe-odd,.pub-profit{font-family:var(--ff-mono);font-size:21px;font-weight:900;white-space:nowrap}
      .safe-odd{color:#00e87a}.pub-profit{color:#e2e8f0}.pub-profit.win{color:#00e87a}.pub-profit.lost{color:#ff8da0}

      .safe-kpis,.pub-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:9px}
      .safe-kpi,.pub-kpi{border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.035);border-radius:12px;padding:8px 6px;text-align:center}
      .safe-kpi-v,.pub-kpi-v{font-family:var(--ff-mono);font-size:14px;font-weight:900;color:#f8fafc;line-height:1}
      .safe-kpi-v.green,.pub-kpi-v.green{color:#00e87a}.safe-kpi-v.blue,.pub-kpi-v.blue{color:#4a9eff}.safe-kpi-v.gold,.pub-kpi-v.gold{color:#ffb830}
      .safe-kpi-l,.pub-kpi-l{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:.35px;margin-top:3px}

      .safe-why,.pub-why{font-size:11px;color:#9aa7c4;line-height:1.45;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.055);border-radius:12px;padding:8px 9px;margin-bottom:8px}
      .safe-actions{display:flex;align-items:center;gap:7px;margin-top:9px}
      .safe-open{flex:1;border:1px solid rgba(74,158,255,.22);background:rgba(74,158,255,.08);color:#93c5fd;border-radius:12px;padding:9px 10px;font-size:11px;font-weight:900;cursor:pointer}
      .safe-open:active{transform:scale(.985)}

      .safe-details,.pub-details{border-top:1px solid rgba(255,255,255,.055);padding:8px 12px 11px}
      .safe-details summary,.pub-details summary{font-size:10px;font-weight:900;color:#8ea0c4;cursor:pointer;text-transform:uppercase;letter-spacing:.4px}
      .safe-detail-grid,.pub-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
      .safe-detail-item,.pub-detail-item{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:7px}
      .safe-detail-l,.pub-detail-l{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:900;letter-spacing:.35px}
      .safe-detail-v,.pub-detail-v{font-family:var(--ff-mono);font-size:11px;color:#e2e8f0;font-weight:800;margin-top:2px;word-break:break-word}

      .safe-empty,.pub-empty{border-radius:18px;padding:18px 14px;text-align:center;color:#cbd5e1}
      .safe-empty{border:1px solid rgba(255,184,48,.20);background:linear-gradient(145deg,rgba(255,184,48,.09),rgba(255,255,255,.025))}
      .pub-empty{border:1px solid rgba(74,158,255,.20);background:linear-gradient(145deg,rgba(74,158,255,.09),rgba(255,255,255,.025))}
      .safe-empty-ico,.pub-empty-ico{font-size:30px;margin-bottom:8px}
      .safe-empty-title,.pub-empty-title{font-family:var(--ff-display);font-size:17px;font-weight:900;color:#f8fafc;margin-bottom:5px}
      .safe-empty-sub,.pub-empty-sub{font-size:12px;color:#8ea0c4;line-height:1.45}
      .safe-error,.pub-error{border:1px solid rgba(255,61,90,.22);background:rgba(255,61,90,.08);color:#fecdd3;border-radius:14px;padding:12px;font-size:12px;line-height:1.45}
      .safe-note,.pub-note{font-size:10px;color:#64748b;text-align:center;line-height:1.4;padding:0 8px 6px}
      .pub-filters{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.pub-filters::-webkit-scrollbar{display:none}
      .pub-chip{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#8ea0c4;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:900;white-space:nowrap;cursor:pointer}
      .pub-chip.active{border-color:rgba(74,158,255,.30);background:rgba(74,158,255,.12);color:#93c5fd}
    `;
    document.head.appendChild(s);
  }

  function safeSectionHtml(){
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

  function publishedSectionHtml(){
    return `
      <section class="section" id="sec-published">
        <div class="pub-shell">
          <div class="pub-hero">
            <div class="pub-hero-top">
              <div>
                <div class="pub-title">Istoric Publicat</div>
                <div class="pub-sub">Aici rămâne exact ce s-a văzut în Predicții Validate. Nu include API raw, watchlist sau predicții respinse.</div>
              </div>
              <div class="pub-status" id="pub-status-pill">JURNAL CURAT</div>
            </div>
            <div class="pub-stats">
              <div class="pub-stat"><div class="pub-stat-v" id="pub-total">—</div><div class="pub-stat-l">Publicate</div></div>
              <div class="pub-stat"><div class="pub-stat-v" id="pub-roi">—</div><div class="pub-stat-l">ROI</div></div>
              <div class="pub-stat"><div class="pub-stat-v" id="pub-winrate">—</div><div class="pub-stat-l">Win rate</div></div>
            </div>
          </div>
          <div class="pub-toolbar">
            <small id="pub-updated">Se încarcă istoricul publicat...</small>
            <button class="pub-refresh" type="button" onclick="window.BPPublishedHistoryUI.reload()">↻ Refresh</button>
          </div>
          <div class="pub-filters" id="pub-filters">
            <button class="pub-chip active" type="button" data-filter="all">Toate</button>
            <button class="pub-chip" type="button" data-filter="pending">Pending</button>
            <button class="pub-chip" type="button" data-filter="win">Win</button>
            <button class="pub-chip" type="button" data-filter="lost">Lost</button>
          </div>
          <div id="pub-body"><div class="loader"><div class="spinner"></div>Se încarcă istoricul publicat...</div></div>
          <div class="pub-note">ROI-ul principal trebuie calculat doar din acest jurnal publicat, nu din toate semnalele API.</div>
        </div>
      </section>`;
  }

  function safeTabHtml(){
    return `
      <div class="tab" data-t="safe" role="tab" aria-selected="false" tabindex="-1"><span class="ti">
        <svg class="ti-svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="10" fill="#071B14"/><path d="M13 22.5l6.2 6.3L32 15.5" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 6l13 5v10c0 8.5-5.4 14.5-13 17-7.6-2.5-13-8.5-13-17V11l13-5z" fill="none" stroke="white" stroke-width="1.4" opacity="0.32"/></svg>
      </span><span class="tl">Picks</span></div>`;
  }

  function publishedTabHtml(){
    return `
      <div class="tab" data-t="published" role="tab" aria-selected="false" tabindex="-1"><span class="ti">
        <svg class="ti-svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="10" fill="#071522"/><path d="M12 12h20v4H12zM12 20h20v4H12zM12 28h13v4H12z" fill="white" opacity=".92"/><path d="M29 27l3 3 6-7" fill="none" stroke="#00e87a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span><span class="tl">Istoric</span></div>`;
  }

  function ensureUI(){
    installStyle();

    const app = byId('app');
    if (app && !byId('sec-safe')) {
      const dash = byId('sec-dash');
      if (dash) dash.insertAdjacentHTML('afterend', safeSectionHtml());
      else app.insertAdjacentHTML('afterbegin', safeSectionHtml());
    }
    if (app && !byId('sec-published')) {
      const safe = byId('sec-safe');
      if (safe) safe.insertAdjacentHTML('afterend', publishedSectionHtml());
      else app.insertAdjacentHTML('beforeend', publishedSectionHtml());
    }

    const bar = byId('main-tabbar');
    if (bar && !bar.querySelector('[data-t="safe"]')) {
      const dashTab = bar.querySelector('[data-t="dash"]');
      if (dashTab) dashTab.insertAdjacentHTML('afterend', safeTabHtml());
      else bar.insertAdjacentHTML('afterbegin', safeTabHtml());
    }
    if (bar && !bar.querySelector('[data-t="published"]')) {
      const safeTab = bar.querySelector('[data-t="safe"]');
      if (safeTab) safeTab.insertAdjacentHTML('afterend', publishedTabHtml());
      else bar.insertAdjacentHTML('afterbegin', publishedTabHtml());
    }

    attachHistoryFilters();
    compactTabbar();
  }

  function compactTabbar(){
    // Când apar taburile noi, facem iconițele/labelurile ușor mai compacte pe mobil.
    const bar = byId('main-tabbar');
    if (!bar || byId('bp-lab-compact-tabbar')) return;
    const s = document.createElement('style');
    s.id = 'bp-lab-compact-tabbar';
    s.textContent = `
      #main-tabbar .tab{min-width:0}
      #main-tabbar .tl{font-size:9px;line-height:1}
      #main-tabbar .ti{font-size:18px}
      #main-tabbar .ti-svg{width:22px;height:22px}
    `;
    document.head.appendChild(s);
  }

  async function fetchJson(url){
    const res = await fetch(`${url}?v=${Date.now()}`, { cache:'no-store' });
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    return res.json();
  }

  async function loadSafeData(){
    try {
      const data = await fetchJson(SAFE_DATA_URL);
      STATE.safeData = data;
      STATE.safeError = null;
      return data;
    } catch (err) {
      try {
        const fallback = await fetchJson(SAFE_FALLBACK_URL);
        const picks = Array.isArray(fallback.safe_picks) ? fallback.safe_picks : [];
        STATE.safeData = {
          generated_at: fallback.generated_at,
          published_date: (fallback.generated_at || '').slice(0,10),
          source: 'safe_picks_today_fallback',
          summary: { published_count:picks.length, max_published_per_day:5 },
          safe_picks: picks
        };
        STATE.safeError = null;
        return STATE.safeData;
      } catch (err2) {
        STATE.safeError = err2;
        throw err2;
      }
    }
  }

  async function loadHistoryData(){
    const data = await fetchJson(HISTORY_URL);
    STATE.historyData = data;
    STATE.historyError = null;
    return data;
  }

  function renderSafeCard(p, idx){
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

  function renderSafe(data){
    ensureUI();
    const picks = (Array.isArray(data?.safe_picks) ? data.safe_picks.slice() : []).filter(isTodayPick);
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
    body.innerHTML = picks.map(renderSafeCard).join('');
  }

  function normalizeStatus(p){
    return String(p.status || p.result || 'PENDING').trim().toUpperCase();
  }

  function profitUnits(p){
    const status = normalizeStatus(p);
    if (p.profit_units != null) return nr(p.profit_units);
    if (p.profit != null) return nr(p.profit);
    if (status === 'WIN') return nr(p.odds, 1) - 1;
    if (status === 'LOST' || status === 'LOSS') return -1;
    return 0;
  }

  function historyStats(rows){
    const total = rows.length;
    const settled = rows.filter(p => ['WIN','LOST','LOSS','VOID'].includes(normalizeStatus(p)));
    const wins = rows.filter(p => normalizeStatus(p) === 'WIN').length;
    const losses = rows.filter(p => ['LOST','LOSS'].includes(normalizeStatus(p))).length;
    const pending = rows.filter(p => normalizeStatus(p) === 'PENDING').length;
    const profit = settled.reduce((s,p) => s + profitUnits(p), 0);
    const stake = settled.filter(p => ['WIN','LOST','LOSS'].includes(normalizeStatus(p))).length;
    const roi = stake ? (profit / stake) * 100 : null;
    const winrate = (wins + losses) ? (wins / (wins + losses)) * 100 : null;
    return { total, settled:settled.length, wins, losses, pending, profit, stake, roi, winrate };
  }

  function renderPublishedCard(p, idx){
    const status = normalizeStatus(p);
    const sl = status === 'WIN' ? 'win' : (status === 'LOST' || status === 'LOSS') ? 'lost' : '';
    const match = p.match || `${p.home_team || 'Gazde'} vs ${p.away_team || 'Oaspeți'}`;
    const league = [p.country, p.league].filter(Boolean).join(' · ') || p.league || 'Ligă indisponibilă';
    const pick = p.recommended_pick || p.market_label || p.market || 'Predicție';
    const profit = profitUnits(p);
    const resultLabel = status === 'PENDING' ? 'PENDING' : status === 'LOSS' ? 'LOST' : status;
    return `
      <article class="pub-card" data-history-key="${esc(itemKey(p))}">
        <div class="pub-card-head">
          <div class="pub-badge">JURNAL PUBLICAT · #${idx + 1}</div>
          <div class="pub-status-pill ${sl}">${esc(resultLabel)}</div>
        </div>
        <div class="pub-card-body">
          <div class="pub-match">${esc(match)}</div>
          <div class="pub-meta"><span>${esc(league)}</span><span class="pub-dot"></span><span>${esc(fmtTime(p.kickoff || p.event_date))}</span></div>
          <div class="pub-pickbox">
            <div><div class="pub-pick-l">Predicție publicată</div><div class="pub-pick-v">${esc(pick)} · cotă ${esc(fmtOdds(p.odds))}</div></div>
            <div class="pub-profit ${sl}">${esc(status === 'PENDING' ? '—' : fmtUnits(profit))}</div>
          </div>
          <div class="pub-kpis">
            <div class="pub-kpi"><div class="pub-kpi-v blue">${esc(fmtProb(p.probability_pct))}</div><div class="pub-kpi-l">Prob.</div></div>
            <div class="pub-kpi"><div class="pub-kpi-v green">${esc(fmtPct(p.ev_calibrated_pct))}</div><div class="pub-kpi-l">EV publicat</div></div>
            <div class="pub-kpi"><div class="pub-kpi-v gold">${esc(Math.round(nr(p.safe_score ?? p.confidence_score, 0)))}</div><div class="pub-kpi-l">Scor</div></div>
          </div>
          <div class="pub-why">Publicat: ${esc(fmtTime(p.published_at || p.published_date))}. Snapshot-ul rămâne fix până la validare.</div>
        </div>
        <details class="pub-details">
          <summary>Snapshot publicat</summary>
          <div class="pub-detail-grid">
            <div class="pub-detail-item"><div class="pub-detail-l">Event</div><div class="pub-detail-v">${esc(p.event_id || '—')}</div></div>
            <div class="pub-detail-item"><div class="pub-detail-l">Market</div><div class="pub-detail-v">${esc(p.market || '—')}</div></div>
            <div class="pub-detail-item"><div class="pub-detail-l">Grad</div><div class="pub-detail-v">${esc(p.quality_grade_v6 || '—')}</div></div>
            <div class="pub-detail-item"><div class="pub-detail-l">Sursă</div><div class="pub-detail-v">${esc(p.source || 'safe_picks_today')}</div></div>
          </div>
        </details>
      </article>`;
  }

  function currentHistoryFilter(){
    const active = document.querySelector('#pub-filters .pub-chip.active');
    return active?.dataset?.filter || 'all';
  }

  function filteredRows(rows){
    const f = currentHistoryFilter();
    if (f === 'all') return rows;
    return rows.filter(p => {
      const s = normalizeStatus(p);
      if (f === 'pending') return s === 'PENDING';
      if (f === 'win') return s === 'WIN';
      if (f === 'lost') return s === 'LOST' || s === 'LOSS';
      return true;
    });
  }

  function attachHistoryFilters(){
    const filters = byId('pub-filters');
    if (!filters || filters.dataset.bound === '1') return;
    filters.dataset.bound = '1';
    filters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      filters.querySelectorAll('.pub-chip').forEach(b => b.classList.toggle('active', b === btn));
      renderHistory(STATE.historyData);
    });
  }

  function renderHistory(data){
    ensureUI();
    const rows = (Array.isArray(data?.results) ? data.results.slice() : []).filter(p => !isBadCurrentDayPending(p));
    rows.sort((a,b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));

    const st = historyStats(rows);
    const visible = filteredRows(rows);
    const body = byId('pub-body');
    const total = byId('pub-total');
    const roi = byId('pub-roi');
    const winrate = byId('pub-winrate');
    const upd = byId('pub-updated');
    const pill = byId('pub-status-pill');

    if (total) total.textContent = String(st.total);
    if (roi) roi.textContent = st.roi == null ? '—' : fmtPct(st.roi);
    if (winrate) winrate.textContent = st.winrate == null ? '—' : `${st.winrate.toFixed(0)}%`;
    if (upd) upd.textContent = data?.updated_at ? `Istoric publicat: ${fmtTime(data.updated_at)} · ${st.pending} pending · ${st.settled} validate` : 'Istoric publicat';
    if (pill) pill.textContent = `${st.total} SNAPSHOT`;

    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `
        <div class="pub-empty">
          <div class="pub-empty-ico">📘</div>
          <div class="pub-empty-title">Istoricul publicat este gol.</div>
          <div class="pub-empty-sub">Va apărea automat după ce Safe Picks Gate publică predicții validate.</div>
        </div>`;
      return;
    }
    if (!visible.length) {
      body.innerHTML = `
        <div class="pub-empty">
          <div class="pub-empty-ico">🔎</div>
          <div class="pub-empty-title">Nu există rezultate pentru filtrul ales.</div>
          <div class="pub-empty-sub">Schimbă filtrul sau așteaptă validarea predicțiilor pending.</div>
        </div>`;
      return;
    }
    body.innerHTML = visible.map(renderPublishedCard).join('');
  }

  async function loadSafe(){
    ensureUI();
    const body = byId('safe-body');
    if (body) body.innerHTML = '<div class="loader"><div class="spinner"></div>Se încarcă predicțiile validate...</div>';
    try {
      const data = await loadSafeData();
      renderSafe(data);
      STATE.safeLoaded = true;
      try { if (typeof S !== 'undefined') S.loaded.safe = 1; } catch(_e) {}
    } catch (err) {
      if (body) body.innerHTML = `<div class="safe-error">⚠ Nu pot încărca Predicțiile Validate. Verifică <strong>data/published_safe_picks_today.json</strong> și cache-ul aplicației.</div>`;
      console.warn('[SafePicksUI] load failed', err);
    }
  }

  async function loadHistory(){
    ensureUI();
    const body = byId('pub-body');
    if (body) body.innerHTML = '<div class="loader"><div class="spinner"></div>Se încarcă istoricul publicat...</div>';
    try {
      const data = await loadHistoryData();
      renderHistory(data);
      STATE.historyLoaded = true;
      try { if (typeof S !== 'undefined') S.loaded.published = 1; } catch(_e) {}
    } catch (err) {
      if (body) body.innerHTML = `<div class="pub-error">⚠ Nu pot încărca Istoricul Publicat. Verifică <strong>data/selection_journal_published.json</strong>.</div>`;
      console.warn('[PublishedHistoryUI] load failed', err);
    }
  }

  function patchNavigation(){
    if (patchNavigation.done) return;
    patchNavigation.done = true;
    try {
      if (typeof S !== 'undefined' && S.loaded) {
        if (S.loaded.safe == null) S.loaded.safe = 0;
        if (S.loaded.published == null) S.loaded.published = 0;
      }
    } catch(_e) {}

    const originalGo = window.go;
    if (typeof originalGo === 'function') {
      window.go = function(tab){
        originalGo(tab);
        if (tab === 'safe') loadSafe();
        if (tab === 'published') loadHistory();

        const bar = byId('main-tabbar');
        if (bar) {
          bar.querySelectorAll('[data-t]').forEach(el => {
            const active = el.dataset.t === tab;
            el.classList.toggle('active', active);
            el.setAttribute('aria-selected', String(active));
            el.setAttribute('tabindex', active ? '0' : '-1');
          });
        }
      };
    }

    const bar = byId('main-tabbar');
    if (bar && !bar.dataset.safeHistoryKeys) {
      bar.dataset.safeHistoryKeys = '1';
      bar.addEventListener('keydown', (e) => {
        const tab = e.target.closest('[data-t]');
        if (!tab) return;
        const all = Array.from(bar.querySelectorAll('[data-t]'));
        const idx = all.indexOf(tab);
        if (idx < 0) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const next = all[Math.min(idx + 1, all.length - 1)];
          if (next) { window.go(next.dataset.t); next.focus(); }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prev = all[Math.max(idx - 1, 0)];
          if (prev) { window.go(prev.dataset.t); prev.focus(); }
        }
      }, true);
    }
  }

  function boot(){
    ensureUI();
    patchNavigation();
    window.BPSafePicksUI = { load:loadSafe, reload:loadSafe, render:renderSafe, state:STATE };
    window.BPPublishedHistoryUI = { load:loadHistory, reload:loadHistory, render:renderHistory, state:STATE };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


/* BETPREDICT LAB — Performanță Publicată UI
   ROI/win rate/profit are calculated only from data/selection_journal_published.json.
*/
(function(){
  'use strict';
  const HISTORY_URL = 'data/selection_journal_published.json';
  const STATE = { loaded:false, data:null, error:null };
  const escLocal = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const esc = (v) => (typeof window.esc === 'function' ? window.esc(v) : escLocal(v));
  const byId = (id) => document.getElementById(id);
  const nr = (v,d=0) => { const n=Number(v); return Number.isFinite(n)?n:d; };
  const fmtPct = (v) => { const n=Number(v); if(!Number.isFinite(n)) return '—'; return `${n>=0?'+':''}${n.toFixed(Math.abs(n)>=10?0:1)}%`; };
  const fmtUnits = (v) => { const n=Number(v); if(!Number.isFinite(n)) return '—'; return `${n>0?'+':''}${n.toFixed(2)}u`; };
  const fmtTime = (raw) => { if(!raw) return '—'; const d=new Date(raw); if(Number.isNaN(d.getTime())) return String(raw); return d.toLocaleString('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); };
  const statusOf = (p) => String(p.status || p.result || 'PENDING').trim().toUpperCase();
  const APP_TZ = 'Europe/Bucharest';
  const localDateKey = (raw) => {
    const d = raw ? new Date(raw) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone:APP_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  };
  const isTodayPick = (p) => localDateKey(p?.kickoff || p?.event_date || p?.start_time || p?.date) === localDateKey();
  const isBadCurrentDayPending = (p) => String(p?.published_date || '').slice(0,10) === localDateKey() && statusOf(p) === 'PENDING' && !isTodayPick(p);

  function profitUnits(p){
    const s=statusOf(p);
    if(p.profit_units!=null) return nr(p.profit_units);
    if(p.profit!=null) return nr(p.profit);
    if(s==='WIN') return nr(p.odds,1)-1;
    if(s==='LOST'||s==='LOSS') return -1;
    return 0;
  }
  function stats(rows){
    const total=rows.length;
    const wins=rows.filter(p=>statusOf(p)==='WIN').length;
    const losses=rows.filter(p=>['LOST','LOSS'].includes(statusOf(p))).length;
    const pending=rows.filter(p=>statusOf(p)==='PENDING').length;
    const settled=rows.filter(p=>['WIN','LOST','LOSS'].includes(statusOf(p)));
    const profit=settled.reduce((s,p)=>s+profitUnits(p),0);
    const stake=settled.length;
    const roi=stake?profit/stake*100:null;
    const winrate=(wins+losses)?wins/(wins+losses)*100:null;
    return {total,wins,losses,pending,settled:stake,profit,roi,winrate};
  }
  function group(rows, field){
    const m=new Map();
    rows.forEach(p=>{const k=String(p[field]||'Necunoscut'); if(!m.has(k))m.set(k,[]); m.get(k).push(p);});
    return Array.from(m.entries()).map(([name,items])=>({name,...stats(items)})).sort((a,b)=>(b.profit-a.profit)||(b.total-a.total)).slice(0,8);
  }
  function cls(v){ if(v==null) return 'warn'; return v>0?'good':v<0?'bad':'warn'; }
  function installStyle(){
    if(byId('published-performance-style')) return;
    const s=document.createElement('style'); s.id='published-performance-style';
    s.textContent=`
      .tab[data-t="performance"] .tl{color:#ffb830;font-weight:900}.perf-shell{display:flex;flex-direction:column;gap:10px}
      .perf-hero{position:relative;overflow:hidden;border:1px solid rgba(255,184,48,.22);background:linear-gradient(145deg,rgba(255,184,48,.12),rgba(74,158,255,.045) 55%,rgba(5,8,15,.92));border-radius:18px;padding:14px 13px;box-shadow:0 16px 44px rgba(0,0,0,.20)}
      .perf-hero:before{content:'';position:absolute;inset:-80px -50px auto auto;width:155px;height:155px;border-radius:50%;background:radial-gradient(circle,rgba(255,184,48,.22),transparent 65%);pointer-events:none}.perf-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;position:relative;z-index:1}
      .perf-title{font-family:var(--ff-display);font-size:20px;font-weight:900;letter-spacing:-.04em;color:#f8fafc;line-height:1.05}.perf-sub{font-size:11px;color:#8ea0c4;margin-top:5px;line-height:1.35;max-width:315px}.perf-status{font-family:var(--ff-mono);font-size:9px;font-weight:900;color:#ffb830;background:rgba(255,184,48,.11);border:1px solid rgba(255,184,48,.25);border-radius:999px;padding:6px 8px;white-space:nowrap;text-transform:uppercase;letter-spacing:.45px}
      .perf-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px;position:relative;z-index:1}.perf-stat{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);border-radius:13px;padding:9px 6px;text-align:center}.perf-stat-v{font-family:var(--ff-mono);font-size:18px;font-weight:900;color:#f8fafc;line-height:1}.perf-stat-l{font-size:8px;color:#7280a1;text-transform:uppercase;font-weight:800;letter-spacing:.35px;margin-top:4px}
      .perf-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:1px}.perf-toolbar small{font-size:10px;color:#64748b;line-height:1.25}.perf-refresh{border:1px solid rgba(255,184,48,.22);background:rgba(255,184,48,.08);color:#ffb830;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}
      .perf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.perf-box{background:linear-gradient(160deg,rgba(13,19,34,.98),rgba(6,10,20,.98));border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.14)}.perf-box.full{grid-column:1/-1}.perf-box-l{font-size:9px;color:#7280a1;text-transform:uppercase;font-weight:900;letter-spacing:.45px;margin-bottom:5px}.perf-box-v{font-family:var(--ff-mono);font-size:22px;font-weight:900;color:#f8fafc;line-height:1}.perf-box-v.good,.perf-stat-v.good{color:#00e87a}.perf-box-v.bad,.perf-stat-v.bad{color:#ff8da0}.perf-box-v.warn,.perf-stat-v.warn{color:#ffb830}.perf-box-s{font-size:10px;color:#8ea0c4;margin-top:6px;line-height:1.35}
      .perf-bars{display:flex;flex-direction:column;gap:7px;margin-top:8px}.perf-bar-row{display:grid;grid-template-columns:72px 1fr 48px;align-items:center;gap:8px;font-size:10px;color:#8ea0c4}.perf-bar-track{height:7px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}.perf-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#4a9eff,#00e87a)}.perf-bar-fill.loss{background:linear-gradient(90deg,#ff3d5a,#ffb830)}
      .perf-empty,.perf-error{border-radius:18px;padding:18px 14px;text-align:center}.perf-empty{border:1px solid rgba(255,184,48,.20);background:linear-gradient(145deg,rgba(255,184,48,.09),rgba(255,255,255,.025));color:#cbd5e1}.perf-empty-ico{font-size:30px;margin-bottom:8px}.perf-empty-title{font-family:var(--ff-display);font-size:17px;font-weight:900;color:#f8fafc;margin-bottom:5px}.perf-empty-sub{font-size:12px;color:#8ea0c4;line-height:1.45}.perf-error{border:1px solid rgba(255,61,90,.22);background:rgba(255,61,90,.08);color:#fecdd3;font-size:12px;line-height:1.45}.perf-note{font-size:10px;color:#64748b;text-align:center;line-height:1.4;padding:0 8px 6px}
    `; document.head.appendChild(s);
  }
  function sectionHtml(){ return `<section class="section" id="sec-performance"><div class="perf-shell"><div class="perf-hero"><div class="perf-hero-top"><div><div class="perf-title">Performanță Publicată</div><div class="perf-sub">ROI, win rate și profit calculate strict din Istoric Publicat. Nu include API raw, watchlist, rejected sau backtest intern.</div></div><div class="perf-status" id="perf-status-pill">ROI CURAT</div></div><div class="perf-stats"><div class="perf-stat"><div class="perf-stat-v" id="perf-published">—</div><div class="perf-stat-l">Publicate</div></div><div class="perf-stat"><div class="perf-stat-v" id="perf-settled">—</div><div class="perf-stat-l">Validate</div></div><div class="perf-stat"><div class="perf-stat-v" id="perf-pending">—</div><div class="perf-stat-l">Pending</div></div></div></div><div class="perf-toolbar"><small id="perf-updated">Se încarcă performanța publicată...</small><button class="perf-refresh" type="button" onclick="window.BPPublishedPerformanceUI.reload()">↻ Refresh</button></div><div id="perf-body"><div class="loader"><div class="spinner"></div>Se calculează performanța publicată...</div></div><div class="perf-note">Regulă: ROI principal = doar predicțiile publicate în rubrica Predicții Validate.</div></div></section>`; }
  function tabHtml(){ return `<div class="tab" data-t="performance" role="tab" aria-selected="false" tabindex="-1"><span class="ti"><svg class="ti-svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="10" fill="#1E1607"/><path d="M11 31h22" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".45"/><path d="M14 28V18m8 10V12m8 16v-7" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M12 14l6 4 7-8 7 5" fill="none" stroke="#ffb830" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="tl">Perf</span></div>`; }
  function ensureUI(){
    installStyle();
    const app=byId('app');
    if(app && !byId('sec-performance')){ const pub=byId('sec-published'), safe=byId('sec-safe'); if(pub) pub.insertAdjacentHTML('afterend',sectionHtml()); else if(safe) safe.insertAdjacentHTML('afterend',sectionHtml()); else app.insertAdjacentHTML('beforeend',sectionHtml()); }
    const bar=byId('main-tabbar');
    if(bar && !bar.querySelector('[data-t="performance"]')){ const pub=bar.querySelector('[data-t="published"]'), safe=bar.querySelector('[data-t="safe"]'); if(pub) pub.insertAdjacentHTML('afterend',tabHtml()); else if(safe) safe.insertAdjacentHTML('afterend',tabHtml()); else bar.insertAdjacentHTML('beforeend',tabHtml()); }
  }
  async function fetchJson(url){ const r=await fetch(`${url}?v=${Date.now()}`,{cache:'no-store'}); if(!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.json(); }
  function bars(items, metric){
    if(!items.length) return '<div class="perf-box-s">Nu există date settled pentru segmentare.</div>';
    const max=Math.max(1,...items.map(x=>Math.abs(metric==='roi'?(x.roi||0):(x.profit||0))));
    return `<div class="perf-bars">${items.map(x=>{const raw=metric==='roi'?(x.roi||0):(x.profit||0); const width=Math.max(4,Math.min(100,Math.abs(raw)/max*100)); const val=metric==='roi'?(x.roi==null?'—':fmtPct(x.roi)):fmtUnits(x.profit); return `<div class="perf-bar-row"><span>${esc(x.name)}</span><div class="perf-bar-track"><div class="perf-bar-fill ${raw<0?'loss':''}" style="width:${width}%"></div></div><strong>${esc(val)}</strong></div>`;}).join('')}</div>`;
  }
  function render(data){
    ensureUI();
    const rows=(Array.isArray(data?.results)?data.results.slice():[]).filter(p=>!isBadCurrentDayPending(p));
    const st=stats(rows);
    const settledRows=rows.filter(p=>['WIN','LOST','LOSS'].includes(statusOf(p)));
    const byMarket=group(settledRows,'market'); const byStrategy=group(settledRows,'strategy');
    const published=byId('perf-published'), settled=byId('perf-settled'), pending=byId('perf-pending'), updated=byId('perf-updated'), pill=byId('perf-status-pill'), body=byId('perf-body');
    if(published) published.textContent=String(st.total); if(settled) settled.textContent=String(st.settled); if(pending) pending.textContent=String(st.pending);
    if(updated) updated.textContent=data?.updated_at?`Calculat din selection_journal_published.json · ${fmtTime(data.updated_at)}`:'Calculat din istoricul publicat';
    if(pill) pill.textContent=st.settled?`${st.settled} VALIDATE`:'PENDING';
    if(!body) return;
    if(!rows.length){ body.innerHTML=`<div class="perf-empty"><div class="perf-empty-ico">📊</div><div class="perf-empty-title">Nu există performanță publicată încă.</div><div class="perf-empty-sub">Performanța apare după ce predicțiile publicate sunt validate ca WIN/LOST.</div></div>`; return; }
    body.innerHTML=`<div class="perf-grid"><div class="perf-box"><div class="perf-box-l">ROI publicat</div><div class="perf-box-v ${cls(st.roi)}">${st.roi==null?'—':esc(fmtPct(st.roi))}</div><div class="perf-box-s">Calcul pe ${st.settled} predicții settled, miză 1u.</div></div><div class="perf-box"><div class="perf-box-l">Profit unități</div><div class="perf-box-v ${cls(st.profit)}">${esc(fmtUnits(st.profit))}</div><div class="perf-box-s">Doar predicții publicate, fără raw API.</div></div><div class="perf-box"><div class="perf-box-l">Win rate</div><div class="perf-box-v ${cls(st.winrate==null?null:st.winrate-50)}">${st.winrate==null?'—':`${st.winrate.toFixed(0)}%`}</div><div class="perf-box-s">${st.wins} WIN · ${st.losses} LOST.</div></div><div class="perf-box"><div class="perf-box-l">Pending</div><div class="perf-box-v warn">${st.pending}</div><div class="perf-box-s">Așteaptă validarea rezultatului.</div></div><div class="perf-box full"><div class="perf-box-l">Performanță pe market</div>${bars(byMarket,'roi')}</div><div class="perf-box full"><div class="perf-box-l">Performanță pe strategie</div>${bars(byStrategy,'roi')}</div></div>`;
  }
  async function load(){ ensureUI(); const body=byId('perf-body'); if(body) body.innerHTML='<div class="loader"><div class="spinner"></div>Se calculează performanța publicată...</div>'; try{ const data=await fetchJson(HISTORY_URL); STATE.data=data; STATE.error=null; render(data); STATE.loaded=true; }catch(err){ STATE.error=err; if(body) body.innerHTML='<div class="perf-error">⚠ Nu pot calcula Performanța Publicată. Verifică <strong>data/selection_journal_published.json</strong>.</div>'; console.warn('[PublishedPerformanceUI] load failed',err); } }
  function patchNavigation(){ if(patchNavigation.done) return; patchNavigation.done=true; const originalGo=window.go; if(typeof originalGo==='function'){ window.go=function(tab){ originalGo(tab); if(tab==='performance') load(); }; } }
  function boot(){ ensureUI(); patchNavigation(); window.BPPublishedPerformanceUI={load,reload:load,render,state:STATE}; }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();


/* BETPREDICT LAB — Pagina Azi / Decizie Rapidă
   Reads only published safe picks + clean history for user-facing summary.
*/
(function(){
  'use strict';
  const SAFE_URL = 'data/published_safe_picks_today.json';
  const HISTORY_URL = 'data/selection_journal_published.json';
  const MONITOR_URL = 'data/platform_monitor.json';
  const HEALTH_URL = 'data/v6_health.json';
  const STATE = { loaded:false, safe:null, history:null, monitor:null, health:null, error:null };

  const escLocal = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const esc = (v) => (typeof window.esc === 'function' ? window.esc(v) : escLocal(v));
  const byId = (id) => document.getElementById(id);
  const nr = (v,d=0) => { const n=Number(v); return Number.isFinite(n)?n:d; };
  const fmtPct = (v) => { const n=Number(v); if(!Number.isFinite(n)) return '—'; return `${n>=0?'+':''}${n.toFixed(Math.abs(n)>=10?0:1)}%`; };
  const fmtProb = (v) => { const n=Number(v); if(!Number.isFinite(n)) return '—'; return `${n.toFixed(n>=80?0:1)}%`; };
  const fmtOdds = (v) => { const n=Number(v); if(!Number.isFinite(n)||n<=0) return '—'; return n.toFixed(2).replace(/\.00$/,''); };
  const fmtTime = (raw) => { if(!raw) return '—'; const d=new Date(raw); if(Number.isNaN(d.getTime())) return String(raw); return d.toLocaleString('ro-RO',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); };
  const statusOf = (p) => String(p.status || p.result || 'PENDING').trim().toUpperCase();
  const APP_TZ = 'Europe/Bucharest';
  const localDateKey = (raw) => {
    const d = raw ? new Date(raw) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone:APP_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  };
  const isTodayPick = (p) => localDateKey(p?.kickoff || p?.event_date || p?.start_time || p?.date) === localDateKey();
  const isBadCurrentDayPending = (p) => String(p?.published_date || '').slice(0,10) === localDateKey() && statusOf(p) === 'PENDING' && !isTodayPick(p);

  function profitUnits(p){
    const s=statusOf(p);
    if(p.profit_units!=null) return nr(p.profit_units);
    if(p.profit!=null) return nr(p.profit);
    if(s==='WIN') return nr(p.odds,1)-1;
    if(s==='LOST'||s==='LOSS') return -1;
    return 0;
  }
  function historyStats(rows){
    const wins=rows.filter(p=>statusOf(p)==='WIN').length;
    const losses=rows.filter(p=>['LOST','LOSS'].includes(statusOf(p))).length;
    const pending=rows.filter(p=>statusOf(p)==='PENDING').length;
    const settled=rows.filter(p=>['WIN','LOST','LOSS'].includes(statusOf(p)));
    const profit=settled.reduce((s,p)=>s+profitUnits(p),0);
    const roi=settled.length?profit/settled.length*100:null;
    const winrate=(wins+losses)?wins/(wins+losses)*100:null;
    return {total:rows.length,wins,losses,pending,settled:settled.length,profit,roi,winrate};
  }

  async function fetchJson(url, optional=false){
    try{
      const r=await fetch(`${url}?v=${Date.now()}`,{cache:'no-store'});
      if(!r.ok) throw new Error(`${url} HTTP ${r.status}`);
      return await r.json();
    }catch(err){
      if(optional) return null;
      throw err;
    }
  }

  function engineStatus(monitor, health){
    const mStatus = String(monitor?.status || monitor?.overall?.status || '').toUpperCase();
    const hStatus = String(health?.overall?.status || health?.status || '').toUpperCase();
    const score = monitor?.health_score ?? monitor?.overall_score ?? monitor?.score ?? health?.overall?.score ?? null;
    const status = mStatus || hStatus || 'UNKNOWN';
    let label = 'Motor prudent';
    let cls = 'warn';
    if(status === 'GREEN' && (score == null || Number(score) >= 75)){ label='Motor stabil'; cls='good'; }
    else if(status === 'RED' || Number(score) < 55){ label='Nu juca / risc ridicat'; cls='bad'; }
    return {status,label,cls,score};
  }

  function installStyle(){
    if(byId('today-ui-style')) return;
    const s=document.createElement('style'); s.id='today-ui-style';
    s.textContent=`
      .tab[data-t="today"] .tl{color:#00e87a;font-weight:900}
      .today-shell{display:flex;flex-direction:column;gap:10px}
      .today-hero{position:relative;overflow:hidden;border:1px solid rgba(0,232,122,.22);background:linear-gradient(145deg,rgba(0,232,122,.13),rgba(74,158,255,.05) 56%,rgba(5,8,15,.94));border-radius:20px;padding:15px 13px;box-shadow:0 18px 46px rgba(0,0,0,.22)}
      .today-hero:before{content:'';position:absolute;inset:-85px -55px auto auto;width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,rgba(0,232,122,.24),transparent 66%);pointer-events:none}
      .today-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;position:relative;z-index:1}
      .today-title{font-family:var(--ff-display);font-size:22px;font-weight:950;letter-spacing:-.05em;color:#f8fafc;line-height:1.02}
      .today-sub{font-size:11px;color:#8ea0c4;margin-top:5px;line-height:1.35;max-width:315px}
      .today-pill{font-family:var(--ff-mono);font-size:9px;font-weight:950;border-radius:999px;padding:6px 8px;white-space:nowrap;text-transform:uppercase;letter-spacing:.45px}
      .today-pill.good{color:#00e87a;background:rgba(0,232,122,.11);border:1px solid rgba(0,232,122,.25)}.today-pill.warn{color:#ffb830;background:rgba(255,184,48,.11);border:1px solid rgba(255,184,48,.25)}.today-pill.bad{color:#ff8da0;background:rgba(255,61,90,.10);border:1px solid rgba(255,61,90,.25)}
      .today-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:13px;position:relative;z-index:1}
      .today-stat{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);border-radius:13px;padding:9px 6px;text-align:center}.today-stat-v{font-family:var(--ff-mono);font-size:18px;font-weight:950;color:#f8fafc;line-height:1}.today-stat-v.good{color:#00e87a}.today-stat-v.warn{color:#ffb830}.today-stat-v.bad{color:#ff8da0}.today-stat-l{font-size:8px;color:#7280a1;text-transform:uppercase;font-weight:850;letter-spacing:.35px;margin-top:4px}
      .today-main-card{position:relative;overflow:hidden;background:linear-gradient(160deg,rgba(13,19,34,.98),rgba(6,10,20,.98));border:1px solid rgba(255,255,255,.08);border-radius:18px;box-shadow:0 12px 34px rgba(0,0,0,.18)}.today-main-card:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#00e87a,#4a9eff)}
      .today-card-head{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.018)}.today-badge{display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:950;letter-spacing:.5px;text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,.09);border:1px solid rgba(0,232,122,.23);border-radius:999px;padding:5px 8px;white-space:nowrap}.today-score{font-family:var(--ff-mono);font-size:10px;color:#dbeafe;background:rgba(74,158,255,.10);border:1px solid rgba(74,158,255,.20);border-radius:999px;padding:5px 7px;white-space:nowrap}
      .today-card-body{padding:12px}.today-match{font-family:var(--ff-display);font-size:18px;font-weight:950;color:#f8fafc;letter-spacing:-.03em;line-height:1.15;margin-bottom:4px}.today-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:10px;color:#7d8aaa;margin-bottom:10px}.today-dot{width:3px;height:3px;border-radius:50%;background:#334155;display:inline-block}
      .today-pick{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(0,232,122,.17);background:rgba(0,232,122,.07);border-radius:14px;padding:10px;margin-bottom:9px}.today-pick-l{font-size:9px;color:#6f7e9e;text-transform:uppercase;font-weight:950;letter-spacing:.45px;margin-bottom:2px}.today-pick-v{font-family:var(--ff-display);font-size:17px;font-weight:950;color:#eafff4;line-height:1.08}.today-odd{font-family:var(--ff-mono);font-size:23px;font-weight:950;color:#00e87a;white-space:nowrap}
      .today-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:9px}.today-kpi{border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.035);border-radius:12px;padding:8px 6px;text-align:center}.today-kpi-v{font-family:var(--ff-mono);font-size:14px;font-weight:950;color:#f8fafc;line-height:1}.today-kpi-v.green{color:#00e87a}.today-kpi-v.blue{color:#4a9eff}.today-kpi-v.gold{color:#ffb830}.today-kpi-l{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:850;letter-spacing:.35px;margin-top:3px}.today-why{font-size:11px;color:#9aa7c4;line-height:1.45;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.055);border-radius:12px;padding:8px 9px}
      .today-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.today-action{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.045);color:#dbeafe;border-radius:13px;padding:10px 7px;font-size:11px;font-weight:950;text-align:center;cursor:pointer}.today-action.primary{border-color:rgba(0,232,122,.24);background:rgba(0,232,122,.08);color:#00e87a}.today-action:active{transform:scale(.98)}
      .today-empty{border:1px solid rgba(255,184,48,.20);background:linear-gradient(145deg,rgba(255,184,48,.09),rgba(255,255,255,.025));border-radius:18px;padding:18px 14px;text-align:center;color:#cbd5e1}.today-empty-ico{font-size:31px;margin-bottom:8px}.today-empty-title{font-family:var(--ff-display);font-size:17px;font-weight:950;color:#f8fafc;margin-bottom:5px}.today-empty-sub{font-size:12px;color:#8ea0c4;line-height:1.45}.today-error{border:1px solid rgba(255,61,90,.22);background:rgba(255,61,90,.08);color:#fecdd3;border-radius:14px;padding:12px;font-size:12px;line-height:1.45}.today-note{font-size:10px;color:#64748b;text-align:center;line-height:1.4;padding:0 8px 6px}
    `; document.head.appendChild(s);
  }

  function sectionHtml(){
    return `<section class="section" id="sec-today"><div class="today-shell"><div class="today-hero"><div class="today-top"><div><div class="today-title">Azi</div><div class="today-sub">Decizie rapidă: status motor, predicții validate publicate azi și pick principal. Fără API raw, fără liste aglomerate.</div></div><div class="today-pill warn" id="today-status-pill">SE ÎNCARCĂ</div></div><div class="today-stats"><div class="today-stat"><div class="today-stat-v" id="today-count">—</div><div class="today-stat-l">Validate</div></div><div class="today-stat"><div class="today-stat-v" id="today-top-score">—</div><div class="today-stat-l">Top scor</div></div><div class="today-stat"><div class="today-stat-v" id="today-roi">—</div><div class="today-stat-l">ROI publicat</div></div></div></div><div id="today-body"><div class="loader"><div class="spinner"></div>Se încarcă sumarul zilei...</div></div><div class="today-actions"><button class="today-action primary" type="button" onclick="window.go&&go('safe')">Predicții</button><button class="today-action" type="button" onclick="window.go&&go('published')">Istoric</button><button class="today-action" type="button" onclick="window.go&&go('performance')">Perf</button></div><div class="today-note">Regulă: Azi arată doar snapshot-ul publicat, adică aceeași sursă folosită în Picks, Istoric și ROI.</div></div></section>`;
  }
  function tabHtml(){
    return `<div class="tab" data-t="today" role="tab" aria-selected="false" tabindex="-1"><span class="ti"><svg class="ti-svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="10" fill="#071B14"/><path d="M12 15h20M12 23h14M12 31h20" stroke="white" stroke-width="3" stroke-linecap="round" opacity=".88"/><path d="M31 20l2.5 2.5L38 17" fill="none" stroke="#00e87a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="tl">Azi</span></div>`;
  }
  function ensureUI(){
    installStyle();
    const app=byId('app');
    if(app && !byId('sec-today')){ const dash=byId('sec-dash'); if(dash) dash.insertAdjacentHTML('afterend',sectionHtml()); else app.insertAdjacentHTML('afterbegin',sectionHtml()); }
    const bar=byId('main-tabbar');
    if(bar && !bar.querySelector('[data-t="today"]')){ const dashTab=bar.querySelector('[data-t="dash"]'); if(dashTab) dashTab.insertAdjacentHTML('afterend',tabHtml()); else bar.insertAdjacentHTML('afterbegin',tabHtml()); }
    if(bar && !byId('today-tabbar-compact')){ const s=document.createElement('style'); s.id='today-tabbar-compact'; s.textContent='#main-tabbar .tab{min-width:0}#main-tabbar .tl{font-size:8.6px;line-height:1}#main-tabbar .ti-svg{width:21px;height:21px}'; document.head.appendChild(s); }
  }

  function renderPick(p){
    const match=p.match || `${p.home_team||'Gazde'} vs ${p.away_team||'Oaspeți'}`;
    const league=[p.country,p.league].filter(Boolean).join(' · ') || p.league || 'Ligă indisponibilă';
    const pick=p.recommended_pick || p.market_label || p.market || 'Predicție';
    const score=Math.round(nr(p.safe_score ?? p.confidence_score,0));
    return `<article class="today-main-card"><div class="today-card-head"><div class="today-badge">✓ PICK PRINCIPAL</div><div class="today-score">Scor ${score}/100</div></div><div class="today-card-body"><div class="today-match">${esc(match)}</div><div class="today-meta"><span>${esc(league)}</span><span class="today-dot"></span><span>${esc(fmtTime(p.kickoff||p.event_date))}</span><span class="today-dot"></span><span>${esc(String(p.status||'PENDING').toUpperCase())}</span></div><div class="today-pick"><div><div class="today-pick-l">Predicție recomandată</div><div class="today-pick-v">${esc(pick)}</div></div><div class="today-odd">${esc(fmtOdds(p.odds))}</div></div><div class="today-kpis"><div class="today-kpi"><div class="today-kpi-v blue">${esc(fmtProb(p.probability_pct))}</div><div class="today-kpi-l">Prob.</div></div><div class="today-kpi"><div class="today-kpi-v green">${esc(fmtPct(p.ev_calibrated_pct))}</div><div class="today-kpi-l">EV cal.</div></div><div class="today-kpi"><div class="today-kpi-v gold">${esc(p.quality_grade_v6||'A')}</div><div class="today-kpi-l">Grad</div></div></div><div class="today-why">${esc(p.explain||'A trecut filtrele Safe Picks Gate și este publicat în snapshot-ul zilei.')}</div></div></article>`;
  }

  function renderEmpty(status){
    return `<div class="today-empty"><div class="today-empty-ico">🛡️</div><div class="today-empty-title">Nu există predicții validate azi.</div><div class="today-empty-sub">${esc(status.label)}. Motorul a blocat selecțiile riscante. Este mai bine să nu apară nimic decât să apară predicții slabe.</div></div>`;
  }

  function render(){
    ensureUI();
    const safe=STATE.safe || {};
    const history=STATE.history || {};
    const monitor=STATE.monitor;
    const health=STATE.health;
    const picks=(Array.isArray(safe.safe_picks)?safe.safe_picks.slice():[]).filter(isTodayPick);
    picks.sort((a,b)=>nr(b.safe_score??b.confidence_score)-nr(a.safe_score??a.confidence_score));
    const hRows=(Array.isArray(history.results)?history.results:[]).filter(p=>!isBadCurrentDayPending(p));
    const hStats=historyStats(hRows);
    const status=engineStatus(monitor,health);
    const body=byId('today-body'), pill=byId('today-status-pill'), count=byId('today-count'), topScore=byId('today-top-score'), roi=byId('today-roi');
    if(pill){ pill.textContent=status.score!=null?`${status.label} · ${status.score}`:status.label; pill.className=`today-pill ${status.cls}`; }
    if(count) count.textContent=String(picks.length);
    if(topScore) topScore.textContent=picks.length?String(Math.round(nr(picks[0].safe_score??picks[0].confidence_score,0))):'—';
    if(roi){ roi.textContent=hStats.roi==null?'—':fmtPct(hStats.roi); roi.className=`today-stat-v ${hStats.roi==null?'warn':hStats.roi>=0?'good':'bad'}`; }
    if(!body) return;
    body.innerHTML = picks.length ? renderPick(picks[0]) : renderEmpty(status);
  }

  async function load(){
    ensureUI();
    const body=byId('today-body');
    if(body) body.innerHTML='<div class="loader"><div class="spinner"></div>Se încarcă sumarul zilei...</div>';
    try{
      const [safe,history,monitor,health]=await Promise.all([
        fetchJson(SAFE_URL),
        fetchJson(HISTORY_URL,true),
        fetchJson(MONITOR_URL,true),
        fetchJson(HEALTH_URL,true)
      ]);
      STATE.safe=safe; STATE.history=history||{}; STATE.monitor=monitor; STATE.health=health; STATE.error=null; STATE.loaded=true;
      render();
    }catch(err){
      STATE.error=err;
      if(body) body.innerHTML='<div class="today-error">⚠ Nu pot încărca pagina Azi. Verifică <strong>data/published_safe_picks_today.json</strong>.</div>';
      console.warn('[TodayUI] load failed',err);
    }
  }
  function patchNavigation(){
    if(patchNavigation.done) return; patchNavigation.done=true;
    const originalGo=window.go;
    if(typeof originalGo==='function'){
      window.go=function(tab){ originalGo(tab); if(tab==='today') load(); };
    }
  }
  function boot(){ ensureUI(); patchNavigation(); window.BPTodayUI={load,reload:load,render,state:STATE}; }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
