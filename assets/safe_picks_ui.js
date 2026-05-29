/* BETPREDICT LAB — Final Mobile Shell
   Final structure:
   Azi | Picks | Istoric | Perf | Mai mult

   Clean sources:
   - data/published_safe_picks_today.json
   - data/selection_journal_published.json
   - data/platform_monitor.json
   - data/v6_health.json

   Rule:
   Predicții afișate = predicții publicate = istoric curat = sursa ROI principal.
*/
(function(){
  'use strict';

  const URLS = {
    safe: 'data/published_safe_picks_today.json',
    safeFallback: 'data/safe_picks_today.json',
    history: 'data/selection_journal_published.json',
    monitor: 'data/platform_monitor.json',
    health: 'data/v6_health.json'
  };
  const APP_TZ = 'Europe/Bucharest';
  const FINAL_TABS = ['today','safe','published','performance','more'];
  const OLD_TABS = [
    ['dash','Dashboard tehnic','Starea veche a aplicației și KPI-uri generale'],
    ['meciuri','Toate meciurile','Lista completă scanată de API'],
    ['value','Value Watch','Semnale value, fără statut de safe pick'],
    ['smartbet','SmartBet','Modul vechi SmartBet / analiză detaliată'],
    ['live','Live Monitor','Monitor live și alerte'],
    ['top','Top / Extra','Module secundare existente']
  ];
  const STATE = { safe:null, history:null, monitor:null, health:null, loaded:false };
  let originalGo = null;

  const escLocal = (value) => String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const esc = (value) => (typeof window.esc === 'function' ? window.esc(value) : escLocal(value));
  const byId = (id) => document.getElementById(id);
  const nr = (v, d=0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const fmtPct = (v) => { const n=Number(v); if(!Number.isFinite(n)) return '—'; return `${n>=0?'+':''}${n.toFixed(Math.abs(n)>=10?0:1)}%`; };
  const fmtProb = (v) => { const n=Number(v); if(!Number.isFinite(n)) return '—'; return `${n.toFixed(n>=80?0:1)}%`; };
  const fmtOdds = (v) => { const n=Number(v); if(!Number.isFinite(n)||n<=0) return '—'; return n.toFixed(2).replace(/\.00$/,''); };
  const fmtUnits = (v) => { const n=Number(v); if(!Number.isFinite(n)) return '—'; return `${n>0?'+':''}${n.toFixed(2)}u`; };
  const fmtTime = (raw) => {
    if(!raw) return 'Ora indisponibilă';
    const d = new Date(raw);
    if(Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleString('ro-RO', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  };
  const localDateKey = (raw) => {
    const d = raw ? new Date(raw) : new Date();
    if(Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone:APP_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  };
  const todayKey = () => localDateKey();
  const isTodayPick = (p) => localDateKey(p?.kickoff || p?.event_date || p?.start_time || p?.date) === todayKey();
  const statusOf = (p) => String(p?.status || p?.result || 'PENDING').trim().toUpperCase();

  async function fetchJson(url, optional=false){
    try{
      const r = await fetch(`${url}?v=${Date.now()}`, { cache:'no-store' });
      if(!r.ok) throw new Error(`${url} HTTP ${r.status}`);
      return await r.json();
    }catch(err){
      if(optional) return null;
      throw err;
    }
  }

  async function loadAll(){
    const safe = await fetchJson(URLS.safe).catch(async () => {
      const fallback = await fetchJson(URLS.safeFallback, true);
      return {
        generated_at: fallback?.generated_at,
        published_date: todayKey(),
        source: 'safe_picks_today_fallback',
        summary: { published_count: Array.isArray(fallback?.safe_picks) ? fallback.safe_picks.length : 0 },
        safe_picks: Array.isArray(fallback?.safe_picks) ? fallback.safe_picks : []
      };
    });
    const [history, monitor, health] = await Promise.all([
      fetchJson(URLS.history, true),
      fetchJson(URLS.monitor, true),
      fetchJson(URLS.health, true)
    ]);
    STATE.safe = safe || { safe_picks:[] };
    STATE.history = history || { results:[] };
    STATE.monitor = monitor;
    STATE.health = health;
    STATE.loaded = true;
    return STATE;
  }

  function safePicksToday(){
    return (Array.isArray(STATE.safe?.safe_picks) ? STATE.safe.safe_picks : [])
      .filter(p => String(p.category || 'safe').toLowerCase() === 'safe')
      .filter(p => isTodayPick(p))
      .sort((a,b) => nr(b.safe_score ?? b.confidence_score) - nr(a.safe_score ?? a.confidence_score));
  }

  function historyRows(){
    return (Array.isArray(STATE.history?.results) ? STATE.history.results : [])
      .filter(p => String(p.category || 'safe').toLowerCase() === 'safe')
      .sort((a,b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
  }

  function profitUnits(p){
    const s = statusOf(p);
    if(p.profit_units != null) return nr(p.profit_units);
    if(p.profit != null) return nr(p.profit);
    if(s === 'WIN') return nr(p.odds,1)-1;
    if(s === 'LOST' || s === 'LOSS') return -1;
    return 0;
  }

  function perfStats(rows){
    const wins = rows.filter(p => statusOf(p)==='WIN').length;
    const losses = rows.filter(p => ['LOST','LOSS'].includes(statusOf(p))).length;
    const pending = rows.filter(p => statusOf(p)==='PENDING').length;
    const settledRows = rows.filter(p => ['WIN','LOST','LOSS'].includes(statusOf(p)));
    const profit = settledRows.reduce((s,p) => s + profitUnits(p), 0);
    const roi = settledRows.length ? profit / settledRows.length * 100 : null;
    const winrate = (wins + losses) ? wins / (wins + losses) * 100 : null;
    return { total:rows.length, wins, losses, pending, settled:settledRows.length, profit, roi, winrate };
  }

  function groupStats(rows, field){
    const m = new Map();
    rows.filter(p => ['WIN','LOST','LOSS'].includes(statusOf(p))).forEach(p => {
      const k = String(p[field] || 'Necunoscut');
      if(!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    });
    return Array.from(m.entries()).map(([name, items]) => ({ name, ...perfStats(items) }))
      .sort((a,b) => (b.profit-a.profit) || (b.total-a.total)).slice(0, 8);
  }

  function engineStatus(){
    const monitor = STATE.monitor || {};
    const health = STATE.health || {};
    const mStatus = String(monitor.status || monitor.overall?.status || '').toUpperCase();
    const hStatus = String(health.overall?.status || health.status || '').toUpperCase();
    const score = monitor.health_score ?? monitor.overall_score ?? monitor.score ?? health.overall?.score ?? null;
    const status = mStatus || hStatus || 'UNKNOWN';
    if(status === 'GREEN' && (score == null || Number(score) >= 75)) return { label:'Motor stabil', cls:'good', score, status };
    if(status === 'RED' || Number(score) < 55) return { label:'Nu juca', cls:'bad', score, status };
    return { label:'Motor prudent', cls:'warn', score, status };
  }

  function installStyle(){
    if(byId('bp-final-shell-style')) return;
    const s = document.createElement('style');
    s.id = 'bp-final-shell-style';
    s.textContent = `
      #main-tabbar .tab{min-width:0}
      #main-tabbar .tl{font-size:8.6px;line-height:1;font-weight:850}
      #main-tabbar .ti{font-size:18px}
      #main-tabbar .ti-svg{display:block;width:21px;height:21px}
      .bp-old-tab-hidden{display:none!important}

      .bp-shell{display:flex;flex-direction:column;gap:10px}
      .bp-hero{position:relative;overflow:hidden;border-radius:20px;padding:15px 13px;box-shadow:0 18px 46px rgba(0,0,0,.22)}
      .bp-hero.green{border:1px solid rgba(0,232,122,.22);background:linear-gradient(145deg,rgba(0,232,122,.13),rgba(74,158,255,.05) 56%,rgba(5,8,15,.94))}
      .bp-hero.blue{border:1px solid rgba(74,158,255,.22);background:linear-gradient(145deg,rgba(74,158,255,.13),rgba(0,232,122,.045) 58%,rgba(5,8,15,.94))}
      .bp-hero.gold{border:1px solid rgba(255,184,48,.22);background:linear-gradient(145deg,rgba(255,184,48,.12),rgba(74,158,255,.045) 55%,rgba(5,8,15,.94))}
      .bp-hero.purple{border:1px solid rgba(167,139,250,.22);background:linear-gradient(145deg,rgba(167,139,250,.12),rgba(74,158,255,.045) 55%,rgba(5,8,15,.94))}
      .bp-hero:before{content:'';position:absolute;inset:-85px -55px auto auto;width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.13),transparent 66%);pointer-events:none}
      .bp-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;position:relative;z-index:1}
      .bp-title{font-family:var(--ff-display);font-size:22px;font-weight:950;letter-spacing:-.05em;color:#f8fafc;line-height:1.02}
      .bp-sub{font-size:11px;color:#8ea0c4;margin-top:5px;line-height:1.35;max-width:318px}
      .bp-pill{font-family:var(--ff-mono);font-size:9px;font-weight:950;border-radius:999px;padding:6px 8px;white-space:nowrap;text-transform:uppercase;letter-spacing:.45px}
      .bp-pill.good{color:#00e87a;background:rgba(0,232,122,.11);border:1px solid rgba(0,232,122,.25)}
      .bp-pill.warn{color:#ffb830;background:rgba(255,184,48,.11);border:1px solid rgba(255,184,48,.25)}
      .bp-pill.bad{color:#ff8da0;background:rgba(255,61,90,.10);border:1px solid rgba(255,61,90,.25)}
      .bp-pill.blue{color:#93c5fd;background:rgba(74,158,255,.11);border:1px solid rgba(74,158,255,.25)}
      .bp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:13px;position:relative;z-index:1}
      .bp-stat{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);border-radius:13px;padding:9px 6px;text-align:center}
      .bp-stat-v{font-family:var(--ff-mono);font-size:18px;font-weight:950;color:#f8fafc;line-height:1}
      .bp-stat-v.good{color:#00e87a}.bp-stat-v.warn{color:#ffb830}.bp-stat-v.bad{color:#ff8da0}.bp-stat-v.blue{color:#4a9eff}
      .bp-stat-l{font-size:8px;color:#7280a1;text-transform:uppercase;font-weight:850;letter-spacing:.35px;margin-top:4px}

      .bp-card{position:relative;overflow:hidden;background:linear-gradient(160deg,rgba(13,19,34,.98),rgba(6,10,20,.98));border:1px solid rgba(255,255,255,.08);border-radius:18px;margin-bottom:10px;box-shadow:0 12px 34px rgba(0,0,0,.18)}
      .bp-card:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#00e87a,#4a9eff)}
      .bp-card-head{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.018)}
      .bp-badge{display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:950;letter-spacing:.5px;text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,.09);border:1px solid rgba(0,232,122,.23);border-radius:999px;padding:5px 8px;white-space:nowrap}
      .bp-score{font-family:var(--ff-mono);font-size:10px;color:#dbeafe;background:rgba(74,158,255,.10);border:1px solid rgba(74,158,255,.20);border-radius:999px;padding:5px 7px;white-space:nowrap}
      .bp-card-body{padding:12px}.bp-match{font-family:var(--ff-display);font-size:17px;font-weight:950;color:#f8fafc;letter-spacing:-.03em;line-height:1.15;margin-bottom:4px}
      .bp-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:10px;color:#7d8aaa;margin-bottom:10px}.bp-dot{width:3px;height:3px;border-radius:50%;background:#334155;display:inline-block}
      .bp-pick{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(0,232,122,.17);background:rgba(0,232,122,.07);border-radius:14px;padding:10px;margin-bottom:9px}
      .bp-pick-l{font-size:9px;color:#6f7e9e;text-transform:uppercase;font-weight:950;letter-spacing:.45px;margin-bottom:2px}.bp-pick-v{font-family:var(--ff-display);font-size:16px;font-weight:950;color:#eafff4;line-height:1.08}.bp-odd{font-family:var(--ff-mono);font-size:22px;font-weight:950;color:#00e87a;white-space:nowrap}
      .bp-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:9px}.bp-kpi{border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.035);border-radius:12px;padding:8px 6px;text-align:center}.bp-kpi-v{font-family:var(--ff-mono);font-size:14px;font-weight:950;color:#f8fafc;line-height:1}.bp-kpi-v.green{color:#00e87a}.bp-kpi-v.blue{color:#4a9eff}.bp-kpi-v.gold{color:#ffb830}.bp-kpi-l{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:850;letter-spacing:.35px;margin-top:3px}
      .bp-why{font-size:11px;color:#9aa7c4;line-height:1.45;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.055);border-radius:12px;padding:8px 9px}
      .bp-details{border-top:1px solid rgba(255,255,255,.055);padding:8px 12px 11px}.bp-details summary{font-size:10px;font-weight:900;color:#8ea0c4;cursor:pointer;text-transform:uppercase;letter-spacing:.4px}
      .bp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.bp-mini{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:7px}.bp-mini-l{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:900;letter-spacing:.35px}.bp-mini-v{font-family:var(--ff-mono);font-size:11px;color:#e2e8f0;font-weight:800;margin-top:2px;word-break:break-word}
      .bp-empty{border:1px solid rgba(255,184,48,.20);background:linear-gradient(145deg,rgba(255,184,48,.09),rgba(255,255,255,.025));border-radius:18px;padding:18px 14px;text-align:center;color:#cbd5e1}.bp-empty-ico{font-size:31px;margin-bottom:8px}.bp-empty-title{font-family:var(--ff-display);font-size:17px;font-weight:950;color:#f8fafc;margin-bottom:5px}.bp-empty-sub{font-size:12px;color:#8ea0c4;line-height:1.45}
      .bp-error{border:1px solid rgba(255,61,90,.22);background:rgba(255,61,90,.08);color:#fecdd3;border-radius:14px;padding:12px;font-size:12px;line-height:1.45}
      .bp-note{font-size:10px;color:#64748b;text-align:center;line-height:1.4;padding:0 8px 6px}

      .bp-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.bp-action{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.045);color:#dbeafe;border-radius:13px;padding:10px 7px;font-size:11px;font-weight:950;text-align:center;cursor:pointer}.bp-action.primary{border-color:rgba(0,232,122,.24);background:rgba(0,232,122,.08);color:#00e87a}.bp-action:active{transform:scale(.98)}
      .bp-filter-row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.bp-filter-row::-webkit-scrollbar{display:none}.bp-chip{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#8ea0c4;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:900;white-space:nowrap;cursor:pointer}.bp-chip.active{border-color:rgba(74,158,255,.30);background:rgba(74,158,255,.12);color:#93c5fd}
      .bp-more-grid{display:grid;grid-template-columns:1fr;gap:8px}.bp-more-item{display:flex;align-items:center;justify-content:space-between;gap:10px;background:linear-gradient(160deg,rgba(13,19,34,.98),rgba(6,10,20,.98));border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px;cursor:pointer}.bp-more-title{font-family:var(--ff-display);font-size:14px;font-weight:900;color:#f8fafc}.bp-more-sub{font-size:10px;color:#8ea0c4;margin-top:3px;line-height:1.35}.bp-more-arrow{font-size:18px;color:#4a9eff}
      .bp-bars{display:flex;flex-direction:column;gap:7px;margin-top:8px}.bp-bar-row{display:grid;grid-template-columns:72px 1fr 48px;align-items:center;gap:8px;font-size:10px;color:#8ea0c4}.bp-bar-track{height:7px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}.bp-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#4a9eff,#00e87a)}.bp-bar-fill.loss{background:linear-gradient(90deg,#ff3d5a,#ffb830)}
    `;
    document.head.appendChild(s);
  }

  function finalTabHtml(id, label, svg, color){
    return `<div class="tab bp-final-tab" data-t="${id}" role="tab" aria-selected="false" tabindex="-1"><span class="ti"><svg class="ti-svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="10" fill="${color}"/>${svg}</svg></span><span class="tl">${label}</span></div>`;
  }

  function tabsHtml(){
    return [
      finalTabHtml('today','Azi','<path d="M12 15h20M12 23h14M12 31h20" stroke="white" stroke-width="3" stroke-linecap="round" opacity=".88"/><path d="M31 20l2.5 2.5L38 17" fill="none" stroke="#00e87a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>','#071B14'),
      finalTabHtml('safe','Picks','<path d="M13 22.5l6.2 6.3L32 15.5" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 6l13 5v10c0 8.5-5.4 14.5-13 17-7.6-2.5-13-8.5-13-17V11l13-5z" fill="none" stroke="white" stroke-width="1.4" opacity="0.32"/>','#071B14'),
      finalTabHtml('published','Istoric','<path d="M12 12h20v4H12zM12 20h20v4H12zM12 28h13v4H12z" fill="white" opacity=".92"/><path d="M29 27l3 3 6-7" fill="none" stroke="#00e87a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>','#071522'),
      finalTabHtml('performance','Perf','<path d="M11 31h22" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".45"/><path d="M14 28V18m8 10V12m8 16v-7" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M12 14l6 4 7-8 7 5" fill="none" stroke="#ffb830" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>','#1E1607'),
      finalTabHtml('more','Mai mult','<circle cx="14" cy="22" r="3" fill="white"/><circle cx="22" cy="22" r="3" fill="white"/><circle cx="30" cy="22" r="3" fill="white"/>','#160F24')
    ].join('');
  }

  function section(id, inner){
    return `<section class="section" id="sec-${id}">${inner}</section>`;
  }

  function hero(cls, title, sub, pillId, pillText, stats){
    return `<div class="bp-hero ${cls}">
      <div class="bp-hero-top"><div><div class="bp-title">${title}</div><div class="bp-sub">${sub}</div></div><div class="bp-pill warn" id="${pillId}">${pillText}</div></div>
      <div class="bp-stats">${stats.map(s => `<div class="bp-stat"><div class="bp-stat-v ${s.cls || ''}" id="${s.id}">—</div><div class="bp-stat-l">${s.label}</div></div>`).join('')}</div>
    </div>`;
  }

  function ensureSections(){
    const app = byId('app');
    if(!app) return;
    const sections = {
      today: section('today', `<div class="bp-shell">${hero('green','Azi','Decizie rapidă: status motor, predicții validate azi și pick principal. Fără API raw.', 'today-status-pill','SE ÎNCARCĂ', [
        {id:'today-count',label:'Validate',cls:'good'}, {id:'today-top-score',label:'Top scor'}, {id:'today-roi',label:'ROI publicat'}
      ])}<div id="today-body"><div class="loader"><div class="spinner"></div>Se încarcă sumarul zilei...</div></div><div class="bp-actions"><button class="bp-action primary" type="button" onclick="window.go&&go('safe')">Predicții</button><button class="bp-action" type="button" onclick="window.go&&go('published')">Istoric</button><button class="bp-action" type="button" onclick="window.go&&go('performance')">Perf</button></div><div class="bp-note">Azi afișează doar snapshot-ul publicat pentru meciurile de azi.</div></div>`),
      safe: section('safe', `<div class="bp-shell">${hero('green','Predicții Validate','Doar selecțiile publicate de Safe Picks Gate. Ce vezi aici intră în istoricul curat și ROI.', 'safe-status-pill','SAFE GATE', [
        {id:'safe-count',label:'Publicate',cls:'good'}, {id:'safe-best',label:'Top scor'}, {id:'safe-date',label:'Data'}
      ])}<div id="safe-body"><div class="loader"><div class="spinner"></div>Se încarcă predicțiile validate...</div></div><div class="bp-note">Predicții afișate = predicții salvate = predicții folosite la ROI.</div></div>`),
      published: section('published', `<div class="bp-shell">${hero('blue','Istoric Publicat','Exact ce s-a văzut în Predicții Validate. Nu include API raw, watchlist sau rejected.', 'pub-status-pill','JURNAL CURAT', [
        {id:'pub-total',label:'Publicate'}, {id:'pub-roi',label:'ROI'}, {id:'pub-winrate',label:'Win rate'}
      ])}<div class="bp-filter-row" id="pub-filters"><button class="bp-chip active" data-filter="all">Toate</button><button class="bp-chip" data-filter="pending">Pending</button><button class="bp-chip" data-filter="win">Win</button><button class="bp-chip" data-filter="lost">Lost</button></div><div id="pub-body"><div class="loader"><div class="spinner"></div>Se încarcă istoricul publicat...</div></div><div class="bp-note">ROI-ul principal trebuie calculat doar din acest jurnal.</div></div>`),
      performance: section('performance', `<div class="bp-shell">${hero('gold','Performanță Publicată','ROI, win rate și profit calculate strict din Istoric Publicat.', 'perf-status-pill','ROI CURAT', [
        {id:'perf-published',label:'Publicate'}, {id:'perf-settled',label:'Validate'}, {id:'perf-pending',label:'Pending',cls:'warn'}
      ])}<div id="perf-body"><div class="loader"><div class="spinner"></div>Se calculează performanța publicată...</div></div><div class="bp-note">Nu include raw API, watchlist, rejected sau backtest intern.</div></div>`),
      more: section('more', `<div class="bp-shell">${hero('purple','Mai mult','Module secundare, debug și dashboard-uri vechi. Zona principală rămâne Azi/Picks/Istoric/Perf.', 'more-status-pill','EXTRA', [
        {id:'more-modules',label:'Module'}, {id:'more-primary',label:'Primare'}, {id:'more-mode',label:'Mod'}
      ])}<div class="bp-more-grid" id="more-body"></div><div class="bp-note">Modulele din Mai mult nu intră automat în istoricul principal sau ROI.</div></div>`)
    };
    Object.entries(sections).forEach(([id, html]) => {
      if(!byId(`sec-${id}`)) {
        const dash = byId('sec-dash');
        if(dash && id === 'today') dash.insertAdjacentHTML('afterend', html);
        else app.insertAdjacentHTML('beforeend', html);
      }
    });
  }

  function installFinalTabs(){
    const bar = byId('main-tabbar');
    if(!bar) return;
    Array.from(bar.querySelectorAll('.tab')).forEach(tab => {
      if(!FINAL_TABS.includes(tab.dataset.t)) tab.classList.add('bp-old-tab-hidden');
    });
    FINAL_TABS.forEach(id => {
      const existing = bar.querySelector(`.bp-final-tab[data-t="${id}"]`);
      if(existing) return;
    });
    const existingFinal = Array.from(bar.querySelectorAll('.bp-final-tab')).map(x=>x.dataset.t);
    if(FINAL_TABS.every(t => existingFinal.includes(t))) return;
    bar.insertAdjacentHTML('afterbegin', tabsHtml());
  }

  function showCustom(tab){
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const sec = byId(`sec-${tab}`);
    if(sec) sec.classList.add('active');
    const bar = byId('main-tabbar');
    if(bar) {
      bar.querySelectorAll('[data-t]').forEach(el => {
        const active = el.dataset.t === tab && el.classList.contains('bp-final-tab');
        el.classList.toggle('active', active);
        el.setAttribute('aria-selected', String(active));
        el.setAttribute('tabindex', active ? '0' : '-1');
      });
    }
    if(tab === 'today') renderToday();
    if(tab === 'safe') renderSafe();
    if(tab === 'published') renderHistory();
    if(tab === 'performance') renderPerformance();
    if(tab === 'more') renderMore();
  }

  function pickCard(p, label='VALIDAT', idx=0){
    const score = Math.round(nr(p.safe_score ?? p.confidence_score, 0));
    const match = p.match || `${p.home_team || 'Gazde'} vs ${p.away_team || 'Oaspeți'}`;
    const league = [p.country, p.league].filter(Boolean).join(' · ') || p.league || 'Ligă indisponibilă';
    const pick = p.recommended_pick || p.market_label || p.market || 'Predicție';
    const status = statusOf(p);
    return `<article class="bp-card" data-event-id="${esc(p.event_id || '')}" data-market="${esc(p.market || '')}">
      <div class="bp-card-head"><div class="bp-badge">✓ ${label}${idx ? ` · #${idx}` : ''}</div><div class="bp-score">Scor ${score}/100</div></div>
      <div class="bp-card-body">
        <div class="bp-match">${esc(match)}</div>
        <div class="bp-meta"><span>${esc(league)}</span><span class="bp-dot"></span><span>${esc(fmtTime(p.kickoff || p.event_date))}</span><span class="bp-dot"></span><span>${esc(status)}</span></div>
        <div class="bp-pick"><div><div class="bp-pick-l">Predicție recomandată</div><div class="bp-pick-v">${esc(pick)}</div></div><div class="bp-odd">${esc(fmtOdds(p.odds))}</div></div>
        <div class="bp-kpis">
          <div class="bp-kpi"><div class="bp-kpi-v blue">${esc(fmtProb(p.probability_pct))}</div><div class="bp-kpi-l">Prob.</div></div>
          <div class="bp-kpi"><div class="bp-kpi-v green">${esc(fmtPct(p.ev_calibrated_pct))}</div><div class="bp-kpi-l">EV cal.</div></div>
          <div class="bp-kpi"><div class="bp-kpi-v gold">${esc(p.quality_grade_v6 || 'A')}</div><div class="bp-kpi-l">Grad</div></div>
        </div>
        <div class="bp-why">${esc(p.explain || 'A trecut filtrele: EV pozitiv, cotă reală, status v6 valid și istoric ROI acceptat.')}</div>
      </div>
      <details class="bp-details"><summary>Detalii filtru</summary><div class="bp-grid2">
        <div class="bp-mini"><div class="bp-mini-l">Market ROI</div><div class="bp-mini-v">${esc(fmtPct(p.market_roi_pct))} · n=${esc(p.market_sample ?? '—')}</div></div>
        <div class="bp-mini"><div class="bp-mini-l">Strategy ROI</div><div class="bp-mini-v">${esc(fmtPct(p.strategy_roi_pct))} · n=${esc(p.strategy_sample ?? '—')}</div></div>
        <div class="bp-mini"><div class="bp-mini-l">Status v6</div><div class="bp-mini-v">${esc(p.v6_status || 'VALID')}</div></div>
        <div class="bp-mini"><div class="bp-mini-l">Publicat</div><div class="bp-mini-v">${esc(fmtTime(p.published_at || p.published_date))}</div></div>
      </div></details>
    </article>`;
  }

  function emptyBox(title, sub, icon='🛡️'){
    return `<div class="bp-empty"><div class="bp-empty-ico">${icon}</div><div class="bp-empty-title">${esc(title)}</div><div class="bp-empty-sub">${esc(sub)}</div></div>`;
  }

  function renderToday(){
    const picks = safePicksToday();
    const st = perfStats(historyRows());
    const eng = engineStatus();
    byId('today-count') && (byId('today-count').textContent = String(picks.length));
    byId('today-top-score') && (byId('today-top-score').textContent = picks.length ? Math.round(nr(picks[0].safe_score ?? picks[0].confidence_score)) : '—');
    byId('today-roi') && (byId('today-roi').textContent = st.roi == null ? '—' : fmtPct(st.roi));
    const pill = byId('today-status-pill');
    if(pill){ pill.textContent = eng.label; pill.className = `bp-pill ${eng.cls}`; }
    const body = byId('today-body');
    if(!body) return;
    body.innerHTML = picks.length ? pickCard(picks[0], 'PICK PRINCIPAL') : emptyBox('Nu există predicții validate azi.', 'Motorul a blocat selecțiile riscante sau nu există meciuri de azi care să treacă toate filtrele.', '🛡️');
  }

  function renderSafe(){
    const picks = safePicksToday();
    byId('safe-count') && (byId('safe-count').textContent = String(picks.length));
    byId('safe-best') && (byId('safe-best').textContent = picks.length ? Math.round(nr(picks[0].safe_score ?? picks[0].confidence_score)) : '—');
    byId('safe-date') && (byId('safe-date').textContent = todayKey().slice(5).replace('-', '.'));
    const pill = byId('safe-status-pill');
    if(pill){ pill.textContent = picks.length ? `${picks.length} VALIDATE` : 'ZERO RISC FORȚAT'; pill.className = 'bp-pill good'; }
    const body = byId('safe-body');
    if(!body) return;
    body.innerHTML = picks.length ? picks.map((p,i)=>pickCard(p,'VALIDAT',i+1)).join('') : emptyBox('Nu există predicții validate azi.', 'Este mai bine să nu apară nimic decât să fie afișate predicții slabe.', '🛡️');
  }

  function currentFilter(){
    const active = document.querySelector('#pub-filters .bp-chip.active');
    return active?.dataset?.filter || 'all';
  }

  function filteredHistory(rows){
    const f = currentFilter();
    if(f === 'pending') return rows.filter(p => statusOf(p)==='PENDING');
    if(f === 'win') return rows.filter(p => statusOf(p)==='WIN');
    if(f === 'lost') return rows.filter(p => ['LOST','LOSS'].includes(statusOf(p)));
    return rows;
  }

  function historyCard(p, idx){
    const st = statusOf(p);
    const cls = st === 'WIN' ? 'good' : ['LOST','LOSS'].includes(st) ? 'bad' : 'warn';
    const profit = profitUnits(p);
    return `<article class="bp-card"><div class="bp-card-head"><div class="bp-badge">JURNAL · #${idx+1}</div><div class="bp-score">${esc(st)}</div></div><div class="bp-card-body">
      <div class="bp-match">${esc(p.match || `${p.home_team || 'Gazde'} vs ${p.away_team || 'Oaspeți'}`)}</div>
      <div class="bp-meta"><span>${esc([p.country,p.league].filter(Boolean).join(' · ') || p.league || 'Ligă')}</span><span class="bp-dot"></span><span>${esc(fmtTime(p.kickoff || p.event_date))}</span></div>
      <div class="bp-pick"><div><div class="bp-pick-l">Predicție publicată</div><div class="bp-pick-v">${esc(p.recommended_pick || p.market || 'Predicție')} · cotă ${esc(fmtOdds(p.odds))}</div></div><div class="bp-odd ${cls === 'bad' ? 'bad' : ''}">${st === 'PENDING' ? '—' : esc(fmtUnits(profit))}</div></div>
      <div class="bp-kpis"><div class="bp-kpi"><div class="bp-kpi-v blue">${esc(fmtProb(p.probability_pct))}</div><div class="bp-kpi-l">Prob.</div></div><div class="bp-kpi"><div class="bp-kpi-v green">${esc(fmtPct(p.ev_calibrated_pct))}</div><div class="bp-kpi-l">EV</div></div><div class="bp-kpi"><div class="bp-kpi-v gold">${esc(Math.round(nr(p.safe_score ?? p.confidence_score)))}</div><div class="bp-kpi-l">Scor</div></div></div>
      <div class="bp-why">Publicat: ${esc(fmtTime(p.published_at || p.published_date))}. Snapshot-ul rămâne fix până la validare.</div>
    </div></article>`;
  }

  function renderHistory(){
    const rows = historyRows();
    const st = perfStats(rows);
    byId('pub-total') && (byId('pub-total').textContent = String(st.total));
    byId('pub-roi') && (byId('pub-roi').textContent = st.roi == null ? '—' : fmtPct(st.roi));
    byId('pub-winrate') && (byId('pub-winrate').textContent = st.winrate == null ? '—' : `${st.winrate.toFixed(0)}%`);
    const pill = byId('pub-status-pill');
    if(pill){ pill.textContent = `${st.total} SNAPSHOT`; pill.className = 'bp-pill blue'; }
    const body = byId('pub-body');
    if(!body) return;
    const visible = filteredHistory(rows);
    body.innerHTML = rows.length ? (visible.length ? visible.map(historyCard).join('') : emptyBox('Nu există rezultate pentru filtrul ales.', 'Schimbă filtrul sau așteaptă validarea predicțiilor pending.', '🔎')) : emptyBox('Istoricul publicat este gol.', 'Va apărea automat după ce Safe Picks Gate publică predicții validate.', '📘');
  }

  function bars(items, metric='roi'){
    if(!items.length) return '<div class="bp-why">Nu există date settled pentru segmentare.</div>';
    const max = Math.max(1, ...items.map(x => Math.abs(metric==='roi' ? (x.roi || 0) : x.profit)));
    return `<div class="bp-bars">${items.map(x => {
      const raw = metric==='roi' ? (x.roi || 0) : x.profit;
      const width = Math.max(4, Math.min(100, Math.abs(raw)/max*100));
      const val = metric==='roi' ? (x.roi == null ? '—' : fmtPct(x.roi)) : fmtUnits(x.profit);
      return `<div class="bp-bar-row"><span>${esc(x.name)}</span><div class="bp-bar-track"><div class="bp-bar-fill ${raw<0?'loss':''}" style="width:${width}%"></div></div><strong>${esc(val)}</strong></div>`;
    }).join('')}</div>`;
  }

  function renderPerformance(){
    const rows = historyRows();
    const st = perfStats(rows);
    byId('perf-published') && (byId('perf-published').textContent = String(st.total));
    byId('perf-settled') && (byId('perf-settled').textContent = String(st.settled));
    byId('perf-pending') && (byId('perf-pending').textContent = String(st.pending));
    const pill = byId('perf-status-pill');
    if(pill){ pill.textContent = st.settled ? `${st.settled} VALIDATE` : 'PENDING'; pill.className = 'bp-pill warn'; }
    const byMarket = groupStats(rows, 'market');
    const byStrategy = groupStats(rows, 'strategy');
    const body = byId('perf-body');
    if(!body) return;
    body.innerHTML = rows.length ? `<div class="bp-grid2">
      <div class="bp-mini"><div class="bp-mini-l">ROI publicat</div><div class="bp-mini-v">${st.roi == null ? '—' : esc(fmtPct(st.roi))}</div></div>
      <div class="bp-mini"><div class="bp-mini-l">Profit</div><div class="bp-mini-v">${esc(fmtUnits(st.profit))}</div></div>
      <div class="bp-mini"><div class="bp-mini-l">Win rate</div><div class="bp-mini-v">${st.winrate == null ? '—' : `${st.winrate.toFixed(0)}%`}</div></div>
      <div class="bp-mini"><div class="bp-mini-l">Pending</div><div class="bp-mini-v">${st.pending}</div></div>
    </div>
    <div class="bp-card"><div class="bp-card-body"><div class="bp-match">Performanță pe market</div>${bars(byMarket)}</div></div>
    <div class="bp-card"><div class="bp-card-body"><div class="bp-match">Performanță pe strategie</div>${bars(byStrategy)}</div></div>` : emptyBox('Nu există performanță publicată încă.', 'Performanța apare după ce predicțiile publicate sunt validate ca WIN/LOST.', '📊');
  }

  function moreItem(tab, title, sub){
    return `<button class="bp-more-item" type="button" data-old-tab="${esc(tab)}"><div><div class="bp-more-title">${esc(title)}</div><div class="bp-more-sub">${esc(sub)}</div></div><div class="bp-more-arrow">›</div></button>`;
  }

  function renderMore(){
    byId('more-modules') && (byId('more-modules').textContent = String(OLD_TABS.length + 2));
    byId('more-primary') && (byId('more-primary').textContent = '5');
    byId('more-mode') && (byId('more-mode').textContent = 'LAB');
    const pill = byId('more-status-pill');
    if(pill){ pill.textContent = 'SECUNDAR'; pill.className = 'bp-pill blue'; }
    const body = byId('more-body');
    if(!body) return;
    body.innerHTML = OLD_TABS.map(x => moreItem(x[0], x[1], x[2])).join('') +
      `<button class="bp-more-item" type="button" data-monitor="1"><div><div class="bp-more-title">Platform Monitor</div><div class="bp-more-sub">Audit intern, scor sănătate, erori și avertismente</div></div><div class="bp-more-arrow">›</div></button>` +
      `<button class="bp-more-item" type="button" data-safe-debug="1"><div><div class="bp-more-title">Debug Safe Gate</div><div class="bp-more-sub">Vezi JSON-urile safe_picks_today și published_safe_picks_today</div></div><div class="bp-more-arrow">›</div></button>`;
  }

  function attachMoreClicks(){
    document.addEventListener('click', e => {
      const old = e.target.closest('[data-old-tab]');
      if(old){
        const tab = old.dataset.oldTab;
        if(originalGo) originalGo(tab);
        else if(window.go) window.go(tab);
        return;
      }
      if(e.target.closest('[data-monitor]')){
        window.location.href = `${location.pathname}?monitor=1`;
        return;
      }
      if(e.target.closest('[data-safe-debug]')){
        window.open('data/safe_picks_today.json?v=' + Date.now(), '_blank');
      }
      const chip = e.target.closest('#pub-filters [data-filter]');
      if(chip){
        byId('pub-filters')?.querySelectorAll('.bp-chip').forEach(x => x.classList.toggle('active', x === chip));
        renderHistory();
      }
    });
  }

  function patchNavigation(){
    if(patchNavigation.done) return;
    patchNavigation.done = true;
    originalGo = typeof window.go === 'function' ? window.go.bind(window) : null;
    window.go = function(tab){
      if(FINAL_TABS.includes(tab)){
        showCustom(tab);
        return;
      }
      if(originalGo) originalGo(tab);
    };
  }

  async function refreshAndRender(tab='today'){
    ensureSections();
    installFinalTabs();
    try{
      await loadAll();
      showCustom(tab);
    }catch(err){
      const sec = byId(`sec-${tab}`) || byId('sec-today');
      if(sec) sec.innerHTML = `<div class="bp-shell"><div class="bp-error">⚠ Nu pot încărca datele curate. Verifică JSON-urile publicate și cache-ul aplicației.</div></div>`;
      console.warn('[BetPredictFinalShell] load failed', err);
    }
  }

  function boot(){
    installStyle();
    ensureSections();
    installFinalTabs();
    patchNavigation();
    attachMoreClicks();
    window.BPFinalShell = { refresh:refreshAndRender, state:STATE, show:showCustom };
    refreshAndRender('today');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
