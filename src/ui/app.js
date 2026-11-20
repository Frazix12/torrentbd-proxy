/* TorrentBD Proxy - dependency-free dark SPA */
(function () {
  'use strict';

  var KEY_STORAGE = 'dashboardKey';
  var ROUTES = ['dashboard', 'search', 'reseed', 'activity', 'settings'];
  var PAGE_TITLES = {
    dashboard: 'Dashboard',
    search: 'Search',
    reseed: 'Reseed Requests',
    activity: 'Activity',
    settings: 'Settings'
  };
  var NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'reseed', label: 'Reseed Requests', icon: 'sync' },
    { id: 'activity', label: 'Activity', icon: 'activity' },
    { id: 'settings', label: 'Settings', icon: 'gear' }
  ];
  var CATS = [
    { id: 2000, name: 'Movies' },
    { id: 5000, name: 'TV' },
    { id: 1000, name: 'PC' },
    { id: 3000, name: 'Audio' },
    { id: 7000, name: 'Books' }
  ];
  var CAT_LABEL = {};
  CATS.forEach(function (c) { CAT_LABEL[c.id] = c.name; });

  var ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
    search: '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>',
    sync: '<path d="M20 12a8 8 0 0 1-13.7 5.6L4 15"></path><path d="M4 21v-6h6"></path><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9"></path><path d="M20 3v6h-6"></path>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"></path>',
    gear: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.03A1.7 1.7 0 0 0 20.96 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"></path>',
    refresh: '<path d="M20 12a8 8 0 0 1-13.7 5.6L4 15"></path><path d="M4 21v-6h6"></path><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9"></path><path d="M20 3v6h-6"></path>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path>',
    menu: '<path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path>',
    logo: '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path><path d="M8.5 8.5l7 7"></path>',
    check: '<path d="M20 6L9 17l-5-5"></path>'
  };

  var config = { authRequired: false, version: '', baseUrl: '' };
  var currentRoute = 'dashboard';
  var routerStarted = false;
  var pageRefresh = null;
  var pageTimer = null;

  /* ---------- Small helpers ---------- */
  function getKey() { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { return ''; } }
  function setKey(v) { try { localStorage.setItem(KEY_STORAGE, v); } catch (e) { /* storage unavailable */ } }
  function clearKey() { try { localStorage.removeItem(KEY_STORAGE); } catch (e) { /* storage unavailable */ } }

  function el(tag, opts) {
    var node = document.createElement(tag);
    if (opts && typeof opts === 'object') {
      Object.keys(opts).forEach(function (key) {
        var val = opts[key];
        if (val === null || val === undefined || val === false) return;
        if (key === 'class' || key === 'className') node.className = val;
        else if (key === 'text') node.textContent = String(val);
        else if (key === 'html') node.innerHTML = val; // authored static markup only
        else if (key === 'value') node.value = val;
        else if (key === 'checked') node.checked = !!val;
        else if (key === 'disabled') node.disabled = !!val;
        else if (key === 'dataset') Object.assign(node.dataset, val);
        else if (/^on[A-Z]/.test(key)) node.addEventListener(key.slice(2).toLowerCase(), val);
        else node.setAttribute(key, val === true ? '' : String(val));
      });
    } else if (typeof opts === 'string' || typeof opts === 'number') {
      node.textContent = String(opts);
    }
    var kids = Array.prototype.slice.call(arguments, 2);
    kids.forEach(function flatten(kid) {
      if (Array.isArray(kid)) { kid.forEach(flatten); return; }
      if (kid === null || kid === undefined || kid === false) return;
      node.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    });
    return node;
  }

  function svgMarkup(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.grid) + '</svg>';
  }
  function icon(name) { return el('span', { class: 'icon', html: svgMarkup(name) }); }

  function isLive(node) { return !!(node && node.isConnected); }
  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }
  function formatNumber(v) { try { return Number(v).toLocaleString('en-US'); } catch (e) { return String(v); } }
  function formatBytes(b) {
    b = num(b);
    if (!b) return '—';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return (i === 0 ? b : b.toFixed(b >= 100 ? 0 : 1)) + ' ' + units[i];
  }
  function formatUptime(s) {
    s = num(s);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); var sec = s % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + m + 'm';
    if (m) return m + 'm ' + sec + 's';
    return sec + 's';
  }
  function formatDate(v, withTime) {
    if (!v) return '—';
    var d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return '—';
    var opts = withTime === false
      ? { year: 'numeric', month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return d.toLocaleString(undefined, opts);
  }
  function formatFullDate(v) {
    if (!v) return '—';
    var d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  function safeUrl(u) {
    if (typeof u !== 'string' || !u) return null;
    try {
      var url = new URL(u, window.location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (e) { /* invalid URL */ }
    return null;
  }

  function toneForStatus(s) {
    return s === 'operational' ? 'green' : s === 'failing' ? 'red' : s === 'degraded' ? 'yellow' : 'muted';
  }
  function toneForLevel(l) {
    return l === 'error' ? 'red' : l === 'warn' ? 'yellow' : 'accent';
  }
  function pill(text, tone) { return el('span', { class: 'pill ' + (tone || ''), text: String(text) }); }
  function loadingBlock(text) { return el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('span', { text: text || 'Loading…' })); }
  function emptyState(title, sub) {
    return el('div', { class: 'empty-state' },
      el('div', { class: 'empty-title', text: title }),
      sub ? el('div', { class: 'empty-sub', text: sub }) : null
    );
  }
  function pageHead(title, sub) {
    return el('div', { class: 'page-head' }, el('h1', { class: 'page-h', text: title }), sub ? el('p', { class: 'page-sub', text: sub }) : null);
  }
  function cardNode(c) {
    return el('div', { class: 'stat-card' },
      el('div', { class: 'stat-label', text: c.label }),
      el('div', { class: 'stat-value' + (c.tone ? ' ' + c.tone : ''), text: c.value }),
      el('div', { class: 'stat-sub', text: c.sub || '' })
    );
  }
  function renderSkeletonCards(host, n) {
    host.replaceChildren.apply(host, Array.from({ length: n }, function () {
      return el('div', { class: 'stat-card' },
        el('div', { class: 'skeleton', style: 'height:12px;width:55%;margin-bottom:12px' }),
        el('div', { class: 'skeleton', style: 'height:24px;width:72%' })
      );
    }));
  }

  function toast(message, type) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var box = el('div', { class: 'toast ' + (type || 'info') },
      el('span', { class: 'toast-msg', text: String(message) }),
      el('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss', text: '\u00d7', onclick: function () { box.remove(); } })
    );
    host.appendChild(box);
    setTimeout(function () {
      box.classList.add('fade');
      setTimeout(function () { box.remove(); }, 260);
    }, 4200);
  }

  /* ---------- API ---------- */
  async function fetchConfigRaw() {
    var res = await fetch('/api/ui/config', { headers: { 'X-Dashboard-Key': getKey() } });
    if (res.status === 401 || res.status === 403) {
      var err = new Error('Authentication required'); err.auth = true; throw err;
    }
    if (!res.ok) throw new Error('Could not load config (HTTP ' + res.status + ')');
    return await res.json();
  }

  // Global fetch helper: adds key header, parses JSON, readable errors, toast on failure.
  async function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    headers['X-Dashboard-Key'] = getKey();
    var res;
    try {
      res = await fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body });
    } catch (e) {
      toast('Network error: ' + (e && e.message ? e.message : 'request failed'), 'error');
      throw e;
    }
    if (res.status === 401 || res.status === 403) {
      showLogin('Your session is not authorized. Enter the dashboard key.');
      var authErr = new Error('Authentication required'); authErr.auth = true; throw authErr;
    }
    if (!res.ok) {
      var msg = 'HTTP ' + res.status + ' ' + (res.statusText || '');
      try {
        var body = await res.clone().json();
        if (body && (body.error || body.message)) msg = String(body.error || body.message);
      } catch (e) { /* non-JSON error body */ }
      toast(msg, 'error');
      throw new Error(msg);
    }
    try {
      return await res.json();
    } catch (e) {
      toast('Invalid JSON response from server', 'error');
      throw e;
    }
  }

  /* ---------- Shell / chrome ---------- */
  function buildShell() {
    var app = document.getElementById('app');
    app.innerHTML =
      '<div class="app-shell">' +
        '<aside class="sidebar" id="sidebar">' +
          '<div class="brand"><span class="brand-mark" id="brandMark"></span>' +
            '<div class="brand-text"><div class="brand-name">TorrentBD</div><div class="brand-sub">PROXY CONTROL</div></div>' +
          '</div>' +
          '<nav class="nav" id="nav" aria-label="Main navigation"></nav>' +
          '<div class="sidebar-footer">' +
            '<div class="version-line"><span class="dot"></span><span id="versionText">v—</span></div>' +
            '<div class="auth-line" id="authLine"></div>' +
            '<button class="btn btn-ghost btn-block" type="button" id="logoutBtn" hidden>' + svgMarkup('logout') + ' Log out</button>' +
          '</div>' +
        '</aside>' +
        '<div class="sidebar-backdrop" id="sidebarBackdrop"></div>' +
        '<div class="main">' +
          '<header class="topbar">' +
            '<button class="icon-btn menu-toggle" type="button" id="menuToggle" aria-label="Toggle menu">' + svgMarkup('menu') + '</button>' +
            '<div class="page-title" id="pageTitle">Dashboard</div>' +
            '<div class="topbar-actions">' +
              '<span class="global-badge" id="globalBadge"><span class="badge-dot"></span><span id="globalBadgeText">Checking…</span></span>' +
              '<button class="icon-btn" type="button" id="refreshBtn" title="Refresh current page" aria-label="Refresh">' + svgMarkup('refresh') + '</button>' +
            '</div>' +
          '</header>' +
          '<main class="content" id="content"></main>' +
        '</div>' +
      '</div>' +
      '<div class="toast-container" id="toasts"></div>' +
      '<div id="overlayRoot"></div>';
    document.getElementById('brandMark').innerHTML = svgMarkup('logo');
    var logout = document.getElementById('logoutBtn');
    logout.insertBefore(icon('logout'), logout.firstChild);
  }

  function buildNav() {
    var nav = document.getElementById('nav');
    nav.replaceChildren.apply(nav, NAV.map(function (item) {
      var link = el('a', { class: 'nav-item', href: '#/' + item.id, 'data-route': item.id },
        icon(item.icon), el('span', { text: item.label }));
      link.addEventListener('click', closeSidebar);
      return link;
    }));
  }

  function bindGlobal() {
    document.getElementById('refreshBtn').addEventListener('click', function () {
      if (typeof pageRefresh === 'function') pageRefresh(); else route();
    });
    document.getElementById('menuToggle').addEventListener('click', function () {
      document.body.classList.toggle('sidebar-open');
    });
    document.getElementById('sidebarBackdrop').addEventListener('click', closeSidebar);
    document.getElementById('logoutBtn').addEventListener('click', logoutUser);
  }

  function closeSidebar() { document.body.classList.remove('sidebar-open'); }

  function updateSidebarFooter() {
    var v = config && config.version ? String(config.version) : '';
    document.getElementById('versionText').textContent = v ? (v.charAt(0) === 'v' ? v : 'v' + v) : 'v—';
    document.getElementById('authLine').textContent = config.authRequired ? 'Dashboard key required' : 'Open LAN access';
    document.getElementById('logoutBtn').hidden = !config.authRequired;
  }

  function setActiveNav(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (link) {
      var active = link.getAttribute('data-route') === name;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
  }

  function computeHealth(features) {
    var list = Object.values(features || {});
    if (!list.length) return { label: 'Unknown', tone: 'muted' };
    if (list.some(function (f) { return f.status === 'failing'; })) return { label: 'Failing', tone: 'red' };
    if (list.some(function (f) { return f.status === 'degraded'; })) return { label: 'Degraded', tone: 'yellow' };
    if (list.some(function (f) { return f.status === 'pending'; })) return { label: 'Starting', tone: 'yellow' };
    return { label: 'Operational', tone: 'green' };
  }
  function setHealth(features) {
    var h = computeHealth(features);
    var badge = document.getElementById('globalBadge');
    if (!badge) return;
    badge.className = 'global-badge ' + h.tone;
    document.getElementById('globalBadgeText').textContent = h.label;
  }

  /* ---------- Router ---------- */
  function clearPageTimers() {
    if (pageTimer) { clearInterval(pageTimer); pageTimer = null; }
  }
  function route() {
    clearPageTimers();
    pageRefresh = null;
    var raw = (location.hash || '').replace(/^#\/?/, '').split(/[?#]/)[0];
    var name = ROUTES.indexOf(raw) !== -1 ? raw : 'dashboard';
    currentRoute = name;
    setActiveNav(name);
    document.getElementById('pageTitle').textContent = PAGE_TITLES[name];
    var content = document.getElementById('content');
    content.replaceChildren();
    var pages = {
      dashboard: renderDashboard,
      search: renderSearch,
      reseed: renderReseed,
      activity: renderActivity,
      settings: renderSettings
    };
    pages[name](content);
  }
  function startRouter() {
    if (routerStarted) { route(); return; }
    routerStarted = true;
    window.addEventListener('hashchange', route);
    if (ROUTES.indexOf((location.hash || '').replace(/^#\/?/, '')) === -1) {
      history.replaceState(null, '', '#/dashboard');
    }
    route();
  }

  /* ---------- Login ---------- */
  function showLogin(note) {
    clearPageTimers();
    var root = document.getElementById('overlayRoot');
    if (!root) return;
    root.replaceChildren();
    var input = el('input', { class: 'input', type: 'password', id: 'loginKey', placeholder: 'Dashboard key', autocomplete: 'current-password' });
    var err = el('div', { class: 'login-error' });
    var btn = el('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'Unlock' });
    var form = el('form', { class: 'login-form' }, input, err, btn);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var val = input.value.trim();
      if (!val) { err.textContent = 'Please enter the dashboard key.'; input.focus(); return; }
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'Verifying…';
      setKey(val);
      try {
        var cfg = await fetchConfigRaw();
        config = cfg && typeof cfg === 'object' ? cfg : config;
        updateSidebarFooter();
        root.replaceChildren();
        closeSidebar();
        if (!routerStarted) startRouter(); else route();
        toast('Connected', 'success');
      } catch (ex) {
        clearKey();
        err.textContent = ex && ex.auth
          ? 'That key was not accepted. Please try again.'
          : 'Could not verify: ' + (ex && ex.message ? ex.message : 'unknown error');
        btn.disabled = false; btn.textContent = 'Unlock';
        input.select();
      }
    });
    var card = el('div', { class: 'login-card' },
      el('div', { class: 'login-mark', html: svgMarkup('logo') }),
      el('h2', { class: 'login-title', text: 'Dashboard locked' }),
      el('p', { class: 'login-sub', text: 'Enter the dashboard key configured for this proxy to continue.' }),
      note ? el('p', { class: 'login-note', text: note }) : null,
      form,
      el('div', { class: 'login-foot', text: 'The key is stored only in this browser.' })
    );
    root.appendChild(el('div', { class: 'overlay' }, card));
    setTimeout(function () { input.focus(); }, 0);
  }
  function logoutUser() {
    clearKey();
    config.authRequired = true;
    updateSidebarFooter();
    showLogin('You have been signed out.');
  }

  /* ---------- Page: Dashboard ---------- */
  function renderDashboard(c) {
    var stats = el('section', { class: 'stats-grid' });
    renderSkeletonCards(stats, 4);

    var featureBody = el('div', { class: 'table-wrap' }, loadingBlock('Loading feature status…'));
    var testBtn = el('button', { class: 'btn btn-sm', type: 'button', text: 'Run tests' });
    var featureCard = el('section', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', { class: 'card-title-h', text: 'Feature Health' }), testBtn),
      featureBody
    );

    var eventBody = el('div', { class: 'event-list' }, loadingBlock('Loading activity…'));
    var eventsCard = el('section', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h2', { class: 'card-title-h', text: 'Recent Activity' }),
        el('a', { class: 'link-sm', href: '#/activity', text: 'View all →' })),
      eventBody
    );

    c.append(pageHead('Overview', 'Live health and recent activity of the proxy.'), stats,
      el('div', { class: 'grid-2' }, featureCard, eventsCard));

    var busy = false;
    function load(silent) {
      if (busy) return;
      busy = true;
      Promise.all([
        api('/api/ui/status'),
        api('/api/ui/metrics').catch(function () { return null; })
      ]).then(function (res) {
        var status = res[0] || {};
        var metrics = res[1] || {};
        if (!isLive(stats) || !isLive(featureBody) || !isLive(eventBody)) return;
        renderStatCards(stats, status, metrics);
        renderFeatureTable(featureBody, status.features || {});
        renderEventList(eventBody, status.events || [], 8);
        setHealth(status.features || {});
      }).catch(function () { /* api() already toasted */ })
        .then(function () { busy = false; });
    }
    function runTests() {
      testBtn.disabled = true;
      var old = testBtn.textContent;
      testBtn.textContent = 'Running…';
      api('/api/ui/test', { method: 'POST' }).then(function (res) {
        toast(res && res.ok === false ? 'Tests reported failures' : 'Feature tests completed',
          res && res.ok === false ? 'warn' : 'success');
        load(false);
      }).catch(function () { /* toast handled */ })
        .then(function () { testBtn.disabled = false; testBtn.textContent = old; });
    }
    testBtn.addEventListener('click', runTests);

    pageRefresh = function () { load(false); };
    load(false);
    pageTimer = setInterval(function () { if (currentRoute === 'dashboard') load(true); }, 30000);
  }

  function renderStatCards(host, status, metrics) {
    var hits = num(metrics.cache && metrics.cache.hits);
    var misses = num(metrics.cache && metrics.cache.misses);
    var rate = (hits + misses) > 0 ? (hits / (hits + misses) * 100) : 0;
    var total = num(metrics.requests && metrics.requests.total);
    var session = status.sessionState || 'unknown';
    var cards = [
      {
        label: 'Session State', value: session,
        tone: session === 'authenticated' ? 'green' : session === 'error' || session === 'failed' ? 'red' : '',
        sub: 'TorrentBD login session'
      },
      { label: 'Uptime', value: formatUptime(status.uptimeSeconds), sub: 'Since last restart' },
      { label: 'Cache Hit Rate', value: rate.toFixed(1) + '%', sub: formatNumber(hits) + ' hits · ' + formatNumber(misses) + ' misses' },
      { label: 'Total Requests', value: formatNumber(total), sub: topStatus(metrics.requests && metrics.requests.byStatus) }
    ];
    host.replaceChildren.apply(host, cards.map(cardNode));
  }
  function topStatus(byStatus) {
    if (!byStatus || typeof byStatus !== 'object') return 'No request data';
    var keys = Object.keys(byStatus);
    if (!keys.length) return 'No request data';
    keys.sort(function (a, b) { return num(byStatus[b]) - num(byStatus[a]); });
    return 'Top status ' + keys[0] + ' · ' + formatNumber(num(byStatus[keys[0]]));
  }
  function renderFeatureTable(host, features) {
    var list = Object.values(features || {});
    if (!list.length) { host.replaceChildren(emptyState('No feature data yet')); return; }
    var tbody = el('tbody');
    list.forEach(function (f) {
      tbody.appendChild(el('tr', {},
        el('td', {}, el('span', { class: 'cell-title', text: f.name || f.id || '—' })),
        el('td', {}, pill(f.status || 'unknown', toneForStatus(f.status))),
        el('td', { class: 'num', text: f.latencyMs ? formatNumber(f.latencyMs) + ' ms' : '—' }),
        el('td', { class: 'muted', text: f.lastCheckedAt ? formatDate(f.lastCheckedAt) : 'Never' }),
        el('td', { class: 'muted details-cell', text: f.details || '—' })
      ));
    });
    var table = el('table', {},
      el('thead', {}, el('tr', {}, ['Name', 'Status', 'Latency', 'Last checked', 'Details'].map(function (h) { return el('th', { text: h }); }))),
      tbody
    );
    host.replaceChildren(table);
  }
  function renderEventList(host, events, limit) {
    var list = (events || []).slice().reverse().slice(0, limit || (events || []).length);
    if (!list.length) { host.replaceChildren(emptyState('No events recorded')); return; }
    host.replaceChildren.apply(host, list.map(function (e) {
      return el('div', { class: 'event-row ' + (e.level || 'info') },
        el('span', { class: 'event-time', text: formatDate(e.timestamp) }),
        pill(e.level || 'info', toneForLevel(e.level)),
        el('span', { class: 'event-msg', text: e.message || '' })
      );
    }));
  }

  /* ---------- Page: Search ---------- */
  function renderSearch(c) {
    var input = el('input', { class: 'input', type: 'search', id: 'searchInput', placeholder: 'Search by title or keywords…', autocomplete: 'off' });
    var catGrid = el('div', { class: 'check-grid' });
    CATS.forEach(function (cat) {
      var box = el('input', { type: 'checkbox', value: String(cat.id), id: 'cat' + cat.id });
      catGrid.appendChild(el('label', { class: 'check', for: 'cat' + cat.id },
        box, el('span', { text: cat.name }), el('span', { class: 'muted', text: '(' + cat.id + ')' })));
    });
    var count = el('span', { class: 'muted', text: '' });
    var results = el('div', { id: 'searchResults' },
      emptyState('Ready to search', 'Enter a query or choose categories, then press Search.'));
    var searchBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Search' });

    var searchCard = el('section', { class: 'card' },
      el('div', { class: 'search-row' },
        el('div', { class: 'search-input-wrap' }, icon('search'), input), searchBtn),
      el('div', { class: 'cat-block' }, el('div', { class: 'field-label', text: 'Categories' }), catGrid)
    );
    var resultsCard = el('section', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', { class: 'card-title-h', text: 'Results' }), count),
      results
    );
    c.append(pageHead('Search', 'Query the Torznab proxy index in real time.'), searchCard, resultsCard);

    function doSearch() {
      var q = input.value.trim();
      var selected = Array.prototype.slice.call(catGrid.querySelectorAll('input:checked')).map(function (x) { return x.value; });
      if (!q && !selected.length) { toast('Enter a search term or select a category', 'warn'); return; }
      results.replaceChildren(loadingBlock('Searching torrents…'));
      count.textContent = '';
      api('/api/ui/search?q=' + encodeURIComponent(q) + '&cat=' + encodeURIComponent(selected.join(',')))
        .then(function (data) {
          if (!isLive(results)) return;
          drawResults(results, count, (data && data.items) || []);
        })
        .catch(function () {
          if (isLive(results)) results.replaceChildren(emptyState('Search failed', 'Check the connection and try again.'));
        });
    }
    searchBtn.addEventListener('click', doSearch);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
    pageRefresh = doSearch;
  }

  function drawResults(host, countEl, items) {
    countEl.textContent = items.length + ' result' + (items.length === 1 ? '' : 's');
    if (!items.length) { host.replaceChildren(emptyState('No results found', 'Try a different query or category.')); return; }
    var tbody = el('tbody');
    items.forEach(function (it) {
      var titleCell = el('td', {}, el('span', { class: 'cell-title', text: it.title || 'Untitled' }));
      if (it.freeleech) titleCell.appendChild(pill('freeleech', 'green'));
      var href = safeUrl(it.downloadUrl);
      tbody.appendChild(el('tr', {},
        titleCell,
        el('td', { class: 'num', text: formatBytes(it.sizeBytes) }),
        el('td', { class: 'num' },
          el('span', { class: 'green', text: formatNumber(num(it.seeders)) }),
          el('span', { class: 'muted', text: ' / ' }),
          el('span', { class: 'red', text: formatNumber(num(it.leechers)) })),
        el('td', { class: 'muted', text: formatDate(it.publishDate, false) }),
        el('td', {}, pill(CAT_LABEL[it.torznabCategoryId] || ('Cat ' + it.torznabCategoryId), 'accent')),
        el('td', {}, href
          ? el('a', { class: 'btn btn-sm', href: href, target: '_blank', rel: 'noopener noreferrer', text: 'Download' })
          : el('span', { class: 'muted', text: '—' }))
      ));
    });
    host.replaceChildren(el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {}, ['Title', 'Size', 'Seeders / Leechers', 'Published', 'Category', 'Action'].map(function (h) { return el('th', { text: h }); }))),
        tbody
      )
    ));
  }

  /* ---------- Page: Reseed Requests ---------- */
  function renderReseed(c) {
    var view = 'active';
    var data = null;

    var stats = el('section', { class: 'stats-grid' });
    renderSkeletonCards(stats, 3);

    var tabs = el('div', { class: 'tabs' });
    [['active', 'Active requests'], ['history', 'History']].forEach(function (pair, index) {
      tabs.appendChild(el('button', {
        class: 'tab' + (index === 0 ? ' active' : ''), type: 'button', text: pair[1],
        onclick: function () {
          if (view === pair[0]) return;
          view = pair[0];
          Array.prototype.forEach.call(tabs.children, function (b, i) {
            b.classList.toggle('active', (i === 0 ? 'active' : 'history') === view);
          });
          filter.value = '';
          body.replaceChildren(loadingBlock('Loading…'));
          load();
        }
      }));
    });
    var filter = el('input', { class: 'input input-sm', type: 'text', placeholder: 'Filter by title or ID…', oninput: draw });
    var refreshBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Refresh', onclick: refresh });
    var body = el('div', { id: 'reseedBody' }, loadingBlock('Loading requests…'));
    var card = el('section', { class: 'card' },
      el('div', { class: 'card-head' }, tabs, el('div', { class: 'head-tools' }, filter, refreshBtn)),
      body
    );
    c.append(pageHead('Reseed Requests', 'Track reseed bonus requests and sync history.'), stats, card);

    function draw() {
      if (!data || !isLive(body)) return;
      var q = filter.value.trim().toLowerCase();
      var list = (data.requests || []).filter(function (r) {
        return !q || String(r.title || '').toLowerCase().indexOf(q) !== -1 ||
          String(r.torrentId === undefined ? r.id : r.torrentId).indexOf(q) !== -1;
      });
      if (!list.length) {
        body.replaceChildren(emptyState(q ? 'No matching requests' : (view === 'history' ? 'No history yet' : 'No active requests'),
          q ? 'Try a different filter.' : null));
        return;
      }
      var tbody = el('tbody');
      list.forEach(function (r) {
        var id = String(r.torrentId === undefined ? (r.id === undefined ? '—' : r.id) : r.torrentId);
        var cells = [
          el('td', {}, el('span', { class: 'cell-title', text: r.title || 'Untitled' })),
          el('td', { class: 'muted num', text: id }),
          el('td', { class: 'num', text: formatNumber(num(r.seedBonus)) })
        ];
        if (view === 'active') {
          var href = safeUrl('/reseed-download?id=' + encodeURIComponent(id));
          cells.push(el('td', {}, href
            ? el('a', { class: 'btn btn-sm', href: href, target: '_blank', rel: 'noopener noreferrer', text: 'Download' })
            : el('span', { class: 'muted', text: '—' })));
        } else {
          cells.push(el('td', { class: 'muted', text: formatFullDate(r.removedAt || r.removed_at || r.historyAt) }));
        }
        tbody.appendChild(el('tr', {}, cells));
      });
      var headers = ['Title', 'Torrent ID', 'Seed Bonus', view === 'active' ? 'File' : 'Removed'];
      body.replaceChildren(el('div', { class: 'table-wrap' },
        el('table', {},
          el('thead', {}, el('tr', {}, headers.map(function (h) { return el('th', { text: h }); }))),
          tbody
        )
      ));
    }
    function renderStats() {
      var requests = (data && data.requests) || [];
      var bonus = requests.reduce(function (s, r) { return s + num(r.seedBonus); }, 0);
      var cards;
      if (view === 'history') {
        cards = [
          { label: 'History entries', value: formatNumber(requests.length), sub: 'Removed requests' },
          { label: 'Seed bonus (history)', value: formatNumber(bonus), sub: 'Across removed requests' },
          { label: 'Latest removal', value: formatFullDate(requests.length ? (requests[0].removedAt || requests[0].removed_at || requests[0].historyAt) : null), sub: 'Most recent' }
        ];
      } else {
        cards = [
          { label: 'Active requests', value: formatNumber(num(data && data.count) || requests.length), sub: 'Currently tracked' },
          { label: 'Total seed bonus', value: formatNumber(num(data && data.totalSeedBonus) || bonus), sub: 'Across active requests' },
          { label: 'Last sync', value: formatFullDate(syncTime(data && data.sync)), sub: 'Reseed synchronizer' }
        ];
      }
      stats.replaceChildren.apply(stats, cards.map(cardNode));
    }
    function load() {
      api(view === 'history' ? '/api/ui/reseed-history' : '/api/ui/reseed-data')
        .then(function (res) {
          data = res || {};
          if (!isLive(body)) return;
          renderStats();
          draw();
        })
        .catch(function () { /* toast handled */ });
    }
    function refresh() {
      refreshBtn.disabled = true;
      var old = refreshBtn.textContent;
      refreshBtn.textContent = 'Syncing…';
      api('/api/ui/reseed-refresh', { method: 'POST' })
        .then(function (res) {
          toast(res && res.started ? 'Reseed sync started' : 'Sync already running', 'success');
          if (res && res.sync && data && view === 'active') data.sync = res.sync;
          load();
        })
        .catch(function () { /* toast handled */ })
        .then(function () { refreshBtn.disabled = false; refreshBtn.textContent = old; });
    }
    pageRefresh = load;
    load();
  }
  function syncTime(sync) {
    if (!sync || typeof sync !== 'object') return null;
    return sync.lastSyncAt || sync.lastSync || sync.lastRunAt || sync.lastRun ||
      sync.updatedAt || sync.timestamp || sync.lastCheckedAt || null;
  }

  /* ---------- Page: Activity ---------- */
  function renderActivity(c) {
    var events = [];
    var level = 'all';
    var filters = el('div', { class: 'segmented' });
    ['all', 'info', 'warn', 'error'].forEach(function (l) {
      filters.appendChild(el('button', {
        class: 'tab' + (l === level ? ' active' : ''), type: 'button', text: l.toUpperCase(),
        onclick: function () {
          level = l;
          Array.prototype.forEach.call(filters.children, function (b) {
            b.classList.toggle('active', b.textContent.toLowerCase() === l);
          });
          draw();
        }
      }));
    });
    var count = el('span', { class: 'muted', text: '' });
    var body = el('div', { class: 'event-list event-list-full' }, loadingBlock('Loading events…'));
    var card = el('section', { class: 'card' },
      el('div', { class: 'card-head' }, filters, count), body);
    c.append(pageHead('Activity', 'Full proxy event log.'), card);

    function draw() {
      var list = level === 'all' ? events : events.filter(function (e) { return (e.level || 'info') === level; });
      count.textContent = list.length + ' event' + (list.length === 1 ? '' : 's');
      if (!list.length) { body.replaceChildren(emptyState('No matching events')); return; }
      body.replaceChildren.apply(body, list.map(function (e) {
        return el('div', { class: 'event-row ' + (e.level || 'info') },
          el('span', { class: 'event-time', text: formatFullDate(e.timestamp) }),
          pill(e.level || 'info', toneForLevel(e.level)),
          el('span', { class: 'event-msg', text: e.message || '' })
        );
      }));
    }
    function load() {
      api('/api/ui/status').then(function (data) {
        events = (data && data.events) || [];
        if (!isLive(body)) return;
        draw();
        setHealth((data && data.features) || {});
      }).catch(function () { /* toast handled */ });
    }
    pageRefresh = load;
    load();
  }

  /* ---------- Page: Settings ---------- */
  function renderSettings(c) {
    var configList = el('div', { class: 'kv-list' }, loadingBlock('Loading configuration…'));
    var configCard = el('section', { class: 'card' },
      el('h2', { class: 'card-title-h', text: 'Proxy configuration' }),
      el('div', { style: 'height:14px' }),
      configList,
      el('div', { class: 'callout', text: 'Environment variables are read when the proxy starts. Changing them requires a container rebuild — this page only edits values stored in this browser.' })
    );

    var keyInput = el('input', {
      class: 'input', type: 'password', id: 'keyInput', autocomplete: 'off',
      placeholder: getKey() ? '•••••••• (saved)' : 'Enter dashboard key'
    });
    var keyStatus = el('div', { class: 'form-hint', text: getKey() ? 'A dashboard key is stored in this browser.' : 'No dashboard key stored.' });
    var saveBtn = el('button', {
      class: 'btn btn-primary', type: 'button', text: 'Save key',
      onclick: function () {
        var v = keyInput.value.trim();
        if (!v) { toast('Enter a key first', 'warn'); return; }
        setKey(v);
        keyInput.value = '';
        keyInput.placeholder = '•••••••• (saved)';
        keyStatus.textContent = 'Dashboard key saved locally.';
        toast('Dashboard key saved', 'success');
        loadConfig();
      }
    });
    var testBtn = el('button', {
      class: 'btn', type: 'button', text: 'Test connection',
      onclick: function () {
        testBtn.disabled = true;
        var old = testBtn.textContent;
        testBtn.textContent = 'Testing…';
        api('/api/ui/config').then(function (res) {
          keyStatus.textContent = 'Connection OK · version ' + (res && res.version ? res.version : '—');
          toast('Connection successful', 'success');
        }).catch(function (e) {
          keyStatus.textContent = 'Connection failed: ' + e.message;
        }).then(function () { testBtn.disabled = false; testBtn.textContent = old; });
      }
    });
    var keyCard = el('section', { class: 'card' },
      el('h2', { class: 'card-title-h', text: 'Dashboard key' }),
      el('div', { style: 'height:6px' }),
      el('p', { class: 'muted', text: 'Used to authorize this browser against the proxy dashboard API.' }),
      el('div', { style: 'height:14px' }),
      el('div', { class: 'form-row' }, keyInput, saveBtn, testBtn),
      keyStatus
    );
    c.append(pageHead('Settings', 'Proxy configuration and local dashboard access.'), configCard, keyCard);

    function loadConfig() {
      api('/api/ui/config').then(function (cfg) {
        config = cfg && typeof cfg === 'object' ? cfg : config;
        updateSidebarFooter();
        if (!isLive(configList)) return;
        var rows = [
          ['Auth required', config.authRequired ? 'Yes' : 'No'],
          ['Version', config.version || '—'],
          ['Base URL', config.baseUrl || '—'],
          ['Dashboard key', getKey() ? 'Set' : 'Not set']
        ];
        configList.replaceChildren.apply(configList, rows.map(function (row) {
          return el('div', { class: 'kv-row' },
            el('div', { class: 'kv-key', text: row[0] }),
            el('div', { class: 'kv-val', text: String(row[1]) }));
        }));
      }).catch(function () { /* toast handled */ });
    }
    pageRefresh = loadConfig;
    loadConfig();
  }

  /* ---------- Boot ---------- */
  async function init() {
    buildShell();
    buildNav();
    bindGlobal();
    try {
      var cfg = await fetchConfigRaw();
      config = cfg && typeof cfg === 'object' ? cfg : config;
    } catch (ex) {
      if (ex && ex.auth) { showLogin(); return; }
      toast('Could not load configuration: ' + (ex && ex.message ? ex.message : 'unknown error'), 'error');
    }
    updateSidebarFooter();
    if (config.authRequired && !getKey()) { showLogin(); return; }
    startRouter();
  }
  init();
})();
