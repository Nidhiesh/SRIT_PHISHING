"""
CYBER SHIELD BACKEND API
Flask server that uses ML model to detect scams in real-time
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import numpy as np
from datetime import datetime
import logging

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load trained model and vectorizer
try:
    with open('model.pkl', 'rb') as f:
        model = pickle.load(f)
    logger.info("✓ Model loaded successfully")
except FileNotFoundError:
    logger.error("❌ model.pkl not found. Run train_model.py first!")
    model = None

try:
    with open('vectorizer.pkl', 'rb') as f:
        vectorizer = pickle.load(f)
    logger.info("✓ Vectorizer loaded successfully")
except FileNotFoundError:
    logger.error("❌ vectorizer.pkl not found. Run train_model.py first!")
    vectorizer = None

# Statistics
stats = {
    'total_checks': 0,
    'scams_detected': 0,
    'safe_messages': 0,
    'last_check': None
}

# ============ HELPER FUNCTIONS ============

def extract_threats(message, probability):
    """Extract threat types from message"""
    threats = []
    msg_lower = message.lower()
    
    if any(word in msg_lower for word in ['otp', 'one time', 'verification']):
        threats.append('OTP Request')
    if any(word in msg_lower for word in ['urgent', 'immediately', 'now']):
        threats.append('Urgency Tactic')
    if any(word in msg_lower for word in ['verify', 'confirm', 'authenticate']):
        threats.append('Identity Verification')
    if any(word in msg_lower for word in ['bit.ly', 'tinyurl', 'goo.gl', 'ow.ly']):
        threats.append('Suspicious URL')
    if any(word in msg_lower for word in ['congratulations', 'won', 'prize']):
        threats.append('Prize Scam')
    if any(word in msg_lower for word in ['bank', 'payment', 'credit card']):
        threats.append('Financial Request')
    if any(word in msg_lower for word in ['update', 'change', 'confirm']):
        threats.append('Action Required')
    
    return threats[:3]  # Return top 3 threats

# ============ API ENDPOINTS ============

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'online',
        'model_loaded': model is not None,
        'vectorizer_loaded': vectorizer is not None,
        'timestamp': datetime.now().isoformat()
    }), 200

@app.route('/detect', methods=['POST'])
def detect():
    """
    Main endpoint for scam detection
    
    Request: {"message": "text to check"}
    Response: {"risk_level": "safe/suspicious/scam", "confidence": 0-1, ...}
    """
    
    if model is None or vectorizer is None:
        return jsonify({
            'error': 'Model not loaded. Run train_model.py first!',
            'status': 'error'
        }), 500
    
    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'error': 'Missing "message" field'}), 400
        
        message = data.get('message', '').strip()
        
        if len(message) < 3:
            return jsonify({'error': 'Message too short'}), 400
        
        if len(message) > 1000:
            return jsonify({'error': 'Message too long'}), 400
        
        # Vectorize and predict
        msg_vec = vectorizer.transform([message])
        prediction = model.predict(msg_vec)[0]
        probability = model.predict_proba(msg_vec)[0]
        
        scam_probability = probability[1]
        
        # Check if message matches training data patterns (high confidence match)
        matches_training_patterns = scam_probability >= 0.6
        
        # Determine risk level (stricter for real-world deployment)
        if scam_probability >= 0.75:
            risk_level = 'scam'
        elif scam_probability >= 0.5:
            risk_level = 'suspicious'
        else:
            risk_level = 'safe'
        
        # Extract threats
        threats = extract_threats(message, scam_probability)
        
        # Update statistics
        stats['total_checks'] += 1
        if risk_level != 'safe':
            stats['scams_detected'] += 1
        else:
            stats['safe_messages'] += 1
        stats['last_check'] = datetime.now().isoformat()
        
        result = {
            'prediction': int(prediction),
            'confidence': float(scam_probability),
            'risk_level': risk_level,
            'threats': threats,
            'matches_training_patterns': bool(matches_training_patterns),
            'check_id': f"CHK_{stats['total_checks']:06d}",
            'timestamp': datetime.now().isoformat()
        }
        
        return jsonify(result), 200
    
    except Exception as e:
        logger.error(f"Error in /detect: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/stats', methods=['GET'])
def get_stats():
    """Get detection statistics"""
    return jsonify({
        'total_checks': stats['total_checks'],
        'scams_detected': stats['scams_detected'],
        'safe_messages': stats['safe_messages'],
        'last_check': stats['last_check']
    }), 200

@app.route('/test', methods=['POST'])
def test_model():
    """Test the model with predefined examples"""
    
    test_cases = {
        'scams': [
            'Your OTP is 123456. Never share this',
            'Verify your account immediately',
            'Congratulations! You won 50000 rupees'
        ],
        'safe': [
            'Meeting scheduled for tomorrow',
            'How are you doing today?',
            'Your order has been shipped'
        ]
    }
    
    results = {'scams_correct': 0, 'safe_correct': 0}
    
    for msg in test_cases['scams']:
        msg_vec = vectorizer.transform([msg])
        prob = model.predict_proba(msg_vec)[0]
        if prob[1] >= 0.4:  # If detected as scam/suspicious
            results['scams_correct'] += 1
    
    for msg in test_cases['safe']:
        msg_vec = vectorizer.transform([msg])
        prob = model.predict_proba(msg_vec)[0]
        if prob[1] < 0.4:  # If detected as safe
            results['safe_correct'] += 1
    
    accuracy = (results['scams_correct'] + results['safe_correct']) / 6
    
    return jsonify({
        'test_results': results,
        'accuracy': accuracy,
        'total_correct': results['scams_correct'] + results['safe_correct'],
        'timestamp': datetime.now().isoformat()
    }), 200

@app.route('/', methods=['GET'])
def info():
    """API information"""
    return jsonify({
        'service': 'Cyber Shield ML Backend',
        'version': '3.0',
        'endpoints': {
            '/health': 'Server health',
            '/detect': 'Detect scam (POST)',
            '/stats': 'Statistics',
            '/test': 'Test model'
        }
    }), 200

# ============ ERROR HANDLERS ============

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Server error'}), 500

# ============ START SERVER ============

if __name__ == '__main__':
    print("\n" + "=" * 80)
    print("CYBER SHIELD BACKEND API - STARTING SERVER")
    print("=" * 80)
    print(f"\n✓ Model Status: {'Loaded' if model else 'NOT LOADED'}")
    print(f"✓ Vectorizer Status: {'Loaded' if vectorizer else 'NOT LOADED'}")
    print("\nServer running on: http://localhost:5000")
    print("\nAPI Endpoints:")
    print("  GET  /health      - Health check")
    print("  POST /detect      - Detect scam in message")
    print("  GET  /stats       - Get statistics")
    print("  POST /test        - Test model")
    print("  GET  /            - API information")
    print("\n" + "=" * 80)
    
    if model and vectorizer:
        app.run(debug=True, host='0.0.0.0', port=5000)
    else:
        print("\n❌ ERROR: Model or vectorizer not loaded!")
        print("Run: python train_model.py")