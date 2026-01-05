#include "../common/test_utils.h"
#include "../src/game/rules.h"

using namespace Arena;

class RulesTest : public ::testing::Test {
protected:
    std::vector<int> board;
    int size = 15;

    void SetUp() override {
        board.resize(size * size, 0);
    }

    void Set(int x, int y, int c) {
        if (x >= 0 && x < size && y >= 0 && y < size)
            board[y * size + x] = c;
    }
};

TEST_F(RulesTest, HorizontalWin) {
    for (int i = 0; i < 5; ++i) Set(i, 0, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 0, 0, 1));
}

TEST_F(RulesTest, VerticalWin) {
    for (int i = 0; i < 5; ++i) Set(0, i, 2);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 0, 0, 2));
}

TEST_F(RulesTest, DiagonalWin) {
    for (int i = 0; i < 5; ++i) Set(i, i, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 0, 0, 1));
}

TEST_F(RulesTest, AntiDiagonalWin) {
    for (int i = 0; i < 5; ++i) Set(i, 4 - i, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 2, 2, 1));
}

TEST_F(RulesTest, BlockedWin) {
    for (int i = 0; i < 4; ++i) Set(i, 0, 1);
    Set(4, 0, 2);
    EXPECT_FALSE(Game::Rules::check_win(board, size, 0, 0, 1));
}

TEST_F(RulesTest, OverlineWin) {
    for (int i = 0; i < 6; ++i) Set(i, 5, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 0, 5, 1));
}

TEST_F(RulesTest, EdgeWin) {
    for (int i = 0; i < 5; ++i) Set(size - 1, size - 1 - i, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, size - 1, size - 1, 1));
}

TEST_F(RulesTest, BrokenLine) {
    Set(0, 0, 1); Set(1, 0, 1); Set(3, 0, 1); Set(4, 0, 1);
    EXPECT_FALSE(Game::Rules::check_win(board, size, 0, 0, 1));
}

TEST_F(RulesTest, TopLeftCornerWin) {
    for (int i = 0; i < 5; ++i) Set(i, 0, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 0, 0, 1));
}

TEST_F(RulesTest, TopRightCornerWin) {
    for (int i = 0; i < 5; ++i) Set(size - 1 - i, 0, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, size - 1, 0, 1));
}

TEST_F(RulesTest, BottomLeftCornerWin) {
    for (int i = 0; i < 5; ++i) Set(0, size - 1 - i, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 0, size - 1, 1));
}

TEST_F(RulesTest, BottomRightCornerWin) {
    for (int i = 0; i < 5; ++i) Set(size - 1, size - 1 - i, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, size - 1, size - 1, 1));
}

TEST_F(RulesTest, MinimumBoardSize5x5) {
    int small_size = 5;
    std::vector<int> small_board(25, 0);

    for (int i = 0; i < 5; ++i) small_board[i] = 1;
    EXPECT_TRUE(Game::Rules::check_win(small_board, small_size, 0, 0, 1));
}

TEST_F(RulesTest, WinDetectionFromMiddle) {
    for (int i = 2; i < 7; ++i) Set(i, 5, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 4, 5, 1));
}

TEST_F(RulesTest, WinDetectionFromEnd) {
    for (int i = 2; i < 7; ++i) Set(i, 5, 1);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 6, 5, 1));
}

TEST_F(RulesTest, Exactly4InRow) {
    for (int i = 0; i < 4; ++i) Set(i, 7, 1);
    EXPECT_FALSE(Game::Rules::check_win(board, size, 0, 7, 1));
}

TEST_F(RulesTest, DiagonalCornerToCorner) {
    for (int i = 0; i < 5; ++i) Set(i, i, 2);
    EXPECT_TRUE(Game::Rules::check_win(board, size, 2, 2, 2));
}

TEST_F(RulesTest, AntiDiagonalFromCorner) {
    for (int i = 0; i < 5; ++i) Set(size - 1 - i, i, 2);
    EXPECT_TRUE(Game::Rules::check_win(board, size, size - 3, 2, 2));
}

TEST_F(RulesTest, NoWinOnEmptyBoard) {
    EXPECT_FALSE(Game::Rules::check_win(board, size, 7, 7, 1));
    EXPECT_FALSE(Game::Rules::check_win(board, size, 7, 7, 2));
}

TEST_F(RulesTest, NoWinWrongColor) {
    for (int i = 0; i < 5; ++i) Set(i, 0, 1);
    EXPECT_FALSE(Game::Rules::check_win(board, size, 0, 0, 2));
}
