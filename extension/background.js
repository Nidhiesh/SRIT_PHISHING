// ─────────────────────────────────────────────────────────────
//  CyberShield  ·  background.js  (Service Worker)
//  Keeps the extension alive, tracks stats, shows notifications
// ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    active:     true,
    scamCount:  0,
    scanCount:  0,
    lastScam:   null,
    startedAt:  Date.now()
  });
  console.log("[CyberShield] Installed & ready.");
});

// ── Listen for messages from scanner.js ──────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === "SCAM_FOUND") {
    // Update scam counter
    chrome.storage.local.get(["scamCount"], (d) => {
      chrome.storage.local.set({
        scamCount: (d.scamCount || 0) + 1,
        lastScam:  msg.text
      });
    });

    // System notification
    chrome.notifications.create("cs_" + Date.now(), {
      type:     "basic",
      iconUrl:  "icons/icon.png",
      title:    "⚠️ CyberShield – Scam Detected",
      message:  `Risk ${msg.probability}% · ${msg.text.slice(0, 60)}`,
      priority: 2
    });

    sendResponse({ ok: true });
  }

  if (msg.type === "SCAN_DONE") {
    chrome.storage.local.get(["scanCount"], (d) => {
      chrome.storage.local.set({ scanCount: (d.scanCount || 0) + 1 });
    });
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATS") {
    chrome.storage.local.get(
      ["active", "scamCount", "scanCount", "lastScam", "startedAt"],
      (d) => sendResponse(d)
    );
    return true; // keep channel open for async
  }

  if (msg.type === "SET_ACTIVE") {
    chrome.storage.local.set({ active: msg.value });
    sendResponse({ ok: true });
  }

  return true;
});