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
      <div id="statusBadge" class="status-badge">Checking...</div>
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
