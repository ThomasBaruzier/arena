#include "../common/test_utils.h"
#include "../src/app/cli.h"
#include <cstring>
#include <thread>
#include <vector>

using namespace Arena;

class CliArgsTest : public ::testing::Test {
protected:
    std::vector<char*> args;

    void SetUp() override {
        clear_environment();
        add("arena");
    }

    void TearDown() override {
        for (char* argument : args) {
            free(argument);
        }

        args.clear();
        clear_environment();
    }

    void clear_environment() {
        for (
            const char* name :
            {
                "SIZE",
                "OPENINGS",
                "THREADS",
                "TIMEOUT_ANNOUNCE",
                "TIMEOUT_CUTOFF",
                "TIMEOUT_GAME",
                "MEMORY",
                "MIN_PAIRS",
                "MAX_PAIRS",
                "RISK",
                "API_URL",
                "API_KEY",
                "DEBOUNCE"
            }
        ) {
            unsetenv(name);
        }
    }

    void add(const std::string& value) {
        args.push_back(
            strdup(value.c_str())
        );
    }

    void players() {
        add("-1");
        add("p1");
        add("-2");
        add("p2");
    }

    Core::BatchConfig parse() {
        return App::CLI::parse_batch_args(
            static_cast<int>(args.size()),
            args.data()
        );
    }
};

TEST_F(CliArgsTest, RequiredArguments) {
    players();

    auto batch = parse();

    EXPECT_EQ(batch.p1_cmd, "p1");
    EXPECT_EQ(batch.p2_cmd, "p2");
    EXPECT_EQ(batch.board_size, 20);
}

TEST_F(CliArgsTest, LongArguments) {
    add("--p1");
    add("cmd1");
    add("--p2");
    add("cmd2");
    add("--size");
    add("15");

    auto batch = parse();

    EXPECT_EQ(batch.p1_cmd, "cmd1");
    EXPECT_EQ(batch.p2_cmd, "cmd2");
    EXPECT_EQ(batch.board_size, 15);
}

TEST_F(CliArgsTest, MissingRequiredArguments) {
    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, MissingOptionValue) {
    players();
    add("--size");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, ValidTimeouts) {
    players();
    add("--timeout-announce");
    add("5s");
    add("--p2-timeout-announce");
    add("10s");
    add("--eval-timeout-cutoff");
    add("30s");

    auto batch = parse();

    EXPECT_EQ(
        batch.p1_timeout_announce,
        5000
    );
    EXPECT_EQ(
        batch.p2_timeout_announce,
        10000
    );
    EXPECT_EQ(
        batch.eval_timeout_cutoff,
        30000
    );
}

TEST_F(CliArgsTest, RejectsInvalidTimeouts) {
    players();
    add("--timeout-announce");
    add("1x");

    EXPECT_THROW(
        parse(),
        std::exception
    );
}

TEST_F(CliArgsTest, RejectsNegativeTimeouts) {
    players();
    add("--timeout-game");
    add("-1s");

    EXPECT_THROW(
        parse(),
        std::exception
    );
}

TEST_F(CliArgsTest, ValidMemory) {
    players();
    add("--memory");
    add("1g");

    auto batch = parse();

    EXPECT_EQ(
        batch.p1_memory,
        1024LL * 1024 * 1024
    );
    EXPECT_EQ(
        batch.p2_memory,
        1024LL * 1024 * 1024
    );
}

TEST_F(CliArgsTest, RejectsInvalidMemory) {
    players();
    add("--memory");
    add("1x");

    EXPECT_THROW(
        parse(),
        std::exception
    );
}

TEST_F(CliArgsTest, NodeLists) {
    players();
    add("-N");
    add("1k,2k");

    auto batch = parse();

    EXPECT_EQ(
        batch.common_nodes_list,
        (
            std::vector<uint64_t>{
                1000,
                2000
            }
        )
    );
}

TEST_F(CliArgsTest, RejectsMalformedNodeList) {
    players();
    add("-N");
    add("1k,,2k");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsUnknownNodeSuffix) {
    players();
    add("-N");
    add("1x");

    EXPECT_THROW(
        parse(),
        std::exception
    );
}

TEST_F(CliArgsTest, RejectsOversizedJsonNodeCount) {
    players();
    add("-N");
    add("9007199254740992");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, EnvironmentValues) {
    players();
    setenv("SIZE", "15", 1);
    setenv("TIMEOUT_ANNOUNCE", "2s", 1);

    auto batch = parse();

    EXPECT_EQ(batch.board_size, 15);
    EXPECT_EQ(
        batch.p1_timeout_announce,
        2000
    );
    EXPECT_EQ(
        batch.p2_timeout_announce,
        2000
    );
}

TEST_F(CliArgsTest, RejectsMalformedEnvironmentValues) {
    players();
    setenv("SIZE", "15x", 1);

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, BoardSizeBounds) {
    players();
    add("-s");
    add("5");

    EXPECT_EQ(parse().board_size, 5);
}

TEST_F(CliArgsTest, RejectsSmallBoard) {
    players();
    add("-s");
    add("4");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsLargeBoard) {
    players();
    add("-s");
    add("41");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsZeroThreads) {
    players();
    add("--threads");
    add("0");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsNegativeThreads) {
    players();
    add("--threads");
    add("-1");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsTooManyThreadsWhenKnown) {
    unsigned int hardware =
        std::thread::hardware_concurrency();

    if (hardware == 0) return;

    players();
    add("--threads");
    add(std::to_string(hardware + 1));

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, PairLists) {
    players();
    add("-m");
    add("5,10");
    add("-M");
    add("20,30");

    auto batch = parse();

    EXPECT_EQ(
        batch.min_pairs_list,
        (
            std::vector<int>{5, 10}
        )
    );
    EXPECT_EQ(
        batch.max_pairs_list,
        (
            std::vector<int>{20, 30}
        )
    );
}

TEST_F(CliArgsTest, RejectsNonpositivePairs) {
    players();
    add("-m");
    add("0");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsNegativeMaxPairs) {
    players();
    add("--max-pairs");
    add("-1");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsInvalidRepeat) {
    players();
    add("--repeat");
    add("0");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RepeatAndSeeds) {
    players();
    add("--repeat");
    add("3");
    add("--seed");
    add("100,200,300");

    auto batch = parse();

    EXPECT_EQ(batch.repeat, 3);
    EXPECT_EQ(
        batch.seeds,
        (
            std::vector<uint64_t>{
                100,
                200,
                300
            }
        )
    );
}

TEST_F(CliArgsTest, RejectsNegativeSeed) {
    players();
    add("--seed");
    add("-1");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsRiskOutsideRange) {
    players();
    add("--risk");
    add("1.5");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsNonfiniteRisk) {
    players();
    add("--risk");
    add("nan");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, RejectsEmptyNormalizedApiUrl) {
    players();
    add("--api-url");
    add("/");
    add("--api-key");
    add("key");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, ApiConfigurationRequiresPair) {
    players();
    add("--api-url");
    add("http://example.com");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, ApiConfigurationTrimsSlash) {
    players();
    add("--api-url");
    add("http://example.com/");
    add("--api-key");
    add("key");

    auto batch = parse();

    EXPECT_EQ(
        batch.api_url,
        "http://example.com"
    );
    EXPECT_EQ(batch.api_key, "key");
}

TEST_F(CliArgsTest, RejectsNegativeDebounce) {
    players();
    add("--debounce");
    add("-1ms");

    EXPECT_THROW(
        parse(),
        std::exception
    );
}

TEST_F(CliArgsTest, Flags) {
    players();
    add("-d");
    add("-b");
    add("-L");
    add("-B");
    add("--cleanup");
    add("--exit-on-crash");
    add("--shuffle-openings");

    auto batch = parse();

    EXPECT_TRUE(batch.debug);
    EXPECT_TRUE(batch.show_board);
    EXPECT_TRUE(batch.p1_lenient);
    EXPECT_TRUE(batch.p2_lenient);
    EXPECT_TRUE(batch.force_board);
    EXPECT_TRUE(batch.cleanup);
    EXPECT_TRUE(batch.exit_on_crash);
    EXPECT_TRUE(batch.shuffle_openings);
}

TEST_F(CliArgsTest, RejectsUnknownFlag) {
    players();
    add("--unknown");

    EXPECT_THROW(
        parse(),
        std::runtime_error
    );
}

TEST_F(CliArgsTest, Defaults) {
    players();

    auto batch = parse();

    ASSERT_EQ(
        batch.min_pairs_list.size(),
        1
    );
    ASSERT_EQ(
        batch.max_pairs_list.size(),
        1
    );
    EXPECT_EQ(
        batch.min_pairs_list[0],
        1
    );
    EXPECT_EQ(
        batch.max_pairs_list[0],
        50
    );
    EXPECT_EQ(batch.debounce_ms, 500);
    EXPECT_EQ(batch.risk, 0.0);

    unsigned int hardware =
        std::thread::hardware_concurrency();
    int available =
        hardware == 0
            ? 4
            : static_cast<int>(hardware);

    EXPECT_EQ(
        batch.threads,
        std::max(1, available / 2 - 1)
    );
}

TEST_F(CliArgsTest, NodeModeUsesAllAvailableThreads) {
    players();
    add("-N");
    add("100k");

    auto batch = parse();

    unsigned int hardware =
        std::thread::hardware_concurrency();

    EXPECT_EQ(
        batch.threads,
        hardware == 0
            ? 4
            : static_cast<int>(hardware)
    );
}

TEST_F(CliArgsTest, ExpansionUsesDefaultEvaluatorNodes) {
    Core::BatchConfig batch;
    batch.p1_cmd = "p1";
    batch.p2_cmd = "p2";
    batch.min_pairs_list = {1};
    batch.max_pairs_list = {1};

    auto runs = App::CLI::expand_batch(batch);

    ASSERT_FALSE(runs.empty());
    EXPECT_EQ(
        runs[0].eval_nodes,
        Core::Constants::DEFAULT_EVAL_NODES
    );
}
