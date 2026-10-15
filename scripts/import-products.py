"""Builds the demo catalog from a folder of product photos and the spreadsheet that maps each photo to a barcode.

Run from the project root:  python3 scripts/import-products.py "/path/to/Product Images"
The folder holds the photos and one .xlsx whose first sheet has two columns: image name and SKU/GTIN.
Writes data/products.json, public/catalog/<SKU>.jpg and a price-tag image public/catalog/tags/<SKU>-tag.jpg per product.
Uses macOS qlmanage and sips to convert and rasterize, so it only runs on a Mac.

The spreadsheet gives only the barcode, so the rest is filled in here: the name comes from the file name,
the brand and price are placeholders, and a few clothing items get a real class by name.
"""
from xml.sax.saxutils import escape
import difflib, json, os, re, shutil, subprocess, sys, tempfile, zipfile
import xml.etree.ElementTree as ET

BRAND = "CitiTrends"
PLACEHOLDER_PRICE = "$4.99"
GENERAL_CLASS = "9001"
MULTICOLOR = "MLT"
# Items that are clearly clothing, by file name. Everything else is general merchandise.
CLOTHING = {"disneydress": "3001", "frayedcargo": "2002", "girlsflare": "2001", "shacket": "4001"}
SIZES = {"2001": "10", "2002": "8", "3001": "6", "4001": "M"}
NAME_FIXES = {"Neautral": "Neutral"}

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_sheet(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    rows = []
    for r in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).find("m:sheetData", NS).findall("m:row", NS):
        cells = {}
        for c in r.findall("m:c", NS):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v = c.find("m:v", NS)
            cells[col] = (shared[int(v.text)] if c.get("t") == "s" else v.text) if v is not None else ""
        if cells.get("A") and cells.get("B"):
            rows.append((cells["A"].strip(), cells["B"].strip()))
    return rows[1:]


def valid_gtin(g):
    if not g.isdigit() or len(g) not in (8, 12, 13, 14):
        return False
    d = [int(c) for c in g]
    check = d.pop()
    return (10 - sum(x * (3 if i % 2 == 0 else 1) for i, x in enumerate(reversed(d))) % 10) % 10 == check


def tidy_name(stem):
    for wrong, right in NAME_FIXES.items():
        stem = stem.replace(wrong, right)
    words = re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=\d)(?=[A-Za-z])|(?<=[A-Za-z])(?=\d)", " ", stem)
    return words.strip()


def find_image(folder, name, by_stem):
    if os.path.exists(os.path.join(folder, name)):
        return name
    stem = os.path.splitext(name)[0].lower()
    if stem in by_stem:
        return by_stem[stem]
    close = difflib.get_close_matches(stem, list(by_stem), 1, 0.8)
    return by_stem[close[0]] if close else None


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
    size = SIZES.get(p["classCode"])
    size_line = f'<text x="50" y="206" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#000">SIZE {size}</text>' if size else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="1200" height="1200"><rect width="800" height="800" fill="#ffffff"/><g transform="translate(0 150)">'
            f'<rect x="14" y="14" width="772" height="472" rx="18" fill="none" stroke="#bbbbbb" stroke-width="3" stroke-dasharray="10 8"/>'
            f'<text x="50" y="92" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="bold" fill="#000">{escape(p["brand"].upper())}</text>'
            f'<text x="50" y="146" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#000">{escape(p["name"])}</text>'
            f'{size_line}'
            f'<text x="750" y="206" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="bold" text-anchor="end" fill="#000">{p["price"]}</text>'
            f'{barcode_svg(p["upc"], 190, 250, 4, 120)}</g></svg>')


def rasterize(svg, out_jpg, size):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "a.svg"); open(src, "w").write(svg)
        subprocess.run(["qlmanage", "-t", "-s", str(size), "-o", tmp, src], check=True, capture_output=True)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "85", os.path.join(tmp, "a.svg.png"), "--out", out_jpg], check=True, capture_output=True)


def main(folder):
    sheets = [f for f in os.listdir(folder) if f.endswith(".xlsx")]
    if not sheets:
        sys.exit("No .xlsx file found in " + folder)
    rows = read_sheet(os.path.join(folder, sheets[0]))
    images = [f for f in os.listdir(folder) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
    by_stem = {os.path.splitext(f)[0].lower(): f for f in images}

    products, skipped = [], []
    for name, gtin in rows:
        image = find_image(folder, name, by_stem)
        if not image:
            skipped.append(f"{name}: no image file")
        elif not valid_gtin(gtin):
            skipped.append(f"{name}: {gtin} is not a valid barcode")
        else:
            stem = os.path.splitext(image)[0]
            class_code = CLOTHING.get(stem.lower(), GENERAL_CLASS)
            products.append({"sku": gtin, "upc": gtin, "name": tidy_name(stem), "brand": BRAND, "classCode": class_code, "colorCode": MULTICOLOR, "price": PLACEHOLDER_PRICE, "_image": image})

    for d in ("public/catalog", "public/catalog/tags"):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    for p in products:
        src = os.path.join(folder, p.pop("_image"))
        target = f"public/catalog/{p['sku']}.jpg"
        if src.lower().endswith((".jpg", ".jpeg")):
            shutil.copy(src, target)
        else:
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "90", src, "--out", target], check=True, capture_output=True)
        rasterize(tag_svg(p), f"public/catalog/tags/{p['sku']}-tag.jpg", 1200)
        print("imported", p["sku"], p["name"])
    with open("data/products.json", "w") as f:
        json.dump(products, f, indent=2)
        f.write("\n")
    print(f"\n{len(products)} products written to data/products.json")
    for s in skipped:
        print("skipped", s)
    mapped = {find_image(folder, n, by_stem) for n, _ in rows}
    print("photos not in the spreadsheet (not imported):", sorted(set(images) - mapped))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 scripts/import-products.py "/path/to/Product Images"')
    main(sys.argv[1])
