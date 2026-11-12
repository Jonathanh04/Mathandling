/* planner.js – logiken bakom veckomatsedeln i Veckans Tilbud.
 *
 * Ren JavaScript utan UI och utan beroenden, så att den kan testas för sig (tests.html).
 * Innehåll:
 *   1. Valbara alternativ (butiker hämtas från data.json; här finns måltider, dagar, apparater, kost, vibe, allergier, ogillar, hemma)
 *   2. Preferensmodell: standardvärden, städning, validering per onboardingsteg
 *   3. Ordlistor och hårda filter (allergier, kost, ogillade råvaror, utrustning) på svenska och danska
 *   4. Mängder och enheter
 *   5. Kostnad, besparing och inköpslista
 *   6. Sparning av preferenser (databas + lokal reserv)
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 1. Alternativ                                                        */
  /* ------------------------------------------------------------------ */

  const MEALS = [
    { id: "breakfast", label: "Frukost", desc: "Snabbt och gärna samma flera dagar", share: 0.25 },
    { id: "lunch", label: "Lunch", desc: "Gärna rester eller matlåda", share: 0.3 },
    { id: "dinner", label: "Middag", desc: "Dagens huvudmål", share: 0.35 },
    { id: "snack", label: "Mellanmål", desc: "Valfria extra", share: 0.1 },
  ];

  const DAYS = [
    { id: "mon", short: "M", label: "Måndag" },
    { id: "tue", short: "T", label: "Tisdag" },
    { id: "wed", short: "O", label: "Onsdag" },
    { id: "thu", short: "T", label: "Torsdag" },
    { id: "fri", short: "F", label: "Fredag" },
    { id: "sat", short: "L", label: "Lördag" },
    { id: "sun", short: "S", label: "Söndag" },
  ];

  const APPLIANCES = [
    { id: "ugn", label: "Ugn", icon: "heater" },
    { id: "spis", label: "Spis", icon: "flame" },
    { id: "mikro", label: "Mikrovågsugn", icon: "microwave" },
    { id: "airfryer", label: "Airfryer", icon: "wind" },
    { id: "brodrost", label: "Brödrost", icon: "sandwich" },
    { id: "mixer", label: "Mixer", icon: "blend" },
    { id: "smorgasgrill", label: "Smörgåsgrill", icon: "grid-2x2" },
    { id: "slowcooker", label: "Slowcooker", icon: "cooking-pot" },
  ];

  const DIETS = [
    { id: "none", label: "Inga restriktioner", desc: "Allt går bra", icon: "utensils" },
    { id: "vegetarian", label: "Vegetariskt", desc: "Inget kött eller fisk", icon: "leaf" },
    { id: "vegan", label: "Veganskt", desc: "Bara växter", icon: "sprout" },
    { id: "pescetarian", label: "Pescetariskt", desc: "Fisk men inget kött", icon: "fish" },
    { id: "keto", label: "Keto", desc: "Lite kolhydrater, mer fett", icon: "droplet" },
    { id: "highprotein", label: "Högprotein", desc: "Proteinrika måltider", icon: "dumbbell" },
    { id: "mediterranean", label: "Medelhavskost", desc: "Grönt, fisk, olivolja", icon: "sun" },
  ];

  const VIBES = [
    { id: "quick", label: "Snabbt & enkelt", desc: "Klart på ca 20 min", icon: "zap" },
    { id: "onepan", label: "En panna", desc: "Lite disk", icon: "circle-dot" },
    { id: "batch", label: "Matlåda", desc: "Laga en gång, ät två", icon: "layers" },
    { id: "family", label: "Familjefavoriter", desc: "Uppskattat av barn", icon: "users" },
    { id: "classic", label: "Klassisk husmanskost", desc: "Det trygga och mättande", icon: "soup" },
    { id: "fresh", label: "Fräscht & lätt", desc: "Mycket grönt, lättare", icon: "leaf" },
    { id: "fiber", label: "Fiberrikt", desc: "Bönor, fullkorn, grönt", icon: "wheat" },
    { id: "takeaway", label: "Takeaway hemma", desc: "Hämtmat för mindre", icon: "shopping-bag" },
  ];

  const ALLERGENS = [
    { id: "nuts", label: "Nötter" },
    { id: "peanuts", label: "Jordnötter" },
    { id: "milk", label: "Mjölk" },
    { id: "egg", label: "Ägg" },
    { id: "gluten", label: "Gluten" },
    { id: "soy", label: "Soja" },
    { id: "shellfish", label: "Skaldjur" },
    { id: "fish", label: "Fisk" },
    { id: "sesame", label: "Sesam" },
  ];

  const STEPS = ["stores", "people", "meals", "days", "kitchen", "diet", "vibe", "calories", "allergies", "dislikes", "pantry", "budget"];

  /* ------------------------------------------------------------------ */
  /* 3. Ordlistor och matchning                                           */
  /* ------------------------------------------------------------------ */

  // Bokstäver i svenska och danska ord. JavaScripts \b räknar inte å/ä/ö/æ/ø som bokstäver,
  // så ordgränser byggs med lookarounds i stället.
  const L = "a-zåäöæøéü";
  const B = `(?<![${L}])`;   // ordet börjar här
  const E = `(?![${L}])`;    // ordet slutar här

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFC")
      .replace(/[éèê]/g, "e").replace(/[îï]/g, "i").replace(/[áà]/g, "a").replace(/ô/g, "o")
      .replace(/[*®™’'`´]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const rx = s => new RegExp(s, "u");

  // En regel: inc = mönster som räknas som träff, exc = ord som först tas bort ur texten
  // (t.ex. "frost" och "rost" innan "ost" söks, "purjolök" innan "lök").
  function rule(inc, exc = []) {
    return { inc: inc.map(rx), exc: exc.map(s => new RegExp(s, "gu")) };
  }

  function matches(text, r) {
    let t = normalize(text);
    for (const e of r.exc) t = t.replace(e, " ");
    return r.inc.some(i => i.test(t));
  }

  // Ord som betyder att produkten är växtbaserad (gäller kött- och mjölkregler)
  const PLANT = rule(["vegansk", "vegan" + E, "vegetar", "veggie", B + "vego", "växtbaserad", "plantebaseret", "plantbaserad", "naturli",
    "anamma", "quorn", "oumph", "hälsans kök", "planted", "sojafärs", "vegofärs", "alpro", "oatly", "havredryck", "havredrik",
    "havremjölk", "mandelmjölk", "sojamjölk", "rismjölk", "kokosmjölk", "havremælk", "mandelmælk", "plantedrik", "växtdryck", "sojadryck", "sojadrik", "mandeldryck", "mandeldrik", "kokosdryck", "risdryck", "plantgurt"]);

  const GLUTEN_FREE = rule(["glutenfri", "gluten free", "glutenfree", "utan gluten"]);

  const R = {
    // --- allergener ---
    milk: rule([
      "mjölk", "mælk", "grädde", "fløde", "smör", "smør", "kærgården", "lurpak", "bregott",
      "ost" + E, B + "ost", "ostar", "oste" + E, "ostbit", "ostehaps", "ostsnäck", "ostesnegl", "ostkex",
      "skyr", "yoghurt", "yogurt", "kefir", "filmjölk", "ymer", "creme fraiche", "cremefraiche", B + "fraiche",
      "kvarg", "keso", "kesella", "hytteost", "mozzarella", "parmesan", "parmigiano", "grana padano", "pecorino", "cheddar",
      B + "feta", "halloumi", "brie", B + "camembert", "havarti", "danbo", "gouda", "edamer", "mascarpone", "ricotta", "burrata",
      "gorgonzola", "manchego", "comte", "philadelphia", "buko", "castello", "vassle", "valle" + E, "kärnmjölk", "kærnemælk",
      B + "is" + E, "flødeis", "vaniljeis", "isbæger", "ispind", B + "glass" + E, "gräddglass", "glasspinne", "glassbägare", "magnum",
      "choklad", "chokolade", "pizza", "bearnaise", "hollandaise", "risalamande", "ris à la malta", "pannkak", "pandekage",
      "lasagne", "gratäng", "gratin", "kakao", "chokolademælk", "cocio", "matilde", "proteindryck", "proteindrik", "milkshake",
      "laktosfri", "laktosefri", "lactofree", "actimel", "danonino", "cultura", "a38", "cheasy", "puck",
      "margarin", "pudding", "budding", "mousse", "protein lab",
    ], ["frost", "rost", "kost" , "post", "toast", "kompost", "prost", "höst", "kakaonibs", "kokosmjölk", "kokosmælk", "kokosmælk",
      "jordnötssmör", "jordnøddesmør", "peanutbutter", "mandelsmør", "kokosgrädde", "sojagrädde", "havregrädde", "mørk chokolade",
      "mörk choklad", "glasskål"]),
    egg: rule([
      "ägg", "æg" + E, B + "æg", "ægge", "skrabeæg", "frilandsæg", "majonnäs", "mayonnaise", "mayo" + E, "remoulad", "aioli",
      "hollandaise", "bearnaise", "äggnudl", "æggenudl", "pannkak", "pandekage", "våffl", "vaffel", "maräng", "marengs",
      "tagliatelle", "fettuccine", "ravioli", "tortellini", "fyldt pasta", "fylld pasta", "äggpasta", "æggepasta",
      "kage" + E, "kager", B + "kaka" + E, "kakor", "muffin", "brownie", "sockerkaka", "sukkerkage", "æbleskive", "æbleskiver",
      "carbonara", "quiche", "pommes duchesse", "risalamande",
    ], ["lägg", "vägg", "bägge", "kagedåse"]),
    gluten: rule([
      "vete", "hvede", "mjöl(?!k)", B + "mel" + E, "hvedemel", "rugmel", "speltmel", "råg", B + "rug", "rugbrød", "rågbröd",
      "bröd", "brød", "pasta", "spaghetti", "penne", "makaroni", "macaroni", "lasagne", "fusilli", "tortiglioni", "fettuccine",
      "tagliatelle", "ravioli", "tortellini", "gnocchi", "nudl", "nudler", "couscous", "bulgur", "matvete", "dinkel", "spelt",
      "fullkorn", "fuldkorn", "korn" + E, "havre", "gryn", "müsli", "musli", "granola", "flingor", "cornflakes", "guldkorn",
      "fras" + E, "kex", "kiks", "knäckebröd", "knækbrød", "tortilla", "wrap", "pizza", "panerad", "paneret", "panering",
      "ströbröd", "rasp" + E, "pankoströbröd", "bulle", "boller", "bolle" + E, "kaka", "kage", "croissant", "wienerbröd",
      "wienerbrød", "smördeg", "butterdej", "pajdeg", "tærtedej", "tarteletter", "sojasås", "soyasauce", "soya sauce", "sojasauce",
      "teriyaki", "seitan", "malt", B + "öl" + E, B + "øl" + E, "julöl", "juleøl", "julebryg", "pilsner", "stout", "porter",
      B + "ipa" + E, "lager" + E, "bagel", "pitabröd", "pitabrød", "naan", "focaccia", "ciabatta", "baguette", "brioche",
      "muffin", "brownie", "cookie", "digestive", "oreo", "biscoff", "bao" + E, "dumpling", "gyoza", "seitan", "æbleskive",
      "frall", "rundstyk", "scones", "kringl", "toastbröd", "toastbrød", "skorpor", "kavring",
    ], ["majsmjöl", "rismjöl", "potatismjöl", "majsmel", "rismel", "kartoffelmel", "mandelmjöl", "kokosmjöl", "risnudl",
      "rice noodle", "glasnudl", "majskorn", "majstortilla", "korngryn", "risgryn", "grötris", "grødris", "risgrynsgröt", "risengrød"]),
    nuts: rule([
      "nötter", "nötmix", "nøddemix", "nødder", B + "nød" + E, "hasselnöt", "hasselnød", "valnöt", "valnød", "paranöt", "paranød",
      "cashew", "pistage", "pistacie", "pekan", "pecan", "macadamia", "mandel", "mandl", "nougat", "marsipan", "marcipan",
      "nutella", "pralin", "pesto", "gianduja", "frangipane",
    ], ["jordnöt", "jordnød", "muskotnöt", "muskatnød", "kokos"]),
    peanuts: rule(["jordnöt", "jordnød", "peanut", "satay", "nötmix", "nøddemix", "snickers", "m&m", "reese"]),
    soy: rule(["soja", "soya", B + "soy", "tofu", "edamame", "tempeh", B + "miso" + E, "sojasås", "teriyaki"]),
    shellfish: rule([
      "räk", "reje", "rejer", "krabb", "krabbe", "hummer", "kräft", "krebs", "languster", "scampi", "mussl", "muslinger",
      "ostron", "østers", "kammussl", "kammusling", "bläckfisk", "blæksprutte", "skaldjur", "skaldyr", "surimi", "tigerräk",
      "vannamei", "calamari",
    ]),
    fish: rule([
      "fisk", "lax", "laks", "torsk", "sill" + E, "sill(?!ä)", "sild", "makrill", "makrel", "tonfisk", B + "tun" + E, "tunfisk",
      "tunsalat", "tunsteak", B + "sej" + E, "sejfil", "alaska", "kolja", "kuller", "rödspätt", "rødspætte", "ansjovis",
      "ansjos", "sardin", "kaviar", "rogn", "löjrom", "fiskrom", "kummel", "kulmule", "pangasius", "tilapia", "öring", "ørred",
      "fisksås", "fiskesauce", "worcester", "surimi", "torskelever", "torsklever", "rødspætte", "hälleflundra", "helleflynder",
      "gravad", "kippers", "fiskefrikadel", "fiskbull",
    ], ["fiskeøje"]),
    sesame: rule(["sesam", "tahini", "hummus", "halva" + E]),

    // --- kost ---
    meat: rule([
      "kött", "kød", "nötkött", "nötfärs", "nöt(?:bog|stek|filé|biff|klump|innanlår)", "okse", B + "oxe", "oxfil", "oxkind",
      "fläsk", "flæsk", "gris(?!sini)", "grise", "kyckling", "kylling", "poussin", "höns", "høns", "kalkon", "kalkun", "kalv",
      B + "and" + E, B + "anka", "andebryst", "andelår", "andesteg", "andesauce", "andefedt", "andemenu", "ankbröst", "anklår",
      "landand", "pekingand", "berberiand", "barbarieank", "confit de canard", "lamm", B + "lam" + E, "lammekød", "vilt" + E,
      "vildt", "vildsvin", "hjort", "älg", "rådjur", "rådyr", "fasan", B + "gås" + E, "gåse", "gåsbröst", "gåslår", "kanin", B + "hare" + E,
      "burgerboost", "burger boost", "vaktel", "vagtel", "rapphöna", "agerhøne", "duvbröst", "dueb", "struds", "charkuteri", "charcuteri", "chark" + E, "bacon", "skinka", "skinke", "kassler", "hamburgerryg",
      "korv", "pølse", "pölse", "salami", "spegepølse", "chorizo", "pepperoni", "serrano", "prosciutto", "bresaola", "pancetta",
      "parmaskinke", "köttbull", "kødbolle", "frikadell", "frikadelle", B + "färs" + E, "färs" + E, B + "fars" + E,
      "leverpastej", "leverpostej", "postej", "pastej", "paté", "pate" + E, "medister", "gelatin", "kebab", "gyros", "bolognese",
      "carbonara", "steak", "biff", "bøf", "entrecote", "ribeye", "rib-eye", "mørbrad", "culotte", "tyksteg", "fransysk",
      "flæskesteg", "ribbensteg", "revbensspjäll", "kotlett", "kotelet", "spareribs", "pulled pork", "schnitzel", "cordon bleu",
      "nuggets", "wings", B + "vinger", "kycklingvingar", "oksebouillon", "hønsebouillon", "kyllingebouillon", "kycklingbuljong",
      "köttbuljong", "kalvefond", "kalvfond", "hönsbuljong", "oksefond", "andefond", "lammefond", "lammebouillon", "ankfond",
      "pålægssalat", "skinkesalat", "hønsesalat", "hönssallad", "rullepølse", "sylte", "sylta", "blodpølse", "blodkorv",
      "osso buco", "porchetta", "salsiccia", "cevapcici", "medaljong", "medaljon", "chicken", "beef", "pork",
    ], ["fiskfärs", "fiskefars", "laksefars", "torskefars", "fiskfars", "lax- eller torskfärs", "laxfärs", "fiskefrikadel",
      "fiskbull", "laksepaté", "laxpaté", "tunsteak", "laxsteak", "lammefjord", "lammefjords", "andersen", "kalvetæ",
      "grönsaksbuljong", "grøntsagsbouillon", "vildtfugle", "vildfugle", "nötter", "nötmix", "hasselnöt", "valnöt", "paranöt",
      "fisknugget", "fiskenugget", "fruktkött", "frugtkød", "kokoskött"]),
    honey: rule(["honung", "honning", "honey"]),
    gelatin: rule(["gelatin", "vingummi", B + "gummi", "skum" + E, "julskum", "juleskum", "skumgodis", "geléhallon", "haribo", "malaco",
      "marshmallow", "godispåse", "slikpose", "plockgodis", "bland selv", "lösgodis", "smågodis"]),
    keto: rule([
      "bröd", "brød", "pasta", "spaghetti", "penne", "makaroni", "lasagne", "nudl", "nudler", B + "ris" + E, "risotto",
      "jasminris", "basmatiris", "grötris", "grødris", "risgryn", "potatis", "kartof", "pommes", "klyftpotatis", "socker", "sukker",
      "mjöl(?!k)", B + "mel" + E, "couscous", "bulgur", "havre", "gryn", "müsli", "granola", "flingor", "cornflakes", "guldkorn",
      "juice", "läsk", "sodavand", "saft" + E, "banan", "godis", B + "slik", "kaka", "kage", "kakor", "majs", "bönor", "bønner",
      "linser", "kikärt", "kikært", "honung", "honning", "sylt", "marmelad", "tortilla", "wrap", "pizza", "knäckebröd",
      "knækbrød", "kex", "kiks", "chips", "pommes frites", "gnocchi", "dadl", "russin", "rosiner", "smoothie",
    ], ["pris", "kris"]),
  };

  // Färdigprodukter vars innehåll inte framgår av namnet (kan innehålla kött, fisk eller allergener)
  const COMPOSITE = rule([
    "färdigrätt", "færdigret", "middagsrätt", "middagsret", "maxirätt", B + "meny" + E, B + "menu" + E, "nyårsmeny", "nytårsmenu",
    "julbord", "julefrokost", "mårtensafton", "mortensaften", "tapas", "smörrebröd", "smørrebrød", "smörgås(?!papper)", "sandwich",
    "pizza(?!botten|bund|deg|dej|sås|sauce|mjöl|mel|ost|topping)", "fylld pasta", "fyldt pasta", "tortellini", "ravioli", "gyoza",
    "dumpling", "xiao long", "siao long", B + "bao" + E, "vårrull", "forårsrul", "moussaka", "soppa", "suppe", "snack pot",
    "lasagne(?!plattor|plader)", "lunchbox", "matlåda", "salladsbar", "salatbar", "wrap" + E, "piroger", "pirog", "empanada",
    "burrito", "enchilada", "quiche", "paj" + E, "tærte" + E, "pie" + E, "risotto", "paella", "gryta", "gryderet", "biryani",
    "curry" + E, "korma", "tikka", "nudelrätt", "nudelret", "asia cubes", "chicken dippers", B + "topping", B + "fond" + E,
    "specialiteter", "specialiteten", "delikatesse", "brun sås", "brun sovs", "skysås",
  ], ["pizzaost", "pizzatopping"]);
  // Uttryckligen vegetariskt (släpper igenom en färdigprodukt för vegetarianer, inte för allergier)
  const VEG_EXPLICIT = rule(["grönsak", "grøntsag", "vegetar", "falafel", "margherita", "grönsakslasagne", "grøntsagslasagne", "svampfond"]);
  // Annat än mat som ibland ligger i matkategorierna i reklambladen
  const NONFOOD = rule(["batteri", "duracell", "tvättmedel", "vaskemiddel", B + "vask" + E, "skrivare", "printer", "vattenkokare",
    "elkedel", "folie" + E, "alufolie", "stavmixer", "stavblender", "elvisp", "håndmixer", "tvättmaskin", "vaskemaskine",
    "torktumlare", "tørretumbler", "parfym", "edp" + E, "hårvård", "hårpleje", "presentpapper", "gavepapir", "etikett", "mærke" + E,
    "oljeljus", "gravljus", "kronljus", "värmeljus", "blockljus", "adventsljus", "doftljus", "stearinljus", "kronelys", "fyrfadslys",
    "bloklys", "stearinlys", "duftlys", "kertelys", "lys i glas", "tomtebloss", "stjernekaster", "kattmat", "kattemad", "hundmat",
    "hundemad", "fågelfrö", "talgboll", "fuglebolde", "vildfugle", "klädgalge", "bøjle", B + "pall" + E, "skammel", "avkalk",
    "afkalk", "avloppsrens", "afløbsrens", "skin tint", "kvarn", "kværn", "skummare", "skummer" + E, "burk med", "dåse med",
    "smörgåspapper", "frokostfolie", "servett", "serviet", "bukett", "buket" + E, "blomster", "blommor", "tulpan", "tulipan", B + "roser" + E, B + "ros" + E, B + "rose" + E,
    "julros", "julerose", "julstjärna", "julestjerne", "potteplante", "krukväxt", "orkidé", "orkide", "amaryllis", "hyacint", "kalanchoe",
    B + "krans" + E, "dekoration", "pynt" + E]);

  // Kategorier i data.json som i sig avgör kost
  const CAT_MEAT = new Set(["kott", "chark"]);
  const CAT_FISH = new Set(["fisk"]);
  const CAT_NONFOOD = new Set(["ovrigt", "hushall", "hygien", "djur"]);

  const DISLIKES = [
    { id: "beef", label: "Nötkött", r: rule(["nötkött", "nötfärs", "nöt(?:bog|stek|filé|biff|klump|innanlår)", "okse", B + "oxe", "oxfil",
      "entrecote", "ribeye", "culotte", "tyksteg", "fransysk", "högrev", "bøf", "burger boost", "burgerboost"]) },
    { id: "pork", label: "Fläsk", r: rule(["fläsk", "flæsk", B + "gris", "grise", "bacon", "skinka", "skinke", "kassler", "hamburgerryg",
      "spareribs", "pulled pork", "medister", "salami", "spegepølse", "chorizo", "pepperoni", "serrano", "pancetta", "prosciutto",
      "karré", "nakkekotelet", "mørbrad"]) },
    { id: "lamb", label: "Lamm", r: rule(["lamm", B + "lam" + E, "lammekød"], ["lammefjord"]) },
    { id: "chicken", label: "Kyckling", r: rule(["kyckling", "kylling", "poussin", "höns", "høns", "chicken"]) },
    { id: "turkey", label: "Kalkon", r: rule(["kalkon", "kalkun"]) },
    { id: "fish", label: "Fisk", r: R.fish },
    { id: "shrimp", label: "Räkor & skaldjur", r: R.shellfish },
    { id: "tuna", label: "Tonfisk", r: rule(["tonfisk", B + "tun" + E, "tunfisk", "tunsalat", "tunsteak"]) },
    { id: "egg", label: "Ägg", r: R.egg },
    { id: "tofu", label: "Tofu", r: rule(["tofu", "tempeh"]) },
    { id: "mushroom", label: "Svamp", r: rule(["svamp", "champinjon", "champignon", "portobello", "kantarell", "shiitake", "østershat",
      "ostronskivling", "trøffel", "tryffel"]) },
    { id: "pepper", label: "Paprika", r: rule(["paprika", "peberfrugt", "snackpeber", "snackpaprika", "spidspeber"], ["paprikapulver"]) },
    { id: "eggplant", label: "Aubergine", r: rule(["aubergine"]) },
    { id: "avocado", label: "Avokado", r: rule(["avokado", "avocado"]) },
    { id: "cilantro", label: "Koriander", r: rule(["koriander", "cilantro"]) },
    { id: "olive", label: "Oliver", r: rule(["oliv"], ["olivolja", "olivenolie", "oliveolie", "olivenolje", "olivolie"]) },
    { id: "onion", label: "Lök", r: rule(["lök", "løg"], ["purjolök", "gräslök", "purløg", "porre", "vitlök", "hvidløg"]) },
    { id: "garlic", label: "Vitlök", r: rule(["vitlök", "hvidløg"]) },
    { id: "tomato", label: "Tomat", r: rule(["tomat"]) },
    { id: "corn", label: "Majs", r: rule(["majs"]) },
    { id: "broccoli", label: "Broccoli", r: rule(["broccoli"]) },
    { id: "coconut", label: "Kokos", r: rule(["kokos"]) },
    { id: "spicy", label: "Stark mat", r: rule(["chili", "jalapeño", "jalapeno", "sriracha", B + "stark", "stærk", "spicy", B + "hot" + E,
      "cayenne", "sambal", "harissa", "kimchi", "piri piri"], ["hotdog", "hot dog"]) },
    { id: "pickles", label: "Inlagt & pickles", r: rule(["pickles", "inlagd", "inläggning", "syltede", "survarer", "cornichon",
      "ättiksgurk", "skolgurk", "asier"]) },
    { id: "raisins", label: "Russin", r: rule(["russin", "rosin"]) },
    { id: "beans", label: "Bönor & linser", r: rule(["bönor", "bønner", "kikärt", "kikært", "linser", "edamame"]) },
    { id: "cheese", label: "Ost", r: rule(["ost" + E, B + "ost", "ostar", "oste" + E, "mozzarella", "parmesan", "cheddar", B + "feta",
      "halloumi", "brie", "havarti", "danbo", "gouda", "mascarpone", "ricotta", "burrata", "gorgonzola"], ["frost", "rost", "kost",
      "post", "toast", "kompost", "prost", "höst"]) },
  ];

  // Saker man kan ha hemma (onboardingsteg 11). cat = filterflik.
  const PANTRY = [
    { id: "eggs", label: "Ägg", cat: "kyl", icon: "egg", r: rule(["ägg", "æg" + E, B + "æg"], ["lägg", "vägg"]) },
    { id: "milk", label: "Mjölk", cat: "kyl", icon: "milk", r: rule(["mjölk", "mælk"], ["kokosmjölk", "kokosmælk", "havremjölk"]) },
    { id: "butter", label: "Smör", cat: "kyl", icon: "square", r: rule(["smör" + E, "smør" + E, "smörbar", "smørbar", "bredbart"]) },
    { id: "cheese", label: "Hårdost", cat: "kyl", icon: "pizza", r: rule(["riven ost", "hushållsost", "skivad ost", "hårdost", "cheddar",
      "gouda", "havarti", "danbo", "edamer"]) },
    { id: "yogurt", label: "Yoghurt", cat: "kyl", icon: "cup-soda", r: rule(["yoghurt", "yogurt", "skyr", "filmjölk"]) },
    { id: "cream", label: "Grädde", cat: "kyl", icon: "milk", r: rule(["grädde", "fløde", "creme fraiche"]) },
    { id: "bread", label: "Bröd", cat: "skafferi", icon: "croissant", r: rule(["bröd", "brød", "toast"]) },
    { id: "pasta", label: "Pasta", cat: "skafferi", icon: "wheat", r: rule(["pasta", "spaghetti", "penne", "makaroni", "fusilli"]) },
    { id: "rice", label: "Ris", cat: "skafferi", icon: "wheat", r: rule([B + "ris" + E, "jasminris", "basmatiris", "risotto"], ["pris"]) },
    { id: "oats", label: "Havregryn", cat: "skafferi", icon: "wheat", r: rule(["havregryn", "havre"]) },
    { id: "flour", label: "Vetemjöl", cat: "skafferi", icon: "wheat", r: rule(["vetemjöl", "hvedemel", B + "mjöl" + E]) },
    { id: "cannedtomato", label: "Krossade tomater", cat: "skafferi", icon: "cylinder", r: rule(["krossade tomater", "hakkede tomater",
      "passata", "tomatpuré"]) },
    { id: "beans", label: "Bönor på burk", cat: "skafferi", icon: "cylinder", r: rule(["bönor", "bønner", "kikärt", "kikært"]) },
    { id: "potatoes", label: "Potatis", cat: "fargt", icon: "circle", r: rule(["potatis", "kartof"]) },
    { id: "onions", label: "Lök", cat: "fargt", icon: "circle", r: rule(["gul lök", B + "lök" + E, B + "løg" + E, "rödlök", "rødløg"]) },
    { id: "garlic", label: "Vitlök", cat: "fargt", icon: "circle", r: rule(["vitlök", "hvidløg"]) },
    { id: "carrots", label: "Morötter", cat: "fargt", icon: "carrot", r: rule(["morot", "morötter", "gulerod", "gulerødder"]) },
    { id: "tomatoes", label: "Tomater", cat: "fargt", icon: "circle", r: rule(["tomat"], ["krossade", "hakkede", "puré", "passata"]) },
    { id: "lettuce", label: "Sallad", cat: "fargt", icon: "leaf", r: rule(["sallad", "salat" + E, "isbergssallad", "rucola"]) },
    { id: "lemons", label: "Citron", cat: "fargt", icon: "citrus", r: rule(["citron"]) },
    { id: "apples", label: "Äpplen", cat: "fargt", icon: "apple", r: rule(["äpple", "æble"]) },
    { id: "bananas", label: "Bananer", cat: "fargt", icon: "banana", r: rule(["banan"]) },
    { id: "chicken", label: "Kyckling", cat: "kott", icon: "drumstick", r: rule(["kyckling", "kylling"]) },
    { id: "mince", label: "Köttfärs", cat: "kott", icon: "beef", r: rule(["nötfärs", "blandfärs", "fläskfärs", "köttfärs", "hakket"]) },
    { id: "bacon", label: "Bacon", cat: "kott", icon: "ham", r: rule(["bacon"]) },
    { id: "frozenveg", label: "Frysta grönsaker", cat: "fargt", icon: "snowflake", r: rule(["frysta grönsaker", "wokmix", "frysta ärtor"]) },
  ];
  const PANTRY_TABS = [["all", "Alla"], ["fargt", "Färskt"], ["kott", "Kött"], ["kyl", "Kyl"], ["skafferi", "Skafferi"]];

  // Basvaror som alltid räknas som "finns hemma" och aldrig hamnar på inköpslistan
  const BASICS = rule([B + "salt" + E, "havssalt", "flingsalt", B + "peppar" + E, "svartpeppar", "vitpeppar", B + "olja" + E,
    "olivolja", "rapsolja", "matolja", "neutral olja", B + "vatten" + E, "kranvatten"]);

  /* ------------------------------------------------------------------ */
  /* Hårda filter                                                         */
  /* ------------------------------------------------------------------ */

  const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
  const ALLERGEN = byId(ALLERGENS), DIET = byId(DIETS), DISLIKE = byId(DISLIKES);

  // Allergener som en text (vara eller ingrediens) innehåller. cat = kategori i data.json om det är en vara.
  // name = själva produktnamnet. "Växtbaserat" och "glutenfri" avgörs bara av namnet, så att en mening i
  // beskrivningen ("finns även i vegansk variant") inte kan släppa igenom en vara.
  function allergensIn(text, cat, name = text) {
    const found = [];
    const plant = matches(name, PLANT);
    const gf = matches(name, GLUTEN_FREE);
    for (const a of ALLERGENS) {
      if (a.id === "milk" && plant) continue;
      if (a.id === "gluten" && gf) continue;
      if (matches(text, R[a.id])) found.push(a.id);
    }
    if (cat === "fisk" && !found.includes("fish") && !found.includes("shellfish")) found.push("fish");
    if (cat === "ost" && !plant && !found.includes("milk")) found.push("milk");
    return found;
  }

  function isMeat(text, cat, name = text) {
    if (matches(name, PLANT)) return false;
    return CAT_MEAT.has(cat) || matches(text, R.meat);
  }
  function isFishOrShellfish(text, cat) {
    return CAT_FISH.has(cat) || matches(text, R.fish) || matches(text, R.shellfish);
  }

  // Vilken kost en text bryter mot (null = ok)
  function dietViolation(text, cat, diet, name = text) {
    const unknownMix = matches(name, COMPOSITE);
    switch (diet) {
      case "vegetarian":
        if (isMeat(text, cat, name)) return "innehåller kött";
        if (unknownMix && !matches(name, PLANT) && !matches(name, VEG_EXPLICIT)) return "färdigprodukt som kan innehålla kött eller fisk";
        if (isFishOrShellfish(text, cat)) return "innehåller fisk";
        if (matches(text, R.gelatin)) return "innehåller gelatin";
        return null;
      case "vegan": {
        const v = dietViolation(text, cat, "vegetarian", name); if (v) return v;
        const plant = matches(name, PLANT);
        if (unknownMix && !plant) return "färdigprodukt som kan innehålla mjölk eller ägg";
        if (!plant && (matches(text, R.milk) || cat === "ost")) return "innehåller mjölk";
        if (matches(text, R.egg)) return "innehåller ägg";
        if (matches(text, R.honey)) return "innehåller honung";
        return null;
      }
      case "pescetarian":
        if (isMeat(text, cat, name)) return "innehåller kött";
        return unknownMix && !matches(name, PLANT) && !matches(name, VEG_EXPLICIT) && !isFishOrShellfish(text, cat)
          ? "färdigprodukt som kan innehålla kött" : null;
      case "keto":
        if (cat === "brod" || (cat === "godis" && !matches(text, rule(["nötter", "mandl", "nødder", "jordnöt"])))) return "för mycket kolhydrater";
        return matches(text, R.keto) ? "för mycket kolhydrater" : null;
      default:
        return null;
    }
  }

  function customDislikeRules(prefs) {
    return (prefs.dislikeCustom || []).map(normalize).filter(s => s.length >= 3)
      .map(s => ({ label: s, r: rule([s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")]) }));
  }

  /* Alla regelbrott för en vara eller ingrediens.
     item: { text, cat? } – text är allt som beskriver den (svenskt + danskt namn, beskrivning). */
  function violations(item, prefs) {
    const out = [], text = item.text || "", cat = item.cat, name = item.name || text;
    for (const a of allergensIn(text, cat, name)) {
      if ((prefs.allergies || []).includes(a)) out.push({ type: "allergi", id: a, label: ALLERGEN[a].label });
    }
    if ((prefs.allergies || []).length && !out.length && matches(name, COMPOSITE)) {
      out.push({ type: "allergi", id: "okant", label: "Färdigprodukt med okänt innehåll" });
    }
    const d = dietViolation(text, cat, prefs.diet, name);
    if (d) out.push({ type: "kost", id: prefs.diet, label: `${DIET[prefs.diet].label}: ${d}` });
    for (const id of prefs.dislikes || []) {
      const dl = DISLIKE[id];
      if (dl && matches(text, dl.r)) out.push({ type: "ogillar", id, label: dl.label });
    }
    for (const c of customDislikeRules(prefs)) {
      if (matches(text, c.r)) out.push({ type: "ogillar", id: "custom:" + c.label, label: c.label });
    }
    return out;
  }

  const offerText = o => [o.sv, o.n, o.d].filter(Boolean).join(" · ");
  const offerName = o => [o.sv, o.n].filter(Boolean).join(" · ");

  function offerStatus(o, now) {
    const f = new Date(o.f), t = new Date(o.t);
    return f > now ? "soon" : (t >= now ? "now" : "old");
  }

  /* Erbjudanden som får användas i planen: valda butiker, matvaror, gäller idag och bryter inte mot något hårt krav. */
  function filterOffers(offers, prefs, now = new Date()) {
    const ok = [], excluded = [];
    const stores = new Set(prefs.stores || []);
    for (const o of offers) {
      if (stores.size && !stores.has(o.s)) continue;
      if (CAT_NONFOOD.has(o.c) || matches(offerName(o), NONFOOD)) continue;
      if (offerStatus(o, now) !== "now") continue;
      const v = violations({ text: offerText(o), name: offerName(o), cat: o.c }, prefs);
      if (v.length) excluded.push({ offer: o, reasons: v }); else ok.push(o);
    }
    return { ok, excluded };
  }

  /* Regelbrott i ett recept: varje ingrediens + köksutrustning. Tom lista = receptet får användas. */
  function recipeViolations(recipe, prefs, offersById = {}) {
    const out = [];
    for (const ing of recipe.ingredients || []) {
      const o = ing.offer_id ? offersById[ing.offer_id] : null;
      const text = [ing.name, o ? offerText(o) : ""].join(" · ");
      const name = [ing.name, o ? offerName(o) : ""].join(" · ");
      for (const v of violations({ text, name, cat: o ? o.c : undefined }, prefs)) out.push({ ...v, ingredient: ing.name });
    }
    const have = new Set(prefs.appliances || []);
    for (const eq of recipe.equipment || []) {
      if (!have.has(eq)) out.push({ type: "utrustning", id: eq, label: (APPLIANCES.find(a => a.id === eq) || { label: eq }).label });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Preferenser                                                       */
  /* ------------------------------------------------------------------ */

  function defaultPrefs() {
    return {
      v: 1, updatedAt: 0, onboarded: false, step: 0,
      stores: [], adults: 2, kids: 0,
      meals: ["dinner"], days: DAYS.map(d => d.id),
      appliances: ["ugn", "spis", "mikro"],
      diet: "none", vibes: [],
      calories: { mode: "simple", kcal: null, protein: null, carbs: null, fat: null },
      allergies: [], dislikes: [], dislikeCustom: [], pantry: [],
      budget: null,
    };
  }

  const inList = (vals, list) => (Array.isArray(vals) ? vals : []).filter((x, i, a) => list.some(l => l.id === x) && a.indexOf(x) === i);
  const clampInt = (n, lo, hi, dflt) => { n = Math.round(Number(n)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  const numOrNull = (n, lo, hi) => { n = Number(n); return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };

  /* Städar preferenser från databasen/webbläsaren: okända värden tas bort, tal hålls inom rimliga gränser. */
  function sanitizePrefs(p, knownStores) {
    const d = defaultPrefs(); p = p && typeof p === "object" ? p : {};
    const cal = p.calories || {};
    return {
      v: 1,
      updatedAt: Number(p.updatedAt) || 0,
      onboarded: !!p.onboarded,
      step: clampInt(p.step, 0, STEPS.length - 1, 0),
      stores: (Array.isArray(p.stores) ? p.stores : []).filter((s, i, a) => typeof s === "string" && a.indexOf(s) === i && (!knownStores || knownStores.includes(s))),
      adults: clampInt(p.adults, 0, 12, d.adults),
      kids: clampInt(p.kids, 0, 12, d.kids),
      meals: MEALS.map(m => m.id).filter(id => (p.meals || d.meals).includes(id)),
      days: DAYS.map(x => x.id).filter(id => (p.days || d.days).includes(id)),
      appliances: inList(p.appliances || d.appliances, APPLIANCES),
      diet: DIET[p.diet] ? p.diet : "none",
      vibes: inList(p.vibes, VIBES),
      calories: {
        mode: cal.mode === "target" ? "target" : "simple",
        kcal: numOrNull(cal.kcal, 800, 6000), protein: numOrNull(cal.protein, 10, 400),
        carbs: numOrNull(cal.carbs, 0, 800), fat: numOrNull(cal.fat, 10, 400),
      },
      allergies: inList(p.allergies, ALLERGENS),
      dislikes: inList(p.dislikes, DISLIKES),
      dislikeCustom: (Array.isArray(p.dislikeCustom) ? p.dislikeCustom : []).map(s => String(s).trim().slice(0, 40)).filter(Boolean).slice(0, 30),
      pantry: inList(p.pantry, PANTRY),
      budget: numOrNull(p.budget, 50, 20000),
    };
  }

  const portionsPerMeal = p => (p.adults || 0) + 0.5 * (p.kids || 0);
  const mealsPerWeek = p => (p.days || []).length * (p.meals || []).length;
  const portionsPerWeek = p => portionsPerMeal(p) * mealsPerWeek(p);

  /* Rimligt spann och förval för budgetslidern (kr/vecka), avrundat till 50 kr. */
  function budgetRange(p) {
    const n = Math.max(1, portionsPerWeek(p));
    const r50 = x => Math.max(50, Math.round(x / 50) * 50);
    return { min: r50(n * 12), max: r50(n * 70), suggested: r50(n * 32) };
  }

  /* Kalorimål per måltid och portion, utifrån dagsmålet och vilka måltider som planeras. */
  function mealCalorieTargets(p) {
    if (p.calories?.mode !== "target" || !p.calories.kcal) return null;
    const chosen = MEALS.filter(m => (p.meals || []).includes(m.id));
    const sum = chosen.reduce((a, m) => a + m.share, 0) || 1;
    const out = Object.fromEntries(chosen.map(m => [m.id, Math.round(p.calories.kcal * m.share / sum)]));
    // avrundningsrest till den största måltiden så att summan blir exakt dagsmålet
    const biggest = chosen.reduce((a, m) => (m.share > a.share ? m : a), chosen[0]);
    if (biggest) out[biggest.id] += p.calories.kcal - Object.values(out).reduce((a, v) => a + v, 0);
    return out;
  }

  /* Är ett onboardingsteg giltigt ifyllt? (styr om "Nästa" är aktiv) */
  function stepValid(step, p) {
    switch (step) {
      case "stores": return (p.stores || []).length > 0;
      case "people": return portionsPerMeal(p) > 0;
      case "meals": return (p.meals || []).length > 0;
      case "days": return (p.days || []).length > 0;
      case "kitchen": return (p.appliances || []).length > 0;
      case "calories": return p.calories?.mode !== "target" || !!p.calories.kcal;
      case "budget": return !!p.budget;
      default: return true; // diet, vibe, allergies, dislikes, pantry har giltiga standardval
    }
  }

  /* Planens platser: valda dagar × valda måltider, med datum, från och med startdagen. */
  function slots(p, start = new Date()) {
    const s = new Date(start); s.setHours(12, 0, 0, 0);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(s); d.setDate(s.getDate() + i);
      const dayId = DAYS[(d.getDay() + 6) % 7].id;
      if (!(p.days || []).includes(dayId)) continue;
      for (const m of MEALS) if ((p.meals || []).includes(m.id)) out.push({ day: dayId, date: d.toISOString().slice(0, 10), meal: m.id });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 4. Mängder och enheter                                               */
  /* ------------------------------------------------------------------ */

  // Basenheter: g (vikt), ml (volym), st (antal)
  const UNITS = {
    g: ["g", 1], gram: ["g", 1], kg: ["g", 1000], hg: ["g", 100],
    ml: ["ml", 1], cl: ["ml", 10], dl: ["ml", 100], l: ["ml", 1000], liter: ["ml", 1000],
    msk: ["ml", 15], tsk: ["ml", 5], krm: ["ml", 1],
    st: ["st", 1], stk: ["st", 1], styck: ["st", 1], klyfta: ["st", 1], klyftor: ["st", 1], skiva: ["st", 1], skivor: ["st", 1],
    burk: ["st", 1], burkar: ["st", 1], förp: ["st", 1], paket: ["st", 1], knippe: ["st", 1], kruka: ["st", 1], påse: ["st", 1],
    nypa: ["st", 0], näve: ["st", 1],
  };

  /* "1,5 dl" → { qty: 1.5, unit: "dl" }. Bråk som "½" och "1/2" stöds. Okänd text → qty null. */
  function parseAmount(s) {
    let t = normalize(s).replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4");
    const m = t.match(/^(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)?(?:\s+(\d+)\/(\d+)|\s*\/\s*(\d+))?(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*([a-zåäöæø.]*)/);
    if (!m || (!m[1] && !m[2])) return { qty: null, unit: t.split(" ")[0] || "" };
    let q = m[1] ? parseFloat(m[1].replace(",", ".")) : 0;
    if (m[2]) q += Number(m[2]) / Number(m[3]);
    if (m[4] && m[1]) q = parseFloat(m[1].replace(",", ".")) / Number(m[4]);
    if (m[5]) q = (q + parseFloat(m[5].replace(",", "."))) / 2; // "2-3 st" → 2,5
    return { qty: q, unit: (m[6] || "").replace(/\.$/, "") };
  }

  /* Till basenhet: { qty, base: "g" | "ml" | "st" } – okänd enhet räknas som st. */
  function toBase(qty, unit) {
    const u = UNITS[normalize(unit)] || ["st", 1];
    return { qty: qty == null ? null : qty * u[1], base: u[0] };
  }

  /* Förpackningsstorlek för ett erbjudande i basenhet, utifrån pris och jämförpris. */
  function packSize(o) {
    if (!o || !o.up || !o.p) return null;
    if (o.uu === "kg") return { qty: Math.round(o.p / o.up * 1000), base: "g" };
    if (o.uu === "l") return { qty: Math.round(o.p / o.up * 1000), base: "ml" };
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* 5. Kostnad och inköpslista                                           */
  /* ------------------------------------------------------------------ */

  const round2 = n => Math.round(n * 100) / 100;

  function matchPantry(name, prefs) {
    if (matches(name, BASICS)) return "basvara";
    for (const id of prefs.pantry || []) {
      const it = PANTRY.find(x => x.id === id);
      if (it && matches(name, it.r)) return it.label;
    }
    return null;
  }

  /* Kostnaden för en rätt (för visning per rätt): kampanjvaror räknas på använd mängd via jämförpris
     (annars hela förpackningen), övriga på receptets uppskattade pris. Allt skalas till hushållets portioner. */
  function recipeCost(recipe, prefs, offersById) {
    const f = portionsPerMeal(prefs) / Math.max(0.5, recipe.servings || 1);
    let exact = 0, est = 0;
    for (const ing of recipe.ingredients || []) {
      if (matchPantry(ing.name, prefs)) continue;
      const o = ing.offer_id ? offersById[ing.offer_id] : null;
      if (o) {
        const a = parseAmount(ing.amount), b = toBase(a.qty, a.unit), pk = packSize(o);
        exact += pk && b.qty != null && b.base === pk.base ? o.p * Math.min(1, (b.qty * f) / pk.qty) : o.p;
      } else est += (Number(ing.est_price) || 0) * f;
    }
    return { exact: round2(exact), est: round2(est), total: round2(exact + est), perPortion: round2((exact + est) / Math.max(0.5, portionsPerMeal(prefs))) };
  }

  /* Hittar billigare erbjudanden för samma sak i de valda butikerna (samma kategori + gemensamma ord i namnet). */
  const STOP = new Set(["eller", "med", "från", "utan", "ekologisk", "ekologiska", "ekologiskt", "dansk", "danska", "danskt", "färsk",
    "färska", "fryst", "stor", "stora", "små", "mini", "klassisk", "original", "pack", "naturell"]);
  function keyWords(t) { return normalize(t).split(/[^a-zåäöæø0-9]+/).filter(w => w.length > 3 && !STOP.has(w)); }
  function alternatives(name, cat, offers) {
    const words = new Set(keyWords(name));
    if (!words.size) return [];
    return offers.filter(o => (!cat || o.c === cat) && keyWords((o.sv || "") + " " + o.n).some(w => words.has(w)));
  }
  // Billigare? Jämförpris när båda har samma enhet, annars styckpris.
  const cmpPrice = (a, b) => (a.up && b.up && a.uu === b.uu) ? a.up - b.up : a.p - b.p;

  /* Inköpslistan för hela planen.
     plan.slots[i].recipe.ingredients[] = { name, amount, offer_id|null, est_price (kr för angiven mängd) }
     Summerar per vara över veckan, drar av det som finns hemma, räknar hela förpackningar och föreslår billigaste butik. */
  function shoppingList(plan, prefs, offersById, allowedOffers = Object.values(offersById)) {
    const groups = new Map();
    const factorOf = r => portionsPerMeal(prefs) / Math.max(0.5, r.servings || 1);
    for (const slot of plan.slots || []) {
      const r = slot.recipe; if (!r) continue;
      const f = factorOf(r);
      for (const ing of r.ingredients || []) {
        const o = ing.offer_id ? offersById[ing.offer_id] : null;
        const key = o ? "o:" + o.id : "n:" + normalize(ing.name);
        const g = groups.get(key) || { key, name: o ? (o.sv || o.n) : ing.name, offer: o, amounts: {}, est: 0, uses: [], home: matchPantry(ing.name, prefs) };
        const a = parseAmount(ing.amount), b = toBase(a.qty, a.unit);
        if (b.qty != null) g.amounts[b.base] = (g.amounts[b.base] || 0) + b.qty * f;
        g.est += (Number(ing.est_price) || 0) * f;
        g.uses.push({ day: slot.day, meal: slot.meal, recipe: r.title, amount: ing.amount });
        groups.set(key, g);
      }
    }
    const items = [];
    for (const g of groups.values()) {
      const it = { key: g.key, name: g.name, uses: g.uses, amounts: Object.fromEntries(Object.entries(g.amounts).map(([k, v]) => [k, round2(v)])) };
      if (g.home) { items.push({ ...it, home: g.home, cost: 0, estimated: false, packs: 0 }); continue; }
      if (g.offer) {
        const o = g.offer, pk = packSize(o);
        const need = pk ? g.amounts[pk.base] : null;
        const packs = pk && need ? Math.max(1, Math.ceil(need / pk.qty - 0.05)) : 1;
        const alt = alternatives(o.sv || o.n, o.c, allowedOffers).filter(x => x.id !== o.id && cmpPrice(x, o) < 0 &&
          ((x.up && o.up && x.uu === o.uu) ? x.up < o.up * 0.97 : x.p < o.p * 0.97)).sort(cmpPrice)[0] || null;
        items.push({ ...it, offer: o, store: o.s, packs, cost: round2(packs * o.p), saving: o.pp > o.p ? round2(packs * (o.pp - o.p)) : 0,
          estimated: false, cheaper: alt });
      } else {
        const alt = alternatives(g.name, null, allowedOffers).sort(cmpPrice)[0] || null;
        items.push({ ...it, cost: round2(g.est), estimated: true, suggestion: alt });
      }
    }
    items.sort((a, b) => (a.home ? 1 : 0) - (b.home ? 1 : 0) || (a.store || "~").localeCompare(b.store || "~") || a.name.localeCompare(b.name, "sv"));
    return items;
  }

  /* Veckans kostnad mot budget. Bygger på inköpslistan (hela förpackningar). */
  function planCost(plan, prefs, offersById, allowedOffers) {
    const list = shoppingList(plan, prefs, offersById, allowedOffers);
    const buy = list.filter(i => !i.home);
    const exact = round2(buy.filter(i => !i.estimated).reduce((a, i) => a + i.cost, 0));
    const est = round2(buy.filter(i => i.estimated).reduce((a, i) => a + i.cost, 0));
    const total = round2(exact + est);
    const portions = (plan.slots || []).filter(s => s.recipe).length * portionsPerMeal(prefs);
    const savingMin = round2(buy.reduce((a, i) => a + (i.saving || 0), 0));
    const budget = prefs.budget || null;
    return {
      total, exact, est, savingMin, portions,
      perPortion: portions ? round2(total / portions) : 0,
      budget, left: budget != null ? round2(budget - total) : null,
      overBudget: budget != null && total > budget,
      itemsToBuy: buy.length, itemsAtHome: list.length - buy.length,
      list,
    };
  }

  /* ------------------------------------------------------------------ */
  /* 6. Sparning av preferenser                                           */
  /* ------------------------------------------------------------------ */

  /* Gemensamma preferenser för hushållet.
     db: appens databas (eller null) – dokumentet hushall/prefs delas av alla i hushållet.
     storage: localStorage-liknande objekt (reserv när databasen saknas eller inte svarar).
     Skrivningar sparas direkt lokalt och skickas till databasen efter en kort paus (debounce),
     så att snabba klick blir en skrivning. Nyast vinner (updatedAt). */
  function createPrefStore({ db = null, storage = null, key = "vt.prefs", docPath = "hushall/prefs", onChange = () => {},
    now = () => Date.now(), debounceMs = 400, knownStores = null,
    timers = { set: (f, ms) => setTimeout(f, ms), clear: t => clearTimeout(t) } } = {}) {
    let prefs = sanitizePrefs(readLocal(), knownStores);
    let doc = null, timer = null, pending = null, unsub = null;
    try { doc = db ? db.doc(docPath) : null; } catch { doc = null; }

    function readLocal() { try { const v = storage && storage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
    function writeLocal() { try { storage && storage.setItem(key, JSON.stringify(prefs)); } catch {} }

    function adopt(remote) {
      const r = sanitizePrefs(remote, knownStores);
      if (r.updatedAt > prefs.updatedAt) { prefs = r; writeLocal(); onChange(prefs, "remote"); return true; }
      return false;
    }

    async function writeRemote() {
      timer = null;
      if (!doc) return;
      const body = JSON.parse(JSON.stringify(prefs));
      pending = (async () => { try { await doc.set(body); } catch (e) { /* lokal kopia finns kvar; nästa ändring försöker igen */ } })();
      await pending; pending = null;
    }

    return {
      get: () => prefs,
      /* Läser databasen en gång; nyast (lokal eller databas) vinner. */
      async load() {
        if (doc) {
          try { const s = await doc.get(); if (s && s.exists) adopt(s.data()); else if (prefs.updatedAt) await writeRemote(); } catch {}
        }
        return prefs;
      },
      /* Lyssnar på ändringar från andra i hushållet. */
      subscribe() {
        if (!doc || unsub) return;
        try { unsub = doc.onSnapshot(s => { if (s && s.exists) adopt(s.data()); }, () => { unsub = null; }); } catch {}
      },
      unsubscribe() { if (unsub) { unsub(); unsub = null; } },
      /* Ändrar ett eller flera fält. Sparas lokalt direkt och i databasen efter en kort paus. */
      update(patch) {
        const next = sanitizePrefs({ ...prefs, ...(typeof patch === "function" ? patch(prefs) : patch) }, knownStores);
        next.updatedAt = Math.max(now(), prefs.updatedAt + 1);
        prefs = next; writeLocal(); onChange(prefs, "local");
        if (doc) { timers.clear(timer); timer = timers.set(writeRemote, debounceMs); }
        return prefs;
      },
      /* Skickar en väntande skrivning direkt (t.ex. innan sidan stängs eller i tester). */
      async flush() { if (timer) { timers.clear(timer); await writeRemote(); } else if (pending) await pending; },
      reset() { prefs = { ...defaultPrefs(), updatedAt: Math.max(now(), prefs.updatedAt + 1) }; writeLocal(); onChange(prefs, "local");
        if (doc) { timers.clear(timer); timer = timers.set(writeRemote, debounceMs); } return prefs; },
    };
  }

  /* ------------------------------------------------------------------ */
  /* 7. Planering: underlag, prompter, kontroll av recept                 */
  /* ------------------------------------------------------------------ */

  // Kategorier som används för att laga mat (inte dryck, godis eller non-food)
  const PLAN_CATS = new Set(["kott", "chark", "fisk", "frukt", "gront", "mejeri", "ost", "brod", "fryst", "fardig", "torr"]);

  /* Erbjudanden som planen får bygga på: valda butiker, gäller idag, matlagningskategorier, inga regelbrott. */
  function planOffers(offers, prefs, now = new Date()) {
    return filterOffers(offers, prefs, now).ok.filter(o => PLAN_CATS.has(o.c));
  }

  /* Budget per portion och måltid, fördelad efter måltidernas normala andel (middag dyrare än frukost). */
  function planBudget(prefs) {
    const total = prefs.budget || budgetRange(prefs).suggested;
    const chosen = MEALS.filter(m => (prefs.meals || []).includes(m.id));
    const days = (prefs.days || []).length, pm = portionsPerMeal(prefs);
    const weight = chosen.reduce((a, m) => a + m.share, 0) || 1;
    const perMeal = {};
    for (const m of chosen) perMeal[m.id] = days && pm ? round2(total * (m.share / weight) / days / pm) : 0;
    return { total, perPortion: portionsPerWeek(prefs) ? round2(total / portionsPerWeek(prefs)) : 0, perMeal };
  }

  const mealLabel = id => (MEALS.find(m => m.id === id) || { label: id }).label;
  const dayLabel = id => (DAYS.find(d => d.id === id) || { label: id }).label;

  /* Kraven som text till Claude. Samma text i alla anrop så att reglerna är identiska. */
  function constraintsText(prefs) {
    const L = (ids, all) => ids.map(id => (all.find(x => x.id === id) || { label: id }).label).join(", ");
    const kcal = mealCalorieTargets(prefs);
    const b = planBudget(prefs);
    const lines = [
      `- Hushåll: ${prefs.adults} vuxna och ${prefs.kids} barn = ${portionsPerMeal(prefs)} portioner per måltid (barn räknas som halv portion). Skriv recepten för exakt ${portionsPerMeal(prefs)} portioner.`,
      `- Kost: ${L([prefs.diet], DIETS)}.`,
      prefs.allergies.length ? `- ALLERGIER (får ALDRIG förekomma, inte heller som spår, i sås, buljong, krydda eller färdigprodukt): ${L(prefs.allergies, ALLERGENS)}.` : "- Inga allergier.",
      (prefs.dislikes.length || prefs.dislikeCustom.length) ? `- Använd aldrig: ${[L(prefs.dislikes, DISLIKES), ...prefs.dislikeCustom].filter(Boolean).join(", ")}.` : null,
      `- Köksutrustning som finns (använd ingen annan): ${L(prefs.appliances, APPLIANCES)}. Ange i "equipment" med id: ${prefs.appliances.join(", ")}.`,
      prefs.vibes.length ? `- Stil: ${L(prefs.vibes, VIBES)}.` : null,
      kcal ? `- Kalorimål per vuxen portion: ${Object.entries(kcal).map(([m, k]) => `${mealLabel(m).toLowerCase()} ca ${k} kcal`).join(", ")}${prefs.calories.protein ? `; protein totalt ca ${prefs.calories.protein} g/dag` : ""}.` : "- Inget kalorimål: balanserade, mättande måltider.",
      prefs.pantry.length ? `- Finns redan hemma, använd gärna först: ${L(prefs.pantry, PANTRY)}. Salt, peppar, olja och vatten finns alltid.` : "- Salt, peppar, olja och vatten finns alltid hemma.",
      `- Budget: ${b.total} kr för hela veckan, alltså ca ${b.perPortion} kr per portion i snitt (${Object.entries(b.perMeal).map(([m, k]) => `${mealLabel(m).toLowerCase()} ca ${k} kr`).join(", ")}). Håll dig under.`,
    ];
    return lines.filter(Boolean).join("\n");
  }

  function offerLines(offers, stores) {
    return offers.map(o => `${o.id}|${(stores[o.s] || {}).name || o.s}|${o.sv || o.n}|${o.p} kr${o.up ? ` (${o.up} kr/${o.uu})` : ""}|${String(o.d || "").slice(0, 60)}`).join("\n");
  }

  /* Steg 1: veckans skiss. Claude ser alla platser och hela erbjudandelistan på en gång. */
  function skeletonPrompt({ prefs, offers, stores, slots: sl }) {
    const slotLines = sl.map((s, i) => `${i}: ${dayLabel(s.day)} ${s.date} – ${mealLabel(s.meal)}`).join("\n");
    return `Du planerar en veckomatsedel för ett hushåll i Köpenhamn som handlar i: ${[...new Set(offers.map(o => (stores[o.s] || {}).name))].join(", ")}.

Krav:
${constraintsText(prefs)}

Gör en SKISS för varje plats nedan: rättens namn och vilka kampanjvaror den bygger på.
- Bygg på kampanjvarorna i listan så att veckan blir så billig som möjligt inom budget.
- Återanvänd råvaror mellan dagarna så att förpackningar tar slut och inget blir över (t.ex. halva kålhuvudet måndag, resten torsdag; stek blir lunch dagen efter).
- Variera proteiner, kök och tillagning. Enkla rätter på vardagar, mer tid på helgen.
- Frukost får gärna vara samma 2–3 rätter som återkommer: sätt då "same_as" till platsens nummer där rätten först förekommer.
- Lunch får gärna vara rester av gårdagens middag (skriv det i "idea").
- Använd bara offer_id ur listan.

Platser:
${slotLines}

Svara ENDAST med JSON:
{"tip":"en mening om hur veckan sparar pengar och minskar svinn","slots":[{"i":0,"title":"...","idea":"kort beskrivning","main_offer_ids":["ID1","ID2"],"same_as":null}]}

Kampanjvaror som gäller idag (offer_id|butik|vara|pris|detaljer):
${offerLines(offers, stores)}`;
  }

  /* Steg 2: fullständiga recept för några av platserna, med skissen som sammanhang. */
  function recipesPrompt({ prefs, offers, stores, skeleton, items }) {
    const plan = skeleton.map(s => `${s.i}: ${dayLabel(s.day)} ${mealLabel(s.meal)} – ${s.title}${s.same_as != null ? ` (samma som ${s.same_as})` : ""}`).join("\n");
    const want = items.map(s => `${s.i}: ${mealLabel(s.meal)} – ${s.title}. ${s.idea || ""}${(s.main_offer_ids || []).length ? ` Bygger på: ${s.main_offer_ids.join(", ")}.` : ""}`).join("\n");
    return `Du skriver recept till en veckomatsedel för ett hushåll i Köpenhamn.

Krav (gäller varje recept):
${constraintsText(prefs)}

Hela veckans plan (för sammanhang och återanvändning av råvaror):
${plan}

Skriv fullständiga recept för de här platserna:
${want}

Regler för recepten:
- Svenska, metriska mått (g, ml, dl, msk, tsk, st). 4–8 korta steg.
- Varje ingrediens: "offer_id" om den köps som en av kampanjvarorna nedan, annars null. "est_price" = uppskattat normalt danskt butikspris i kr för den mängd som används (även för kampanjvaror, som reserv). "pantry": true för salt, peppar, olja, vatten och torra kryddor.
- "equipment" = de apparater som behövs, bara bland: ${prefs.appliances.join(", ")}.
- "kcal", "protein", "carbs", "fat" = uppskattning per vuxen portion.
- "main_offer_id" = kampanjvaran som är rättens huvudråvara (för bild), eller null.

Svara ENDAST med JSON:
{"recipes":[{"i":0,"title":"...","description":"en mening","time_min":25,"servings":${portionsPerMeal(prefs)},"equipment":["spis"],"kcal":520,"protein":32,"carbs":45,"fat":20,"main_offer_id":"ID1","ingredients":[{"name":"kycklinglårfilé","amount":"500 g","offer_id":"ID1","est_price":45,"pantry":false}],"steps":["...","..."]}]}

Kampanjvaror som gäller idag (offer_id|butik|vara|pris|detaljer):
${offerLines(offers, stores)}`;
  }

  /* Ett enda recept, t.ex. när ett recept bröt mot ett krav eller vid "Byt". */
  function singleRecipePrompt({ prefs, offers, stores, slot, skeleton, avoidTitles = [], problem = "" }) {
    const plan = (skeleton || []).map(s => `${dayLabel(s.day)} ${mealLabel(s.meal)} – ${s.title}`).join("\n");
    return `Du skriver ETT recept till en veckomatsedel för ett hushåll i Köpenhamn.

Krav:
${constraintsText(prefs)}

${plan ? `Resten av veckan (återanvänd gärna råvaror härifrån):\n${plan}\n\n` : ""}Platsen: ${dayLabel(slot.day)} ${slot.date} – ${mealLabel(slot.meal)}.
${avoidTitles.length ? `Föreslå INTE något av detta: ${avoidTitles.join("; ")}.\n` : ""}${problem ? `Det förra förslaget underkändes: ${problem}. Undvik det helt.\n` : ""}
Samma regler som för övriga recept: svenska, metriska mått, offer_id eller null, est_price för varje ingrediens, pantry för basvaror, equipment bara bland ${prefs.appliances.join(", ")}, kcal/protein/carbs/fat per vuxen portion, main_offer_id.

Svara ENDAST med JSON:
{"recipe":{"title":"...","description":"en mening","time_min":25,"servings":${portionsPerMeal(prefs)},"equipment":["spis"],"kcal":520,"protein":32,"carbs":45,"fat":20,"main_offer_id":"ID1","ingredients":[{"name":"...","amount":"500 g","offer_id":"ID1","est_price":45,"pantry":false}],"steps":["..."]}}

Kampanjvaror som gäller idag (offer_id|butik|vara|pris|detaljer):
${offerLines(offers, stores)}`;
  }

  const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
  const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

  /* Städar ett recept från Claude till appens form. Okända fält tas bort, tal begränsas. */
  function normalizeRecipe(raw, prefs) {
    raw = raw && typeof raw === "object" ? raw : {};
    const ings = (Array.isArray(raw.ingredients) ? raw.ingredients : []).slice(0, 30).map(i => ({
      name: str(i && i.name, 60), amount: str(i && i.amount, 30),
      offer_id: i && i.offer_id ? String(i.offer_id) : null,
      est_price: num(i && i.est_price, 0, 500) || 0,
      pantry: !!(i && i.pantry),
    })).filter(i => i.name);
    return {
      title: str(raw.title, 80) || "Namnlös rätt",
      description: str(raw.description, 200),
      time_min: num(raw.time_min, 1, 600),
      servings: num(raw.servings, 0.5, 30) || portionsPerMeal(prefs) || 2,
      equipment: (Array.isArray(raw.equipment) ? raw.equipment : []).map(String).filter((x, i, a) => a.indexOf(x) === i),
      kcal: num(raw.kcal, 0, 3000), protein: num(raw.protein, 0, 300), carbs: num(raw.carbs, 0, 500), fat: num(raw.fat, 0, 300),
      main_offer_id: raw.main_offer_id ? String(raw.main_offer_id) : null,
      ingredients: ings,
      steps: (Array.isArray(raw.steps) ? raw.steps : []).map(s => str(s, 400)).filter(Boolean).slice(0, 15),
    };
  }

  /* Kontrollerar ett recept: kopplingar till varor som inte får användas tas bort (ingrediensen blir
     uppskattad i stället), och alla hårda krav prövas. Returnerar { recipe, violations }. */
  function checkRecipe(raw, prefs, offersById, allowedIds) {
    const r = normalizeRecipe(raw, prefs);
    for (const ing of r.ingredients) {
      if (ing.offer_id && !(allowedIds.has(ing.offer_id) && offersById[ing.offer_id])) ing.offer_id = null;
    }
    if (r.main_offer_id && !allowedIds.has(r.main_offer_id)) r.main_offer_id = (r.ingredients.find(i => i.offer_id) || {}).offer_id || null;
    if (!r.main_offer_id) r.main_offer_id = (r.ingredients.find(i => i.offer_id) || {}).offer_id || null;
    const v = recipeViolations(r, prefs, offersById);
    if (!r.ingredients.length) v.push({ type: "form", id: "ingredients", label: "Receptet saknar ingredienser" });
    if (!r.steps.length) v.push({ type: "form", id: "steps", label: "Receptet saknar instruktioner" });
    return { recipe: r, violations: v };
  }

  const describeViolations = v => [...new Set(v.map(x => x.ingredient ? `${x.label} (${x.ingredient})` : x.label))].join("; ");

  /* Kopierar de fält planen behöver från de erbjudanden den använder, så att planen går att visa och
     räkna på även när veckans data byts ut. */
  function snapshotOffers(plan, offersById) {
    const out = {};
    for (const s of plan.slots || []) {
      const r = s.recipe; if (!r) continue;
      for (const id of [r.main_offer_id, ...r.ingredients.map(i => i.offer_id)]) {
        const o = id && offersById[id];
        if (o && !out[id]) out[id] = { id: o.id, s: o.s, sv: o.sv || null, n: o.n, c: o.c, p: o.p, pp: o.pp || null, up: o.up || null, uu: o.uu || null, f: o.f, t: o.t, im: o.im || 0, ik: o.ik || null };
      }
    }
    return out;
  }

  /* Kör asynkrona jobb med högst `limit` samtidigt (för parallella Claude-anrop). */
  async function pool(items, limit, fn) {
    const results = new Array(items.length); let next = 0;
    async function worker() { while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); } }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  /* ------------------------------------------------------------------ */

  const Planner = {
    MEALS, DAYS, APPLIANCES, DIETS, VIBES, ALLERGENS, DISLIKES, PANTRY, PANTRY_TABS, STEPS,
    normalize, allergensIn, dietViolation, violations, filterOffers, recipeViolations, offerText, offerName, offerStatus,
    defaultPrefs, sanitizePrefs, stepValid, portionsPerMeal, mealsPerWeek, portionsPerWeek, budgetRange, mealCalorieTargets, slots,
    parseAmount, toBase, packSize, matchPantry, recipeCost, alternatives, shoppingList, planCost,
    createPrefStore,
    PLAN_CATS, planOffers, planBudget, constraintsText, skeletonPrompt, recipesPrompt, singleRecipePrompt,
    normalizeRecipe, checkRecipe, describeViolations, snapshotOffers, pool,
  };
  root.Planner = Planner;
  if (typeof module !== "undefined" && module.exports) module.exports = Planner;
})(typeof window !== "undefined" ? window : globalThis);
