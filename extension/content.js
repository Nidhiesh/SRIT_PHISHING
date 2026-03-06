/**
 * CYBER SHIELD - CONTENT SCRIPT
 * Automatically runs on websites
 * Monitors and detects scams in real-time
 */

let detectionEnabled = true;
const checkedMessages = new Set();

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

// ============ WHATSAPP WEB MONITORING ============

function monitorWhatsApp() {
    // Safety check: ensure document.body exists
    if (!document.body) {
        console.log('⚠ WhatsApp: document.body not ready');
        return;
    }
    
    try {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        // Find new messages in the DOM
                        const messages = node.querySelectorAll('[data-testid="msg-container"], [data-testid="message"]');
                        messages.forEach(msg => {
                            analyzeMessage(msg, 'whatsapp');
                        });
                    }
                });
            });
        });

        // Start watching for new messages
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also check existing messages after page loads
        setTimeout(() => {
            const existing = document.querySelectorAll('[data-testid="msg-container"]');
            existing.forEach(msg => analyzeMessage(msg, 'whatsapp'));
        }, 2000);
        
        console.log('✓ WhatsApp Web monitoring started');
    } catch (error) {
        console.error('❌ WhatsApp monitoring error:', error);
    }
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

        // Check existing emails
        setTimeout(() => {
            const existing = document.querySelectorAll('[role="main"] [role="article"]');
            existing.forEach(email => analyzeMessage(email, 'gmail'));
        }, 2000);
        
        console.log('✓ Gmail monitoring started');
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

function analyzeMessage(element, platform) {
    if (!element || !detectionEnabled) return;

    // Generate unique ID for this message
    const msgId = Math.random().toString(36).substr(2, 9);
    if (checkedMessages.has(msgId)) return;
    checkedMessages.add(msgId);

    // Extract message text based on platform
    let messageText = extractText(element, platform);
    
    if (messageText && messageText.trim().length > 3) {
        console.log(`[${platform}] Found message: "${messageText.substring(0, 50)}..."`);
        
        // Send to background.js for ML analysis
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
                console.log('⚠ SCAM DETECTED:', response);
                
                // Highlight the suspicious message
                element.style.backgroundColor = 'rgba(255, 193, 7, 0.15)';
                element.style.borderLeft = '5px solid #FF6B6B';
                element.style.paddingLeft = '10px';
                element.setAttribute('data-scam-warning', 'true');
                
                // Add warning badge to message
                addBadge(element, response.status);
            }
        });
    }
}

// Extract text from message element
function extractText(element, platform) {
    let text = '';

    if (platform === 'whatsapp') {
        // Try WhatsApp selectors
        const selectors = [
            '[class*="selectable-text"]',
            '[data-testid="msg-text"]'
        ];
        for (let selector of selectors) {
            const el = element.querySelector(selector);
            if (el) {
                text = el.innerText || el.textContent;
                if (text) break;
            }
        }
        if (!text) text = element.innerText;
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
    badge.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: ${status === 'scam' ? '#FF6B6B' : '#FFC107'};
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    `;
    
    badge.textContent = status === 'scam' ? '⚠️ SCAM' : '⚠️ SUSPICIOUS';
    element.style.position = 'relative';
    element.appendChild(badge);
}

// ============ WARNING POPUP ALERT ============

function showWarning(data) {
    // Remove any existing warning
    const existing = document.getElementById('cyberShieldAlert');
    if (existing) existing.remove();

    // Create warning popup
    const popup = document.createElement('div');
    popup.id = 'cyberShieldAlert';
    
    const bgColor = data.status === 'scam' ? '#FF6B6B' : '#FFC107';
    const title = data.status === 'scam' ? '🚨 SCAM DETECTED' : '⚠️ SUSPICIOUS';
    const threats = (data.threats || []).map(t => `• ${t}`).join('<br>');
    
    popup.innerHTML = `
    <div style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 380px;
        background: white;
        color: #333;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        z-index: 999999;
        border-left: 6px solid ${bgColor};
        animation: slideIn 0.4s ease-out;
    ">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 24px; margin-right: 10px;">${data.status === 'scam' ? '🚨' : '⚠️'}</div>
            <div>
                <div style="font-weight: 700; font-size: 16px; color: ${bgColor};">${title}</div>
                <div style="font-size: 12px; color: #666;">Risk Score: ${Math.round(data.confidence * 100)}/100</div>
            </div>
        </div>

        ${threats ? `
        <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 13px;">
            <div style="font-weight: 600; margin-bottom: 6px;">Detected Threats:</div>
            <div style="color: #555; line-height: 1.5;">${threats}</div>
        </div>
        ` : ''}

        <div style="background: #f0f8ff; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 13px; line-height: 1.6; color: #1a5490;">
            <div style="font-weight: 600; margin-bottom: 6px;">🛡️ Safety Tips:</div>
            ✓ Never share your OTP or password<br>
            ✓ Verify the sender's identity<br>
            ✓ Don't click unknown links<br>
            ✓ Be suspicious of urgent requests
        </div>

        <button id="closeAlert" style="
            width: 100%;
            padding: 10px;
            background: ${bgColor};
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
        ">
            Close & Stay Safe
        </button>
    </div>

    <style>
        @keyframes slideIn {
            from {
                transform: translateX(420px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    </style>
    `;

    document.body.appendChild(popup);

    // Close button
    document.getElementById('closeAlert').addEventListener('click', () => {
        popup.style.animation = 'slideIn 0.4s ease-out reverse';
        setTimeout(() => popup.remove(), 400);
    });

    // Auto close after 15 seconds
    setTimeout(() => {
        if (popup.parentNode) {
            popup.style.animation = 'slideIn 0.4s ease-out reverse';
            setTimeout(() => popup.remove(), 400);
        }
    }, 15000);
}

console.log('✓ Cyber Shield ready and monitoring');