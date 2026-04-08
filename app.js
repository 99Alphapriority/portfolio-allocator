var STORAGE_TARGETS  = 'pa_targets_v1';
var STORAGE_HOLDINGS = 'pa_holdings_v1';
var STORAGE_INSTALL  = 'pa_install_dismissed';
var STORAGE_LASTSAVE = 'pa_last_save';

var COLORS = [
  '#c8f060','#60c8f0','#f0a060','#a060f0','#f060a0',
  '#60f0a0','#f0e060','#60a0f0','#f08060','#80f060'
];

var parsedHoldings = null;
var targets = [];
var portfolioTotal = 0;

// ── Boot ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
  loadTargets();
  loadHoldings();
  showInstallBanner();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function() {});
  }
});

// ── localStorage helpers ───────────────────────────────────────────────
function saveTargets() {
  var rows = document.querySelectorAll('#targetsGrid .target-row');
  var data = [];
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    var ticker = inputs[0].value.trim().toUpperCase();
    var pct    = inputs[1].value;
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
    var raw  = localStorage.getItem(STORAGE_TARGETS);
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

function saveHoldings(holdings, filename) {
  try {
    localStorage.setItem(STORAGE_HOLDINGS, JSON.stringify({
      holdings: holdings,
      filename: filename,
      date: new Date().toISOString()
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
    var age    = Math.round((Date.now() - new Date(obj.date)) / 86400000);
    var ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : age + 'd ago';
    document.getElementById('cachedBannerText').textContent =
      'Saved holdings from ' + obj.filename + ' (' + ageStr + ')';
    document.getElementById('cachedBanner').style.display = 'flex';
    document.getElementById('fileStatus').innerHTML =
      '<span style="color:var(--accent2)">Restored:</span> ' + obj.filename;
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
  var row  = document.createElement('div');
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
  btn.addEventListener('click', function() {
    row.remove();
    updateTotal();
    saveTargets();
  });

  row.appendChild(ti);
  row.appendChild(pi);
  row.appendChild(btn);
  grid.appendChild(row);
  updateTotal();
}

function updateTotal() {
  var inputs = document.querySelectorAll('#targetsGrid input[type="number"]');
  var sum = 0;
  inputs.forEach(function(inp) { sum += parseFloat(inp.value) || 0; });
  var badge = document.getElementById('totalBadge');
  badge.innerHTML = 'Total: <span>' + sum.toFixed(1) + '%</span>';
  badge.className = 'total-badge' +
    (sum > 100.05 ? ' over' : sum > 99.9 ? ' ok' : '');
}

// ── CSV upload ─────────────────────────────────────────────────────────
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
  reader.onload = function(evt) {
    try {
      var holdings = parseCSV(evt.target.result);
      var count    = Object.keys(holdings).length;
      parsedHoldings = holdings;
      saveHoldings(holdings, file.name);
      document.getElementById('cachedBanner').style.display = 'none';
      document.getElementById('fileStatus').innerHTML =
        '<span style="color:var(--accent)">OK</span> Loaded ' +
        '<strong style="color:var(--text)">' + count + ' holdings</strong>' +
        ' from ' + file.name;
      tryRender();
    } catch(err) {
      document.getElementById('fileStatus').innerHTML =
        '<span style="color:var(--danger)">Error: ' + err.message + '</span>';
    }
  };
  reader.readAsText(file);
}

// ── CSV parser — handles Wealthsimple format ───────────────────────────
function parseCSV(text) {
  // Remove BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  var allLines = text.trim().split(/\r?\n/);

  // Filter out footer lines (Wealthsimple adds "As of..." at the bottom)
  var lines = [];
  for (var i = 0; i < allLines.length; i++) {
    var clean = allLines[i].replace(/"/g, '').trim();
    if (i === 0) { lines.push(allLines[i]); continue; }
    if (clean.length === 0) continue;
    // Skip lines that look like metadata (fewer than 4 commas)
    if (clean.split(',').length < 4) continue;
    lines.push(allLines[i]);
  }

  if (lines.length < 2) throw new Error('CSV has no data rows');

  var delim   = lines[0].indexOf('\t') !== -1 ? '\t' : ',';
  var headers = splitCSVLine(lines[0], delim).map(function(h) {
    return h.replace(/"/g, '').trim().toLowerCase();
  });

  // ── Find ticker column ──
  var tickerIdx = -1;
  var tickerNames = ['symbol', 'ticker', 'security'];
  // Exact match first
  for (var i = 0; i < headers.length; i++) {
    if (tickerNames.indexOf(headers[i]) !== -1) { tickerIdx = i; break; }
  }
  // Partial match fallback
  if (tickerIdx === -1) {
    for (var i = 0; i < headers.length; i++) {
      for (var j = 0; j < tickerNames.length; j++) {
        if (headers[i].indexOf(tickerNames[j]) !== -1) { tickerIdx = i; break; }
      }
      if (tickerIdx !== -1) break;
    }
  }
  if (tickerIdx === -1) throw new Error('Cannot find ticker column. Headers: ' + headers.join(', '));

  // ── Find value column ──
  // Wealthsimple: prefer "book value (cad)" for consistent CAD currency
  var valueIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === 'book value (cad)') { valueIdx = i; break; }
  }
  // Fallback: any column containing "market value" but not "currency"
  if (valueIdx === -1) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].indexOf('market value') !== -1 &&
          headers[i].indexOf('currency') === -1) {
        valueIdx = i; break;
      }
    }
  }
  // Fallback: generic value columns
  if (valueIdx === -1) {
    var valueFallbacks = ['current value', 'value', 'amount', 'total'];
    for (var i = 0; i < headers.length; i++) {
      for (var j = 0; j < valueFallbacks.length; j++) {
        if (headers[i].indexOf(valueFallbacks[j]) !== -1 &&
            headers[i].indexOf('currency') === -1) {
          valueIdx = i; break;
        }
      }
      if (valueIdx !== -1) break;
    }
  }
  // Last resort: quantity x price
  if (valueIdx === -1) {
    var qtyIdx = -1, priceIdx = -1;
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].indexOf('quant') !== -1 || headers[i].indexOf('shares') !== -1) qtyIdx = i;
      if (headers[i].indexOf('market price') !== -1) priceIdx = i;
    }
    if (qtyIdx !== -1 && priceIdx !== -1) {
      var h = {};
      for (var i = 1; i < lines.length; i++) {
        var cols   = splitCSVLine(lines[i], delim);
        var ticker = cleanCell(cols[tickerIdx]).toUpperCase();
        var qty    = parseNum(cols[qtyIdx]);
        var price  = parseNum(cols[priceIdx]);
        if (ticker && qty > 0 && price > 0) {
          h[ticker] = (h[ticker] || 0) + qty * price;
        }
      }
      if (Object.keys(h).length > 0) return h;
    }
    throw new Error('Cannot find value column. Headers found: ' + headers.join(', '));
  }

  // ── Parse rows ──
  var holdings = {};
  for (var i = 1; i < lines.length; i++) {
    var cols   = splitCSVLine(lines[i], delim);
    if (cols.length < 3) continue;
    var ticker = cleanCell(cols[tickerIdx]).toUpperCase();
    var val    = parseNum(cols[valueIdx]);
    if (ticker && val > 0) {
      holdings[ticker] = (holdings[ticker] || 0) + val;
    }
  }

  if (Object.keys(holdings).length === 0) {
    throw new Error('No valid rows found. Ticker col: ' + tickerIdx + ', Value col: ' + valueIdx);
  }
  return holdings;
}

function splitCSVLine(line, delim) {
  var result = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === delim && !inQ) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function cleanCell(s) {
  return (s || '').replace(/"/g, '').trim();
}

function parseNum(s) {
  return parseFloat((s || '').replace(/[",\$\s]/g, '')) || 0;
}

// ── Analyze button ─────────────────────────────────────────────────────
function analyze() {
  var rows = document.querySelectorAll('#targetsGrid .target-row');
  targets = [];
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    var ticker = inputs[0].value.trim().toUpperCase();
    var pct    = parseFloat(inputs[1].value);
    if (ticker && !isNaN(pct) && pct > 0) {
      targets.push({ ticker: ticker, pct: pct });
    }
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

  // Calculate total
  portfolioTotal = 0;
  var hKeys = Object.keys(h);
  for (var i = 0; i < hKeys.length; i++) portfolioTotal += h[hKeys[i]];

  // Summary stats
  document.getElementById('statTotal').textContent     = fmtCurrency(portfolioTotal);
  document.getElementById('statPositions').textContent = hKeys.length;

  var maxDrift = 0;
  for (var i = 0; i < targets.length; i++) {
    var d = Math.abs(((h[targets[i].ticker] || 0) / portfolioTotal) * 100 - targets[i].pct);
    if (d > maxDrift) maxDrift = d;
  }
  document.getElementById('statDrift').textContent = maxDrift.toFixed(1) + '%';

  // Track which tickers are in targets
  var targetMap = {};
  for (var i = 0; i < targets.length; i++) targetMap[targets[i].ticker] = true;

  // Max pct for bar scaling
  var maxPct = 0.01;
  for (var i = 0; i < targets.length; i++) {
    var a = ((h[targets[i].ticker] || 0) / portfolioTotal) * 100;
    if (a > maxPct) maxPct = a;
    if (targets[i].pct > maxPct) maxPct = targets[i].pct;
  }

  // Build position cards
  var container = document.getElementById('allocBody');
  container.innerHTML = '';

  for (var i = 0; i < targets.length; i++) {
    var t         = targets[i];
    var val       = h[t.ticker] || 0;
    var actual    = (val / portfolioTotal) * 100;
    var targetVal = (t.pct / 100) * portfolioTotal;
    var drift     = actual - t.pct;
    var color     = COLORS[i % COLORS.length];
    var absD      = Math.abs(drift);
    var action    = absD < 0.5 ? 'Hold' : drift < 0 ? 'Buy' : 'Sell';
    var badgeCls  = absD < 0.5 ? 'badge-hold' : drift < 0 ? 'badge-buy' : 'badge-sell';
    var driftCls  = absD < 0.5 ? 'drift-neutral' : drift > 0 ? 'drift-pos' : 'drift-neg';
    var sign      = drift > 0 ? '+' : '';
    var wActual   = (actual / maxPct) * 100;
    var wTarget   = (t.pct  / maxPct) * 100;

    // Card
    var card = document.createElement('div');
    card.className = 'pos-card';
    card.style.borderLeftColor = color;

    // Top row: [ticker + value] [drift] [badge]
    var row1 = document.createElement('div');
    row1.className = 'pos-row1';

    var leftDiv = document.createElement('div');

    var tickerEl = document.createElement('div');
    tickerEl.className = 'pos-ticker';
    tickerEl.textContent = t.ticker;

    var valueEl = document.createElement('div');
    valueEl.className = 'pos-value-amt';
    valueEl.textContent = fmtCurrency(val) + ' (target: ' + fmtCurrency(targetVal) + ')';

    leftDiv.appendChild(tickerEl);
    leftDiv.appendChild(valueEl);

    var driftEl = document.createElement('div');
    driftEl.className = 'pos-drift ' + driftCls;
    driftEl.textContent = sign + drift.toFixed(1) + '%';

    var badgeEl = document.createElement('span');
    badgeEl.className = 'action-badge ' + badgeCls;
    badgeEl.textContent = action;

    row1.appendChild(leftDiv);
    row1.appendChild(driftEl);
    row1.appendChild(badgeEl);

    // Actual bar
    var actualRow = makeBarRow('Actual', wActual, actual.toFixed(1) + '%', color, 0.85);

    // Target bar
    var targetRow = makeBarRow('Target', wTarget, t.pct.toFixed(1) + '%', color, 0.25);

    card.appendChild(row1);
    card.appendChild(actualRow);
    card.appendChild(targetRow);
    container.appendChild(card);
  }

  // Unmatched holdings
  var unmatched = [];
  for (var k in h) { if (!targetMap[k]) unmatched.push(k); }
  var us = document.getElementById('unmatchedSection');
  if (unmatched.length > 0) {
    us.style.display = 'block';
    var tags = '';
    for (var i = 0; i < unmatched.length; i++) {
      tags += '<span class="tag">' + unmatched[i] + ' ' +
        ((h[unmatched[i]] / portfolioTotal) * 100).toFixed(1) + '%</span>';
    }
    document.getElementById('unmatchedTags').innerHTML = tags;
  } else {
    us.style.display = 'none';
  }

  // Build chart data array
  var chartData = [];
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    chartData.push({
      ticker: t.ticker,
      actual: ((h[t.ticker] || 0) / portfolioTotal) * 100,
      target: t.pct,
      value:  h[t.ticker] || 0,
      color:  COLORS[i % COLORS.length]
    });
  }
  renderBulletChart(chartData, portfolioTotal);

  document.getElementById('results').style.display = 'block';
  setTimeout(function() {
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function makeBarRow(label, widthPct, pctText, color, opacity) {
  var row = document.createElement('div');
  row.className = 'pos-bar-row';

  var lbl = document.createElement('div');
  lbl.className = 'pos-bar-label';
  lbl.textContent = label;

  var track = document.createElement('div');
  track.className = 'pos-bar-track';

  var fill = document.createElement('div');
  fill.className = 'pos-bar-fill';
  fill.style.width      = widthPct + '%';
  fill.style.background = color;
  fill.style.opacity    = String(opacity);
  track.appendChild(fill);

  var pctEl = document.createElement('div');
  pctEl.className = 'pos-bar-pct';
  if (opacity < 0.5) pctEl.style.opacity = '0.5';
  pctEl.textContent = pctText;

  row.appendChild(lbl);
  row.appendChild(track);
  row.appendChild(pctEl);
  return row;
}

// ── Bullet chart ───────────────────────────────────────────────────────
function renderBulletChart(data, total) {
  var container = document.getElementById('chartContainer');
  if (!data || !data.length) return;

  var W       = container.clientWidth || 300;
  var PAD_L   = 52;
  var PAD_R   = 50;
  var PAD_T   = 10;
  var PAD_B   = 10;
  var ROW_H   = 58;
  var GAP     = 10;
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
  s += '<svg width="100%" height="' + totalH + '"';
  s += ' viewBox="0 0 ' + W + ' ' + totalH + '"';
  s += ' style="overflow:visible;display:block;font-family:\'DM Mono\',monospace">';

  for (var i = 0; i < data.length; i++) {
    var d     = data[i];
    var cy    = PAD_T + i * (ROW_H + GAP) + ROW_H / 2;
    var wA    = (d.actual / maxVal) * barArea;
    var wT    = (d.target / maxVal) * barArea;
    var drift = d.actual - d.target;
    var dc    = Math.abs(drift) < 0.5 ? '#6b7080' : drift > 0 ? '#c8f060' : '#f06060';
    var delay = i * 0.08;
    var sign  = drift > 0 ? '+' : '';
    var aDol  = fmtCurrencyShort(d.value);
    var tDol  = fmtCurrencyShort((d.target / 100) * total);

    // Ticker label — centered on track
    s += '<text';
    s += ' x="' + (PAD_L - 7) + '"';
    s += ' y="' + cy + '"';
    s += ' text-anchor="end"';
    s += ' dominant-baseline="middle"';
    s += ' fill="#e8eaf0"';
    s += ' font-size="12"';
    s += ' font-weight="500">';
    s += d.ticker;
    s += '</text>';

    // Background track
    s += '<rect';
    s += ' x="' + PAD_L + '"';
    s += ' y="' + (cy - TRACK_H / 2) + '"';
    s += ' width="' + barArea + '"';
    s += ' height="' + TRACK_H + '"';
    s += ' rx="5"';
    s += ' fill="#1c1f26"';
    s += '/>';

    // Target zone shading (band around target)
    var zoneHalf = (5 / maxVal) * barArea;
    var zoneX    = Math.max(PAD_L, PAD_L + wT - zoneHalf);
    var zoneW    = Math.min(zoneHalf * 2, barArea - (zoneX - PAD_L));
    s += '<rect';
    s += ' x="' + zoneX + '"';
    s += ' y="' + (cy - TRACK_H / 2) + '"';
    s += ' width="' + zoneW + '"';
    s += ' height="' + TRACK_H + '"';
    s += ' rx="3"';
    s += ' fill="' + d.color + '"';
    s += ' opacity="0.15"';
    s += '/>';

    // Actual bar (animated)
    s += '<rect';
    s += ' x="' + PAD_L + '"';
    s += ' y="' + (cy - BAR_H / 2) + '"';
    s += ' width="' + wA + '"';
    s += ' height="' + BAR_H + '"';
    s += ' rx="3"';
    s += ' fill="' + d.color + '"';
    s += ' opacity="0.9">';
    s += '<animate attributeName="width"';
    s += ' from="0" to="' + wA + '"';
    s += ' dur="0.5s" begin="' + delay + 's"';
    s += ' fill="freeze"';
    s += ' calcMode="spline" keySplines="0.4 0 0.2 1"/>';
    s += '</rect>';

    // Target tick line
    s += '<line';
    s += ' x1="' + (PAD_L + wT) + '"';
    s += ' y1="' + (cy - TRACK_H / 2 - 3) + '"';
    s += ' x2="' + (PAD_L + wT) + '"';
    s += ' y2="' + (cy + TRACK_H / 2 + 3) + '"';
    s += ' stroke="' + d.color + '"';
    s += ' stroke-width="2.5"';
    s += ' opacity="0.8"';
    s += '/>';

    // Actual % label (inside bar if wide enough, else outside)
    if (wA > 36) {
      s += '<text';
      s += ' x="' + (PAD_L + wA - 5) + '"';
      s += ' y="' + cy + '"';
      s += ' text-anchor="end"';
      s += ' dominant-baseline="middle"';
      s += ' fill="rgba(0,0,0,0.65)"';
      s += ' font-size="9">';
      s += d.actual.toFixed(1) + '%';
      s += '</text>';
    } else {
      s += '<text';
      s += ' x="' + (PAD_L + wA + 5) + '"';
      s += ' y="' + cy + '"';
      s += ' dominant-baseline="middle"';
      s += ' fill="' + d.color + '"';
      s += ' font-size="9">';
      s += d.actual.toFixed(1) + '%';
      s += '</text>';
    }

    // Target % above tick
    s += '<text';
    s += ' x="' + (PAD_L + wT) + '"';
    s += ' y="' + (cy - TRACK_H / 2 - 6) + '"';
    s += ' text-anchor="middle"';
    s += ' fill="' + d.color + '"';
    s += ' font-size="9"';
    s += ' opacity="0.6">';
    s += d.target.toFixed(1) + '%';
    s += '</text>';

    // Drift label right side
    s += '<text';
    s += ' x="' + (W - 4) + '"';
    s += ' y="' + cy + '"';
    s += ' text-anchor="end"';
    s += ' dominant-baseline="middle"';
    s += ' fill="' + dc + '"';
    s += ' font-size="11"';
    s += ' font-weight="500">';
    s += sign + drift.toFixed(1) + '%';
    s += '</text>';

    // Dollar amounts below the bar
    s += '<text';
    s += ' x="' + PAD_L + '"';
    s += ' y="' + (cy + TRACK_H / 2 + 11) + '"';
    s += ' fill="#6b7080"';
    s += ' font-size="9">';
    s += aDol + ' actual  /  ' + tDol + ' target';
    s += '</text>';
  }

  s += '</svg>';

  // Legend
  s += '<div style="display:flex;gap:20px;margin-top:14px;justify-content:center;font-family:\'DM Mono\',monospace;font-size:11px;color:#6b7080">';
  s += '<div style="display:flex;align-items:center;gap:7px">';
  s += '<div style="width:14px;height:8px;border-radius:2px;background:#c8f060;opacity:0.9"></div>';
  s += 'Actual</div>';
  s += '<div style="display:flex;align-items:center;gap:7px">';
  s += '<div style="width:3px;height:16px;border-radius:1px;background:#c8f060;opacity:0.8"></div>';
  s += 'Target</div>';
  s += '</div>';

  container.innerHTML = s;
}

// ── Tabs ───────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(function(t) {
    t.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(function(t) {
    t.classList.remove('active');
  });
  btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

// ── Formatting ─────────────────────────────────────────────────────────
function fmtCurrency(n) {
  return '$' + n.toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtCurrencyShort(n) {
  return '$' + n.toLocaleString('en-CA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}
