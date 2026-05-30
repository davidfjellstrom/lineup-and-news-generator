import json

from lineup import run_with_search, extract_json


def _build_news_prompt(q: str) -> str:
    return f"""Search for the latest football/soccer news about: {q}

Find 5–8 recent articles. Return ONLY a valid JSON array where each element has:
- source: news outlet name (e.g. "BBC Sport", "ESPN", "Sky Sports", "FIFA")
- time: relative age string (e.g. "2 hours ago", "Yesterday", "3 days ago")
- title: article headline
- summary: 1–2 sentence plain-text summary
- url: article URL

No markdown fences, no extra keys, no explanation — pure JSON array."""


def fetch_news(q: str, client) -> dict:
    """Fetch football news via Claude web search and return structured articles."""
    text = run_with_search(client, _build_news_prompt(q))
    try:
        articles = extract_json(text)
        return {"articles": articles}
    except json.JSONDecodeError:
        return {"articles": [], "raw": text}
