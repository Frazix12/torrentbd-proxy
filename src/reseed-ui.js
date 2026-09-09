// src/reseed-ui.js
// Browser filtering, sorting, safe DOM rendering, and refresh behavior for reseed requests.

/**
 * Extracts YYYY-MM-DD from a date string or timestamp.
 * @param {string | null | undefined} str
 * @returns {string | null}
 */
function parseDateToYmd(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mon}-${day}`;
  }
  return null;
}

/**
 * Filters requests array based on provided filter options using AND semantics.
 * @param {Array<object>} requests
 * @param {object} filters
 * @returns {Array<object>}
 */
export function filterRequests(requests, filters) {
  if (!Array.isArray(requests)) return [];
  if (!filters || typeof filters !== "object") return requests.slice();

  const query = filters.query
    ? String(filters.query).toLocaleLowerCase().trim()
    : "";
  const category =
    filters.category && String(filters.category).trim() !== ""
      ? String(filters.category).trim()
      : null;
  const requester =
    filters.requester && String(filters.requester).trim() !== ""
      ? String(filters.requester).trim()
      : null;

  const minBonus =
    filters.minBonus != null && Number.isFinite(Number(filters.minBonus))
      ? Number(filters.minBonus)
      : null;
  const maxBonus =
    filters.maxBonus != null && Number.isFinite(Number(filters.maxBonus))
      ? Number(filters.maxBonus)
      : null;
  const minSize =
    filters.minSize != null && Number.isFinite(Number(filters.minSize))
      ? Number(filters.minSize)
      : null;
  const maxSize =
    filters.maxSize != null && Number.isFinite(Number(filters.maxSize))
      ? Number(filters.maxSize)
      : null;

  const fromDate =
    filters.fromDate && String(filters.fromDate).trim() !== ""
      ? String(filters.fromDate).trim()
      : null;
  const toDate =
    filters.toDate && String(filters.toDate).trim() !== ""
      ? String(filters.toDate).trim()
      : null;

  return requests.filter((row) => {
    if (!row || typeof row !== "object") return false;

    // Text search: matches title, torrentId, or requester
    if (query) {
      const title = String(row.title ?? "").toLocaleLowerCase();
      const torrentId = String(row.torrentId ?? "").toLocaleLowerCase();
      const req = String(row.requester ?? "").toLocaleLowerCase();
      if (
        !title.includes(query) &&
        !torrentId.includes(query) &&
        !req.includes(query)
      ) {
        return false;
      }
    }

    // Category filter
    if (category) {
      if (String(row.category ?? "").trim() !== category) {
        return false;
      }
    }

    // Requester filter
    if (requester) {
      if (String(row.requester ?? "").trim() !== requester) {
        return false;
      }
    }

    // Seed Bonus range filter
    if (minBonus != null) {
      if (row.seedBonus == null || row.seedBonus < minBonus) return false;
    }
    if (maxBonus != null) {
      if (row.seedBonus == null || row.seedBonus > maxBonus) return false;
    }

    // Size range filter (sizeBytes)
    if (minSize != null) {
      if (row.sizeBytes == null || row.sizeBytes < minSize) return false;
    }
    if (maxSize != null) {
      if (row.sizeBytes == null || row.sizeBytes > maxSize) return false;
    }

    // Date range filter
    if (fromDate || toDate) {
      const ymd = parseDateToYmd(row.requestedAt);
      if (!ymd) return false;
      if (fromDate && ymd < fromDate) return false;
      if (toDate && ymd > toDate) return false;
    }

    return true;
  });
}

/**
 * Sorts requests by key and direction, placing nulls/empty last in both directions.
 * @param {Array<object>} requests
 * @param {object} sort
 * @returns {Array<object>}
 */
export function sortRequests(requests, sort) {
  if (!Array.isArray(requests)) return [];
  const list = requests.slice();
  if (!sort || !sort.key) return list;

  const key = sort.key;
  const direction = sort.direction === "desc" ? "desc" : "asc";

  return list.sort((a, b) => {
    let valA = a == null ? null : a[key];
    let valB = b == null ? null : b[key];

    if (key.startsWith("details.")) {
      const detailKey = key.slice("details.".length);
      valA = a && a.details ? a.details[detailKey] : null;
      valB = b && b.details ? b.details[detailKey] : null;
    }

    const aNull = valA === null || valA === undefined || valA === "";
    const bNull = valB === null || valB === undefined || valB === "";

    if (aNull && bNull) return 0;
    if (aNull) return 1; // nulls last in either direction
    if (bNull) return -1; // nulls last in either direction

    let cmp = 0;
    if (typeof valA === "number" && typeof valB === "number") {
      cmp = valA - valB;
    } else if (key === "requestedAt") {
      const timeA = new Date(valA).getTime();
      const timeB = new Date(valB).getTime();
      if (!isNaN(timeA) && !isNaN(timeB)) {
        cmp = timeA - timeB;
      } else {
        cmp = String(valA).localeCompare(String(valB));
      }
    } else if (key === "torrentId") {
      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB)) {
        cmp = numA - numB;
      } else {
        cmp = String(valA).localeCompare(String(valB));
      }
    } else {
      cmp = String(valA).localeCompare(String(valB), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }

    return direction === "desc" ? -cmp : cmp;
  });
}

export function paginateRequests(requests, page = 1, pageSize = 50) {
  if (!Array.isArray(requests)) {
    return { items: [], page: 1, totalPages: 1, totalItems: 0 };
  }
  if (pageSize === "all" || !pageSize || pageSize <= 0) {
    return {
      items: requests,
      page: 1,
      totalPages: 1,
      totalItems: requests.length,
    };
  }
  const size = Number(pageSize);
  const totalItems = requests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const validPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (validPage - 1) * size;
  const items = requests.slice(start, start + size);
  return {
    items,
    page: validPage,
    totalPages,
    totalItems,
  };
}

// Browser DOM controller
let allRequests = [];
let detailColumns = [];
const currentSort = { key: "requestedAt", direction: "desc" };
let currentView = "table";
let currentPage = 1;
let currentPageSize = 50;

function parseNonNegativeNumber(val) {
  if (val == null || val === "") return null;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function getCurrentFilters() {
  const searchInput = document.getElementById("searchInput");
  const categorySelect = document.getElementById("categorySelect");
  const requesterSelect = document.getElementById("requesterSelect");
  const minBonusInput = document.getElementById("minBonusInput");
  const maxBonusInput = document.getElementById("maxBonusInput");
  const minSizeInput = document.getElementById("minSizeInput");
  const maxSizeInput = document.getElementById("maxSizeInput");
  const fromDateInput = document.getElementById("fromDateInput");
  const toDateInput = document.getElementById("toDateInput");

  return {
    query: searchInput ? searchInput.value : "",
    category: categorySelect ? categorySelect.value : "",
    requester: requesterSelect ? requesterSelect.value : "",
    minBonus: minBonusInput
      ? parseNonNegativeNumber(minBonusInput.value)
      : null,
    maxBonus: maxBonusInput
      ? parseNonNegativeNumber(maxBonusInput.value)
      : null,
    minSize: minSizeInput ? parseNonNegativeNumber(minSizeInput.value) : null,
    maxSize: maxSizeInput ? parseNonNegativeNumber(maxSizeInput.value) : null,
    fromDate: fromDateInput ? fromDateInput.value : "",
    toDate: toDateInput ? toDateInput.value : "",
  };
}

function updateSummaryCards(data) {
  const countEl = document.getElementById("summaryCount");
  const bonusEl = document.getElementById("summaryBonus");
  const syncTimeEl = document.getElementById("summarySyncTime");
  const stateEl = document.getElementById("summaryState");
  const errorEl = document.getElementById("errorState");

  const totalCount =
    data.count ?? (Array.isArray(data.requests) ? data.requests.length : 0);
  if (countEl) countEl.textContent = totalCount.toLocaleString();

  let totalBonus = data.totalSeedBonus;
  if (totalBonus == null && Array.isArray(data.requests)) {
    totalBonus = data.requests.reduce((sum, r) => sum + (r.seedBonus || 0), 0);
  }
  if (bonusEl)
    bonusEl.textContent =
      totalBonus == null ? "0" : totalBonus.toLocaleString();

  const sync = data.sync || {};
  if (syncTimeEl) {
    if (sync.lastSuccessfulSyncAt) {
      syncTimeEl.textContent = new Date(
        sync.lastSuccessfulSyncAt,
      ).toLocaleString();
    } else {
      syncTimeEl.textContent = "Never";
    }
  }

  if (stateEl) {
    stateEl.textContent = sync.state || "idle";
    stateEl.className =
      "card-val " +
      (sync.state === "error"
        ? "state-error"
        : sync.state === "running"
          ? "state-running"
          : "state-ok");
  }

  if (errorEl) {
    if (sync.lastError) {
      errorEl.textContent = `Last sync error: ${sync.lastError}`;
      errorEl.style.display = "block";
    } else {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }
  }
}

function populateDropdownOptions() {
  const categorySelect = document.getElementById("categorySelect");
  const requesterSelect = document.getElementById("requesterSelect");

  const currentCat = categorySelect ? categorySelect.value : "";
  const currentReq = requesterSelect ? requesterSelect.value : "";

  const categories = new Set();
  const requesters = new Set();

  for (const r of allRequests) {
    if (r.category && r.category.trim()) categories.add(r.category.trim());
    if (r.requester && r.requester.trim()) requesters.add(r.requester.trim());
  }

  if (categorySelect) {
    while (categorySelect.options.length > 1) categorySelect.remove(1);
    for (const cat of Array.from(categories).sort()) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      if (cat === currentCat) opt.selected = true;
      categorySelect.appendChild(opt);
    }
  }

  if (requesterSelect) {
    while (requesterSelect.options.length > 1) requesterSelect.remove(1);
    for (const req of Array.from(requesters).sort()) {
      const opt = document.createElement("option");
      opt.value = req;
      opt.textContent = req;
      if (req === currentReq) opt.selected = true;
      requesterSelect.appendChild(opt);
    }
  }
}

function renderTableHeaders() {
  const headerRow = document.getElementById("tableHeaderRow");
  if (!headerRow) return;

  while (headerRow.firstChild) {
    headerRow.removeChild(headerRow.firstChild);
  }

  const baseHeaders = [
    { label: "Torrent", key: "title" },
    { label: "Category", key: "category" },
    { label: "Requester", key: "requester" },
    { label: "Seed Bonus", key: "seedBonus" },
    { label: "Requested", key: "requestedAt" },
  ];

  for (const h of baseHeaders) {
    const th = document.createElement("th");
    th.textContent = h.label;
    th.dataset.key = h.key;
    th.className = "sortable";
    if (currentSort.key === h.key) {
      th.classList.add(
        currentSort.direction === "asc" ? "sorted-asc" : "sorted-desc",
      );
      const arrow = document.createElement("span");
      arrow.textContent = currentSort.direction === "asc" ? " ▲" : " ▼";
      arrow.className = "sort-arrow";
      th.appendChild(arrow);
    }
    th.addEventListener("click", () => handleHeaderClick(h.key));
    headerRow.appendChild(th);
  }

  // Extra dynamic detail columns
  for (const detailKey of detailColumns) {
    const th = document.createElement("th");
    th.textContent = detailKey;
    const fullKey = `details.${detailKey}`;
    th.dataset.key = fullKey;
    th.className = "sortable";
    if (currentSort.key === fullKey) {
      th.classList.add(
        currentSort.direction === "asc" ? "sorted-asc" : "sorted-desc",
      );
      const arrow = document.createElement("span");
      arrow.textContent = currentSort.direction === "asc" ? " ▲" : " ▼";
      arrow.className = "sort-arrow";
      th.appendChild(arrow);
    }
    th.addEventListener("click", () => handleHeaderClick(fullKey));
    headerRow.appendChild(th);
  }

  // Actions column (not sortable)
  const actionsTh = document.createElement("th");
  actionsTh.textContent = "Actions";
  actionsTh.className = "actions-col";
  headerRow.appendChild(actionsTh);
}

function handleHeaderClick(key) {
  if (currentSort.key === key) {
    currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
  } else {
    currentSort.key = key;
    currentSort.direction =
      key === "seedBonus" || key === "requestedAt" ? "desc" : "asc";
  }
  syncSortSelect();
  renderTableHeaders();
  renderView();
}

function syncSortSelect() {
  const sortSelect = document.getElementById("sortSelect");
  if (!sortSelect) return;
  const targetVal = `${currentSort.key}:${currentSort.direction}`;
  for (const opt of sortSelect.options) {
    if (opt.value === targetVal) {
      sortSelect.value = targetVal;
      return;
    }
  }
}

function handleSortChange(e) {
  const [key, direction] = e.target.value.split(":");
  if (key && direction) {
    currentSort.key = key;
    currentSort.direction = direction;
    renderTableHeaders();
    renderView();
  }
}

function renderView() {
  const filtered = filterRequests(allRequests, getCurrentFilters());
  const sorted = sortRequests(filtered, currentSort);
  const paginated = paginateRequests(sorted, currentPage, currentPageSize);
  currentPage = paginated.page;

  const matchCountEl = document.getElementById("matchCount");
  if (matchCountEl) {
    if (paginated.totalItems === 0) {
      matchCountEl.textContent = "0 requests found";
    } else if (
      currentPageSize === "all" ||
      paginated.totalItems <= paginated.items.length
    ) {
      matchCountEl.textContent = `Showing all ${paginated.totalItems.toLocaleString()} requests`;
    } else {
      const startIdx = (paginated.page - 1) * Number(currentPageSize) + 1;
      const endIdx = startIdx + paginated.items.length - 1;
      matchCountEl.textContent = `Showing ${startIdx}–${endIdx} of ${paginated.totalItems.toLocaleString()} requests`;
    }
  }

  const pageInfoEl = document.getElementById("pageInfo");
  if (pageInfoEl) {
    pageInfoEl.textContent = `Page ${paginated.page} of ${paginated.totalPages}`;
  }

  const prevBtn = document.getElementById("prevPageBtn");
  if (prevBtn) prevBtn.disabled = paginated.page <= 1;

  const nextPageBtn = document.getElementById("nextPageBtn");
  if (nextPageBtn)
    nextPageBtn.disabled = paginated.page >= paginated.totalPages;

  const emptyState = document.getElementById("emptyState");
  const tableWrapper = document.getElementById("tableWrapper");
  const gridWrapper = document.getElementById("gridWrapper");

  if (paginated.totalItems === 0) {
    if (emptyState) emptyState.style.display = "block";
    if (tableWrapper) tableWrapper.style.display = "none";
    if (gridWrapper) gridWrapper.style.display = "none";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  if (currentView === "grid") {
    if (tableWrapper) tableWrapper.style.display = "none";
    if (gridWrapper) gridWrapper.style.display = "grid";
    renderGridRows(paginated.items);
  } else {
    if (tableWrapper) tableWrapper.style.display = "block";
    if (gridWrapper) gridWrapper.style.display = "none";
    renderTableRows(paginated.items);
  }
}

function renderTableRows(items) {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;

  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }

  for (const row of items) {
    const tr = document.createElement("tr");

    // 1. Torrent title
    const tdTitle = document.createElement("td");
    const titleText = row.title || `Torrent #${row.torrentId}`;
    if (row.detailsUrl && /^https?:\/\//i.test(row.detailsUrl)) {
      const a = document.createElement("a");
      a.href = row.detailsUrl;
      a.textContent = titleText;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "torrent-title-link";
      tdTitle.appendChild(a);
    } else {
      tdTitle.textContent = titleText;
    }
    tr.appendChild(tdTitle);

    // 2. Category
    const tdCategory = document.createElement("td");
    tdCategory.textContent = row.category || "—";
    tr.appendChild(tdCategory);

    // 3. Requester
    const tdRequester = document.createElement("td");
    tdRequester.textContent = row.requester || "—";
    tr.appendChild(tdRequester);

    // 4. Seed Bonus
    const tdBonus = document.createElement("td");
    tdBonus.textContent =
      row.seedBonusText ||
      (row.seedBonus == null ? "—" : row.seedBonus.toLocaleString());
    tr.appendChild(tdBonus);

    // 5. Requested
    const tdRequested = document.createElement("td");
    tdRequested.textContent = row.requestedAt || "—";
    tr.appendChild(tdRequested);

    // Extra dynamic detail columns
    for (const detailKey of detailColumns) {
      const tdDetail = document.createElement("td");
      tdDetail.textContent =
        row.details && row.details[detailKey] ? row.details[detailKey] : "—";
      tr.appendChild(tdDetail);
    }

    // Actions column
    const tdActions = document.createElement("td");
    tdActions.className = "actions-cell";

    // Download action
    if (/^\d+$/.test(String(row.torrentId))) {
      const dlLink = document.createElement("a");
      const params = new URLSearchParams();
      params.set("id", String(row.torrentId));
      dlLink.href = `/reseed-download?${params.toString()}`;
      dlLink.textContent = "Download";
      dlLink.className = "btn-action btn-download";
      dlLink.setAttribute("download", "");
      tdActions.appendChild(dlLink);
    }

    // Open on TorrentBD link
    if (row.detailsUrl && /^https?:\/\//i.test(row.detailsUrl)) {
      const extLink = document.createElement("a");
      extLink.href = row.detailsUrl;
      extLink.textContent = "Open on TBD";
      extLink.target = "_blank";
      extLink.rel = "noopener noreferrer";
      extLink.className = "btn-action btn-open";
      tdActions.appendChild(extLink);
    }

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

function renderGridRows(items) {
  const grid = document.getElementById("gridWrapper");
  if (!grid) return;

  while (grid.firstChild) {
    grid.removeChild(grid.firstChild);
  }

  for (const row of items) {
    const card = document.createElement("div");
    card.className = "reseed-card";

    // Top: Category and Bonus
    const cardTop = document.createElement("div");
    cardTop.className = "card-top";

    const catBadge = document.createElement("span");
    catBadge.className = "category-badge";
    catBadge.textContent = row.category || "Torrent";
    cardTop.appendChild(catBadge);

    const bonusBadge = document.createElement("span");
    bonusBadge.className = "bonus-badge";
    bonusBadge.textContent =
      row.seedBonusText ||
      (row.seedBonus == null
        ? "Reseed"
        : `${row.seedBonus.toLocaleString()} Bonus`);
    cardTop.appendChild(bonusBadge);

    card.appendChild(cardTop);

    // Title
    const titleContainer = document.createElement("div");
    titleContainer.className = "card-title-container";
    const titleText = row.title || `Torrent #${row.torrentId}`;
    if (row.detailsUrl && /^https?:\/\//i.test(row.detailsUrl)) {
      const a = document.createElement("a");
      a.href = row.detailsUrl;
      a.textContent = titleText;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "torrent-title-link card-title-text";
      titleContainer.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.textContent = titleText;
      span.className = "card-title-text";
      titleContainer.appendChild(span);
    }
    card.appendChild(titleContainer);

    // Meta details list
    const metaList = document.createElement("div");
    metaList.className = "card-details-list";

    if (row.requester) {
      metaList.appendChild(createMetaRow("Requested by", row.requester));
    }
    if (row.requestedAt) {
      metaList.appendChild(createMetaRow("Requested at", row.requestedAt));
    }
    if (row.details && typeof row.details === "object") {
      for (const [k, v] of Object.entries(row.details)) {
        if (v) metaList.appendChild(createMetaRow(k, String(v)));
      }
    }
    card.appendChild(metaList);

    // Actions
    const cardActions = document.createElement("div");
    cardActions.className = "card-actions";

    if (/^\d+$/.test(String(row.torrentId))) {
      const dlLink = document.createElement("a");
      const params = new URLSearchParams();
      params.set("id", String(row.torrentId));
      dlLink.href = `/reseed-download?${params.toString()}`;
      dlLink.textContent = "Download";
      dlLink.className = "btn-action btn-download";
      dlLink.setAttribute("download", "");
      cardActions.appendChild(dlLink);
    }

    if (row.detailsUrl && /^https?:\/\//i.test(row.detailsUrl)) {
      const extLink = document.createElement("a");
      extLink.href = row.detailsUrl;
      extLink.textContent = "Open on TBD";
      extLink.target = "_blank";
      extLink.rel = "noopener noreferrer";
      extLink.className = "btn-action btn-open";
      cardActions.appendChild(extLink);
    }

    card.appendChild(cardActions);
    grid.appendChild(card);
  }
}

function createMetaRow(label, value) {
  const row = document.createElement("div");
  row.className = "meta-row";
  const lbl = document.createElement("span");
  lbl.className = "meta-label";
  lbl.textContent = label;
  const val = document.createElement("span");
  val.className = "meta-val";
  val.textContent = value;
  row.appendChild(lbl);
  row.appendChild(val);
  return row;
}

async function loadData() {
  try {
    const res = await fetch("/reseed-data");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allRequests = Array.isArray(data.requests) ? data.requests : [];

    // Derive extra detail columns from union of details
    const keysSet = new Set();
    for (const r of allRequests) {
      if (r && r.details && typeof r.details === "object") {
        for (const k of Object.keys(r.details)) {
          keysSet.add(k);
        }
      }
    }
    detailColumns = Array.from(keysSet).sort();

    updateSummaryCards(data);
    populateDropdownOptions();
    renderTableHeaders();
    syncSortSelect();
    renderView();

    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn && data.sync && data.sync.state === "running") {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Syncing...";
    } else if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh";
    }
  } catch (err) {
    console.error("Failed to load reseed data:", err);
    const errorEl = document.getElementById("errorState");
    if (errorEl) {
      errorEl.textContent = `Error loading data: ${err}`;
      errorEl.style.display = "block";
    }
  }
}

async function handleRefreshClick() {
  const btn = document.getElementById("refreshBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Syncing...";
  }

  try {
    await fetch("/reseed-refresh", { method: "POST" });
    pollUntilSyncComplete();
  } catch (err) {
    console.error("Failed to trigger refresh:", err);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Refresh";
    }
  }
}

let pollTimer = null;
function pollUntilSyncComplete() {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    try {
      const res = await fetch("/reseed-data");
      if (!res.ok) return;
      const data = await res.json();
      updateSummaryCards(data);

      if (!data.sync || data.sync.state !== "running") {
        clearInterval(pollTimer);
        pollTimer = null;
        await loadData();
      }
    } catch {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 2000);
}

function handleClearFilters() {
  const searchInput = document.getElementById("searchInput");
  const categorySelect = document.getElementById("categorySelect");
  const requesterSelect = document.getElementById("requesterSelect");
  const minBonusInput = document.getElementById("minBonusInput");
  const maxBonusInput = document.getElementById("maxBonusInput");
  const minSizeInput = document.getElementById("minSizeInput");
  const maxSizeInput = document.getElementById("maxSizeInput");
  const fromDateInput = document.getElementById("fromDateInput");
  const toDateInput = document.getElementById("toDateInput");

  if (searchInput) searchInput.value = "";
  if (categorySelect) categorySelect.value = "";
  if (requesterSelect) requesterSelect.value = "";
  if (minBonusInput) minBonusInput.value = "";
  if (maxBonusInput) maxBonusInput.value = "";
  if (minSizeInput) minSizeInput.value = "";
  if (maxSizeInput) maxSizeInput.value = "";
  if (fromDateInput) fromDateInput.value = "";
  if (toDateInput) toDateInput.value = "";

  currentPage = 1;
  renderView();
}

function init() {
  const filterInputs = [
    "searchInput",
    "categorySelect",
    "requesterSelect",
    "minBonusInput",
    "maxBonusInput",
    "fromDateInput",
    "toDateInput",
  ];

  for (const id of filterInputs) {
    const el = document.getElementById(id);
    if (el) {
      const onFilterChange = () => {
        currentPage = 1;
        renderView();
      };
      el.addEventListener("input", onFilterChange);
      el.addEventListener("change", onFilterChange);
    }
  }

  const clearBtn = document.getElementById("clearFiltersBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", handleClearFilters);
  }

  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", handleRefreshClick);
  }

  const tableViewBtn = document.getElementById("tableViewBtn");
  const gridViewBtn = document.getElementById("gridViewBtn");

  if (tableViewBtn) {
    tableViewBtn.addEventListener("click", () => {
      currentView = "table";
      tableViewBtn.classList.add("active");
      tableViewBtn.setAttribute("aria-pressed", "true");
      if (gridViewBtn) {
        gridViewBtn.classList.remove("active");
        gridViewBtn.setAttribute("aria-pressed", "false");
      }
      renderView();
    });
  }

  if (gridViewBtn) {
    gridViewBtn.addEventListener("click", () => {
      currentView = "grid";
      gridViewBtn.classList.add("active");
      gridViewBtn.setAttribute("aria-pressed", "true");
      if (tableViewBtn) {
        tableViewBtn.classList.remove("active");
        tableViewBtn.setAttribute("aria-pressed", "false");
      }
      renderView();
    });
  }

  const pageSizeSelect = document.getElementById("pageSizeSelect");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", (e) => {
      currentPageSize =
        e.target.value === "all" ? "all" : Number(e.target.value);
      currentPage = 1;
      renderView();
    });
  }

  const prevPageBtn = document.getElementById("prevPageBtn");
  if (prevPageBtn) {
    prevPageBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderView();
      }
    });
  }

  const nextPageBtn = document.getElementById("nextPageBtn");
  if (nextPageBtn) {
    nextPageBtn.addEventListener("click", () => {
      currentPage++;
      renderView();
    });
  }

  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", handleSortChange);
  }

  loadData();

  // Periodic reload every 30 seconds
  setInterval(loadData, 30000);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
