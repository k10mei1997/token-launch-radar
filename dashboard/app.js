// Token Launch Radar — the dashboard page. Reads window.RADAR (data.js, written
// by main.ts beside this page) and renders the ranked board, spotlight cards,
// search / chain / category / tier filters, sortable columns, a per-protocol
// detail view with the valuation equation and farm plan, the live-token set
// aside, and the model's method with its category multiples. No network:
// every byte it shows arrived in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tier: 'all', tab: 'board', sort: 'rank', dir: 1, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { return n === null || n === undefined || !isFinite(n) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  // The valuation, recomputed in the page from the row's own figures: the same
  // arithmetic lib/model.ts ran, so a reader can check board.json from the page.
  function impliedOf(r) {
    return Math.max(1, Math.round(r.tvl_usd * r.peer_multiple * r.momentum_multiplier * r.maturity_multiplier * r.confidence_multiplier));
  }
  function precedentOf(r) {
    var c = DATA.categories.filter(function (x) { return x.category === (r.category || 'Uncategorised'); })[0];
    return c && c.protocols > 0 ? c.tokenised / c.protocols : 0;
  }

  // The farm plan mirrors lib/model.ts farmSteps: category decides the action,
  // TVL the capital, age the hold, category the risk note. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) { return p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50; }
  function holdDaysFor(age) { return age === null || age === undefined ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(), n = p.name;
    if (/lend|cdp|collateral/.test(c)) return 'Supply $' + capital + ' of USDC to ' + n + ' on ' + chain + ', then borrow a small amount against it and repay, so both sides of the market record your wallet.';
    if (/dex|aggregator/.test(c)) return 'Swap $' + capital + ' through ' + n + ' on ' + chain + ' and add the proceeds to its main liquidity pool, keeping the LP position open.';
    if (/curator|allocator|vault/.test(c)) return 'Deposit $' + capital + ' of USDC into a ' + n + ' vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (/yield/.test(c)) return "Deposit $" + capital + " of USDC into " + n + "'s highest-TVL vault on " + chain + ' and leave the position untouched between weekly actions.';
    if (/perpetual|derivative|option/.test(c)) return 'Deposit $' + capital + ' of USDC as margin on ' + n + ' and open one small hedged trade, then close it a day later so volume and open interest both count.';
    if (/prediction/.test(c)) return 'Fund $' + capital + ' on ' + n + ' and take one position in its most liquid market, holding it to settlement.';
    if (/bridge/.test(c)) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + n + ' and use the bridged funds in one app on the far side.';
    if (/staking|restak/.test(c)) return "Stake $" + capital + " of the chain's staking asset through " + n + ' and keep the staking receipt in the farming wallet.';
    if (/stable/.test(c)) return 'Mint or deposit $' + capital + ' of the stable asset through ' + n + ' on ' + chain + ' and hold it rather than swapping out the same day.';
    if (/rwa/.test(c)) return "Mint $" + capital + " of " + n + "'s yield asset on " + chain + ' and hold it in the farming wallet.';
    if (/insurance/.test(c)) return 'Buy $' + capital + ' of cover from ' + n + ' on ' + chain + ' and keep the policy until it expires.';
    if (/launchpad|launch/.test(c)) return 'Take part in one ' + n + ' launch on ' + chain + ' with $' + capital + ' and keep the allocation record in the same wallet.';
    return 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + ' through its own app and keep the position open.';
  }
  function riskFor(p) {
    var c = (p.category || '').toLowerCase();
    if (/lend|cdp/.test(c)) return 'Watch the health factor weekly: a liquidation ends the farm and the loss is real, so keep the borrow small.';
    if (/perpetual|derivative/.test(c)) return 'Keep leverage at 1x and the hedge on: liquidation, not the token wait, is the way this farm loses money.';
    if (/bridge/.test(c)) return 'Bridge back once a month to prove the route both ways, and never leave the whole position on a chain you cannot exit.';
    if (/curator|allocator|vault|yield/.test(c)) return 'Check the vault strategy monthly: if the curator rotates into an asset you would not hold directly, withdraw first and ask later.';
    return 'Cap the position at the plan amount: smart-contract risk is the price of farming, so never add funds you cannot leave locked for the full hold.';
  }
  function farmSteps(p) {
    var chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(p.age_days), gas = capital >= 150 ? 8 : 4;
    return [
      ['Set up a fresh wallet for ' + p.name + ' alone, fund it on ' + chain + ', and keep its seed phrase offline and never typed into a site.', 'under $3 of gas for the first transaction', '5 minutes'],
      [actionFor(p, capital, chain), '$' + capital + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'],
      ['Repeat one qualifying action every week — a deposit, a swap, a borrow or a vote — from the same wallet, so the activity spans several weekly snapshots.', 'about $2 of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days without moving it to another wallet, so the full history sits at one address.', 'the $' + capital + ' stays in the position', hold + ' days'],
      [riskFor(p), 'no fee to check, a few dollars of gas if you exit early', '5 minutes a week'],
      ["Check the protocol's own points or rewards page before withdrawing, claim only from the link it publishes, and log the wallet, dates and transactions.", 'no fee to check, and never pay anyone to claim', '10 minutes']
    ];
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var q = new URLSearchParams(h);
    if (q.get('q')) state.q = q.get('q');
    if (q.get('category')) state.category = q.get('category');
    if (q.get('chain')) state.chain = q.get('chain');
    if (q.get('tier')) state.tier = q.get('tier');
    if (q.get('p')) state.selected = q.get('p');
  }
  function writeHash() {
    var q = new URLSearchParams();
    if (state.q) q.set('q', state.q);
    if (state.category !== 'all') q.set('category', state.category);
    if (state.chain !== 'all') q.set('chain', state.chain);
    if (state.tier !== 'all') q.set('tier', state.tier);
    if (state.selected) q.set('p', state.selected);
    var s = q.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.tier === 'watch' && !r.watchlist) return false;
      if (state.tier === 'early' && r.watchlist) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var k = state.sort, d = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (k === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (k === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (k === 'growth') { av = a.change_7d === null ? -1e9 : a.change_7d; bv = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (k === 'age') { av = a.age_days === null ? 1e9 : a.age_days; bv = b.age_days === null ? 1e9 : b.age_days; }
      else if (k === 'multiple') { av = a.peer_multiple; bv = b.peer_multiple; }
      else if (k === 'readiness') { av = a.readiness; bv = b.readiness; }
      else if (k === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -d;
      if (av > bv) return d;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), 'Token Launch Radar'),
      el('div', { class: 'top-meta' },
        el('span', { class: 'chip', text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'chip', text: DATA.universe_size + ' protocols scanned' }),
        el('span', { class: 'chip', text: 'Model ' + DATA.model_version })));
  }
  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, 'Which pre-token protocol is ', el('em', { text: 'worth farming next' }), '?'),
        el('p', { text: 'Every protocol in the snapshot that records no token — and is not a wrapped, staked or bridged product of one that trades — ranked by what its launch would be worth: its TVL priced at the median multiple its tokenised category peers actually trade at, adjusted for momentum, maturity and size confidence. The 40-protocol watchlist is the floor; the radar ranks all ' + DATA.board_size + ' of them.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'TVL under watch' }), el('b', { text: fmtUsd(DATA.total_tvl_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Implied value, total' }), el('b', { text: fmtUsd(DATA.total_implied_usd) }))));
  }
  function spotlight() {
    return el('section', { class: 'spot', 'aria-label': 'Top five by implied value' },
      DATA.rows.slice(0, 5).map(function (r) {
        return el('button', { class: 'spot-card', type: 'button', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rk', text: 'RANK ' + r.rank }),
          el('div', { class: 'nm', text: r.name }),
          el('div', { class: 'vl num', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'mt', text: 'TVL ' + fmtUsd(r.tvl_usd) + ' · readiness ' + r.readiness + '/100' }));
      }));
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name, category, chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderTable(); });
    function select(id, label, options, value, on) {
      var s = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: label + ': all' }),
        options.map(function (o) { return el('option', { value: o, text: o, selected: o === value ? 'selected' : null }); }));
      s.addEventListener('change', function () { on(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var tier = el('select', { id: 'tier', 'aria-label': 'Tier' },
      el('option', { value: 'all', text: 'Watchlist + early' }),
      el('option', { value: 'watch', text: 'Watchlist only', selected: state.tier === 'watch' ? 'selected' : null }),
      el('option', { value: 'early', text: 'Early (below floor) only', selected: state.tier === 'early' ? 'selected' : null }));
    tier.addEventListener('change', function () { state.tier = tier.value; writeHash(); render(); });
    var boardBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'board' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'board'; render(); } });
    var liveBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', cats, state.category, function (v) { state.category = v; }),
      select('chain', 'Chain', chains, state.chain, function (v) { state.chain = v; }),
      el('div', { class: 'field' }, el('label', { for: 'tier', text: 'Tier' }), tier),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Token status' }), el('div', { class: 'tabs' }, boardBtn, liveBtn)),
      el('span', { class: 'count', id: 'rowcount' }));
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
      renderTable();
    } }, label + (state.sort === key ? (state.dir < 0 ? ' ↓' : ' ↑') : '')));
  }
  var tableHost = el('div');
  function renderTable() {
    var count = document.getElementById('rowcount');
    tableHost.textContent = '';
    if (state.tab === 'live') {
      if (count) count.textContent = DATA.live.length + ' live-token protocols set aside';
      tableHost.appendChild(liveTable());
      return;
    }
    var list = sorted(filtered());
    if (count) count.textContent = list.length + ' of ' + DATA.board_size + ' rows shown';
    if (list.length === 0) {
      tableHost.appendChild(el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { class: 'sub', text: 'Clear the search or widen the category, chain or tier filter.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; writeHash(); render(); } }))));
      return;
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; }));
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', { 'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains || []).slice(0, 3).join(', ') }))),
        el('td', null, el('span', { class: r.watchlist ? 'badge watch' : 'badge early', text: r.watchlist ? 'watchlist' : 'early' })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: '×' + r.peer_multiple.toFixed(3) }),
        el('td', null, el('div', { class: 'ready' }, el('div', { class: 'bar' }, el('i', { style: 'width:' + r.readiness + '%' })), el('span', { class: 'num', text: String(r.readiness) }))),
        el('td', null, el('div', { class: 'implied' }, el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.implied_value_usd / max * 100)) + '%' })), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })))));
    });
    tableHost.appendChild(el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols ranked by implied launch value. Select any row for its valuation, readiness and farm plan.' }),
        el('thead', null, el('tr', null,
          sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), el('th', { scope: 'col', text: 'Tier' }),
          sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'),
          sortHeader('multiple', 'Peer ×'), sortHeader('readiness', 'Ready'), sortHeader('implied', 'Implied value'))),
        tbody))));
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains || []).slice(0, 3).join(', ') }))),
        el('td', { class: 'num', text: r.symbol || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) })));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Already trading: these protocols have a token, so their market cap is a market fact, not a model output. They are the peer set behind the multiples — and they are never ranked on the board.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Symbol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }))),
        tbody)));
  }
  function methodPanel() {
    var m = DATA.model;
    var top = DATA.categories.filter(function (c) { return c.multiple !== null; }).slice(0, 10);
    var tbody = el('tbody');
    top.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category }), el('td', { class: 'num', text: String(c.protocols) }),
        el('td', { class: 'num', text: String(c.tokenised) }), el('td', { class: 'num', text: '×' + c.multiple.toFixed(3) })));
    });
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How the radar prices a launch that has not happened' }),
      el('p', { class: 'sub', text: 'No hardcoded names and no flat guess: tokenised protocols in the same snapshot are the comparables. Each category with at least ' + m.min_peers + ' tokenised peers that report a market cap contributes its median market-cap / TVL multiple (clamped to ×' + m.ratio_min + '–×' + m.ratio_max + '); a thinner category falls back to its peer group — the businesses like it, such as vaults, curators and yield pooled — and only then to the global median, ×' + DATA.global_multiple.toFixed(3) + '. Every row\u2019s detail view names the exact basis its multiple came from.' }),
      el('div', { class: 'formula', text: 'implied = TVL × peer_multiple × (1 + clamp(7d growth, ' + m.growth_floor + ', ' + m.growth_cap + ')/100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(age, ' + m.maturity_days + 'd)/' + m.maturity_days + ' × ' + m.maturity_range + ') × (' + m.confidence_floor + ' + ' + (1 - m.confidence_floor).toFixed(2) + ' × min(TVL / floor, 1))' }),
      el('p', { class: 'sub', text: 'Readiness (0–100) is a second lens, never the rank: 30% maturity, 25% momentum, 25% log-scale TVL, 20% category precedent — the share of its category that already launched a token. A protocol records no token on DefiLlama; that is a record, not a promise that one is coming. Implied value is this entry\u2019s model, not a price prediction.' }),
      el('div', { class: 'table-wrap' }, el('table', null,
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Protocols' }), el('th', { scope: 'col', text: 'Tokenised' }), el('th', { scope: 'col', text: 'Peer multiple' }))),
        tbody)));
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); renderTable(); });
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var check = impliedOf(row);
    var steps = farmSteps(row);
    dialog.textContent = '';
    var inner = el('div', { class: 'detail-in' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.watchlist ? 'watchlist' : 'early, below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor') }),
          el('h2', { id: 'detail-title', text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Uncategorised') + ' · ' + (row.chains || []).join(', ') + ' · records no token (no market cap, no CoinGecko id, no symbol in the snapshot)' })),
        el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { dialog.close(); } })),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'What its launch would be worth' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Peer multiple' }), el('b', { class: 'num', text: '×' + row.peer_multiple.toFixed(3) })),
          el('div', null, el('span', { text: 'Momentum × (7d ' + fmtPct(row.change_7d) + ')' }), el('b', { class: 'num', text: '×' + row.momentum_multiplier.toFixed(3) })),
          el('div', null, el('span', { text: 'Maturity × (age ' + fmtAge(row.age_days) + ')' }), el('b', { class: 'num', text: '×' + row.maturity_multiplier.toFixed(3) })),
          el('div', null, el('span', { text: 'Confidence ×' }), el('b', { class: 'num', text: '×' + row.confidence_multiplier.toFixed(3) })),
          el('div', { class: 'big' }, el('span', { text: 'Implied launch value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
        el('p', { class: 'sub', text: 'Multiple basis: ' + row.peer_basis + '. The page recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ' — the same number board.json carries.' : ' — which differs from the board, so the data would be stale.') + ' Readiness ' + row.readiness + '/100; category precedent ' + Math.round(precedentOf(row) * 100) + '% of ' + (row.category || 'its category') + ' protocols already have a token.' })),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan — what to do before any launch' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          return el('li', null, el('b', { text: s[0] }), el('span', { class: 'cost', text: 'Cost: ' + s[1] + ' · Time: ' + s[2] }));
        }))),
      el('section', { class: 'detail-section' },
        el('div', { class: 'warn', text: 'No token is promised. This radar ranks a record — TVL, growth and time without a token — not an announcement. Farm with money you can leave locked for the full hold, and never pay anyone to "claim" an airdrop.' })));
    dialog.appendChild(inner);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
    renderTable();
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'board') shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(tableHost);
    if (state.tab === 'board') shell.appendChild(methodPanel());
    shell.appendChild(el('footer', { text: 'Source: ' + DATA.source + '. Snapshot frozen ' + DATA.as_of + '; the program re-derives everything from it, so a future snapshot re-ranks future launches with no code change. Implied values are a model\u2019s claim, not investment advice.' }));
    app.appendChild(shell);
    if (!dialog.isConnected) app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
    renderTable();
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
