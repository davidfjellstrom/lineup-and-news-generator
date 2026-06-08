"""Unit tests for Transfermarkt stat overlay onto lineup results."""

from transfermarkt import apply_tm_stats, match_player, index_players, squad_base_from_tm


def _sample_lineup():
    return {
        "flag": "🇸🇪",
        "coach": "JOHN DOE",
        "fifaRanking": 99,
        "avgAge": 30.0,
        "squadValue": 100.0,
        "source": "test",
        "starters": [
            {
                "firstName": "VIKTOR",
                "lastName": "GYOKERES",
                "number": 9,
                "position": "FWD",
                "positionLabel": "ST",
                "age": 28,
                "height": 180,
                "foot": "Hö",
                "caps": 10,
                "goals": 5,
                "marketValue": 20.0,
                "clubName": "",
                "clubCountry": "",
                "clubSlug": "",
            },
        ],
        "substitutes": [
            {
                "firstName": "DEJAN",
                "lastName": "KULUSEVSKI",
                "number": 21,
                "position": "MID",
                "positionLabel": "RW",
                "age": 25,
                "height": None,
                "foot": None,
                "caps": None,
                "goals": None,
                "marketValue": None,
                "clubName": "",
                "clubCountry": "",
                "clubSlug": "",
            },
        ],
    }


def _sample_tm_data():
    return {
        "team": "Sweden",
        "squadValue": 435.5,
        "avgAge": 27.4,
        "fifaRanking": 38,
        "coach": "JOHN HAMMARBY",
        "players": [
            {
                "firstName": "VIKTOR",
                "lastName": "GYOKERES",
                "fullName": "Viktor Gyökeres",
                "number": 9,
                "age": 27,
                "height": 187,
                "foot": "Hö",
                "caps": 22,
                "goals": 14,
                "marketValue": 65.0,
                "clubName": "Arsenal FC",
                "clubSlug": "fc-arsenal",
                "clubCountry": "england",
            },
            {
                "firstName": "DEJAN",
                "lastName": "KULUSEVSKI",
                "fullName": "Dejan Kulusevski",
                "number": 21,
                "age": 25,
                "height": 186,
                "foot": "Vä",
                "caps": 35,
                "goals": 4,
                "marketValue": 55.0,
                "clubName": "Tottenham Hotspur",
                "clubSlug": "tottenham-hotspur",
                "clubCountry": "england",
            },
        ],
    }


def test_apply_tm_stats_overrides_claude_values():
    lineup = _sample_lineup()
    apply_tm_stats(lineup, _sample_tm_data())

    starter = lineup["starters"][0]
    assert starter["age"] == 27
    assert starter["height"] == 187
    assert starter["caps"] == 22
    assert starter["goals"] == 14
    assert starter["marketValue"] == 65.0
    assert starter["clubName"] == "Arsenal FC"
    assert starter["clubSlug"] == "fc-arsenal"
    assert starter["clubCountry"] == "england"
    assert starter["positionLabel"] == "ST"


def test_apply_tm_stats_fills_missing_substitute_stats():
    lineup = _sample_lineup()
    apply_tm_stats(lineup, _sample_tm_data())

    sub = lineup["substitutes"][0]
    assert sub["height"] == 186
    assert sub["foot"] == "Vä"
    assert sub["caps"] == 35
    assert sub["goals"] == 4
    assert sub["marketValue"] == 55.0
    assert sub["clubName"] == "Tottenham Hotspur"


def test_apply_tm_stats_updates_team_meta():
    lineup = _sample_lineup()
    apply_tm_stats(lineup, _sample_tm_data())

    assert lineup["squadValue"] == 435.5
    assert lineup["avgAge"] == 27.4
    assert lineup["fifaRanking"] == 38
    assert lineup["coach"] == "JOHN HAMMARBY"


def test_match_player_by_jersey_number():
    tm_index = index_players([
        {"firstName": "DANILO", "lastName": "SANTOS", "number": 18, "caps": 1},
        {"firstName": "DANILO", "lastName": "CABRAL", "number": 13, "caps": 91},
    ])
    hit = match_player({"firstName": "DANILO", "lastName": "DANILO", "number": 13}, tm_index)
    assert hit is not None
    assert hit["caps"] == 91


def test_match_player_by_last_name():
    tm_index = index_players(_sample_tm_data()["players"])
    hit = match_player({"firstName": "V", "lastName": "GYOKERES"}, tm_index)
    assert hit is not None
    assert hit["caps"] == 22


def test_token_match_skips_ambiguous_names():
    tm_index = index_players([
        {"firstName": "", "lastName": "DANILO", "number": 13},
        {"firstName": "", "lastName": "DANILO", "number": 18},
    ])
    hit = match_player({"firstName": "DANILO", "lastName": "DANILO", "number": 0}, tm_index)
    assert hit is None


def test_squad_base_from_tm_requires_minimum_size():
    tm_data = {"players": [{"firstName": "A", "lastName": "B", "number": 1, "position": "GK"}]}
    assert squad_base_from_tm(tm_data) == []

    tm_data["players"] = [
        {
            "firstName": f"P{i}",
            "lastName": "TEST",
            "number": i,
            "position": "MID",
            "age": 25,
        }
        for i in range(15)
    ]
    base = squad_base_from_tm(tm_data)
    assert len(base) == 15
    assert base[0]["photo"] == ""


def test_apply_tm_stats_leaves_unmatched_players_unchanged():
    lineup = _sample_lineup()
    lineup["substitutes"].append({
        "firstName": "UNKNOWN",
        "lastName": "PLAYER",
        "number": 99,
        "position": "DEF",
        "caps": 1,
        "goals": 0,
    })
    apply_tm_stats(lineup, _sample_tm_data())

    assert lineup["substitutes"][-1]["caps"] == 1
