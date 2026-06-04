import json

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


def _build_news_prompt(q: str, sources: list[str]) -> str:
    sources_str = ", ".join(sources) if sources else "BBC Sport, Sky Sports, ESPN, FIFA, UEFA, The Guardian"
    return f"""Today is June 2026. The FIFA World Cup 2026 is currently underway in the USA, Canada, and Mexico.

Search for the latest football news about: {q}

TRUSTED SOURCES — only use articles from: {sources_str}
Do NOT use Wikipedia, fan wikis, betting sites, or any source published before January 1, 2026.

Find 5–8 recent articles. If no relevant articles are found from the specified sources, return an empty JSON array.

Return ONLY a valid JSON array where each element has:
- source: news outlet name (e.g. "BBC Sport", "ESPN", "Sky Sports")
- time: relative age string (e.g. "2 hours ago", "Yesterday", "3 days ago")
- title: article headline in the original language or English
- summary: 1–2 sentence plain-text summary in Swedish
- url: article URL

No markdown fences, no extra keys, no explanation — pure JSON array."""


def fetch_news(q: str, client, sources: list[str] | None = None) -> dict:
    """Fetch football news via Claude web search and return structured articles."""
    text = run_with_search(client, _build_news_prompt(q, sources or []))
    try:
        articles = extract_json(text)
        return {"articles": articles}
    except json.JSONDecodeError:
        return {"articles": [], "raw": text}
