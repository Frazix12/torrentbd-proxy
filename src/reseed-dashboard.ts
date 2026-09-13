// src/reseed-dashboard.ts
// Static HTML renderer for the reseed requests dashboard.

export function renderReseedDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TorrentBD Reseed Requests</title>
  <style>
    :root {
      --bg: #121316;
      --card: #1c1e24;
      --border: #2c2f38;
      --text: #e1e4ea;
      --muted: #8b92a5;
      --accent: #4c82fb;
      --green: #2ecc71;
      --red: #e74c3c;
      --yellow: #f1c40f;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    h1 { font-size: 24px; font-weight: 600; }
    .nav-links {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .nav-link {
      color: var(--accent);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 6px;
      background: rgba(76, 130, 251, 0.1);
      border: 1px solid rgba(76, 130, 251, 0.25);
      transition: background 0.2s;
    }
    .nav-link:hover { background: rgba(76, 130, 251, 0.2); }
    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      color: var(--text);
    }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.1); }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .card-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .card-val { font-size: 18px; font-weight: 600; word-break: break-all; }
    .state-ok { color: var(--green); }
    .state-running { color: var(--yellow); }
    .state-error { color: var(--red); }

    .filters-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 24px;
    }
    .filters-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .filters-header h2 { font-size: 16px; font-weight: 600; }
    .subtext { font-size: 12px; color: var(--muted); }

    .filters-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      align-items: end;
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .filter-group label {
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
    }
    .filter-input, .filter-select {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      padding: 7px 10px;
      font-size: 13px;
      width: 100%;
      outline: none;
    }
    .filter-input:focus, .filter-select:focus {
      border-color: var(--accent);
    }
    .filter-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 14px;
    }

    .error-banner {
      background: rgba(231, 76, 60, 0.15);
      border: 1px solid rgba(231, 76, 60, 0.35);
      color: var(--red);
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 13px;
    }

    .table-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .table-responsive {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      white-space: nowrap;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      font-weight: 600;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.02);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      user-select: none;
    }
    th.sortable {
      cursor: pointer;
    }
    th.sortable:hover {
      color: var(--text);
    }
    th.sorted-asc, th.sorted-desc {
      color: var(--accent);
    }
    .sort-arrow {
      font-size: 10px;
      margin-left: 4px;
    }
    tbody tr:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    .torrent-title-link {
      color: var(--text);
      text-decoration: none;
      font-weight: 500;
    }
    .torrent-title-link:hover {
      color: var(--accent);
      text-decoration: underline;
    }
    .actions-cell {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .btn-action {
      display: inline-block;
      text-decoration: none;
      font-size: 11px;
      font-weight: 500;
      padding: 3px 8px;
      border-radius: 4px;
      transition: background 0.2s;
    }
    .btn-download {
      background: rgba(46, 204, 113, 0.15);
      color: var(--green);
      border: 1px solid rgba(46, 204, 113, 0.35);
    }
    .btn-download:hover {
      background: rgba(46, 204, 113, 0.25);
    }
    .btn-open {
      background: rgba(76, 130, 251, 0.15);
      color: var(--accent);
      border: 1px solid rgba(76, 130, 251, 0.35);
    }
    .btn-open:hover {
      background: rgba(76, 130, 251, 0.25);
    }
    .empty-state {
      padding: 32px;
      text-align: center;
      color: var(--muted);
      font-size: 14px;
    }

    .results-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .toolbar-left, .toolbar-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .view-toggle {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.02);
    }
    .btn-view {
      background: transparent;
      color: var(--muted);
      border: none;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .btn-view.active {
      background: var(--accent);
      color: #fff;
    }
    .btn-view:not(.active):hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text);
    }
    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .select-compact {
      width: auto;
      padding: 5px 8px;
      font-size: 12px;
    }
    .btn-compact {
      padding: 5px 12px;
      font-size: 12px;
    }
    .page-info {
      font-size: 13px;
      color: var(--muted);
      white-space: nowrap;
      padding: 0 4px;
    }
    .reseed-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }
    .reseed-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      transition: border-color 0.2s, background 0.2s;
    }
    .reseed-card:hover {
      border-color: rgba(76, 130, 251, 0.4);
      background: rgba(255, 255, 255, 0.04);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .category-badge {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(76, 130, 251, 0.15);
      color: var(--accent);
      border: 1px solid rgba(76, 130, 251, 0.3);
      max-width: 65%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bonus-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(241, 196, 15, 0.15);
      color: var(--yellow);
      border: 1px solid rgba(241, 196, 15, 0.3);
      white-space: nowrap;
    }
    .card-title-text {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
      word-break: break-word;
    }
    .card-details-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .meta-label {
      color: var(--muted);
    }
    .meta-val {
      color: var(--text);
      font-weight: 500;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>TorrentBD Reseed Requests</h1>
      <div class="nav-links">
        <a href="/" class="nav-link">Status Dashboard</a>
        <button id="refreshBtn" class="btn">Refresh</button>
      </div>
    </header>

    <div id="errorState" class="error-banner" style="display: none;"></div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Active Requests</div>
        <div id="summaryCount" class="card-val">-</div>
      </div>
      <div class="card">
        <div class="card-title">Total Bonus Offered</div>
        <div id="summaryBonus" class="card-val">-</div>
      </div>
      <div class="card">
        <div class="card-title">Last Sync Time</div>
        <div id="summarySyncTime" class="card-val">-</div>
      </div>
      <div class="card">
        <div class="card-title">Sync State</div>
        <div id="summaryState" class="card-val">-</div>
      </div>
    </div>

    <div class="filters-card">
      <div class="filters-header">
        <h2>Filters & Search</h2>
        <span id="matchCount" class="subtext">Loading requests...</span>
      </div>
      <div class="filters-grid">
        <div class="filter-group">
          <label for="searchInput">Search</label>
          <input type="text" id="searchInput" class="filter-input" placeholder="Title, ID, requester..." />
        </div>
        <div class="filter-group">
          <label for="categorySelect">Category</label>
          <select id="categorySelect" class="filter-select">
            <option value="">All Categories</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="requesterSelect">Requester</label>
          <select id="requesterSelect" class="filter-select">
            <option value="">All Requesters</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="minBonusInput">Min Bonus</label>
          <input type="number" id="minBonusInput" class="filter-input" min="0" placeholder="Min bonus" />
        </div>
        <div class="filter-group">
          <label for="maxBonusInput">Max Bonus</label>
          <input type="number" id="maxBonusInput" class="filter-input" min="0" placeholder="Max bonus" />
        </div>
        <div class="filter-group">
          <label for="fromDateInput">From Date</label>
          <input type="date" id="fromDateInput" class="filter-input" />
        </div>
        <div class="filter-group">
          <label for="toDateInput">To Date</label>
          <input type="date" id="toDateInput" class="filter-input" />
        </div>
      </div>
      <div class="filter-actions">
        <button id="clearFiltersBtn" type="button" class="btn btn-secondary">Clear Filters</button>
      </div>
    </div>

    <div class="table-card">
      <div class="results-toolbar">
        <div class="toolbar-left">
          <div class="view-toggle" role="group" aria-label="View mode">
            <button id="tableViewBtn" class="btn-view active" type="button" aria-pressed="true">Table</button>
            <button id="gridViewBtn" class="btn-view" type="button" aria-pressed="false">Grid</button>
          </div>
          <div class="sort-control">
            <select id="sortSelect" class="filter-select select-compact" aria-label="Sort by">
              <option value="seedBonus:desc">Bonus (High to Low)</option>
              <option value="seedBonus:asc">Bonus (Low to High)</option>
              <option value="requestedAt:desc" selected>Date (Newest first)</option>
              <option value="requestedAt:asc">Date (Oldest first)</option>
              <option value="title:asc">Title (A–Z)</option>
              <option value="title:desc">Title (Z–A)</option>
              <option value="category:asc">Category (A–Z)</option>
            </select>
          </div>
        </div>
        <div class="toolbar-right">
          <div class="pagination-controls">
            <label for="pageSizeSelect" class="subtext">Per page:</label>
            <select id="pageSizeSelect" class="filter-select select-compact">
              <option value="25">25</option>
              <option value="50" selected>50</option>
              <option value="100">100</option>
              <option value="all">All</option>
            </select>
            <button id="prevPageBtn" class="btn btn-secondary btn-compact" type="button" disabled>◀ Prev</button>
            <span id="pageInfo" class="page-info">Page 1 of 1</span>
            <button id="nextPageBtn" class="btn btn-secondary btn-compact" type="button" disabled>Next ▶</button>
          </div>
        </div>
      </div>
      <div id="tableWrapper" class="table-responsive">
        <table id="reseedTable">
          <thead>
            <tr id="tableHeaderRow"></tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
      <div id="gridWrapper" class="reseed-grid" style="display: none;"></div>
      <div id="emptyState" class="empty-state" style="display: none;">
        No reseed requests match the current filters.
      </div>
    </div>
  </div>

  <div class="container" style="margin-top: 32px;">
    <details id="historySection">
      <summary style="cursor:pointer; font-size:18px; font-weight:600; padding: 12px 0; color: var(--text);">Recently Fulfilled / Removed <span id="historyCount" style="font-size:13px; color:var(--muted); font-weight:400;"></span></summary>
      <div id="historyList" style="margin-top:12px; overflow-x:auto;">
        <p style="color:var(--muted);">Loading…</p>
      </div>
    </details>
  </div>

  <script type="module" src="/reseed-ui.js"></script>
</body>
</html>`;
}
