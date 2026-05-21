# World Cup 2026 — Lineup & News Generator

AI-powered lineup sheet and live news feed built for TV football commentators. Fetches official squad data, displays a visual pitch with both teams, resolves club badges automatically, and pulls live football news via Claude AI.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react) ![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi) ![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-8B5CF6) ![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel)

---

## Features

- **AI squad fetch** — one click pulls starting XI + substitutes, coach, flag and jersey numbers for a national team
- **Match mode with confirmed fixtures** — switch to `match` mode and choose upcoming WC 2026 fixtures to fetch confirmed lineups via API-Football
- **Dual-team visual pitch** — two teams displayed side by side, with player positions arranged by GK → DEF → MID → FWD
- **Club badges** — automatically resolves logos from [football-logos.cc](https://football-logos.cc) using fuzzy matching across country pages
- **Editable commentator notes** — add live notes directly on player cards
- **Fixture selector** — search WC 2026 teams and select upcoming fixtures for match-specific lineups
- **Live news feed** — AI-powered news search with quick filter buttons for football topics
- **PNG export** — save the visible lineup pitch as an image using `html2canvas`

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
- An [API-Football API key](https://www.api-football.com) for match fixture lookup and confirmed lineups

### Installation

```bash
git clone https://github.com/davidfjellstrom/lineup-and-news-generator.git
cd lineup-and-news-generator
npm install
pip install -r api/requirements.txt
```

### Environment

Create a `.env` file in the project root:

```bash
ANTHROPIC_API_KEY=sk-ant-...
API_FOOTBALL_KEY=your-api-football-key
ALLOWED_ORIGINS=http://localhost:5173
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
│   │   ├── Pitch.jsx            # Visual pitch layout and note handling
│   │   ├── PlayerCard.jsx       # Player cards with editable notes
│   │   ├── TeamSetup.jsx        # Team picker, fixture selector and AI fetch
│   │   ├── SubstitutesPanel.jsx # Bench players grouped by position
│   │   └── NewsFeed.jsx         # Live news search UI
│   ├── utils/formations.js      # Formation line grouping logic
│   └── data/wc2026Teams.js      # WC 2026 team list and flags
├── api/
│   ├── index.py                 # FastAPI endpoints for lineup, news, fixtures, player info
│   └── requirements.txt         # Python dependencies
├── vercel.json
└── README.md
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/lineup?team=Sweden&formation=4-3-3` | Fetch squad via AI |
| `GET /api/lineup?team=Sweden&formation=4-3-3&mode=match&fixture_id=123` | Fetch confirmed lineup for a fixture |
| `GET /api/fixtures?team=Sweden` | Fetch upcoming WC 2026 fixtures via API-Football |
| `GET /api/news?q=Sweden+World+Cup` | Fetch live news via AI |
| `GET /api/player-info?name=Gyokeres&team=Sweden` | Fetch a commentator-ready player bio via AI |

## Deploy to Vercel

```bash
vercel deploy
```

Set `ANTHROPIC_API_KEY` and `API_FOOTBALL_KEY` as environment variables in the Vercel dashboard.

## Data Model

```js
player: {
  id,
  number,
  firstName,
  lastName,
  position,   // "GK" | "DEF" | "MID" | "FWD"
  photo,      // URL (optional)
  clubLogo,   // URL resolved from football-logos.cc
  clubName,
  notes,      // editable commentator notes
  isStarter
}
```

## Known Limitations

- Player photos require manual URL input (rights restrictions)
- Match save/load not yet implemented
- No dedicated mobile layout
- `player-info` endpoint exists, but UI wiring is not yet complete
