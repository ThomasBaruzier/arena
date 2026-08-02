#include "../common/test_utils.h"
#include "../mocks/curl_mock.h"
#include "../src/core/constants.h"
#include "../src/net/api_client.h"
#include <algorithm>
#include <vector>

using namespace Arena;

class ApiTest :
    public ::testing::Test {
protected:
    std::shared_ptr<
        Net::ApiManager
    > api;

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
    event(
        const std::string& type,
        const std::string& run = ""
    ) {
        Net::ApiManager::Event value;
        value.type = type;
        value.run_id = run;
        return value;
    }

    static Net::ApiManager::Event
    result(
        const std::string& reason
    ) {
        auto value = event(
            "result",
            "run"
        );

        value.ext_id = "run_1_0";
        value.reason = reason;
        value.moves = "10,10,1";
        value.duration = 42;

        if (reason == "line") {
            value.winner = 1;
            value.moves =
                "10,10,1;0,1,2;11,10,1;1,1,2;12,10,1;2,1,2;13,10,1;3,1,2;14,10,1";
        } else if (
            reason == "draw"
        ) {
            value.winner = 3;
        } else if (
            reason == "void"
        ) {
            value.winner = 4;
            value.moves.clear();
        } else {
            value.winner = 2;
        }

        return value;
    }
};

TEST_F(
    ApiTest,
    SerializesExplicitResultReasons
) {
    for (
        const char* reason :
        {
            "line",
            "draw",
            "adjudication",
            "void"
        }
    ) {
        std::string json =
            api->build_event_json(
                result(reason)
            );

        EXPECT_NE(
            json.find(
                std::string(
                    "\"reason\":\""
                ) +
                reason +
                "\""
            ),
            std::string::npos
        );
    }
}

TEST_F(
    ApiTest,
    DoesNotInferResultReason
) {
    auto value =
        result("adjudication");

    value.moves =
        "10,10,1;0,1,2;11,10,1;1,1,2;12,10,1;2,1,2;13,10,1;3,1,2;14,10,1";

    std::string json =
        api->build_event_json(
            value
        );

    EXPECT_NE(
        json.find(
            "\"reason\":\"adjudication\""
        ),
        std::string::npos
    );

    EXPECT_EQ(
        json.find(
            "\"reason\":\"line\""
        ),
        std::string::npos
    );
}

TEST_F(
    ApiTest,
    CoalescesLiveRunUpdates
) {
    auto first = event(
        "run_update",
        "run"
    );

    first.status = "live";
    first.games_played = 1;

    auto latest = first;
    latest.games_played = 8;

    api->enqueue(first);
    api->enqueue(latest);

    ASSERT_EQ(
        api->queue_.size(),
        1U
    );

    EXPECT_EQ(
        api->queue_.front()
            .games_played,
        8
    );
}

TEST_F(
    ApiTest,
    TerminalUpdateSupersedesQueuedProgress
) {
    auto progress = event(
        "run_update",
        "run"
    );

    progress.status = "live";
    progress.games_played = 4;

    auto terminal = progress;
    terminal.status = "ended";
    terminal.games_played = 6;

    api->enqueue(progress);
    api->enqueue(terminal);

    ASSERT_EQ(
        api->queue_.size(),
        1U
    );

    EXPECT_EQ(
        api->queue_.front().status,
        "ended"
    );

    EXPECT_EQ(
        api->queue_.front()
            .games_played,
        6
    );

    EXPECT_EQ(api->dropped_, 1U);
}

TEST_F(
    ApiTest,
    TerminalUpdatePreservesOtherRunProgress
) {
    auto first = event(
        "run_update",
        "first"
    );

    first.status = "live";

    auto second = event(
        "run_update",
        "second"
    );

    second.status = "live";

    auto terminal = first;
    terminal.status = "stopped";

    api->enqueue(first);
    api->enqueue(second);
    api->enqueue(terminal);

    ASSERT_EQ(
        api->queue_.size(),
        2U
    );

    EXPECT_TRUE(
        std::any_of(
            api->queue_.begin(),
            api->queue_.end(),
            [](const auto& queued) {
                return
                    queued.run_id ==
                        "second" &&
                    queued.status ==
                        "live";
            }
        )
    );

    EXPECT_TRUE(
        std::any_of(
            api->queue_.begin(),
            api->queue_.end(),
            [](const auto& queued) {
                return
                    queued.run_id ==
                        "first" &&
                    queued.status ==
                        "stopped";
            }
        )
    );
}

TEST_F(
    ApiTest,
    DropsOnlyReplaceableProgressAtSoftLimit
) {
    for (
        size_t index = 0;
        index <
            Core::Constants::
                API_QUEUE_MAX;
        ++index
    ) {
        auto update = event(
            "run_update",
            std::to_string(index)
        );

        update.status = "live";

        api->queue_.push_back(
            update
        );
    }

    api->enqueue(
        result("void")
    );

    EXPECT_EQ(
        api->queue_.size(),
        Core::Constants::
            API_QUEUE_MAX
    );

    EXPECT_TRUE(
        std::any_of(
            api->queue_.begin(),
            api->queue_.end(),
            [](const auto& queued) {
                return
                    queued.type ==
                    "result";
            }
        )
    );

    EXPECT_FALSE(api->failed());
}

TEST_F(
    ApiTest,
    PreservesLosslessEventsBeyondSoftLimit
) {
    for (
        size_t index = 0;
        index <
            Core::Constants::
                API_QUEUE_MAX;
        ++index
    ) {
        auto move = event(
            "move",
            "run"
        );

        move.ext_id =
            "run_" +
            std::to_string(index) +
            "_0";

        api->queue_.push_back(
            move
        );
    }

    api->enqueue(
        result("void")
    );

    EXPECT_EQ(
        api->queue_.size(),
        Core::Constants::
            API_QUEUE_MAX +
            1
    );

    EXPECT_FALSE(api->failed());
}

TEST_F(
    ApiTest,
    HardLimitFailsAndBoundsTelemetry
) {
    for (
        size_t index = 0;
        index <
            Core::Constants::
                API_QUEUE_HARD_MAX;
        ++index
    ) {
        auto move = event(
            "move",
            "run"
        );

        move.ext_id =
            "run_" +
            std::to_string(index) +
            "_0";

        api->queue_.push_back(
            move
        );
    }

    api->enqueue(
        result("void")
    );

    EXPECT_TRUE(api->failed());
    EXPECT_TRUE(api->disabled_);
    EXPECT_FALSE(api->accepting_);
    EXPECT_TRUE(api->queue_.empty());
}

TEST_F(
    ApiTest,
    TreatsProtocolRejectionAsPermanent
) {
    CurlMock::MockConfig config;
    config.http_code = 422;
    config.response_body =
        "{\"error\":\"invalid event\"}";

    CurlMock::configure(config);

    Net::CurlHandle curl;
    ASSERT_TRUE(curl);

    EXPECT_EQ(
        api->deliver_batch(
            curl.get(),
            {
                event(
                    "move",
                    "run"
                )
            }
        ),
        Net::ApiManager::
            DeliveryResult::
                REJECTED
    );
}

TEST_F(
    ApiTest,
    RetriesTransientStatuses
) {
    for (
        long status :
        {
            408L,
            425L,
            429L,
            500L,
            503L
        }
    ) {
        CurlMock::reset();

        CurlMock::MockConfig config;
        config.http_code = status;

        CurlMock::configure(config);

        Net::CurlHandle curl;
        ASSERT_TRUE(curl);

        EXPECT_EQ(
            api->deliver_batch(
                curl.get(),
                {
                    event(
                        "move",
                        "run"
                    )
                }
            ),
            Net::ApiManager::
                DeliveryResult::
                    RETRYABLE
        );
    }
}

TEST_F(
    ApiTest,
    RequiresGenerationOnSuccess
) {
    CurlMock::MockConfig config;
    config.response_headers =
        "HTTP/1.1 200 OK\r\n\r\n";

    CurlMock::configure(config);

    Net::CurlHandle curl;
    ASSERT_TRUE(curl);

    EXPECT_EQ(
        api->deliver_batch(
            curl.get(),
            {
                event(
                    "move",
                    "run"
                )
            }
        ),
        Net::ApiManager::
            DeliveryResult::
                REJECTED
    );
}

TEST_F(
    ApiTest,
    RequiresStrictSuccessBody
) {
    for (
        const char* body :
        {
            "",
            "{}",
            "{\"success\":false}",
            "{\"ok\":true}",
            "{ \"success\": true }",
            "{\"success\": tr ue}"
        }
    ) {
        CurlMock::reset();

        CurlMock::MockConfig config;
        config.response_body = body;

        CurlMock::configure(config);

        Net::CurlHandle curl;
        ASSERT_TRUE(curl);

        EXPECT_EQ(
            api->deliver_batch(
                curl.get(),
                {
                    event(
                        "move",
                        "run"
                    )
                }
            ),
            Net::ApiManager::
                DeliveryResult::
                    REJECTED
        );
    }
}

TEST_F(
    ApiTest,
    AcceptsBoundaryWhitespaceInSuccessBody
) {
    CurlMock::MockConfig config;
    config.response_body =
        " \n\t{\"success\":true}\r\n ";

    CurlMock::configure(config);

    Net::CurlHandle curl;
    ASSERT_TRUE(curl);

    EXPECT_EQ(
        api->deliver_batch(
            curl.get(),
            {
                event(
                    "move",
                    "run"
                )
            }
        ),
        Net::ApiManager::
            DeliveryResult::
                DELIVERED
    );
}

TEST_F(
    ApiTest,
    PermanentRejectionMarksManagerFailed
) {
    CurlMock::MockConfig config;
    config.http_code = 422;
    config.response_body =
        "{\"error\":\"invalid event\"}";

    CurlMock::configure(config);

    api->start();

    auto move = event(
        "move",
        "run"
    );

    move.ext_id = "run_1_0";

    api->enqueue(move);
    api->stop();

    EXPECT_TRUE(api->failed());
}

TEST_F(
    ApiTest,
    PreservesSuccessfulDeliveryOrder
) {
    api->start();

    for (
        int index = 0;
        index < 3;
        ++index
    ) {
        auto move = event(
            "move",
            "run"
        );

        move.ext_id = "run_1_0";
        move.x = index;

        api->enqueue(
            std::move(move)
        );
    }

    api->stop();

    const auto calls =
        CurlMock::get_calls();

    ASSERT_FALSE(
        calls.empty()
    );

    std::string delivered;

    for (const auto& call : calls) {
        delivered += call.post_data;
    }

    size_t first =
        delivered.find("\"x\":0");

    size_t second =
        delivered.find("\"x\":1");

    size_t third =
        delivered.find("\"x\":2");

    ASSERT_NE(
        first,
        std::string::npos
    );

    ASSERT_NE(
        second,
        std::string::npos
    );

    ASSERT_NE(
        third,
        std::string::npos
    );

    EXPECT_LT(first, second);
    EXPECT_LT(second, third);
    EXPECT_FALSE(api->failed());
}

TEST_F(
    ApiTest,
    StartAndStopAreIdempotent
) {
    api->start();
    api->start();
    api->stop();
    api->stop();

    EXPECT_FALSE(
        api->started_
    );

    EXPECT_FALSE(
        api->accepting_
    );

    EXPECT_FALSE(api->failed());
}
