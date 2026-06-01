import os
import json
import unicodedata
import urllib.request
import urllib.parse
import logging

from fastapi import HTTPException

log = logging.getLogger("lineup-api")

# Process-level cache — resets on Vercel cold start.
_team_squad_cache: dict = {}


def _af_headers() -> dict:
    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="API_FOOTBALL_KEY not configured")
    return {"x-apisports-key": key}


def _af_get(path: str, params: dict) -> dict:
    """GET request to api-sports.io football API."""
    query = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    url = f"https://v3.football.api-sports.io/{path}?{query}"
    req = urllib.request.Request(url, headers=_af_headers())
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


def _ascii_upper(s: str) -> str:
    """Strip accents and uppercase — 'Gyökeres' → 'GYOKERES'."""
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").upper()


def _parse_height(height_str: str) -> int | None:
    """Convert '178 cm' → 178, return None if unparseable."""
    if not height_str:
        return None
    try:
        return int(height_str.replace(" cm", "").strip())
    except ValueError:
        return None


def _search_player_photo_af(first_name: str, last_name: str) -> str:
    """Fallback: search API-Football by full name for a player's photo URL."""
    query = f"{first_name} {last_name}".strip()
    if not query:
        return ""
    try:
        for season in (2025, 2026):
            resp = _af_get("players", {"search": query, "season": season})
            players_list = resp.get("response", [])
            if players_list:
                return players_list[0]["player"].get("photo", "")
        return ""
    except Exception:
        return ""


def _fetch_team_squad_af(team_name: str) -> dict:
    """Return {NORMALIZED_LASTNAME: {photo, age, height, clubName, clubLogo}}
    for all squad members via API-Football.

    API-Football is the primary source for age, height, current club, and photo —
    all structured data that doesn't require AI interpretation.

    Returns {} if the key is missing or the call fails.
    """
    if not os.environ.get("API_FOOTBALL_KEY"):
        return {}
    key = team_name.lower()
    if key in _team_squad_cache:
        return _team_squad_cache[key]
    try:
        # Step 1: resolve team name → API-Football team ID
        teams_resp = _af_get("teams", {"name": team_name, "league": 1, "season": 2026})
        teams = teams_resp.get("response", [])
        if not teams:
            # Fallback: search without league filter
            teams_resp = _af_get("teams", {"name": team_name, "type": "National"})
            teams = teams_resp.get("response", [])
        if not teams:
            _team_squad_cache[key] = {}
            return {}
        team_id = teams[0]["team"]["id"]

        # Step 2: fetch full squad with player data
        squad_resp = _af_get("players", {"team": team_id, "season": 2026})

        squad_map: dict = {}
        for entry in squad_resp.get("response", []):
            p = entry.get("player", {})
            stats = entry.get("statistics", [])

            last = _ascii_upper(p.get("lastname") or "")
            if not last:
                continue

            # Current club: prefer a domestic league entry over national team entries
            club_entry = next(
                (s for s in stats if s.get("league", {}).get("type") == "League"),
                stats[0] if stats else {},
            )
            team_info = club_entry.get("team", {})

            squad_map[last] = {
                "photo":    p.get("photo", ""),
                "age":      p.get("age"),
                "height":   _parse_height(p.get("height") or ""),
                "clubName": team_info.get("name", ""),
                "clubLogo": team_info.get("logo", ""),
            }

        log.info("[%s] AF squad: %d spelare", team_name, len(squad_map))
        _team_squad_cache[key] = squad_map
        return squad_map
    except Exception as e:
        log.info("[%s] AF squad misslyckades: %s", team_name, e)
        _team_squad_cache[key] = {}
        return {}
