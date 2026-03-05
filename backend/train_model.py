# CyberShield · backend/train_model.py
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import pickle

SCAM = [
    "Please send OTP to verify your account now",
    "Your bank account will be blocked send OTP immediately",
    "Enter your OTP to receive cashback reward",
    "Share your OTP to complete the transaction",
    "Confirm your ATM PIN to unlock your account",
    "Verify your bank account details now",
    "Update your KYC immediately to avoid account block",
    "Your PAN card has been blocked update now",
    "Aadhaar update required click here immediately",
    "Your debit card is blocked confirm password to reactivate",
    "Congratulations you have won a lottery of 10 lakh rupees",
    "You are selected as a lucky winner click here to claim",
    "You won an Amazon gift card claim now",
    "Lucky draw winner selected collect your prize",
    "You have won a free iPhone 15 click this link",
    "Claim your cashback reward of 5000 rupees now",
    "Collect your government subsidy of 50000 now",
    "Free recharge offer for selected users click link",
    "A police case has been filed against your number",
    "CBI has issued an arrest warrant in your name",
    "Income tax department has issued notice pay fine now",
    "Your electricity connection will be cut today pay now",
    "Your SIM card will be blocked in 24 hours update now",
    "Click this link to update your bank details urgently",
    "Your package is waiting pay delivery charge to receive",
    "Loan approved for you click link to claim now",
    "TRAI will block your number click to verify",
    "Your UPI is suspended click here to reactivate",
    "Urgent your account will be deactivated verify immediately",
    "WhatsApp will be suspended unless you verify your number",
    "Send your Aadhaar number to receive your subsidy amount",
    "Cybercrime department has registered complaint against you",
    "Bank server upgrade required verify your details immediately",
    "You have been selected for PMJDY scheme claim benefits",
    "Free government scheme apply now limited slots available",
]

SAFE = [
    "Hey how are you doing today",
    "Let us meet tomorrow for the project discussion",
    "Happy birthday have a great day ahead",
    "Please send me the assignment file when you get time",
    "Call me when you reach home safely",
    "See you in class tomorrow morning",
    "Can you share the notes from yesterday lecture",
    "Let us start the meeting at 5 pm today",
    "I will send you the report by evening",
    "Thank you so much for your help yesterday",
    "Let us have lunch together at the canteen",
    "Please review the code I sent you last night",
    "Meeting is rescheduled to tomorrow afternoon",
    "Good morning have a productive day",
    "Are you coming to college today",
    "The class starts at 10 am please be on time",
    "We will complete the work by Friday deadline",
    "Let us plan the trip to Ooty next weekend",
    "How was your exam today did it go well",
    "Did you watch the cricket match last night",
    "Please bring your laptop to the lab session",
    "I finished the assignment and submitted it",
    "Can we reschedule our call to tomorrow evening",
    "The project deadline has been extended to next Friday",
    "I will share the Google doc link shortly",
    "See you at the library at 3 pm today",
    "Can you help me understand this concept please",
    "Good luck with your presentation today",
    "Happy new year to you and your entire family",
    "Please confirm your attendance for the event tomorrow",
    "Thanks for the update I will check it now",
    "The internship interview is scheduled for Monday",
    "Can you send me the project files please",
    "The results will be announced next week",
    "Please join the video call at 6 pm",
    "I really enjoyed our conversation yesterday",
]

texts  = SCAM + SAFE
labels = ["scam"]*len(SCAM) + ["safe"]*len(SAFE)
df = pd.DataFrame({"text":texts,"label":labels}).sample(frac=1,random_state=42).reset_index(drop=True)
print(f"Dataset: {len(SCAM)} scam + {len(SAFE)} safe")

vectorizer = TfidfVectorizer(ngram_range=(1,3), max_features=8000, sublinear_tf=True)
X = vectorizer.fit_transform(df["text"])
y = df["label"]
X_tr,X_te,y_tr,y_te = train_test_split(X,y,test_size=0.2,random_state=42,stratify=y)
model = LogisticRegression(max_iter=500, C=3.0)
model.fit(X_tr, y_tr)

print(f"Accuracy: {accuracy_score(y_te, model.predict(X_te))*100:.1f}%")
print(classification_report(y_te, model.predict(X_te)))

pickle.dump(model,      open("model.pkl","wb"))
pickle.dump(vectorizer, open("vectorizer.pkl","wb"))
print("✅ model.pkl + vectorizer.pkl saved — run: python app.py")