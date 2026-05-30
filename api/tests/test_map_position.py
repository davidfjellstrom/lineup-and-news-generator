from lineup import _map_position


def test_known_goalkeeper():
    assert _map_position("G") == "GK"


def test_known_defender():
    assert _map_position("D") == "DEF"


def test_known_midfielder():
    assert _map_position("M") == "MID"


def test_known_forward():
    assert _map_position("F") == "FWD"


def test_unknown_value_defaults_to_mid():
    assert _map_position("X") == "MID"


def test_empty_string_defaults_to_mid():
    assert _map_position("") == "MID"


def test_lowercase_not_matched_defaults_to_mid():
    # The API uses uppercase single letters; lowercase should fall back gracefully.
    assert _map_position("g") == "MID"
