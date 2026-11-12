/* Tester för planner.js. Körs i tests.html (webbläsare) och med run_tests.sh (macOS JavaScriptCore, utan Node).
   defineTests(P) returnerar en lista med { group, name, fn } där fn kastar vid fel (fn kan vara async). */
(function (root) {
  "use strict";

  function defineTests(P) {
    const tests = [];
    const t = (group, name, fn) => tests.push({ group, name, fn });
    const eq = (a, b, msg) => { const A = JSON.stringify(a), Bx = JSON.stringify(b); if (A !== Bx) throw new Error(`${msg || ""} väntade ${Bx}, fick ${A}`); };
    const ok = (v, msg) => { if (!v) throw new Error(msg || "förväntades vara sant"); };
    const near = (a, b, msg) => { if (Math.abs(a - b) > 0.011) throw new Error(`${msg || ""} väntade ${b}, fick ${a}`); };

    const prefs = patch => P.sanitizePrefs({ ...P.defaultPrefs(), ...patch });
    const has = (text, allergen, cat) => P.allergensIn(text, cat).includes(allergen);

    /* ---------------- Allergener ---------------- */
    const allergenCases = {
      milk: {
        yes: ["Arla letmjölk", "Lurpak smör", "Kærgården", "Riven ost", "Milbona fetaost", "Gräddglass", "Mjölkchoklad", "Hytteost", "Creme fraiche 18 %", "Pizza margherita", "Risalamande"],
        no: ["Alpro havredryck", "Oatly iKaffe havredryck", "Rostad lök", "Kokosmjölk", "Jordnötssmör", "Mörk choklad 70 %",
          "Mandelmjölk", "Frysta ärtor", "Toast skinka", "Kostfiber"],
      },
      egg: {
        yes: ["Skrabeæg M/L", "Ägg från burhöns", "Hellmann's majonnäs", "Remoulad", "Färsk tagliatelle", "Æbleskiver", "Påskägg"],
        no: ["Lammlägg", "Græskar", "Æblemost", "Vitlök"],
      },
      gluten: {
        yes: ["Rågbröd", "Schulstad rugbrød", "Vetemjöl", "Sojasås", "Tuborg öl", "Havregryn", "Spaghetti", "Panerad fisk", "Tortillas"],
        no: ["Glutenfri pasta", "Majsmjöl", "Honungsmelon", "Karamel", "Risgrynsgröt", "Jasminris", "Potatis", "Majskorn"],
      },
      nuts: {
        yes: ["Hasselnötter", "Alesto cashewnötter", "Mandlar", "Nutella", "Pesto", "Marsipan"],
        no: ["Kokosmjölk", "Jordnötter", "Muskotnöt", "Nötfärs 8–12 %"],
      },
      peanuts: { yes: ["Jordnötter", "Peanutbutter", "Snickers"], no: ["Hasselnötter", "Mandlar"] },
      fish: {
        yes: ["Tonfisk i vatten", "Glyngøre tun i olie", "Stenbiderrogn", "Laxfilé", "Rödspättefiléer", "Ansjovis"],
        no: ["Bacardi rom", "Kycklingfilé", "Tunnbröd"],
      },
      shellfish: { yes: ["Räkor i lake", "Grønlandske rejer", "Blåmusslor", "Bläckfiskringar"], no: ["Laks", "Torsk"] },
      sesame: { yes: ["Hummus", "Sesamfrön", "Tahini"], no: ["Olivolja"] },
      soy: { yes: ["Tofu naturell", "Sojasås", "Edamamebönor"], no: ["Kikärtor"] },
    };
    for (const [a, c] of Object.entries(allergenCases)) {
      for (const x of c.yes) t("Allergener", `${a}: "${x}" innehåller`, () => ok(has(x, a), `${x} borde innehålla ${a}`));
      for (const x of c.no) t("Allergener", `${a}: "${x}" innehåller inte`, () => ok(!has(x, a), `${x} borde inte innehålla ${a}`));
    }
    t("Allergener", "kategori fisk räknas som fisk även utan fiskord", () => ok(has("Ugnsklar filé", "fish", "fisk")));
    t("Allergener", "kategori ost räknas som mjölk", () => ok(has("Gammel Knas", "milk", "ost")));
    t("Allergener", "räkor i kategori fisk blir skaldjur (inte dubbelt fisk)", () => eq(P.allergensIn("Grönlandsräkor", "fisk"), ["shellfish"]));

    /* ---------------- Kost ---------------- */
    const diet = (text, d, cat) => P.dietViolation(text, cat, d);
    t("Kost", "vegetariskt: kyckling stoppas", () => ok(diet("Kycklingbröstfilé", "vegetarian")));
    t("Kost", "vegetariskt: vegansk burger tillåts", () => eq(diet("Anamma vegansk burger", "vegetarian"), null));
    t("Kost", "vegetariskt: fiskfärs stoppas (fisk)", () => ok(diet("Fiskfärs", "vegetarian")));
    t("Kost", "vegetariskt: kategori kött stoppas", () => ok(diet("Entrecôte", "vegetarian", "kott")));
    t("Kost", "vegetariskt: mandlar är inte kött", () => eq(diet("Mandlar", "vegetarian"), null));
    t("Kost", "vegetariskt: Lammefjord-potatis är inte lamm", () => eq(diet("Lammefjord-potatis", "vegetarian"), null));
    t("Kost", "vegetariskt: H.C. Andersen-ost är inte anka", () => eq(diet("H.C. Andersen skivad ost", "vegetarian"), null));
    t("Kost", "vegetariskt: vingummi (gelatin) stoppas", () => ok(diet("Haribo vingummi", "vegetarian")));
    t("Kost", "pescetariskt: fiskfärs tillåts", () => eq(diet("Fiskfärs", "pescetarian"), null));
    t("Kost", "pescetariskt: fisknuggets tillåts", () => eq(diet("Havblå fisknuggets", "pescetarian"), null));
    t("Kost", "pescetariskt: bacon stoppas", () => ok(diet("Tulip bacon", "pescetarian")));
    t("Kost", "veganskt: ägg stoppas", () => ok(diet("Ägg från burhöns", "vegan")));
    t("Kost", "veganskt: honung stoppas", () => ok(diet("Maribel honung", "vegan")));
    t("Kost", "veganskt: smör stoppas", () => ok(diet("Lurpak smör", "vegan")));
    t("Kost", "veganskt: havredryck tillåts", () => eq(diet("Oatly havredryck", "vegan"), null));
    t("Kost", "keto: pasta stoppas", () => ok(diet("Rummo pasta", "keto")));
    t("Kost", "keto: lax tillåts", () => eq(diet("Laxfilé", "keto"), null));
    t("Kost", "keto: jordnötter i godiskategori tillåts", () => eq(diet("Kims jordnötter", "keto", "godis"), null));
    t("Kost", "inga restriktioner: allt tillåts", () => eq(diet("Bacon", "none"), null));
    for (const x of ["REMA 1000 frilandsgris", "Citterio italiensk charkuteri", "Hel fasan", "Frigående gås", "Vitasia gyoza",
      "Eridanous moussaka", "Mou soppa", "Fredagstapas", "Torsdags-smörrebröd", "Dr. Oetker Ristorante pizza", "Salling Princip fylld pasta",
      "Mårtensafton (meny)", "Chef Select vårrullar", "Vitasia asiatiska färdigrätter", "Burgerboost", "Gestus topping",
      "Fond eller REMA 1000 sås", "Malaco godispåse"]) {
      t("Kost", `vegetariskt: "${x}" stoppas`, () => ok(diet(x, "vegetarian"), `${x} borde stoppas`));
    }
    for (const x of ["Hälsans Kök falafel", "Freshona grönsaksblandning", "Pizzabotten", "Grönsakslasagne", "Grissini", "Mutti pizzasås",
      "Lasagneplattor"]) {
      t("Kost", `vegetariskt: "${x}" tillåts`, () => eq(diet(x, "vegetarian"), null));
    }
    t("Kost", "veganskt: grönsakslasagne stoppas (kan innehålla mjölk)", () => ok(diet("Grönsakslasagne", "vegan")));
    t("Kost", "pescetariskt: fiskgratäng-paj med fisk tillåts, okänd färdigrätt stoppas", () => {
      eq(diet("Laxpaj", "pescetarian"), null); ok(diet("Vitasia indisk färdigrätt", "pescetarian"));
    });
    t("Allergener", "färdigprodukt med okänt innehåll stoppas vid allergi", () =>
      ok(P.violations({ text: "Vitasia asiatiska färdigrätter" }, prefs({ allergies: ["nuts"] })).some(v => v.id === "okant")));
    t("Allergener", "färdigprodukt tillåts utan allergier", () => eq(P.violations({ text: "Vitasia asiatiska färdigrätter" }, prefs({})), []));
    t("Filter", "non-food i matkategori tas bort", () =>
      eq(P.filterOffers([offer("x", "netto", "Duracell batterier", "torr"), offer("y", "netto", "Rummo pasta", "torr")], prefs({}), NOW).ok.map(o => o.id), ["y"]));
    t("Filter", "blombuketter i grönsakskategorin tas bort", () =>
      eq(P.filterOffers([offer("x", "netto", "Buket med roser", "gront"), offer("y", "netto", "Trefärgad ros", "gront"), offer("z", "netto", "Rosenkål", "gront")], prefs({}), NOW).ok.map(o => o.id), ["z"]));
    t("Kost", "växtbaserat ord i beskrivningen släpper inte igenom kött", () => {
      const o = { sv: "Krokmörad dansk fläskstek", n: "Flæskesteg", d: "Server med vegansk sauce", c: "kott" };
      ok(P.violations({ text: P.offerText(o), name: P.offerName(o), cat: o.c }, prefs({ diet: "vegetarian" })).length > 0);
    });
    t("Allergener", "ost-kategori med vegansk text i beskrivningen räknas ändå som mjölk", () =>
      ok(P.allergensIn("Julbord · Vegansk ost finns", "ost", "Det moderna julbordet").includes("milk")));
    t("Allergener", "margarin och pudding räknas som mjölk", () => { ok(has("Becel margarin", "milk")); ok(has("Protein Lab pudding", "milk")); });
    t("Allergener", "frallor räknas som gluten", () => ok(has("10 nybakade frallor", "gluten")));

    /* ---------------- Ogillar ---------------- */
    const dis = (text, ids, custom = []) => P.violations({ text }, prefs({ dislikes: ids, dislikeCustom: custom })).length > 0;
    t("Ogillar", "svamp: champinjoner stoppas", () => ok(dis("Skivade champinjoner", ["mushroom"])));
    t("Ogillar", "lök: rödlök stoppas", () => ok(dis("Rödlök", ["onion"])));
    t("Ogillar", "lök: purjolök tillåts", () => ok(!dis("Danska purjolökar", ["onion"])));
    t("Ogillar", "oliver: olivolja tillåts", () => ok(!dis("Extra jungfruolivolja", ["olive"])));
    t("Ogillar", "oliver: kalamataoliver stoppas", () => ok(dis("Eridanous kalamataoliver", ["olive"])));
    t("Ogillar", "stark mat: hotdogbröd tillåts", () => ok(!dis("Hotdogbröd", ["spicy"])));
    t("Ogillar", "egen text: koriander", () => ok(dis("Färsk koriander", [], ["koriander"])));

    /* ---------------- Filtrera erbjudanden ---------------- */
    const NOW = new Date("2026-11-12T12:00:00Z");
    const offer = (id, s, sv, c, extra = {}) => ({ id, s, n: sv, sv, d: "", c, p: 20, f: "2026-11-10T00:00:00Z", t: "2026-11-15T22:59:59Z", ...extra });
    const offers = [
      offer("a", "netto", "Arla letmjölk", "mejeri"),
      offer("b", "netto", "Kycklingfilé", "kott"),
      offer("c", "lidl", "Broccoli", "gront"),
      offer("d", "netto", "Broccoli", "gront", { f: "2026-11-14T00:00:00Z" }),           // kommande
      offer("e", "netto", "Tomater", "gront", { t: "2026-11-01T00:00:00Z" }),            // utgånget
      offer("f", "netto", "Toalettpapper", "hushall"),                                    // non-food
      offer("g", "netto", "Laxfilé", "fisk"),
    ];
    t("Filter", "bara valda butiker, matvaror och dagens erbjudanden", () =>
      eq(P.filterOffers(offers, prefs({ stores: ["netto"] }), NOW).ok.map(o => o.id), ["a", "b", "g"]));
    t("Filter", "mjölkallergi tar bort mjölken med orsak", () => {
      const r = P.filterOffers(offers, prefs({ stores: ["netto"], allergies: ["milk"] }), NOW);
      eq(r.ok.map(o => o.id), ["b", "g"]); eq(r.excluded[0].reasons[0].label, "Mjölk");
    });
    t("Filter", "vegetariskt tar bort kyckling och lax", () =>
      eq(P.filterOffers(offers, prefs({ stores: ["netto"], diet: "vegetarian" }), NOW).ok.map(o => o.id), ["a"]));
    t("Filter", "ingen vald butik = alla butiker", () => eq(P.filterOffers(offers, prefs({}), NOW).ok.length, 4));

    /* ---------------- Recept ---------------- */
    const offersById = Object.fromEntries(offers.map(o => [o.id, o]));
    t("Recept", "saknad utrustning stoppas", () => {
      const v = P.recipeViolations({ ingredients: [], equipment: ["airfryer"] }, prefs({ appliances: ["ugn", "spis"] }));
      eq(v.map(x => x.type), ["utrustning"]);
    });
    t("Recept", "allergen i ingrediensnamn stoppas", () => {
      const v = P.recipeViolations({ ingredients: [{ name: "smör" }], equipment: ["spis"] }, prefs({ allergies: ["milk"], appliances: ["spis"] }));
      eq(v.map(x => x.id), ["milk"]);
    });
    t("Recept", "allergen via kopplad vara stoppas även om namnet är oskyldigt", () => {
      const v = P.recipeViolations({ ingredients: [{ name: "dryck", offer_id: "a" }] }, prefs({ allergies: ["milk"] }), offersById);
      eq(v.map(x => x.id), ["milk"]);
    });
    t("Recept", "godkänt recept ger inga regelbrott", () => {
      const r = { ingredients: [{ name: "broccoli", offer_id: "c" }, { name: "vitlök" }], equipment: ["spis"] };
      eq(P.recipeViolations(r, prefs({ allergies: ["milk", "gluten"], diet: "vegan", appliances: ["spis"] }), offersById), []);
    });

    /* ---------------- Preferenser ---------------- */
    t("Preferenser", "okända värden tas bort och tal begränsas", () => {
      const p = P.sanitizePrefs({ adults: 99, kids: -2, meals: ["dinner", "brunch"], allergies: ["milk", "kryptonit"], diet: "carnivore" });
      eq([p.adults, p.kids, p.meals, p.allergies, p.diet], [12, 0, ["dinner"], ["milk"], "none"]);
    });
    t("Preferenser", "butiker filtreras mot kända butiker", () => eq(P.sanitizePrefs({ stores: ["netto", "costco", "netto"] }, ["netto", "lidl"]).stores, ["netto"]));
    t("Preferenser", "steget butiker kräver minst en butik", () => { ok(!P.stepValid("stores", prefs({}))); ok(P.stepValid("stores", prefs({ stores: ["netto"] }))); });
    t("Preferenser", "kalorimål kräver kcal", () => {
      ok(!P.stepValid("calories", prefs({ calories: { mode: "target" } })));
      ok(P.stepValid("calories", prefs({ calories: { mode: "target", kcal: 2200 } })));
    });
    t("Preferenser", "portioner: 2 vuxna + 1 barn = 2,5", () => eq(P.portionsPerMeal(prefs({ adults: 2, kids: 1 })), 2.5));
    t("Preferenser", "kalorimål per måltid summerar till dagsmålet", () => {
      const m = P.mealCalorieTargets(prefs({ meals: ["breakfast", "lunch", "dinner"], calories: { mode: "target", kcal: 2000 } }));
      near(m.breakfast + m.lunch + m.dinner, 2000);
    });
    t("Preferenser", "platser: valda dagar × måltider med rätt datum", () => {
      const s = P.slots(prefs({ days: ["mon", "wed"], meals: ["lunch", "dinner"] }), new Date("2026-11-16T09:00:00"));
      eq(s.map(x => `${x.day}-${x.meal}-${x.date}`), ["mon-lunch-2026-11-16", "mon-dinner-2026-11-16", "wed-lunch-2026-11-18", "wed-dinner-2026-11-18"]);
    });
    t("Preferenser", "budgetspann växer med antal portioner", () => {
      const a = P.budgetRange(prefs({ adults: 1, meals: ["dinner"] })), b = P.budgetRange(prefs({ adults: 4, meals: ["dinner"] }));
      ok(b.suggested > a.suggested && a.min < a.suggested && a.suggested < a.max);
    });

    /* ---------------- Mängder ---------------- */
    const amt = [["500 g", 500, "g"], ["1,5 dl", 150, "ml"], ["2 msk", 30, "ml"], ["1 1/2 dl", 150, "ml"], ["½ st", 0.5, "st"],
      ["2-3 st", 2.5, "st"], ["ca 300 g", 300, "g"], ["1 kg", 1000, "g"], ["3 klyftor", 3, "st"]];
    for (const [s, q, base] of amt) t("Mängder", `"${s}" → ${q} ${base}`, () => { const a = P.parseAmount(s), b = P.toBase(a.qty, a.unit); eq([b.qty, b.base], [q, base]); });
    t("Mängder", "förpackningsstorlek från pris och jämförpris", () => eq(P.packSize({ p: 30, up: 60, uu: "kg" }), { qty: 500, base: "g" }));

    /* ---------------- Budget och inköpslista ---------------- */
    const shopOffers = {
      mince: { id: "mince", s: "netto", sv: "Nötfärs 8–12 %", n: "Hakket oksekød", c: "kott", p: 30, pp: 45, up: 60, uu: "kg" },
      pasta: { id: "pasta", s: "lidl", sv: "Pasta", n: "Pasta", c: "torr", p: 10, up: 20, uu: "kg" },
      mince2: { id: "mince2", s: "rema", sv: "Nötfärs 4–7 %", n: "Hakket oksekød", c: "kott", p: 25, up: 50, uu: "kg" },
    };
    const plan = { slots: [
      { day: "mon", meal: "dinner", recipe: { title: "Köttfärssås", servings: 2, ingredients: [
        { name: "nötfärs", amount: "300 g", offer_id: "mince" }, { name: "pasta", amount: "250 g", offer_id: "pasta" },
        { name: "krossade tomater", amount: "1 burk", est_price: 8 }, { name: "salt", amount: "1 tsk", est_price: 0.1 }] } },
      { day: "tue", meal: "dinner", recipe: { title: "Tacos", servings: 2, ingredients: [
        { name: "nötfärs", amount: "400 g", offer_id: "mince" }, { name: "tortillas", amount: "8 st", est_price: 18 },
        { name: "ägg", amount: "2 st", est_price: 6 }] } },
    ] };
    const p2 = prefs({ adults: 2, kids: 0, pantry: ["eggs"], budget: 150 });
    t("Budget", "samma vara summeras över veckan och köps i hela förpackningar", () => {
      const m = P.shoppingList(plan, p2, shopOffers).find(i => i.key === "o:mince");
      eq([m.amounts.g, m.packs, m.cost], [700, 2, 60]);
    });
    t("Budget", "det som finns hemma och basvaror hamnar inte i kostnaden", () => {
      const l = P.shoppingList(plan, p2, shopOffers);
      eq(l.filter(i => i.home).map(i => i.name).sort(), ["salt", "ägg"]);
    });
    t("Budget", "billigare alternativ i annan vald butik föreslås", () => {
      const m = P.shoppingList(plan, p2, shopOffers).find(i => i.key === "o:mince");
      eq(m.cheaper && m.cheaper.id, "mince2");
    });
    t("Budget", "veckokostnad: exakt + uppskattat, kvar av budget, besparing", () => {
      const c = P.planCost(plan, p2, shopOffers);
      // nötfärs 2×30 + pasta 1×10 = 70 exakt; tomater 8 + tortillas 18 = 26 uppskattat
      eq([c.exact, c.est, c.total, c.left, c.overBudget, c.savingMin], [70, 26, 96, 54, false, 30]);
      eq([c.portions, c.perPortion], [4, 24]);
    });
    t("Budget", "över budget flaggas", () => ok(P.planCost(plan, prefs({ budget: 80 }), shopOffers).overBudget));
    t("Budget", "fler portioner skalar mängder och kostnad", () => {
      const c = P.planCost(plan, prefs({ adults: 4 }), shopOffers);
      const m = c.list.find(i => i.key === "o:mince"); eq([m.amounts.g, m.packs], [1400, 3]);
    });
    t("Budget", "kostnad per rätt räknas på använd mängd", () => {
      const r = P.recipeCost(plan.slots[0].recipe, prefs({ adults: 2 }), shopOffers);
      eq([r.exact, r.est], [23, 8]); // 300/500 × 30 = 18 + 250/500 × 10 = 5; tomater 8 (salt är basvara)
    });

    /* ---------------- Planering ---------------- */
    const planPrefs = prefs({ adults: 2, kids: 1, meals: ["breakfast", "dinner"], days: ["mon", "tue", "wed"], allergies: ["nuts"],
      diet: "vegetarian", dislikes: ["mushroom"], appliances: ["spis", "ugn"], budget: 600, pantry: ["eggs"] });
    t("Planering", "budget fördelas per måltid och summerar till veckobudgeten", () => {
      const b = P.planBudget(planPrefs);   // 2,5 portioner × 3 dagar
      near(b.perMeal.breakfast * 3 * 2.5 + b.perMeal.dinner * 3 * 2.5, 600);
      ok(b.perMeal.dinner > b.perMeal.breakfast);
    });
    t("Planering", "kraven i prompten nämner allergi, kost, ogillar, utrustning och budget", () => {
      const c = P.constraintsText(planPrefs);
      ["Nötter", "ALDRIG", "Vegetariskt", "Svamp", "spis, ugn", "600 kr", "2.5 portioner", "Ägg"].forEach(w => ok(c.includes(w), `saknar "${w}"`));
    });
    t("Planering", "underlaget har bara matlagningsvaror som klarar kraven", () => {
      const offs = [offer("m", "netto", "Mjölk", "mejeri"), offer("n", "netto", "Hasselnötter", "torr"), offer("d", "netto", "Läsk", "dryck"),
        offer("k", "netto", "Kycklingfilé", "kott"), offer("b", "netto", "Broccoli", "gront")];
      eq(P.planOffers(offs, prefs({ allergies: ["nuts"], diet: "vegetarian" }), NOW).map(o => o.id), ["m", "b"]);
    });
    t("Planering", "receptet städas: tal begränsas, tomma ingredienser tas bort", () => {
      const r = P.normalizeRecipe({ title: "Test", time_min: 9999, kcal: -5, ingredients: [{ name: "lök", amount: "1 st", est_price: 3 }, { name: "" }], steps: ["a", ""] }, planPrefs);
      eq([r.time_min, r.kcal, r.ingredients.length, r.steps.length, r.servings], [600, 0, 1, 1, 2.5]);
    });
    const pOffers = { b: offer("b", "netto", "Broccoli", "gront"), n: offer("n", "netto", "Hasselnötter", "torr"), x: offer("x", "lidl", "Broccoli", "gront") };
    t("Planering", "koppling till vara utanför underlaget tas bort", () => {
      const { recipe } = P.checkRecipe({ ingredients: [{ name: "broccoli", offer_id: "x", est_price: 12 }], steps: ["koka"], equipment: ["spis"] },
        planPrefs, pOffers, new Set(["b"]));
      eq([recipe.ingredients[0].offer_id, recipe.ingredients[0].est_price], [null, 12]);
    });
    t("Planering", "recept med allergen underkänns", () => {
      const { violations } = P.checkRecipe({ ingredients: [{ name: "rostade hasselnötter" }], steps: ["rosta"], equipment: ["ugn"] }, planPrefs, pOffers, new Set(["b"]));
      ok(violations.some(v => v.id === "nuts"));
    });
    t("Planering", "recept med saknad utrustning underkänns", () => {
      const { violations } = P.checkRecipe({ ingredients: [{ name: "broccoli" }], steps: ["fritera"], equipment: ["airfryer"] }, planPrefs, pOffers, new Set());
      eq(violations.map(v => v.type), ["utrustning"]);
    });
    t("Planering", "godkänt recept: huvudråvara väljs från kopplad vara", () => {
      const { recipe, violations } = P.checkRecipe({ ingredients: [{ name: "broccoli", offer_id: "b" }, { name: "vitlök" }], steps: ["stek"], equipment: ["spis"] },
        planPrefs, pOffers, new Set(["b"]));
      eq([violations.length, recipe.main_offer_id], [0, "b"]);
    });
    t("Planering", "ögonblicksbild av använda erbjudanden", () => {
      const snap = P.snapshotOffers({ slots: [{ recipe: { main_offer_id: "b", ingredients: [{ name: "broccoli", offer_id: "b" }, { name: "lök" }] } }] }, pOffers);
      eq(Object.keys(snap), ["b"]); eq(snap.b.p, 20);
    });
    t("Planering", "Byt: prompten nämner rätter som ska undvikas och platsen", () => {
      const pr = P.singleRecipePrompt({ prefs: planPrefs, offers: [], stores: {}, slot: { day: "tue", date: "2026-11-17", meal: "dinner" },
        skeleton: [{ day: "mon", meal: "dinner", title: "Lasagne" }], avoidTitles: ["Kycklinggryta", "Lasagne"] });
      ok(pr.includes("Föreslå INTE något av detta: Kycklinggryta; Lasagne")); ok(pr.includes("Tisdag 2026-11-17 – Middag")); ok(pr.includes("Nötter"));
    });
    t("Planering", "pool kör högst två jobb samtidigt och behåller ordningen", async () => {
      let active = 0, peak = 0;
      const r = await P.pool([1, 2, 3, 4, 5], 2, async x => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return x * 10; });
      eq(r, [10, 20, 30, 40, 50]); ok(peak <= 2);
    });

    /* ---------------- Billigare alternativ ---------------- */
    const alt = (name, cands, cat) => P.alternatives(name, cat, cands.map((sv, k) => ({ id: "a" + k, sv, n: sv, c: cat || "x", p: 10 }))).map(o => o.sv);
    t("Alternativ", "samma märke men annan vara matchar inte", () => eq(alt("Cheasy eller Riberhus skivad ost", ["Cheasy keso", "Klovborg skivad ost"]), ["Klovborg skivad ost"]));
    t("Alternativ", "räkor matchar inte sill bara för att märket är samma", () =>
      eq(alt("Salling Princip grönlandsräkor", ["Salling Princip marinerad sill, kryddsill eller currysill", "Räkor i lake"]), ["Räkor i lake"]));
    t("Alternativ", "samma vara från annat märke matchar", () => eq(alt("Salling Princip krokmörad dansk fläskstek", ["Ugnsklar dansk fläskstek", "Fläskfilé"]), ["Ugnsklar dansk fläskstek"]));
    t("Alternativ", "\"X i Y\" och \"X av Y\" ger X", () => eq([...P.headWords("Tonfisk i vatten"), ...P.headWords("Fläskstek av dansk gris")], ["tonfisk", "fläskstek"]));
    t("Alternativ", "krossade tomater matchar inte färska tomater", () => eq(alt("krossade tomater", ["Körsbärstomater på kvist", "Mutti krossade tomater"]), ["Mutti krossade tomater"]));
    t("Alternativ", "fläskstek matchar inte stekmargarin", () => eq(alt("fläskstek", ["Oma/Becel stek- och bakmargarin", "Ugnsklar fläskstek"]), ["Ugnsklar fläskstek"]));
    t("Alternativ", "ingrediensnamn hittar kampanjvara", () => eq(alt("vetemjöl", ["Amo vetemjöl", "Vetebröd"]), ["Amo vetemjöl"]));
    t("Alternativ", "huvudord tar bort parenteser och märken", () => eq(P.headWords("Barolo Fontanafredda (vin)"), ["fontanafredda"]));

    /* ---------------- Receptsidan ---------------- */
    const sc = [["1 dl", 2, false, "2 dl"], ["2 msk", 1, true, "30 ml"], ["½ st", 3, false, "1 ½ st"], ["250 g", 1.25, false, "315 g"],
      ["1 burk", 1.5, false, "1 ½ burk"], ["en nypa", 3, false, "en nypa"], ["600 g", 2, true, "1,2 kg"], ["3 dl", 4, true, "1,2 l"],
      ["2 st", 1.25, false, "2 ½ st"], ["40 g", 0.5, false, "20 g"]];
    for (const [a1, f, m, want] of sc) t("Receptsidan", `"${a1}" × ${f}${m ? " i g/ml" : ""} → "${want}"`, () => eq(P.scaleAmount(a1, f, m), want));
    t("Receptsidan", "makroandelar summerar till 1 och fett väger tyngre per gram", () => {
      const m = P.macroShares({ protein: 30, carbs: 30, fat: 20 }); near(m.protein + m.carbs + m.fat, 1); ok(m.fat > m.protein);
    });
    t("Receptsidan", "inga makron → ingen stapel", () => eq(P.macroShares({}), null));
    t("Receptsidan", "receptnyckel är stabil", () => eq(P.recipeKey({ title: "Kyckling i ugn med rotfrukter!" }), P.recipeKey({ title: "kyckling i ugn med  rotfrukter" })));
    t("Receptsidan", "förberedelse + tillagning blir total tid", () => eq(P.normalizeRecipe({ prep_min: 10, cook_min: 25, ingredients: [] }, planPrefs).time_min, 35));

    /* ---------------- Sparning ---------------- */
    function fakeStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; }
    function fakeDb() {
      const docs = new Map(), subs = new Map();
      return {
        docs, writes: 0,
        doc(path) {
          const db = this;
          return {
            async get() { return docs.has(path) ? { exists: true, data: () => JSON.parse(docs.get(path)) } : { exists: false }; },
            async set(body) { db.writes++; docs.set(path, JSON.stringify(body)); (subs.get(path) || []).forEach(fn => fn({ exists: true, data: () => JSON.parse(docs.get(path)) })); },
            onSnapshot(fn) { subs.set(path, [...(subs.get(path) || []), fn]); return () => subs.set(path, (subs.get(path) || []).filter(f => f !== fn)); },
          };
        },
      };
    }
    const manualTimers = () => { let fn = null; return { set: f => (fn = f, 1), clear: () => { fn = null; }, fire: () => { const f = fn; fn = null; return f && f(); } }; };
    let clock = 1000; const now = () => ++clock;

    t("Sparning", "ändringar sparas direkt lokalt", async () => {
      const st = fakeStorage(), s = P.createPrefStore({ storage: st, now, timers: manualTimers() });
      s.update({ adults: 3, allergies: ["egg"] });
      const saved = JSON.parse(st.getItem("vt.prefs")); eq([saved.adults, saved.allergies], [3, ["egg"]]);
    });
    t("Sparning", "snabba ändringar blir en skrivning till databasen", async () => {
      const db = fakeDb(), tm = manualTimers(), s = P.createPrefStore({ db, storage: fakeStorage(), now, timers: tm });
      s.update({ adults: 1 }); s.update({ kids: 2 }); s.update({ meals: ["lunch"] });
      eq(db.writes, 0); await tm.fire(); eq(db.writes, 1);
      eq(JSON.parse(db.docs.get("hushall/prefs")).kids, 2);
    });
    t("Sparning", "en annan enhet laddar hushållets preferenser", async () => {
      const db = fakeDb(), a = P.createPrefStore({ db, storage: fakeStorage(), now, timers: manualTimers() });
      a.update({ stores: ["netto"], budget: 900 }); await a.flush();
      const b = P.createPrefStore({ db, storage: fakeStorage(), now, timers: manualTimers() });
      await b.load(); eq([b.get().stores, b.get().budget], [["netto"], 900]);
    });
    t("Sparning", "ändring från någon annan i hushållet tas emot live", async () => {
      const db = fakeDb(); let seen = null;
      const a = P.createPrefStore({ db, storage: fakeStorage(), now, timers: manualTimers(), onChange: (p, src) => { if (src === "remote") seen = p.diet; } });
      a.subscribe();
      const b = P.createPrefStore({ db, storage: fakeStorage(), now, timers: manualTimers() });
      b.update({ diet: "vegetarian" }); await b.flush();
      eq(seen, "vegetarian"); eq(a.get().diet, "vegetarian");
    });
    t("Sparning", "äldre version i databasen skriver inte över nyare lokal", async () => {
      const db = fakeDb(); db.docs.set("hushall/prefs", JSON.stringify({ ...P.defaultPrefs(), adults: 5, updatedAt: 1 }));
      const st = fakeStorage(); st.setItem("vt.prefs", JSON.stringify({ ...P.defaultPrefs(), adults: 3, updatedAt: 999999 }));
      const s = P.createPrefStore({ db, storage: st, now, timers: manualTimers() }); await s.load();
      eq(s.get().adults, 3);
    });
    t("Sparning", "fungerar utan databas och utan lagring", async () => {
      const s = P.createPrefStore({ now }); s.update({ adults: 4 }); await s.load(); eq(s.get().adults, 4);
    });

    return tests;
  }

  /* Kör testerna. Returnerar { passed, failed, results }. */
  async function runTests(P) {
    const results = [];
    for (const x of defineTests(P)) {
      try { await x.fn(); results.push({ ...x, ok: true }); }
      catch (e) { results.push({ ...x, ok: false, error: String(e && e.message || e) }); }
    }
    return { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
  }

  root.PlannerTests = { defineTests, runTests };
})(typeof window !== "undefined" ? window : globalThis);
