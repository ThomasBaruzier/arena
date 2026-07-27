#include "../common/test_utils.h"
#include "../mocks/curl_mock.h"
#include "../src/core/constants.h"
#include "../src/net/api_client.h"
#include <algorithm>
#include <chrono>
#include <thread>

using namespace Arena;

class ApiTest : public ::testing::Test {
protected:
    std::shared_ptr<Net::ApiManager> api;

    void SetUp() override {
        CurlMock::reset();
        api = std::make_shared<Net::ApiManager>(
            "http://url",
            "key",
            0
        );
    }

    void TearDown() override {
        api.reset();
        CurlMock::reset();
    }

    static Net::ApiManager::Event event(
        const std::string& type,
        const std::string& run = ""
    ) {
        Net::ApiManager::Event value;
        value.type = type;
        value.run_id = run;
        return value;
    }
};

TEST_F(ApiTest, EventJsonStructure) {
    auto value = event("move");
    value.x = 5;
    value.y = 10;
    value.c = 1;

    std::string json = api->build_event_json(value);

    EXPECT_NE(
        json.find("\"type\":\"move\""),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"x\":5"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"y\":10"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"c\":1"),
        std::string::npos
    );
}

TEST_F(ApiTest, ResultEvent) {
    auto value = event("result");
    value.winner = 1;
    value.moves = "a1b2";

    std::string json = api->build_event_json(value);

    EXPECT_NE(
        json.find("\"type\":\"result\""),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"winner\":1"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"moves\":\"a1b2\""),
        std::string::npos
    );
}

TEST_F(ApiTest, InjectionProtection) {
    auto value = event("run_start");
    value.p1_name = "\", \"admin\": true";
    value.p1v = "v1";
    value.p2_name = "bot2";
    value.p2v = "v2";

    std::string json = api->build_event_json(value);

    EXPECT_NE(
        json.find("\\\""),
        std::string::npos
    );
    EXPECT_EQ(
        json.find("\", \"admin\""),
        std::string::npos
    );
}

TEST_F(ApiTest, BatchFormat) {
    std::vector<Net::ApiManager::Event> batch = {
        event("a"),
        event("b")
    };

    std::string json = api->build_json_payload(batch);

    EXPECT_EQ(json.front(), '[');
    EXPECT_EQ(json.back(), ']');
    EXPECT_NE(
        json.find("},{"),
        std::string::npos
    );
}

TEST_F(ApiTest, RunStartEvent) {
    auto value = event("run_start", "run123");
    value.p1_name = "bot1";
    value.p1v = "v1";
    value.p2_name = "bot2";
    value.p2v = "v2";
    value.p1_cmd = "./bot1";
    value.p2_cmd = "./bot2";
    value.config_label = "test_conf";
    value.total_games = 100;
    value.p1_nodes = 1000;
    value.p2_nodes = 2000;
    value.eval_nodes = 500;
    value.board_size = 15;
    value.min_pairs = 1;
    value.max_pairs = 5;
    value.repeat_index = 0;
    value.seed = 12345ULL;

    std::string json = api->build_event_json(value);

    EXPECT_NE(
        json.find("\"type\":\"run_start\""),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"run_id\":\"run123\""),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"p1_nodes\":1000"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"slots\":["),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"slot\":1"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"cmd\":\".\\/bot1\""),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"slot\":2"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"cmd\":\".\\/bot2\""),
        std::string::npos
    );
    EXPECT_EQ(
        json.find("\"mtime\""),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"seed\":12345"),
        std::string::npos
    );
}

TEST_F(ApiTest, RunUpdateEvent) {
    auto value = event("run_update", "run123");
    value.games_played = 10;
    value.wins = 5;
    value.losses = 2;
    value.draws = 3;
    value.wall_time_ms = 5000;
    value.p1_elo = 1200;
    value.p2_elo = 1150;

    std::string json = api->build_event_json(value);

    EXPECT_NE(
        json.find("\"type\":\"run_update\""),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"games_played\":10"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\"p1_elo\":1200"),
        std::string::npos
    );
}

TEST_F(ApiTest, EmptyBatch) {
    std::vector<Net::ApiManager::Event> batch;

    EXPECT_EQ(api->build_json_payload(batch), "[]");
}

TEST_F(ApiTest, NullSeedRendering) {
    auto value = event("run_start", "test");

    std::string json = api->build_event_json(value);

    EXPECT_NE(
        json.find("\"seed\":null"),
        std::string::npos
    );
}

TEST_F(ApiTest, SeedPresentRendering) {
    auto value = event("run_start", "test");
    value.seed = 42ULL;

    std::string json = api->build_event_json(value);

    EXPECT_NE(
        json.find("\"seed\":42"),
        std::string::npos
    );
}

TEST_F(ApiTest, LargeBatchFormat) {
    std::vector<Net::ApiManager::Event> batch(100);

    for (int i = 0; i < 100; ++i) {
        batch[i].type = "move";
        batch[i].x = i;
    }

    std::string json = api->build_json_payload(batch);

    EXPECT_EQ(json.front(), '[');
    EXPECT_EQ(json.back(), ']');

    int separators = 0;

    for (size_t i = 1; i + 1 < json.size(); ++i) {
        if (json[i] == ',' && json[i - 1] == '}') {
            ++separators;
        }
    }

    EXPECT_EQ(separators, 99);
}

TEST_F(ApiTest, SpecialCharsInNames) {
    auto value = event("run_start");
    value.p1_name = "bot\twith\ttabs";
    value.p2_name = "bot\nwith\nnewlines";

    std::string json = api->build_event_json(value);

    EXPECT_NE(
        json.find("\\t"),
        std::string::npos
    );
    EXPECT_NE(
        json.find("\\n"),
        std::string::npos
    );
}

TEST_F(ApiTest, BooleanFieldRendering) {
    auto value = event("run_update");
    value.is_done = true;

    std::string json = api->build_event_json(value);

    EXPECT_NE(
        json.find("\"is_done\":true"),
        std::string::npos
    );
}

TEST_F(ApiTest, AllEventTypes) {
    auto start = event("start", "r1");
    start.black_slot = 2;
    start.white_slot = 1;

    std::string start_json =
        api->build_event_json(start);

    EXPECT_NE(
        start_json.find("\"black_slot\":2"),
        std::string::npos
    );
    EXPECT_NE(
        start_json.find("\"white_slot\":1"),
        std::string::npos
    );

    auto move = event("move");
    move.x = 7;
    move.y = 8;
    move.c = 1;

    std::string move_json =
        api->build_event_json(move);

    EXPECT_NE(
        move_json.find("\"x\":7"),
        std::string::npos
    );
    EXPECT_NE(
        move_json.find("\"y\":8"),
        std::string::npos
    );

    auto result = event("result");
    result.winner = 2;
    result.moves = "0,0,1;1,1,2";

    std::string result_json =
        api->build_event_json(result);

    EXPECT_NE(
        result_json.find("\"winner\":2"),
        std::string::npos
    );
}

TEST_F(ApiTest, CoalescesProgressUpdatesByRun) {
    auto first = event("run_update", "run1");
    first.games_played = 1;

    auto other = event("run_update", "run2");
    other.games_played = 4;

    auto latest = event("run_update", "run1");
    latest.games_played = 7;

    api->enqueue(first);
    api->enqueue(other);
    api->enqueue(latest);

    ASSERT_EQ(api->queue_.size(), 2);

    auto run1 = std::find_if(
        api->queue_.begin(),
        api->queue_.end(),
        [](const auto& queued) {
            return queued.run_id == "run1";
        }
    );

    ASSERT_NE(run1, api->queue_.end());
    EXPECT_EQ(run1->games_played, 7);
    EXPECT_EQ(api->queue_.back().run_id, "run1");
}

TEST_F(ApiTest, FinalRunUpdateIsNotCoalesced) {
    auto progress = event("run_update", "run1");
    progress.games_played = 2;

    auto final = event("run_update", "run1");
    final.games_played = 4;
    final.is_done = true;

    api->enqueue(progress);
    api->enqueue(final);

    ASSERT_EQ(api->queue_.size(), 2);
    EXPECT_FALSE(api->queue_.front().is_done);
    EXPECT_TRUE(api->queue_.back().is_done);
}

TEST_F(ApiTest, EvictsProgressBeforeCriticalEvent) {
    auto progress = event("run_update", "progress");
    api->enqueue(progress);

    for (
        size_t i = 1;
        i < Core::Constants::API_QUEUE_MAX;
        ++i
    ) {
        auto start = event("start");
        start.ext_id = std::to_string(i);
        api->enqueue(std::move(start));
    }

    auto result = event("result");
    result.ext_id = "result";
    api->enqueue(result);

    ASSERT_EQ(
        api->queue_.size(),
        Core::Constants::API_QUEUE_MAX
    );

    EXPECT_EQ(
        std::count_if(
            api->queue_.begin(),
            api->queue_.end(),
            [](const auto& queued) {
                return queued.type == "run_update" &&
                    !queued.is_done;
            }
        ),
        0
    );

    EXPECT_TRUE(
        std::any_of(
            api->queue_.begin(),
            api->queue_.end(),
            [](const auto& queued) {
                return queued.type == "result" &&
                    queued.ext_id == "result";
            }
        )
    );
}

TEST_F(ApiTest, EvictsMoveBeforeCriticalEvent) {
    auto move = event("move");
    move.ext_id = "old-move";
    api->enqueue(move);

    for (
        size_t i = 1;
        i < Core::Constants::API_QUEUE_MAX;
        ++i
    ) {
        auto start = event("start");
        start.ext_id = std::to_string(i);
        api->enqueue(std::move(start));
    }

    auto result = event("result");
    result.ext_id = "result";
    api->enqueue(result);

    ASSERT_EQ(
        api->queue_.size(),
        Core::Constants::API_QUEUE_MAX
    );

    EXPECT_FALSE(
        std::any_of(
            api->queue_.begin(),
            api->queue_.end(),
            [](const auto& queued) {
                return queued.type == "move" &&
                    queued.ext_id == "old-move";
            }
        )
    );

    EXPECT_TRUE(
        std::any_of(
            api->queue_.begin(),
            api->queue_.end(),
            [](const auto& queued) {
                return queued.type == "result" &&
                    queued.ext_id == "result";
            }
        )
    );
}

TEST_F(ApiTest, DropsIncomingWhenOnlyCriticalEventsRemain) {
    for (
        size_t i = 0;
        i < Core::Constants::API_QUEUE_MAX;
        ++i
    ) {
        auto start = event("start");
        start.ext_id = std::to_string(i);
        api->enqueue(std::move(start));
    }

    size_t dropped_before = api->dropped_;

    auto result = event("result");
    result.ext_id = "cannot-fit";
    api->enqueue(result);

    EXPECT_EQ(
        api->queue_.size(),
        Core::Constants::API_QUEUE_MAX
    );
    EXPECT_EQ(api->dropped_, dropped_before + 1);
    EXPECT_FALSE(
        std::any_of(
            api->queue_.begin(),
            api->queue_.end(),
            [](const auto& queued) {
                return queued.ext_id == "cannot-fit";
            }
        )
    );
}

TEST_F(ApiTest, StartAndStopAreIdempotent) {
    api->start();
    api->start();

    api->enqueue(event("move"));

    EXPECT_NO_THROW(api->stop());
    EXPECT_NO_THROW(api->stop());
    EXPECT_FALSE(api->started_);
    EXPECT_FALSE(api->accepting_);
}

TEST_F(ApiTest, ExplicitStopAndDestructorAreSafe) {
    auto manager = std::make_shared<Net::ApiManager>(
        "http://url",
        "key",
        0
    );

    manager->start();
    manager->enqueue(event("move"));
    manager->stop();

    EXPECT_NO_THROW(manager.reset());
}

TEST_F(ApiTest, PermanentFailureDoesNotBlockProducers) {
    CurlMock::fail_perform();
    api->start();

    auto begin = std::chrono::steady_clock::now();

    for (int i = 0; i < 20000; ++i) {
        auto move = event("move");
        move.x = i;
        api->enqueue(std::move(move));
    }

    auto enqueue_elapsed =
        std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - begin
        ).count();

    auto stop_begin = std::chrono::steady_clock::now();
    api->stop();
    auto stop_elapsed =
        std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - stop_begin
        ).count();

    EXPECT_LT(enqueue_elapsed, 2000);
    EXPECT_LT(stop_elapsed, 2000);
    EXPECT_GT(api->dropped_, 0);
}

TEST_F(ApiTest, CurlInitializationFailureDisablesDelivery) {
    CurlMock::fail_init();
    api->start();

    for (int i = 0; i < 100; ++i) {
        {
            std::lock_guard<std::mutex> lock(api->mtx_);
            if (api->disabled_) break;
        }
        std::this_thread::sleep_for(
            std::chrono::milliseconds(2)
        );
    }

    {
        std::lock_guard<std::mutex> lock(api->mtx_);
        EXPECT_TRUE(api->disabled_);
        EXPECT_FALSE(api->accepting_);
    }

    EXPECT_NO_THROW(api->stop());
}

TEST_F(ApiTest, SuccessfulWorkerPreservesBatchOrder) {
    api->start();

    for (int i = 0; i < 3; ++i) {
        auto move = event("move");
        move.x = i;
        api->enqueue(std::move(move));
    }

    api->stop();

    auto calls = CurlMock::get_calls();
    ASSERT_FALSE(calls.empty());

    const auto& body = calls.front().post_data;
    size_t first = body.find("\"x\":0");
    size_t second = body.find("\"x\":1");
    size_t third = body.find("\"x\":2");

    ASSERT_NE(first, std::string::npos);
    ASSERT_NE(second, std::string::npos);
    ASSERT_NE(third, std::string::npos);
    EXPECT_LT(first, second);
    EXPECT_LT(second, third);
}

TEST_F(ApiTest, OnlyTwoHundredsAreSuccessful) {
    std::vector<Net::ApiManager::Event> batch = {
        event("move")
    };

    for (long status : {200L, 204L, 299L}) {
        CurlMock::reset();
        CurlMock::MockConfig config;
        config.http_code = status;
        CurlMock::configure(config);

        Net::CurlHandle curl;
        ASSERT_TRUE(curl);
        EXPECT_TRUE(api->send_batch(curl.get(), batch));
    }

    for (long status : {199L, 300L, 302L, 400L, 500L}) {
        CurlMock::reset();
        CurlMock::MockConfig config;
        config.http_code = status;
        CurlMock::configure(config);

        Net::CurlHandle curl;
        ASSERT_TRUE(curl);
        EXPECT_FALSE(api->send_batch(curl.get(), batch));
    }
}

TEST_F(ApiTest, TransportFailureIsNotSuccessful) {
    CurlMock::fail_perform();

    Net::CurlHandle curl;
    ASSERT_TRUE(curl);

    std::vector<Net::ApiManager::Event> batch = {
        event("move")
    };

    EXPECT_FALSE(api->send_batch(curl.get(), batch));
}
