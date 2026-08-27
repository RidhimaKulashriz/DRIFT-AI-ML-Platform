import json
import requests

TOKEN = "MLY|27920502057591282|241fd48f0f74fcf4942e335e917ee850"
fields = "id,computed_geometry,thumb_1024_url,is_pano,captured_at,compass_angle"
found = []
for lat in [28.40 + i * 0.05 for i in range(11)]:
    for lng in [76.85 + j * 0.05 for j in range(14)]:
        delta = 0.004
        params = {
            "access_token": TOKEN,
            "fields": fields,
            "bbox": f"{lng-delta},{lat-delta},{lng+delta},{lat+delta}",
            "limit": 10,
        }
        r = requests.get("https://graph.mapillary.com/images", params=params, timeout=20)
        if r.status_code == 200:
            data = r.json().get("data", [])
            if data:
                found.extend(data)
                print(json.dumps({"center": [lat, lng], "count": len(data), "first": data[0]}))
                raise SystemExit
        else:
            print("error", r.status_code, r.text[:250])
print("NO_COVERAGE")
