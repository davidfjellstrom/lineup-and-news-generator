#!/usr/bin/env python3
"""
Compare lineup-generator output against Transfermarkt squad data.

Usage:
  python scripts/compare_transfermarkt.py Sweden
  python scripts/compare_transfermarkt.py Sweden Germany Brazil --formation 4-3-3
  python scripts/compare_transfermarkt.py --all-sample   # 6 representative teams
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

# Allow imports from api/
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, "api")
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

from dotenv import load_dotenv
import anthropic

from logos import get_club_logo_url
from lineup import fetch_lineup
from transfermarkt import compare_team, fetch_squad

load_dotenv(os.path.join(ROOT, ".env"))

SAMPLE_TEAMS = ["Sweden", "Germany", "Brazil", "Japan", "United States", "Morocco"]


def _print_team_report(result: dict) -> None:
    team = result["team"]
    print(f"\n{'=' * 72}")
    print(f"  {team}")
    print(f"{'=' * 72}")
    print(f"Generator source: {result['genSource'] or '(unknown)'}")
    print(f"Transfermarkt:      {result['tmSourceUrl']}")
    print(
        f"Spelare: {result['matchedPlayers']}/{result['genPlayerCount']} matchade "
        f"(TM har {result['tmPlayerCount']})"
    )
    print(
        f"Träffsäkerhet: {result['accuracyPct']}% "
        f"({result['totalMatches']}/{result['totalChecks']} fält matchar, "
        f"{result['totalMismatches']} avvikelser, {result['totalMissing']} saknas)"
    )

    if result.get("fieldStats"):
        print("\nAvvikelser per fält:")
        for field, stats in sorted(
            result["fieldStats"].items(),
            key=lambda x: -(x[1]["mismatch"] + x[1]["missing"]),
        ):
            total = sum(stats.values())
            ok = stats["match"]
            print(
                f"  {field:12}  {ok:2}/{total:<2} matchar  "
                f"({stats['mismatch']} fel, {stats['missing']} saknas)"
            )

    print("\nLagstatistik:")
    for item in result["teamMeta"]:
        mark = {"match": "✓", "mismatch": "✗", "missing": "?"}.get(item["status"], "-")
        print(f"  {mark} {item['field']:12}  gen={item['gen']}  tm={item['tm']}")

    mismatched_players = [p for p in result["players"] if p["mismatches"]]
    if mismatched_players:
        print(f"\nSpelare med avvikelser ({len(mismatched_players)}):")
        for p in mismatched_players[:15]:
            print(f"  • {p['name']} (TM: {p['tmName']})")
            for m in p["mismatches"]:
                print(f"      {m['field']:12}  gen={m['gen']}  tm={m['tm']}")
        if len(mismatched_players) > 15:
            print(f"  … och {len(mismatched_players) - 15} till")

    missing_players = [p for p in result["players"] if p["missing"] and not p["mismatches"]]
    if missing_players:
        print(f"\nSpelare med saknade fält ({len(missing_players)}):")
        for p in missing_players[:8]:
            fields = ", ".join(m["field"] for m in p["missing"])
            print(f"  • {p['name']}: {fields}")

    if result["unmatchedGen"]:
        print(f"\nSpelare i generatorn som inte hittades på TM ({len(result['unmatchedGen'])}):")
        for name in result["unmatchedGen"][:10]:
            print(f"  • {name}")

    if result["unmatchedTm"]:
        print(f"\nSpelare på TM som saknas i generatorn ({len(result['unmatchedTm'])}):")
        for name in result["unmatchedTm"][:10]:
            print(f"  • {name}")

    logos = result.get("logoStats")
    if logos:
        pct = round(logos["resolved"] / logos["withSlug"] * 100, 1) if logos["withSlug"] else 0
        print(
            f"\nKlubbmärken: {logos['resolved']}/{logos['withSlug']} hittade på football-logos.cc ({pct}%)"
        )
        if logos["missing"]:
            print(f"  Saknade logotyper ({len(logos['missing'])}):")
            for line in logos["missing"][:8]:
                print(f"    • {line}")


def _logo_stats(gen_data: dict) -> dict:
    players = (gen_data.get("starters") or []) + (gen_data.get("substitutes") or [])
    with_slug = [p for p in players if p.get("clubSlug")]
    resolved = 0
    missing = []
    for p in with_slug:
        if get_club_logo_url(p.get("clubCountry", ""), p.get("clubSlug", "")):
            resolved += 1
        else:
            missing.append(
                f"{p.get('firstName', '')} {p.get('lastName', '')} "
                f"({p.get('clubCountry', '?')}/{p.get('clubSlug', '?')})"
            )
    return {
        "total": len(players),
        "withSlug": len(with_slug),
        "resolved": resolved,
        "missing": missing,
    }


def compare_one_team(team: str, formation: str, client: anthropic.Anthropic) -> dict:
    print(f"\n→ Hämtar lineup för {team}…")
    gen_data = fetch_lineup(team, formation, "pre-match", None, client)
    gen_data["team"] = team

    print(f"→ Hämtar Transfermarkt-data för {team}…")
    tm_data = fetch_squad(team)
    time.sleep(1.5)  # polite delay between TM requests

    result = compare_team(gen_data, tm_data)
    result["logoStats"] = _logo_stats(gen_data)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare lineup generator vs Transfermarkt")
    parser.add_argument("teams", nargs="*", help="Team names, e.g. Sweden Germany")
    parser.add_argument("--formation", default="4-3-3")
    parser.add_argument("--all-sample", action="store_true", help="Run sample set of 6 teams")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of report")
    args = parser.parse_args()

    teams = SAMPLE_TEAMS if args.all_sample else (args.teams or ["Sweden"])
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY saknas — lägg till i .env", file=sys.stderr)
        return 1

    client = anthropic.Anthropic(api_key=api_key)
    results = []

    for team in teams:
        try:
            results.append(compare_one_team(team, args.formation, client))
        except Exception as e:
            print(f"\nFel för {team}: {e}", file=sys.stderr)
            results.append({"team": team, "error": str(e)})

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
        return 0

    ok = [r for r in results if "error" not in r]
    print("\n" + "=" * 72)
    print("  SAMMANFATTNING")
    print("=" * 72)
    for r in ok:
        print(
            f"  {r['team']:22}  {r['accuracyPct']:5.1f}% träff  "
            f"({r['totalMismatches']} avvikelser, {r['totalMissing']} saknade fält)"
        )
    for r in results:
        if "error" in r:
            print(f"  {r['team']:22}  FEL: {r['error']}")

    for r in ok:
        _print_team_report(r)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
