from lineup import _enrich_players_from_squad


def make_player(last_name, **kwargs):
    base = {
        "firstName": "TEST",
        "lastName": last_name,
        "age": None,
        "height": None,
        "photo": "",
        "clubName": "",
        "clubLogo": "",
    }
    base.update(kwargs)
    return base


class TestEnrichPlayersFromSquad:
    def test_enriches_matched_player(self):
        players = [make_player("HAALAND")]
        squad_map = {
            "HAALAND": {"age": 25, "height": 194, "photo": "http://photo.png",
                        "clubName": "Man City", "clubLogo": "http://logo.png"}
        }
        unmatched = _enrich_players_from_squad(players, squad_map)
        p = players[0]
        assert p["age"] == 25
        assert p["height"] == 194
        assert p["photo"] == "http://photo.png"
        assert p["clubName"] == "Man City"
        assert p["clubLogo"] == "http://logo.png"
        assert unmatched == []

    def test_unmatched_player_returned(self):
        players = [make_player("UNKNOWN")]
        squad_map = {"HAALAND": {"age": 25, "height": 194, "photo": "", "clubName": "", "clubLogo": ""}}
        unmatched = _enrich_players_from_squad(players, squad_map)
        assert len(unmatched) == 1
        assert unmatched[0]["lastName"] == "UNKNOWN"

    def test_does_not_overwrite_with_empty_values(self):
        players = [make_player("SMITH", age=30, clubName="Arsenal")]
        squad_map = {
            "SMITH": {"age": None, "height": None, "photo": "", "clubName": "", "clubLogo": ""}
        }
        _enrich_players_from_squad(players, squad_map)
        # None/empty values in squad_map must not overwrite existing data
        assert players[0]["age"] == 30
        assert players[0]["clubName"] == "Arsenal"

    def test_mixed_matched_and_unmatched(self):
        players = [make_player("GYOKERES"), make_player("UNKNOWN")]
        squad_map = {
            "GYOKERES": {"age": 26, "height": 184, "photo": "p.png",
                         "clubName": "Sporting", "clubLogo": "l.png"}
        }
        unmatched = _enrich_players_from_squad(players, squad_map)
        assert players[0]["age"] == 26
        assert len(unmatched) == 1
        assert unmatched[0]["lastName"] == "UNKNOWN"

    def test_empty_squad_map_all_unmatched(self):
        players = [make_player("ISAK"), make_player("ELANGA")]
        unmatched = _enrich_players_from_squad(players, {})
        assert len(unmatched) == 2

    def test_accented_names_matched_via_normalized_key(self):
        # squad_map keys are already normalized by _fetch_team_squad_af
        # Player lastName from Claude may be "GYÖKERES" but squad_map key is "GYOKERES"
        players = [make_player("GYÖKERES")]
        squad_map = {
            "GYOKERES": {"age": 26, "height": 184, "photo": "p.png",
                         "clubName": "Sporting", "clubLogo": "l.png"}
        }
        # _enrich_players_from_squad normalizes via _ascii_upper before lookup
        unmatched = _enrich_players_from_squad(players, squad_map)
        assert players[0]["age"] == 26
        assert unmatched == []
