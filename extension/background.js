/**
 * CYBER SHIELD - BACKGROUND SERVICE WORKER
 * Runs automatically in background
 * Communicates with Flask API for scam detection
 */

const API_ENDPOINT = 'http://localhost:5000/detect';
let detectionEnabled = true;
let backendStatus = 'offline';

// Load settings on startup
chrome.storage.sync.get(['detectionEnabled'], (data) => {
    if (data.detectionEnabled !== undefined) {
        detectionEnabled = data.detectionEnabled;
    }
    checkBackendHealth();
    updateBadge(); // Update badge on startup
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.detectionEnabled) {
        detectionEnabled = changes.detectionEnabled.newValue;
        updateBadge();
    }
});

// Update the badge on the extension icon
function updateBadge() {
    if (detectionEnabled) {
        // Green badge for active
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#00c851' });
    } else {
        // Red badge for inactive
        chrome.action.setBadgeText({ text: '✗' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
    }
}

// Check if backend is online (runs continuously)
function checkBackendHealth() {
    fetch('http://localhost:5000/health')
        .then(response => {
            if (response.ok) {
                backendStatus = 'online';
                console.log('✓ Backend is online and ready');
            } else {
                backendStatus = 'offline';
            }
        })
        .catch(error => {
            backendStatus = 'offline';
            console.log('⚠ Backend offline - using fallback detection');
        });
    
    // Check every 30 seconds
    setTimeout(checkBackendHealth, 30000);
}

// Main message listener from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.type === 'CHECK_SCAM') {
        handleScamCheck(request, sender, sendResponse);
        return true; // Keep connection alive for async response
    }
    
    if (request.type === 'URL_SCAM_DETECTED') {
        handleUrlScamDetected(request, sender, sendResponse);
        return true;
    }
    
    if (request.type === 'GET_STATUS') {
        sendResponse({
            detectionEnabled: detectionEnabled,
            backendStatus: backendStatus
        });
    }
});

// Handle URL scam detection
function handleUrlScamDetected(request, sender, sendResponse) {
    console.log(`[Background] URL Scam detected on ${request.platform}:`, request.threats);
    
    // Send alert to content script
    chrome.tabs.sendMessage(sender.tab.id, {
        type: 'SHOW_WARNING',
        status: 'scam',
        confidence: 0.95,
        threats: request.threats,
        checkId: `URL_${Date.now()}`,
        isUrlScam: true,
        messagePreview: request.messageText
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Content script not ready yet');
        }
    });
    
    sendResponse({ received: true });
}

// Handle scam detection - sends to Flask API
async function handleScamCheck(request, sender, sendResponse) {
    try {
        // Check if detection is enabled
        if (!detectionEnabled) {
            sendResponse({
                type: 'DETECTION_DISABLED',
                status: 'safe'
            });
            return;
        }
        
        const message = request.text;
        if (!message || message.trim().length < 3) {
            sendResponse({
                type: 'MESSAGE_TOO_SHORT',
                status: 'safe'
            });
            return;
        }
        
        console.log(`[Background] Checking message: "${message.substring(0, 50)}..."`);
        
        // If backend is offline, use fallback
        if (backendStatus === 'offline') {
            console.log('[Background] Using fallback detection');
            const result = fallbackDetection(message);
            sendResponse(result);
            return;
        }
        
        // Send to Flask API for ML-based detection
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: message })
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const result = await response.json();
        
        console.log(`[Background] Detection result:`, result);
        
        // For WhatsApp: Only alert if message matches training patterns
        const shouldAlert = result.matches_training_patterns === true && result.risk_level !== 'safe';
        
        // Send alert to content script if scam detected AND matches training data
        if (shouldAlert) {
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'SHOW_WARNING',
                status: result.risk_level,
                confidence: result.confidence,
                threats: result.threats,
                checkId: result.check_id,
                matchesTrainingData: result.matches_training_patterns
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Content script not ready yet');
                }
            });
        }
        
        // Send response back
        sendResponse({
            type: result.risk_level === 'safe' ? 'MESSAGE_SAFE' : 'SCAM_DETECTED',
            status: result.risk_level,
            confidence: result.confidence,
            threats: result.threats,
            matchesTrainingData: result.matches_training_patterns
        });
        
    } catch (error) {
        console.error('[Background] Error:', error);
        const fallbackResult = fallbackDetection(request.text);
        sendResponse(fallbackResult);
    }
}

// Fallback keyword detection (when backend is offline) - STRICT mode for WhatsApp
function fallbackDetection(message) {
    // Training data patterns from backend
    const trainingPatterns = {
        // High-confidence patterns (from training data)
        criticalOTP: ['verify your otp', 'enter your otp', 'confirm your otp', 'one time password', 'enter otp'],
        criticalVerify: ['verify account', 'confirm identity', 'verify now', 'confirm account'],
        criticalPayment: ['update payment', 'verify credit card', 'billing information', 'payment method', 'bank account', 'cvv'],
        criticalPrize: ['congratulations won', 'claim prize', 'lottery', 'grand prize', 'free money'],
        criticalUrgent: ['account will be suspended', 'account compromised', 'account locked', 'action required immediately', 'unusual login detected'],
        criticalLink: ['bit.ly', 'tinyurl', 'goo.gl', 'ow.ly', 'short.link', 'ow.ly/secure'],
        criticalBank: ['your bank', 'bank alert', 'suspected fraud', 'unusual activity'],
        criticalImitation: ['this is your bank', 'amazon security', 'google alert', 'facebook confirm', 'instagram unusual', 'whatsapp security'],
        criticalDownload: ['download security update', 'install app', 'download cleaner', 'critical update', 'system scan']
    };
    
    let matchCount = 0;
    const matchedPatterns = [];
    const msgLower = message.toLowerCase();
    
    // Count how many training patterns match
    for (const [patternType, patterns] of Object.entries(trainingPatterns)) {
        for (const pattern of patterns) {
            if (msgLower.includes(pattern)) {
                matchCount++;
                matchedPatterns.push(patternType.replace('critical', ''));
                break; // Count each pattern type only once
            }
        }
    }
    
    // Only flag if multiple training patterns match (at least 2)
    // This ensures we only alert on messages similar to training data
    if (matchCount >= 2) {
        return {
            type: 'SCAM_DETECTED',
            status: 'scam',
            confidence: Math.min(0.7 + (matchCount * 0.1), 1.0),
            threats: matchedPatterns.slice(0, 3),
            matchesTrainingData: true
        };
    }
    
    // Single minor pattern match - flag as suspicious only if very specific
    if (matchCount === 1) {
        // Only certain types warrant suspicious flag alone
        const soloSuspiciousPatterns = ['OTP', 'Verify', 'Payment', 'Link', 'Bank', 'Imitation'];
        if (soloSuspiciousPatterns.some(p => matchedPatterns.some(m => m.includes(p)))) {
            return {
                type: 'SCAM_DETECTED',
                status: 'suspicious',
                confidence: 0.5,
                threats: matchedPatterns,
                matchesTrainingData: true
            };
        }
    }
    
    // Safe - no training patterns match or insufficient matches
    return {
        type: 'MESSAGE_SAFE',
        status: 'safe',
        confidence: 0.0,
        threats: [],
        matchesTrainingData: false
    };
}

console.log('🛡️ Cyber Shield Background Worker loaded and running');