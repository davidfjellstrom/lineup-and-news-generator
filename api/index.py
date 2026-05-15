import os
import json
import re
import logging
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException, Query
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    return anthropic.Anthropic(api_key=api_key)


_SLUG_STRIP_PREFIXES = ["fc-", "afc-", "ac-", "as-", "ss-", "sc-", "rc-", "vfl-", "sv-", "rb-", "cf-", "bvb-"]
_SLUG_STRIP_SUFFIXES = ["-fc", "-afc", "-ac", "-united", "-city", "-hotspur", "-wanderers",
                        "-albion", "-athletic", "-rovers", "-town", "-aif", "-bk", "-sk", "-if", "-ff", "-fk", "-ik"]

# In-memory cache: country → list of known slugs (populated on first miss per country)
_country_slug_cache: dict = {}


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


@app.get("/api/lineup")
def get_lineup(
    team: str = Query(...),
    formation: str = Query(default="4-3-3"),
):
    client = get_client()
    prompt = f"""Search FIFA.com first, then Transfermarkt or official football federation sites, for {team}'s official World Cup 2026 squad registration (World Cup 2026 squads are now registered — always use the official FIFA 2026 data).

Find the REAL officially assigned jersey numbers — do not invent sequential numbers.

Return ONLY a valid JSON object with these exact keys:
- flag: the flag emoji for {team}'s country (e.g. "🇸🇪" for Sweden)
- coach: head coach full name in UPPERCASE
- starters: array of exactly 11 starting players (most likely XI based on recent matches)
- substitutes: array of 7–12 squad players not in the starting XI

Each player (in both arrays) has:
- number: official jersey number as registered with FIFA (integer)
- firstName: first name in UPPERCASE
- lastName: last name / surname in UPPERCASE
- position: one of GK, DEF, MID, FWD
- clubName: current club name in English (e.g. "Arsenal", "Bayern Munich", "Real Madrid")
- clubCountry: lowercase country where the CLUB plays (not the national team), e.g. "england", "germany", "spain", "italy", "france", "sweden", "portugal", "netherlands", "turkey", "saudi-arabia"
- clubSlug: club's slug on football-logos.cc — lowercase with hyphens, no accents. Examples: "arsenal", "fc-bayern-munchen", "atletico-madrid", "aik", "mjallby-aif", "al-nassr". Derive it from the club's native name if not English (e.g. Bayern Munich → "fc-bayern-munchen")

No markdown fences, no explanation — pure JSON object."""

    try:
        text = run_with_search(client, prompt, max_uses=5, label=team)
        match = re.search(r'\{[\s\S]*\}', text)
        if match:
            data = json.loads(match.group())
        else:
            data = {"players": extract_json(text)}

        all_players = (data.get("starters") or []) + (data.get("substitutes") or data.get("players") or [])

        # Resolve club logos in parallel — scrape football-logos.cc with Claude's country+slug
        unique_pairs = list({(p.get("clubCountry", ""), p.get("clubSlug", ""))
                             for p in all_players if p.get("clubSlug")})
        log.info("[%s] Skrapar logotyper för %d klubbar…", team, len(unique_pairs))
        with ThreadPoolExecutor(max_workers=10) as ex:
            urls = list(ex.map(lambda pair: get_club_logo_url(*pair), unique_pairs))
        logo_map = dict(zip(unique_pairs, urls))

        for p in all_players:
            key = (p.get("clubCountry", ""), p.get("clubSlug", ""))
            p["clubLogoUrl"] = logo_map.get(key, "")
            if p["clubLogoUrl"]:
                log.info("  ✓ %s → …%s", p.get("clubName"), p["clubLogoUrl"][-35:])
            else:
                log.info("  ✗ %s (%s/%s) — inte hittad", p.get("clubName"), p.get("clubCountry", "?"), p.get("clubSlug", "?"))

        return data
    except json.JSONDecodeError:
        return {"players": [], "raw": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Vercel / AWS Lambda entry point
handler = Mangum(app, lifespan="off")
