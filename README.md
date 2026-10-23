# Mathandling

En plattform som samlar alla bästa deals från matbutiker jag handlar i samt genererar recept till mig.

Appen visar veckans erbjudanden från butikerna vi handlar i, i Köpenhamn:
**føtex, Netto, 365discount, Lidl, REMA 1000, SuperBrugsen och MENY.**

## Funktioner

- **Erbjudanden per kategori**: Kött & fågel, Chark & pålägg, Fisk & skaldjur, Frukt & bär, Grönsaker, Mejeri & ägg, Ost, Bröd & bageri, Fryst, Färdigmat & vego, Torrvaror & skafferi, Drycker, Godis & snacks, Hem & hushåll, Hygien & hälsa, Djurmat och Övrigt (non-food).
- **Svenska produktnamn**, med det danska originalnamnet under så att varan går att känna igen på hyllan.
- **Filter och sortering**: butik, "gäller nu" eller "kommande", rabatt, pris och jämförpris (kr/kg, kr/l). Medlemspriser och köpbegränsningar är markerade.
- **Receptgenerator**: väljer recept utifrån kampanjvarorna i en butik (eller alla butiker), med önskemål som vegetariskt, snabbt eller barnvänligt. Ingredienser som är på kampanj visas med pris och kan läggas i inköpslistan.
- **Delad inköpslista**, grupperad per butik och med en summa.

## Filer

| Fil | Innehåll |
|---|---|
| `index.html` | Själva appen (en enda HTML-fil) |
| `fetch_tilbud.py` | Hämtar veckans erbjudanden från eTilbudsavis/Tjek API, kategoriserar dem och skriver `data.json` |
| `data.json` | Senast hämtade erbjudanden |
| `translations.json` | Danska produktnamn → svenska |

## Uppdatera erbjudandena

```bash
python3 fetch_tilbud.py
```

Skriptet kräver bara Python 3 och ingen API-nyckel. Produktnamn som saknar svensk översättning hamnar i `untranslated.json`. Lägg in dem i `translations.json` och kör skriptet igen.

## Köra appen

Appen är publicerad som en Claude-artefakt. Där fungerar den delade inköpslistan och receptgeneratorn, som båda använder Claude.

Lokalt (receptgeneratorn är då avstängd och inköpslistan sparas bara i webbläsaren):

```bash
python3 -m http.server 8000
```

Öppna sedan http://localhost:8000.
