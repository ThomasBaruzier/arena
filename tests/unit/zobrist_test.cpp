#include "../common/test_utils.h"
#include "../src/analysis/zobrist.h"

using namespace Arena;

class ZobristTest : public ::testing::Test {
protected:
    void SetUp() override {
        Analysis::Zobrist::init(20);
    }
};

TEST_F(ZobristTest, SamePositionSameHash) {
    std::vector<Core::Point> moves1 = {{7, 7}, {8, 8}};
    std::vector<Core::Point> moves2 = {{7, 7}, {8, 8}};

    uint64_t h1 = Analysis::Zobrist::hash(moves1, 20);
    uint64_t h2 = Analysis::Zobrist::hash(moves2, 20);
    EXPECT_EQ(h1, h2);
}

TEST_F(ZobristTest, DifferentPositionsDifferentHash) {
    std::vector<Core::Point> moves1 = {{7, 7}};
    std::vector<Core::Point> moves2 = {{7, 8}};

    uint64_t h1 = Analysis::Zobrist::hash(moves1, 20);
    uint64_t h2 = Analysis::Zobrist::hash(moves2, 20);
    EXPECT_NE(h1, h2);
}

TEST_F(ZobristTest, EmptyPositionZeroHash) {
    std::vector<Core::Point> empty;
    uint64_t h = Analysis::Zobrist::hash(empty, 20);
    EXPECT_EQ(h, 0);
}

TEST_F(ZobristTest, SingleMoveNonZero) {
    std::vector<Core::Point> moves = {{7, 7}};
    uint64_t h = Analysis::Zobrist::hash(moves, 20);
    EXPECT_NE(h, 0);
}

TEST_F(ZobristTest, MoveOrderMatters) {
    std::vector<Core::Point> moves1 = {{0, 0}, {1, 1}};
    std::vector<Core::Point> moves2 = {{1, 1}, {0, 0}};

    uint64_t h1 = Analysis::Zobrist::hash(moves1, 20);
    uint64_t h2 = Analysis::Zobrist::hash(moves2, 20);
    EXPECT_NE(h1, h2);
}

TEST_F(ZobristTest, HashDistributionNoCollisions) {
    std::set<uint64_t> hashes;
    for (int x = 0; x < 10; ++x) {
        for (int y = 0; y < 10; ++y) {
            std::vector<Core::Point> moves = {{x, y}};
            uint64_t h = Analysis::Zobrist::hash(moves, 20);
            EXPECT_EQ(hashes.count(h), 0) << "Collision at (" << x << "," << y << ")";
            hashes.insert(h);
        }
    }
    EXPECT_EQ(hashes.size(), 100);
}

TEST_F(ZobristTest, LongGameSequence) {
    std::vector<Core::Point> moves;
    for (int i = 0; i < 20; ++i) {
        moves.push_back({i, i % 20});
    }

    uint64_t h = Analysis::Zobrist::hash(moves, 20);
    EXPECT_NE(h, 0);
}

TEST_F(ZobristTest, IncrementalHashProperty) {
    std::vector<Core::Point> moves1 = {{7, 7}};
    std::vector<Core::Point> moves2 = {{7, 7}, {8, 8}};

    uint64_t h1 = Analysis::Zobrist::hash(moves1, 20);
    uint64_t h2 = Analysis::Zobrist::hash(moves2, 20);
    EXPECT_NE(h1, h2);
}

TEST_F(ZobristTest, DifferentBoardSizes) {
    std::vector<Core::Point> moves = {{5, 5}};

    Analysis::Zobrist::init(15);
    uint64_t h1 = Analysis::Zobrist::hash(moves, 15);
    uint64_t h2 = Analysis::Zobrist::hash(moves, 20);

    EXPECT_NE(h1, h2);
}
