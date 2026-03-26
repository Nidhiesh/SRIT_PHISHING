"""
Test CyberShield with Multiple Hugging Face Datasets
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

def test_dataset(dataset_name, text_column, label_column, positive_label):
    """Test a specific dataset"""
    print(f"\n🔍 Testing: {dataset_name}")
    print("-" * 50)
    
    try:
        ds = load_dataset(dataset_name)
        
        # Get test samples (limit to 50 for quick testing)
        test_samples = []
        test_labels = []
        
        for split in ds.keys():
            for item in ds[split]:
                if len(test_samples) >= 50:
                    break
                    
                text = str(item.get(text_column, '')).strip()
                label = str(item.get(label_column, '')).strip()
                
                if text and len(text) > 10:
                    test_samples.append(text)
                    # Convert label to binary (1=scam/phishing, 0=safe)
                    test_labels.append(1 if label.lower() == positive_label.lower() else 0)
        
        print(f"📊 Samples loaded: {len(test_samples)}")
        
        # Test predictions
        correct = 0
        for i, (text, true_label) in enumerate(zip(test_samples, test_labels)):
            try:
                text_vec = vectorizer.transform([text])
                prediction = model.predict(text_vec)[0]
                if prediction == true_label:
                    correct += 1
            except:
                continue
        
        accuracy = correct / len(test_samples) if test_samples else 0
        print(f"🎯 Accuracy: {accuracy:.3f} ({correct}/{len(test_samples)})")
        
        # Show examples
        print(f"\n📝 Sample Predictions:")
        for i, (text, true_label) in enumerate(zip(test_samples[:3], test_labels[:3])):
            try:
                text_vec = vectorizer.transform([text])
                pred = model.predict(text_vec)[0]
                prob = model.predict_proba(text_vec)[0][1]
                
                actual = "SCAM" if true_label == 1 else "SAFE"
                predicted = "SCAM" if pred == 1 else "SAFE"
                
                print(f"  {i+1}. {text[:60]}...")
                print(f"     Actual: {actual} | Predicted: {predicted} | Conf: {prob:.3f}")
            except:
                continue
                
    except Exception as e:
        print(f"❌ Error loading {dataset_name}: {e}")

# Test different datasets
print("=" * 80)
print("CYBER SHIELD - MULTI-DATASET TESTING")
print("=" * 80)

# 1. SMS Spam Collection
test_dataset(
    "uciml/sms-spam-collection",
    text_column="message",
    label_column="label", 
    positive_label="spam"
)

# 2. Hate Speech Detection
test_dataset(
    "dataset/hate_speech_offensive",
    text_column="tweet",
    label_column="class",
    positive_label="0"  # hate speech
)

# 3. Twitter Sentiment
test_dataset(
    "twitter_sentiment_analysis",
    text_column="text",
    label_column="label",
    positive_label="1"  # negative sentiment
)

print("\n" + "=" * 80)
print("TESTING COMPLETE")
print("=" * 80)
