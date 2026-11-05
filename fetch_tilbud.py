#!/usr/bin/env python3
"""Hämtar veckans tilbud från Tjek/eTilbudsavis för våra butiker i Köpenhamn,
kategoriserar dem och skriver data.json som appen läser."""
import base64, io, json, re, sys, urllib.request, urllib.parse
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

API = "https://squid-api.tjek.com/v2"
LAT, LNG, RADIUS = 55.6761, 12.5683, 15000  # centrala Köpenhamn

STORES = {
    "bdf5A": ("føtex", "#0d3b8c"),
    "9ba51": ("Netto", "#f5c400"),
    "DWZE1w": ("365discount", "#e2001a"),
    "71c90": ("Lidl", "#0050aa"),
    "11deC": ("REMA 1000", "#1d3c78"),
    "0b1e8": ("SuperBrugsen", "#d6001c"),
    "267e1m": ("MENY", "#c8102e"),
}

# Kataloger som inte är veckans mat-erbjudanden
SKIP_CATALOG = re.compile(r"legetøj|julekatalog|nonfood|fast lav pris|ud af huset|madspild|magasin", re.I)

# (kategori-id, regex). Ordningen spelar roll: första träffen vinner.
RULES = [
    ("djur", r"hundemad|kattemad|hundefoder|kattefoder|\bkatte|\bhunde|whiskas|pedigree|felix|purina|kattegrus|dyrefoder|fuglefrø"),
    ("hushall", r"toiletpapir|køkkenrulle|affaldspose|skraldepose|opvask|vaskemiddel|skyllemiddel|tøjvask|rengøring|klude|svamp|stanniol|bagepapir|fryseposer|plastfolie|husholdningsfilm|batteri|stearinlys|fyrfadslys|\blys\b|servietter|ajax|neophos|finish|fairy|ariel|omo\b|bio-tex|klorin|wc-|toiletrens|pære|tændstik|grillkul"),
    ("hygien", r"palmolive|personlig pleje|tena\b|always\b|tampax|shampoo|balsam|tandpasta|tandbørste|deodorant|\bdeo\b|bodylotion|creme\b|ansigts|barberblad|gillette|bleer|\bble\b|libero|pampers|vådservietter|bind\b|tamponer|libresse|sæbe|showergel|brusegel|hårfarve|hårspray|mundskyl|vitamin|kosttilskud|smertestil|plaster|colgate|zendium|dove|nivea|neutral\b|libero|makeup|mascara|vatpinde|vatrondeller"),
    ("fryst", r"dybfrost|frost\b|frossen|frosne|frys\b|\bis\b|flødeis|vaniljeis|isvaffel|ispind|magnum|ben & jerry|hansen.s is|premier is|frisko|pizza.*frost|pommes frites|kartoffelbåde"),
    ("fardig", r"(?!.*(ost|oste)\b)(?=.*(flødekartofler|menu\b|asia cubes|færdigret|færdigmad|lasagne|pizza|tærte|quiche|suppe|gryderet|sushi|sandwich|vegansk|vegetar|veggie|tofu|falafel|hummus|tapas|dip\b|tzatziki))|flødekartofler|menu\b|asia cubes|færdigret|færdigmad|lasagne|pizza|tærte|quiche|suppe|gryderet|sushi|salatbar|sandwich|wrap\b|frikadeller.*kartoffel|mou\b|vegansk|vegetar|veggie|plantebaseret|tofu|falafel|hummus|naturli|anamma|quorn|planteb|pasta.*ret|nudelret|smørrebrød|tapas|dip\b|guacamole|pesto|tzatziki"),
    ("dryck", r"\d+ ?cl\b|% alc|drik\b|julebryg|bryg\b|monastrell|tempranillo|merlot|cabernet|chardonnay|sauvignon|riesling|primitivo|rioja|chianti|\bøl\b|pilsner|\bvin\b|rødvin|hvidvin|rosévin|rosé\b|cava|prosecco|champagne|sodavand|cola|pepsi|faxe kondi|fanta|sprite|juice|saft\b|smoothie|vand\b|danskvand|kildevand|kaffe|espresso|\bte\b|teposer|kakaomælk|energidrik|monster|red bull|cider|spiritus|vodka|whisky|\brom\b|gin\b|snaps|likør|tuborg|carlsberg|heineken|mokai|kombucha|iste|lemonade|nescafé|bønner.*kaffe|kaffekapsler|nespresso|dolce gusto|proteindrik"),
    ("godis", r"mentos|toffypops|lakrid|slik|chokolade|vingummi|lakrids|haribo|matador mix|marabou|toms|anthon berg|ritter sport|kinder|m&m|snickers|mars\b|twix|bounty|chips|popcorn|nødder|peanuts|mandler|cashew|snacks|kiks|småkager|kage\b|kager|cookies|vafler|karamel|bolsje|tyggegummi|pringles|kims|lays|estrella|halloween|marcipan|flødeboller|guf|knas|digestive|oreo|chokoladebar|pebernødder|julekonfekt|nougat"),
    ("ost", r"\bost\b|ost\b|oste\b|edamer|oste\b|ostehaps|cheddar|havarti|danbo|gouda|mozzarella|parmesan|feta\b|brie|camembert|castello|arla.*ost|mammen|riberhus|gammel knas|esrom|blåskimmel|smøreost|flødeost|philadelphia|buko|hytteost|halloumi|cheasy.*ost|revet ost|skiveost|ostebord|manchego|pecorino|burrata|mascarpone|ricotta|grana padano"),
    ("mejeri", r"danonino|actimel|mælk|minimælk|skummet|letmælk|sødmælk|yoghurt|skyr|ymer|ylette|kefir|fløde|creme fraiche|cremefraiche|smør\b|smørbar|kærgården|lurpak|bregott|margarine|\bæg\b|skrabeæg|frilandsæg|økologiske æg|dava|koldskål|kærnemælk|cultura|a38|filmjölk|arla|thise|øllebrød|risalamande|budding|desserter|protein.*pudding|letbar|plantedrik|havredrik|oatly|alpro"),
    ("chark", r"pålæg|skinke(?!.*steg)|spegepølse|salami|rullepølse|leverpostej|postej|bacon|\bpølse|pølser|hotdog|frankfurter|wienerpølse|medister|chorizo|pepperoni|serrano|parmaskinke|kyllingepålæg|kalkunbryst|tulip|3-stjernet|gøl|stryhns|hamburgerryg|sandwichpålæg|leverpostej|pate\b|paté|salat.*(hønse|kartoffel|tun)|hønsesalat|italiensk salat|rejesalat|tunsalat|sylte"),
    ("fisk", r"laks|torsk|rejer|reje|sild|tun\b|tunfisk|makrel|rødspætte|fiskefilet|fiskefrikadelle|fiskefars|fiskepinde|kuller|sej\b|skaldyr|muslinger|blæksprutte|krabbe|hummer|kammusling|ørred|røget fisk|fiskefilet|havbl|fiskeboller|kaviar|stenbiderrogn|rogn|ansjos"),
    ("kott", r"kæbe|kalv|simremad|oksekød|hakket|hakkekød|svinekød|kalvekød|lammekød|lam\b|kylling|kalkun|and\b|andebryst|andelår|gås|bøf|steak|entrecote|ribeye|rib-eye|mørbrad|culotte|tyksteg|flæskesteg|ribbenssteg|nakkekoteletter|koteletter|kotelet|schnitzel|frikadelle|kødboller|kebab|gyros|spareribs|svinemørbrad|svinekam|flæsk|grisekød|fars\b|kød\b|tenderloin|filet|bryst|lår\b|wings|vinger|burger|nakke|bov|culotte|madværket.*kylling|danish crown|rose\b|skinkesteg|hel skinke|vildt|hjort|vildsvin"),
    ("frukt", r"æble|æbler|pære|pærer|banan|appelsin|mandarin|klementin|clementin|citron|lime|grape|vindruer|druer|jordbær|hindbær|blåbær|brombær|bær\b|melon|vandmelon|ananas|mango|kiwi|avocado|avokado|granatæble|blomme|ferskner|nektariner|abrikos|kirsebær|figner|dadler|frugt|passionsfrugt|physalis|satsuma"),
    ("gront", r"pebre\b|rødder\b|kastanje|kartofler|kartoffel|gulerod|gulerødder|løg\b|rødløg|hvidløg|porre|tomat|agurk|peberfrugt|salat\b|icebergsalat|spinat|broccoli|blomkål|hvidkål|rødkål|spidskål|grønkål|rosenkål|squash|aubergine|champignon|svampe|majs\b|ærter|bønner|rødbede|selleri|pastinak|persillerod|græskar|butternut|asparges|radiser|ingefær|chili\b|krydderurter|basilikum|persille|grøntsager|grønt\b|rucola|bladselleri|fennikel|knoldselleri|søde kartofler|kål\b|bulb|babyspinat|salatmix|wok.*grønt"),
    ("brod", r"butterdej|bagerens|brød|rugbrød|franskbrød|toastbrød|boller|rundstykker|baguette|ciabatta|croissant|wienerbrød|tebirkes|kanelsnegl|knækbrød|pitabrød|tortilla|wraps|burgerboller|pølsebrød|bagel|surdej|schulstad|kohberg|pågen|lagkagebunde|kringle|flûtes|flute"),
    ("torr", r"pasta|spaghetti|penne|makaroni|ris\b|basmati|jasmin|nudler|mel\b|hvedemel|sukker|havregryn|müsli|musli|granola|cornflakes|guldkorn|morgenmad|cerealier|rugfras|havrefras|ketchup|remoulade|mayonnaise|mayo|sennep|dressing|sauce|ketchup|bouillon|fond\b|krydderi|salt\b|peber\b|olie|olivenolie|rapsolie|eddike|konserve|dåse|flåede tomater|hakkede tomater|tomatpuré|passata|kokosmælk|bønner på dåse|kikærter|linser|honning|marmelade|syltetøj|nutella|peanutbutter|jordnøddesmør|pålægschokolade|bagepulver|gær\b|kakao|chokoladedrys|rosiner|tørret frugt|sirup|taco|tortillachips|salsa|soya|soja|oliven|pickles|asier|rødkål.*glas|agurkesalat|majs på dåse|tun på dåse|nudelsupp|risengrød|grød"),
]
RULES = [(k, re.compile(p, re.I)) for k, p in RULES]

NONFOOD_HEAD = re.compile(r"iphone|wi-fi|range extender|zte blade|kogeplade|opvaskemaskine|højttaler|udklædning|køkkenredskaber|bestiksæt|spejl|dekorationsskål|monsterhandsker|silkepapir|kattehule|hundeseng|hundekurv|dampbørste|suppeskål|gryde\b|suppegryde|pande\b|kagedåse|duftlys|lupilu|silvercrest|livarno|crivit|esmara|parkside|lego|playmobil|ovn\b|printer|køleskab|fryseskab|støvsuger|\btv\b|høretelefon|telefon|tablet|computer|legesæt|legetøj|garn\b|jakke|bukser|trøje|bluse|kjole|strømpe|sko\b|støvler|hjemmesko|sengetøj|dyne|pude|håndklæde|lyskæde|julepynt|juletræ|gran\b|planter?\b|potteplante|blomster|buket|værktøj|boremaskine|cykel|kradsetræ|kuffert|taske|ur\b|gaveæske|donationskort|gavekort|rynkeby|denver|siemens|aeg\b|bosch|philips|samsung|\blg\b", re.I)
NONFOOD_DESC = re.compile(r"\bstr\.|\d+ ?cm\b|\d+ ?w\b|energimærke|bomuld|polyester|bluetooth|usb|garanti|\d+ ?mm\b|\bdele\b|batterier medfølger", re.I)

MEMBER = re.compile(r"lidl plus|medlem|coop app|coop-app|med app|i appen|føtex plus|netto plus|meny-kort|klubpris|rema 1000 app|med kort", re.I)
LIMIT = re.compile(r"maks\.? ?\d+[^.]*pr\.? ?(kunde|husstand)", re.I)


TRANSLATIONS = Path(__file__).with_name("translations.json")
HISTORY = Path(__file__).with_name("history.json")
HIST_KEEP = 60    # max antal sparade kampanjperioder per vara


def hist_key(store_id, heading):
    """Samma vara vecka till vecka: butik + normaliserat produktnamn."""
    h = re.sub(r"[*®™]", "", heading or "").lower()
    return store_id + "|" + re.sub(r"\s+", " ", h).strip()


def load_history():
    if HISTORY.exists():
        return json.loads(HISTORY.read_text())
    return {"v": 1, "items": {}}


def add_to_history(hist, offers):
    """Lägger till kampanjperioder: [från, till, pris, jämförpris, ordinarie pris]. En rad per vara och period (lägsta priset)."""
    items = hist["items"]
    for o in offers:
        if o.get("c") == "ovrigt" or o.get("p") is None:
            continue
        k = hist_key(o["s"], o["n"])
        rows = items.setdefault(k, [])
        row = [o["f"][:10], o["t"][:10], o["p"], o.get("up"), o.get("pp")]
        same = [r for r in rows if r[0] == row[0]]
        if same:  # "eller"-varor: behåll lägsta priset per kampanjperiod
            if row[2] < same[0][2]:
                rows[rows.index(same[0])] = row
            continue
        rows.append(row)
        rows.sort(key=lambda r: r[0])
        del rows[:-HIST_KEEP]
    return hist


def attach_history(hist, offers):
    """Ger varje erbjudande tidigare kampanjperioder (före den här) som fält "h": [[från, pris, jämförpris], …]."""
    for o in offers:
        rows = hist["items"].get(hist_key(o["s"], o["n"]), [])
        past = [[r[0], r[2], r[3]] for r in rows if r[0] < o["f"][:10]]
        if past:
            o["h"] = past[-12:]

def get(path, **params):
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "tilbud-app/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def categorize(heading, desc):
    h = heading or ""
    if NONFOOD_HEAD.search(h):
        return "ovrigt"
    for k, rx in RULES:  # rubriken först, den är mest pålitlig
        if rx.search(h):
            return k
    if NONFOOD_DESC.search(desc or ""):
        return "ovrigt"
    for k, rx in RULES:
        if rx.search(desc or ""):
            return k
    return "ovrigt"


def unit_price(o):
    q = o.get("quantity") or {}
    unit = (q.get("unit") or {}).get("si") or {}
    size = q.get("size") or {}
    sym, factor = unit.get("symbol"), unit.get("factor")
    price = (o.get("pricing") or {}).get("price")
    if sym not in ("kg", "l") or not factor or not price or not size.get("from"):
        return None, None
    pieces = (q.get("pieces") or {}).get("from") or 1
    amount = size["from"] * factor * pieces  # använd minsta storlek -> "max"-pris
    if amount <= 0:
        return None, None
    return round(price / amount, 2), sym


IMG_CACHE = Path(__file__).with_name(".img_cache2")
IMG_MAX = 420     # sparad bildstorlek (skarp på retina i korten)
CUT_SIZE = 220    # friläggningsmasken räknas fram på en liten kopia (snabbt) och skalas upp

def cutout(im, tol=30, full=None):
    from PIL import Image, ImageFilter
    """Flood-fill från kanterna med den dominerande kantfärgen. Returnerar (RGBA, lyckades)."""
    im = im.convert("RGB"); w, h = im.size; px = im.load()
    border = [(x, 0) for x in range(w)] + [(x, h-1) for x in range(w)] + [(0, y) for y in range(h)] + [(w-1, y) for y in range(h)]
    q = lambda c: (c[0]//24, c[1]//24, c[2]//24)
    counts = {}
    for p in border: counts[q(px[p])] = counts.get(q(px[p]), 0) + 1
    key, n = max(counts.items(), key=lambda kv: kv[1])
    if n < 0.45 * len(border):
        return None, False
    ref = [0, 0, 0]; m = 0
    for p in border:
        if q(px[p]) == key:
            c = px[p]; ref[0] += c[0]; ref[1] += c[1]; ref[2] += c[2]; m += 1
    ref = tuple(v / m for v in ref)
    close = lambda c: max(abs(c[0]-ref[0]), abs(c[1]-ref[1]), abs(c[2]-ref[2])) <= tol
    seen = bytearray(w*h); dq = deque()
    for p in border:
        if close(px[p]) and not seen[p[1]*w+p[0]]:
            seen[p[1]*w+p[0]] = 1; dq.append(p)
    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny*w+nx] and close(px[nx, ny]):
                seen[ny*w+nx] = 1; dq.append((nx, ny))
    frac = sum(seen) / (w*h)
    if not (0.12 <= frac <= 0.85):
        return None, False
    # behåll bara de största sammanhängande delarna (produkten), släng prislappar och textrester
    lab = [0]*(w*h); comps = []; cid = 0
    for start in range(w*h):
        if seen[start] or lab[start]: continue
        cid += 1; lab[start] = cid; dq2 = deque([start]); area = 0; minx=miny=10**9; maxx=maxy=-1
        while dq2:
            i = dq2.popleft(); area += 1; x, y = i % w, i // w
            minx=min(minx,x); maxx=max(maxx,x); miny=min(miny,y); maxy=max(maxy,y)
            for j in (i+1 if x+1<w else -1, i-1 if x>0 else -1, i+w if y+1<h else -1, i-w if y>0 else -1):
                if j >= 0 and not seen[j] and not lab[j]:
                    lab[j] = cid; dq2.append(j)
        comps.append((area, cid, (maxx-minx+1)*(maxy-miny+1)))
    if not comps: return None, False
    big = max(c[0] for c in comps)
    keep = {c[1] for c in comps if c[0] >= 0.42 * big}
    kept_area = sum(c[0] for c in comps if c[1] in keep)
    if kept_area < 0.06 * w * h: return None, False
    mask = Image.frombytes("L", (w, h), bytes(255 if lab[i] in keep else 0 for i in range(w*h)))
    mask = mask.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(0.9))
    if full is not None:
        im = full.convert("RGB")
        mask = mask.resize(im.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.6))
    out = im.convert("RGBA"); out.putalpha(mask)
    bbox = mask.point(lambda v: 255 if v > 40 else 0).getbbox()
    if bbox:
        out = out.crop(bbox)
    return out, True



def fetch_thumb(oid, url):
    """Laddar ner, skalar till max IMG_MAX px och returnerar (data-URI, frilagd) (cachas lokalt)."""
    cached = IMG_CACHE / f"{oid}.webp"
    if not cached.exists():
        try:
            from PIL import Image
            req = urllib.request.Request(url, headers={"User-Agent": "tilbud-app/1.0"})
            raw = urllib.request.urlopen(req, timeout=30).read()
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            im.thumbnail((IMG_MAX, IMG_MAX), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=80, method=6)
            IMG_CACHE.mkdir(exist_ok=True)
            cached.write_bytes(buf.getvalue())
        except Exception:
            return None, False
    # friläggning: cachas som <id>.cut.webp (med alfa) eller <id>.nocut
    cutf, nocut = IMG_CACHE / f"{oid}.cut.webp", IMG_CACHE / f"{oid}.nocut"
    if not cutf.exists() and not nocut.exists():
        from PIL import Image
        try:
            big = Image.open(cached).convert("RGB")
            small = big.copy(); small.thumbnail((CUT_SIZE, CUT_SIZE), Image.LANCZOS)
            out, ok = cutout(small, full=big)
        except Exception:
            ok = False
        if ok:
            buf = io.BytesIO(); out.save(buf, "WEBP", quality=74, method=6, alpha_quality=80); cutf.write_bytes(buf.getvalue())
        else:
            nocut.touch()
    if cutf.exists():
        return "data:image/webp;base64," + base64.b64encode(cutf.read_bytes()).decode(), True
    return "data:image/webp;base64," + base64.b64encode(cached.read_bytes()).decode(), False


def build_images(offers, out_dir):
    """En JSON-fil per kategori: {offer_id: data-URI}. Non-food får inga bilder."""
    todo = [o for o in offers if o.get("_img") and o["c"] != "ovrigt"]
    with ThreadPoolExecutor(16) as ex:
        uris = list(ex.map(lambda o: fetch_thumb(o["id"], o["_img"]), todo))
    out_dir.mkdir(exist_ok=True)
    for f in out_dir.glob("*.json"):
        f.unlink()
    # små filer (max 25 bilder) så att appen bara hämtar det som syns
    per, count = {}, {}
    for o, (u, cut) in zip(todo, uris):
        if u:
            n = count.get(o["c"], 0); count[o["c"]] = n + 1
            key = f'{o["c"]}-{n // 25}'
            per.setdefault(key, {})[o["id"]] = u
            o["im"] = 2 if cut else 1  # 2 = frilagd
            o["ik"] = key
    for key, m in per.items():
        (out_dir / f"{key}.json").write_text(json.dumps(m, separators=(",", ":")))
    return sum(len(m) for m in per.values())


def main(out):
    now = datetime.now(timezone.utc)
    tr = json.loads(TRANSLATIONS.read_text()) if TRANSLATIONS.exists() else {}
    catalogs = get("catalogs", dealer_ids=",".join(STORES), r_lat=LAT, r_lng=LNG, r_radius=RADIUS, limit=100)
    offers, seen = [], set()
    for c in catalogs:
        label = c.get("label") or ""
        till = datetime.fromisoformat(c["run_till"].replace("+0000", "+00:00"))
        if SKIP_CATALOG.search(label) or till < now or not c.get("offer_count"):
            continue
        off = 0
        while True:
            batch = get("offers", catalog_ids=c["id"], limit=100, offset=off)
            for o in batch:
                if o["id"] in seen:
                    continue
                seen.add(o["id"])
                desc = (o.get("description") or "").replace("\n", " ").strip()
                p = o.get("pricing") or {}
                up, usym = unit_price(o)
                offers.append({
                    "id": o["id"],
                    "s": o["dealer_id"],
                    "n": o["heading"].strip(),
                    "sv": tr.get(o["heading"].strip()),
                    "d": desc,
                    "p": p.get("price"),
                    "pp": p.get("pre_price"),
                    "up": up, "uu": usym,
                    "c": categorize(o["heading"], desc),
                    "f": o["run_from"][:19] + "Z",
                    "t": o["run_till"][:19] + "Z",
                    "m": bool(MEMBER.search(desc)),
                    "lim": bool(LIMIT.search(desc)),
                    "cat": label,
                    "pg": o.get("catalog_page"),
                    "cid": c["id"],
                    "_img": (o.get("images") or {}).get("view") or (o.get("images") or {}).get("thumb"),
                })
            if len(batch) < 100:
                break
            off += 100
    hist = add_to_history(load_history(), offers)
    HISTORY.write_text(json.dumps(hist, ensure_ascii=False, separators=(",", ":")))
    attach_history(hist, offers)
    n_img = build_images(offers, Path(out).with_name("images"))
    for o in offers:
        o.pop("_img", None)
    data = {
        "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stores": {k: {"name": v[0], "color": v[1]} for k, v in STORES.items()},
        "offers": offers,
    }
    missing = sorted({o["n"] for o in offers if not o["sv"] and o["c"] != "ovrigt"})
    Path(out).with_name("untranslated.json").write_text(json.dumps(missing, ensure_ascii=False, indent=0))
    Path(out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    counts = {}
    for o in offers:
        counts[o["c"]] = counts.get(o["c"], 0) + 1
    print(len(offers), "erbjudanden", json.dumps(counts, ensure_ascii=False))
    print(n_img, "produktbilder")
    print(len(hist["items"]), "varor i prishistoriken,", sum(1 for o in offers if o.get("h")), "erbjudanden har tidigare kampanjpriser")
    print(len(missing), "matvarunamn saknar svensk översättning (se untranslated.json)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).with_name("data.json")))
