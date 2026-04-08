// ── Constants ─────────────────────────────────────────────────────────
const STORAGE_TARGETS  = 'pa_targets_v1';
const STORAGE_HOLDINGS = 'pa_holdings_v1';
const STORAGE_INSTALL  = 'pa_install_dismissed';
const STORAGE_LASTSAVE = 'pa_last_save';

const COLORS = [
  '#c8f060','#60c8f0','#f0a060','#a060f0','#f060a0',
  '#60f0a0','#f0e060','#60a0f0','#f08060','#80f060',
  '#c060f0','#60f0c0','#f0c060','#6080f0','#f06080'
];

// ── State ─────────────────────────────────────────────────────────────
let parsedHoldings = null;
let targets = [];

// ── Init ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadTargets();
  loadHoldings();
  showInstallBanner();
  registerSW();
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ── Persistence ───────────────────────────────────────────────────────
function saveTargets() {
  const rows = document.querySelectorAll('#targetsGrid .target-row');
  const data = [];
  rows.forEach(row => {
    const [t, p] = row.querySelectorAll('input');
    if (t.value.trim()) data.push({ ticker: t.value.trim().toUpperCase(), pct: p.value });
  });
  try {
    localStorage.setItem(STORAGE_TARGETS, JSON.stringify(data));
    localStorage.setItem(STORAGE_LASTSAVE, new Date().toISOString());
    updateLastSaved();
  } catch(e) {}
}

function loadTargets() {
  try {
    const raw = localStorage.getItem(STORAGE_TARGETS);
    const data = raw ? JSON.parse(raw) : null;
    if (data && data.length > 0) {
      data.forEach(d => addRow(d.ticker, d.pct));
    } else {
      // defaults
      [['VFV','40'],['XIC','30'],['ZAG','20'],['CASH','10']].forEach(([t,p]) => addRow(t,p));
    }
  } catch(e) {
    [['VFV','40'],['XIC','30'],['ZAG','20'],['CASH','10']].forEach(([t,p]) => addRow(t,p));
  }
  updateTotal();
  updateLastSaved();
}

function saveHoldings(holdings, filename) {
  try {
    localStorage.setItem(STORAGE_HOLDINGS, JSON.stringify({ holdings, filename, date: new Date().toISOString() }));
  } catch(e) {}
}

function loadHoldings() {
  try {
    const raw = localStorage.getItem(STORAGE_HOLDINGS);
    if (!raw) return;
    const { holdings, filename, date } = JSON.parse(raw);
    if (!holdings) return;
    parsedHoldings = holdings;
    const d = new Date(date);
    const age = Math.round((Date.now() - d) / 86400000);
    const ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age}d ago`;
    const banner = document.getElementById('cachedBanner');
    const bannerText = document.getElementById('cachedBannerText');
    bannerText.textContent = `Using saved holdings from ${filename} (${ageStr})`;
    banner.style.display = 'flex';
    document.getElementById('fileStatus').innerHTML =
      `<span style="color:var(--accent2)">↩</span> Restored from last session: <strong style="color:var(--text)">${filename}</strong>`;
  } catch(e) {}
}

function clearHoldings() {
  localStorage.removeItem(STORAGE_HOLDINGS);
  parsedHoldings = null;
  document.getElementById('cachedBanner').style.display = 'none';
  document.getElementById('fileStatus').textContent = '';
  document.getElementById('results').style.display = 'none';
}

function updateLastSaved() {
  try {
    const iso = localStorage.getItem(STORAGE_LASTSAVE);
    if (!iso) return;
    const d = new Date(iso);
    document.getElementById('lastSaved').textContent =
      'Saved ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch(e) {}
}

// ── Install banner ────────────────────────────────────────────────────
function showInstallBanner() {
  const dismissed = localStorage.getItem(STORAGE_INSTALL);
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!dismissed && isIOS && !isStandalone) {
    document.getElementById('installBanner').style.display = 'block';
  }
}
function dismissInstall() {
  localStorage.setItem(STORAGE_INSTALL, '1');
  document.getElementById('installBanner').style.display = 'none';
}

// ── Target rows ───────────────────────────────────────────────────────
function addRow(ticker = '', pct = '') {
  const grid = document.getElementById('targetsGrid');
  const row = document.createElement('div');
  row.className = 'target-row';
  row.innerHTML = `
    <input type="text" placeholder="Ticker" value="${ticker}"
      oninput="updateTotal();saveTargets()"
      style="text-transform:uppercase" />
    <input type="number" placeholder="%" min="0" max="100" step="0.1" value="${pct}"
      oninput="updateTotal();saveTargets()" />
    <button class="btn-icon" onclick="removeRow(this)">×</button>
  `;
  grid.appendChild(row);
  updateTotal();
}

function removeRow(btn) {
  btn.closest('.target-row').remove();
  updateTotal();
  saveTargets();
}

function updateTotal() {
  const inputs = document.querySelectorAll('#targetsGrid input[type="number"]');
  let sum = 0;
  inputs.forEach(i => { sum += parseFloat(i.value) || 0; });
  const badge = document.getElementById('totalBadge');
  badge.innerHTML = `Total: <span>${sum.toFixed(1)}%</span>`;
  badge.className = 'total-badge ' + (sum > 100.05 ? 'over' : sum > 99.9 ? 'ok' : '');
}

// ── CSV ───────────────────────────────────────────────────────────────
function handleDragOver(e) { e.preventDefault(); document.getElementById('uploadZone').classList.add('drag-over'); }
function handleDragLeave() { document.getElementById('uploadZone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const holdings = parseCSV(e.target.result);
      const count = Object.keys(holdings).length;
      parsedHoldings = holdings;
      saveHoldings(holdings, file.name);
      document.getElementById('fileStatus').innerHTML =
        `<span style="color:var(--accent)">✓</span> Loaded <strong style="color:var(--text)">${count} holdings</strong> from ${file.name}`;
      document.getElementById('cachedBanner').style.display = 'none';
      tryRender();
    } catch(err) {
      document.getElementById('fileStatus').innerHTML =
        `<span style="color:var(--danger)">✗ ${err.message}</span>`;
    }
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV has no data rows');
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map(h => h.replace(/"/g,'').trim().toLowerCase());

  const tickerCols = ['symbol','ticker','security','name','stock'];
  const tickerIdx = headers.findIndex(h => tickerCols.some(t => h.includes(t)));
  if (tickerIdx === -1) throw new Error('Cannot find ticker/symbol column');

  const valueCols = ['market value','current value','value','amount','total value','market_value'];
  let valueIdx = headers.findIndex(h => valueCols.some(v => h.includes(v)));

  const holdings = {};

  if (valueIdx === -1) {
    const qtyIdx = headers.findIndex(h => h.includes('quant') || h.includes('shares'));
    const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('last'));
    if (qtyIdx !== -1 && priceIdx !== -1) {
      for (let i = 1; i < lines.length; i++) {
        const cols = splitLine(lines[i], delim);
        const ticker = cols[tickerIdx]?.replace(/"/g,'').trim().toUpperCase();
        const qty = parseFloat(cols[qtyIdx]?.replace(/[",\$]/g,'')) || 0;
        const price = parseFloat(cols[priceIdx]?.replace(/[",\$]/g,'')) || 0;
        if (ticker && qty && price) holdings[ticker] = (holdings[ticker]||0) + qty*price;
      }
      return holdings;
    }
    throw new Error('Cannot find a market value column');
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delim);
    const ticker = cols[tickerIdx]?.replace(/"/g,'').trim().toUpperCase();
    const val = parseFloat(cols[valueIdx]?.replace(/[",\$\s]/g,''));
    if (ticker && !isNaN(val) && val > 0) holdings[ticker] = (holdings[ticker]||0) + val;
  }
  if (Object.keys(holdings).length === 0) throw new Error('No valid rows found');
  return holdings;
}

function splitLine(line, delim) {
  const result = []; let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === delim && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ── Analyze ───────────────────────────────────────────────────────────
function analyze() {
  const rows = document.querySelectorAll('#targetsGrid .target-row');
  targets = [];
  rows.forEach(row => {
    const [ti, pi] = row.querySelectorAll('input');
    const ticker = ti.value.trim().toUpperCase();
    const pct = parseFloat(pi.value);
    if (ticker && !isNaN(pct) && pct > 0) targets.push({ ticker, pct });
  });
  if (!targets.length) { alert('Add at least one target.'); return; }
  saveTargets();
  tryRender();
}

function tryRender() {
  if (!parsedHoldings || !targets.length) return;
  renderResults();
}

// ── Render ────────────────────────────────────────────────────────────
function renderResults() {
  const h = parsedHoldings;
  const total = Object.values(h).reduce((a,b) => a+b, 0);

  document.getElementById('statTotal').textContent = fmtCurrency(total);
  document.getElementById('statPositions').textContent = Object.keys(h).length;

  const maxDrift = targets.reduce((mx,t) => {
    const actual = ((h[t.ticker]||0)/total)*100;
    return Math.max(mx, Math.abs(actual - t.pct));
  }, 0);
  document.getElementById('statDrift').textContent = maxDrift.toFixed(1)+'%';

  const tbody = document.getElementById('allocBody');
  tbody.innerHTML = '';
  const targetTickers = new Set(targets.map(t => t.ticker));
  const maxActual = Math.max(...targets.map(t => ((h[t.ticker]||0)/total)*100), 0.01);
  const maxTarget = Math.max(...targets.map(t => t.pct));

  targets.forEach((t, i) => {
    const val = h[t.ticker] || 0;
    const actual = (val/total)*100;
    const drift = actual - t.pct;
    const color = COLORS[i % COLORS.length];
    const barA = Math.min((actual/maxActual)*85, 100);
    const barT = Math.min((t.pct/maxTarget)*85, 100);
    const abs = Math.abs(drift);
    const action = abs < 0.5 ? 'Hold' : drift < 0 ? 'Buy' : 'Sell';
    const badgeCls = abs < 0.5 ? 'badge-hold' : drift < 0 ? 'badge-buy' : 'badge-sell';
    const driftCls = abs < 0.5 ? 'drift-neutral' : drift > 0 ? 'drift-pos' : 'drift-neg';
    const sign = drift > 0 ? '+' : '';

    tbody.innerHTML += `
      <tr>
        <td><div class="ticker">${t.ticker}</div></td>
        <td>${fmtCurrency(val)}</td>
        <td>${actual.toFixed(1)}%</td>
        <td>${t.pct.toFixed(1)}%</td>
        <td class="drift-cell">
          <div class="bar-wrap">
            <div class="bar-track">
              <div class="bar-target" style="left:${barT}%"></div>
              <div class="bar-actual" style="width:${barA}%;background:${color}"></div>
            </div>
            <div class="drift-label ${driftCls}">${sign}${drift.toFixed(1)}%</div>
          </div>
        </td>
        <td><span class="action-badge ${badgeCls}">${action}</span></td>
      </tr>`;
  });

  const unmatched = Object.keys(h).filter(k => !targetTickers.has(k));
  const us = document.getElementById('unmatchedSection');
  if (unmatched.length > 0) {
    us.style.display = 'block';
    document.getElementById('unmatchedTags').innerHTML =
      unmatched.map(k => `<span class="tag">${k} ${((h[k]/total)*100).toFixed(1)}%</span>`).join('');
  } else { us.style.display = 'none'; }

  renderDonut('donutActual','legendActual',
    targets.map((t,i) => ({ label:t.ticker, value:((h[t.ticker]||0)/total)*100, color:COLORS[i%COLORS.length] }))
      .concat(Object.keys(h).filter(k=>!targetTickers.has(k)).map(k=>({ label:k, value:(h[k]/total)*100, color:'#3a3d45' })))
  );
  renderDonut('donutTarget','legendTarget',
    targets.map((t,i) => ({ label:t.ticker, value:t.pct, color:COLORS[i%COLORS.length] }))
  );

  document.getElementById('results').style.display = 'block';
  setTimeout(() => document.getElementById('results').scrollIntoView({ behavior:'smooth', block:'start' }), 100);
}

function renderDonut(svgId, legendId, slices) {
  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);
  const cx=80, cy=80, r=58, stroke=24, circ=2*Math.PI*r;
  svg.innerHTML = ''; legend.innerHTML = '';
  const total = slices.reduce((s,x) => s+x.value, 0);
  if (!total) return;
  let offset = 0;
  slices.forEach(s => {
    const frac = s.value/total;
    const dashLen = frac*circ;
    const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r);
    circle.setAttribute('fill','none'); circle.setAttribute('stroke', s.color);
    circle.setAttribute('stroke-width', stroke);
    circle.setAttribute('stroke-dasharray', `${dashLen} ${circ-dashLen}`);
    circle.setAttribute('stroke-dashoffset', circ/4 - offset*circ);
    svg.appendChild(circle);
    offset += frac;
    legend.innerHTML += `
      <div class="legend-item">
        <div class="legend-dot" style="background:${s.color}"></div>
        <div class="legend-name">${s.label}</div>
        <div class="legend-val">${s.value.toFixed(1)}%</div>
      </div>`;
  });
}

function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
}

function fmtCurrency(n) {
  if (n >= 1e6) return '$'+(n/1e6).toFixed(2)+'M';
  if (n >= 1000) return '$'+(n/1000).toFixed(1)+'K';
  return '$'+n.toFixed(2);
}
