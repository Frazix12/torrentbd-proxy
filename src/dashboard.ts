// src/dashboard.ts
// Static HTML renderer for the read-only LAN dashboard.

export function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TorrentBD Proxy</title>
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
    .container { max-width: 900px; margin: 0 auto; }
    header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    h1 { font-size: 24px; font-weight: 600; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 500;
      background: var(--card);
      border: 1px solid var(--border);
    }
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
    .card-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 6px; }
    .card-val { font-size: 18px; font-weight: 600; word-break: break-all; }
    .features-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .features-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .features-header h2 { font-size: 16px; font-weight: 600; }
    .subtext { font-size: 12px; color: var(--muted); }
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .feature-item {
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .feature-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .feature-name { font-weight: 600; font-size: 14px; }
    .fbadge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-operational {
      background: rgba(46, 204, 113, 0.15);
      color: var(--green);
      border: 1px solid rgba(46, 204, 113, 0.4);
    }
    .badge-failing {
      background: rgba(231, 76, 60, 0.15);
      color: var(--red);
      border: 1px solid rgba(231, 76, 60, 0.4);
    }
    .badge-pending {
      background: rgba(241, 196, 15, 0.15);
      color: var(--yellow);
      border: 1px solid rgba(241, 196, 15, 0.4);
    }
    .feature-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--muted);
    }
    .feature-details {
      font-size: 12px;
      color: var(--text);
      word-break: break-word;
      opacity: 0.85;
    }
    .test-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .test-btn:hover { opacity: 0.85; }
    .test-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .events-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .events-card h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .event-list {
      list-style: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      max-height: 380px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .event-item {
      padding: 6px 10px;
      border-radius: 4px;
      background: rgba(255,255,255,0.02);
      display: flex;
      gap: 12px;
    }
    .event-time { color: var(--muted); white-space: nowrap; }
    .event-msg { word-break: break-word; }
    .level-info { color: var(--text); }
    .level-warn { color: var(--yellow); }
    .level-error { color: var(--red); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>TorrentBD Proxy</h1>
      <div style="display: flex; gap: 10px; align-items: center;">
        <a href="/reseed" class="test-btn" style="text-decoration: none;">Reseed Requests</a>
        <button id="testBtn" onclick="runManualTest()" class="test-btn">Run Tests Now</button>
        <div id="statusBadge" class="status-badge">Checking...</div>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Session State</div>
        <div id="sessionState" class="card-val">-</div>
      </div>
      <div class="card">
        <div class="card-title">Uptime</div>
        <div id="uptime" class="card-val">-</div>
      </div>
      <div class="card">
        <div class="card-title">Last Login</div>
        <div id="lastLoginAt" class="card-val">-</div>
      </div>
      <div class="card">
        <div class="card-title">Last Error</div>
        <div id="lastError" class="card-val" style="color: var(--red);">-</div>
      </div>
    </div>

    <div class="features-card">
      <div class="features-header">
        <h2>Feature Health</h2>
        <span class="subtext">Auto-checks every 30m</span>
      </div>
      <div id="featuresGrid" class="features-grid">
        <div class="subtext">Waiting for feature status...</div>
      </div>
    </div>

    <div class="events-card">
      <h2>Recent events</h2>
      <ul id="eventsList" class="event-list">
        <li class="event-item"><span class="event-msg">Waiting for events...</span></li>
      </ul>
    </div>
  </div>

  <script>
    function formatUptime(sec) {
      if (sec < 60) return sec + "s";
      const m = Math.floor(sec / 60);
      if (m < 60) return m + "m " + (sec % 60) + "s";
      const h = Math.floor(m / 60);
      return h + "h " + (m % 60) + "m";
    }

    async function runManualTest() {
      const btn = document.getElementById("testBtn");
      btn.disabled = true;
      btn.textContent = "Testing...";
      try {
        await fetch("/test", { method: "POST" });
        await updateStatus();
      } catch (err) {
        console.error(err);
      } finally {
        btn.disabled = false;
        btn.textContent = "Run Tests Now";
      }
    }

    async function updateStatus() {
      try {
        const res = await fetch("/status");
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById("sessionState").textContent = data.sessionState || "unknown";
        document.getElementById("statusBadge").textContent = data.sessionState || "unknown";
        document.getElementById("uptime").textContent = formatUptime(data.uptimeSeconds || 0);
        document.getElementById("lastLoginAt").textContent = data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleTimeString() : "none";
        document.getElementById("lastError").textContent = data.lastError || "none";

        const featuresGrid = document.getElementById("featuresGrid");
        if (data.features && Object.keys(data.features).length > 0) {
          featuresGrid.innerHTML = Object.values(data.features).map(f => {
            const badgeClass = f.status === "operational" ? "badge-operational" : (f.status === "failing" ? "badge-failing" : "badge-pending");
            const time = f.lastCheckedAt ? new Date(f.lastCheckedAt).toLocaleTimeString() : "Never";
            const latency = f.latencyMs ? f.latencyMs + "ms" : "-";
            return \`<div class="feature-item">
              <div class="feature-item-header">
                <span class="feature-name">\${f.name}</span>
                <span class="fbadge \${badgeClass}">\${f.status}</span>
              </div>
              <div class="feature-meta">
                <span>Latency: <strong>\${latency}</strong></span>
                <span>Checked: <strong>\${time}</strong></span>
              </div>
              \${f.details ? \`<div class="feature-details">\${f.details}</div>\` : ""}
            </div>\`;
          }).join("");
        }

        const eventsList = document.getElementById("eventsList");
        if (data.events && data.events.length > 0) {
          eventsList.innerHTML = data.events.slice().reverse().map(e => {
            const time = new Date(e.timestamp).toLocaleTimeString();
            return \`<li class="event-item level-\${e.level}">
              <span class="event-time">\${time}</span>
              <span class="event-msg">[\${e.level.toUpperCase()}] \${e.message}</span>
            </li>\`;
          }).join("");
        }
      } catch (err) {
        document.getElementById("statusBadge").textContent = "offline";
      }
    }

    setInterval(updateStatus, 3000);
    updateStatus();
  </script>
</body>
</html>`;
}
