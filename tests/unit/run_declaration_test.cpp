#include "../common/test_utils.h"
#include "../src/game/referee.h"
#include "../src/net/api_client.h"

using namespace Arena;

class RunDeclarationTest :
    public ::testing::Test {
protected:
    std::shared_ptr<
        Net::ApiManager
    > api;

    void SetUp() override {
        api =
            std::make_shared<
                Net::ApiManager
            >(
                "http://url",
                "key",
                0
            );
    }

    void TearDown() override {
        api.reset();
    }

    Net::ApiManager::Event declare_run(
        bool analysis_enabled
    ) {
        App::GameParams params;
        params.pair = 1;
        params.leg = 0;
        params.run_id = "run";
        params.p1_cfg.cmd = "alpha";
        params.p2_cfg.cmd = "beta";
        params.context =
            std::make_shared<
                App::RunContext
            >();
        params.context->id = "run";
        params.context->cfg.board_size = 20;
        params.context->cfg.eval_path =
            analysis_enabled
                ? "evaluator"
                : "";
        params.context->total_games_expected = 20;

        Stats::Tracker stats;

        Game::Referee referee(
            params,
            api,
            stats,
            TestHelpers::make_handler()
        );

        referee.send_run_start_event_if_needed(
            params.context
        );

        std::lock_guard<std::mutex> lock(
            api->mtx_
        );

        return api->queue_.back();
    }
};

TEST_F(
    RunDeclarationTest,
    DeclaresConfiguredAnalysis
) {
    auto event = declare_run(true);

    EXPECT_TRUE(
        event.analysis_enabled
    );

    std::string json =
        api->build_event_json(event);

    EXPECT_NE(
        json.find(
            "\"analysis_enabled\":true"
        ),
        std::string::npos
    );
}

TEST_F(
    RunDeclarationTest,
    DeclaresDisabledAnalysis
) {
    auto event = declare_run(false);

    EXPECT_FALSE(
        event.analysis_enabled
    );

    std::string json =
        api->build_event_json(event);

    EXPECT_NE(
        json.find(
            "\"analysis_enabled\":false"
        ),
        std::string::npos
    );
}

TEST_F(
    RunDeclarationTest,
    RecoveryPreservesAnalysisDeclaration
) {
    auto event = declare_run(true);

    std::lock_guard<std::mutex> lock(
        api->mtx_
    );

    auto snapshot =
        api->recovery_snapshot_locked();

    ASSERT_FALSE(snapshot.empty());
    EXPECT_EQ(
        snapshot.front().type,
        "run_start"
    );
    EXPECT_TRUE(
        snapshot.front().analysis_enabled
    );
}
