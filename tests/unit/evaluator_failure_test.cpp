#include "../common/test_utils.h"
#include "../src/analysis/evaluator.h"
#include "../src/sys/signals.h"
#include <chrono>
#include <map>
#include <optional>
#include <string>

using namespace Arena;

namespace {

class StartFailProcess :
    public Sys::Process {
public:
    StartFailProcess() :
        Sys::Process("start-fail")
    {}

    bool start(
        long long,
        const std::map<
            std::string,
            std::string
        >&
    ) override {
        return false;
    }

    void terminate() override {}
};

class RestartFailProcess :
    public Sys::Process {
public:
    RestartFailProcess() :
        Sys::Process("restart-fail")
    {}

    bool start(
        long long,
        const std::map<
            std::string,
            std::string
        >&
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
        long* elapsed
    ) override {
        if (elapsed) {
            *elapsed = 1;
        }

        if (
            last_command_.rfind(
                "START",
                0
            ) == 0
        ) {
            return "OK";
        }

        return std::nullopt;
    }

private:
    int starts_ = 0;
    std::string last_command_;
};

class ReconfigureFailProcess :
    public Sys::Process {
public:
    ReconfigureFailProcess() :
        Sys::Process("reconfigure-fail")
    {}

    bool start(
        long long,
        const std::map<
            std::string,
            std::string
        >&
    ) override {
        return true;
    }

    void terminate() override {}

    bool write_line(
        const std::string& line
    ) override {
        last_command_ = line;

        if (
            line.rfind(
                "INFO MAX_NODE",
                0
            ) == 0
        ) {
            ++max_node_writes_;
            return max_node_writes_ == 1;
        }

        return true;
    }

    std::optional<std::string> read_line(
        int,
        long* elapsed
    ) override {
        if (elapsed) {
            *elapsed = 1;
        }

        if (
            last_command_.rfind(
                "START",
                0
            ) == 0
        ) {
            return "OK";
        }

        return std::nullopt;
    }

private:
    int max_node_writes_ = 0;
    std::string last_command_;
};

class GarbageStreamProcess :
    public Sys::Process {
public:
    GarbageStreamProcess() :
        Sys::Process("garbage-stream")
    {}

    bool start(
        long long,
        const std::map<
            std::string,
            std::string
        >&
    ) override {
        return true;
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
        long* elapsed
    ) override {
        if (elapsed) {
            *elapsed = 0;
        }

        if (
            last_command_.rfind(
                "START",
                0
            ) == 0
        ) {
            return "OK";
        }

        if (
            last_command_.rfind(
                "ANALYZE_MOVE",
                0
            ) == 0
        ) {
            ++analysis_reads;
            return "DEBUG still searching";
        }

        return std::nullopt;
    }

    int analysis_reads = 0;

private:
    std::string last_command_;
};

}

class EvaluatorFailureTest :
    public ::testing::Test {
protected:
    void SetUp() override {
        Sys::g_stop_flag = 0;
    }

    void TearDown() override {
        Sys::g_stop_flag = 0;
    }
};

TEST_F(
    EvaluatorFailureTest,
    StrictStartupFailureStopsTheMatch
) {
    Analysis::Evaluator evaluator(
        "start-fail",
        15,
        10,
        true,
        1000,
        std::make_unique<
            StartFailProcess
        >()
    );

    EXPECT_THROW(
        evaluator.start(),
        Core::MatchTerminated
    );
    EXPECT_EQ(Sys::g_stop_flag, 1);
}

TEST_F(
    EvaluatorFailureTest,
    StrictRestartFailureStopsTheMatch
) {
    Analysis::Evaluator evaluator(
        "restart-fail",
        15,
        10,
        true,
        1000,
        std::make_unique<
            RestartFailProcess
        >()
    );

    ASSERT_TRUE(evaluator.start());

    EXPECT_THROW(
        evaluator.restart(),
        Core::MatchTerminated
    );
    EXPECT_EQ(Sys::g_stop_flag, 1);
}

TEST_F(
    EvaluatorFailureTest,
    StrictReconfigurationFailureStopsTheMatch
) {
    Analysis::Evaluator evaluator(
        "reconfigure-fail",
        15,
        10,
        true,
        1000,
        std::make_unique<
            ReconfigureFailProcess
        >()
    );

    ASSERT_TRUE(evaluator.start());

    EXPECT_THROW(
        evaluator.set_max_nodes(2000),
        Core::MatchTerminated
    );
    EXPECT_EQ(Sys::g_stop_flag, 1);
}

TEST_F(
    EvaluatorFailureTest,
    NonStrictStartupFailureDisablesOnlyTheEvaluator
) {
    Analysis::Evaluator evaluator(
        "start-fail",
        15,
        10,
        false,
        1000,
        std::make_unique<
            StartFailProcess
        >()
    );

    EXPECT_FALSE(evaluator.start());
    EXPECT_EQ(Sys::g_stop_flag, 0);
}

TEST_F(
    EvaluatorFailureTest,
    GarbageOutputUsesOneOverallDeadline
) {
    auto process =
        std::make_unique<
            GarbageStreamProcess
        >();

    auto* raw_process =
        process.get();

    Analysis::Evaluator evaluator(
        "garbage-stream",
        15,
        10,
        false,
        1000,
        std::move(process)
    );

    ASSERT_TRUE(evaluator.start());

    auto started =
        std::chrono::steady_clock::now();

    EXPECT_FALSE(
        evaluator.eval({{7, 7}})
            .has_value()
    );

    auto elapsed =
        std::chrono::duration_cast<
            std::chrono::milliseconds
        >(
            std::chrono::steady_clock::now() -
            started
        ).count();

    EXPECT_GT(
        raw_process->analysis_reads,
        0
    );
    EXPECT_LT(elapsed, 250);
    EXPECT_EQ(Sys::g_stop_flag, 0);
}
