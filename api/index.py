import os
import json
import re
import logging
import unicodedata
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
import anthropic
from dotenv import load_dotenv

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


def _map_position(pos: str) -> str:
    return {"G": "GK", "D": "DEF", "M": "MID", "F": "FWD"}.get(pos, "MID")


_SLUG_STRIP_PREFIXES = ["fc-", "afc-", "ac-", "as-", "ss-", "sc-", "rc-", "vfl-", "sv-", "rb-", "cf-", "bvb-"]
_SLUG_STRIP_SUFFIXES = ["-fc", "-afc", "-ac", "-united", "-city", "-hotspur", "-wanderers",
                        "-albion", "-athletic", "-rovers", "-town", "-aif", "-bk", "-sk", "-if", "-ff", "-fk", "-ik"]

# In-memory cache: country → list of known slugs (populated on first miss per country)
_country_slug_cache: dict = {}
def _ascii_upper(s: str) -> str:
    """Strip accents and uppercase — e.g. 'Gyökeres' → 'GYOKERES'."""
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii').upper()

# In-memory cache: team name → {LASTNAME → photo_url} map from API-Football
_team_photo_cache: dict = {}


def _fetch_logo_from_page(country: str, slug: str) -> str:
    req = urllib.request.Request(
        f"https://football-logos.cc/{country}/{slug}/",
        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
    )
    with urllib.request.urlopen(req, timeout=6) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    m = re.search(r"https://assets\.football-logos\.cc/logos/[^\"')\s]+\.png", html)
    return m.group() if m else ""


def _get_country_slugs(country: str) -> list:
    """Fetch and cache all club slugs for a country page."""
    if country in _country_slug_cache:
        return _country_slug_cache[country]
    try:
        req = urllib.request.Request(
            f"https://football-logos.cc/{country}/",
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="replace")
        all_slugs = re.findall(rf'href="/{re.escape(country)}/([^/"]+)/"', html)
        # Slugs that appear once are clubs; duplicates are navigation/category links
        from collections import Counter
        counts = Counter(all_slugs)
        club_slugs = [s for s, c in counts.items() if c == 1]
        _country_slug_cache[country] = club_slugs
        return club_slugs
    except Exception:
        return []


def _fuzzy_match_slug(target: str, candidates: list) -> str:
    """Pick candidate with highest word-overlap against target slug."""
    noise = {"fc", "sc", "ac", "bc", "rc", "afc", "if", "bk", "sk", "ff", "fk", "ik", "de", "la", "le"}
    target_words = set(target.split("-")) - noise
    if not target_words:
        return ""
    best, best_score = "", 0
    for c in candidates:
        overlap = len(target_words & (set(c.split("-")) - noise))
        if overlap > best_score:
            best_score, best = overlap, c
    return best if best_score > 0 else ""


def get_club_logo_url(club_country: str, club_slug: str) -> str:
    """Scrape CDN URL from football-logos.cc with prefix/suffix fallbacks and fuzzy country-page lookup."""
    if not club_country or not club_slug:
        return ""

    slugs = [club_slug]
    for p in _SLUG_STRIP_PREFIXES:
        if club_slug.startswith(p):
            slugs.append(club_slug[len(p):])
    for s in _SLUG_STRIP_SUFFIXES:
        if club_slug.endswith(s):
            slugs.append(club_slug[: -len(s)])
    parts = club_slug.split("-")
    if len(parts) >= 3 and parts[0] not in slugs:
        slugs.append(parts[0])

    for slug in slugs:
        try:
            result = _fetch_logo_from_page(club_country, slug)
            if result:
                return result
        except Exception:
            continue

    # Fallback: fetch the country's full club list and fuzzy-match
    country_slugs = _get_country_slugs(club_country)
    best = _fuzzy_match_slug(club_slug, country_slugs)
    if best and best not in slugs:
        try:
            result = _fetch_logo_from_page(club_country, best)
            if result:
                return result
        except Exception:
            pass

    return ""


def _search_player_photo_af(first_name: str, last_name: str) -> str:
    """Fallback: search API-Football by name for a single player's photo URL."""
    query = f"{first_name} {last_name}".strip()
    if not query:
        return ""
    try:
        for season in (2025, 2024, 2026):
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
            _team_photo_cache[key] = {}
            return {}
        team_id = teams[0]["team"]["id"]

        # WC 2026 squads may not be indexed yet — try recent seasons as fallback
        squad_resp = {"response": []}
        for season in (2026, 2025, 2024):
            squad_resp = _af_get("players", {"team": team_id, "season": season})
            if squad_resp.get("response"):
                log.info("[%s] Hittade spelartrupp i API-Football säsong %d", team_name, season)
                break

        photo_map = {}
        for entry in squad_resp.get("response", []):
            p = entry.get("player", {})
            last = _ascii_upper(p.get("lastname") or "")
            photo = p.get("photo", "")
            if last and photo:
                photo_map[last] = photo
        log.info("[%s] Hittade foton för %d spelare via API-Football", team_name, len(photo_map))
        _team_photo_cache[key] = photo_map
        return photo_map
    except Exception as e:
        log.info("[%s] Foto-hämtning misslyckades: %s", team_name, e)
        _team_photo_cache[key] = {}
        return {}


def run_with_search(client: anthropic.Anthropic, user_message: str, max_uses: int = 5, label: str = "") -> str:
    """Run a Claude conversation with web_search_20250305 tool, handling the agentic loop."""
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": max_uses}]
    messages = [{"role": "user", "content": user_message}]
    prefix = f"[{label}] " if label else ""

    for iteration in range(8):
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            tools=tools,
            messages=messages,
        )

        # Log every tool_use block so we can see what Claude searches for
        for blk in response.content:
            if getattr(blk, "type", None) == "tool_use":
                query = getattr(blk, "input", {}).get("query", "?")
                log.info("%s🔍 Sökning #%d: %s", prefix, iteration + 1, query)
            elif getattr(blk, "type", None) == "text" and blk.text.strip():
                preview = blk.text.strip()[:120].replace("\n", " ")
                log.info("%s💬 Svar: %s%s", prefix, preview, "…" if len(blk.text) > 120 else "")

        if response.stop_reason == "end_turn":
            break

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_results = [
                {"type": "tool_result", "tool_use_id": blk.id, "content": ""}
                for blk in response.content
                if getattr(blk, "type", None) == "tool_use"
            ]
            if not tool_results:
                break
            messages.append({"role": "user", "content": tool_results})
        else:
            break

    return "".join(
        blk.text for blk in response.content if getattr(blk, "type", None) == "text"
    )


def extract_json(text: str):
    match = re.search(r"\[[\s\S]*\]", text)
    if match:
        return json.loads(match.group())
    return json.loads(text.strip())


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
    prompt = f"""Search for the latest football/soccer news about: {q}

Find 5–8 recent articles. Return ONLY a valid JSON array where each element has:
- source: news outlet name (e.g. "BBC Sport", "ESPN", "Sky Sports", "FIFA")
- time: relative age string (e.g. "2 hours ago", "Yesterday", "3 days ago")
- title: article headline
- summary: 1–2 sentence plain-text summary
- url: article URL

No markdown fences, no extra keys, no explanation — pure JSON array."""

    try:
        text = run_with_search(client, prompt)
        articles = extract_json(text)
        return {"articles": articles}
    except json.JSONDecodeError:
        return {"articles": [], "raw": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/player-info")
def get_player_info(
    name: str = Query(...),
    team: str = Query(default=""),
):
    client = get_client()
    team_ctx = f" of {team}" if team else ""
    prompt = f"Find up-to-date information about football player {name}{team_ctx}. Write a concise 2–3 sentence bio suitable for a TV commentator, covering age, club, playing style, and any notable recent achievements."

    try:
        bio = run_with_search(client, prompt, max_uses=3)
        return {"bio": bio}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _build_lineup_prompt(team: str, formation: str, mode: str) -> str:
    player_schema = f"""Each player (in both arrays) has:
- number: official jersey number as registered with FIFA (integer)
- firstName: first name in UPPERCASE
- lastName: last name / surname in UPPERCASE
- position: one of GK, DEF, MID, FWD  (used for formation grouping)
- positionLabel: specific position for display, e.g. "GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "SS", "CF", "ST"
- age: current age in years (integer)
- height: height in cm (integer, e.g. 189)
- foot: preferred foot in Swedish — "Hö" (right), "Vä" (left), or "Båda" (both)
- caps: number of official senior international appearances for this national team (integer, 0 if debut/unknown)
- goals: number of senior international goals for this national team (integer, 0 if none)
- marketValue: market value in millions EUR from Transfermarkt (number e.g. 65.0, or null if not found)
- clubName: current club name in English (e.g. "Arsenal", "Bayern Munich", "Real Madrid")
- clubCountry: lowercase country where the CLUB plays (not the national team), e.g. "england", "germany", "spain", "italy", "france", "sweden", "portugal", "netherlands", "turkey", "saudi-arabia"
- clubSlug: club's slug on football-logos.cc — lowercase with hyphens, no accents. Examples: "arsenal", "fc-bayern-munchen", "atletico-madrid", "aik", "mjallby-aif", "al-nassr". Derive it from the club's native name if not English (e.g. Bayern Munich → "fc-bayern-munchen")"""

    json_shape = f"""Return ONLY a valid JSON object with these exact keys:
- flag: the flag emoji for {team}'s country (e.g. "🇸🇪" for Sweden)
- coach: head coach full name in UPPERCASE
- fifaRanking: current FIFA world ranking (integer, e.g. 38)
- avgAge: average age of all squad members listed (number rounded to 1 decimal, e.g. 27.4)
- squadValue: total squad market value in millions EUR from Transfermarkt (number, e.g. 435)
- source: the name and URL of the source where the lineup was found (e.g. "UEFA.com – https://...")
- starters: array of exactly 11 starting players
- substitutes: array of 7–12 squad players not in the starting XI

{player_schema}

No markdown fences, no explanation — pure JSON object."""

    if mode == "match":
        return f"""Search for the OFFICIALLY RELEASED starting lineup for {team} in their next or most recent World Cup 2026 match.

Search UEFA.com, FIFA.com, the team's official federation site, and major outlets (BBC Sport, ESPN, Sky Sports) for the confirmed lineup that was released approximately 1 hour before kickoff.

Find the REAL officially assigned jersey numbers — do not invent sequential numbers.

{json_shape}"""
    else:
        # pre-match (default)
        return f"""Search FIFA.com first, then Transfermarkt for {team}'s official World Cup 2026 squad registration (squads are now registered — always use the official FIFA 2026 data).

Specifically search Transfermarkt's {team} national team page for: ages, heights, preferred foot, market values, international caps and goals per player, as well as the team's total squad value, average age, and FIFA world ranking.

Find the REAL officially assigned jersey numbers — do not invent sequential numbers.

The starters array should reflect the most likely XI based on recent matches and current form.

{json_shape}"""


@app.get("/api/lineup")
def get_lineup(
    team: str = Query(...),
    formation: str = Query(default="4-3-3"),
    mode: str = Query(default="pre-match"),
    fixture_id: int = Query(default=None),
):
    # Match mode with a confirmed fixture → use API-Football
    if mode == "match" and fixture_id:
        data = _lineup_from_api_football(fixture_id, team)
        all_players = data["starters"] + data["substitutes"]
        # Logo scraping still runs as usual — API-Football doesn't provide club logos
        # Claude already filled in clubCountry/clubSlug for pre-match; for match mode
        # those fields are blank so logo scraping is skipped gracefully.
        unique_pairs = list({(p.get("clubCountry", ""), p.get("clubSlug", ""))
                             for p in all_players if p.get("clubSlug")})
        if unique_pairs:
            log.info("[%s] Skrapar logotyper för %d klubbar…", team, len(unique_pairs))
            with ThreadPoolExecutor(max_workers=10) as ex:
                urls = list(ex.map(lambda pair: get_club_logo_url(*pair), unique_pairs))
            logo_map = dict(zip(unique_pairs, urls))
            for p in all_players:
                key = (p.get("clubCountry", ""), p.get("clubSlug", ""))
                p["clubLogoUrl"] = logo_map.get(key, "")
        return data

    # Pre-match mode (or match mode without fixture_id) → use Claude
    client = get_client()
    prompt = _build_lineup_prompt(team, formation, mode)

    try:
        text = run_with_search(client, prompt, max_uses=5, label=team)
        match = re.search(r'\{[\s\S]*\}', text)
        if match:
            data = json.loads(match.group())
        else:
            data = {"players": extract_json(text)}

        data["mode"] = mode

        all_players = (data.get("starters") or []) + (data.get("substitutes") or data.get("players") or [])

        unique_pairs = list({(p.get("clubCountry", ""), p.get("clubSlug", ""))
                             for p in all_players if p.get("clubSlug")})
        fetch_photos = bool(os.environ.get("API_FOOTBALL_KEY"))
        log.info("[%s] Skrapar logotyper för %d klubbar%s…", team, len(unique_pairs),
                 f" + bilder för {len(all_players)} spelare" if fetch_photos else "")

        with ThreadPoolExecutor(max_workers=12) as ex:
            logo_futures = [ex.submit(get_club_logo_url, *pair) for pair in unique_pairs]
            photo_future = ex.submit(_fetch_team_player_photos, team) if fetch_photos else None
            logo_urls = [f.result() for f in logo_futures]
            photo_map = photo_future.result() if photo_future else {}

        logo_map = dict(zip(unique_pairs, logo_urls))

        for p in all_players:
            key = (p.get("clubCountry", ""), p.get("clubSlug", ""))
            p["clubLogoUrl"] = logo_map.get(key, "")
            if p["clubLogoUrl"]:
                log.info("  ✓ %s → …%s", p.get("clubName"), p["clubLogoUrl"][-35:])
            else:
                log.info("  ✗ %s (%s/%s) — inte hittad", p.get("clubName"), p.get("clubCountry", "?"), p.get("clubSlug", "?"))

        # Primary: match from team squad lookup
        unmatched = []
        for p in all_players:
            photo = photo_map.get(_ascii_upper(p.get("lastName", "")), "")
            if photo:
                p["photo"] = photo
            else:
                unmatched.append(p)

        # Fallback: individual name search for players not in the team squad
        if fetch_photos and unmatched:
            log.info("[%s] Fallback-sökning för %d osparkade spelare…", team, len(unmatched))
            with ThreadPoolExecutor(max_workers=8) as ex:
                fallback_photos = list(ex.map(
                    lambda p: _search_player_photo_af(p.get("firstName", ""), p.get("lastName", "")),
                    unmatched,
                ))
            for p, photo in zip(unmatched, fallback_photos):
                if photo:
                    p["photo"] = photo

        return data
    except json.JSONDecodeError:
        return {"players": [], "raw": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fixtures")
def get_fixtures(team: str = Query(...)):
    """Return upcoming WC 2026 fixtures for a team name using API-Football."""
    try:
        # Step 1: resolve team name → API-Football team ID
        teams_resp = _af_get("teams", {"name": team, "league": 1, "season": 2026})
        teams = teams_resp.get("response", [])
        if not teams:
            raise HTTPException(status_code=404, detail=f"Team '{team}' not found in WC 2026")
        team_id = teams[0]["team"]["id"]
        team_name = teams[0]["team"]["name"]

        # Step 2: fetch all WC 2026 fixtures for that team
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


def _lineup_from_api_football(fixture_id: int, team_name: str) -> dict:
    """Fetch confirmed lineup from API-Football for a given fixture."""
    # Parallel fetch: lineup structure + full player names
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_lineups = ex.submit(_af_get, "fixtures/lineups", {"fixture": fixture_id})
        f_players = ex.submit(_af_get, "players", {"fixture": fixture_id})
        lineups_resp = f_lineups.result()
        players_resp = f_players.result()

    lineups = lineups_resp.get("response", [])
    if not lineups:
        raise HTTPException(
            status_code=404,
            detail="Lineup not released yet — try again closer to kickoff (~60 min before)."
        )

    # Build full-name + photo lookup: player_id → {firstname, lastname, photo}
    full_names: dict = {}
    for entry in players_resp.get("response", []):
        p = entry.get("player", {})
        full_names[p["id"]] = {
            "firstName": (p.get("firstname") or "").upper(),
            "lastName": (p.get("lastname") or p.get("name", "").split()[-1]).upper(),
            "photo": p.get("photo", ""),
        }

    # Find the team we want (home or away)
    team_name_lower = team_name.lower()
    team_data = next(
        (t for t in lineups if t["team"]["name"].lower() == team_name_lower),
        lineups[0]  # fallback to first team if name doesn't match exactly
    )

    coach = (team_data.get("coach") or {}).get("name", "").upper()
    flag = ""  # flag is already set in app state from the team picker

    def build_player(p_entry, is_starter: bool) -> dict:
        p = p_entry["player"]
        pid = p["id"]
        names = full_names.get(pid, {})
        # Fallback: split the abbreviated name if full name not in players response
        fallback_name = p.get("name", "")
        parts = fallback_name.split(". ", 1)
        first_fb = parts[0] if len(parts) > 1 else ""
        last_fb = parts[-1]
        return {
            "id": str(pid),
            "number": p.get("number") or 0,
            "firstName": names.get("firstName") or first_fb.upper(),
            "lastName": names.get("lastName") or last_fb.upper(),
            "position": _map_position(p.get("pos", "")),
            "photo": names.get("photo", ""),
            "clubLogo": "",
            "clubName": "",
            "notes": "",
            "isStarter": is_starter,
            # Keep clubCountry/clubSlug blank — logo scraping runs later
            "clubCountry": "",
            "clubSlug": "",
        }

    starters = [build_player(p, True) for p in team_data.get("startXI", [])]
    substitutes = [build_player(p, False) for p in team_data.get("substitutes", [])]

    return {
        "flag": flag,
        "coach": coach,
        "source": f"API-Football (fixture #{fixture_id})",
        "mode": "match",
        "starters": starters,
        "substitutes": substitutes,
    }


# Vercel / AWS Lambda entry point
handler = Mangum(app, lifespan="off")
