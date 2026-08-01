#include "../common/test_utils.h"
#include "../src/game/openings.h"

using namespace Arena;

TEST(
    OpeningTerminalTest,
    RejectsTerminalOpening
) {
    std::vector<Core::Point> opening = {
        {0, 0},
        {0, 1},
        {1, 0},
        {1, 1},
        {2, 0},
        {2, 1},
        {3, 0},
        {3, 1},
        {4, 0}
    };

    EXPECT_THROW(
        Game::Openings::validate(
            opening,
            20
        ),
        std::runtime_error
    );
}

TEST(
    OpeningTerminalTest,
    AcceptsNonterminalOpening
) {
    std::vector<Core::Point> opening = {
        {0, 0},
        {0, 1},
        {1, 0},
        {1, 1},
        {2, 0},
        {2, 1},
        {3, 0},
        {3, 1}
    };

    EXPECT_NO_THROW(
        Game::Openings::validate(
            opening,
            20
        )
    );
}
