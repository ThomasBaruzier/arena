#include "../common/test_utils.h"
#include "../src/game/openings.h"
#include <fstream>

using namespace Arena;

class OpeningsTest : public ::testing::Test {
protected:
    std::string temp_path = "/tmp/arena_test_openings.txt";

    void TearDown() override {
        unlink(temp_path.c_str());
    }

    void WriteFile(const std::string& content) {
        std::ofstream f(temp_path);
        f << content;
    }
};

TEST_F(OpeningsTest, ParseLine) {
    WriteFile("j10k11\n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 1);
    ASSERT_EQ(ops[0].size(), 2);
    EXPECT_EQ(ops[0][0].x, 9);
    EXPECT_EQ(ops[0][0].y, 9);
}

TEST_F(OpeningsTest, EmptyLines) {
    WriteFile("j10\n\nk11\n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 2);
}

TEST_F(OpeningsTest, CRLFHandling) {
    WriteFile("j10\r\n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 1);
    EXPECT_EQ(ops[0].size(), 1);
}

TEST_F(OpeningsTest, InvalidFile) {
    EXPECT_THROW(Game::Openings::load("/nonexistent"), std::runtime_error);
}

TEST_F(OpeningsTest, EdgeCoords) {
    WriteFile("a1t20\n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 1);
    EXPECT_EQ(ops[0][0].x, 0);
    EXPECT_EQ(ops[0][0].y, 0);
    EXPECT_EQ(ops[0][1].x, 19);
    EXPECT_EQ(ops[0][1].y, 19);
}

TEST_F(OpeningsTest, MultipleOpenings) {
    WriteFile("j10\nk11\nl12\n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 3);
}

TEST_F(OpeningsTest, SingleMoveOpening) {
    WriteFile("h8\n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 1);
    EXPECT_EQ(ops[0].size(), 1);
    EXPECT_EQ(ops[0][0].x, 7);
    EXPECT_EQ(ops[0][0].y, 7);
}

TEST_F(OpeningsTest, NonAlphaSkipped) {
    WriteFile("1j10\n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 1);
    EXPECT_EQ(ops[0][0].x, 9);
}

TEST_F(OpeningsTest, SpacesBreakParsing) {
    WriteFile(" j 10 k 11 \n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 1);
    EXPECT_EQ(ops[0].size(), 0);
}

TEST_F(OpeningsTest, MixedCase) {
    WriteFile("J10K11\n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 1);
    ASSERT_EQ(ops[0].size(), 2);
    EXPECT_EQ(ops[0][0].x, 9);
    EXPECT_EQ(ops[0][1].x, 10);
}

TEST_F(OpeningsTest, TwoDigitCoords) {
    WriteFile("a15\n");
    auto ops = Game::Openings::load(temp_path);
    ASSERT_EQ(ops.size(), 1);
    EXPECT_EQ(ops[0][0].y, 14);
}
