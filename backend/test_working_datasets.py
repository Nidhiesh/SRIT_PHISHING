"""
Test CyberShield with Verified Working Hugging Face Datasets
"""

from datasets import load_dataset
import pickle
import warnings
warnings.filterwarnings('ignore')

# Load your trained model
try:
    with open('model.pkl', 'rb') as f:
        model = pickle.load(f)
    with open('vectorizer.pkl', 'rb') as f:
        vectorizer = pickle.load(f)
    print("✅ Model loaded successfully")
except:
    print("❌ Model not found. Run train_model_with_huggingface.py first")
    exit()

def test_with_samples():
    """Test with sample messages from different scam types"""
    
    print("=" * 80)
    print("CYBER SHIELD - SCAM TYPE TESTING")
    print("=" * 80)
    
    # Test samples representing different scam types from various datasets
    test_cases = [
        # SMS Spam style
        {
            "text": "Congratulations! Your mobile number has won $2000 in our lottery. Claim now at www.claim-prize.com",
            "type": "SMS Lottery Scam",
            "expected": "SCAM"
        },
        {
            "text": "FREE entry into our contest for a chance to win a $500 Amazon gift card. Text WIN to 55555",
            "type": "SMS Contest Scam", 
            "expected": "SCAM"
        },
        
        # Email Phishing style
        {
            "text": "Dear user, your account will be suspended. Please verify your identity immediately: http://secure-verify-now.com",
            "type": "Email Phishing",
            "expected": "SCAM"
        },
        {
            "text": "URGENT: Unusual login detected from unknown location. Click here to secure your account: bit.ly/security-check",
            "type": "Urgent Action Scam",
            "expected": "SCAM"
        },
        
        # Financial Scams
        {
            "text": "Make $5000 per week working from home! No experience needed. Start today: www.work-from-home-rich.com",
            "type": "Job/Money Scam",
            "expected": "SCAM"
        },
        {
            "text": "Invest $1000 in Bitcoin and get $10000 guaranteed return in 7 days. Limited time offer!",
            "type": "Investment Scam",
            "expected": "SCAM"
        },
        
        # Safe messages
        {
            "text": "Meeting scheduled for tomorrow at 2 PM. Please confirm your attendance.",
            "type": "Business Communication",
            "expected": "SAFE"
        },
        {
            "text": "Your order has been shipped and will arrive in 3-5 business days. Tracking number: XYZ123",
            "type": "E-commerce Notification",
            "expected": "SAFE"
        },
        {
            "text": "Hi, how are you doing? Would you like to grab coffee this weekend?",
            "type": "Personal Message",
            "expected": "SAFE"
        },
        {
            "text": "Thank you for your purchase. Your receipt is attached for your records.",
            "type": "Transaction Confirmation",
            "expected": "SAFE"
        }
    ]
    
    print(f"\n🧪 Testing {len(test_cases)} different message types...\n")
    
    correct = 0
    total = len(test_cases)
    
    for i, case in enumerate(test_cases, 1):
        try:
            # Make prediction
            text_vec = vectorizer.transform([case["text"]])
            prediction = model.predict(text_vec)[0]
            probability = model.predict_proba(text_vec)[0][1]
            
            predicted_label = "SCAM" if prediction == 1 else "SAFE"
            is_correct = "✅" if predicted_label == case["expected"] else "❌"
            
            if predicted_label == case["expected"]:
                correct += 1
            
            print(f"{i}. {case['type']}")
            print(f"   Text: {case['text'][:60]}...")
            print(f"   Expected: {case['expected']} | Predicted: {predicted_label} | Confidence: {probability:.3f} {is_correct}")
            print()
            
        except Exception as e:
            print(f"   Error processing case {i}: {e}")
    
    accuracy = correct / total
    print("=" * 80)
    print(f"📊 RESULTS: {correct}/{total} correct ({accuracy:.1%} accuracy)")
    print("=" * 80)

def test_huggingface_alternatives():
    """Try to load some alternative Hugging Face datasets"""
    
    print("\n🔍 TRYING ALTERNATIVE DATASETS...")
    
    # List of datasets to try
    datasets_to_try = [
        "sms_spam",  # Common SMS spam dataset
        "imdb",      # Movie reviews (sentiment)
        "ag_news",   # News classification
    ]
    
    for dataset_name in datasets_to_try:
        try:
            print(f"\n📥 Loading {dataset_name}...")
            ds = load_dataset(dataset_name)
            print(f"✅ Successfully loaded {dataset_name}")
            
            # Show dataset info
            if 'train' in ds:
                train_data = ds['train']
                print(f"   - Train samples: {len(train_data)}")
                print(f"   - Features: {train_data.column_names}")
                
                # Test a few samples
                for i in range(min(3, len(train_data))):
                    sample = train_data[i]
                    # Get text from common column names
                    text = ""
                    for col in ['text', 'sentence', 'review', 'message']:
                        if col in sample:
                            text = str(sample[col])[:100]
                            break
                    
                    if text:
                        try:
                            text_vec = vectorizer.transform([text])
                            pred = model.predict(text_vec)[0]
                            prob = model.predict_proba(text_vec)[0][1]
                            label = "SCAM" if pred == 1 else "SAFE"
                            print(f"   Sample {i+1}: {label} ({prob:.3f}) - {text[:50]}...")
                        except:
                            continue
            
        except Exception as e:
            print(f"❌ Could not load {dataset_name}: {e}")

if __name__ == "__main__":
    test_with_samples()
    test_huggingface_alternatives()
