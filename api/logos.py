import re
import urllib.request
from collections import Counter

_SLUG_STRIP_PREFIXES = [
    "fc-", "afc-", "ac-", "as-", "ss-", "sc-", "rc-", "vfl-", "sv-", "rb-", "cf-", "bvb-",
]
_SLUG_STRIP_SUFFIXES = [
    "-cfc", "-fc", "-afc", "-ac", "-united", "-city", "-hotspur", "-wanderers",
    "-albion", "-athletic", "-rovers", "-town", "-aif", "-bk", "-sk", "-if", "-ff", "-fk", "-ik",
]

# Note: cache lives in process memory; on Vercel each cold-start instance resets it.
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
    """Fetch all club slugs for a country page and cache them."""
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
        # Slugs appearing once are clubs; duplicates are navigation/category links.
        counts = Counter(all_slugs)
        club_slugs = [s for s, c in counts.items() if c == 1]
        _country_slug_cache[country] = club_slugs
        return club_slugs
    except Exception:
        return []


def _fuzzy_match_slug(target: str, candidates: list) -> str:
    """Pick the candidate with highest word-overlap against target slug."""
    # Generic suffixes/words that appear in many club names and should not be
    # the sole basis for a match (e.g. "wanderers" is shared by Wolverhampton
    # Wanderers, Dorking Wanderers, Bolton Wanderers, etc.).
    noise = {
        "cfc", "fc", "sc", "ac", "bc", "rc", "afc", "if", "bk", "sk", "ff", "fk", "ik", "de", "la", "le",
        "wanderers", "united", "city", "hotspur", "athletic", "rovers", "town", "albion",
    }
    target_words = set(target.split("-")) - noise
    if not target_words:
        return ""
    best, best_score = "", 0
    for c in candidates:
        overlap = len(target_words & (set(c.split("-")) - noise))
        if overlap > best_score:
            best_score, best = overlap, c
    return best if best_score > 0 else ""


def _name_to_slug(name: str) -> str:
    """Convert a club display name like 'Genoa CFC' to a URL slug like 'genoa-cfc'."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def get_club_logo_url(club_country: str, club_slug: str, club_name: str = "") -> str:
    """Scrape CDN URL from football-logos.cc with prefix/suffix fallbacks and fuzzy lookup."""
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

    # Also generate candidates from the display name (e.g. "Genoa CFC" → "genoa-cfc" → "genoa").
    # TM slugs sometimes use localised spellings (e.g. "genua-cfc") that differ from the
    # English name used by football-logos.cc ("genoa").
    if club_name:
        name_slug = _name_to_slug(club_name)
        if name_slug not in slugs:
            slugs.append(name_slug)
        for s in _SLUG_STRIP_SUFFIXES:
            if name_slug.endswith(s):
                stripped = name_slug[: -len(s)]
                if stripped not in slugs:
                    slugs.append(stripped)

    for slug in slugs:
        try:
            result = _fetch_logo_from_page(club_country, slug)
            if result:
                return result
        except Exception:
            continue

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
