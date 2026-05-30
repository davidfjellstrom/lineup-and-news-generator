import json
import pytest
from lineup import extract_json


def test_pure_json_array():
    result = extract_json('[{"a": 1}, {"b": 2}]')
    assert result == [{"a": 1}, {"b": 2}]


def test_json_array_embedded_in_text():
    text = 'Here are the results:\n[{"title": "foo", "url": "https://example.com"}]\nDone.'
    result = extract_json(text)
    assert result == [{"title": "foo", "url": "https://example.com"}]


def test_json_array_after_markdown_fence():
    text = '```json\n[{"x": 42}]\n```'
    result = extract_json(text)
    assert result == [{"x": 42}]


def test_invalid_json_raises():
    with pytest.raises(json.JSONDecodeError):
        extract_json("this is not json at all")


def test_invalid_embedded_array_raises():
    with pytest.raises(json.JSONDecodeError):
        extract_json("result: [unclosed")
