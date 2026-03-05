# CyberShield · backend/app.py
# Run: python app.py

from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle, os

app = Flask(__name__)
CORS(app, origins="*")

def load():
    if not (os.path.exists("model.pkl") and os.path.exists("vectorizer.pkl")):
        print("❌ Run python train_model.py first!")
        return None, None
    m = pickle.load(open("model.pkl","rb"))
    v = pickle.load(open("vectorizer.pkl","rb"))
    print("✅ Model loaded")
    return m, v

model, vec = load()

@app.route("/", methods=["GET"])
def home():
    return jsonify({"name":"CyberShield API","status":"running","model":model is not None})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status":"ok","model":model is not None})

@app.route("/predict", methods=["POST"])
def predict():
    try:
        body = request.get_json(force=True, silent=True) or {}
        msg  = str(body.get("message","")).strip()[:800]
        if not msg or model is None:
            return jsonify({"prediction":"safe","probability":0})
        v2   = vec.transform([msg])
        pred = model.predict(v2)[0]
        prob = model.predict_proba(v2)[0]
        cls  = list(model.classes_)
        pct  = round(float(prob[cls.index("scam")])*100, 1)
        print(f"[predict] {pred.upper():4s} {pct:5.1f}%  {msg[:60]}")
        return jsonify({"prediction":pred,"probability":pct})
    except Exception as e:
        return jsonify({"prediction":"safe","probability":0,"error":str(e)})

if __name__ == "__main__":
    print("🛡️  CyberShield API → http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)