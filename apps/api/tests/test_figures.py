"""A figure is served only from inside the asset store."""

from app.figures import asset_root, resolve


def test_a_figure_in_the_store_resolves() -> None:
    path = resolve("docs/questions/utme/mathematics/figures/svg/2001_q13.svg")
    assert path is not None
    assert path.is_relative_to(asset_root())


def test_a_stored_path_cannot_walk_out_of_the_store() -> None:
    assert resolve("../../../../etc/passwd") is None
    assert resolve("docs/../../outside.svg") is None


def test_a_missing_file_is_not_served() -> None:
    assert resolve("docs/questions/utme/mathematics/figures/svg/1900_q01.svg") is None
