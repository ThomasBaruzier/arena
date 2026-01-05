#include "../common/test_utils.h"
#include "../src/analysis/evaluator.h"
#include "../src/sys/signals.h"

using namespace Arena;

class EvaluatorTest : public ::testing::Test {
protected:
    void TearDown() override {
        Sys::g_stop_flag = 0;
    }
};

TEST_F(EvaluatorTest, MockIntegration) {
    auto responder = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd.find("ANALYZE_MOVE") == 0) return "EVAL_DATA 0.9 0.1 0.5";
        return "";
    };

    auto mock = std::make_unique<TestHelpers::MockProcess>(responder);
    Analysis::Evaluator eval("dummy", 15, 1000, false, 1000, std::move(mock));

    ASSERT_TRUE(eval.start());

    std::vector<Core::Point> moves = {{7, 7}};
    auto res = eval.eval(moves);

    EXPECT_DOUBLE_EQ(res.p_best, 0.9);
    EXPECT_DOUBLE_EQ(res.p_second, 0.1);
}

TEST_F(EvaluatorTest, GarbageDataFallback) {
    bool garbage_sent = false;
    auto responder = [&](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd.find("ANALYZE_MOVE") == 0) {
            if (!garbage_sent) { garbage_sent = true; return "GARBAGE"; }
            return "__TIMEOUT__";
        }
        return "";
    };

    auto mock = std::make_unique<TestHelpers::MockProcess>(responder);
    Analysis::Evaluator eval("dummy", 15, 100, false, 1000, std::move(mock));

    ASSERT_TRUE(eval.start());
    std::vector<Core::Point> moves = {{7, 7}};
    auto res = eval.eval(moves);

    EXPECT_DOUBLE_EQ(res.p_best, 0.5);
}

TEST_F(EvaluatorTest, RestartOnCrash) {
    int calls = 0;
    auto responder = [&](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd.find("ANALYZE_MOVE") == 0) {
            if (++calls == 1) return "__CRASH__";
            return "EVAL_DATA 0.8 0.2 0.5";
        }
        return "";
    };

    auto mock = std::make_unique<TestHelpers::MockProcess>(responder);
    Analysis::Evaluator eval("dummy", 15, 1000, false, 1000, std::move(mock));
    eval.start();

    std::vector<Core::Point> moves = {{7, 7}};
    auto res = eval.eval(moves);
    EXPECT_EQ(res.p_best, 0.5);
}

TEST_F(EvaluatorTest, ExitOnCrashExits) {
    auto responder = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd.find("ANALYZE_MOVE") == 0) return "__CRASH__";
        return "";
    };

    auto mock = std::make_unique<TestHelpers::MockProcess>(responder);
    Analysis::Evaluator eval("dummy", 15, 1000, true, 1000, std::move(mock));
    eval.start();
    std::vector<Core::Point> moves = {{7, 7}};
    EXPECT_THROW(eval.eval(moves), Core::MatchTerminated);
}

TEST_F(EvaluatorTest, ExitOnCrashFlagOff) {
    int calls = 0;
    auto responder = [&](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd.find("ANALYZE_MOVE") == 0) {
            if (++calls == 1) return "__CRASH__";
            return "__TIMEOUT__";
        }
        return "";
    };

    auto mock = std::make_unique<TestHelpers::MockProcess>(responder);
    Analysis::Evaluator eval("dummy", 15, 100, false, 1000, std::move(mock));
    eval.start();

    std::vector<Core::Point> moves = {{7, 7}};
    auto res = eval.eval(moves);
    EXPECT_DOUBLE_EQ(res.p_best, 0.5);
}
