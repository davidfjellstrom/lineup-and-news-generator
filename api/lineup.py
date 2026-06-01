import os
import json
import re
import logging
from concurrent.futures import ThreadPoolExecutor

import anthropic
from fastapi import HTTPException

from photos import _af_get, _ascii_upper, _fetch_team_squad_af, _search_player_photo_af

log = logging.getLogger("lineup-api")


def _map_position(pos: str) -> str:
    return {"G": "GK", "D": "DEF", "M": "MID", "F": "FWD"}.get(pos, "MID")


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

    for iteration in range(12):
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
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
    match = re.search(r"\[[\s\S]*\]", text)
    if match:
        return json.loads(match.group())
    return json.loads(text.strip())


def _build_lineup_prompt(team: str, formation: str, mode: str) -> str:
    # Age, height, current club and photo are sourced from API-Football — not Claude.
    # Claude is responsible only for what structured APIs cannot provide.
    player_schema = """Each player has:
- number: official jersey number as registered with FIFA (integer)
- firstName: first name in UPPERCASE
- lastName: last name / surname in UPPERCASE
- position: one of GK, DEF, MID, FWD
- positionLabel: e.g. "GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "CF", "ST"
- foot: preferred foot in Swedish — "Hö" (right), "Vä" (left), or "Båda" (both)
- caps: number of official senior international appearances for this national team (integer, 0 if unknown)
- goals: number of senior international goals for this national team (integer, 0 if none)
- marketValue: market value in millions EUR from Transfermarkt (number, or null)"""

    json_shape = f"""Return ONLY a valid JSON object with these exact keys:
- flag: flag emoji for {team}'s country (e.g. "🇸🇪" for Sweden)
- coach: head coach full name in UPPERCASE
- fifaRanking: current FIFA world ranking (integer)
- avgAge: average age of all squad members listed (number, 1 decimal)
- squadValue: total squad market value in millions EUR from Transfermarkt (number)
- source: source name and URL (e.g. "FIFA.com – https://...")
- starters: array of exactly 11 starting players
- substitutes: array of ALL remaining registered squad members not in the starting XI

{player_schema}

No markdown fences, no explanation — pure JSON object."""

    if mode == "match":
        return f"""Today is June 2026. Find the OFFICIALLY RELEASED starting lineup for {team} in their next or most recent World Cup 2026 match.

Search UEFA.com, FIFA.com, the team's official federation site, and major outlets (BBC Sport, ESPN, Sky Sports) for the confirmed lineup released approximately 1 hour before kickoff.

Find the REAL officially assigned jersey numbers — do not invent them.

{json_shape}"""
    else:
        return f"""Today is June 2026. Find accurate, up-to-date information — do NOT rely on training data or cached knowledge.

STEP 1 — Official squad and jersey numbers: Search FIFA.com for {team}'s official World Cup 2026 squad registration. This is the authoritative source for jersey numbers and which players are in the squad.

STEP 2 — Player stats from Transfermarkt: Find {team}'s national team page on transfermarkt.com. This single page lists all squad players with preferred foot, international caps, international goals, and market value. Also read: total squad value, average age, and the team's FIFA world ranking.

STEP 3 — Likely starting XI: Based on {team}'s most recent matches and current squad fitness/availability, determine the most probable starting eleven.

{json_shape}"""


def _enrich_players_from_squad(players: list, squad_map: dict) -> list:
    """Apply reliable API-Football structured data onto players. Returns players not found in squad."""
    unmatched = []
    for p in players:
        key = _ascii_upper(p.get("lastName", ""))
        af = squad_map.get(key)
        if af:
            if af.get("age"):      p["age"]      = af["age"]
            if af.get("height"):   p["height"]   = af["height"]
            if af.get("photo"):    p["photo"]    = af["photo"]
            if af.get("clubName"): p["clubName"] = af["clubName"]
            if af.get("clubLogo"): p["clubLogo"] = af["clubLogo"]
        else:
            unmatched.append(p)
    return unmatched


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
            "lastName":  (p.get("lastname") or p.get("name", "").split()[-1]).upper(),
            "photo":     p.get("photo", ""),
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
            "id":           str(pid),
            "number":       p.get("number") or 0,
            "firstName":    names.get("firstName") or first_fb.upper(),
            "lastName":     names.get("lastName")  or last_fb.upper(),
            "position":     _map_position(p.get("pos", "")),
            "positionLabel": "",
            "photo":        names.get("photo", ""),
            "clubName":     "",
            "clubLogo":     "",
            "notes":        "",
            "isStarter":    is_starter,
            # Stats filled in by squad enrichment below
            "age": None, "height": None, "foot": None,
            "caps": None, "goals": None, "marketValue": None,
        }

    starters   = [build_player(p, True)  for p in team_data.get("startXI", [])]
    substitutes = [build_player(p, False) for p in team_data.get("substitutes", [])]

    return {
        "flag":       "",
        "coach":      coach,
        "source":     f"API-Football (fixture #{fixture_id})",
        "mode":       "match",
        "starters":   starters,
        "substitutes": substitutes,
    }


def fetch_lineup(
    team: str,
    formation: str,
    mode: str,
    fixture_id: int | None,
    client: anthropic.Anthropic,
) -> dict:
    """Core lineup logic. Called by the /api/lineup endpoint."""

    fetch_af = bool(os.environ.get("API_FOOTBALL_KEY"))

    # ── Match mode: confirmed lineup from API-Football ──────────────────────
    if mode == "match" and fixture_id:
        data = _lineup_from_api_football(fixture_id, team)
        all_players = data["starters"] + data["substitutes"]

        if fetch_af:
            # Enrich confirmed lineup with age, height, current club, photo from squad data
            log.info("[%s] Berikar bekräftad uppställning med AF-trupp…", team)
            squad_map = _fetch_team_squad_af(team)
            unmatched = _enrich_players_from_squad(all_players, squad_map)

            # Photo fallback for players not in squad map
            if unmatched:
                with ThreadPoolExecutor(max_workers=8) as ex:
                    fallback_photos = list(ex.map(
                        lambda p: _search_player_photo_af(p.get("firstName", ""), p.get("lastName", "")),
                        unmatched,
                    ))
                for p, photo in zip(unmatched, fallback_photos):
                    if photo:
                        p["photo"] = photo

        return data

    # ── Pre-match mode: Claude + API-Football in parallel ───────────────────
    prompt = _build_lineup_prompt(team, formation, mode)

    with ThreadPoolExecutor(max_workers=2) as ex:
        claude_future = ex.submit(run_with_search, client, prompt, 15, team)
        squad_future  = ex.submit(_fetch_team_squad_af, team) if fetch_af else None
        text      = claude_future.result()
        squad_map = squad_future.result() if squad_future else {}

    try:
        obj_match = re.search(r"\{[\s\S]*\}", text)
        data = json.loads(obj_match.group()) if obj_match else {"players": extract_json(text)}
    except json.JSONDecodeError:
        return {"players": [], "raw": text}

    data["mode"] = mode
    all_players = (data.get("starters") or []) + (data.get("substitutes") or data.get("players") or [])

    # Apply API-Football structured data (age, height, club, photo) — more reliable than Claude
    unmatched = _enrich_players_from_squad(all_players, squad_map)
    log.info("[%s] AF berikning: %d matchade, %d omatchade", team,
             len(all_players) - len(unmatched), len(unmatched))

    # Photo fallback for players not matched in squad map
    if fetch_af and unmatched:
        with ThreadPoolExecutor(max_workers=8) as ex:
            fallback_photos = list(ex.map(
                lambda p: _search_player_photo_af(p.get("firstName", ""), p.get("lastName", "")),
                unmatched,
            ))
        for p, photo in zip(unmatched, fallback_photos):
            if photo:
                p["photo"] = photo

    return data
