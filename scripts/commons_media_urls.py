import json
import urllib.parse
import urllib.request

files = [
    "File:Lewis River Bridge - Spalling concrete (42223630094).jpg",
    "File:01 476 Bf Naundorf (b Oschatz), Schiene mit Längsriss.jpg",
]

for title in files:
    query = urllib.parse.urlencode({
        "action": "query",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "format": "json",
    })
    request = urllib.request.Request(
        "https://commons.wikimedia.org/w/api.php?" + query,
        headers={"User-Agent": "DRIFT-AI-ML-Platform research contact"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.load(response)
    page = next(iter(data["query"]["pages"].values()))
    info = page["imageinfo"][0]
    license_name = info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
    print(title)
    print(info["url"])
    print(license_name)
    print()
