import math, requests
from mapbox_vector_tile import decode

TOKEN = "MLY|27920502057591282|241fd48f0f74fcf4942e335e917ee850"
lon, lat, z = 77.1996, 28.6067, 14
n = 2 ** z
x = int((lon + 180) / 360 * n)
y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
url = f"https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}"
r = requests.get(url, params={"access_token": TOKEN}, timeout=30)
print("tile", z, x, y, r.status_code, len(r.content))
if r.ok:
    data = decode(r.content)
    for layer_name, layer in data.items():
        print("layer", layer_name, "features", len(layer.get("features", [])))
        for feature in layer.get("features", [])[:5]:
            print(feature.get("properties"))
