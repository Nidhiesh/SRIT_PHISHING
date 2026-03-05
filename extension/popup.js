// CyberShield popup.js

// Load stats
chrome.runtime.sendMessage({ type: "GET_STATS" }, (d) => {
  if (!d) return;
  document.getElementById("scamCount").textContent = d.scamCount || 0;
  document.getElementById("scanCount").textContent  = d.scanCount  || 0;
  document.getElementById("toggle").checked         = d.active !== false;

  if (d.lastScam) {
    const box = document.getElementById("last-scam-box");
    box.style.display = "block";
    document.getElementById("lastScam").textContent =
      d.lastScam.slice(0, 100) + (d.lastScam.length > 100 ? "…" : "");
  }
});

// Toggle on/off
document.getElementById("toggle").addEventListener("change", (e) => {
  chrome.runtime.sendMessage({ type: "SET_ACTIVE", value: e.target.checked });
});

// Backend health check
(async () => {
  const el = document.getElementById("be-val");
  try {
    const r = await fetch("http://localhost:5000/health", {
      signal: AbortSignal.timeout(2000)
    });
    if (r.ok) {
      el.textContent = "🟢 Connected";
      el.style.color = "#2ecc71";
    } else throw 0;
  } catch {
    el.textContent = "🔴 Offline (keywords active)";
    el.style.color = "#ff6b81";
  }
})();