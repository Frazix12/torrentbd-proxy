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
          <label for="minSizeInput">Min Size</label>
          <input type="number" id="minSizeInput" class="filter-input" min="0" placeholder="Min bytes" />
        </div>
        <div class="filter-group">
          <label for="maxSizeInput">Max Size</label>
          <input type="number" id="maxSizeInput" class="filter-input" min="0" placeholder="Max bytes" />
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
      <div class="table-responsive">
        <table id="reseedTable">
          <thead>
            <tr id="tableHeaderRow"></tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
      <div id="emptyState" class="empty-state" style="display: none;">
        No reseed requests match the current filters.
      </div>
    </div>
  </div>

  <script type="module" src="/reseed-ui.js"></script>
</body>
</html>`;
}
