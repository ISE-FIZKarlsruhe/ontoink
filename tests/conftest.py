"""Shared test fixtures."""

from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def sample_data():
    return str(FIXTURES / "sample-data.ttl")


@pytest.fixture
def sample_shape():
    return str(FIXTURES / "sample-shape.ttl")


@pytest.fixture
def invalid_data():
    return str(FIXTURES / "invalid-data.ttl")
