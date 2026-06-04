import os
import json
import unicodedata
import urllib.request
import urllib.parse
import logging

log = logging.getLogger("lineup-api")

# Note: cache lives in process memory; on Vercel each cold-start instance resets it.
_team_photo_cache: dict = {}


def _af_headers() -> dict:
    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:
        raise RuntimeError("API_FOOTBALL_KEY not configured")
    return {"x-apisports-key": key}


def _af_get(path: str, params: dict) -> dict:
    """GET request to api-sports.io football API."""
    query = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    url = f"https://v3.football.api-sports.io/{path}?{query}"
    req = urllib.request.Request(url, headers=_af_headers())
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


def _ascii_upper(s: str) -> str:
    """Strip accents and uppercase — e.g. 'Gyökeres' → 'GYOKERES'."""
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").upper()


def _search_player_photo_af(first_name: str, last_name: str) -> str:
    """Fallback: search API-Football by name for a single player's photo URL."""
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


def _fetch_team_player_photos(team_name: str) -> dict:
    """Return {LASTNAME → photo_url} for all squad members of a team in WC 2026.

    Makes 2 API calls: team lookup then squad fetch. Results are cached per team name.
    Returns an empty dict if the API key is missing or any call fails.
    """
    if not os.environ.get("API_FOOTBALL_KEY"):
        return {}
    key = team_name.lower()
    if key in _team_photo_cache:
        return _team_photo_cache[key]
    try:
        teams_resp = _af_get("teams", {"name": team_name, "league": 1, "season": 2026})
        teams = teams_resp.get("response", [])
        if not teams:
            # Retry without league filter — handles name variants or teams not yet registered
            teams_resp = _af_get("teams", {"name": team_name, "type": "National"})
            teams = teams_resp.get("response", [])
        if not teams:
            _team_photo_cache[key] = {}
            return {}
        team_id = teams[0]["team"]["id"]

        squad_resp = _af_get("players", {"team": team_id, "season": 2026})

        # Build collision-aware photo map.
        # Primary key: FIRSTNAME_LASTNAME (e.g. "VIKTOR_JOHANSSON").
        # A bare LASTNAME shortcut is only added when no other player shares that surname,
        # which prevents one Johansson from silently overwriting another.
        raw: list[tuple[str, str, str]] = []
        lastname_count: dict[str, int] = {}
        for entry in squad_resp.get("response", []):
            p = entry.get("player", {})
            first = _ascii_upper(p.get("firstname") or "")
            last = _ascii_upper(p.get("lastname") or "")
            photo = p.get("photo", "")
            if last and photo:
                raw.append((first, last, photo))
                lastname_count[last] = lastname_count.get(last, 0) + 1

        photo_map: dict[str, str] = {}
        for first, last, photo in raw:
            full_key = f"{first}_{last}" if first else last
            photo_map[full_key] = photo
            if lastname_count[last] == 1:
                photo_map[last] = photo
        log.info("[%s] Hittade foton för %d spelare via API-Football", team_name, len(photo_map))
        _team_photo_cache[key] = photo_map
        return photo_map
    except Exception as e:
        log.info("[%s] Foto-hämtning misslyckades: %s", team_name, e)
        _team_photo_cache[key] = {}
        return {}
