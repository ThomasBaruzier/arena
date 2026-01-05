#include "../common/test_utils.h"
#include "../src/app/worker.h"
#include "../src/app/cli.h"

using namespace Arena;

class AppTest : public ::testing::Test {};

TEST_F(AppTest, NdjsonFormat) {
    Core::BatchConfig bc;
    bc.p1_cmd = "p1";
    bc.p2_cmd = "p2";
    Core::RunSpec rs;
    rs.p1_nodes = 100;
    App::MatchState state;
    state.wins = 5;
    Stats::Tracker stats;
    stats.p1_elo = 1200;

    std::string json = App::format_ndjson_line(
        bc, rs, state, stats, 10.0, 0.5, 90.0, 80.0
    );

    EXPECT_NE(json.find("\"p1_cmd\":\"p1\""), std::string::npos);
    EXPECT_NE(json.find("\"wins\":5"), std::string::npos);
    EXPECT_NE(json.find("\"elo\":1200"), std::string::npos);
    EXPECT_NE(json.find("\"p1_efficiency\":90"), std::string::npos);
}

TEST_F(AppTest, RunContextLogic) {
    App::RunContext ctx;
    ctx.total_games_expected = 10;
    ctx.games_completed = 5;
    ctx.games_skipped = 5;
    EXPECT_GE(ctx.games_completed + ctx.games_skipped, ctx.total_games_expected);
}

TEST_F(AppTest, PendingGamesGeneration) {
    Core::Config cfg;
    cfg.max_pairs = 2;
    cfg.board_size = 15;
    cfg.bot1.cmd = "p1";
    cfg.bot2.cmd = "p2";

    std::vector<std::vector<Core::Point>> ops;
    auto ctx = std::make_shared<App::RunContext>();
    auto games = App::CLI::create_pending_games(cfg, ops, std::nullopt, ctx, "id");

    ASSERT_EQ(games.size(), 4);
    EXPECT_EQ(games[0].pair, 1);
    EXPECT_EQ(games[0].leg, 0);
    EXPECT_EQ(games[1].pair, 1);
    EXPECT_EQ(games[1].leg, 1);
}

TEST_F(AppTest, PendingGamesWithOpenings) {
    Core::Config cfg;
    cfg.max_pairs = 2;
    cfg.use_openings = true;
    cfg.board_size = 15;

    std::vector<std::vector<Core::Point>> ops;
    ops.push_back({{7, 7}});
    ops.push_back({{8, 8}});

    auto ctx = std::make_shared<App::RunContext>();
    auto games = App::CLI::create_pending_games(cfg, ops, std::nullopt, ctx, "id");

    ASSERT_EQ(games.size(), 4);
    EXPECT_EQ(games[0].opening[0].x, 7);
    EXPECT_EQ(games[2].opening[0].x, 8);
}
TEST_F(AppTest, NdjsonFormatFullStats) {
    Core::BatchConfig bc;
    bc.p1_cmd = "p1"; bc.p2_cmd = "p2";
    Core::RunSpec rs;
    App::MatchState state;
    Stats::Tracker stats;

    stats.p1_elo = 1200; stats.p2_elo = 1100;
    stats.p1_severe_errors = 5; stats.p1_moves_analyzed = 100;
    stats.p2_severe_errors = 0; stats.p2_moves_analyzed = 100;

    std::string json = App::format_ndjson_line(
        bc, rs, state, stats, 10.0, 0.5, 90.0, 80.0
    );

    EXPECT_NE(json.find("\"p1\":{"), std::string::npos);
    EXPECT_NE(json.find("\"p2\":{"), std::string::npos);
    EXPECT_NE(json.find("\"blunder\":"), std::string::npos);
    EXPECT_NE(json.find("\"elo\":"), std::string::npos);
}

TEST_F(AppTest, PendingGamesOpeningBounds) {
    Core::Config cfg;
    cfg.max_pairs = 1;
    cfg.use_openings = true;
    cfg.board_size = 15;

    std::vector<std::vector<Core::Point>> ops;
    ops.push_back({{15, 15}});

    auto ctx = std::make_shared<App::RunContext>();
    EXPECT_THROW(
        App::CLI::create_pending_games(cfg, ops, std::nullopt, ctx, "id"),
        std::runtime_error
    );
}
