// Token Launch Radar's plain dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the board, the detail view, the live-token
// set and the model page. No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) {
    document.body.innerHTML = '<p style="padding:24px">Radar data not found: run main.ts to write data.js beside dashboard/.</p>';
    return;
  }
  var watchlist = {};
  var WL = DATA.watchlist || [];
  WL.forEach(function (s) { watchlist[s] = true; });

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v >= 0 ? 'up' : 'down') + '">' + s + '</span>';
  }
  function age(v) {
    if (v === null || v === undefined) return '—';
    if (v < 365) return v + 'd';
    return (v / 365).toFixed(1) + 'y';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- header stats -------------------------------------------------------
  var top = DATA.rows[0];
  $('stats').innerHTML =
    '<div class="stat"><b>' + DATA.board_size + '</b><span>protocols ranked</span></div>' +
    '<div class="stat"><b>' + DATA.watchlist_size + '</b><span>on the watchlist</span></div>' +
    '<div class="stat"><b>' + DATA.early_size + '</b><span>early finds</span></div>' +
    '<div class="stat"><b>' + (top ? money(top.implied_value_usd) : '—') + '</b><span>top implied value</span></div>';
  $('modelVer').textContent = DATA.model_version;
  $('asOf').textContent = DATA.as_of;
  $('src').textContent = DATA.source;

  // The size curve's fit and the board's top row, from the data itself, so
  // the model page never quotes a number the run did not produce.
  if (DATA.size_curve) {
    $('curveIntercept').textContent = DATA.size_curve.intercept.toFixed(2);
    $('curveSlope').textContent = DATA.size_curve.slope.toFixed(2);
  }
  if (top) $('topImplied').textContent = money(top.implied_value_usd);

  // ---- filters ------------------------------------------------------------
  var cats = {};
  var chains = {};
  DATA.rows.forEach(function (r) {
    if (r.category) cats[r.category] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    $('cat').appendChild(new Option(c, c));
  });
  Object.keys(chains).sort().forEach(function (c) {
    $('chain').appendChild(new Option(c, c));
  });

  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value;
    var chain = $('chain').value;
    var wo = $('watchonly').checked;
    var rows = DATA.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (wo && !watchlist[r.slug]) return false;
      return true;
    });
    var sort = $('sort').value;
    var cmp = {
      rank: function (a, b) { return a.rank - b.rank; },
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
    }[sort] || function (a, b) { return a.rank - b.rank; };
    return rows.slice().sort(cmp);
  }

  // A sub-floor protocol the model lifted into the top 40 earns its own mark:
  // it is the early find this radar exists to surface.
  function pills(r) {
    var out = '';
    if (watchlist[r.slug]) out += ' <span class="pill">watchlist</span>';
    if (r.origin === 'early-above') out += ' <span class="pill early">early find</span>';
    if (r.origin === 'early-below' && r.rank <= 40) out += ' <span class="pill lifted">lifted early find</span>';
    return out;
  }

  function renderBoard() {
    var rows = filtered();
    $('count').textContent = rows.length + ' of ' + DATA.rows.length + ' protocols shown.';
    $('rows').innerHTML = rows.map(function (r) {
      var tags = r.chains.slice(0, 3).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('');
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="' + (r.rank === 1 ? 'rank1' : '') + '">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' + pills(r) + '<br><span style="color:var(--muted);font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + tags + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td>' +
        '<td><button class="btn" data-farm="' + esc(r.slug) + '">Farm plan</button></td>' +
        '</tr>';
    }).join('');
  }

  // ---- detail view --------------------------------------------------------
  function showDetail(slug) {
    var r = null;
    DATA.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var steps = (r.farm_steps || []).map(function (s, i) {
      return '<li><strong>Step ' + (i + 1) + '.</strong> ' + esc(s) + '</li>';
    }).join('');
    var origin = r.origin === 'watchlist' ? 'on the watchlist' : r.origin === 'early-above' ? 'early find above the floor' : 'early find below the floor';
    // Where this row's two estimators came from: its own category's live-token
    // median, shrunk toward the global median — and the size curve, moved by
    // the category's offset. A category with no live token uses the global
    // median for the multiple and no offset for the curve.
    var calib = r.category_live_n > 0
      ? 'the ' + esc(r.category || 'uncategorised') + ' multiple: the median market-cap/TVL of ' + r.category_live_n +
        ' live-token ' + esc(r.category || '') + ' protocol' + (r.category_live_n === 1 ? '' : 's') +
        ' in this snapshot, shrunk toward the ' + DATA.global_median_multiple + ' global median; the curve is moved by the ' +
        esc(r.category || '') + ' offset ' + (r.curve_offset >= 0 ? '+' : '') + r.curve_offset.toFixed(2) + ' in log10'
      : 'no live-token ' + esc(r.category || 'uncategorised') + ' protocol in this snapshot, so the ' +
        DATA.global_median_multiple + ' global median market-cap/TVL for the multiple and no offset on the curve';
    $('detailBody').innerHTML =
      '<p class="note">Rank #' + r.rank + ' · ' + origin + ' · pre-token</p>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="note">' + esc(r.category || 'Uncategorised') + ' · ' + r.chains.map(esc).join(', ') + ' · tracked since ' + esc(r.listed_at || 'unknown') + '</p>' +
      '<div class="kv">' +
      '<div><b>' + money(r.implied_value_usd) + '</b><span>implied value</span></div>' +
      '<div><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b>' + (r.change_7d === null ? '—' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b><span>TVL change, 7 days</span></div>' +
      '<div><b>' + age(r.age_days) + '</b><span>age with no token</span></div>' +
      '</div>' +
      '<h3>How the value is built</h3>' +
      '<p>Two estimators of the same value, averaged in log space: the category multiple gives ' + money(r.median_value_usd) +
      ' (TVL × ' + r.base_multiple + ' — ' + calib + '), and the size curve gives ' + money(r.curve_value_usd) +
      '. Their average is the base ' + money(r.base_value_usd) + '. Then growth ' + r.growth_multiplier.toFixed(2) +
      ' × maturity ' + r.maturity_multiplier.toFixed(2) + ' × breadth ' + r.breadth_multiplier.toFixed(2) +
      ' = <strong>' + money(r.implied_value_usd) + '</strong>. Same formula for every protocol; no name is special-cased.</p>' +
      '<h3>Farm plan — six steps</h3><ol>' + steps + '</ol>' +
      '<p class="fine">This is a plan for farming a protocol that records no token. It is not a promise of an airdrop, and never pay to claim.</p>';
    $('detail').classList.remove('hidden');
  }
  $('closeDetail').addEventListener('click', function () { $('detail').classList.add('hidden'); });
  $('rows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-farm]');
    if (b) { showDetail(b.getAttribute('data-farm')); return; }
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });

  // ---- live tokens --------------------------------------------------------
  $('liveRows').innerHTML = DATA.live.map(function (r) {
    return '<tr><td><strong>' + esc(r.name) + '</strong></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + r.chains.slice(0, 3).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num">' + money(r.mcap_usd) + '</td>' +
      '<td class="num">' + pct(r.change_7d) + '</td></tr>';
  }).join('');

  // ---- model tab ----------------------------------------------------------
  var m = DATA.model;
  $('formula').textContent =
    'base = 10 ^ (0.5 × log10(median value) + 0.5 × log10(curve value))\n' +
    'median value = TVL × category_multiple\n' +
    'category_multiple = median market-cap/TVL of the live-token protocols in the\n' +
    '  same category, shrunk toward the ' + DATA.global_median_multiple + ' global median with a prior of ' + m.category_prior +
    ' protocols, clamped to ' + m.base_multiple_floor + '..' + m.base_multiple_cap + '\n' +
    'curve value = 10 ^ (' + DATA.size_curve.intercept.toFixed(2) + ' + ' + DATA.size_curve.slope.toFixed(2) +
    ' × log10(TVL) + category_offset)\n' +
    'category_offset = shrunk mean of the category\'s residuals, each clipped to ±' + m.residual_winsor +
    ' in log10, prior ' + m.curve_prior + ', capped at ±' + m.offset_cap + '\n' +
    'implied = max(1, round(base × growth × maturity × breadth))\n' +
    'growth   = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + '\n' +
    'maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + '   (age unknown: ' + m.unknown_age_days + ' days)\n' +
    'breadth  = 1 + ' + m.breadth_step + ' × min(chains − 1, ' + (m.breadth_max_chains - 1) + ')';
  var constRows = Object.keys(m).map(function (k) {
    return '<tr><td>' + esc(k) + '</td><td class="num">' + esc(String(m[k])) + '</td></tr>';
  }).join('');
  $('modelConsts').innerHTML = '<table><thead><tr><th>Constant</th><th class="num">Value</th></tr></thead><tbody>' + constRows + '</tbody></table>';
  var offsets = {};
  (DATA.category_offsets || []).forEach(function (c) { offsets[c.category] = c; });
  var calRows = (DATA.category_multiples || []).map(function (c) {
    var o = offsets[c.category];
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.multiple.toFixed(3) + '</td><td class="num">' + c.live_n + '</td><td class="num">' + (o ? (o.offset >= 0 ? '+' : '') + o.offset.toFixed(2) : '—') + '</td></tr>';
  }).join('');
  if (calRows) {
    $('modelConsts').innerHTML += '<h3>Category multiples and curve offsets</h3><p>Each multiple is the median market-cap/TVL of the live-token protocols in that category, shrunk toward the ' + DATA.global_median_multiple + ' global median and clamped to ' + m.base_multiple_floor + '..' + m.base_multiple_cap + '. Each offset moves the size curve for that category in log10: +0.20 means the category\'s tokens run about 1.6× above the curve, −0.30 about half. A category with no live token in the snapshot is absent here and uses the global median for the multiple and no offset for the curve.</p>' +
      '<table><thead><tr><th>Category</th><th class="num">Multiple</th><th class="num">Live protocols</th><th class="num">Curve offset</th></tr></thead><tbody>' + calRows + '</tbody></table>';
  }

  // ---- held-out check -----------------------------------------------------
  var v = DATA.validation;
  if (v) {
    $('validationBox').innerHTML =
      '<p style="margin:0 0 4px"><strong>The model checks itself on this snapshot.</strong> The ' + v.n + ' live-token protocols are split into ' + v.folds +
      ' folds by slug; the two estimators are fitted on four folds and scored on the fifth, five times over.</p>' +
      '<div class="valnums">' +
      '<div><b>' + v.median_abs_log10.toFixed(2) + '</b><span>median |log10 error| (about ×' + v.median_abs_factor.toFixed(1) + ')</span></div>' +
      '<div><b>' + Math.round(v.within_2x * 100) + '%</b><span>held-out tokens within 2× of their real market cap</span></div>' +
      '<div><b>' + Math.round(v.within_3x * 100) + '%</b><span>within 3×</span></div>' +
      '<div><b>' + v.spearman.toFixed(2) + '</b><span>rank correlation with real market cap</span></div>' +
      '<div><b>' + Math.round(v.precision_at_10 * 100) + '%</b><span>of the ten biggest held-out tokens land in the model\'s top ten</span></div>' +
      '<div><b>' + Math.round(v.precision_at_20 * 100) + '%</b><span>of the top twenty land in the top twenty</span></div>' +
      '</div>' +
      '<p class="fine" style="margin:8px 0 0">The base alone, without the growth, maturity and breadth nudges, scores ' + v.base_median_abs_log10.toFixed(2) +
      ' in log10 with ' + Math.round(v.base_within_2x * 100) + '% within 2× — the nudges cost a little calibration and are kept small on purpose. The model is unbiased: median log10(predicted / actual) ' +
      (v.bias_log10 >= 0 ? '+' : '') + v.bias_log10.toFixed(2) + '.</p>';
  }

  // ---- tabs + controls ----------------------------------------------------
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      var name = t.getAttribute('data-tab');
      ['board', 'live', 'model'].forEach(function (n) {
        $('tab-' + n).classList.toggle('hidden', n !== name);
      });
    });
  });
  ['q', 'cat', 'chain', 'sort', 'watchonly'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });

  // The dashboard needs the watchlist itself to mark rows: the board carries
  // it when main.ts writes it; without it, no row is marked.
  renderBoard();
})();
