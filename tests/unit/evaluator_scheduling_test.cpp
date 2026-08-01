#include "../common/test_utils.h"
#include "../src/app/worker.h"
#include "../src/sys/signals.h"

using namespace Arena;

class EvaluatorSchedulingTest :
    public ::testing::Test {
protected:
    void SetUp() override {
        Sys::g_stop_flag = 0;
    }

    void TearDown() override {
        Sys::g_stop_flag = 0;
    }

    struct StateFixture {
        std::deque<App::EvalJob>
            eval_queue;
        std::deque<
            std::shared_ptr<
                Game::Referee
            >
        > game_queue;
        std::deque<App::GameParams>
            global_game_queue;
        std::mutex task_mtx;
        std::condition_variable task_cv;
        std::atomic<int> active_games{0};
        std::atomic<int>
            evaluator_workers_initializing{0};
        std::atomic<int>
            evaluator_workers_available{0};
        std::shared_ptr<
            Net::ApiManager
        > api =
            std::make_shared<
                Net::ApiManager
            >(
                "http://url",
                "key",
                0
            );
        std::vector<
            std::shared_ptr<
                App::RunContext
            >
        > contexts;
        Core::BatchConfig batch;
        std::ofstream ndjson;
        std::mutex ndjson_mtx;

        App::WorkerState state() {
            return {
                eval_queue,
                game_queue,
                global_game_queue,
                task_mtx,
                task_cv,
                active_games,
                evaluator_workers_initializing,
                evaluator_workers_available,
                api,
                contexts,
                batch,
                ndjson,
                ndjson_mtx
            };
        }
    };
};

TEST_F(
    EvaluatorSchedulingTest,
    HealthyEvaluatorCanClaimWork
) {
    EXPECT_TRUE(
        App::can_claim_evaluation(
            true,
            3,
            1
        )
    );
}

TEST_F(
    EvaluatorSchedulingTest,
    WorkerWithoutEvaluatorWaitsForHealthyWorker
) {
    EXPECT_FALSE(
        App::can_claim_evaluation(
            false,
            0,
            1
        )
    );
}

TEST_F(
    EvaluatorSchedulingTest,
    WorkerWithoutEvaluatorWaitsForStartup
) {
    EXPECT_FALSE(
        App::can_claim_evaluation(
            false,
            1,
            0
        )
    );
}

TEST_F(
    EvaluatorSchedulingTest,
    WorkerDrainsUnavailableWorkAfterAllFailures
) {
    EXPECT_TRUE(
        App::can_claim_evaluation(
            false,
            0,
            0
        )
    );
}

TEST_F(
    EvaluatorSchedulingTest,
    HealthyApiDoesNotStopWorkers
) {
    StateFixture fixture;

    auto first =
        std::make_shared<
            App::RunContext
        >();

    auto second =
        std::make_shared<
            App::RunContext
        >();

    fixture.contexts = {
        first,
        second
    };

    auto state =
        fixture.state();

    EXPECT_FALSE(
        App::stop_on_api_failure(
            state
        )
    );

    EXPECT_FALSE(
        first->failed.load()
    );

    EXPECT_FALSE(
        first->stop_flag.load()
    );

    EXPECT_FALSE(
        second->failed.load()
    );

    EXPECT_FALSE(
        second->stop_flag.load()
    );

    EXPECT_EQ(
        Sys::g_stop_flag,
        0
    );
}

TEST_F(
    EvaluatorSchedulingTest,
    FailedApiStopsEveryRun
) {
    StateFixture fixture;

    auto first =
        std::make_shared<
            App::RunContext
        >();

    auto second =
        std::make_shared<
            App::RunContext
        >();

    fixture.contexts = {
        first,
        second
    };

    {
        std::lock_guard<std::mutex> lock(
            fixture.api->mtx_
        );

        fixture.api->failed_ = true;
    }

    auto state =
        fixture.state();

    EXPECT_TRUE(
        App::stop_on_api_failure(
            state
        )
    );

    EXPECT_TRUE(
        first->failed.load()
    );

    EXPECT_TRUE(
        first->stop_flag.load()
    );

    EXPECT_TRUE(
        second->failed.load()
    );

    EXPECT_TRUE(
        second->stop_flag.load()
    );

    EXPECT_EQ(
        Sys::g_stop_flag,
        1
    );
}

TEST_F(
    EvaluatorSchedulingTest,
    NdjsonDeclaresConfiguredAnalysis
) {
    Core::BatchConfig batch;
    batch.eval_cmd = "evaluator";

    Core::RunSpec run;
    App::MatchState state;
    Stats::Tracker stats;

    std::string json =
        App::format_ndjson_line(
            batch,
            run,
            state,
            stats,
            1.0,
            "ended"
        );

    EXPECT_NE(
        json.find(
            "\"analysis_enabled\":true"
        ),
        std::string::npos
    );
}

TEST_F(
    EvaluatorSchedulingTest,
    NdjsonDeclaresDisabledAnalysis
) {
    Core::BatchConfig batch;
    Core::RunSpec run;
    App::MatchState state;
    Stats::Tracker stats;

    std::string json =
        App::format_ndjson_line(
            batch,
            run,
            state,
            stats,
            1.0,
            "ended"
        );

    EXPECT_NE(
        json.find(
            "\"analysis_enabled\":false"
        ),
        std::string::npos
    );
}
