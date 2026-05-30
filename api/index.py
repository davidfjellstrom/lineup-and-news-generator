import os
import sys

# Ensure the api/ directory is always on sys.path so sibling modules are importable
# regardless of whether this file is run as a script (Vercel) or as a package (uvicorn api.index:app).
_API_DIR = os.path.dirname(os.path.abspath(__file__))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

import logging
import urllib.request
import urllib.parse

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
import anthropic
from dotenv import load_dotenv

from photos import _af_get
from lineup import run_with_search, fetch_lineup
from news import fetch_news

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("lineup-api")

app = FastAPI(title="Lineup Generator API")

_ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    return anthropic.Anthropic(api_key=api_key)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/proxy-image")
def proxy_image(url: str = Query(...)):
    """Server-side image proxy so the browser can embed cross-origin images in PPTX exports."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme")
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "image/jpeg")
        return Response(content=data, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/news")
def get_news(q: str = Query(default="World Cup 2026 football")):
    client = get_client()
    try:
        return fetch_news(q, client)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/player-info")
def get_player_info(name: str = Query(...), team: str = Query(default="")):
    client = get_client()
    team_ctx = f" of {team}" if team else ""
    prompt = (
        f"Find up-to-date information about football player {name}{team_ctx}. "
        "Write a concise 2–3 sentence bio suitable for a TV commentator, covering age, "
        "club, playing style, and any notable recent achievements."
    )
    try:
        bio = run_with_search(client, prompt, max_uses=3)
        return {"bio": bio}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/lineup")
def get_lineup(
    team: str = Query(...),
    formation: str = Query(default="4-3-3"),
    mode: str = Query(default="pre-match"),
    fixture_id: int = Query(default=None),
):
    client = get_client()
    try:
        return fetch_lineup(team, formation, mode, fixture_id, client)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fixtures")
def get_fixtures(team: str = Query(...)):
    """Return upcoming WC 2026 fixtures for a team name using API-Football."""
    try:
        teams_resp = _af_get("teams", {"name": team, "league": 1, "season": 2026})
        teams = teams_resp.get("response", [])
        if not teams:
            raise HTTPException(status_code=404, detail=f"Team '{team}' not found in WC 2026")
        team_id = teams[0]["team"]["id"]
        team_name = teams[0]["team"]["name"]

        fixtures_resp = _af_get("fixtures", {"team": team_id, "league": 1, "season": 2026})
        fixtures = fixtures_resp.get("response", [])

        result = []
        for f in fixtures:
            fixture = f["fixture"]
            home = f["teams"]["home"]
            away = f["teams"]["away"]
            result.append({
                "fixtureId": fixture["id"],
                "date": fixture["date"],
                "status": fixture["status"]["short"],
                "home": home["name"],
                "away": away["name"],
                "homeId": home["id"],
                "awayId": away["id"],
            })

        return {"teamId": team_id, "teamName": team_name, "fixtures": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Vercel / AWS Lambda entry point
handler = Mangum(app, lifespan="off")
