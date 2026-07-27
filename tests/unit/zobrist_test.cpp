#include "../common/test_utils.h"
#include "../src/analysis/zobrist.h"
#include <set>

using namespace Arena;

class ZobristTest : public ::testing::Test {};

TEST_F(ZobristTest, SameSequenceSameHash) {
    std::vector<Core::Point> first = {
        {7, 7},
        {8, 8}
    };
    std::vector<Core::Point> second = {
        {7, 7},
        {8, 8}
    };

    EXPECT_EQ(
        Analysis::Zobrist::hash(first, 20),
        Analysis::Zobrist::hash(second, 20)
    );
}

TEST_F(ZobristTest, DifferentPositionsDifferentHash) {
    EXPECT_NE(
        Analysis::Zobrist::hash({{7, 7}}, 20),
        Analysis::Zobrist::hash({{7, 8}}, 20)
    );
}

TEST_F(ZobristTest, EmptyPositionIncludesBoardSize) {
    uint64_t fifteen =
        Analysis::Zobrist::hash({}, 15);
    uint64_t twenty =
        Analysis::Zobrist::hash({}, 20);

    EXPECT_NE(fifteen, 0);
    EXPECT_NE(twenty, 0);
    EXPECT_NE(fifteen, twenty);
}

TEST_F(ZobristTest, SingleMoveNonZero) {
    EXPECT_NE(
        Analysis::Zobrist::hash({{7, 7}}, 20),
        0
    );
}

TEST_F(ZobristTest, MoveOrderMatters) {
    std::vector<Core::Point> first = {
        {0, 0},
        {1, 1},
        {2, 2}
    };
    std::vector<Core::Point> second = {
        {2, 2},
        {1, 1},
        {0, 0}
    };

    EXPECT_NE(
        Analysis::Zobrist::hash(first, 20),
        Analysis::Zobrist::hash(second, 20)
    );
}

TEST_F(ZobristTest, ColorAssignmentMatters) {
    std::vector<Core::Point> first = {
        {5, 5},
        {6, 6}
    };
    std::vector<Core::Point> second = {
        {6, 6},
        {5, 5}
    };

    EXPECT_NE(
        Analysis::Zobrist::hash(first, 20),
        Analysis::Zobrist::hash(second, 20)
    );
}

TEST_F(ZobristTest, BoardSizeMatters) {
    std::vector<Core::Point> moves = {
        {5, 5}
    };

    EXPECT_NE(
        Analysis::Zobrist::hash(moves, 15),
        Analysis::Zobrist::hash(moves, 20)
    );
}

TEST_F(ZobristTest, PrefixChangesHash) {
    std::vector<Core::Point> first = {
        {7, 7}
    };
    std::vector<Core::Point> second = {
        {7, 7},
        {8, 8}
    };

    EXPECT_NE(
        Analysis::Zobrist::hash(first, 20),
        Analysis::Zobrist::hash(second, 20)
    );
}

TEST_F(ZobristTest, DistributionForSingleMoves) {
    std::set<uint64_t> hashes;

    for (int x = 0; x < 20; ++x) {
        for (int y = 0; y < 20; ++y) {
            uint64_t hash =
                Analysis::Zobrist::hash(
                    {{x, y}},
                    20
                );

            EXPECT_TRUE(
                hashes.insert(hash).second
            ) << x << "," << y;
        }
    }

    EXPECT_EQ(hashes.size(), 400);
}

TEST_F(ZobristTest, LongSequenceIsDeterministic) {
    std::vector<Core::Point> moves;

    for (int i = 0; i < 20; ++i) {
        moves.push_back({
            i,
            (i * 7) % 20
        });
    }

    uint64_t first =
        Analysis::Zobrist::hash(moves, 20);
    uint64_t second =
        Analysis::Zobrist::hash(moves, 20);

    EXPECT_NE(first, 0);
    EXPECT_EQ(first, second);
}
