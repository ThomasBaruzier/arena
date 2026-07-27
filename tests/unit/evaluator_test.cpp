#include "../common/test_utils.h"
#include "../src/analysis/evaluator.h"
#include "../src/sys/signals.h"

using namespace Arena;

namespace {

class WriteFailProcess :
    public TestHelpers::MockProcess {
public:
    WriteFailProcess() :
        TestHelpers::MockProcess(
            [](const std::string&) {
                return "OK";
            }
        )
    {}

    bool write_line(const std::string&) override {
        return false;
    }
};

class RestartFailProcess : public Sys::Process {
public:
    RestartFailProcess() :
        Sys::Process("restart-fail")
    {}

    bool start(
        long long,
        const std::map<std::string, std::string>&
    ) override {
        return ++starts_ == 1;
    }

    void terminate() override {}

    bool write_line(
        const std::string& line
    ) override {
        last_command_ = line;
        return true;
    }

    std::optional<std::string> read_line(
        int,
        long*
    ) override {
        if (
            last_command_.rfind("START", 0) == 0
        ) {
            return "OK";
        }

        throw std::runtime_error(
            "process failed"
        );
    }

private:
    int starts_ = 0;
    std::string last_command_;
};

}

class EvaluatorTest : public ::testing::Test {
protected:
    void SetUp() override {
        Sys::g_stop_flag = 0;
    }

    void TearDown() override {
        Sys::g_stop_flag = 0;
    }
};

TEST_F(EvaluatorTest, MockIntegration) {
    auto responder = [](
        const std::string& command
    ) -> std::string {
        if (
            command.rfind("START", 0) == 0
        ) {
            return "OK";
        }

        if (
            command.rfind(
                "ANALYZE_MOVE",
                0
            ) == 0
        ) {
            return "EVAL_DATA 0.9 0.1 0.5";
        }

        return "";
    };

    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            responder
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());

    auto result = evaluator.eval({{7, 7}});

    ASSERT_TRUE(result.has_value());
    EXPECT_DOUBLE_EQ(result->p_best, 0.9);
    EXPECT_DOUBLE_EQ(result->p_second, 0.1);
    EXPECT_DOUBLE_EQ(result->p_played, 0.5);
}

TEST_F(EvaluatorTest, NeutralResultIsValid) {
    auto responder = [](
        const std::string& command
    ) -> std::string {
        if (
            command.rfind("START", 0) == 0
        ) {
            return "OK";
        }

        if (
            command.rfind(
                "ANALYZE_MOVE",
                0
            ) == 0
        ) {
            return "EVAL_DATA 0.5 0.5 0.5";
        }

        return "";
    };

    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            responder
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());

    auto result = evaluator.eval({{7, 7}});

    ASSERT_TRUE(result.has_value());
    EXPECT_DOUBLE_EQ(result->p_best, 0.5);
    EXPECT_DOUBLE_EQ(result->p_second, 0.5);
    EXPECT_DOUBLE_EQ(result->p_played, 0.5);
}

TEST_F(EvaluatorTest, GarbageDataReturnsNoMetric) {
    bool garbage_sent = false;

    auto responder = [&](
        const std::string& command
    ) -> std::string {
        if (
            command.rfind("START", 0) == 0
        ) {
            return "OK";
        }

        if (
            command.rfind(
                "ANALYZE_MOVE",
                0
            ) == 0
        ) {
            if (!garbage_sent) {
                garbage_sent = true;
                return "GARBAGE";
            }

            return "__TIMEOUT__";
        }

        return "";
    };

    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            responder
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        100,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());

    EXPECT_FALSE(
        evaluator.eval({{7, 7}})
            .has_value()
    );
}

TEST_F(EvaluatorTest, MalformedEvalDataReturnsNoMetric) {
    auto responder = [](
        const std::string& command
    ) -> std::string {
        if (
            command.rfind("START", 0) == 0
        ) {
            return "OK";
        }

        if (
            command.rfind(
                "ANALYZE_MOVE",
                0
            ) == 0
        ) {
            return "EVAL_DATA nope 0.2 0.3";
        }

        return "";
    };

    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            responder
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        100,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());

    EXPECT_FALSE(
        evaluator.eval({{7, 7}})
            .has_value()
    );
}

TEST_F(EvaluatorTest, InvalidProbabilitiesReturnNoMetric) {
    const std::vector<std::string> responses = {
        "EVAL_DATA -0.1 0.2 0.3",
        "EVAL_DATA 1.1 0.2 0.3",
        "EVAL_DATA 0.1 inf 0.3",
        "EVAL_DATA 0.1 0.2 nan",
        "EVAL_DATA 0.1x 0.2 0.3",
        "EVAL_DATA 0.1 0.2 0.3 trailing"
    };

    for (const auto& response : responses) {
        auto responder = [response](
            const std::string& command
        ) -> std::string {
            if (
                command.rfind("START", 0) == 0
            ) {
                return "OK";
            }

            if (
                command.rfind(
                    "ANALYZE_MOVE",
                    0
                ) == 0
            ) {
                return response;
            }

            return "";
        };

        auto process =
            std::make_unique<TestHelpers::MockProcess>(
                responder
            );

        Analysis::Evaluator evaluator(
            "dummy",
            15,
            100,
            false,
            1000,
            std::move(process)
        );

        ASSERT_TRUE(evaluator.start());
        EXPECT_FALSE(
            evaluator.eval({{7, 7}})
                .has_value()
        ) << response;
    }
}

TEST_F(EvaluatorTest, ProcessFailureReturnsNoMetric) {
    auto responder = [](
        const std::string& command
    ) -> std::string {
        if (
            command.rfind("START", 0) == 0
        ) {
            return "OK";
        }

        if (
            command.rfind(
                "ANALYZE_MOVE",
                0
            ) == 0
        ) {
            return "__CRASH__";
        }

        return "";
    };

    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            responder
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());

    EXPECT_FALSE(
        evaluator.eval({{7, 7}})
            .has_value()
    );
    EXPECT_EQ(Sys::g_stop_flag, 0);
}

TEST_F(EvaluatorTest, FailedRestartReturnsNoMetric) {
    auto process =
        std::make_unique<RestartFailProcess>();

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());

    EXPECT_FALSE(
        evaluator.eval({{7, 7}})
            .has_value()
    );
    EXPECT_EQ(Sys::g_stop_flag, 0);
}

TEST_F(EvaluatorTest, ExitOnCrashExits) {
    auto responder = [](
        const std::string& command
    ) -> std::string {
        if (
            command.rfind("START", 0) == 0
        ) {
            return "OK";
        }

        if (
            command.rfind(
                "ANALYZE_MOVE",
                0
            ) == 0
        ) {
            return "__CRASH__";
        }

        return "";
    };

    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            responder
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        true,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());

    EXPECT_THROW(
        evaluator.eval({{7, 7}}),
        Core::MatchTerminated
    );
    EXPECT_EQ(Sys::g_stop_flag, 1);
}

TEST_F(EvaluatorTest, StartFailsOnWriteFailure) {
    auto process =
        std::make_unique<WriteFailProcess>();

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        false,
        1000,
        std::move(process)
    );

    EXPECT_FALSE(evaluator.start());
}

TEST_F(EvaluatorTest, StartRejectsInvalidResponse) {
    auto responder = [](
        const std::string& command
    ) -> std::string {
        if (
            command.rfind("START", 0) == 0
        ) {
            return "NOT OK";
        }

        return "";
    };

    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            responder
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        false,
        1000,
        std::move(process)
    );

    EXPECT_FALSE(evaluator.start());
}

TEST_F(EvaluatorTest, EmptyMoveListReturnsNoMetric) {
    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            [](const std::string& command) {
                if (
                    command.rfind("START", 0) == 0
                ) {
                    return std::string("OK");
                }

                return std::string();
            }
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());

    EXPECT_FALSE(
        evaluator.eval({})
            .has_value()
    );
}

TEST_F(EvaluatorTest, MaxNodesUpdatesOnlyAfterWrite) {
    auto responder = [](
        const std::string& command
    ) -> std::string {
        if (
            command.rfind("START", 0) == 0
        ) {
            return "OK";
        }

        return "";
    };

    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            responder
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());
    EXPECT_TRUE(evaluator.set_max_nodes(2000));
    EXPECT_TRUE(evaluator.set_max_nodes(2000));
}

TEST_F(EvaluatorTest, ExplicitRestartSucceeds) {
    auto responder = [](
        const std::string& command
    ) -> std::string {
        if (
            command.rfind("START", 0) == 0
        ) {
            return "OK";
        }

        return "";
    };

    auto process =
        std::make_unique<TestHelpers::MockProcess>(
            responder
        );

    Analysis::Evaluator evaluator(
        "dummy",
        15,
        1000,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());
    EXPECT_TRUE(evaluator.restart());
}
