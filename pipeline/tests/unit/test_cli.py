import pytest

from ixnos_data_pipeline.cli import main


@pytest.mark.parametrize(
    "argv",
    [
        ["nowhere", "hourly"],
        ["khmdhs", "sometimes"],
        ["khmdhs", "seed"],  # seed needs --cache
        ["diavgeia", "seed"],  # seed needs --cache
    ],
)
def test_rejects_invalid_arguments_before_touching_the_database(argv: list[str]) -> None:
    with pytest.raises(SystemExit):
        main(argv)
