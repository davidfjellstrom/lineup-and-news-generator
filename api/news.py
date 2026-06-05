import json
from typing import List, Optional

from lineup import run_with_search, extract_json


_TRUSTED_NEWS_SOURCES = """TRUSTED SOURCES — only use articles from:
- BBC Sport (bbc.com/sport)
- Sky Sports (skysports.com)
- ESPN (espn.com)
- FIFA.com
- UEFA.com
- The Guardian (theguardian.com/football)
- Official national federation websites (fa.com, fff.fr, dfb.de, etc.)

Do NOT use Wikipedia, fan wikis, betting sites, or any source published before January 1, 2026."""


def _build_news_prompt(q: str, sources: List[str]) -> str:
    from datetime import date, timedelta
    today = date.today()
    cutoff = today - timedelta(days=60)
    sources_str = ", ".join(sources) if sources else "BBC Sport, Sky Sports, ESPN, FIFA, UEFA, The Guardian"
    return f"""Today is {today.strftime('%B %d, %Y')}. The FIFA World Cup 2026 is currently underway in the USA, Canada, and Mexico.

Search for football news about: {q}

TRUSTED SOURCES — only include articles from: {sources_str}
RECENCY — only include articles published on or after {cutoff.strftime('%B %d, %Y')} (last 60 days). Exclude anything older.
Do NOT use Wikipedia, fan wikis, betting sites, or any source not listed above.

Include ALL articles you find that meet the above criteria — do not limit the number.
If no articles are found, return an empty JSON array.

Return ONLY a valid JSON array sorted by recency — newest article first, oldest last. Each element has:
- source: news outlet name (e.g. "BBC Sport", "ESPN", "Sky Sports")
- time: relative age string (e.g. "2 hours ago", "Yesterday", "3 days ago")
- daysAgo: integer number of days since publication (0 = today, 1 = yesterday, etc.)
- title: article headline in the original language or English
- summary: 1–2 sentence plain-text summary in Swedish
- url: article URL

No markdown fences, no extra keys, no explanation — pure JSON array."""


def fetch_news(q: str, client, sources: Optional[List[str]] = None) -> dict:
    """Fetch football news via Claude web search and return structured articles."""
    text = run_with_search(client, _build_news_prompt(q, sources or []))
    try:
        articles = extract_json(text)
        if not isinstance(articles, list):
            return {"articles": [], "raw": text}
        return {"articles": articles}
    except (json.JSONDecodeError, TypeError, ValueError):
        return {"articles": [], "raw": text}
