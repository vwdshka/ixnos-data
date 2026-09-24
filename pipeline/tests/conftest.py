import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def load_fixture() -> Callable[[str], Any]:
    def load(relative: str) -> Any:
        return json.loads((FIXTURES / relative).read_text(encoding="utf-8"))

    return load
