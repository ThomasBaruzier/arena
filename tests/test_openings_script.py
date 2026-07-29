import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'misc' / 'openings.py'
SPEC = importlib.util.spec_from_file_location(
    'arena_openings',
    MODULE_PATH
)

if SPEC is None or SPEC.loader is None:
    raise RuntimeError(
        'Cannot load openings module'
    )

openings = importlib.util.module_from_spec(
    SPEC
)
SPEC.loader.exec_module(openings)


class OpeningsScriptTest(
    unittest.TestCase
):
    def test_parse_opening(self):
        self.assertEqual(
            openings.parse_opening(
                'j10K11a1'
            ),
            [
                (9, 9),
                (10, 10),
                (0, 0)
            ]
        )

    def test_empty_and_incomplete_input(self):
        self.assertEqual(
            openings.parse_opening(''),
            []
        )
        self.assertEqual(
            openings.parse_opening('j'),
            []
        )

    def test_symmetries_share_canonical_form(self):
        first = [
            (0, 0),
            (1, 2),
            (4, 3)
        ]

        rotated = [
            (19, 0),
            (17, 1),
            (16, 4)
        ]

        self.assertEqual(
            openings.get_canonical(
                first,
                20
            ),
            openings.get_canonical(
                rotated,
                20
            )
        )

    def test_move_order_does_not_change_canonical_form(self):
        first = [
            (3, 4),
            (8, 9),
            (1, 2)
        ]

        self.assertEqual(
            openings.get_canonical(
                first,
                20
            ),
            openings.get_canonical(
                list(reversed(first)),
                20
            )
        )

    def test_load_existing_suppresses_symmetry_duplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            path = (
                Path(directory) /
                'openings.txt'
            )

            path.write_text(
                'a1b3e4\n'
                't1r2q5\n'
                'j10k11\n',
                encoding='utf-8'
            )

            loaded, canonicals = (
                openings.load_existing(
                    str(path),
                    20
                )
            )

            self.assertEqual(
                loaded,
                [
                    'a1b3e4',
                    'j10k11'
                ]
            )
            self.assertEqual(
                len(canonicals),
                2
            )

    def test_missing_file_loads_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            path = (
                Path(directory) /
                'missing.txt'
            )

            self.assertEqual(
                openings.load_existing(
                    str(path),
                    20
                ),
                ([], set())
            )

    def test_save_and_load_round_trip(self):
        expected = [
            'j10k11',
            'a1b2c3'
        ]

        with tempfile.TemporaryDirectory() as directory:
            path = (
                Path(directory) /
                'openings.txt'
            )

            openings.save_openings(
                str(path),
                expected
            )

            self.assertEqual(
                path.read_text(
                    encoding='utf-8'
                ),
                'j10k11\na1b2c3\n'
            )

            loaded, canonicals = (
                openings.load_existing(
                    str(path),
                    20
                )
            )

            self.assertEqual(
                loaded,
                expected
            )
            self.assertEqual(
                len(canonicals),
                2
            )


if __name__ == '__main__':
    unittest.main()
