#include "../common/test_utils.h"
#include "../mocks/curl_mock.h"
#include "../src/core/constants.h"
#include "../src/net/api_client.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <functional>
#include <memory>
#include <string>
#include <thread>
#include <vector>

using namespace Arena;

class ApiRecoveryTest :
    public ::testing::Test {
protected:
    std::shared_ptr<Net::ApiManager> api;

    void SetUp() override {
        CurlMock::reset();

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
        CurlMock::reset();
    }

    static Net::ApiManager::Event
    run_start(
        const std::string& run_id = "run"
    ) {
        Net::ApiManager::Event event;
        event.type = "run_start";
        event.run_id = run_id;
        event.p1_name = "A";
        event.p1v = "1.0";
        event.p2_name = "B";
        event.p2v = "2.0";
        event.total_games = 2;
        event.board_size = 20;
        return event;
    }

    static Net::ApiManager::Event
    run_update(
        const std::string& status = "live",
        int games_played = -1,
        const std::string& run_id = "run"
    ) {
        Net::ApiManager::Event event;
        event.type = "run_update";
        event.run_id = run_id;
        event.status = status;
        event.games_played =
            games_played >= 0
                ? games_played
                : status == "live"
                    ? 1
                    : 2;
        event.wins = 1;
        return event;
    }

    static Net::ApiManager::Event
    game_start(
        const std::string& external_id =
            "run_1_0",
        const std::string& run_id = "run"
    ) {
        Net::ApiManager::Event event;
        event.type = "start";
        event.run_id = run_id;
        event.ext_id = external_id;
        event.black_slot = 1;
        event.white_slot = 2;
        return event;
    }

    static Net::ApiManager::Event move(
        int x,
        int y,
        int color,
        const std::string& external_id =
            "run_1_0",
        const std::string& run_id = "run"
    ) {
        Net::ApiManager::Event event;
        event.type = "move";
        event.run_id = run_id;
        event.ext_id = external_id;
        event.x = x;
        event.y = y;
        event.c = color;
        return event;
    }

    static Net::ApiManager::Event result(
        const std::string& external_id =
            "run_1_0",
        const std::string& run_id = "run"
    ) {
        Net::ApiManager::Event event;
        event.type = "result";
        event.run_id = run_id;
        event.ext_id = external_id;
        event.winner = 1;
        event.moves =
            "10,10,1;11,11,2;12,10,1";
        return event;
    }

    void remember(
        const Net::ApiManager::Event& event
    ) {
        std::lock_guard<std::mutex> lock(
            api->mtx_
        );
        api->remember_locked(event);
    }

    void acknowledge(
        const std::vector<
            Net::ApiManager::Event
        >& events
    ) {
        std::lock_guard<std::mutex> lock(
            api->mtx_
        );
        api->acknowledge_locked(events);
    }

    bool pending() {
        return api->recovery_is_pending();
    }

    bool server_generation_is(
        const std::string& generation
    ) {
        std::lock_guard<std::mutex> lock(
            api->mtx_
        );

        return
            api->server_generation_ &&
            *api->server_generation_ ==
                generation;
    }

    static CurlMock::MockConfig generation(
        const std::string& value
    ) {
        CurlMock::MockConfig config;
        config.response_headers =
            "HTTP/1.1 200 OK\r\n"
            "X-Arena-Generation: " +
            value +
            "\r\n\r\n";
        return config;
    }

    static bool wait_until(
        const std::function<bool()>& predicate,
        int timeout_ms = 2000
    ) {
        auto deadline =
            std::chrono::steady_clock::now() +
            std::chrono::milliseconds(
                timeout_ms
            );

        while (
            std::chrono::steady_clock::now() <
            deadline
        ) {
            if (predicate()) {
                return true;
            }

            std::this_thread::sleep_for(
                std::chrono::milliseconds(2)
            );
        }

        return predicate();
    }

    static int body_count(
        const std::vector<
            CurlMock::CallRecord
        >& calls,
        const std::string& text
    ) {
        return static_cast<int>(
            std::count_if(
                calls.begin(),
                calls.end(),
                [&](const auto& call) {
                    return
                        call.post_data.find(text) !=
                        std::string::npos;
                }
            )
        );
    }
};

TEST_F(
    ApiRecoveryTest,
    ParsesGenerationHeadersCaseInsensitively
) {
    auto parsed =
        Net::ApiManager::
            generation_from_headers(
                "HTTP/1.1 200 OK\r\n"
                "x-ArEnA-GeNeRaTiOn: abc-123\r\n"
                "\r\n"
            );

    ASSERT_TRUE(parsed.has_value());
    EXPECT_EQ(*parsed, "abc-123");
}

TEST_F(
    ApiRecoveryTest,
    ReplaysActiveStateAfterGenerationChange
) {
    auto start = run_start();
    auto game = game_start();
    auto first = move(10, 10, 1);
    auto second = move(11, 11, 2);
    auto update = run_update();

    remember(start);
    remember(game);
    remember(first);
    remember(second);
    remember(update);

    Net::CurlHandle curl;
    ASSERT_TRUE(curl);

    CurlMock::configure(
        generation("one")
    );

    ASSERT_TRUE(
        api->send_batch(
            curl.get(),
            {start}
        )
    );

    CurlMock::configure(
        generation("two")
    );

    EXPECT_FALSE(
        api->send_batch(
            curl.get(),
            {second}
        )
    );

    EXPECT_TRUE(pending());
    EXPECT_TRUE(api->recover(curl.get()));
    EXPECT_FALSE(pending());

    const auto calls =
        CurlMock::get_calls();

    ASSERT_GE(calls.size(), 3U);

    const std::string& recovery =
        calls.back().post_data;

    size_t run_position =
        recovery.find(
            "\"type\":\"run_start\""
        );
    size_t game_position =
        recovery.find(
            "\"type\":\"start\""
        );
    size_t first_position =
        recovery.find("\"x\":10");
    size_t second_position =
        recovery.find("\"x\":11");
    size_t update_position =
        recovery.find(
            "\"type\":\"run_update\""
        );

    ASSERT_NE(
        run_position,
        std::string::npos
    );
    ASSERT_NE(
        game_position,
        std::string::npos
    );
    ASSERT_NE(
        first_position,
        std::string::npos
    );
    ASSERT_NE(
        second_position,
        std::string::npos
    );
    ASSERT_NE(
        update_position,
        std::string::npos
    );

    EXPECT_LT(run_position, game_position);
    EXPECT_LT(game_position, first_position);
    EXPECT_LT(first_position, second_position);
    EXPECT_LT(second_position, update_position);
}

TEST_F(
    ApiRecoveryTest,
    FailedRecoveryRemainsPendingUntilCompleteRetry
) {
    auto start = run_start();
    auto game = game_start();

    remember(start);
    remember(game);

    for (
        size_t index = 0;
        index <
            Core::Constants::API_BATCH_MAX;
        ++index
    ) {
        remember(
            move(
                static_cast<int>(
                    index % 20
                ),
                static_cast<int>(
                    index / 20
                ),
                static_cast<int>(
                    index % 2
                ) + 1
            )
        );
    }

    remember(run_update());

    Net::CurlHandle curl;
    ASSERT_TRUE(curl);

    CurlMock::configure(
        generation("one")
    );

    ASSERT_TRUE(
        api->send_batch(
            curl.get(),
            {start}
        )
    );

    CurlMock::configure(
        generation("two")
    );

    EXPECT_FALSE(
        api->send_batch(
            curl.get(),
            {game}
        )
    );

    int recovery_calls = 0;

    CurlMock::on_perform(
        [&](const auto&) {
            ++recovery_calls;

            return recovery_calls == 2
                ? CURLE_COULDNT_CONNECT
                : CURLE_OK;
        }
    );

    EXPECT_FALSE(
        api->recover(curl.get())
    );
    EXPECT_TRUE(pending());

    CurlMock::on_perform({});

    EXPECT_TRUE(
        api->recover(curl.get())
    );
    EXPECT_FALSE(pending());
    EXPECT_GE(recovery_calls, 2);
}

TEST_F(
    ApiRecoveryTest,
    RecoveryRestartsWhenGenerationChangesAgain
) {
    auto start = run_start();
    auto game = game_start();

    remember(start);
    remember(game);
    remember(move(10, 10, 1));
    remember(run_update());

    Net::CurlHandle curl;
    ASSERT_TRUE(curl);

    CurlMock::configure(
        generation("one")
    );

    ASSERT_TRUE(
        api->send_batch(
            curl.get(),
            {start}
        )
    );

    CurlMock::configure(
        generation("two")
    );

    ASSERT_FALSE(
        api->send_batch(
            curl.get(),
            {game}
        )
    );

    std::atomic<bool> changed{false};

    CurlMock::on_perform(
        [&](const auto&) {
            if (!changed.exchange(true)) {
                CurlMock::configure(
                    generation("three")
                );
            }

            return CURLE_OK;
        }
    );

    EXPECT_TRUE(api->recover(curl.get()));
    EXPECT_FALSE(pending());
    EXPECT_TRUE(
        server_generation_is("three")
    );

    const auto calls =
        CurlMock::get_calls();

    EXPECT_GE(calls.size(), 4U);
}

TEST_F(
    ApiRecoveryTest,
    TerminalStateIsReplayedAndPruned
) {
    auto start = run_start();
    auto game = game_start();
    auto completed = result();
    auto terminal =
        run_update("ended", 2);

    remember(start);
    remember(game);
    remember(completed);
    remember(terminal);

    Net::CurlHandle curl;
    ASSERT_TRUE(curl);

    CurlMock::configure(
        generation("one")
    );

    ASSERT_TRUE(
        api->send_batch(
            curl.get(),
            {start}
        )
    );

    CurlMock::configure(
        generation("two")
    );

    ASSERT_FALSE(
        api->send_batch(
            curl.get(),
            {terminal}
        )
    );

    ASSERT_TRUE(pending());
    ASSERT_TRUE(api->recover(curl.get()));
    EXPECT_FALSE(pending());

    const auto calls =
        CurlMock::get_calls();
    const auto& replay =
        calls.back().post_data;

    EXPECT_NE(
        replay.find(
            "\"type\":\"result\""
        ),
        std::string::npos
    );
    EXPECT_NE(
        replay.find(
            "\"status\":\"ended\""
        ),
        std::string::npos
    );

    std::lock_guard<std::mutex> lock(
        api->mtx_
    );

    EXPECT_TRUE(
        api->recovery_runs_.empty()
    );
    EXPECT_TRUE(
        api->recovery_games_.empty()
    );
}

TEST_F(
    ApiRecoveryTest,
    AcknowledgedResultsAndTerminalRunsArePruned
) {
    auto start = run_start();
    auto game = game_start();
    auto completed = result();
    auto terminal =
        run_update("ended");

    remember(start);
    remember(game);
    remember(completed);
    remember(terminal);

    {
        std::lock_guard<std::mutex> lock(
            api->mtx_
        );

        ASSERT_EQ(
            api->recovery_runs_.size(),
            1U
        );
        ASSERT_EQ(
            api->recovery_games_.size(),
            1U
        );
    }

    acknowledge({completed});

    {
        std::lock_guard<std::mutex> lock(
            api->mtx_
        );

        EXPECT_EQ(
            api->recovery_runs_.size(),
            1U
        );
        EXPECT_TRUE(
            api->recovery_games_.empty()
        );

        auto snapshot =
            api->recovery_snapshot_locked();

        EXPECT_EQ(
            std::count_if(
                snapshot.begin(),
                snapshot.end(),
                [](const auto& event) {
                    return
                        event.type == "result";
                }
            ),
            0
        );
    }

    acknowledge({terminal});

    {
        std::lock_guard<std::mutex> lock(
            api->mtx_
        );

        EXPECT_TRUE(
            api->recovery_runs_.empty()
        );
        EXPECT_TRUE(
            api->recovery_games_.empty()
        );
        EXPECT_TRUE(
            api->recovery_snapshot_locked()
                .empty()
        );
    }
}

TEST_F(
    ApiRecoveryTest,
    WorkerCompletesRecoveryBeforeResumingWithoutResendingOldBatch
) {
    CurlMock::configure(
        generation("one")
    );

    api->start();
    api->enqueue(run_start());

    ASSERT_TRUE(
        wait_until(
            [&]() {
                return
                    server_generation_is("one");
            }
        )
    );

    CurlMock::configure(
        generation("two")
    );

    std::atomic<bool> newer_queued{
        false
    };
    std::atomic<bool> replay_failed{
        false
    };

    CurlMock::on_perform(
        [&](const auto& call) {
            bool old_update =
                call.post_data.find(
                    "\"games_played\":5"
                ) != std::string::npos;

            bool recovery =
                call.post_data.find(
                    "\"type\":\"run_start\""
                ) != std::string::npos &&
                call.post_data.find(
                    "\"games_played\":10"
                ) != std::string::npos;

            if (
                old_update &&
                !newer_queued.exchange(true)
            ) {
                api->enqueue(
                    run_update("live", 10)
                );
            }

            if (
                recovery &&
                !replay_failed.exchange(true)
            ) {
                return CURLE_COULDNT_CONNECT;
            }

            return CURLE_OK;
        }
    );

    api->enqueue(
        run_update("live", 5)
    );

    ASSERT_TRUE(
        wait_until(
            [&]() {
                return replay_failed.load();
            }
        )
    );

    EXPECT_TRUE(pending());

    {
        const auto calls =
            CurlMock::get_calls();

        EXPECT_EQ(
            body_count(
                calls,
                "\"games_played\":5"
            ),
            1
        );

        EXPECT_EQ(
            std::count_if(
                calls.begin(),
                calls.end(),
                [](const auto& call) {
                    return
                        call.post_data.find(
                            "\"games_played\":10"
                        ) != std::string::npos &&
                        call.post_data.find(
                            "\"type\":\"run_start\""
                        ) == std::string::npos;
                }
            ),
            0
        );
    }

    CurlMock::on_perform({});
    api->stop();

    EXPECT_FALSE(pending());

    const auto calls =
        CurlMock::get_calls();

    EXPECT_EQ(
        body_count(
            calls,
            "\"games_played\":5"
        ),
        1
    );

    int failed_and_successful_replays =
        static_cast<int>(
            std::count_if(
                calls.begin(),
                calls.end(),
                [](const auto& call) {
                    return
                        call.post_data.find(
                            "\"type\":\"run_start\""
                        ) != std::string::npos &&
                        call.post_data.find(
                            "\"games_played\":10"
                        ) != std::string::npos;
                }
            )
        );

    EXPECT_GE(
        failed_and_successful_replays,
        2
    );

    int ordinary_new_updates =
        static_cast<int>(
            std::count_if(
                calls.begin(),
                calls.end(),
                [](const auto& call) {
                    return
                        call.post_data.find(
                            "\"games_played\":10"
                        ) != std::string::npos &&
                        call.post_data.find(
                            "\"type\":\"run_start\""
                        ) == std::string::npos;
                }
            )
        );

    EXPECT_EQ(ordinary_new_updates, 1);

    size_t first_new =
        calls.size();
    size_t last_old = 0;

    for (
        size_t index = 0;
        index < calls.size();
        ++index
    ) {
        if (
            calls[index].post_data.find(
                "\"games_played\":5"
            ) != std::string::npos
        ) {
            last_old = index;
        }

        if (
            calls[index].post_data.find(
                "\"games_played\":10"
            ) != std::string::npos
        ) {
            first_new =
                std::min(first_new, index);
        }
    }

    EXPECT_LT(last_old, first_new);
}
