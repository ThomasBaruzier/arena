#include "../common/test_utils.h"
#include "../src/game/openings.h"
#include <fstream>

using namespace Arena;

class OpeningsTest : public ::testing::Test {
protected:
    std::string path =
        "/tmp/arena_test_openings.txt";

    void TearDown() override {
        unlink(path.c_str());
    }

    void write_file(
        const std::string& content
    ) {
        std::ofstream file(path);
        file << content;
    }
};

TEST_F(OpeningsTest, ParsesCanonicalSyntax) {
    write_file("j10k11\n");

    auto openings =
        Game::Openings::load(path);

    ASSERT_EQ(openings.size(), 1);
    ASSERT_EQ(openings[0].size(), 2);
    EXPECT_EQ(openings[0][0].x, 9);
    EXPECT_EQ(openings[0][0].y, 9);
    EXPECT_EQ(openings[0][1].x, 10);
    EXPECT_EQ(openings[0][1].y, 10);
}

TEST_F(OpeningsTest, SupportsMixedCaseAndTwoDigitRows) {
    write_file("A1T20\n");

    auto openings =
        Game::Openings::load(path);

    ASSERT_EQ(openings.size(), 1);
    ASSERT_EQ(openings[0].size(), 2);
    EXPECT_EQ(openings[0][0].x, 0);
    EXPECT_EQ(openings[0][0].y, 0);
    EXPECT_EQ(openings[0][1].x, 19);
    EXPECT_EQ(openings[0][1].y, 19);
}

TEST_F(OpeningsTest, SkipsBlankPhysicalLines) {
    write_file("j10\n\nk11\r\n");

    auto openings =
        Game::Openings::load(path);

    ASSERT_EQ(openings.size(), 2);
    EXPECT_EQ(openings[0].size(), 1);
    EXPECT_EQ(openings[1].size(), 1);
}

TEST_F(OpeningsTest, RejectsMissingFile) {
    EXPECT_THROW(
        Game::Openings::load(
            "/nonexistent/openings"
        ),
        std::runtime_error
    );
}

TEST_F(OpeningsTest, RejectsMalformedText) {
    for (
        const char* content :
        {
            "1j10\n",
            "j 10\n",
            "j\n",
            "j0\n",
            "j-1\n",
            "j10,\n",
            "j10 k11\n",
            "j999999999999999999999\n"
        }
    ) {
        write_file(content);

        EXPECT_THROW(
            Game::Openings::load(path),
            std::runtime_error
        ) << content;
    }
}

TEST_F(OpeningsTest, ReportsLineNumber) {
    write_file("j10\nk11\nbad\n");

    try {
        Game::Openings::load(path);
        FAIL();
    } catch (const std::runtime_error& error) {
        EXPECT_NE(
            std::string(error.what()).find(
                "line 3"
            ),
            std::string::npos
        );
    }
}

TEST_F(OpeningsTest, ValidatesBounds) {
    EXPECT_NO_THROW(
        Game::Openings::validate(
            {{0, 0}, {19, 19}},
            20
        )
    );

    EXPECT_THROW(
        Game::Openings::validate(
            {{20, 0}},
            20
        ),
        std::runtime_error
    );

    EXPECT_THROW(
        Game::Openings::validate(
            {{0, -1}},
            20
        ),
        std::runtime_error
    );
}

TEST_F(OpeningsTest, RejectsDuplicates) {
    EXPECT_THROW(
        Game::Openings::validate(
            {{7, 7}, {8, 8}, {7, 7}},
            20
        ),
        std::runtime_error
    );
}

TEST_F(OpeningsTest, RejectsEmptyOpening) {
    EXPECT_THROW(
        Game::Openings::validate({}, 20),
        std::runtime_error
    );
}

TEST_F(OpeningsTest, ExistingCorpusIsValid) {
    auto openings =
        Game::Openings::load(
            "misc/openings.txt"
        );

    ASSERT_FALSE(openings.empty());

    for (const auto& opening : openings) {
        EXPECT_NO_THROW(
            Game::Openings::validate(
                opening,
                20
            )
        );
    }
}
