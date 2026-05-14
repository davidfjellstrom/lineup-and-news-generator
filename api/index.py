import os
import json
import re

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
import anthropic
from dotenv import load_dotenv

load_dotenv()

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


def run_with_search(client: anthropic.Anthropic, user_message: str, max_uses: int = 5) -> str:
    """Run a Claude conversation with web_search_20250305 tool, handling the agentic loop."""
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": max_uses}]
    messages = [{"role": "user", "content": user_message}]

    for _ in range(8):
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            tools=tools,
            messages=messages,
        )

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
    prompt = f"""Search for {team}'s most recent starting lineup using a {formation} formation (World Cup 2026 or latest major tournament).

Return ONLY a valid JSON array of exactly 11 players, each with:
- number: jersey number (integer)
- firstName: first name (UPPERCASE)
- lastName: last name / surname (UPPERCASE)
- position: one of GK, DEF, MID, FWD
- clubName: current club

No markdown, no explanation — pure JSON array."""

    try:
        text = run_with_search(client, prompt, max_uses=3)
        players = extract_json(text)
        return {"players": players}
    except json.JSONDecodeError:
        return {"players": [], "raw": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Vercel / AWS Lambda entry point
handler = Mangum(app, lifespan="off")
