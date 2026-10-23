#!/usr/bin/env python3
"""Hämtar veckans tilbud från Tjek/eTilbudsavis för våra butiker i Köpenhamn,
kategoriserar dem och skriver data.json som appen läser."""
import json, re, sys, urllib.request, urllib.parse
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
                })
            if len(batch) < 100:
                break
            off += 100
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
    print(len(missing), "matvarunamn saknar svensk översättning (se untranslated.json)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).with_name("data.json")))
