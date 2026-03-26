import requests
import json

# Test the API with a safe message
url = "http://localhost:5000/detect"
headers = {"Content-Type": "application/json"}
data = {"message": "Meeting scheduled for tomorrow at 10 AM. Please confirm your attendance."}

try:
    response = requests.post(url, headers=headers, json=data)
    print("Status Code:", response.status_code)
    print("Response:", json.dumps(response.json(), indent=2))
except Exception as e:
    print("Error:", e)
