"""
CYBER SHIELD - ML MODEL TRAINING WITH HUGGING FACE DATASET
Trains a Random Forest model using existing data + Hugging Face phishing email dataset
"""

import pickle
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from datasets import load_dataset
import warnings
warnings.filterwarnings('ignore')

# ============ LOAD HUGGING FACE DATASET ============

print("Loading Hugging Face phishing email dataset...")
try:
    ds = load_dataset("zefang-liu/phishing-email-dataset")
    print(f"✓ Hugging Face dataset loaded successfully")
    print(f"  - Train split: {len(ds['train'])} emails")
    
    # Extract emails and labels from Hugging Face dataset
    hf_emails = []
    hf_labels = []
    
    for item in ds['train']:
        # The dataset has 'Email Text' and 'Email Type' columns
        if 'Email Text' in item and 'Email Type' in item:
            email_text = str(item['Email Text']).strip()
            email_type = str(item['Email Type']).strip()
            
            # Convert email type to label (1 for phishing, 0 for safe)
            if email_type.lower() in ['phishing email', 'phishing', 'spam', 'malicious']:
                label = 1
            else:  # Safe Email, legitimate, etc.
                label = 0
            
            hf_emails.append(email_text)
            hf_labels.append(label)
    
    print(f"  - Processed {len(hf_emails)} emails from Hugging Face")
    print(f"  - Phishing emails: {sum(hf_labels)}")
    print(f"  - Legitimate emails: {len(hf_labels) - sum(hf_labels)}")
    
except Exception as e:
    print(f"❌ Error loading Hugging Face dataset: {e}")
    print("Continuing with existing dataset only...")
    hf_emails = []
    hf_labels = []

# ============ EXISTING TRAINING DATA ============

SCAM_MESSAGES = [
    # OTP/Verification Scams
    "Your OTP is 123456. Never share with anyone",
    "Verify your account immediately by entering your OTP",
    "Confirm your identity - enter your one time password now",
    "Account verification required - click link to confirm OTP",
    "Security alert: verify your account with OTP",
    "Enter OTP to confirm your identity now",
    "Urgent: Verify OTP for account security",
    "Your OTP expires in 10 minutes - confirm now",
    
    # Payment/Banking Scams
    "Update your payment method to continue using services",
    "Your bank account has been compromised - verify now",
    "Urgent: confirm your bank details immediately",
    "Transaction failed - re-enter your credit card details",
    "Your payment method has expired - update immediately",
    "Banking security alert - verify account now",
    "Confirm your CVV for transaction completion",
    "Account locked - verify bank information",
    "Update banking information urgently required",
    "Credit card declined - enter details again",
    "Bank account verification needed immediately",
    "http://secure-payment-update-account.com",
    "http://bank-verification-alert-login.net",
    "http://transaction-secure-check.xyz",
    "http://card-security-update.click",
    "http://payment-method-update-now.top",
    "http://secure-bank-login-verification.ru",
    "http://payment-confirmation-check.site",
    "http://bank-account-verify-now.click",
    "http://update-bank-info-secure.xyz",
    "http://card-payment-verification.top",
    "http://bank-alert-login-check.click",
    "http://service-payment-update.net",
    "http://bank-login-authentication.xyz",
    "http://secure-transaction-confirmation.click",
    "http://payment-secure-check.top",
    "http://bank-account-warning-check.site",
    "http://secure-payment-update-alert.xyz",
    "http://bank-security-confirmation.click",
    "http://card-payment-check.top",
    "http://account-security-verification.net",
    
    # Prize/Lottery Scams
    "Congratulations! You won 50000 rupees in our lottery",
    "You have won a prize - claim it now by clicking here",
    "Lucky day! You are selected for special giveaway",
    "Congratulations! Claim your free iPhone now",
    "You won the grand prize - verify to collect",
    "Congratulations on winning our contest!",
    "Special prize waiting for you - claim now",
    "You won cash - verify identity to claim",
    
    # Urgent Action Scams
    "URGENT: Your account will be suspended in 24 hours",
    "Action required: suspicious activity detected on account",
    "IMMEDIATE ACTION NEEDED - unusual login detected",
    "Account compromised - change password immediately",
    "Unusual activity - verify immediately or lose access",
    "URGENT ACTION REQUIRED - verify account now",
    "Your account has been locked - unlock immediately",
    "CRITICAL: Unusual login detected from unknown location",
    "Account at risk - take action now",
    
    # Phishing/Link Scams
    "Click here to reset your password: bit.ly/reset123",
    "Verify your account: tinyurl.com/verify",
    "Login to your account: goo.gl/account",
    "Update profile: ow.ly/secure/login",
    "Confirm identity: short.link/verify",
    "Download security update: bit.ly/security",
    "Important notice - click link to verify",
    "Secure your account: bit.ly/security/update",
    
    # URL-Based Scams (Shortened Services)
    "Click to verify: https://t.me/verify123",
    "Update payment: https://tinyurl.com/payment",
    "Confirm now: https://bit.ly/confirm-account",
    "Login here: https://goo.gl/login-secure",
    "Verify account: https://short.link/banking",
    "Click urgently: https://ow.ly/secure/account",
    "Action needed: https://buff.ly/verify-now",
    "Claim reward: https://clck.ru/reward-now",
    "Check here: https://is.gd/verify-bank",
    "Open link: https://spr.ly/account-verify",
    "Visit: https://qr.net/confirmation",
    "Verify: https://telegra.ph/verify-account",
    "Claim: https://tg.me/get-reward",
    "Update: https://tinyurl.com/update-payment",
    
    # Tunneling/Proxy Service URLs (Cloudflare Tunnels used for phishing)
    "Verify now: https://records-served-compounds-catch.trycloudflare.com",
    "Confirm identity: https://labels-thy-water-receiving.trycloudflare.com",
    
    # Phishing Domain URLs
    "Verify account: http://paypal-verify-account.xyz",
    "Update bank: http://bank-login-secure.site",
    "Confirm payment: http://amazon-account-verify.click",
    "Google verification: http://google-account-confirm.top",
    "Apple ID verify: http://apple-id-verification.net",
    "Microsoft account: http://microsoft-account-check.ru",
    "PayPal security: http://paypal-security-alert.com",
    "Amazon security: http://amazon-security-check.org",
    "Bank alert: http://bank-security-verification.io",
    "Update payment: http://payment-verification-urgent.xyz",
    "Verify identity: http://identity-confirmation-secure.click",
    "Account security: http://account-security-alert.top",
    "Confirm transaction: http://transaction-verification.net",
    "Login verification: http://login-secure-verify.site",
    
    # Suspicious Subdomain/IP URLs
    "Verify: http://192.168.1.1/account-verify",
    "Login: http://10.0.0.1/banking-portal",
    "Update: http://172.16.0.1/payment-portal",
    "Confirm: http://verify-account-secure.tk",
    "Check: http://confirm-identity.ml",
    "Action: http://urgent-action.ga",
    "Alert: http://security-alert.cf",
    "Warning: http://account-warning.top",
    "Blocked: http://unblock-account.bid",
    "Suspended: http://account-suspended.win",
    
    # Telegram/Messaging Scam URLs
    "Join group: https://t.me/reward-claim",
    "Get reward: https://tg.me/free-money",
    "Claim prize: https://telegram.dog/lottery-winner",
    "Submit details: https://telegra.ph/verify-now",
    "Verify telegram: https://t.me/account-verify",
    "Update profile: https://tg.me/profile-update",
    
    # Mixed Scam Messages with URLs
    "Your account is at risk! Verify immediately: bit.ly/account-fix",
    "Click to unblock account: https://verify-bank-now.xyz",
    "Update payment details urgently: http://payment-update.click?id=123",
    "Confirm identity with OTP: https://tinyurl.com/otp-verify",
    "Emergency: Unusual activity detected: bit.ly/security-check",
    "Verify WhatsApp: https://whatsapp-verify.xyz/confirm",
    "Your Amazon account suspended: bit.ly/amazon-verify",
    "Facebook security alert - action required: https://facebook-verify.net",
    "Google account recovery: http://google-account-recovery.top",
    "PayPal account limited - verify: https://short.link/paypal",
    "Apple ID needs verification: http://apple-verify-secure.xyz",
    "Microsoft account compromised: bit.ly/microsoft-fix",
    "Banking alert - confirm details: https://bank-alert.click",
    "Card fraud alert - update card: http://card-verification.net",
    "Your account will be deleted! Claim here: https://claim-account.xyz",
    
    # Social Engineering
    "Hi, I need your help with urgent payment. Can you help?",
    "Can you please transfer 5000 to this account? Emergency",
    "My account is compromised - please send money urgently",
    "Friend in trouble - need immediate money transfer",
    "Lost wallet - can you send me 2000 rupees urgently?",
    "Help me please - need money urgently",
    "Emergency situation - can you transfer money?",
    
    # Impersonation Scams
    "This is your bank - verify your details immediately",
    "Google Alert - suspicious login detected",
    "Amazon Security Team - confirm your account",
    "Facebook: confirm identity with your password",
    "WhatsApp Security - verify your account number",
    
    # Malware/Download Scams
    "Download latest security update - click here",
    "Install this app to get free recharge",
    "Download app to claim your free gift card",
    "Critical system update required - install now",
    "You have a virus - download cleaner now",
    "System scan recommended - download now",
    "Important update available - download immediately",
    
    # Investment/Money Scams
    "Earn 50000 per month working from home",
    "Invest 5000 to get 50000 guaranteed returns",
    "Secret investment opportunity - limited time",
    "Make money fast - join our scheme now",
    "Guaranteed returns on investment - contact now",
    "Bitcoin trading - guaranteed 100% profit",
    "Special investment: double your money guaranteed",
    
    # Credential Theft
    "Please confirm your username and password",
    "Enter your email and password to continue",
    "Login required - enter credentials here",
    "Session expired - re-enter your login details",
    "Verify credentials - enter username and password",
    
    # Romance/Catfish Scams
    "I love you - can you send me money for my visa?",
    "Baby I need help - can you transfer 10000?",
    "My love, my card is blocked - help me please",
    "Darling, emergency - send me money immediately",
    
    # Technical Support Scams
    "Your device has virus - call us immediately",
    "System error detected - contact support now",
    "Your computer is infected - click to clean",
    "Windows security alert - fix problems now",
    "Device compromised - remove threat immediately",
    
    # Job/Employment Scams
    "You are selected for job - pay 5000 for documents",
    "Job offer with 100000 salary - confirm now",
    "Work from home job - pay registration fee",
    "Selected for position - send processing fee",
    
    # Extreme Urgency
    "!!URGENT!! VERIFY NOW OR LOSE ACCESS",
    "DO NOT SHARE THIS MESSAGE!!!",
    "ONLY FOR LIMITED TIME!!!",
    "ACT NOW BEFORE IT'S TOO LATE",
    "YOUR ACCOUNT IS IN DANGER - FIX IT NOW",
]

SAFE_MESSAGES = [
    # Legitimate Business
    "Your order has been shipped. Tracking number: XYZ123",
    "Thank you for your purchase. Order confirmation attached",
    "Meeting scheduled for tomorrow at 10 AM",
    "Project deadline extended to next Friday",
    "Please review the attached document at your convenience",
    "Invoice #12345 is ready for download",
    "Appointment confirmed for next Tuesday",
    "Your subscription will renew on 15th",
    
    # Normal Conversation
    "Hey, how are you doing today?",
    "Let's grab coffee this weekend",
    "Did you watch the match last night?",
    "See you at the party tonight",
    "What time do you want to meet?",
    "Good morning! How's everything?",
    "Thanks for calling me yesterday",
    "Looking forward to seeing you",
    
    # Work Communication
    "Can you send me the report by EOD?",
    "Attended the meeting, notes below",
    "Approved your leave request for next week",
    "Your appraisal is scheduled for Monday",
    "Client feedback received - will follow up",
    "Team meeting at 2 PM in conference room",
    "Project update: on track for deadline",
    
    # Service Notifications
    "Your appointment is confirmed for next Tuesday",
    "Reminder: Your bill is due on 15th",
    "Delivery scheduled for tomorrow between 2-5 PM",
    "Your package has arrived at the store",
    "Service request received - we'll contact you soon",
    "Hotel booking confirmation received",
    "Flight ticket booked successfully",
    
    # Legitimate Updates
    "New features available - check your account",
    "System maintenance completed successfully",
    "Your subscription has been renewed",
    "Payment received successfully",
    "Your account details have been updated",
    "Profile update saved successfully",
    "Settings changed successfully",
    
    # Friendship Messages
    "Happy birthday! Have a wonderful day",
    "Congratulations on your promotion",
    "Looking forward to seeing you soon",
    "Thanks for the lovely gift",
    "How's everything going with you?",
    "Miss you! When will you be back?",
    "Great to hear from you again",
    
    # Educational/Learning
    "Your course enrollment is confirmed",
    "Certificate issued for completed training",
    "New learning materials uploaded",
    "Assignment submission deadline: 30th",
    "You passed the exam with 85% score",
    "Course materials sent to your email",
    
    # Support Communication
    "We received your support ticket. Reference: #12345",
    "Your issue has been resolved. Please confirm",
    "Support team will call you within 2 hours",
    "Thank you for your feedback",
    "Customer service is here to help",
    "Your issue has been escalated",
    
    # Appointment/Booking
    "Your hotel booking is confirmed",
    "Flight ticket booked successfully",
    "Restaurant reservation for 2 persons at 7 PM",
    "Doctor appointment: 25th at 3:00 PM",
    "Your table is reserved for tonight",
    "Spa appointment confirmed tomorrow",
    
    # Family/Personal
    "I'm on my way home",
    "Miss you! When will you be back?",
    "Dinner ready, come eat",
    "Just checking in, everything okay?",
    "Love you too! See you soon",
    "Safe travels! Let me know when you arrive",
    
    # Financial (Legitimate)
    "Your salary has been credited",
    "Refund processed successfully",
    "Insurance claim approved",
    "Tax return filed successfully",
    "Investment statement attached",
    
    # Shopping
    "Order placed successfully for items",
    "You have 50% discount coupon available",
    "New products added to your wishlist",
    "Item back in stock - order now",
    "Free shipping on orders above 500",
    "Order will arrive in 2-3 business days",
    
    # Travel
    "Your flight boarding time is 10 AM",
    "Hotel check-in is at 3 PM tomorrow",
    "Itinerary shared for your trip",
    "Travel insurance activated",
    "Weather forecast for your destination",
    "Have a safe trip! Enjoy your vacation",
    
    # Legitimate URLs (from official services)
    "Check your order status: https://www.amazon.com/orders",
    "Download your invoice: https://www.invoice.com/document/12345",
    "View booking: https://www.booking.com/confirmation",
    "Access your account: https://www.gmail.com/mail",
    "Banking portal: https://www.mybank.co.in/login",
    "Track shipment: https://www.flipkart.com/track",
    "Course materials: https://www.coursera.org/learn",
    "Payment status: https://www.paypal.com/billing",
    "View document: https://www.google.com/drive",
    "Video link: https://www.youtube.com/watch?v=abc123",
    "Social profile: https://www.facebook.com/profile",
    "Update settings: https://www.linkedin.com/settings",
    "Cloud storage: https://www.dropbox.com/home",
    "Email: https://www.outlook.com/mail",
    "Repository: https://www.github.com/user/project",
    "Documentation: https://www.wikipedia.org/article",
    "News article: https://www.bbc.com/news",
    "Help center: https://www.support.google.com/help",
    "Terms & conditions: https://www.example.com/terms",
    "Privacy policy: https://www.example.com/privacy",
    "Contact us: https://www.company.com/contact",
    "About page: https://www.organization.org/about",
    "Download center: https://www.microsoft.com/downloads",
    "Product page: https://www.apple.com/products",
    "Customer support: https://support.amazon.com",
    "Wiki guide: https://wiki.example.com/guide",
    "Tutorial video: https://youtube.com/watch?v=tutorial",
]

print("=" * 80)
print("CYBER SHIELD - ML MODEL TRAINING WITH HUGGING FACE DATASET")
print("=" * 80)

# ============ COMBINE ALL DATASETS ============

print("\n[1] Combining datasets...")

# Existing data
existing_messages = SCAM_MESSAGES + SAFE_MESSAGES
existing_labels = [1] * len(SCAM_MESSAGES) + [0] * len(SAFE_MESSAGES)

print(f"    ✓ Existing messages: {len(existing_messages)}")
print(f"    ✓ Existing scams: {len(SCAM_MESSAGES)}")
print(f"    ✓ Existing safe: {len(SAFE_MESSAGES)}")

# Hugging Face data (if available)
if hf_emails:
    print(f"    ✓ Hugging Face emails: {len(hf_emails)}")
    print(f"    ✓ HF phishing: {sum(hf_labels)}")
    print(f"    ✓ HF legitimate: {len(hf_labels) - sum(hf_labels)}")
    
    # Combine all data
    all_messages = existing_messages + hf_emails
    all_labels = existing_labels + hf_labels
else:
    print("    ⚠ No Hugging Face data loaded, using existing dataset only")
    all_messages = existing_messages
    all_labels = existing_labels

print(f"    ✓ Total combined messages: {len(all_messages)}")
print(f"    ✓ Total scams: {sum(all_labels)}")
print(f"    ✓ Total safe: {len(all_labels) - sum(all_labels)}")

# ============ TRAINING PIPELINE ============

# Split dataset
print("\n[2] Splitting dataset into train/test...")
X_train, X_test, y_train, y_test = train_test_split(
    all_messages, all_labels, test_size=0.2, random_state=42, stratify=all_labels
)
print(f"    ✓ Training set: {len(X_train)} messages")
print(f"    ✓ Testing set: {len(X_test)} messages")

# Vectorize text using TF-IDF
print("\n[3] Vectorizing text using TF-IDF...")
vectorizer = TfidfVectorizer(
    max_features=8000,  # Increased for larger dataset
    ngram_range=(1, 3),  # Include trigrams for better pattern detection
    min_df=1,
    max_df=0.95,
    stop_words='english'
)
X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)
print(f"    ✓ Features created: {X_train_vec.shape[1]}")
print(f"    ✓ Training matrix shape: {X_train_vec.shape}")

# Train Random Forest
print("\n[4] Training Random Forest Classifier...")
model = RandomForestClassifier(
    n_estimators=300,  # More trees for larger dataset
    max_depth=25,      # Slightly deeper
    min_samples_split=3,
    min_samples_leaf=1,
    random_state=42,
    n_jobs=-1,
    class_weight='balanced'
)
model.fit(X_train_vec, y_train)
print("    ✓ Model training completed")

# Evaluate
print("\n[5] Evaluating model performance...")
y_pred = model.predict(X_test_vec)
accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred)
recall = recall_score(y_test, y_pred)
f1 = f1_score(y_test, y_pred)

print(f"    ✓ Accuracy:  {accuracy:.4f} ({accuracy*100:.2f}%)")
print(f"    ✓ Precision: {precision:.4f} ({precision*100:.2f}%)")
print(f"    ✓ Recall:    {recall:.4f} ({recall*100:.2f}%)")
print(f"    ✓ F1-Score:  {f1:.4f}")

# Feature importance
print("\n[6] Top 20 most important features:")
feature_names = np.array(vectorizer.get_feature_names_out())
feature_importance = model.feature_importances_
indices = np.argsort(feature_importance)[-20:][::-1]
for i, idx in enumerate(indices, 1):
    print(f"    {i:2d}. '{feature_names[idx]}': {feature_importance[idx]:.6f}")

# Test with some examples
print("\n[7] Testing with example messages...")
test_examples = [
    "Your OTP is 123456. Never share with anyone",
    "Meeting scheduled for tomorrow at 10 AM",
    "Congratulations! You won 50000 rupees in our lottery",
    "Your order has been shipped. Tracking number: XYZ123"
]

for msg in test_examples:
    msg_vec = vectorizer.transform([msg])
    prob = model.predict_proba(msg_vec)[0]
    pred = model.predict(msg_vec)[0]
    risk = "SCAM" if pred == 1 else "SAFE"
    print(f"    '{msg[:50]}...' -> {risk} ({prob[1]:.3f})")

# Save model and vectorizer
print("\n[8] Saving model and vectorizer...")
with open('model.pkl', 'wb') as f:
    pickle.dump(model, f)
print("    ✓ Model saved to model.pkl")

with open('vectorizer.pkl', 'wb') as f:
    pickle.dump(vectorizer, f)
print("    ✓ Vectorizer saved to vectorizer.pkl")

print("\n" + "=" * 80)
print("ENHANCED MODEL TRAINING COMPLETED SUCCESSFULLY!")
print("=" * 80)
print(f"\n✓ Dataset Sources:")
print(f"  • Existing curated examples: {len(existing_messages)}")
if hf_emails:
    print(f"  • Hugging Face phishing emails: {len(hf_emails)}")
print(f"\n✓ Model Performance:")
print(f"  • Accuracy:  {accuracy*100:.2f}%")
print(f"  • Precision: {precision*100:.2f}%")
print(f"  • Recall:    {recall*100:.2f}%")
print(f"  • F1-Score:  {f1:.4f}")
print(f"\n✓ Training Data Size: {len(all_messages)} messages")
print(f"\nFiles created:")
print("  • model.pkl")
print("  • vectorizer.pkl")
print("\nReady to start enhanced Flask server!")
print("=" * 80)
