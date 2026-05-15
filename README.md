# World Cup 2026 — Lineup & News Generator

AI-powered lineup sheet and live news feed built for TV football commentators. Fetches official squad data, displays visual pitch formations with club badges, and pulls real-time match news — all via Claude AI.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react) ![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi) ![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-8B5CF6) ![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel)

---

## Features

- **AI squad fetch** — one click pulls starting XI + substitutes, coach, flag and jersey numbers for any national team from official FIFA/Transfermarkt data
- **Visual pitch** — green field with both teams side by side in their formation, players positioned by line (GK → DEF → MID → FWD)
- **Club badges** — automatically resolved from [football-logos.cc](https://football-logos.cc) with fuzzy country-page matching (covers even obscure clubs)
- **Editable commentator notes** — click any player card to add live notes during broadcast
- **Substitutes panel** — bench players grouped by position
- **Live news feed** — AI-powered news search with quick filters per team or topic
- **PNG export** — export the full pitch view as an image via html2canvas

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI, Mangum (Vercel serverless) |
| AI | Claude `claude-sonnet-4-6` with `web_search_20250305` |
| Logo source | football-logos.cc (server-side scraping) |
| Deploy | Vercel (frontend + Python API) |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- An [Anthropic API key](https://console.anthropic.com)

### Installation

```bash
git clone https://github.com/davidfjellstrom/lineup-and-news-generator.git
cd lineup-and-news-generator
npm install
pip install -r api/requirements.txt
```

### Environment

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Run locally

```bash
# Terminal 1 — frontend
npm run dev

# Terminal 2 — backend
python3 -m uvicorn api.index:app --reload --port 8000
```

Open [http://localhost:5173](http://localhost:5173).

## Project Structure

```
├── src/
│   ├── App.jsx                  # Root state, navigation, PNG export
│   ├── components/
│   │   ├── Pitch.jsx            # Green field layout, formations
│   │   ├── PlayerCard.jsx       # Player card with badge, notes
│   │   ├── TeamSetup.jsx        # Team editor, AI fetch button
│   │   ├── SubstitutesPanel.jsx # Bench grouped by position
│   │   └── NewsFeed.jsx         # News search + article cards
│   ├── utils/formations.js      # Formation logic, groupIntoLines()
│   └── data/sampleMatch.js      # Default data (Turkey vs Portugal)
├── api/
│   └── index.py                 # FastAPI: /lineup, /news, /player-info
├── vercel.json
└── .env
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/lineup?team=Sweden&formation=4-3-3` | Fetch squad via AI |
| `GET /api/news?q=Sweden+World+Cup` | Fetch news via AI |
| `GET /api/player-info?name=Gyokeres&team=Sweden` | Player bio via AI |

## Deploy to Vercel

```bash
vercel deploy
```

Set `ANTHROPIC_API_KEY` as an environment variable in the Vercel dashboard.

## Data Model

```js
player: {
  id, number, firstName, lastName,
  position,   // "GK" | "DEF" | "MID" | "FWD"
  photo,      // URL (optional, manual)
  clubLogo,   // URL resolved from football-logos.cc
  clubName,
  notes,      // editable commentator notes
  isStarter
}
```

## Known Limitations

- Player photos require manual URL input (rights restrictions)
- Match save/load not yet implemented
- No mobile layout
