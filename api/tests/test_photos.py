from photos import _ascii_upper, _parse_height


class TestAsciiUpper:
    def test_strips_swedish_accents(self):
        assert _ascii_upper("Gyökeres") == "GYOKERES"

    def test_strips_french_accents(self):
        assert _ascii_upper("Mbappé") == "MBAPPE"

    def test_handles_already_uppercase(self):
        assert _ascii_upper("SMITH") == "SMITH"

    def test_handles_lowercase(self):
        assert _ascii_upper("haaland") == "HAALAND"

    def test_handles_empty_string(self):
        assert _ascii_upper("") == ""

    def test_strips_multiple_accents(self):
        assert _ascii_upper("Björkan") == "BJORKAN"

    def test_lindelof(self):
        assert _ascii_upper("Lindelöf") == "LINDELOF"


class TestParseHeight:
    def test_standard_format(self):
        assert _parse_height("178 cm") == 178

    def test_tall_player(self):
        assert _parse_height("201 cm") == 201

    def test_none_input(self):
        assert _parse_height(None) is None

    def test_empty_string(self):
        assert _parse_height("") is None

    def test_no_unit(self):
        # Graceful failure — not a format we expect but shouldn't crash
        assert _parse_height("not a height") is None
