from lineup import _build_lineup_prompt


class TestBuildLineupPrompt:
    def test_prematch_contains_fifa_step(self):
        prompt = _build_lineup_prompt("Sweden", "4-3-3", "pre-match")
        assert "FIFA.com" in prompt

    def test_prematch_contains_transfermarkt_step(self):
        prompt = _build_lineup_prompt("Sweden", "4-3-3", "pre-match")
        assert "transfermarkt" in prompt.lower()

    def test_prematch_does_not_ask_for_age(self):
        # Age and height are now sourced from API-Football, not Claude
        prompt = _build_lineup_prompt("Sweden", "4-3-3", "pre-match")
        assert "- age:" not in prompt
        assert "- height:" not in prompt

    def test_prematch_asks_for_club_info(self):
        # clubCountry/clubSlug still needed for football-logos.cc logo scraping
        prompt = _build_lineup_prompt("Sweden", "4-3-3", "pre-match")
        assert "clubCountry" in prompt
        assert "clubSlug" in prompt
        assert "clubName" in prompt

    def test_prematch_still_asks_for_foot(self):
        prompt = _build_lineup_prompt("Sweden", "4-3-3", "pre-match")
        assert "foot" in prompt

    def test_prematch_still_asks_for_caps_and_goals(self):
        prompt = _build_lineup_prompt("Sweden", "4-3-3", "pre-match")
        assert "caps" in prompt
        assert "goals" in prompt

    def test_prematch_still_asks_for_market_value(self):
        prompt = _build_lineup_prompt("Sweden", "4-3-3", "pre-match")
        assert "marketValue" in prompt

    def test_match_mode_mentions_confirmed_lineup(self):
        prompt = _build_lineup_prompt("France", "4-3-3", "match")
        assert "OFFICIALLY RELEASED" in prompt or "confirmed" in prompt.lower()

    def test_match_mode_does_not_instruct_transfermarkt_search(self):
        # Match mode should not instruct Claude to search Transfermarkt —
        # only pre-match needs that. The shared json_shape may mention it as
        # context for a field description, but there should be no STEP referencing it.
        prompt = _build_lineup_prompt("France", "4-3-3", "match")
        assert "STEP 2" not in prompt
        assert "transfermarkt.com" not in prompt.lower()

    def test_team_name_appears_in_prompt(self):
        prompt = _build_lineup_prompt("Norway", "4-3-3", "pre-match")
        assert "Norway" in prompt
