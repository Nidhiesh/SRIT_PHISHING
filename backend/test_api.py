import requests
import json

# Test the API with a scam message
url = "http://localhost:5000/detect"
headers = {"Content-Type": "application/json"}
data = {"message": "Congratulations! You won 50000 rupees in our lottery. Click here to claim now."}

try:
    response = requests.post(url, headers=headers, json=data)
    print("Status Code:", response.status_code)
    print("Response:", json.dumps(response.json(), indent=2))
except Exception as e:
    print("Error:", e)
