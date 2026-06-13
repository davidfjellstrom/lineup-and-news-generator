"""Fetch national team squad data from Transfermarkt for validation."""

from __future__ import annotations

import html as html_lib
import logging
import re
import urllib.parse
import urllib.request

from photos import _ascii_upper

log = logging.getLogger("lineup-api")

_TM_BASE = "https://www.transfermarkt.com"
_TM_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
_YOUTH_RE = re.compile(r"\bU\d{1,2}\b|Olympia|Olympic|Beach", re.I)


# Keys must be lowercase — looked up case-insensitively, since the frontend
# sends team names in uppercase ('BOSNIA AND HERZEGOVINA').
_TEAM_SEARCH_ALIASES: dict[str, str] = {
    "türkiye": "Turkey",
    "united states": "United States",
    "ivory coast": "Ivory Coast",
    "dr congo": "DR Congo",
    "bosnia and herzegovina": "Bosnia-Herzegovina",
    "south korea": "Korea Republic",
    "czech republic": "Czech Republic",
}


def _fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers=_TM_HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _parse_eur_value(text: str) -> float | None:
    """Parse Transfermarkt market values like '€12.00m', '€175k', '€1.11bn'."""
    cleaned = text.replace("\xa0", " ").strip()
    m = re.search(r"€\s*([\d.,]+)\s*([kmbn]+)?", cleaned, re.I)
    if not m:
        return None
    num = float(m.group(1).replace(",", ""))
    suffix = (m.group(2) or "m").lower()
    if suffix.startswith("k"):
        return round(num / 1000, 3)
    if suffix.startswith("b"):
        return round(num * 1000, 2)
    return round(num, 2)


def _parse_height_cm(text: str) -> int | None:
    m = re.search(r"(\d)[,.](\d{2})m", text)
    if not m:
        return None
    return int(m.group(1)) * 100 + int(m.group(2))


def _parse_foot(text: str) -> str | None:
    foot = text.strip().lower()
    return {"right": "Hö", "left": "Vä", "both": "Båda"}.get(foot)


def _parse_int_or_dash(text: str) -> int | None:
    text = text.strip()
    if not text or text == "-":
        return None
    try:
        return int(text)
    except ValueError:
        return None





def _map_tm_position(label: str) -> str:
    """Map Transfermarkt position label to GK/DEF/MID/FWD."""
    p = label.strip().lower()
    if "goal" in p:
        return "GK"
    if any(x in p for x in ("defend", "back", "sweeper")):
        return "DEF"
    if any(x in p for x in ("mid", "wing", "half")):
        return "MID"
    if any(x in p for x in ("forward", "striker", "attack", "winger")):
        return "FWD"
    return "MID"


def _split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split()
    if len(parts) == 1:
        return "", parts[0].upper()
    return " ".join(parts[:-1]).upper(), parts[-1].upper()


def _is_non_senior_tm(label: str) -> bool:
    """True for TM results that can never be a senior national team entry."""
    label_l = label.lower()
    return bool(_YOUTH_RE.search(label)) or "amateur" in label_l or "club" in label_l


def resolve_team(team_name: str) -> tuple[str, int]:
    """Return Transfermarkt slug and verein ID for a senior national team.

    Matching runs in two separate passes to avoid false containment positives:
    e.g. 'Amateur club (Japan)' contains 'japan' but must not win over 'Japan'.
    """
    query = _TEAM_SEARCH_ALIASES.get(team_name.lower(), team_name)
    url = f"{_TM_BASE}/schnellsuche/ergebnis/schnellsuche?query={urllib.parse.quote(query)}"
    html = _fetch_html(url)
    candidates = re.findall(
        r'href="/([^/]+)/startseite/verein/(\d+)"[^>]*>([^<]+)</a>',
        html,
    )
    team_lower = team_name.lower()
    query_lower = query.lower()

    # Pass 1: exact label match (case-insensitive).
    for slug, verein_id, label in candidates:
        if _is_non_senior_tm(label):
            continue
        if label.strip().lower() in {team_lower, query_lower}:
            return slug, int(verein_id)

    # Pass 2: containment match — only after no exact match found.
    for slug, verein_id, label in candidates:
        if _is_non_senior_tm(label):
            continue
        label_lower = label.strip().lower()
        if team_lower in label_lower or query_lower in label_lower:
            return slug, int(verein_id)

    # Pass 3: first plausible-looking result (last resort).
    for slug, verein_id, label in candidates:
        if _is_non_senior_tm(label):
            continue
        if "goa" in slug:
            continue
        return slug, int(verein_id)

    raise LookupError(f"Transfermarkt team not found for '{team_name}'")


def _parse_team_meta(html: str) -> dict:
    squad_value = None
    m = re.search(
        r'data-header__market-value-wrapper"><span class="waehrung">€</span>([\d.]+)<span class="waehrung">([mkbn]+)</span>',
        html,
        re.I,
    )
    if m:
        squad_value = _parse_eur_value(f"€{m.group(1)}{m.group(2)}")

    avg_age = None
    m = re.search(
        r'Average age:\s*<span[^>]*>\s*([\d.]+)\s*</span>',
        html,
        re.I,
    )
    if m:
        avg_age = float(m.group(1))

    fifa_rank = None
    m = re.search(r"Pos\s+(\d+)", html)
    if m:
        fifa_rank = int(m.group(1))

    coach = None
    m = re.search(r'data-header__label">Coach:\s*<span[^>]*>\s*([^<]+?)\s*</span>', html, re.I)
    if m:
        coach = m.group(1).strip().upper()

    return {
        "squadValue": squad_value,
        "avgAge": avg_age,
        "fifaRanking": fifa_rank,
        "coach": coach,
    }


def _parse_squad_table(html: str) -> list[dict]:
    start = html.find('<table class="items">')
    if start == -1:
        return []
    end = html.find("</tbody>", start)
    table = html[start:end]
    rows = re.split(r'(?=<tr class="(?:odd|even)">)', table)

    players: list[dict] = []
    for row in rows:
        num_m = re.search(r"rn_nummer>(\d+)", row)
        name_m = re.search(
            r'class="hauptlink">\s*<a[^>]+>\s*((?:[^<]|<(?!\/a>))+?)\s*</a>',
            row,
        )
        if name_m:
            full_name_raw = re.sub(r"<[^>]+>", "", name_m.group(1))
        else:
            full_name_raw = ""
        age_m = re.search(r"\((\d+)\)</td>", row)
        club_m = re.search(
            r'title="([^"]+)" href="/([^"/]+)/startseite/verein/(\d+)"',
            row,
        )
        mv_m = re.search(r'rechts hauptlink"><a[^>]*>([^<]+)</a>', row)
        # num_m is optional — some national team pages (e.g. Asian federations)
        # omit jersey numbers; skip only when name or age is missing.
        if not (name_m and age_m and full_name_raw.strip()):
            continue

        # Height, foot, caps, goals appear in order after the club cell.
        tail = row.split(club_m.group(0), 1)[-1] if club_m else row
        z_cells = re.findall(r'<td class="zentriert">([^<]*)</td>', tail)
        height = _parse_height_cm(z_cells[0]) if len(z_cells) > 0 else None
        foot = _parse_foot(z_cells[1]) if len(z_cells) > 1 else None
        caps = _parse_int_or_dash(z_cells[2]) if len(z_cells) > 2 else None
        goals = _parse_int_or_dash(z_cells[3]) if len(z_cells) > 3 else None

        full_name = html_lib.unescape(re.sub(r"\s+", " ", full_name_raw)).strip()
        first, last = _split_name(full_name)
        pos_m = re.search(r"</tr>\s*<tr>\s*<td>\s*([^<]+?)\s*</td>", row, re.DOTALL)
        position = _map_tm_position(pos_m.group(1)) if pos_m else "MID"
        players.append({
            "number": int(num_m.group(1)) if num_m else 0,
            "firstName": first,
            "lastName": last,
            "fullName": full_name,
            "position": position,
            "age": int(age_m.group(1)),
            "clubName": html_lib.unescape(club_m.group(1).strip()) if club_m else "",
            "clubTmId": int(club_m.group(3)) if club_m else None,
            "clubLogoUrl": f"https://tmssl.akamaized.net/images/wappen/big/{club_m.group(3)}.png" if club_m else "",
            "height": height,
            "foot": foot,
            "caps": caps,
            "goals": goals if goals is not None else 0,
            "marketValue": _parse_eur_value(mv_m.group(1)) if mv_m else None,
        })

    return players


def fetch_squad(team_name: str, season: int = 2026) -> dict:
    """Fetch squad list and team metadata from Transfermarkt."""
    slug, verein_id = resolve_team(team_name)
    url = f"{_TM_BASE}/{slug}/kader/verein/{verein_id}/saison_id/{season}/plus/1"
    log.info("[TM] Hämtar %s från %s", team_name, url)
    html = _fetch_html(url)
    players = _parse_squad_table(html)
    if not players:
        raise LookupError(f"No Transfermarkt squad rows parsed for '{team_name}'")

    meta = _parse_team_meta(html)
    return {
        "team": team_name,
        "slug": slug,
        "vereinId": verein_id,
        "season": season,
        "sourceUrl": url,
        **meta,
        "players": players,
    }


def player_lookup_key(first: str, last: str) -> str:
    initial = first.strip(".")[0] if first.strip(".") else ""
    last_u = _ascii_upper(last)
    return f"{initial}_{last_u}" if initial else last_u


def index_players(players: list[dict]) -> dict:
    """Build lookup dicts keyed by jersey number, initial+last, and last name."""
    by_key: dict[str, dict | None] = {}
    by_last: dict[str, dict | None] = {}
    by_number: dict[int, dict | None] = {}
    for p in players:
        key = player_lookup_key(p.get("firstName", ""), p.get("lastName", ""))
        by_key[key] = None if key in by_key else p
        last = _ascii_upper(p.get("lastName", ""))
        by_last[last] = None if last in by_last else p
        num = p.get("number")
        if num:
            by_number[num] = None if num in by_number else p
    return {"by_key": by_key, "by_last": by_last, "by_number": by_number}


def match_player(gen: dict, tm_index: dict) -> dict | None:
    """Match a lineup-generator player to Transfermarkt data."""
    num = gen.get("number")
    if num:
        num_hit = tm_index["by_number"].get(num)
        if num_hit is not None:
            return num_hit

    first = _ascii_upper(gen.get("firstName", ""))
    last = _ascii_upper(gen.get("lastName", ""))
    key = player_lookup_key(first, last)
    if key in tm_index["by_key"]:
        key_hit = tm_index["by_key"][key]
        if key_hit is not None:
            return key_hit
    last_hit = tm_index["by_last"].get(last)
    if last_hit is not None:
        return last_hit

    # Token overlap — only when exactly one candidate matches (avoids Danilo/Ederson collisions).
    gen_tokens = {
        t for t in (first + " " + last).split()
        if len(t) >= 4
    }
    if not gen_tokens:
        return None
    token_hits = []
    for p in tm_index["by_key"].values():
        if p is None:
            continue
        tm_tokens = {
            t for t in (_ascii_upper(p.get("firstName", "")) + " " + _ascii_upper(p.get("lastName", ""))).split()
            if len(t) >= 4
        }
        if gen_tokens & tm_tokens:
            token_hits.append(p)
    return token_hits[0] if len(token_hits) == 1 else None


def _norm_club(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def compare_field(field: str, gen_val, tm_val) -> dict:
    """Compare one field and return match metadata."""
    if gen_val is None and tm_val is None:
        return {"field": field, "status": "both_missing", "gen": gen_val, "tm": tm_val}

    if gen_val is None or tm_val is None:
        return {"field": field, "status": "missing", "gen": gen_val, "tm": tm_val}

    if field == "marketValue":
        if tm_val == 0:
            status = "match" if gen_val == 0 else "mismatch"
        else:
            diff_pct = abs(gen_val - tm_val) / tm_val * 100
            status = "match" if diff_pct <= 10 else "mismatch"
        return {"field": field, "status": status, "gen": gen_val, "tm": tm_val}

    if field == "clubName":
        g = _norm_club(str(gen_val))
        t = _norm_club(str(tm_val))
        status = "match" if g == t or g in t or t in g else "mismatch"
        return {"field": field, "status": status, "gen": gen_val, "tm": tm_val}

    if field in {"caps", "goals", "age", "height", "number"}:
        status = "match" if gen_val == tm_val else "mismatch"
        return {"field": field, "status": status, "gen": gen_val, "tm": tm_val}

    if field == "foot":
        status = "match" if gen_val == tm_val else "mismatch"
        return {"field": field, "status": status, "gen": gen_val, "tm": tm_val}

    status = "match" if gen_val == tm_val else "mismatch"
    return {"field": field, "status": status, "gen": gen_val, "tm": tm_val}


_TM_PLAYER_STAT_FIELDS = ("age", "height", "foot", "caps", "goals", "marketValue")
_TM_PLAYER_CLUB_FIELDS = ("clubName", "clubLogoUrl")
_TM_TEAM_META_FIELDS = ("squadValue", "avgAge", "fifaRanking")


MIN_SQUAD_SIZE = 15


def squad_base_from_tm(tm_data: dict) -> list[dict]:
    """
    Convert a TM squad payload to API-Football-shaped base dicts for the hybrid merge.
    Returns an empty list when the TM squad is too small to be a full national team roster.
    """
    players = tm_data.get("players", [])
    if len(players) < MIN_SQUAD_SIZE:
        return []
    return [
        {
            "firstName": p.get("firstName", ""),
            "lastName": p.get("lastName", ""),
            "position": p.get("position", "MID"),
            "age": p.get("age"),
            "photo": "",
            "number": p.get("number"),
        }
        for p in players
    ]


def fetch_squad_safe(team_name: str, season: int = 2026) -> dict | None:
    """Fetch TM squad data, returning None on failure (no network cache on serverless)."""
    try:
        return fetch_squad(team_name, season=season)
    except Exception as e:
        log.warning("[TM] Squad fetch failed for %s: %s", team_name, e)
        return None


def apply_tm_stats(lineup_data: dict, tm_data: dict) -> dict:
    """Overlay Transfermarkt stats, club data, and team meta onto a lineup result (in place)."""
    tm_index = index_players(tm_data["players"])
    all_players = (lineup_data.get("starters") or []) + (lineup_data.get("substitutes") or [])

    matched = 0
    for p in all_players:
        tm_p = match_player(p, tm_index)
        if not tm_p:
            continue
        matched += 1
        for field in _TM_PLAYER_STAT_FIELDS + _TM_PLAYER_CLUB_FIELDS:
            tm_val = tm_p.get(field)
            if tm_val is not None and tm_val != "":
                p[field] = tm_val

    for field in _TM_TEAM_META_FIELDS:
        tm_val = tm_data.get(field)
        if tm_val is not None:
            lineup_data[field] = tm_val

    if tm_data.get("coach"):
        lineup_data["coach"] = tm_data["coach"]

    log.info(
        "[TM] Data applied to %d/%d players for %s",
        matched,
        len(all_players),
        tm_data.get("team", "?"),
    )
    return lineup_data


def compare_team(gen_data: dict, tm_data: dict) -> dict:
    """Compare lineup-generator output against Transfermarkt for one team."""
    tm_index = index_players(tm_data["players"])
    gen_players = (gen_data.get("starters") or []) + (gen_data.get("substitutes") or [])

    player_results = []
    unmatched_gen = []
    fields = ["number", "age", "height", "foot", "caps", "goals", "marketValue", "clubName"]

    for gp in gen_players:
        tm_p = match_player(gp, tm_index)
        name = f"{gp.get('firstName', '')} {gp.get('lastName', '')}".strip()
        if not tm_p:
            unmatched_gen.append(name)
            continue

        comparisons = [compare_field(f, gp.get(f), tm_p.get(f)) for f in fields]
        mismatches = [c for c in comparisons if c["status"] == "mismatch"]
        missing = [c for c in comparisons if c["status"] == "missing"]
        player_results.append({
            "name": name,
            "tmName": tm_p.get("fullName"),
            "mismatches": mismatches,
            "missing": missing,
            "matches": sum(1 for c in comparisons if c["status"] == "match"),
            "totalCompared": len(comparisons),
        })

    matched_tm_names = {r["tmName"] for r in player_results}
    unmatched_tm = [
        p["fullName"] for p in tm_data["players"]
        if p["fullName"] not in matched_tm_names
    ]

    team_fields = ["squadValue", "avgAge", "fifaRanking"]
    team_meta = [compare_field(f, gen_data.get(f), tm_data.get(f)) for f in team_fields]

    total_checks = sum(r["totalCompared"] for r in player_results) + len(team_fields)
    total_matches = sum(r["matches"] for r in player_results)
    total_matches += sum(1 for c in team_meta if c["status"] == "match")
    total_mismatches = sum(len(r["mismatches"]) for r in player_results)
    total_mismatches += sum(1 for c in team_meta if c["status"] == "mismatch")
    total_missing = sum(len(r["missing"]) for r in player_results)
    total_missing += sum(1 for c in team_meta if c["status"] == "missing")

    field_stats: dict[str, dict[str, int]] = {}
    for r in player_results:
        compared = {c["field"]: c["status"] for c in r["mismatches"] + r["missing"]}
        for f in fields:
            stat = field_stats.setdefault(f, {"match": 0, "mismatch": 0, "missing": 0})
            stat[compared.get(f, "match")] += 1
    for c in team_meta:
        stat = field_stats.setdefault(c["field"], {"match": 0, "mismatch": 0, "missing": 0})
        stat[c["status"]] += 1

    return {
        "team": gen_data.get("team") or tm_data["team"],
        "genSource": gen_data.get("source", ""),
        "tmSourceUrl": tm_data["sourceUrl"],
        "genPlayerCount": len(gen_players),
        "tmPlayerCount": len(tm_data["players"]),
        "matchedPlayers": len(player_results),
        "accuracyPct": round(total_matches / total_checks * 100, 1) if total_checks else 0,
        "totalChecks": total_checks,
        "totalMatches": total_matches,
        "totalMismatches": total_mismatches,
        "totalMissing": total_missing,
        "fieldStats": field_stats,
        "teamMeta": team_meta,
        "unmatchedGen": unmatched_gen,
        "unmatchedTm": unmatched_tm,
        "players": sorted(
            player_results,
            key=lambda r: (-len(r["mismatches"]), -len(r["missing"]), r["name"]),
        ),
    }
