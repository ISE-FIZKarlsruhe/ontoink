"""Tests for the SHACL validator."""

from ontoview.shacl_validator import validate_graph


def test_valid_data_conforms(sample_data, sample_shape):
    result = validate_graph(sample_data, sample_shape)
    assert result["conforms"] is True
    assert len(result["violations"]) == 0


def test_invalid_data_fails(invalid_data, sample_shape):
    result = validate_graph(invalid_data, sample_shape)
    assert result["conforms"] is False
    assert len(result["violations"]) > 0
