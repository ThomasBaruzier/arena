#include "../common/test_utils.h"
#include "../src/game/player.h"

using namespace Arena;

class PlayerTest : public ::testing::Test {
protected:
    std::unique_ptr<Game::Player> player;
    void SetUp() override {
        player = std::make_unique<Game::Player>("dummy", "P1");
    }
};

TEST_F(PlayerTest, Extraction) {
    std::string about = "name=\"Bot\" version=\"1.0\"";
    player->extract_name(about);
    player->extract_version(about);
    EXPECT_EQ(player->name(), "Bot");
    EXPECT_EQ(player->version(), "1.0");
}

TEST_F(PlayerTest, InvalidNameFallback) {
    player->extract_name("name=\"Invalid<Char>\"");
    EXPECT_EQ(player->name(), "dummy");
}

TEST_F(PlayerTest, ExtractVersionComplex) {
    player->extract_version("name=\"Bot\" version=\"1.0-beta.2\"");
    EXPECT_EQ(player->version(), "1.0");
}

TEST_F(PlayerTest, MessageCheck) {
    EXPECT_TRUE(player->is_message_or_debug("MESSAGE hello"));
    EXPECT_TRUE(player->is_message_or_debug("DEBUG info"));
    EXPECT_FALSE(player->is_message_or_debug("10,10"));
    EXPECT_FALSE(player->is_message_or_debug("OK"));
}

TEST_F(PlayerTest, NoVersionProvided) {
    player->extract_version("name=\"Bot\"");
    EXPECT_EQ(player->version(), "");
}

TEST_F(PlayerTest, NoNameProvided) {
    player->extract_name("version=\"1.0\"");
    EXPECT_EQ(player->name(), "dummy");
}

TEST_F(PlayerTest, EmptyAboutString) {
    player->extract_name("");
    player->extract_version("");
    EXPECT_EQ(player->name(), "dummy");
    EXPECT_EQ(player->version(), "");
}

TEST_F(PlayerTest, MessageWithExtraSpaces) {
    EXPECT_TRUE(player->is_message_or_debug("MESSAGE   spaced"));
    EXPECT_TRUE(player->is_message_or_debug("DEBUG   spaced"));
}

TEST_F(PlayerTest, GetNameAndVersion) {
    player->extract_name("name=\"TestBot\"");
    player->extract_version("version=\"2.5\"");
    EXPECT_EQ(player->name(), "TestBot");
    EXPECT_EQ(player->version(), "2.5");
}

TEST_F(PlayerTest, LongNameTruncation) {
    player->extract_name("name=\"VeryLongBotNameHere\"");
    EXPECT_LE(player->name().length(), 16);
}

TEST_F(PlayerTest, VersionWithLeadingZeros) {
    player->extract_version("version=\"01.02\"");
    EXPECT_EQ(player->version(), "01.02");
}

TEST_F(PlayerTest, SpecialVersion) {
    player->extract_version("version=\"v2\"");
    EXPECT_EQ(player->version(), "v2");
}

TEST_F(PlayerTest, QuotedEmptyName) {
    player->extract_name("name=\"\"");
    EXPECT_EQ(player->name(), "dummy");
}

TEST_F(PlayerTest, UnquotedValue) {
    player->extract_name("name=Bot");
    EXPECT_EQ(player->name(), "dummy");
}

TEST_F(PlayerTest, MultipleAttributes) {
    std::string about = "author=\"John\" name=\"Bot\" version=\"1.0\" country=\"US\"";
    player->extract_name(about);
    player->extract_version(about);
    EXPECT_EQ(player->name(), "Bot");
    EXPECT_EQ(player->version(), "1.0");
}
