"""Generates sample product illustrations and price-tag images for the demo catalog.

Run from the project root:  python3 scripts/generate-seed-images.py
Writes public/catalog/<SKU>.jpg, public/catalog/tags/<SKU>-tag.jpg and db/seed-assets/thumbs/<SKU>.jpg.
Uses macOS qlmanage and sips to rasterize, so it only runs on a Mac.
"""
import json, os, subprocess, tempfile, shutil

ROOT = os.getcwd()
products = json.load(open("src/data/products.json"))

COLORS = {"BLK": "#2b2b2f", "WHT": "#f5f5f2", "GRY": "#8d929b", "NVY": "#22345f", "BLU": "#3f72b8", "RED": "#c23b32",
          "MRN": "#6f2233", "PNK": "#e895ac", "PRP": "#7a54a8", "ORG": "#e08a3c", "YLW": "#e7c547", "GRN": "#4f9a5d",
          "OLV": "#6e7640", "BRN": "#7a5638", "BGE": "#d9c8a8", "KHK": "#b8a06b"}
CLASS_SHAPE = {"1001": "tee", "1002": "shirt", "1003": "polo", "1004": "hoodie", "1005": "sweater", "1006": "tank",
               "2001": "jeans", "2002": "chinos", "2003": "shorts", "2004": "joggers", "2005": "leggings",
               "3001": "dress", "3002": "skirt", "4001": "jacket", "4002": "coat", "5001": "pajamas"}
SIZES = {"1001": "M", "1002": "L", "1003": "M", "1004": "L", "1005": "M", "1006": "S", "2001": "32x30", "2002": "34x32",
         "2003": "M", "2004": "L", "2005": "S", "3001": "8", "3002": "M", "4001": "L", "4002": "XL", "5001": "M"}

def shade(hex_color, amount):
    h = hex_color.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    f = lambda v: max(0, min(255, int(v + amount)))
    return "#%02x%02x%02x" % (f(r), f(g), f(b))

TEE = "M120 90 L160 70 Q200 98 240 70 L280 90 L345 140 L308 178 L277 152 L277 335 L123 335 L123 152 L92 178 L55 140 Z"
LONG = "M115 88 L162 70 Q200 100 238 70 L285 88 L352 262 L316 276 L277 160 L277 340 L123 340 L123 160 L84 276 L48 262 Z"
SHAPES = {
    "tee": lambda c, d: f'<path d="{TEE}" fill="{c}" stroke="{d}" stroke-width="4"/><path d="M160 70 Q200 98 240 70" fill="none" stroke="{d}" stroke-width="6"/>',
    "tank": lambda c, d: f'<path d="M150 66 Q200 118 250 66 L278 78 L268 165 Q250 210 275 336 L125 336 Q150 210 132 165 L122 78 Z" fill="{c}" stroke="{d}" stroke-width="4"/>',
    "shirt": lambda c, d: f'<path d="{LONG}" fill="{c}" stroke="{d}" stroke-width="4"/><path d="M162 70 L200 118 L238 70 L222 66 L200 92 L178 66 Z" fill="{shade(c, 22)}" stroke="{d}" stroke-width="3"/><line x1="200" y1="118" x2="200" y2="340" stroke="{d}" stroke-width="3"/>' + "".join(f'<circle cx="200" cy="{y}" r="4" fill="{d}"/>' for y in (150, 195, 240, 285)),
    "polo": lambda c, d: f'<path d="{TEE}" fill="{c}" stroke="{d}" stroke-width="4"/><path d="M160 70 L200 126 L240 70 L222 62 L200 90 L178 62 Z" fill="{shade(c, 25)}" stroke="{d}" stroke-width="3"/><line x1="200" y1="126" x2="200" y2="190" stroke="{d}" stroke-width="3"/><circle cx="200" cy="146" r="4" fill="{d}"/><circle cx="200" cy="170" r="4" fill="{d}"/>',
    "hoodie": lambda c, d: f'<path d="{LONG}" fill="{c}" stroke="{d}" stroke-width="4"/><path d="M150 72 Q200 20 250 72 Q200 128 150 72 Z" fill="{shade(c, 15)}" stroke="{d}" stroke-width="4"/><path d="M155 250 H245 L262 318 H138 Z" fill="{shade(c, -14)}" stroke="{d}" stroke-width="3"/><rect x="122" y="324" width="156" height="16" fill="{shade(c, -22)}"/>',
    "sweater": lambda c, d: f'<path d="{LONG}" fill="{c}" stroke="{d}" stroke-width="4"/><rect x="123" y="322" width="154" height="18" fill="{shade(c, -22)}"/><path d="M160 70 Q200 106 240 70" fill="none" stroke="{shade(c, -30)}" stroke-width="10"/>' + "".join(f'<line x1="{x}" y1="130" x2="{x}" y2="318" stroke="{shade(c, -16)}" stroke-width="3"/>' for x in (160, 180, 200, 220, 240)),
    "jeans": lambda c, d: f'<path d="M128 56 H272 L296 344 H214 L200 170 L186 344 H104 Z" fill="{c}" stroke="{d}" stroke-width="4"/><rect x="128" y="56" width="144" height="22" fill="{shade(c, -20)}" stroke="{d}" stroke-width="3"/><path d="M150 84 Q168 118 190 100" fill="none" stroke="{shade(c, 40)}" stroke-width="3"/><path d="M250 84 Q232 118 210 100" fill="none" stroke="{shade(c, 40)}" stroke-width="3"/>',
    "chinos": lambda c, d: f'<path d="M128 56 H272 L292 344 H212 L200 170 L188 344 H108 Z" fill="{c}" stroke="{d}" stroke-width="4"/><rect x="128" y="56" width="144" height="20" fill="{shade(c, -18)}" stroke="{d}" stroke-width="3"/><line x1="148" y1="190" x2="140" y2="340" stroke="{shade(c, -26)}" stroke-width="3"/><line x1="252" y1="190" x2="260" y2="340" stroke="{shade(c, -26)}" stroke-width="3"/>',
    "shorts": lambda c, d: f'<path d="M126 100 H274 L300 262 H212 L200 190 L188 262 H100 Z" fill="{c}" stroke="{d}" stroke-width="4"/><rect x="126" y="100" width="148" height="20" fill="{shade(c, -20)}"/><rect x="118" y="190" width="50" height="36" fill="{shade(c, -12)}" stroke="{d}" stroke-width="3"/><rect x="232" y="190" width="50" height="36" fill="{shade(c, -12)}" stroke="{d}" stroke-width="3"/>',
    "joggers": lambda c, d: f'<path d="M126 60 H274 L286 300 L252 350 H214 L200 180 L186 350 H148 L114 300 Z" fill="{c}" stroke="{d}" stroke-width="4"/><rect x="126" y="60" width="148" height="22" fill="{shade(c, -20)}"/><rect x="146" y="338" width="68" height="14" fill="{shade(c, -26)}"/><rect x="186" y="338" width="68" height="14" fill="{shade(c, -26)}"/>',
    "leggings": lambda c, d: f'<path d="M150 56 H250 L242 346 H206 L200 160 L194 346 H158 Z" fill="{c}" stroke="{d}" stroke-width="4"/><rect x="150" y="56" width="100" height="20" fill="{shade(c, -22)}"/>',
    "dress": lambda c, d: f'<path d="M168 56 Q200 88 232 56 L256 160 L334 344 H66 L144 160 Z" fill="{c}" stroke="{d}" stroke-width="4"/><path d="M144 160 H256" stroke="{shade(c, -34)}" stroke-width="10"/><path d="M168 56 L200 100 L232 56" fill="none" stroke="{shade(c, -26)}" stroke-width="4"/>',
    "skirt": lambda c, d: f'<path d="M142 110 H258 L332 330 H68 Z" fill="{c}" stroke="{d}" stroke-width="4"/><rect x="142" y="110" width="116" height="20" fill="{shade(c, -22)}"/>' + "".join(f'<line x1="{x}" y1="132" x2="{x + (x - 200) * 0.42}" y2="326" stroke="{shade(c, -20)}" stroke-width="3"/>' for x in (165, 182, 200, 218, 235)),
    "jacket": lambda c, d: f'<path d="{LONG}" fill="{c}" stroke="{d}" stroke-width="4"/><path d="M162 70 L200 124 L238 70 L224 62 L200 98 L176 62 Z" fill="{shade(c, 22)}" stroke="{d}" stroke-width="3"/><line x1="200" y1="124" x2="200" y2="340" stroke="{d}" stroke-width="4"/><rect x="140" y="250" width="44" height="46" fill="{shade(c, -14)}" stroke="{d}" stroke-width="3"/><rect x="216" y="250" width="44" height="46" fill="{shade(c, -14)}" stroke="{d}" stroke-width="3"/>',
    "coat": lambda c, d: f'<path d="M112 86 L162 66 Q200 98 238 66 L288 86 L356 300 L318 314 L277 170 L277 360 L123 360 L123 170 L82 314 L44 300 Z" fill="{c}" stroke="{d}" stroke-width="4"/><path d="M150 70 Q200 22 250 70 Q200 118 150 70 Z" fill="{shade(c, 14)}" stroke="{d}" stroke-width="4"/>' + "".join(f'<line x1="123" y1="{y}" x2="277" y2="{y}" stroke="{shade(c, -28)}" stroke-width="4"/>' for y in (160, 205, 250, 295, 340)) + f'<line x1="200" y1="120" x2="200" y2="360" stroke="{d}" stroke-width="4"/>',
    "pajamas": lambda c, d: f'<g transform="translate(-60 0) scale(0.78)"><path d="{LONG}" fill="{c}" stroke="{d}" stroke-width="5"/><line x1="200" y1="110" x2="200" y2="340" stroke="{d}" stroke-width="4"/></g><g transform="translate(150 70) scale(0.7)"><path d="M128 56 H272 L296 344 H214 L200 170 L186 344 H104 Z" fill="{shade(c, -10)}" stroke="{d}" stroke-width="5"/></g>',
}

L_CODES = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
G_CODES = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
R_CODES = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]

def ean13(digits):
    d = [int(c) for c in digits]
    left = "".join((L_CODES if PARITY[d[0]][i] == "L" else G_CODES)[n] for i, n in enumerate(d[1:7]))
    right = "".join(R_CODES[n] for n in d[7:])
    return "101" + left + "01010" + right + "101"

def barcode_svg(upc, x, y, module, height):
    code = "0" + upc
    bits = ean13(code)
    rects = []
    i = 0
    while i < len(bits):
        if bits[i] == "1":
            j = i
            while j < len(bits) and bits[j] == "1": j += 1
            guard = i < 3 or 45 <= i < 50 or i >= 92
            rects.append(f'<rect x="{x + i * module}" y="{y}" width="{(j - i) * module}" height="{height + (14 if guard else 0)}" fill="#000"/>')
            i = j
        else:
            i += 1
    text_y = y + height + 30
    digits = (f'<text x="{x - 22}" y="{text_y}" font-family="Courier New, monospace" font-size="22">{code[0]}</text>'
              f'<text x="{x + 12 * module}" y="{text_y}" font-family="Courier New, monospace" font-size="22" text-anchor="middle" letter-spacing="4">{code[1:7]}</text>'
              f'<text x="{x + 71 * module}" y="{text_y}" font-family="Courier New, monospace" font-size="22" text-anchor="middle" letter-spacing="4">{code[7:]}</text>')
    return "".join(rects) + digits

def product_svg(p):
    base = COLORS[p["colorCode"]]
    dark = shade(base, -48)
    body = SHAPES[CLASS_SHAPE[p["classCode"]]](base, dark)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="800" height="800"><rect width="400" height="400" fill="#eeeeea"/>'
            f'<ellipse cx="200" cy="372" rx="120" ry="12" fill="#00000018"/>{body}</svg>')

def tag_svg(p):
    size = SIZES[p["classCode"]]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="1200" height="1200"><rect width="800" height="800" fill="#ffffff"/><g transform="translate(0 150)">'
            f'<rect x="14" y="14" width="772" height="472" rx="18" fill="none" stroke="#bbbbbb" stroke-width="3" stroke-dasharray="10 8"/>'
            f'<text x="50" y="92" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="bold" fill="#000">{p["brand"].upper()}</text>'
            f'<text x="50" y="146" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#000">{p["name"]}</text>'
            f'<text x="50" y="206" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#000">SIZE {size}</text>'
            f'<text x="750" y="206" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="bold" text-anchor="end" fill="#000">{p["price"]}</text>'
            f'{barcode_svg(p["upc"], 190, 250, 4, 120)}</g></svg>')

def rasterize(svg, out_jpg, size):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "a.svg"); open(src, "w").write(svg)
        subprocess.run(["qlmanage", "-t", "-s", str(size), "-o", tmp, src], check=True, capture_output=True)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "85", os.path.join(tmp, "a.svg.png"), "--out", out_jpg], check=True, capture_output=True)

for d in ("public/catalog", "public/catalog/tags", "db/seed-assets/thumbs"):
    os.makedirs(d, exist_ok=True)
for p in products:
    sku = p["sku"]
    rasterize(product_svg(p), f"public/catalog/{sku}.jpg", 900)
    rasterize(tag_svg(p), f"public/catalog/tags/{sku}-tag.jpg", 1200)
    subprocess.run(["sips", "-Z", "192", f"public/catalog/{sku}.jpg", "--out", f"db/seed-assets/thumbs/{sku}.jpg"], check=True, capture_output=True)
    print("generated", sku, p["name"])
