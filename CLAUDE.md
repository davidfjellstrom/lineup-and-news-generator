# CLAUDE.md — World Cup 2026 Lineup Generator

## Projektöversikt

AI-drivet kommentatorverktyg byggt för TV-kommentatorer. Hämtar trupp- och matchdata, visar visuell planschvy med två lag, och levererar ett live-nyhetsflöde via Claude API.

**Stack:** FastAPI (Python) + React 18 (Vite) + Tailwind CSS + Vercel (serverless via Mangum)  
**AI:** Claude Sonnet med `web_search_20250305`  
**Externa API:er:** API-Football (api-sports.io), football-logos.cc (scraping)

---

## Kodkvalitetsprinciper

När du arbetar i det här projektet ska du aktivt ifrågasätta befintlig kod och inte bara acceptera den som given. Ställ dig alltid dessa frågor:

- **Gör den här funktionen en sak, eller försöker den göra flera?**
- **Är det här logiken på rätt ställe, eller har den hamnat här av bekvämlighet?**
- **Vad händer om det här misslyckas? Hanteras felet på ett vettigt sätt?**
- **Kommer en annan utvecklare förstå detta om ett år?**
- **Är det här konsekvent med hur resten av projektet löser samma typ av problem?**

Om svaret på någon av dessa är tveksamt — säg det. Föreslå en bättre lösning.

---

## Arkitektur och ansvarsfördelning

### Backend (`api/index.py`)
- **FastAPI-endpoints** hanterar routing och request/response — inget annat.
- **Hjälpfunktioner** (`get_club_logo_url`, `_fetch_team_player_photos`, `run_with_search`) ska vara isolerade och testbara.
- **Prompts** (`_build_lineup_prompt`) ska ligga separerade — inte inline i endpoint-logiken.
- **In-memory cache** (`_country_slug_cache`, `_team_photo_cache`) är acceptabelt för Vercel serverless, men dokumentera begränsningarna tydligt.

### Frontend (`src/`)
- **App.jsx** äger global state och navigation — håll den ren från domänlogik.
- **Komponenter** ska ha ett tydligt syfte. `Pitch.jsx` är komplex och har mycket logik — var vaksam på att den inte växer ytterligare utan refaktorering.
- **Utils** (`formations.js`, `exportPptx.js`) ska vara rena funktioner utan sidoeffekter.
- **Data** (`wc2026Teams.js`) är statisk konfiguration — behandla den som sådan.

---

## Kända svagheter att granska kritiskt

Dessa delar av kodbasen bör ifrågasättas aktivt:

### 1. `api/index.py` — Funktionsstorlek
`get_lineup`-endpointen är lång och gör många saker: prompt-byggande, Claude-anrop, JSON-parsing, logotypskrapning, fotohämtning och sammansättning av svar. Fråga dig om detta kan brytas upp.

### 2. `Pitch.jsx` — State och sidoeffekter
Komponenten hanterar drag-and-drop, positionsberäkning, ghost-rendering, export och starterbyten. Det är mycket för en komponent. Vägledning: om `useEffect` + `useRef` + `useImperativeHandle` + `useMemo` + `useState` alla finns i samma komponent, är det ett tecken på att logiken borde delas upp.

### 3. `App.jsx` — localStorage utan felhantering
`loadSaved()` har try/catch, men `localStorage.setItem` i `useEffect` saknar det. På iOS i privat läge kastar detta ett undantag.

### 4. `run_with_search` — Agentic loop
Iteration-gränsen på 8 är godtycklig och odokumenterad. `tool_results` med tomma strängar som content är troligen fel — Claude förväntar sig faktiska sökresultat här, inte tomma strängar. Kontrollera om web_search-verktyget returnerar resultat automatiskt eller om de behöver vidarebefordras manuellt.

### 5. `extract_json` — Bräcklig parsing
Regex-baserad JSON-extraktion är alltid ett risktagande. Är det dokumenterat vad som händer om Claude returnerar delvis ogiltig JSON?

### 6. `exportPptx.js` — Hårdkodade layoutkonstanter
Alla pixelvärden och koordinater är magiska tal utan förklaring. Vad betyder `SUBS_H / 4`? Vad är `0.06`? Kommentera eller namnge dessa.

### 7. `TeamSetup.jsx` — Komponentstorlek
Filen är ~450 rader och innehåller flera komponenter (`TeamPicker`, `PlayerRow`, `TeamPanel`, `TeamSetup`) samt affärslogik för fixtures, filhantering och lagnamnsaliaser. Överväg att dela upp i separata filer.

---

## Felhantering — standard i det här projektet

- Alla `fetch`-anrop i frontend ska hantera både nätverksfel och HTTP-fel (kontrollera `res.ok`).
- Alla externa anrop i backend ska ha try/except med loggning.
- Returnera aldrig `500` utan ett begripligt felmeddelande i `detail`.
- Visa aldrig rå Python-stack trace till användaren.

---

## Namngivning och konventioner

- **Python:** snake_case, privata hjälpfunktioner prefixas med `_`
- **JavaScript/JSX:** camelCase för variabler/funktioner, PascalCase för komponenter
- **Tailwind:** inline-stilar med `style={{}}` används när färger inte finns i Tailwinds defaultskala — det är acceptabelt här, men försök hålla det konsekvent
- **Spelarobjekt:** formatet definieras i README och `api/index.py` — bryt inte schemat utan att uppdatera båda

---

## Vad du INTE ska göra

- Lägg inte till nya npm-paket utan att diskutera det — bundlestorleken påverkar Vercel cold starts.
- Lägg inte affärslogik i `App.jsx` — den ska bara orkestrera.
- Ändra inte `_ALLOWED_ORIGINS`-hanteringen utan att tänka på säkerheten.
- Introducera inte ytterligare global state — all state lever i `match`-objektet i `App.jsx`, håll det så.
- Gör inte `api/index.py` längre — den är redan för lång.

---

## När du föreslår en förändring

Förklara alltid:
1. Vad problemet är
2. Varför den befintliga lösningen är otillräcklig
3. Vad din lösning gör bättre
4. Vilka avvägningar din lösning medför

Acceptera inte status quo bara för att det fungerar.
