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
    
    if (request.type === 'GET_STATUS') {
        sendResponse({
            detectionEnabled: detectionEnabled,
            backendStatus: backendStatus
        });
    }
});

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
        
        // Send alert to content script if scam detected
        if (result.risk_level !== 'safe') {
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'SHOW_WARNING',
                status: result.risk_level,
                confidence: result.confidence,
                threats: result.threats,
                checkId: result.check_id
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
            threats: result.threats
        });
        
    } catch (error) {
        console.error('[Background] Error:', error);
        const fallbackResult = fallbackDetection(request.text);
        sendResponse(fallbackResult);
    }
}

// Fallback keyword detection (when backend is offline)
function fallbackDetection(message) {
    const keywords = {
        critical: ['otp', 'verify account', 'confirm identity', 'update payment'],
        high: ['urgent', 'immediately', 'suspended', 'verify', 'confirm'],
        medium: ['click', 'download', 'link']
    };
    
    let score = 0;
    const threats = [];
    const msgLower = message.toLowerCase();
    
    for (const word of keywords.critical) {
        if (msgLower.includes(word)) {
            score += 30;
            threats.push(word);
        }
    }
    
    for (const word of keywords.high) {
        if (msgLower.includes(word)) {
            score += 15;
            if (!threats.includes(word)) threats.push(word);
        }
    }
    
    // Check for URL shorteners
    if (/(bit\.ly|tinyurl|goo\.gl|ow\.ly)/i.test(message)) {
        score += 20;
        threats.push('suspicious URL');
    }
    
    const riskLevel = score >= 50 ? 'scam' : score >= 25 ? 'suspicious' : 'safe';
    
    return {
        type: riskLevel === 'safe' ? 'MESSAGE_SAFE' : 'SCAM_DETECTED',
        status: riskLevel,
        confidence: Math.min(score / 100, 1.0),
        threats: threats.slice(0, 3)
    };
}

console.log('🛡️ Cyber Shield Background Worker loaded and running');