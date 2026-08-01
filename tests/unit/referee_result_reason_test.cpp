#include "../common/test_utils.h"
#include "../src/game/referee.h"
#include "../src/net/api_client.h"

using namespace Arena;

class RefereeResultReasonTest :
    public ::testing::Test {
protected:
    std::shared_ptr<
        Net::ApiManager
    > api;

    std::shared_ptr<
        App::RunContext
    > context;

    Stats::Tracker stats;

    App::GameParams params;

    void SetUp() override {
        api =
            std::make_shared<
                Net::ApiManager
            >(
                "http://url",
                "key",
                0
            );

        context =
            std::make_shared<
                App::RunContext
            >();

        context->id = "run";
        context->cfg.board_size = 20;
        context->total_games_expected = 2;

        params.pair = 1;
        params.leg = 0;
        params.run_id = "run";
        params.context = context;
        params.p1_cfg.cmd = "alpha";
        params.p2_cfg.cmd = "beta";
    }

    Net::ApiManager::Event result_event(
        double result,
        Game::Referee::ResultReason reason
    ) {
        Game::Referee referee(
            params,
            api,
            stats,
            TestHelpers::make_handler()
        );

        referee.start_sent_ = true;
        referee.hist_ = {
            {10, 10}
        };

        referee.send_result_event(
            result,
            reason,
            42
        );

        std::lock_guard<std::mutex> lock(
            api->mtx_
        );

        return api->queue_.back();
    }
};

TEST_F(
    RefereeResultReasonTest,
    CarriesLineReason
) {
    auto event =
        result_event(
            1.0,
            Game::Referee::
                ResultReason::LINE
        );

    EXPECT_EQ(event.winner, 1);
    EXPECT_EQ(event.reason, "line");
}

TEST_F(
    RefereeResultReasonTest,
    CarriesDrawReason
) {
    auto event =
        result_event(
            0.5,
            Game::Referee::
                ResultReason::DRAW
        );

    EXPECT_EQ(event.winner, 3);
    EXPECT_EQ(event.reason, "draw");
}

TEST_F(
    RefereeResultReasonTest,
    CarriesAdjudicationReason
) {
    auto event =
        result_event(
            0.0,
            Game::Referee::
                ResultReason::
                    ADJUDICATION
        );

    EXPECT_EQ(event.winner, 2);
    EXPECT_EQ(
        event.reason,
        "adjudication"
    );
}

TEST_F(
    RefereeResultReasonTest,
    CarriesVoidReason
) {
    auto event =
        result_event(
            -1.0,
            Game::Referee::
                ResultReason::VOID
        );

    EXPECT_EQ(event.winner, 4);
    EXPECT_EQ(event.reason, "void");
}
