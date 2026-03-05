// // ============================================================
// // CyberShield content.js v8.0
// // Rules:
// //  - ML model ONLY decides scam vs safe
// //  - Safe messages → completely silent (no log, no alert)
// //  - Scam messages → popup card on screen (NOT console)
// //  - Shows contact name + scam message in the card
// // ============================================================

// (function () {
//   "use strict";

//   if (window.__CS8__) return;
//   window.__CS8__ = true;

//   const SITE    = location.hostname;
//   const API     = "http://localhost:5000/predict";
//   const checked = new Set();
//   let   active  = true;
//   let   scanning = false;

//   // Sync on/off state from popup toggle
//   chrome.storage.local.get("active", (d) => { active = d.active !== false; });
//   chrome.storage.onChanged.addListener((c) => { if (c.active) active = c.active.newValue; });

//   // ============================================================
//   // GET CONTACT / SENDER NAME
//   // ============================================================
//   function getContactName() {
//     if (SITE === "web.whatsapp.com") {
//       const selectors = [
//         "[data-testid='conversation-header'] span[title]",
//         "header span[title]",
//         "#main header span[dir='auto']",
//         "[data-testid='conversation-panel-wrapper'] header span"
//       ];
//       for (const sel of selectors) {
//         const el = document.querySelector(sel);
//         if (el) {
//           const name = el.getAttribute("title") || el.innerText?.trim();
//           if (name && name.length > 0) return name;
//         }
//       }
//       return "Unknown Contact";
//     }

//     if (SITE === "mail.google.com") {
//       const sender = document.querySelector("span.gD, h3.iw span[email]");
//       if (sender) return sender.getAttribute("name") || sender.innerText?.trim() || "Unknown Sender";
//       const subj = document.querySelector("h2.hP");
//       if (subj) return `Mail: "${subj.innerText?.trim().slice(0, 40)}"`;
//       return "Unknown Sender";
//     }

//     return "Unknown";
//   }

//   // ============================================================
//   // EXTRACT MESSAGES FROM WHATSAPP / GMAIL
//   // Returns: [ { text: "...", sender: "Name" }, ... ]
//   // ============================================================
//   function extractMessages() {
//     const results = [];

//     if (SITE === "web.whatsapp.com") {

//       // Strategy 1 — data-pre-plain-text rows
//       // Attribute format: "[HH:MM, DD/MM/YYYY] SenderName: "
//       const rows = document.querySelectorAll("[data-pre-plain-text]");
//       if (rows.length > 0) {
//         rows.forEach(row => {
//           const meta        = row.getAttribute("data-pre-plain-text") || "";
//           const senderMatch = meta.match(/\]\s*(.+?)\s*:/);
//           const sender      = senderMatch ? senderMatch[1].trim() : getContactName();

//           // Grab message text from inner spans
//           let text = "";
//           row.querySelectorAll("span[dir='ltr'], span[dir='rtl']").forEach(s => {
//             text += s.innerText + " ";
//           });
//           // Fallback to full innerText
//           if (!text.trim()) text = row.innerText || "";
//           text = text.trim().replace(/\s+/g, " ");

//           if (text.length > 3 && text.length < 1200) {
//             results.push({ text, sender });
//           }
//         });
//       }

//       // Strategy 2 — TreeWalker on #main (nuclear fallback)
//       if (results.length === 0) {
//         const root   = document.querySelector("#main");
//         const sender = getContactName();
//         if (root) {
//           const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
//             acceptNode(n) {
//               const t = n.textContent.trim();
//               if (t.length < 5 || t.length > 1000)  return NodeFilter.FILTER_SKIP;
//               if (/^\d{1,2}:\d{2}/.test(t))          return NodeFilter.FILTER_SKIP;
//               if (/^(Read|Delivered|Sent|Seen|Typing|Yesterday|Today|Online)$/i.test(t))
//                                                       return NodeFilter.FILTER_SKIP;
//               return NodeFilter.FILTER_ACCEPT;
//             }
//           });
//           let node;
//           while ((node = tw.nextNode())) {
//             results.push({ text: node.textContent.trim(), sender });
//           }
//         }
//       }
//     }

//     if (SITE === "mail.google.com") {
//       const sender = getContactName();
//       document.querySelectorAll("div.a3s.aiL, div.ii.gt").forEach(el => {
//         const t = el.innerText?.trim().replace(/\s+/g, " ");
//         if (t && t.length > 5) results.push({ text: t.slice(0, 900), sender });
//       });
//       document.querySelectorAll("h2.hP, span.y2").forEach(el => {
//         const t = el.innerText?.trim();
//         if (t && t.length > 3) results.push({ text: t, sender });
//       });
//     }

//     // Deduplicate by text
//     const seen = new Set();
//     return results.filter(m => {
//       if (seen.has(m.text)) return false;
//       seen.add(m.text);
//       return true;
//     });
//   }

//   // ============================================================
//   // ML MODEL — only this decides scam or safe
//   // ============================================================
//   async function mlPredict(text) {
//     try {
//       const res = await fetch(API, {
//         method:  "POST",
//         headers: { "Content-Type": "application/json" },
//         body:    JSON.stringify({ message: text.slice(0, 700) }),
//         signal:  AbortSignal.timeout(4000)
//       });
//       if (!res.ok) return null;
//       return await res.json(); // { prediction: "scam"|"safe", probability: 87.3 }
//     } catch {
//       return null; // backend offline
//     }
//   }

//   // ============================================================
//   // MAIN SCAN LOOP
//   // ============================================================
//   async function scan() {
//     if (!active || scanning) return;
//     scanning = true;

//     const messages = extractMessages();

//     for (const { text, sender } of messages) {

//       // Skip messages already checked
//       if (checked.has(text)) continue;
//       checked.add(text);
//       if (checked.size > 500) checked.delete(checked.values().next().value);

//       // Ask ML model
//       const result = await mlPredict(text);

//       // Backend offline → stop quietly
//       if (!result) break;

//       if (result.prediction === "scam") {
//         // ✅ SCAM: show popup card on screen
//         showAlert(text, sender, result.probability);
//         try {
//           chrome.runtime.sendMessage({
//             type: "SCAM_FOUND", site: SITE,
//             sender, preview: text.slice(0, 80),
//             probability: result.probability
//           });
//         } catch (_) {}
//         break; // one card at a time
//       }

//       // SAFE: do nothing, no log, no alert — completely silent
//     }

//     try { chrome.runtime.sendMessage({ type: "SCAN_DONE" }); } catch (_) {}
//     scanning = false;
//   }

//   // ============================================================
//   // POPUP ALERT CARD — shown on screen, centred
//   // ============================================================
//   function showAlert(message, contactName, probability) {
//     // Remove any existing card first
//     document.getElementById("cs-root")?.remove();

//     const preview = message.length > 150 ? message.slice(0, 150) + "…" : message;
//     const danger  = probability >= 80 ? "#ff3b3b"
//                   : probability >= 55 ? "#ff8c00"
//                   :                     "#f5c518";
//     const site    = SITE === "web.whatsapp.com" ? "WhatsApp" : "Gmail";
//     const siteIcon= SITE === "web.whatsapp.com" ? "📱" : "📧";
//     const riskLbl = probability >= 80 ? "🔴 Very High Risk — Likely a scam"
//                   : probability >= 55 ? "🟠 High Risk — Treat with caution"
//                   :                     "🟡 Moderate Risk — Be careful";

//     const root = document.createElement("div");
//     root.id    = "cs-root";

//     root.innerHTML = `
//       <div id="cs-backdrop"></div>
//       <div id="cs-card">

//         <div id="cs-topbar" style="background:${danger}"></div>

//         <!-- Header -->
//         <div id="cs-hdr">
//           <div id="cs-hdr-left">
//             <span id="cs-ico">🛡️</span>
//             <div>
//               <div id="cs-ttl">Scam Message Detected</div>
//               <div id="cs-sub">${siteIcon} ${site} · CyberShield</div>
//             </div>
//           </div>
//           <button id="cs-close">✕</button>
//         </div>

//         <!-- Contact -->
//         <div id="cs-contact">
//           <div id="cs-avatar">👤</div>
//           <div>
//             <div id="cs-from-lbl">Scam received from</div>
//             <div id="cs-from-name">${contactName}</div>
//           </div>
//         </div>

//         <!-- Message -->
//         <div id="cs-msg-wrap">
//           <div id="cs-msg-lbl">⚠️ Scam Message Content</div>
//           <div id="cs-msg-txt">${preview}</div>
//         </div>

//         <!-- Risk bar -->
//         <div id="cs-risk-wrap">
//           <div id="cs-risk-row">
//             <span id="cs-risk-lbl">Scam Risk Score</span>
//             <span id="cs-risk-pct" style="color:${danger}">${probability}%</span>
//           </div>
//           <div id="cs-bar-bg">
//             <div id="cs-bar-fill" style="width:${probability}%;background:${danger}"></div>
//           </div>
//           <div id="cs-risk-hint">${riskLbl}</div>
//         </div>

//         <div id="cs-sep"></div>

//         <!-- Suggestions -->
//         <div id="cs-sug-ttl">What you must do right now</div>
//         <div id="cs-sugs">
//           <div class="cs-sug"><span class="cs-n">1</span><span>Do <b>NOT</b> click any link in this message</span></div>
//           <div class="cs-sug"><span class="cs-n">2</span><span>Never share your OTP, PIN, or bank password</span></div>
//           <div class="cs-sug"><span class="cs-n">3</span><span>Hang up immediately and call your bank directly</span></div>
//           <div class="cs-sug"><span class="cs-n">4</span><span>Verify sender identity through official channels only</span></div>
//           <div class="cs-sug"><span class="cs-n">5</span><span>Report at <b>cybercrime.gov.in</b> or call <b>1930</b></span></div>
//         </div>

//         <!-- Buttons -->
//         <div id="cs-btns">
//           <button id="cs-safe-btn">✅ This is Safe</button>
//           <button id="cs-report-btn" style="background:${danger}">🚨 Report Scam</button>
//         </div>

//         <!-- Countdown bar -->
//         <div id="cs-countdown"><div id="cs-countdown-fill" style="background:${danger}"></div></div>

//       </div>`;

//     document.body.appendChild(root);

//     // Animate card in
//     const card = root.querySelector("#cs-card");
//     requestAnimationFrame(() => {
//       requestAnimationFrame(() => {
//         if (card) { card.style.opacity = "1"; card.style.transform = "translate(-50%,-50%) scale(1)"; }
//         // Start 30s countdown bar
//         const fill = root.querySelector("#cs-countdown-fill");
//         if (fill) {
//           fill.style.transition = "width 30s linear";
//           fill.style.width = "0%";
//         }
//       });
//     });

//     const close = () => {
//       if (card) { card.style.opacity = "0"; card.style.transform = "translate(-50%,-50%) scale(0.95)"; }
//       setTimeout(() => root?.remove(), 280);
//     };

//     root.querySelector("#cs-close").onclick       = close;
//     root.querySelector("#cs-backdrop").onclick    = close;
//     root.querySelector("#cs-safe-btn").onclick    = close;
//     root.querySelector("#cs-report-btn").onclick  = () => {
//       window.open("https://cybercrime.gov.in", "_blank");
//       close();
//     };

//     setTimeout(close, 30000);
//   }

//   // ============================================================
//   // BOOT
//   // ============================================================
//   async function boot() {
//     await new Promise(r => {
//       if (document.readyState === "complete") return r();
//       window.addEventListener("load", r, { once: true });
//     });
//     // Wait for WhatsApp/Gmail to fully render
//     await new Promise(r => setTimeout(r, SITE === "web.whatsapp.com" ? 5000 : 2500));

//     // Scan every 6 seconds
//     scan();
//     setInterval(scan, 6000);

//     // Scan when user opens new chat
//     document.addEventListener("click", () => setTimeout(scan, 2000), { passive: true });

//     // Scan when new messages appear in DOM
//     const target = document.querySelector("#main") || document.body;
//     let debounce;
//     new MutationObserver(() => {
//       clearTimeout(debounce);
//       debounce = setTimeout(scan, 1000);
//     }).observe(target, { childList: true, subtree: true });
//   }

//   // Triggered by background.js alarm
//   chrome.runtime.onMessage.addListener((msg, _, res) => {
//     if (msg.type === "TRIGGER_SCAN") { scan(); res({ ok: true }); }
//   });

//   boot();

// })();






// ============================================================
// CyberShield content.js v8.1
// Rules:
//  - ML model ONLY decides scam vs safe
//  - Safe messages → completely silent (no log, no alert)
//  - Scam messages → popup card on screen (NOT console)
//  - Shows contact name + scam message in the card
//  - WhatsApp: scans ONLY unopened/unread incoming messages
// ============================================================

(function () {
  "use strict";

  if (window.__CS8__) return;
  window.__CS8__ = true;

  const SITE    = location.hostname;
  const API     = "http://localhost:5000/predict";
  const checked = new Set();
  let   active  = true;
  let   scanning = false;

  // Sync on/off state from popup toggle
  chrome.storage.local.get("active", (d) => { active = d.active !== false; });
  chrome.storage.onChanged.addListener((c) => { if (c.active) active = c.active.newValue; });

  // ============================================================
  // GET CONTACT / SENDER NAME
  // ============================================================
  function getContactName() {
    if (SITE === "web.whatsapp.com") {
      const selectors = [
        "[data-testid='conversation-header'] span[title]",
        "header span[title]",
        "#main header span[dir='auto']",
        "[data-testid='conversation-panel-wrapper'] header span"
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const name = el.getAttribute("title") || el.innerText?.trim();
          if (name && name.length > 0) return name;
        }
      }
      return "Unknown Contact";
    }

    if (SITE === "mail.google.com") {
      const sender = document.querySelector("span.gD, h3.iw span[email]");
      if (sender) return sender.getAttribute("name") || sender.innerText?.trim() || "Unknown Sender";
      const subj = document.querySelector("h2.hP");
      if (subj) return `Mail: "${subj.innerText?.trim().slice(0, 40)}"`;
      return "Unknown Sender";
    }

    return "Unknown";
  }

  // ============================================================
  // TRACK OPENED CHATS — mark a chat as "read" once user opens it
  // ============================================================
  const openedChats = new Set();

  function getCurrentChatId() {
    // Use the conversation header title as a stable chat identifier
    const el = document.querySelector(
      "[data-testid='conversation-header'] span[title], header span[title], #main header span[dir='auto']"
    );
    return el ? (el.getAttribute("title") || el.innerText?.trim() || null) : null;
  }

  // Mark the currently open chat as "seen" when user clicks into it
  document.addEventListener("click", () => {
    const id = getCurrentChatId();
    if (id) openedChats.add(id);
  }, { passive: true });

  // ============================================================
  // CHECK IF CURRENT CHAT HAS UNREAD MESSAGES
  // Looks for the unread divider or unread badge in the active chat
  // ============================================================
  function currentChatHasUnread() {
    // WA inserts an "X unread messages" separator divider inside the message list
    const unreadDivider = document.querySelector(
      "[data-testid='unread-msgs-separator'], " +
      "div[data-animate-unread-count]"
    );
    if (unreadDivider) return true;

    // Fallback: check the active chat row in the sidebar for a badge count
    const activeRow = document.querySelector(
      "[data-testid='cell-frame-container'][aria-selected='true']"
    );
    if (activeRow) {
      const badge = activeRow.querySelector(
        "[data-testid='icon-unread-count'], span[aria-label*='unread']"
      );
      if (badge) return true;
    }

    return false;
  }

  // ============================================================
  // EXTRACT ONLY UNREAD MESSAGES FROM WHATSAPP / GMAIL
  // Returns: [ { text: "...", sender: "Name" }, ... ]
  // ============================================================
  function extractMessages() {
    const results = [];

    if (SITE === "web.whatsapp.com") {

      // ── UNREAD GUARD ────────────────────────────────────────
      // 1. Skip if user already opened / acknowledged this chat
      const chatId = getCurrentChatId();
      if (chatId && openedChats.has(chatId)) return [];

      // 2. Skip if no unread indicator present in current chat
      if (!currentChatHasUnread()) return [];
      // ────────────────────────────────────────────────────────

      // Strategy 1 — Use the "unread messages" separator divider.
      // Messages that appear AFTER the separator in the DOM are unread.
      const separator = document.querySelector(
        "[data-testid='unread-msgs-separator'], " +
        "div[data-animate-unread-count]"
      );

      if (separator) {
        const allRows = Array.from(document.querySelectorAll("[data-pre-plain-text]"));

        allRows.forEach(row => {
          // Only process rows that come AFTER the unread separator
          const position = separator.compareDocumentPosition(row);
          if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) return;

          // Skip outgoing (sent by "me") messages
          if (row.closest(".message-out")) return;

          const meta        = row.getAttribute("data-pre-plain-text") || "";
          const senderMatch = meta.match(/\]\s*(.+?)\s*:/);
          const sender      = senderMatch ? senderMatch[1].trim() : getContactName();

          let text = "";
          row.querySelectorAll("span[dir='ltr'], span[dir='rtl']").forEach(s => {
            text += s.innerText + " ";
          });
          if (!text.trim()) text = row.innerText || "";
          text = text.trim().replace(/\s+/g, " ");

          if (text.length > 3 && text.length < 1200) {
            results.push({ text, sender });
          }
        });
      }

      // Strategy 2 — No separator found but chat IS unread.
      // Grab only the most recent incoming (non-outgoing) message.
      if (results.length === 0) {
        const allRows = Array.from(document.querySelectorAll("[data-pre-plain-text]"));

        for (let i = allRows.length - 1; i >= 0; i--) {
          const row = allRows[i];

          // Skip outgoing messages
          if (row.closest(".message-out")) continue;

          const meta        = row.getAttribute("data-pre-plain-text") || "";
          const senderMatch = meta.match(/\]\s*(.+?)\s*:/);
          const sender      = senderMatch ? senderMatch[1].trim() : getContactName();

          let text = "";
          row.querySelectorAll("span[dir='ltr'], span[dir='rtl']").forEach(s => {
            text += s.innerText + " ";
          });
          if (!text.trim()) text = row.innerText || "";
          text = text.trim().replace(/\s+/g, " ");

          if (text.length > 3 && text.length < 1200) {
            results.push({ text, sender });
            break; // only the single latest incoming unread message
          }
        }
      }
    }

    if (SITE === "mail.google.com") {
      const sender = getContactName();
      document.querySelectorAll("div.a3s.aiL, div.ii.gt").forEach(el => {
        const t = el.innerText?.trim().replace(/\s+/g, " ");
        if (t && t.length > 5) results.push({ text: t.slice(0, 900), sender });
      });
      document.querySelectorAll("h2.hP, span.y2").forEach(el => {
        const t = el.innerText?.trim();
        if (t && t.length > 3) results.push({ text: t, sender });
      });
    }

    // Deduplicate by text
    const seen = new Set();
    return results.filter(m => {
      if (seen.has(m.text)) return false;
      seen.add(m.text);
      return true;
    });
  }

  // ============================================================
  // ML MODEL — only this decides scam or safe
  // ============================================================
  async function mlPredict(text) {
    try {
      const res = await fetch(API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text.slice(0, 700) }),
        signal:  AbortSignal.timeout(4000)
      });
      if (!res.ok) return null;
      return await res.json(); // { prediction: "scam"|"safe", probability: 87.3 }
    } catch {
      return null; // backend offline
    }
  }

  // ============================================================
  // MAIN SCAN LOOP
  // ============================================================
  async function scan() {
    if (!active || scanning) return;
    scanning = true;

    const messages = extractMessages();

    for (const { text, sender } of messages) {

      // Skip messages already checked
      if (checked.has(text)) continue;
      checked.add(text);
      if (checked.size > 500) checked.delete(checked.values().next().value);

      // Ask ML model
      const result = await mlPredict(text);

      // Backend offline → stop quietly
      if (!result) break;

      if (result.prediction === "scam") {
        // ✅ SCAM: show popup card on screen
        showAlert(text, sender, result.probability);
        try {
          chrome.runtime.sendMessage({
            type: "SCAM_FOUND", site: SITE,
            sender, preview: text.slice(0, 80),
            probability: result.probability
          });
        } catch (_) {}
        break; // one card at a time
      }

      // SAFE: do nothing, no log, no alert — completely silent
    }

    try { chrome.runtime.sendMessage({ type: "SCAN_DONE" }); } catch (_) {}
    scanning = false;
  }

  // ============================================================
  // POPUP ALERT CARD — shown on screen, centred
  // ============================================================
  function showAlert(message, contactName, probability) {
    // Remove any existing card first
    document.getElementById("cs-root")?.remove();

    const preview = message.length > 150 ? message.slice(0, 150) + "…" : message;
    const danger  = probability >= 80 ? "#ff3b3b"
                  : probability >= 55 ? "#ff8c00"
                  :                     "#f5c518";
    const site    = SITE === "web.whatsapp.com" ? "WhatsApp" : "Gmail";
    const siteIcon= SITE === "web.whatsapp.com" ? "📱" : "📧";
    const riskLbl = probability >= 80 ? "🔴 Very High Risk — Likely a scam"
                  : probability >= 55 ? "🟠 High Risk — Treat with caution"
                  :                     "🟡 Moderate Risk — Be careful";

    const root = document.createElement("div");
    root.id    = "cs-root";

    root.innerHTML = `
      <div id="cs-backdrop"></div>
      <div id="cs-card">

        <div id="cs-topbar" style="background:${danger}"></div>

        <!-- Header -->
        <div id="cs-hdr">
          <div id="cs-hdr-left">
            <span id="cs-ico">🛡️</span>
            <div>
              <div id="cs-ttl">Scam Message Detected</div>
              <div id="cs-sub">${siteIcon} ${site} · CyberShield</div>
            </div>
          </div>
          <button id="cs-close">✕</button>
        </div>

        <!-- Contact -->
        <div id="cs-contact">
          <div id="cs-avatar">👤</div>
          <div>
            <div id="cs-from-lbl">Scam received from</div>
            <div id="cs-from-name">${contactName}</div>
          </div>
        </div>

        <!-- Message -->
        <div id="cs-msg-wrap">
          <div id="cs-msg-lbl">⚠️ Scam Message Content</div>
          <div id="cs-msg-txt">${preview}</div>
        </div>

        <!-- Risk bar -->
        <div id="cs-risk-wrap">
          <div id="cs-risk-row">
            <span id="cs-risk-lbl">Scam Risk Score</span>
            <span id="cs-risk-pct" style="color:${danger}">${probability}%</span>
          </div>
          <div id="cs-bar-bg">
            <div id="cs-bar-fill" style="width:${probability}%;background:${danger}"></div>
          </div>
          <div id="cs-risk-hint">${riskLbl}</div>
        </div>

        <div id="cs-sep"></div>

        <!-- Suggestions -->
        <div id="cs-sug-ttl">What you must do right now</div>
        <div id="cs-sugs">
          <div class="cs-sug"><span class="cs-n">1</span><span>Do <b>NOT</b> click any link in this message</span></div>
          <div class="cs-sug"><span class="cs-n">2</span><span>Never share your OTP, PIN, or bank password</span></div>
          <div class="cs-sug"><span class="cs-n">3</span><span>Hang up immediately and call your bank directly</span></div>
          <div class="cs-sug"><span class="cs-n">4</span><span>Verify sender identity through official channels only</span></div>
          <div class="cs-sug"><span class="cs-n">5</span><span>Report at <b>cybercrime.gov.in</b> or call <b>1930</b></span></div>
        </div>

        <!-- Buttons -->
        <div id="cs-btns">
          <button id="cs-safe-btn">✅ This is Safe</button>
          <button id="cs-report-btn" style="background:${danger}">🚨 Report Scam</button>
        </div>

        <!-- Countdown bar -->
        <div id="cs-countdown"><div id="cs-countdown-fill" style="background:${danger}"></div></div>

      </div>`;

    document.body.appendChild(root);

    // Animate card in
    const card = root.querySelector("#cs-card");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (card) { card.style.opacity = "1"; card.style.transform = "translate(-50%,-50%) scale(1)"; }
        // Start 30s countdown bar
        const fill = root.querySelector("#cs-countdown-fill");
        if (fill) {
          fill.style.transition = "width 30s linear";
          fill.style.width = "0%";
        }
      });
    });

    const close = () => {
      if (card) { card.style.opacity = "0"; card.style.transform = "translate(-50%,-50%) scale(0.95)"; }
      setTimeout(() => root?.remove(), 280);
    };

    root.querySelector("#cs-close").onclick       = close;
    root.querySelector("#cs-backdrop").onclick    = close;
    root.querySelector("#cs-safe-btn").onclick    = close;
    root.querySelector("#cs-report-btn").onclick  = () => {
      window.open("https://cybercrime.gov.in", "_blank");
      close();
    };

    setTimeout(close, 30000);
  }

  // ============================================================
  // BOOT
  // ============================================================
  async function boot() {
    await new Promise(r => {
      if (document.readyState === "complete") return r();
      window.addEventListener("load", r, { once: true });
    });
    // Wait for WhatsApp/Gmail to fully render
    await new Promise(r => setTimeout(r, SITE === "web.whatsapp.com" ? 5000 : 2500));

    // Scan every 6 seconds
    scan();
    setInterval(scan, 6000);

    // Scan when user opens new chat
    document.addEventListener("click", () => setTimeout(scan, 2000), { passive: true });

    // Scan when new messages appear in DOM
    const target = document.querySelector("#main") || document.body;
    let debounce;
    new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(scan, 1000);
    }).observe(target, { childList: true, subtree: true });
  }

  // Triggered by background.js alarm
  chrome.runtime.onMessage.addListener((msg, _, res) => {
    if (msg.type === "TRIGGER_SCAN") { scan(); res({ ok: true }); }
  });

  boot();

})();