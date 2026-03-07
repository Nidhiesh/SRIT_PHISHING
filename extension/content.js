/**
 * CYBER SHIELD - CONTENT SCRIPT
 * Automatically runs on websites
 * Monitors and detects scams in real-time
 */

let detectionEnabled = true;
// Use message CONTENT as the dedup key (not DOM attribute — WhatsApp recycles nodes!)
const checkedMessageHashes = new Set();

// Load detection status
chrome.storage.sync.get(['detectionEnabled'], (data) => {
    if (data.detectionEnabled !== undefined) {
        detectionEnabled = data.detectionEnabled;
    }
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.detectionEnabled) {
        detectionEnabled = changes.detectionEnabled.newValue;
    }
});

// Listen for alert messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SHOW_WARNING') {
        showWarning(request);
        sendResponse({ received: true });
    }
});

// ============ AUTOMATIC MESSAGE MONITORING ============

// Wait for DOM to be ready before starting
console.log('🛡️ Cyber Shield Content Script loaded - waiting for DOM');

// Check if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMonitoring);
} else {
    // DOM is already ready
    setTimeout(initializeMonitoring, 500);
}

function initializeMonitoring() {
    console.log('🛡️ Initializing message monitoring');
    
    // Wait for body element to exist
    if (!document.body) {
        console.log('⏳ Body not ready yet, waiting...');
        setTimeout(initializeMonitoring, 500);
        return;
    }
    
    // Monitor WhatsApp Web
    monitorWhatsApp();
    
    // Monitor Gmail
    monitorGmail();
    
    // Monitor Instagram
    monitorInstagram();
}

// ============ URL SCAM DETECTION ============

// Malicious URL patterns and shortened URL services commonly used in scams
const suspiciousUrlPatterns = {
    shortened: [
        'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly', 
        'short.link', 'short.cm', 'buff.ly', 'clck.ru',
        'is.gd', 'qr.net', 'spr.ly',
        't.me', 'tg.me', 'telegra.ph', 'telegram.dog'
    ],
    phishing: [
        'paypal-verify', 'amazon-secure', 'google-verify',
        'apple-id-verify', 'confirm-account', 'verify-identity',
        'update-payment', 'secure-login', 'account-confirm',
        'bank-security', 'verify-now', 'action-required'
    ],
    suspicious: [
        'click-here', 'claim-reward', 'get-free', 
        'verify-account', 'confirm-now', 'urgent-action',
        'limited-time', 'act-now', 'download-now'
    ],
    // Scam keywords found IN the domain name itself (e.g. free-recharge-jio.xyz)
    scamDomainKeywords: [
        'free-recharge', 'freerecharge', 'claim-prize', 'claimprice',
        'win-prize', 'winprize', 'lucky-draw', 'luckydraw',
        'cash-reward', 'cashreward', 'get-reward', 'getreward',
        'free-gift', 'freegift', 'earn-money', 'earnmoney',
        'aadhaar-verify', 'aadhaarverify', 'aadhaar-update',
        'kyc-update', 'kycupdate', 'otp-verify', 'otpverify',
        'bank-update', 'bankupdate', 'account-verify'
    ]
};

function analyzeUrlsInMessage(messageText, element, platform) {
    // Extract URLs from message text
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(com|net|org|co|io|click|download|space|tk|ml|ga|cf|top|bid|win|date|faith|review|site|space|pw|info|biz)[\/\S]*)/gi;
    const urls = messageText.match(urlRegex) || [];
    
    // Also extract URLs from href attributes in element
    const linkElements = element.querySelectorAll('a[href]');
    linkElements.forEach(link => {
        const href = link.getAttribute('href');
        if (href) urls.push(href);
    });
    
    if (urls.length === 0) return false;
    
    // Check each URL for suspicious patterns
    let hasScamUrl = false;
    const detectedUrlThreats = [];
    
    urls.forEach(url => {
        const urlLower = url.toLowerCase();
        
        // Check shortened URL services
        for (const service of suspiciousUrlPatterns.shortened) {
            if (urlLower.includes(service)) {
                hasScamUrl = true;
                detectedUrlThreats.push(`Shortened URL: ${service}`);
                break;
            }
        }
        
        // Check for phishing patterns in URL
        for (const pattern of suspiciousUrlPatterns.phishing) {
            if (urlLower.includes(pattern)) {
                hasScamUrl = true;
                detectedUrlThreats.push(`Phishing URL pattern: ${pattern}`);
                break;
            }
        }

        // ⭐ NEW: Check for scam keywords embedded in domain name
        for (const keyword of suspiciousUrlPatterns.scamDomainKeywords) {
            if (urlLower.includes(keyword)) {
                hasScamUrl = true;
                detectedUrlThreats.push(`Scam domain keyword: ${keyword}`);
                break;
            }
        }
        
        // Check for suspicious subdomains/patterns
        if (/\b(verify|confirm|update|action|urgent|claim|secure|login|account)\b/i.test(url)) {
            if (/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/.test(url) || 
                url.includes('-') && (url.split('/')[2] || '').includes('-verify')) {
                hasScamUrl = true;
                detectedUrlThreats.push('IP-based or suspicious domain URL');
            }
        }
    });
    
    if (hasScamUrl) {
        console.log(`🔗 [${platform}] SCAM URL DETECTED:`, detectedUrlThreats);
        
        // Highlight the message with suspicious URL
        element.style.backgroundColor = 'rgba(255, 67, 67, 0.15)';
        element.style.borderLeft = '5px solid #FF4444';
        element.style.paddingLeft = '10px';
        element.setAttribute('data-url-warning', 'true');
        
        // Add URL threat badge
        addUrlBadge(element, detectedUrlThreats);
        
        // Show premium popup directly (no background.js roundtrip)
        showWarning({
            status: 'scam',
            confidence: 0.95,
            threats: detectedUrlThreats.slice(0, 3),
            messagePreview: messageText.substring(0, 80),
            isUrlScam: true
        });
        
        return true;
    }
    
    return false;
}

function addUrlBadge(element, threats) {
    if (element.querySelector('.url-threat-badge')) return;
    
    const badge = document.createElement('div');
    badge.className = 'url-threat-badge';
    badge.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: #ff4444;
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        border: 2px solid #cc0000;
        font-size: 11px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;
    badge.textContent = '🔗 SCAM URL';
    element.style.position = 'relative';
    element.appendChild(badge);
}

// ============ WHATSAPP WEB MONITORING ============

function monitorWhatsApp() {
    // Safety check: ensure document.body exists
    if (!document.body) {
        console.log('⚠ WhatsApp: document.body not ready');
        return;
    }
    
    try {
        // Monitor for message bubbles with multiple selector strategies
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        // Find new messages using multiple strategies for different WhatsApp Web versions
                        const messages = node.querySelectorAll(
                            '[data-testid="msg-container"], '
                            + '[data-testid="message"], '
                            + '[role="article"][data-testid], '
                            + '.message, '
                            + '[class*="message"]:not([class*="message-input"])'
                        );
                        messages.forEach(msg => {
                            analyzeMessage(msg, 'whatsapp');
                        });
                        
                        // Also check direct message elements — fix: wrap both conditions
                        if (node.classList && (node.classList.contains('message-in') || node.classList.contains('message-out'))) {
                            analyzeMessage(node, 'whatsapp');
                        }
                    }
                });
            });
        });

        // Start watching for new messages
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial backward scan of existing messages (newest → oldest)
        setTimeout(() => scanChatHistory('whatsapp'), 150);
        
        // Detect when user opens a DIFFERENT chat — rescan history each time
        let lastChatTitle = '';
        setInterval(() => {
            // WhatsApp sets the chat title in the header when a chat is open
            const titleEl = document.querySelector('header [data-testid="conversation-header"] span[dir], header [title]');
            const currentTitle = titleEl ? (titleEl.textContent || titleEl.getAttribute('title') || '') : '';
            if (currentTitle && currentTitle !== lastChatTitle) {
                lastChatTitle = currentTitle;
                console.log(`💬 Chat switched to "${currentTitle}" — clearing cache and scanning...`);
                // ⭐ Clear hash cache so chat messages get re-scanned fresh
                checkedMessageHashes.clear();
                // Delay to let WhatsApp render all messages in new chat
                setTimeout(() => scanChatHistory('whatsapp'), 300);
            }
        }, 500); // 500ms poll = fast detection of chat switch
        
        // Periodically pick up newly arrived messages (new messages have no hash yet)
        setInterval(() => {
            const allMessages = document.querySelectorAll('[data-testid="msg-container"]');
            allMessages.forEach(msg => analyzeMessage(msg, 'whatsapp'));
        }, 1500);
        
        console.log('✓ WhatsApp Web monitoring started');
        
        // Show premium activated badge in top right corner
        injectActivatedBadge('whatsapp');
    } catch (error) {
        console.error('❌ WhatsApp monitoring error:', error);
    }
}

// ============ PREMIUM PRIORITY SCAN ENGINE ============
// Phase 1: Instant keyword check on ALL messages (synchronous, zero delay)
// Phase 2: ML check on last ~2hrs of messages (recent 40) in fast batches
// Phase 3: ML check on older messages in slower batches
function scanChatHistory(platform) {
    const selectors = platform === 'whatsapp'
        ? '[data-testid="msg-container"], [role="article"][data-testid], .message.message-in, .message.message-out'
        : '[role="main"] [role="article"]';

    const messages = Array.from(document.querySelectorAll(selectors));
    if (messages.length === 0) {
        console.log(`\ud83d\udd0d [${platform}] No messages in DOM yet — will retry`);
        return;
    }

    // Newest first
    const newest = messages.slice().reverse();
    console.log(`\u26a1 [${platform}] Priority scan: ${newest.length} messages (newest \u2192 oldest)`);

    // ---- PHASE 1: INSTANT keyword check on everything (no network, zero delay) ----
    // Show popup for the FIRST scam found (don't spam)
    let popupShownThisScan = false;
    newest.forEach(msg => {
        // Skip if already shown a badge for this message content (prevents re-badging on same DOM node)
        if (msg.hasAttribute('data-scam-warning')) return;

        const text = extractText(msg, platform);
        if (!text || text.trim().length <= 3) return;
        const instant = instantKeywordCheck(text);
        if (instant !== 'safe') {
            msg.style.backgroundColor = instant === 'scam' ? 'rgba(255,67,67,0.15)' : 'rgba(255,193,7,0.15)';
            msg.style.borderLeft = `5px solid ${instant === 'scam' ? '#FF4444' : '#FF9800'}`;
            msg.style.paddingLeft = '10px';
            msg.setAttribute('data-scam-warning', 'true');
            addBadge(msg, instant);
            console.log(`⚡ INSTANT [${platform}]: ${instant.toUpperCase()} — "${text.substring(0,50)}"`);
            
            // ⭐ Show premium popup for the first scam/suspicious found
            if (!popupShownThisScan) {
                popupShownThisScan = true;
                showWarning({
                    status: instant,
                    confidence: instant === 'scam' ? 0.85 : 0.55,
                    threats: extractInstantThreats(text),
                    messagePreview: text.substring(0, 80),
                    isUrlScam: false
                });
            }
        }
    });

    // ---- PHASE 2: ML scan on RECENT messages (last ~40 = approx 2 hrs) in fast batches ----
    const recent  = newest.slice(0, 40);   // newest 40 messages
    const older   = newest.slice(40);       // everything else

    sendBatchToML(recent, platform, 50);    // 50ms between batches (fast)

    // ---- PHASE 3: ML scan on OLDER messages in slower batches (don't block UI) ----
    // Delay Phase 3 start until Phase 2 is well underway
    setTimeout(() => sendBatchToML(older, platform, 200), recent.length * 55);
}

// Send messages to ML in batches of 5, with `gapMs` between each batch
function sendBatchToML(messages, platform, gapMs) {
    const BATCH = 5;
    let i = 0;
    function processNext() {
        const slice = messages.slice(i, i + BATCH);
        if (slice.length === 0) return;
        slice.forEach(msg => analyzeMessage(msg, platform));
        i += BATCH;
        if (i < messages.length) setTimeout(processNext, gapMs);
    }
    processNext();
}

// ============ GMAIL MONITORING ============

function monitorGmail() {
    // Safety check: ensure document.body exists
    if (!document.body) {
        console.log('⚠ Gmail: document.body not ready');
        return;
    }
    
    try {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        // Find new emails
                        const emails = node.querySelectorAll('[role="main"] [role="article"], [data-message-id]');
                        emails.forEach(email => {
                            analyzeMessage(email, 'gmail');
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Check existing emails (backward from newest)
        setTimeout(() => scanChatHistory('gmail'), 2000);
        
        console.log('✓ Gmail monitoring started');
        
        // Show premium activated badge in top right corner
        injectActivatedBadge('gmail');
    } catch (error) {
        console.error('❌ Gmail monitoring error:', error);
    }
}

// ============ INSTAGRAM MONITORING ============

function monitorInstagram() {
    // Safety check: ensure document.body exists
    if (!document.body) {
        console.log('⚠ Instagram: document.body not ready');
        return;
    }
    
    try {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        // Find new DMs
                        const messages = node.querySelectorAll('[role="article"]');
                        messages.forEach(msg => {
                            analyzeMessage(msg, 'instagram');
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Check existing messages
        setTimeout(() => {
            const existing = document.querySelectorAll('[role="article"]');
            existing.forEach(msg => analyzeMessage(msg, 'instagram'));
        }, 2000);
        
        console.log('✓ Instagram DM monitoring started');
    } catch (error) {
        console.error('❌ Instagram monitoring error:', error);
    }
}

// ============ MESSAGE ANALYSIS ============

// ============ INSTANT KEYWORD PRE-SCANNER ============
// Runs synchronously before ML — gives immediate visual feedback
const INSTANT_TRIGGERS = {
    scam: [
        // OTP-related
        'verify your otp', 'send otp', 'share otp', 'enter otp', 'one time password',
        'send your otp', 'forward otp', 'otp immediately', 'otp now',
        // Account attacks
        'verify account', 'confirm identity', 'account suspended', 'account locked',
        'account will be suspended', 'account compromised', 'unusual login', 'unusual activity',
        // Financial
        'bank account', 'cvv', 'credit card details', 'your bank', 'bank alert',
        'bank account number', 'update payment', 'billing information',
        // Known scam domains/URLs
        'bit.ly', 'tinyurl', 'goo.gl', 'free-recharge', 'freerecharge',
        'aadhaar-verify', 'aadhaar-update', 'kyc-update', 'claim prize',
        'free-recharge-jio', 'recharge-jio', 'http://free',
        // Impersonation
        'whatsapp security', 'amazon security', 'google alert',
        'facebook confirm', 'instagram unusual',
        // Prize scams
        'congratulations won', 'claim prize', 'lottery', 'grand prize', 'lucky draw',
        'you have won', 'cash reward', 'free gift',
        // Malware
        'install app', 'download security update', 'download app', 'apk'
    ],
    suspicious: [
        'click here', 'urgent', 'immediately', 'limited time', 'act now',
        'verify', 'update payment', 'billing', 'confirm', 'suspicious',
        'recharge', 'claim', 'reward', 'prize', 'free offer'
    ]
};

function instantKeywordCheck(text) {
    const lower = text.toLowerCase();
    if (INSTANT_TRIGGERS.scam.some(k => lower.includes(k))) return 'scam';
    if (INSTANT_TRIGGERS.suspicious.some(k => lower.includes(k))) return 'suspicious';
    return 'safe';
}

function analyzeMessage(element, platform) {
    if (!element || !detectionEnabled) return;

    // Use a CONTENT HASH for deduplication — WhatsApp recycles DOM nodes,
    // so element attributes get cleared when the node is reused for a new message.
    const rawText = (element.innerText || element.textContent || '').trim().substring(0, 200);
    if (!rawText || rawText.length < 3) return;
    
    // Simple 32-bit hash of content to keep Set small
    let hash = 0;
    for (let i = 0; i < rawText.length; i++) {
        hash = ((hash << 5) - hash) + rawText.charCodeAt(i);
        hash |= 0;
    }
    const key = `${platform}_${hash}`;
    if (checkedMessageHashes.has(key)) return;
    checkedMessageHashes.add(key);

    // Extract message text based on platform
    let messageText = extractText(element, platform);
    
    if (messageText && messageText.trim().length > 3) {
        console.log(`[${platform}] Found message: "${messageText.substring(0, 50)}..."`);
        
        // ⚡ INSTANT PRE-CHECK — runs synchronously with zero network delay
        const instantResult = instantKeywordCheck(messageText);
        let instantFired = false; // track if popup was already shown
        if (instantResult !== 'safe') {
            console.log(`⚡ [${platform}] INSTANT DETECTION: ${instantResult}`);
            element.style.backgroundColor = instantResult === 'scam' ? 'rgba(255, 67, 67, 0.15)' : 'rgba(255, 193, 7, 0.15)';
            element.style.borderLeft = `5px solid ${instantResult === 'scam' ? '#FF4444' : '#FF9800'}`;
            element.style.paddingLeft = '10px';
            element.setAttribute('data-scam-warning', 'true');
            addBadge(element, instantResult);
            instantFired = true;
            
            // ✅ Show popup immediately from instant check
            showWarning({
                status: instantResult,
                confidence: instantResult === 'scam' ? 0.85 : 0.55,
                threats: extractInstantThreats(messageText),
                messagePreview: messageText.substring(0, 80),
                isUrlScam: false
            });
        }
        
        // Check for scam URLs (works independently — has its own showWarning call)
        const hasScamUrl = analyzeUrlsInMessage(messageText, element, platform);
        
        // Also send to ML for higher-accuracy check (runs in background)
        chrome.runtime.sendMessage({
            type: 'CHECK_SCAM',
            text: messageText,
            platform: platform
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.log('Background not ready');
                return;
            }

            if (response && response.type === 'SCAM_DETECTED') {
                console.log(`⚠️ [${platform}] ML SCAM DETECTED:`, response);
                
                // Upgrade highlight
                element.style.backgroundColor = 'rgba(255, 67, 67, 0.15)';
                element.style.borderLeft = '5px solid #FF4444';
                element.style.paddingLeft = '10px';
                element.setAttribute('data-scam-warning', 'true');
                
                // Add/upgrade badge
                const existingBadge = element.querySelector('.cyber-shield-badge');
                if (existingBadge) existingBadge.remove();
                addBadge(element, response.status);
                
                // Only show ML popup if instant check didn't already fire one
                // (avoids double popup on same message)
                if (!instantFired) {
                    showWarning({
                        status: response.status,
                        confidence: response.confidence,
                        threats: response.threats || [],
                        messagePreview: messageText.substring(0, 80),
                        isUrlScam: false
                    });
                }
            }
        });
    }
}

// Extract which specific keywords triggered the instant scan
function extractInstantThreats(text) {
    const lower = text.toLowerCase();
    const found = [];
    const categories = {
        'OTP Request':      ['send otp', 'share otp', 'enter otp', 'otp immediately', 'otp now', 'forward otp', 'one time password'],
        'Account Attack':   ['account suspended', 'account locked', 'account compromised', 'unusual login', 'unusual activity'],
        'Financial Scam':   ['bank account', 'cvv', 'credit card', 'billing information', 'update payment'],
        'Prize Scam':       ['congratulations won', 'claim prize', 'lottery', 'grand prize', 'lucky draw', 'cash reward', 'you have won'],
        'Phishing URL':     ['bit.ly', 'tinyurl', 'goo.gl', 'free-recharge', 'aadhaar-verify', 'kyc-update', 'http://free'],
        'Impersonation':    ['whatsapp security', 'amazon security', 'google alert', 'facebook confirm'],
        'Malware':          ['install app', 'download security', 'download app', '.apk']
    };
    for (const [label, keywords] of Object.entries(categories)) {
        if (keywords.some(k => lower.includes(k))) found.push(label);
    }
    return found.length ? found : ['Suspicious keyword pattern detected'];
}

// Extract text from message element
function extractText(element, platform) {
    let text = '';

    if (platform === 'whatsapp') {
        // Try WhatsApp selectors (multiple strategies for different versions)
        const selectors = [
            '[class*="selectable-text"]',
            '[data-testid="msg-text"]',
            'span[dir="auto"][style*="word-wrap"]',
            '.selectable-text',
            '[role="img"][alt]',  // For images with alt text
            '.copyable-text'
        ];
        for (let selector of selectors) {
            const el = element.querySelector(selector);
            if (el) {
                text = el.innerText || el.textContent || el.alt || el.getAttribute('aria-label');
                if (text && text.trim().length > 2) break;
            }
        }
        // Fallback: extract all text from the message container
        if (!text) {
            text = element.innerText;
        }
        
        // Also check for URLs that might be in href attributes
        const links = element.querySelectorAll('a[href]');
        if (links.length > 0 && text.length < 10) {
            text = Array.from(links).map(l => l.href).join(' ') + ' ' + (text || '');
        }
    }
    else if (platform === 'gmail') {
        // Try Gmail selectors
        const selectors = ['[role="main"] [data-tooltip]', '.iT [dir="auto"]'];
        for (let selector of selectors) {
            const el = element.querySelector(selector);
            if (el) {
                text = el.innerText || el.textContent;
                if (text && text.trim().length > 3) break;
            }
        }
        if (!text) text = element.innerText;
    }
    else if (platform === 'instagram') {
        // Try Instagram selectors
        const selectors = ['span', 'p'];
        for (let selector of selectors) {
            const el = element.querySelector(selector);
            if (el) {
                text = el.innerText || el.textContent;
                if (text && text.trim().length > 3) break;
            }
        }
        if (!text) text = element.innerText;
    }

    // Clean up text
    text = text.trim().replace(/\n+/g, ' ').substring(0, 500);
    return text;
}

// Add warning badge to suspicious message
function addBadge(element, status) {
    if (element.querySelector('.cyber-shield-badge')) return;

    const badge = document.createElement('div');
    badge.className = 'cyber-shield-badge';
    const bgColor = status === 'scam' ? '#ff4444' : '#ff9800';
    const borderColor = status === 'scam' ? '#cc0000' : '#ff6600';
    const label = status === 'scam' ? '⚠️ SCAM' : '⚠️ SUSPICIOUS';
    
    badge.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: ${bgColor};
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        border: 2px solid ${borderColor};
        font-size: 11px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;
    badge.textContent = label;
    element.style.position = 'relative';
    element.appendChild(badge);
}

// ============ WARNING POPUP ALERT ============

// Track if a warning is currently showing (only one at a time, stays until dismissed or refresh)
let warningActive = false;

function showWarning(data) {
    // If a warning is already showing, don't replace it — let user read and dismiss first
    // (except: if the new one is a scam and the old one is just suspicious, upgrade it)
    const existing = document.getElementById('cyberShieldAlert');
    const newIsScam = data.status === 'scam' || data.isUrlScam === true;
    if (existing && warningActive) {
        const existingIsScam = existing.getAttribute('data-threat-level') === 'scam';
        if (existingIsScam || !newIsScam) return; // Keep existing unless upgrading to scam
        existing.remove();
    }

    warningActive = true;

    const isUrlScam   = data.isUrlScam === true;
    const isScam      = data.status === 'scam' || isUrlScam;
    const riskScore   = Math.round((data.confidence || 0) * 100);
    const threats     = data.threats || [];
    const msgPreview  = (data.messagePreview || '').substring(0, 80);

    const accentColor  = isScam ? '#ff4444' : '#ffb300';
    const accentGlow   = isScam ? 'rgba(255,68,68,0.4)' : 'rgba(255,179,0,0.4)';
    const accentDim    = isScam ? 'rgba(255,68,68,0.10)' : 'rgba(255,179,0,0.10)';
    const accentMid    = isScam ? 'rgba(255,68,68,0.22)' : 'rgba(255,179,0,0.22)';
    const badgeLabel   = isUrlScam ? 'MALICIOUS URL' : (isScam ? 'SCAM DETECTED' : 'SUSPICIOUS MESSAGE');
    const badgeIcon    = isUrlScam ? '🔗' : (isScam ? '🚨' : '⚠️');
    const typeLabel    = isUrlScam ? 'Malicious URL' : (isScam ? 'Scam' : 'Suspicious');

    const guidance = isUrlScam ? [
        { icon: '🚫', text: 'Do <strong>NOT</strong> click any link in this message' },
        { icon: '🗑️', text: 'Delete the message and <strong>block the sender</strong>' },
        { icon: '🚨', text: 'Report this chat to <strong>WhatsApp / platform support</strong>' }
    ] : isScam ? [
        { icon: '🔒', text: '<strong>Never share OTPs, passwords or bank details</strong> with anyone' },
        { icon: '📵', text: 'Cut contact — <strong>block and report</strong> the sender immediately' },
        { icon: '🏦', text: 'If you shared anything sensitive, <strong>contact your bank now</strong>' }
    ] : [
        { icon: '👀', text: 'Verify the sender\'s identity <strong>through a known channel</strong> first' },
        { icon: '⏸️', text: 'Do <strong>not act urgently</strong> — scammers rely on panic and time pressure' },
        { icon: '🔍', text: 'Search the exact message text online to check for <strong>known scam patterns</strong>' }
    ];

    const threatRows = threats.length
        ? threats.map(t => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="color:${accentColor};font-size:11px;flex-shrink:0;">▶</span>
                <span style="color:#ccd6f6;font-size:12px;">${t}</span>
            </div>`).join('')
        : `<div style="color:#8892b0;font-size:12px;padding:4px 0;">Pattern-based keyword match</div>`;

    const previewHtml = msgPreview
        ? `<div style="margin:10px 0;padding:8px 12px;background:rgba(255,255,255,0.04);border-left:3px solid ${accentColor};border-radius:4px;font-size:12px;color:#8892b0;font-family:'Consolas',monospace;word-break:break-word;line-height:1.5;">"${msgPreview}${msgPreview.length >= 80 ? '…' : ''}"</div>`
        : '';

    const guidanceHtml = guidance.map(g =>
        `<div style="display:flex;align-items:flex-start;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
            <span style="font-size:15px;flex-shrink:0;margin-top:1px;">${g.icon}</span>
            <span style="font-size:12px;color:#ccd6f6;line-height:1.5;">${g.text}</span>
        </div>`
    ).join('');

    const popup = document.createElement('div');
    popup.id = 'cyberShieldAlert';
    popup.setAttribute('data-threat-level', isScam ? 'scam' : 'suspicious');

    // Always replace keyframe styles so dynamic values (riskScore, colors) are fresh
    const styleId = 'cs-popup-keyframes';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) existingStyle.remove();
    {
        const s = document.createElement('style');
        s.id = styleId;
        s.textContent = `
            @keyframes cs-popup-enter {
                0%   { transform: translateX(420px) scale(0.92); opacity: 0; }
                60%  { transform: translateX(-8px) scale(1.01); opacity: 1; }
                80%  { transform: translateX(4px) scale(0.99); }
                100% { transform: translateX(0) scale(1); opacity: 1; }
            }
            @keyframes cs-riskbar {
                from { width: 0%; }
                to   { width: ${riskScore}%; }
            }
            @keyframes cs-border-pulse {
                0%, 100% { box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 20px ${accentGlow}; }
                50%       { box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 55px ${accentGlow}; }
            }
            @keyframes cs-scan-beam {
                0%   { top: 0%; opacity: 0.7; }
                100% { top: 110%; opacity: 0; }
            }
            @keyframes cs-icon-pulse {
                0%, 100% { transform: scale(1); box-shadow: 0 0 10px ${accentGlow}; }
                50%       { transform: scale(1.12); box-shadow: 0 0 22px ${accentGlow}; }
            }
            @keyframes cs-top-bar-scan {
                0%   { background-position: -400px 0; }
                100% { background-position: 400px 0; }
            }
            #cyberShieldAlert {
                position: fixed;
                bottom: 22px;
                right: 22px;
                width: 370px;
                z-index: 2147483647;
                font-family: 'Segoe UI', 'Consolas', system-ui, sans-serif;
                animation: cs-popup-enter 0.5s cubic-bezier(0.22,1,0.36,1) forwards,
                           cs-border-pulse 3s ease-in-out 0.6s infinite;
                background: linear-gradient(160deg, rgba(6,14,30,0.98) 0%, rgba(9,18,40,0.98) 100%);
                backdrop-filter: blur(22px);
                -webkit-backdrop-filter: blur(22px);
                border: 1.5px solid ${accentColor};
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 30px ${accentGlow};
                overflow: hidden;
            }
            #cyberShieldAlert:hover {
                animation-play-state: paused;
            }
            #cs-close-alert:hover { background: rgba(255,255,255,0.12) !important; color: #fff !important; }
            #cs-dismiss-alert:hover {
                background: ${accentColor} !important;
                color: #000 !important;
                transform: translateY(-1px);
                box-shadow: 0 4px 20px ${accentGlow};
            }
        `;
        document.head.appendChild(s);
    }

    popup.innerHTML = `
        <!-- Animated top bar -->
        <div style="
            height: 4px;
            background: linear-gradient(90deg, ${accentColor}, #7b2ff7, #00b8ff, ${accentColor});
            background-size: 200% 100%;
            animation: cs-top-bar-scan 2.5s linear infinite;
            position: relative;
        "></div>

        <!-- Scan beam overlay -->
        <div style="
            position:absolute; left:0; right:0; height:40px;
            background:linear-gradient(to bottom, transparent, ${accentColor}18, transparent);
            animation: cs-scan-beam 2.5s ease-in-out 0.5s 3;
            pointer-events:none; z-index:1;
        "></div>

        <div style="padding:18px 18px 16px; position:relative; z-index:2;">

            <!-- Header row -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <!-- Animated icon -->
                    <div style="
                        width:42px;height:42px;border-radius:10px;
                        background:${accentDim};border:1.5px solid ${accentColor};
                        display:flex;align-items:center;justify-content:center;font-size:22px;
                        animation: cs-icon-pulse 2.5s ease-in-out infinite;
                        flex-shrink:0;
                    ">${badgeIcon}</div>
                    <div>
                        <div style="font-size:14px;font-weight:900;color:${accentColor};letter-spacing:1px;text-transform:uppercase;">${badgeLabel}</div>
                        <div style="font-size:10px;color:#5a6a8a;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">
                            <span style="color:#00ff88;">●</span>&nbsp;CyberShield AI &middot; ${typeLabel} Alert
                        </div>
                    </div>
                </div>
                <!-- Close button -->
                <button id="cs-close-alert" style="
                    background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
                    color:#6a7a9a;width:30px;height:30px;border-radius:8px;
                    cursor:pointer;font-size:18px;line-height:1;
                    display:flex;align-items:center;justify-content:center;
                    transition:all 0.2s;flex-shrink:0;
                ">&times;</button>
            </div>

            <!-- Risk Score Bar -->
            <div style="margin-bottom:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="font-size:10px;color:#5a6a8a;letter-spacing:1.5px;text-transform:uppercase;">AI Risk Score</span>
                    <span style="font-size:13px;font-weight:800;color:${accentColor};">${riskScore}<span style="font-size:9px;color:#5a6a8a;">/100</span></span>
                </div>
                <div style="height:7px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden;position:relative;">
                    <div style="
                        height:100%;width:${riskScore}%;
                        background:linear-gradient(90deg,${isScam ? '#ff7700,#ff4444,#ff0055' : '#ffd200,#ffb300,#ff8c00'});
                        border-radius:99px;
                        box-shadow:0 0 10px ${accentColor};
                        animation:cs-riskbar 1.1s cubic-bezier(0.22,1,0.36,1) forwards;
                    "></div>
                </div>
            </div>

            <!-- Message preview -->
            ${previewHtml}

            <!-- Detected threats -->
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;margin-bottom:12px;">
                <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#5a6a8a;margin-bottom:6px;">🔎 Detected Signals</div>
                ${threatRows}
            </div>

            <!-- Guidance -->
            <div style="background:${accentDim};border:1px solid ${accentColor}44;border-radius:10px;padding:10px 12px;margin-bottom:16px;">
                <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${accentColor};margin-bottom:4px;font-weight:700;">⚡ What To Do Now</div>
                ${guidanceHtml}
            </div>

            <!-- Footer CTA -->
            <button id="cs-dismiss-alert" style="
                width:100%;padding:12px;
                background:linear-gradient(135deg,${accentMid},${accentDim});
                border:1.5px solid ${accentColor};border-radius:10px;
                color:${accentColor};font-weight:800;font-size:13px;
                cursor:pointer;letter-spacing:0.8px;text-transform:uppercase;
                transition:all 0.25s;
            ">🛡️ Got it — Stay Safe</button>

            <!-- "stays until dismissed" hint -->
            <div style="text-align:center;margin-top:8px;font-size:10px;color:#3a4a6a;letter-spacing:0.5px;">
                This alert stays until you dismiss it or refresh the page
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    const close = () => {
        warningActive = false;
        popup.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
        popup.style.opacity = '0';
        popup.style.transform = 'translateX(420px) scale(0.9)';
        setTimeout(() => popup.remove(), 380);
    };

    // Bind close buttons
    const closeBtn = popup.querySelector('#cs-close-alert');
    const dismissBtn = popup.querySelector('#cs-dismiss-alert');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (dismissBtn) dismissBtn.addEventListener('click', close);

    // ✅ NO auto-close — warning stays until user manually dismisses or page refreshes
}


console.log('✓ Cyber Shield ready and monitoring');


// ============ PREMIUM ACTIVATED BADGE ============

function injectActivatedBadge(platform) {
    // Only on WhatsApp and Gmail
    if (platform !== 'whatsapp' && platform !== 'gmail') return;
    // Don't inject twice
    if (document.getElementById('cs-activated-badge')) return;

    // Inject keyframe styles once
    if (!document.getElementById('cs-badge-styles')) {
        const style = document.createElement('style');
        style.id = 'cs-badge-styles';
        style.textContent = `
            @keyframes cs-pulse {
                0%   { box-shadow: 0 0 0 0 rgba(0,255,136,0.8); transform: scale(1); }
                70%  { box-shadow: 0 0 0 8px rgba(0,255,136,0);  transform: scale(1.1); }
                100% { box-shadow: 0 0 0 0 rgba(0,255,136,0);    transform: scale(1); }
            }
            @keyframes cs-slidein {
                from { opacity: 0; transform: translateY(-20px) scale(0.9); }
                to   { opacity: 1; transform: translateY(0px)   scale(1);   }
            }
            @keyframes cs-scanline {
                0%   { background-position: 0 0; }
                100% { background-position: 0 100%; }
            }
            #cs-activated-badge {
                animation: cs-slidein 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;
            }
            #cs-activated-badge:hover {
                border-color: rgba(0,255,136,0.6) !important;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 30px rgba(0,255,136,0.25) !important;
                transform: translateY(-2px);
                transition: all 0.25s ease;
            }
            #cs-close-btn:hover { color: #ff4757 !important; }
        `;
        document.head.appendChild(style);
    }

    const badge = document.createElement('div');
    badge.id = 'cs-activated-badge';

    badge.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">

            <!-- Shield icon -->
            <svg width="18" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6L12 2z"
                      fill="url(#shieldGrad)" opacity="0.9"/>
                <path d="M9 12l2 2 4-4" stroke="#0a192f" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
                <defs>
                    <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#00ff88"/>
                        <stop offset="100%" stop-color="#00b8ff"/>
                    </linearGradient>
                </defs>
            </svg>

            <!-- Text block -->
            <div style="display:flex;flex-direction:column;gap:1px;">
                <span style="
                    font-size:11px;letter-spacing:2px;text-transform:uppercase;
                    color:#8892b0;font-weight:600;line-height:1;
                ">CyberShield AI</span>
                <span style="
                    background:linear-gradient(90deg,#00ff88 0%,#00b8ff 60%,#7b2ff7 100%);
                    -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                    font-size:13px;font-weight:800;letter-spacing:0.5px;line-height:1.3;
                ">&#x2726; ACTIVATED</span>
            </div>

            <!-- Pulse dot -->
            <div style="
                width:9px;height:9px;border-radius:50%;
                background:#00ff88;
                box-shadow:0 0 8px #00ff88,0 0 16px rgba(0,255,136,0.4);
                animation:cs-pulse 2s infinite;
                flex-shrink:0;
            "></div>

            <!-- Close button -->
            <button id="cs-close-btn" style="
                background:none;border:none;cursor:pointer;
                color:#4a5568;font-size:17px;line-height:1;
                padding:0 0 0 4px;outline:none;flex-shrink:0;
                transition:color 0.2s;
            " title="Dismiss">&times;</button>
        </div>
    `;

    badge.style.cssText = `
        position: fixed;
        top: 22px;
        right: 22px;
        z-index: 2147483647;
        background: rgba(9, 18, 36, 0.88);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(0,255,136,0.25);
        border-radius: 10px;
        padding: 10px 16px;
        font-family: 'Consolas','Courier New',monospace;
        box-shadow: 0 8px 28px rgba(0,0,0,0.45), inset 0 0 24px rgba(0,255,136,0.04);
        cursor: default;
        user-select: none;
    `;

    document.body.appendChild(badge);

    document.getElementById('cs-close-btn').addEventListener('click', () => {
        badge.style.transition = 'opacity 0.3s, transform 0.3s';
        badge.style.opacity = '0';
        badge.style.transform = 'translateY(-10px) scale(0.95)';
        setTimeout(() => badge.remove(), 320);
    });
}