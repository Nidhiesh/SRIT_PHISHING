# WhatsApp Web Scam Detection Setup Guide

## ✅ What's Enabled

Your **Cyber Shield extension already has WhatsApp Web protection enabled**! Here's what's now improved:

### Enhanced WhatsApp Detection Features:

1. **Smart Message Monitoring**
   - Monitors all incoming and outgoing messages in real-time
   - Works with multiple WhatsApp Web versions
   - Automatically scans messages as you receive them

2. **Improved Scam Pattern Recognition**
   - WhatsApp verification scams detection
   - OTP request detection
   - Suspicious URL shorteners (bit.ly, tinyurl, goo.gl, t.me, telegra.ph)
   - Urgency tactics detection
   - Payment verification scams

3. **Visual Warning System**
   - Red/orange badges on suspicious messages
   - Pop-up alerts with threat details
   - Color-coded risk indicators (Scam vs. Suspicious)
   - Auto-hiding alerts after 15 seconds

4. **Dual Detection Mode**
   - **ML-Based**: Uses your backend Flask API for advanced detection
   - **Fallback**: Works even when backend is offline

## 🚀 How to Use

### Step 1: Install the Extension
```bash
# In Chrome/Edge, go to:
chrome://extensions/

# Enable "Developer mode" (top right)
# Click "Load unpacked"
# Select the extension folder
```

### Step 2: Start the Backend
```bash
cd backend
python app.py
# Run in one terminal to use ML-based detection
```

### Step 3: Open WhatsApp Web
```
Navigate to https://web.whatsapp.com
QR code scan to login
```

### Step 4: See It In Action
- Open any conversation
- As messages appear, they'll be scanned automatically
- Suspicious messages get flagged with a warning badge
- After 5 seconds, a detailed popup shows the analysis

## 🔴 What Gets Detected

The extension flags messages as **SCAM** if they contain:
- OTP/verification requests
- Urgent payment demands
- Password/identity verification attempts
- Suspicious shortened URLs
- Commands to update account details

## 📊 Understanding the Alerts

### 🚨 SCAM Alert (Red)
- High confidence threat detected
- Risk Score: 50/100 or higher
- Take immediate action

### ⚠️ SUSPICIOUS Alert (Orange)
- Potential threat detected
- Risk Score: 25-50/100
- Verify before responding

### ✅ SAFE (Green Badge)
- No threats detected
- Safe to respond

## 🔧 Troubleshooting

### Extension not detecting messages?
1. Check browser console (F12) for errors
2. Ensure WhatsApp Web is fully loaded
3. Refresh the page (Ctrl+Shift+R)
4. Check if detection is enabled in popup

### Backend shows "offline"?
1. Make sure `python app.py` is running
2. Check it's listening on `http://localhost:5000`
3. Extension will use fallback detection if offline

### Messages not highlighting?
1. Wait 2-3 seconds for initial scan
2. Send a test message to yourself
3. Watch for badges appearing on new messages

## 📱 Test Messages

Try sending these to yourself to test detection:

**Scam Examples:**
- "Verify your WhatsApp account: bit.ly/verify"
- "Urgent! Update your payment method now"
- "Confirm your identity: click here immediately"

**Safe Examples:**
- "Hi, how are you?"
- "Can we call tomorrow?"
- "Thanks for the message"

## 🛡️ Pro Tips

1.  **Enable All Platforms**: Detection also works on Gmail
2.  **Check Backend Status**: Green dot = ML model active
3.  **Review Threats**: Expand threat details in alerts
4.  **Trust Your Gut**: If something feels off, it probably is!

## 📋 Recent Improvements

✅ Multi-version WhatsApp Web selector support  
✅ WhatsApp-specific scam pattern recognition  
✅ Enhanced visual warning badges  
✅ Better message extraction logic  
✅ Support for URL detection (Telegram links, etc.)  
✅ Improved fallback detection  
✅ Detailed logging for debugging  

## ❓ Need Help?

Check the extension console:
```javascript
// Open DevTools (F12)
// Look for messages like:
// "📱 Found 5 existing WhatsApp messages to scan"
// "[whatsapp] SCAM DETECTED: {...}"
```

---

**Stay Safe! Report suspicious messages to WhatsApp abuse team.**
