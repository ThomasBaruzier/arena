#include "../common/test_utils.h"
#include "../src/app/cli.h"
#include "../src/app/worker.h"

using namespace Arena;

class AppTest : public ::testing::Test {};

TEST_F(AppTest, NdjsonFormat) {
    Core::BatchConfig batch;
    batch.p1_cmd = "p1";
    batch.p2_cmd = "p2";

    Core::RunSpec run;
    run.p1_nodes = 100;

    App::MatchState state;
    state.wins = 5;

    Stats::Tracker stats;
    stats.p1_elo = 1200;

    std::string json =
        App::format_ndjson_line(
            batch,
            run,
            state,
            stats,
            10.0
        );

    EXPECT_NE(
        json.find("\"p1_cmd\":\"p1\""),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"wins\":5"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"elo\":1200"),
        std::string::npos
    );
}

TEST_F(AppTest, RunReadyRequiresAllGames) {
    App::RunContext context;
    context.total_games_expected = 4;
    context.games_completed = 3;

    EXPECT_FALSE(
        App::run_ready_to_finalize(context)
    );

    context.games_skipped = 1;

    EXPECT_TRUE(
        App::run_ready_to_finalize(context)
    );
}

TEST_F(AppTest, RunReadyWaitsForEvaluations) {
    App::RunContext context;
    context.total_games_expected = 2;
    context.games_completed = 2;
    context.pending_evaluations = 1;

    EXPECT_FALSE(
        App::run_ready_to_finalize(context)
    );

    context.pending_evaluations = 0;

    EXPECT_TRUE(
        App::run_ready_to_finalize(context)
    );
}

TEST_F(AppTest, SkippedGamesCountAsHandled) {
    App::RunContext context;
    context.total_games_expected = 8;
    context.games_completed = 2;
    context.games_skipped = 6;

    EXPECT_TRUE(
        App::run_ready_to_finalize(context)
    );
}

TEST_F(AppTest, PendingGamesGeneration) {
    Core::Config config;
    config.max_pairs = 2;
    config.board_size = 15;
    config.bot1.cmd = "p1";
    config.bot2.cmd = "p2";

    auto context =
        std::make_shared<App::RunContext>();

    auto games =
        App::CLI::create_pending_games(
            config,
            {},
            std::nullopt,
            context,
            "id"
        );

    ASSERT_EQ(games.size(), 4);
    EXPECT_EQ(games[0].pair, 1);
    EXPECT_EQ(games[0].leg, 0);
    EXPECT_EQ(games[1].pair, 1);
    EXPECT_EQ(games[1].leg, 1);
}

TEST_F(AppTest, PendingGamesUseOpeningsByPair) {
    Core::Config config;
    config.max_pairs = 2;
    config.use_openings = true;
    config.board_size = 15;

    std::vector<std::vector<Core::Point>>
        openings = {
            {{7, 7}},
            {{8, 8}}
        };

    auto context =
        std::make_shared<App::RunContext>();

    auto games =
        App::CLI::create_pending_games(
            config,
            openings,
            std::nullopt,
            context,
            "id"
        );

    ASSERT_EQ(games.size(), 4);
    EXPECT_EQ(
        games[0].opening[0].x,
        7
    );
    EXPECT_EQ(
        games[1].opening[0].x,
        7
    );
    EXPECT_EQ(
        games[2].opening[0].x,
        8
    );
    EXPECT_EQ(
        games[3].opening[0].x,
        8
    );
}

TEST_F(AppTest, RejectsMissingConfiguredOpenings) {
    Core::Config config;
    config.max_pairs = 1;
    config.use_openings = true;
    config.board_size = 15;

    auto context =
        std::make_shared<App::RunContext>();

    EXPECT_THROW(
        App::CLI::create_pending_games(
            config,
            {},
            std::nullopt,
            context,
            "id"
        ),
        std::runtime_error
    );
}

TEST_F(AppTest, RejectsOutOfBoundsOpeningBeforeQueueing) {
    Core::Config config;
    config.max_pairs = 1;
    config.use_openings = true;
    config.board_size = 15;

    auto context =
        std::make_shared<App::RunContext>();

    EXPECT_THROW(
        App::CLI::create_pending_games(
            config,
            {{{15, 15}}},
            std::nullopt,
            context,
            "id"
        ),
        std::runtime_error
    );
}

TEST_F(AppTest, RejectsDuplicateOpeningBeforeQueueing) {
    Core::Config config;
    config.max_pairs = 1;
    config.use_openings = true;
    config.board_size = 15;

    auto context =
        std::make_shared<App::RunContext>();

    EXPECT_THROW(
        App::CLI::create_pending_games(
            config,
            {{{7, 7}, {8, 8}, {7, 7}}},
            std::nullopt,
            context,
            "id"
        ),
        std::runtime_error
    );
}

TEST_F(AppTest, NdjsonFormatFullStats) {
    Core::BatchConfig batch;
    batch.p1_cmd = "p1";
    batch.p2_cmd = "p2";

    Core::RunSpec run;
    App::MatchState state;
    Stats::Tracker stats;

    stats.p1_elo = 1200;
    stats.p2_elo = 1100;
    stats.p1_severe_errors = 5;
    stats.p1_moves_analyzed = 100;
    stats.p2_moves_analyzed = 100;

    std::string json =
        App::format_ndjson_line(
            batch,
            run,
            state,
            stats,
            10.0
        );

    EXPECT_NE(
        json.find("\"p1\":{"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"p2\":{"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"erf\":"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"time\":"),
        std::string::npos
    );
}
