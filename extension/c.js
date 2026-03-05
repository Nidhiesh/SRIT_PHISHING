// =============================================
// CyberShield content.js v3.0
// Scam scanner for WhatsApp Web + Gmail
// =============================================

(function () {
  "use strict";

  const SITE       = window.location.hostname;
  const BACKEND    = "http://localhost:5000/predict";
  const SCAN_DELAY = 5000; // ms between scans
  const scannedSet = new Set(); // tracks already-scanned messages

  console.log("[CyberShield] ✅ Loaded on:", SITE);

  // ══════════════════════════════════════════
  // 1. WAIT FOR DOM TO BE READY
  // ══════════════════════════════════════════

  function waitForSelector(selector, timeout = 20000) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });
  }

  // ══════════════════════════════════════════
  // 2. MESSAGE EXTRACTORS
  // ══════════════════════════════════════════

  function extractWhatsApp() {
    const msgs = [];

    // Strategy A: data-pre-plain-text containers (most reliable)
    document.querySelectorAll('[data-pre-plain-text]').forEach(el => {
      const spans = el.querySelectorAll('span.selectable-text span');
      spans.forEach(s => {
        const t = s.innerText?.trim();
        if (t && t.length > 2 && !t.includes('\n\n')) msgs.push(t);
      });
    });

    // Strategy B: copyable-text inside message bubbles
    if (msgs.length === 0) {
      document.querySelectorAll('.copyable-text').forEach(el => {
        const t = el.innerText?.trim();
        if (t && t.length > 2) msgs.push(t);
      });
    }

    // Strategy C: broad span with dir attribute (works on most WA versions)
    if (msgs.length === 0) {
      document.querySelectorAll('span[dir="ltr"], span[dir="rtl"]').forEach(el => {
        const t = el.innerText?.trim();
        if (t && t.length > 4 && t.length < 2000) msgs.push(t);
      });
    }

    // Deduplicate
    return [...new Set(msgs)];
  }

  function extractGmail() {
    const msgs = [];

    // Open email body
    document.querySelectorAll('div.a3s.aiL').forEach(el => {
      const t = el.innerText?.trim();
      if (t && t.length > 5) msgs.push(t.slice(0, 800));
    });

    // Subject line
    document.querySelectorAll('h2.hP').forEach(el => {
      const t = el.innerText?.trim();
      if (t) msgs.push(t);
    });

    // Inbox preview snippets
    document.querySelectorAll('span.y2').forEach(el => {
      const t = el.innerText?.trim();
      if (t && t.length > 3) msgs.push(t);
    });

    // Sender name + subject rows
    document.querySelectorAll('td.yX.xY').forEach(el => {
      const t = el.innerText?.trim();
      if (t && t.length > 3) msgs.push(t);
    });

    return [...new Set(msgs)];
  }

  function getMessages() {
    if (SITE === "web.whatsapp.com") return extractWhatsApp();
    if (SITE === "mail.google.com")  return extractGmail();
    return [];
  }

  // ══════════════════════════════════════════
  // 3. SCAM DETECTION
  // ══════════════════════════════════════════

  // Offline keyword detection (always available)
  function keywordDetect(text) {
    const rules = [
      // High-risk patterns (weight 3)
      { pattern: /send\s*otp/i,           weight: 3, tag: "OTP request"         },
      { pattern: /share\s*otp/i,          weight: 3, tag: "OTP request"         },
      { pattern: /enter\s*otp/i,          weight: 3, tag: "OTP request"         },
      { pattern: /verify.*account/i,      weight: 3, tag: "Account verification"},
      { pattern: /account.*block/i,       weight: 3, tag: "Account block threat" },
      { pattern: /atm\s*pin/i,            weight: 3, tag: "PIN request"         },
      { pattern: /bank.*detail/i,         weight: 3, tag: "Bank details request" },
      { pattern: /confirm.*password/i,    weight: 3, tag: "Password request"    },
      { pattern: /kyc.*update/i,          weight: 3, tag: "KYC scam"            },
      { pattern: /update.*kyc/i,          weight: 3, tag: "KYC scam"            },
      { pattern: /pan.*block/i,           weight: 3, tag: "PAN scam"            },
      { pattern: /aadhaar.*update/i,      weight: 3, tag: "Aadhaar scam"        },
      { pattern: /police.*case/i,         weight: 3, tag: "Threat scam"         },
      { pattern: /arrest.*warrant/i,      weight: 3, tag: "Threat scam"         },
      // Medium-risk (weight 2)
      { pattern: /you.*won/i,             weight: 2, tag: "Prize scam"          },
      { pattern: /winner.*selected/i,     weight: 2, tag: "Prize scam"          },
      { pattern: /lucky.*draw/i,          weight: 2, tag: "Lottery scam"        },
      { pattern: /lottery/i,              weight: 2, tag: "Lottery scam"        },
      { pattern: /claim.*prize/i,         weight: 2, tag: "Prize claim"         },
      { pattern: /claim.*reward/i,        weight: 2, tag: "Reward scam"         },
      { pattern: /free.*iphone/i,         weight: 2, tag: "Free item scam"      },
      { pattern: /gift.*card/i,           weight: 2, tag: "Gift card scam"      },
      { pattern: /loan.*approv/i,         weight: 2, tag: "Loan scam"           },
      { pattern: /click.*link/i,          weight: 2, tag: "Phishing link"       },
      { pattern: /limited.*offer/i,       weight: 2, tag: "Urgency tactic"      },
      { pattern: /urgent/i,               weight: 2, tag: "Urgency tactic"      },
      { pattern: /immediately/i,          weight: 1, tag: "Urgency tactic"      },
      { pattern: /delivery.*charge/i,     weight: 2, tag: "Delivery scam"       },
      { pattern: /pay.*now/i,             weight: 2, tag: "Payment pressure"    },
      { pattern: /subsidy/i,              weight: 2, tag: "Government scam"     },
      { pattern: /income.*tax.*refund/i,  weight: 3, tag: "Tax refund scam"     },
      { pattern: /electricity.*cut/i,     weight: 2, tag: "Utility scam"        },
      { pattern: /sim.*block/i,           weight: 2, tag: "SIM scam"            },
      { pattern: /recharge.*offer/i,      weight: 2, tag: "Recharge scam"       },
      { pattern: /cashback/i,             weight: 1, tag: "Cashback scam"       },
    ];

    let score = 0;
    const tags = [];

    for (const rule of rules) {
      if (rule.pattern.test(text)) {
        score += rule.weight;
        tags.push(rule.tag);
      }
    }

    // URL in message = suspicious
    if (/https?:\/\/(?!wa\.me|google\.com|whatsapp\.com)/i.test(text)) {
      score += 2;
      tags.push("Suspicious URL");
    }

    const probability = Math.min(score * 14, 97);
    const isScam      = score >= 2;

    return {
      prediction:  isScam ? "scam" : "safe",
      probability: isScam ? Math.max(probability, 55) : probability,
      tags:        [...new Set(tags)],
      source:      "keyword"
    };
  }

  // Call Flask ML backend
  async function mlDetect(text) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch(BACKEND, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text.slice(0, 800) }),
        signal:  controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      return { ...data, source: "ml" };

    } catch {
      clearTimeout(timer);
      return null; // backend offline
    }
  }

  // Combined detection: ML first, fallback to keywords
  async function detect(text) {
    const ml = await mlDetect(text);
    if (ml) return ml;
    return keywordDetect(text);
  }

  // ══════════════════════════════════════════
  // 4. MAIN SCAN LOOP
  // ══════════════════════════════════════════

  async function scan() {
    const messages = getMessages();
    if (messages.length === 0) return;

    console.log(`[CyberShield] Scanning ${messages.length} messages...`);

    for (const msg of messages) {
      if (scannedSet.has(msg)) continue;
      scannedSet.add(msg);

      // Trim cache
      if (scannedSet.size > 300) {
        scannedSet.delete(scannedSet.values().next().value);
      }

      const result = await detect(msg);
      const label  = result.prediction === "scam" ? "🚨 SCAM" : "✅ safe";
      console.log(`[CyberShield] ${label} (${result.probability}%) | "${msg.slice(0, 50)}"`);

      if (result.prediction === "scam") {
        showAlert(msg, result);

        try {
          chrome.runtime.sendMessage({
            type:        "SCAM_DETECTED",
            probability: result.probability
          });
        } catch (_) {}

        break; // one alert at a time
      }
    }
  }

  // ══════════════════════════════════════════
  // 5. ALERT CARD
  // ══════════════════════════════════════════

  function showAlert(message, result) {
    // Remove old alert if any
    document.getElementById("cs-alert")?.remove();

    const prob     = result.probability || 80;
    const tags     = result.tags?.slice(0, 3) || ["Suspicious content"];
    const source   = result.source === "ml" ? "AI Model" : "Keyword Engine";
    const preview  = message.length > 100 ? message.slice(0, 100) + "…" : message;
    const color    = prob >= 80 ? "#ff4757" : prob >= 55 ? "#ffa502" : "#f9ca24";

    const wrapper  = document.createElement("div");
    wrapper.id     = "cs-alert";

    wrapper.innerHTML = `
      <div id="cs-card">

        <!-- Header -->
        <div id="cs-header">
          <span id="cs-shield">🛡️</span>
          <div id="cs-header-text">
            <div id="cs-title">Scam Message Detected</div>
            <div id="cs-subtitle">Detected by ${source}</div>
          </div>
          <button id="cs-x">✕</button>
        </div>

        <!-- Message preview -->
        <div id="cs-preview-label">Flagged message:</div>
        <div id="cs-preview">"${preview}"</div>

        <!-- Risk bar -->
        <div id="cs-risk-header">
          <span>Scam Risk Score</span>
          <span id="cs-risk-pct" style="color:${color}">${prob}%</span>
        </div>
        <div id="cs-bar-track">
          <div id="cs-bar-fill" style="width:${prob}%;background:${color}"></div>
        </div>

        <!-- Tags -->
        <div id="cs-tags">
          ${tags.map(t => `<span class="cs-tag">${t}</span>`).join("")}
        </div>

        <!-- Tips -->
        <div id="cs-tips-head">⚡ Immediate actions:</div>
        <div id="cs-tips">
          <div class="cs-tip">🚫 Do NOT click any link in this message</div>
          <div class="cs-tip">🔒 Never share OTP, PIN, or password</div>
          <div class="cs-tip">📞 Hang up and call your bank directly</div>
          <div class="cs-tip">🕵️ Verify the sender's identity first</div>
          <div class="cs-tip">🚨 Report to cybercrime.gov.in</div>
        </div>

        <!-- Buttons -->
        <div id="cs-buttons">
          <button id="cs-btn-safe">✅ Mark as Safe</button>
          <button id="cs-btn-report">🚨 Report Scam</button>
        </div>

        <div id="cs-footer">CyberShield is monitoring your chats automatically</div>
      </div>
    `;

    document.body.appendChild(wrapper);

    // Events
    document.getElementById("cs-x").onclick = () => wrapper.remove();

    document.getElementById("cs-btn-safe").onclick = () => {
      // Add to safe list so it won't trigger again
      scannedSet.add(message);
      wrapper.remove();
    };

    document.getElementById("cs-btn-report").onclick = () => {
      const url = `https://cybercrime.gov.in`;
      window.open(url, "_blank");
      wrapper.remove();
    };

    // Auto dismiss after 30s
    setTimeout(() => wrapper?.remove(), 30000);
  }

  // ══════════════════════════════════════════
  // 6. BOOT
  // ══════════════════════════════════════════

  async function boot() {
    if (SITE === "web.whatsapp.com") {
      console.log("[CyberShield] Waiting for WhatsApp...");
      await waitForSelector("#main, [data-testid='conversation-panel-wrapper'], [data-testid='default-user']");
    } else if (SITE === "mail.google.com") {
      console.log("[CyberShield] Waiting for Gmail...");
      await waitForSelector("div[role='main'], .AO, .nH");
    }

    console.log("[CyberShield] 🚀 Starting scanner...");

    // First scan after 2s
    setTimeout(scan, 2000);

    // Repeat scan every 5s
    setInterval(scan, SCAN_DELAY);

    // Also scan when user clicks (opens new chat / email)
    document.addEventListener("click", () => {
      setTimeout(scan, 1500); // small delay to let new content render
    });
  }

  boot();

})();