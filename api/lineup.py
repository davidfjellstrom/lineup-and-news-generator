import os
import json
import re
import logging
from concurrent.futures import ThreadPoolExecutor

import anthropic
from fastapi import HTTPException

from logos import get_club_logo_url
from photos import _af_get, _ascii_upper, _fetch_team_player_photos, _search_player_photo_af

log = logging.getLogger("lineup-api")


def _map_position(pos: str) -> str:
    return {"G": "GK", "D": "DEF", "M": "MID", "F": "FWD"}.get(pos, "MID")


def _map_position_af_squad(pos: str) -> str:
    """Map API-Football squad position strings (e.g. 'Goalkeeper') to GK/DEF/MID/FWD."""
    p = pos.lower()
    if "goal" in p:    return "GK"
    if "defend" in p:  return "DEF"
    if "mid" in p:     return "MID"
    return "FWD"


def run_with_search(
    client: anthropic.Anthropic,
    user_message: str,
    max_uses: int = 5,
    label: str = "",
) -> str:
    """Run a Claude conversation with web_search_20250305, handling the agentic tool-use loop."""
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": max_uses}]
    messages = [{"role": "user", "content": user_message}]
    prefix = f"[{label}] " if label else ""

    for iteration in range(8):
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            tools=tools,
            messages=messages,
        )

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
    """Extract and parse the first JSON array from text, falling back to parsing the whole string.

    Raises json.JSONDecodeError if no valid JSON is found.
    """
    match = re.search(r"\[[\s\S]*\]", text)
    if match:
        return json.loads(match.group())
    return json.loads(text.strip())


# ─── API-Football squad fetch ─────────────────────────────────────────────────

def _fetch_squad_af(team_name: str) -> list[dict] | None:
    """
    Fetch the registered WC 2026 squad for a team from API-Football.

    Returns a list of base player dicts (name, position, age, photo, number),
    or None if the API key is missing, the team is not found, or the squad
    has fewer than 15 players (indicating incomplete registration).
    """
    if not os.environ.get("API_FOOTBALL_KEY"):
        return None
    try:
        teams_resp = _af_get("teams", {"name": team_name, "league": 1, "season": 2026})
        teams = teams_resp.get("response", [])
        if not teams:
            # Retry without league filter — some teams may not be registered yet
            teams_resp = _af_get("teams", {"name": team_name, "type": "National"})
            teams = teams_resp.get("response", [])
        if not teams:
            log.info("[%s] AF: lag inte hittat, hoppar över hybrid-flödet", team_name)
            return None

        team_id = teams[0]["team"]["id"]
        squad_resp = _af_get("players/squads", {"team": team_id})
        squad_data = squad_resp.get("response", [])
        if not squad_data:
            return None

        players = squad_data[0].get("players", [])
        if len(players) < 15:
            log.info("[%s] AF: för få spelare (%d) — troligen ej registrerad ännu", team_name, len(players))
            return None

        def parse_name(full: str) -> tuple[str, str]:
            # Use plain .upper() — not _ascii_upper() — so that ø/æ/å are preserved
            # for display. _ascii_upper() is only for lookup-key normalisation.
            parts = full.strip().split(" ", 1)
            first = parts[0].upper() if len(parts) > 1 else ""
            last = parts[-1].upper()
            return first, last

        result = []
        for p in players:
            first, last = parse_name(p.get("name", ""))
            result.append({
                "firstName": first,
                "lastName": last,
                "position": _map_position_af_squad(p.get("position", "")),
                "age": p.get("age"),
                "photo": p.get("photo", ""),
                "number": p.get("number"),
            })

        log.info("[%s] AF squad: %d spelare hämtade", team_name, len(result))
        return result
    except Exception as e:
        log.info("[%s] AF squad-hämtning misslyckades: %s", team_name, e)
        return None


# ─── Prompts ──────────────────────────────────────────────────────────────────

_TRUSTED_SOURCES = """TRUSTED SOURCES — only use information from:
- FIFA.com — official squad registrations, jersey numbers, FIFA rankings
- Transfermarkt (transfermarkt.com) — market values, caps, goals, player stats
- Sky Sports (skysports.com) — pre-match team news, injury updates, probable XIs
- BBC Sport (bbc.com/sport) — match news and lineup reporting
- ESPN (espn.com) — international football coverage
- Official national federation websites (e.g. fa.com, fff.fr, dfb.de) — primary source for squad announcements and press conferences

Do NOT use Wikipedia, fan wikis, betting sites, or any source published before January 1, 2026."""


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
- starters: array of exactly 11 starting players — MUST include exactly 1 GK
- substitutes: array of ALL remaining registered squad members not in the starting XI (typically 12–15 players for a 23–26 man squad — include everyone)

{player_schema}

No markdown fences, no explanation — pure JSON object."""

    if mode == "match":
        return f"""Today is June 2026. Search for the OFFICIALLY RELEASED starting lineup for {team} in their next or most recent World Cup 2026 match.

{_TRUSTED_SOURCES}

Search FIFA.com, the team's official federation site, and major outlets (BBC Sport, ESPN, Sky Sports) for the confirmed lineup that was released approximately 1 hour before kickoff.

Find the REAL officially assigned jersey numbers — do not invent sequential numbers.

For each player's clubName: verify their CURRENT club as of June 2026 — players may have transferred since last season.

{json_shape}"""
    else:
        return f"""Today is June 2026. You must find accurate, up-to-date information — do not rely on training data or cached knowledge.

{_TRUSTED_SOURCES}

STEP 1 — Squad list: Search FIFA.com for {team}'s official World Cup 2026 squad registration. This is the authoritative source for jersey numbers and selected players.

STEP 2 — Player stats: Search Transfermarkt's {team} national team page for each player's age, height, preferred foot, market value, international caps and goals. Also get the team's total squad value, average age, and FIFA world ranking.

STEP 3 — Current clubs (CRITICAL): For every single player, you MUST verify their current club as of June 2026 by searching "[player name] club 2026" or "[player name] transfer 2026". Players transfer frequently — the January 2026 and summer 2025 windows have both passed. Never assume a player is still at the club they were at in 2024 or earlier. If a player's current club is unclear, search explicitly before filling in clubName.

STEP 4 — Likely XI: Based on recent {team} matches and current squad fitness, determine the most probable starting eleven.

{json_shape}"""


def _build_enrichment_prompt(team: str, formation: str, squad: list[dict]) -> str:
    """
    Prompt for the hybrid path: the squad is already known from API-Football.
    Claude's job is to enrich with stats and select the starting XI — not to find players.
    """
    squad_lines = "\n".join(
        f"- {p['firstName']} {p['lastName']} ({p['position']})"
        + (f", #{p['number']}" if p.get("number") else "")
        for p in squad
    )

    player_schema = """Each player has:
- lastName: UPPERCASE — use the exact spelling from the squad list above (preserve special characters like Ø, Æ, Å)
- firstName: full first name in UPPERCASE — never use initials or abbreviations (if the squad list shows "E." expand it to the full name, e.g. "ERLING")
- number: jersey number (integer)
- position: GK/DEF/MID/FWD
- positionLabel: specific role, e.g. "CB", "LB", "LW", "CDM", "CM", "CAM", "ST"
- age: integer
- height: integer (cm)
- foot: preferred foot in Swedish — "Hö" (right), "Vä" (left), or "Båda" (both)
- caps: senior international appearances for this national team (integer)
- goals: senior international goals for this national team (integer)
- marketValue: market value in millions EUR from Transfermarkt (float or null)
- clubName: current club in English
- clubCountry: lowercase country where the club plays
- clubSlug: club slug on football-logos.cc (lowercase, hyphens, no accents)"""

    return f"""Today is June 2026.

{team}'s WC 2026 squad is already confirmed — do NOT search for who is in the squad.

{_TRUSTED_SOURCES}

CONFIRMED SQUAD ({len(squad)} players):
{squad_lines}

Your tasks:

STEP 1 — Transfermarkt stats: Search Transfermarkt's {team} national team page for market values, caps, goals, height, and preferred foot for each player. Also get total squad value, average age, and FIFA world ranking.

STEP 2 — Current clubs (CRITICAL): For every single player, you MUST verify their current club as of June 2026 by searching "[player name] club 2026" or "[player name] transfer 2026" on BBC Sport, Sky Sports, or ESPN. Players transfer frequently — the January 2026 and summer 2025 windows have both passed. Never assume a player is still at the club they were at in 2024 or earlier.

STEP 3 — Starting XI: Based on recent {team} performances reported on Sky Sports, BBC Sport, or ESPN, select the most probable {formation} starting eleven from this squad.

Return ONLY a valid JSON object:
- flag: flag emoji for {team}
- coach: head coach full name UPPERCASE
- fifaRanking: integer
- avgAge: float (1 decimal)
- squadValue: float (millions EUR)
- source: source name and URL
- starters: array of exactly 11 players — MUST include exactly 1 GK
- substitutes: array of ALL remaining squad members (include everyone not in starters)

{player_schema}

No markdown fences, no explanation — pure JSON object."""


# ─── Merge ────────────────────────────────────────────────────────────────────

def _initial_last_key(first: str, last: str) -> str:
    """Build a collision-resistant lookup key using first initial + last name.

    Examples: ('VIKTOR', 'JOHANSSON') → 'V_JOHANSSON'
              ('H.', 'JOHANSSON')     → 'H_JOHANSSON'
    Falls back to last name only when first name is absent.
    """
    initial = first.strip(".")[0] if first.strip(".") else ""
    return f"{initial}_{last}" if initial else last


def _name_tokens(first: str, last: str) -> frozenset[str]:
    """Return meaningful name tokens (≥4 chars) from a player's full name.

    Used for fuzzy deduplication of single-name players (e.g. Ederson, Vinicius)
    where full legal names (Ederson Moraes) and nicknames diverge between sources.
    """
    return frozenset(
        t for t in (_ascii_upper(first) + " " + _ascii_upper(last)).split()
        if len(t) >= 4
    )


def _merge_squad_with_enrichment(af_squad: list[dict], claude_data: dict) -> dict:
    """
    Combine API-Football squad data (authoritative player list and photos)
    with Claude's enrichment (stats, position labels, starting XI selection).

    Matching strategy (in order of priority):
    1. first-initial + last name  ('V_JOHANSSON') — handles same-surname collisions
    2. last name only             ('JOHANSSON')   — unambiguous surnames
    3. AF first name == Claude last name          — single-name players ('EDERSON')

    AF players that Claude missed are included as substitutes using token-based
    deduplication to catch name format mismatches (e.g. 'Ederson' vs 'Ederson Moraes').
    """
    # Build lookup tables
    af_by_initial_last: dict[str, dict] = {
        _initial_last_key(_ascii_upper(p.get("firstName", "")), _ascii_upper(p["lastName"])): p
        for p in af_squad
    }
    af_by_last: dict[str, dict | None] = {}
    for p in af_squad:
        last = _ascii_upper(p["lastName"])
        af_by_last[last] = None if last in af_by_last else p

    # Extra lookup: AF first name as key — catches single-name players where
    # Claude uses the nickname as lastName (e.g. lastName="EDERSON", AF firstName="EDERSON")
    af_by_first: dict[str, dict] = {}
    for p in af_squad:
        first = _ascii_upper(p.get("firstName", ""))
        if first and first not in af_by_first:
            af_by_first[first] = p

    def _find_af(claude_player: dict) -> dict:
        last  = _ascii_upper(claude_player.get("lastName", ""))
        first = _ascii_upper(claude_player.get("firstName", ""))
        return (
            af_by_initial_last.get(_initial_last_key(first, last))
            or (af_by_last.get(last) or {})
            or af_by_first.get(last)   # e.g. Claude lastName "EDERSON" == AF firstName "EDERSON"
            or af_by_first.get(first)
            or {}
        )

    def build_player(claude_player: dict, is_starter: bool) -> dict:
        af = _find_af(claude_player)
        # Prefer Claude's firstName: AF /squads returns abbreviated initials like "E."
        # Claude has been instructed to expand these to full names.
        af_first = af.get("firstName", "")
        claude_first = claude_player.get("firstName", "")
        is_af_initial = len(af_first.rstrip(".")) <= 1
        first_name = claude_first if claude_first and (is_af_initial or not af_first) else af_first or claude_first
        return {
            "firstName": first_name,
            "lastName":  af.get("lastName")  or claude_player.get("lastName", ""),
            "number":    claude_player.get("number") or af.get("number") or 0,
            "position":  af.get("position") or claude_player.get("position", "MID"),
            "positionLabel": claude_player.get("positionLabel", ""),
            # Photo: AF provides a current-season photo; Claude may have one too
            "photo": af.get("photo") or claude_player.get("photo", ""),
            # Stats: all from Claude (AF squad endpoint has no national team stats)
            "age":         claude_player.get("age") or af.get("age"),
            "height":      claude_player.get("height"),
            "foot":        claude_player.get("foot"),
            "caps":        claude_player.get("caps"),
            "goals":       claude_player.get("goals"),
            "marketValue": claude_player.get("marketValue"),
            # Club: Claude is more reliable here (verifies via web search)
            "clubName":    claude_player.get("clubName", ""),
            "clubCountry": claude_player.get("clubCountry", ""),
            "clubSlug":    claude_player.get("clubSlug", ""),
            "isStarter": is_starter,
            "notes": "",
        }

    starters    = [build_player(p, True)  for p in claude_data.get("starters", [])]
    substitutes = [build_player(p, False) for p in claude_data.get("substitutes", [])]

    # Add AF players that Claude missed so no squad member is lost.
    # Use token-based matching to handle single-name players (e.g. "Ederson Moraes"
    # in AF vs "Ederson" in Claude) where initial+last keys would diverge.
    accounted_tokens: set[str] = set()
    for p in starters + substitutes:
        accounted_tokens |= _name_tokens(p.get("firstName", ""), p.get("lastName", ""))

    for af_p in af_squad:
        af_tokens = _name_tokens(af_p.get("firstName", ""), af_p["lastName"])
        if af_tokens & accounted_tokens:
            continue  # At least one name token matched — player already present
            log.info("  + AF-spelare saknas i Claude-svar, läggs till: %s", af_p["lastName"])
            substitutes.append({
                "firstName":   af_p["firstName"],
                "lastName":    af_p["lastName"],
                "number":      af_p.get("number") or 0,
                "position":    af_p["position"],
                "positionLabel": "",
                "photo":       af_p.get("photo", ""),
                "age":         af_p.get("age"),
                "height":      None,
                "foot":        None,
                "caps":        None,
                "goals":       None,
                "marketValue": None,
                "clubName":    "",
                "clubCountry": "",
                "clubSlug":    "",
                "isStarter":   False,
                "notes":       "",
            })

    # Safety net: if Claude forgot a GK, promote the first GK from substitutes
    if not any(p.get("position") == "GK" for p in starters):
        for i, p in enumerate(substitutes):
            if p.get("position") == "GK":
                p["isStarter"] = True
                starters.append(substitutes.pop(i))
                log.info("  ⚠ Ingen GK i startelvans — lade till %s från bänken", p.get("lastName"))
                break

    return {
        "flag":        claude_data.get("flag", ""),
        "coach":       claude_data.get("coach", ""),
        "fifaRanking": claude_data.get("fifaRanking"),
        "avgAge":      claude_data.get("avgAge"),
        "squadValue":  claude_data.get("squadValue"),
        "source":      claude_data.get("source", "API-Football + Claude"),
        "mode":        "pre-match",
        "starters":    starters,
        "substitutes": substitutes,
    }


# ─── Logo & photo enrichment ──────────────────────────────────────────────────

def _enrich_with_logos_and_photos(team: str, all_players: list[dict]) -> None:
    """
    Fetch club logo URLs and player photos, mutating all_players in place.
    Photos are skipped if API_FOOTBALL_KEY is not set.
    """
    unique_pairs = list({
        (p.get("clubCountry", ""), p.get("clubSlug", ""))
        for p in all_players if p.get("clubSlug")
    })
    fetch_photos = bool(os.environ.get("API_FOOTBALL_KEY"))
    log.info(
        "[%s] Skrapar logotyper för %d klubbar%s…",
        team, len(unique_pairs),
        f" + bilder för {len(all_players)} spelare" if fetch_photos else "",
    )

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
            log.info(
                "  ✗ %s (%s/%s) — inte hittad",
                p.get("clubName"), p.get("clubCountry", "?"), p.get("clubSlug", "?"),
            )

    unmatched = []
    for p in all_players:
        first = _ascii_upper(p.get("firstName", ""))
        last = _ascii_upper(p.get("lastName", ""))
        full_key = f"{first}_{last}" if first else last
        photo = photo_map.get(full_key) or photo_map.get(last, "")
        if photo:
            p["photo"] = photo
        else:
            unmatched.append(p)

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


# ─── AF-only degraded result ──────────────────────────────────────────────────

def _af_squad_as_basic_result(af_squad: list[dict], formation: str) -> dict:
    """
    Build a minimal lineup result from the AF squad alone, without Claude enrichment.
    Used when Claude fails — the user gets players with photos but no stats.

    Starters are selected by position to match the requested formation.
    """
    def to_player(p: dict, is_starter: bool) -> dict:
        return {
            "firstName":   p["firstName"],
            "lastName":    p["lastName"],
            "number":      p.get("number") or 0,
            "position":    p["position"],
            "positionLabel": "",
            "photo":       p.get("photo", ""),
            "age":         p.get("age"),
            "height":      None,
            "foot":        None,
            "caps":        None,
            "goals":       None,
            "marketValue": None,
            "clubName":    "",
            "clubCountry": "",
            "clubSlug":    "",
            "isStarter":   is_starter,
            "notes":       "",
        }

    groups: dict[str, list] = {"GK": [], "DEF": [], "MID": [], "FWD": []}
    for p in af_squad:
        groups.get(p["position"], groups["MID"]).append(p)

    try:
        parts = [int(x) for x in formation.split("-")]
        slots = {"GK": 1, "DEF": parts[0], "MID": parts[1], "FWD": parts[2]}
    except (ValueError, IndexError):
        slots = {"GK": 1, "DEF": 4, "MID": 3, "FWD": 3}

    starters = []
    for pos, count in slots.items():
        starters.extend(groups[pos][:count])

    starter_keys = {
        _initial_last_key(_ascii_upper(p.get("firstName", "")), _ascii_upper(p["lastName"]))
        for p in starters
    }
    substitutes = [
        p for p in af_squad
        if _initial_last_key(_ascii_upper(p.get("firstName", "")), _ascii_upper(p["lastName"]))
        not in starter_keys
    ]

    return {
        "flag":        "",
        "coach":       "",
        "fifaRanking": None,
        "avgAge":      None,
        "squadValue":  None,
        "source":      "API-Football (AI-berikande misslyckades — statistik saknas)",
        "mode":        "pre-match",
        "starters":    [to_player(p, True)  for p in starters],
        "substitutes": [to_player(p, False) for p in substitutes],
    }


# ─── Match-mode lineup from API-Football ──────────────────────────────────────

def _lineup_from_api_football(fixture_id: int, team_name: str) -> dict:
    """Fetch confirmed lineup from API-Football for a given fixture."""
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_lineups = ex.submit(_af_get, "fixtures/lineups", {"fixture": fixture_id})
        f_players = ex.submit(_af_get, "players", {"fixture": fixture_id})
        lineups_resp = f_lineups.result()
        players_resp = f_players.result()

    lineups = lineups_resp.get("response", [])
    if not lineups:
        raise HTTPException(
            status_code=404,
            detail="Lineup not released yet — try again closer to kickoff (~60 min before).",
        )

    full_names: dict = {}
    for entry in players_resp.get("response", []):
        p = entry.get("player", {})
        full_names[p["id"]] = {
            "firstName": (p.get("firstname") or "").upper(),
            "lastName": (p.get("lastname") or p.get("name", "").split()[-1]).upper(),
            "photo": p.get("photo", ""),
        }

    team_name_lower = team_name.lower()
    team_data = next(
        (t for t in lineups if t["team"]["name"].lower() == team_name_lower),
        lineups[0],
    )
    coach = (team_data.get("coach") or {}).get("name", "").upper()

    def build_player(p_entry, is_starter: bool) -> dict:
        p = p_entry["player"]
        pid = p["id"]
        names = full_names.get(pid, {})
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
            "clubCountry": "",
            "clubSlug": "",
        }

    starters = [build_player(p, True) for p in team_data.get("startXI", [])]
    substitutes = [build_player(p, False) for p in team_data.get("substitutes", [])]

    return {
        "flag": "",
        "coach": coach,
        "source": f"API-Football (fixture #{fixture_id})",
        "mode": "match",
        "starters": starters,
        "substitutes": substitutes,
    }


# ─── Main entry point ─────────────────────────────────────────────────────────

def fetch_lineup(
    team: str,
    formation: str,
    mode: str,
    fixture_id: int | None,
    client: anthropic.Anthropic,
) -> dict:
    """Core lineup logic. Called by the /api/lineup endpoint."""

    # ── Match mode with confirmed fixture ────────────────────────────────────
    if mode == "match" and fixture_id:
        data = _lineup_from_api_football(fixture_id, team)
        all_players = data["starters"] + data["substitutes"]
        unique_pairs = list({
            (p.get("clubCountry", ""), p.get("clubSlug", ""))
            for p in all_players if p.get("clubSlug")
        })
        if unique_pairs:
            log.info("[%s] Skrapar logotyper för %d klubbar…", team, len(unique_pairs))
            with ThreadPoolExecutor(max_workers=10) as ex:
                urls = list(ex.map(lambda pair: get_club_logo_url(*pair), unique_pairs))
            logo_map = dict(zip(unique_pairs, urls))
            for p in all_players:
                key = (p.get("clubCountry", ""), p.get("clubSlug", ""))
                p["clubLogoUrl"] = logo_map.get(key, "")
        return data

    # ── Pre-match: try hybrid (API-Football squad + Claude enrichment) ────────
    af_squad = _fetch_squad_af(team)
    if af_squad:
        log.info("[%s] Hybrid-flöde: AF-trupp (%d spelare) + Claude-berikande", team, len(af_squad))
        prompt = _build_enrichment_prompt(team, formation, af_squad)
        text = run_with_search(client, prompt, max_uses=6, label=team)
        try:
            obj_match = re.search(r"\{[\s\S]*\}", text)
            claude_data = json.loads(obj_match.group()) if obj_match else {}
            if claude_data.get("starters"):
                data = _merge_squad_with_enrichment(af_squad, claude_data)
                data["mode"] = mode
                _enrich_with_logos_and_photos(team, data["starters"] + data["substitutes"])
                return data
            log.info("[%s] Claude-svar saknar starters", team)
        except (json.JSONDecodeError, AttributeError) as e:
            log.info("[%s] Hybrid-parsning misslyckades: %s", team, e)

        # Claude enrichment failed but we have the AF squad — return it as a
        # degraded result rather than running a second expensive Claude loop.
        log.info("[%s] Returnerar AF-trupp utan AI-berikande", team)
        return _af_squad_as_basic_result(af_squad, formation)

    # ── Fallback: Claude-only (only reached when AF returned no squad) ────────
    prompt = _build_lineup_prompt(team, formation, mode)
    text = run_with_search(client, prompt, max_uses=8, label=team)

    try:
        obj_match = re.search(r"\{[\s\S]*\}", text)
        data = json.loads(obj_match.group()) if obj_match else {"players": extract_json(text)}
    except json.JSONDecodeError:
        return {"players": [], "raw": text}

    data["mode"] = mode
    all_players = (data.get("starters") or []) + (data.get("substitutes") or data.get("players") or [])
    _enrich_with_logos_and_photos(team, all_players)
    return data
