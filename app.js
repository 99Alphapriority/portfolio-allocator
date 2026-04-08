var STORAGE_TARGETS  = 'pa_targets_v1';
var STORAGE_HOLDINGS = 'pa_holdings_v1';
var STORAGE_INSTALL  = 'pa_install_dismissed';
var STORAGE_LASTSAVE = 'pa_last_save';

var COLORS = [
  '#c8f060','#60c8f0','#f0a060','#a060f0','#f060a0',
  '#60f0a0','#f0e060','#60a0f0','#f08060','#80f060',
  '#c060f0','#60f0c0','#f0c060','#6080f0','#f06080'
];

var parsedHoldings = null;
var targets = [];

// ── Boot ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
  loadTargets();
  loadHoldings();
  showInstallBanner();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function() {});
  }
});

// ── Targets ────────────────────────────────────────────────────────────
function saveTargets() {
  var rows = document.querySelectorAll('#targetsGrid .target-row');
  var data = [];
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    var ticker = inputs[0].value.trim().toUpperCase();
    var pct = inputs[1].value;
    if (ticker) data.push({ ticker: ticker, pct: pct });
  });
  try {
    localStorage.setItem(STORAGE_TARGETS, JSON.stringify(data));
    localStorage.setItem(STORAGE_LASTSAVE, new Date().toISOString());
    updateLastSaved();
  } catch(e) {}
}

function loadTargets() {
  var defaults = [['XEQT','60'],['SVRS','15'],['XQQ','10'],['RKLB','10'],['ASTS','5']];
  try {
    var raw = localStorage.getItem(STORAGE_TARGETS);
    var data = raw ? JSON.parse(raw) : null;
    if (data && data.length > 0) {
      data.forEach(function(d) { addRow(d.ticker, d.pct); });
    } else {
      defaults.forEach(function(d) { addRow(d[0], d[1]); });
    }
  } catch(e) {
    defaults.forEach(function(d) { addRow(d[0], d[1]); });
  }
  updateTotal();
  updateLastSaved();
}

// ── Holdings ───────────────────────────────────────────────────────────
function saveHoldings(holdings, filename) {
  try {
    localStorage.setItem(STORAGE_HOLDINGS, JSON.stringify({
      holdings: holdings, filename: filename, date: new Date().toISOString()
    }));
  } catch(e) {}
}

function loadHoldings() {
  try {
    var raw = localStorage.getItem(STORAGE_HOLDINGS);
    if (!raw) return;
    var obj = JSON.parse(raw);
    if (!obj || !obj.holdings) return;
    parsedHoldings = obj.holdings;
    var age = Math.round((Date.now() - new Date(obj.date)) / 86400000);
    var ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : age + 'd ago';
    document.getElementById('cachedBannerText').textContent =
      'Using saved holdings from ' + obj.filename + ' (' + ageStr + ')';
    document.getElementById('cachedBanner').style.display = 'flex';
    document.getElementById('fileStatus').innerHTML =
      '<span style="color:var(--accent2)">&#8617;</span> Restored: <strong style="color:var(--text)">' + obj.filename + '</strong>';
    tryRender();
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
    var iso = localStorage.getItem(STORAGE_LASTSAVE);
    if (!iso) return;
    var d = new Date(iso);
    document.getElementById('lastSaved').textContent =
      'Saved ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch(e) {}
}

// ── Install banner ─────────────────────────────────────────────────────
function showInstallBanner() {
  var isStandalone = window.navigator.standalone ||
    window.matchMedia('(display-mode: standalone)').matches;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!localStorage.getItem(STORAGE_INSTALL) && isIOS && !isStandalone) {
    document.getElementById('installBanner').style.display = 'block';
  }
}
function dismissInstall() {
  localStorage.setItem(STORAGE_INSTALL, '1');
  document.getElementById('installBanner').style.display = 'none';
}

// ── Target rows ────────────────────────────────────────────────────────
function addRow(ticker, pct) {
  var grid = document.getElementById('targetsGrid');
  var row = document.createElement('div');
  row.className = 'target-row';

  var ti = document.createElement('input');
  ti.type = 'text';
  ti.placeholder = 'Ticker';
  ti.value = ticker || '';
  ti.style.textTransform = 'uppercase';
  ti.addEventListener('input', function() { updateTotal(); saveTargets(); });

  var pi = document.createElement('input');
  pi.type = 'number';
  pi.placeholder = '%';
  pi.min = '0'; pi.max = '100'; pi.step = '0.1';
  pi.value = pct || '';
  pi.addEventListener('input', function() { updateTotal(); saveTargets(); });

  var btn = document.createElement('button');
  btn.className = 'btn-icon';
  btn.textContent = 'x';
  btn.addEventListener('click', function() { row.remove(); updateTotal(); saveTargets(); });

  row.appendChild(ti);
  row.appendChild(pi);
  row.appendChild(btn);
  grid.appendChild(row);
  updateTotal();
}

function updateTotal() {
  var inputs = document.querySelectorAll('#targetsGrid input[type="number"]');
  var sum = 0;
  inputs.forEach(function(i) { sum += parseFloat(i.value) || 0; });
  var badge = document.getElementById('totalBadge');
  badge.innerHTML = 'Total: <span>' + sum.toFixed(1) + '%</span>';
  badge.className = 'total-badge' + (sum > 100.05 ? ' over' : sum > 99.9 ? ' ok' : '');
}

// ── CSV ────────────────────────────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.add('drag-over');
}
function handleDragLeave() {
  document.getElementById('uploadZone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
}
function handleFile(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var holdings = parseCSV(e.target.result);
      var count = Object.keys(holdings).length;
      parsedHoldings = holdings;
      saveHoldings(holdings, file.name);
      document.getElementById('cachedBanner').style.display = 'none';
      document.getElementById('fileStatus').innerHTML =
        '<span style="color:var(--accent)">&#10003;</span> Loaded <strong style="color:var(--text)">' +
        count + ' holdings</strong> from ' + file.name;
      tryRender();
    } catch(err) {
      document.getElementById('fileStatus').innerHTML =
        '<span style="color:var(--danger)">&#10007; ' + err.message + '</span>';
    }
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  var allLines = text.trim().split(/\r?\n/);
  var lines = allLines.filter(function(l, i) {
    if (i === 0) return true;
    var s = l.replace(/"/g, '').trim();
    return s.length > 0 && s.split(',').length > 3;
  });
  if (lines.length < 2) throw new Error('CSV has no data rows');

  var delim = lines[0].indexOf('\t') !== -1 ? '\t' : ',';
  var headers = splitLine(lines[0], delim).map(function(h) {
    return h.replace(/"/g, '').trim().toLowerCase();
  });

  var tickerIdx = -1;
  var tickerCols = ['symbol','ticker','security'];
  for (var i = 0; i < headers.length; i++) {
    if (tickerCols.indexOf(headers[i]) !== -1) { tickerIdx = i; break; }
  }
  if (tickerIdx === -1) {
    for (var i = 0; i < headers.length; i++) {
      for (var j = 0; j < tickerCols.length; j++) {
        if (headers[i].indexOf(tickerCols[j]) !== -1) { tickerIdx = i; break; }
      }
      if (tickerIdx !== -1) break;
    }
  }
  if (tickerIdx === -1) throw new Error('Cannot find ticker/symbol column');

  var valueIdx = headers.indexOf('book value (cad)');
  if (valueIdx === -1) {
    var valueCols = ['market value','current value','value','amount'];
    for (var i = 0; i < headers.length; i++) {
      for (var j = 0; j < valueCols.length; j++) {
        if (headers[i].indexOf(valueCols[j]) !== -1) { valueIdx = i; break; }
      }
      if (valueIdx !== -1) break;
    }
  }

  if (valueIdx === -1) {
    var qtyIdx = -1, priceIdx = -1;
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].indexOf('quant') !== -1 || headers[i].indexOf('shares') !== -1) qtyIdx = i;
      if (headers[i].indexOf('price') !== -1 || headers[i].indexOf('last') !== -1) priceIdx = i;
    }
    if (qtyIdx !== -1 && priceIdx !== -1) {
      var holdings = {};
      for (var i = 1; i < lines.length; i++) {
        var cols = splitLine(lines[i], delim);
        var ticker = (cols[tickerIdx] || '').replace(/"/g,'').trim().toUpperCase();
        var qty = parseFloat((cols[qtyIdx] || '').replace(/[",\$]/g,'')) || 0;
        var price = parseFloat((cols[priceIdx] || '').replace(/[",\$]/g,'')) || 0;
        if (ticker && qty && price) holdings[ticker] = (holdings[ticker] || 0) + qty * price;
      }
      return holdings;
    }
    throw new Error('Cannot find value column');
  }

  var holdings = {};
  for (var i = 1; i < lines.length; i++) {
    var cols = splitLine(lines[i], delim);
    if (cols.length < 3) continue;
    var ticker = (cols[tickerIdx] || '').replace(/"/g,'').trim().toUpperCase();
    var val = parseFloat((cols[valueIdx] || '').replace(/[",\$\s]/g,''));
    if (ticker && !isNaN(val) && val > 0) {
      holdings[ticker] = (holdings[ticker] || 0) + val;
    }
  }
  if (Object.keys(holdings).length === 0) throw new Error('No valid rows found');
  return holdings;
}

function splitLine(line, delim) {
  var result = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === delim && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// ── Analyze ────────────────────────────────────────────────────────────
function analyze() {
  var rows = document.querySelectorAll('#targetsGrid .target-row');
  targets = [];
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    var ticker = inputs[0].value.trim().toUpperCase();
    var pct = parseFloat(inputs[1].value);
    if (ticker && !isNaN(pct) && pct > 0) targets.push({ ticker: ticker, pct: pct });
  });
  if (!targets.length) { alert('Add at least one target.'); return; }
  saveTargets();
  tryRender();
}

function tryRender() {
  if (parsedHoldings && targets.length > 0) renderResults();
}

// ── Render results ─────────────────────────────────────────────────────
function renderResults() {
  var h = parsedHoldings;
  var total = 0;
  var keys = Object.keys(h);
  for (var i = 0; i < keys.length; i++) { total += h[keys[i]]; }

  document.getElementById('statTotal').textContent = fmtCurrency(total);
  document.getElementById('statPositions').textContent = keys.length;

  var maxDrift = 0;
  for (var i = 0; i < targets.length; i++) {
    var d = Math.abs(((h[targets[i].ticker] || 0) / total) * 100 - targets[i].pct);
    if (d > maxDrift) maxDrift = d;
  }
  document.getElementById('statDrift').textContent = maxDrift.toFixed(1) + '%';

  var targetTickers = {};
  for (var i = 0; i < targets.length; i++) { targetTickers[targets[i].ticker] = true; }

  var maxPct = 0.01;
  for (var i = 0; i < targets.length; i++) {
    var a = ((h[targets[i].ticker] || 0) / total) * 100;
    if (a > maxPct) maxPct = a;
    if (targets[i].pct > maxPct) maxPct = targets[i].pct;
  }

  // Build position cards
  var container = document.getElementById('allocBody');
  container.innerHTML = '';

  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    var val = h[t.ticker] || 0;
    var actual = (val / total) * 100;
    var targetVal = (t.pct / 100) * total;
    var drift = actual - t.pct;
    var color = COLORS[i % COLORS.length];
    var absD = Math.abs(drift);
    var action = absD < 0.5 ? 'Hold' : drift < 0 ? 'Buy' : 'Sell';
    var badgeCls = absD < 0.5 ? 'badge-hold' : drift < 0 ? 'badge-buy' : 'badge-sell';
    var driftCls = absD < 0.5 ? 'drift-neutral' : drift > 0 ? 'drift-pos' : 'drift-neg';
    var sign = drift > 0 ? '+' : '';
    var wActual = (actual / maxPct) * 100;
    var wTarget = (t.pct / maxPct) * 100;

    var card = document.createElement('div');
    card.className = 'pos-card';
    card.style.borderLeftColor = color;

    // Row 1: ticker+value | drift | badge
    var row1 = document.createElement('div');
    row1.className = 'pos-row1';

    var leftEl = document.createElement('div');

    var tickerEl = document.createElement('div');
    tickerEl.className = 'pos-ticker';
    tickerEl.textContent = t.ticker;

    var valueEl = document.createElement('div');
    valueEl.className = 'pos-value-amt';
    valueEl.textContent = fmtCurrency(val) + ' · target ' + fmtCurrency(targetVal);

    leftEl.appendChild(tickerEl);
    leftEl.appendChild(valueEl);

    var driftEl = document.createElement('div');
    driftEl.className = 'pos-drift ' + driftCls;
    driftEl.textContent = sign + drift.toFixed(1) + '%';

    var badgeEl = document.createElement('span');
    badgeEl.className = 'action-badge ' + badgeCls;
    badgeEl.textContent = action;

    row1.appendChild(leftEl);
    row1.appendChild(driftEl);
    row1.appendChild(badgeEl);

    // Actual bar row
    var row2 = document.createElement('div');
    row2.className = 'pos-bar-row';

    var lbl2 = document.createElement('div');
    lbl2.className = 'pos-bar-label';
    lbl2.textContent = 'Actual';

    var track2 = document.createElement('div');
    track2.className = 'pos-bar-track';
    var fill2 = document.createElement('div');
    fill2.className = 'pos-bar-fill';
    fill2.style.width = wActual + '%';
    fill2.style.background = color;
    fill2.style.opacity = '0.85';
    track2.appendChild(fill2);

    var pct2 = document.createElement('div');
    pct2.className = 'pos-bar-pct';
    pct2.textContent = actual.toFixed(1) + '%';

    row2.appendChild(lbl2);
    row2.appendChild(track2);
    row2.appendChild(pct2);

    // Target bar row
    var row3 = document.createElement('div');
    row3.className = 'pos-bar-row';

    var lbl3 = document.createElement('div');
    lbl3.className = 'pos-bar-label';
    lbl3.textContent = 'Target';

    var track3 = document.createElement('div');
    track3.className = 'pos-bar-track';
    var fill3 = document.createElement('div');
    fill3.className = 'pos-bar-fill';
    fill3.style.width = wTarget + '%';
    fill3.style.background = color;
    fill3.style.opacity = '0.25';
    track3.appendChild(fill3);

    var pct3 = document.createElement('div');
    pct3.className = 'pos-bar-pct';
    pct3.style.opacity = '0.5';
    pct3.textContent = t.pct.toFixed(1) + '%';

    row3.appendChild(lbl3);
    row3.appendChild(track3);
    row3.appendChild(pct3);

    card.appendChild(row1);
    card.appendChild(row2);
    card.appendChild(row3);
    container.appendChild(card);
  }

  // Unmatched
  var unmatched = [];
  for (var k in h) {
    if (!targetTickers[k]) unmatched.push(k);
  }
  var us = document.getElementById('unmatchedSection');
  if (unmatched.length > 0) {
    us.style.display = 'block';
    var tags = '';
    for (var i = 0; i < unmatched.length; i++) {
      tags += '<span class="tag">' + unmatched[i] + ' ' + ((h[unmatched[i]] / total) * 100).toFixed(1) + '%</span>';
    }
    document.getElementById('unmatchedTags').innerHTML = tags;
  } else {
    us.style.display = 'none';
  }

  // Build chart data
  var chartData = [];
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    chartData.push({
      ticker: t.ticker,
      actual: ((h[t.ticker] || 0) / total) * 100,
      target: t.pct,
      value:  h[t.ticker] || 0,
      color:  COLORS[i % COLORS.length]
    });
  }
  renderChart(chartData, total);

  document.getElementById('results').style.display = 'block';
  setTimeout(function() {
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ── Bullet chart ───────────────────────────────────────────────────────
function renderChart(data, total) {
  var container = document.getElementById('chartContainer');
  if (!data.length) return;

  var W       = container.clientWidth || 300;
  var PAD_L   = 50;
  var PAD_R   = 48;
  var PAD_T   = 10;
  var PAD_B   = 10;
  var ROW_H   = 48;
  var GAP     = 12;
  var BAR_H   = 10;
  var TRACK_H = 24;

  var maxVal = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].actual > maxVal) maxVal = data[i].actual;
    if (data[i].target > maxVal) maxVal = data[i].target;
  }
  maxVal = Math.ceil(maxVal / 5) * 5 + 8;

  var barArea = W - PAD_L - PAD_R;
  var totalH  = PAD_T + data.length * (ROW_H + GAP) - GAP + PAD_B;

  var s = '';
  s += '<svg width="100%" height="' + totalH + '" viewBox="0 0 ' + W + ' ' + totalH + '"';
  s += ' style="overflow:visible;display:block;font-family:DM Mono,monospace">';

  for (var i = 0; i < data.length; i++) {
    var d       = data[i];
    var cy      = PAD_T + i * (ROW_H + GAP) + ROW_H / 2;
    var wA      = (d.actual / maxVal) * barArea;
    var wT      = (d.target / maxVal) * barArea;
    var drift   = d.actual - d.target;
    var dc      = Math.abs(drift) < 0.5 ? '#6b7080' : drift > 0 ? '#c8f060' : '#f06060';
    var delay   = i * 0.08;
    var sign    = drift > 0 ? '+' : '';
    var tDol    = fmtCurrencyShort((d.target / 100) * total);
    var aDol    = fmtCurrencyShort(d.value);

    // Ticker
    s += '<text x="' + (PAD_L - 7) + '" y="' + (cy - 8) + '"';
    s += ' text-anchor="end" dominant-baseline="middle"';
    s += ' fill="#e8eaf0" font-size="12" font-weight="500">' + d.ticker + '</text>';

    // Dollar amounts
    s += '<text x="' + (PAD_L - 7) + '" y="' + (cy + 8) + '"';
    s += ' text-anchor="end" dominant-baseline="middle"';
    s += ' fill="#6b7080" font-size="9">' + aDol + ' &rarr; ' + tDol + '</text>';

    // Background track
    s += '<rect x="' + PAD_L + '" y="' + (cy - TRACK_H / 2) + '"';
    s += ' width="' + barArea + '" height="' + TRACK_H + '" rx="5" fill="#1c1f26"/>';

    // Target zone shading
    var zoneHalf = (5 / maxVal) * barArea;
    var zoneX    = Math.max(PAD_L, PAD_L + wT - zoneHalf);
    var zoneW    = Math.min(zoneHalf * 2, barArea);
    s += '<rect x="' + zoneX + '" y="' + (cy - TRACK_H / 2) + '"';
    s += ' width="' + zoneW + '" height="' + TRACK_H + '" rx="3"';
    s += ' fill="' + d.color + '" opacity="0.12"/>';

    // Actual bar (animated)
    s += '<rect x="' + PAD_L + '" y="' + (cy - BAR_H / 2) + '"';
    s += ' width="' + wA + '" height="' + BAR_H + '" rx="3"';
    s += ' fill="' + d.color + '" opacity="0.9">';
    s += '<animate attributeName="width" from="0" to="' + wA + '"';
    s += ' dur="0.5s" begin="' + delay + 's" fill="freeze"';
    s += ' calcMode="spline" keySplines="0.4 0 0.2 1"/>';
    s += '</rect>';

    // Target tick
    s += '<line x1="' + (PAD_L + wT) + '" y1="' + (cy - TRACK_H / 2 - 3) + '"';
    s += ' x2="' + (PAD_L + wT) + '" y2="' + (cy + TRACK_H / 2 + 3) + '"';
    s += ' stroke="' + d.color + '" stroke-width="2.5" opacity="0.7"/>';

    // Actual % label
    if (wA > 36) {
      s += '<text x="' + (PAD_L + wA - 5) + '" y="' + cy + '"';
      s += ' text-anchor="end" dominant-baseline="middle"';
      s += ' fill="rgba(0,0,0,0.65)" font-size="9">' + d.actual.toFixed(1) + '%</text>';
    } else {
      s += '<text x="' + (PAD_L + wA + 5) + '" y="' + cy + '"';
      s += ' dominant-baseline="middle"';
      s += ' fill="' + d.color + '" font-size="9">' + d.actual.toFixed(1) + '%</text>';
    }

    // Target % above tick
    s += '<text x="' + (PAD_L + wT) + '" y="' + (cy - TRACK_H / 2 - 6) + '"';
    s += ' text-anchor="middle"';
    s += ' fill="' + d.color + '" font-size="9" opacity="0.6">' + d.target.toFixed(1) + '%</text>';

    // Drift
    s += '<text x="' + (W - 4) + '" y="' + cy + '"';
    s += ' text-anchor="end" dominant-baseline="middle"';
    s += ' fill="' + dc + '" font-size="11" font-weight="500">' + sign + drift.toFixed(1) + '%</text>';
  }

  s += '</svg>';

  // Legend
  s += '<div style="display:flex;gap:20px;margin-top:12px;justify-content:center">';
  s += '<div style="display:flex;align-items:center;gap:7px;font-size:11px;color:#6b7080;font-family:\'DM Mono\',monospace">';
  s += '<div style="width:14px;height:8px;border-radius:2px;background:#c8f060;opacity:0.9"></div>Actual</div>';
  s += '<div style="display:flex;align-items:center;gap:7px;font-size:11px;color:#6b7080;font-family:\'DM Mono\',monospace">';
  s += '<div style="width:3px;height:16px;border-radius:1px;background:#c8f060;opacity:0.7"></div>Target</div>';
  s += '</div>';

  container.innerHTML = s;
}

// ── Tabs ───────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

// ── Helpers ────────────────────────────────────────────────────────────
function fmtCurrency(n) {
  return '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCurrencyShort(n) {
  return '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
