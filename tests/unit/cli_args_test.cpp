#include "../common/test_utils.h"
#include "../src/app/cli.h"
#include <vector>
#include <string>
#include <cstring>

using namespace Arena;

class CliArgsTest : public ::testing::Test {
protected:
    std::vector<char*> args;

    void SetUp() override {
        unsetenv("SIZE");
        unsetenv("OPENINGS");
        unsetenv("TIMEOUT_ANNOUNCE");
        add_arg("arena");
    }

    void TearDown() override {
        for (auto arg : args) free(arg);
        args.clear();
        unsetenv("SIZE");
        unsetenv("OPENINGS");
        unsetenv("TIMEOUT_ANNOUNCE");
    }

    void add_arg(const std::string& s) {
        args.push_back(strdup(s.c_str()));
    }

    Core::BatchConfig parse() {
        return App::CLI::parse_batch_args(args.size(), args.data());
    }
};

TEST_F(CliArgsTest, BasicRequiredArgs) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");

    auto bc = parse();
    EXPECT_EQ(bc.p1_cmd, "p1");
    EXPECT_EQ(bc.p2_cmd, "p2");
    EXPECT_EQ(bc.board_size, 20);
}

TEST_F(CliArgsTest, LongFlags) {
    add_arg("--p1"); add_arg("cmd1");
    add_arg("--p2"); add_arg("cmd2");
    add_arg("--size"); add_arg("15");

    auto bc = parse();
    EXPECT_EQ(bc.p1_cmd, "cmd1");
    EXPECT_EQ(bc.p2_cmd, "cmd2");
    EXPECT_EQ(bc.board_size, 15);
}

TEST_F(CliArgsTest, Timeouts) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("--timeout-announce"); add_arg("5s");
    add_arg("--p2-timeout-announce"); add_arg("10s");

    auto bc = parse();
    EXPECT_EQ(bc.p1_timeout_announce, 5000);
    EXPECT_EQ(bc.p2_timeout_announce, 10000);
}

TEST_F(CliArgsTest, MemoryParsing) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("--memory"); add_arg("1g");

    auto bc = parse();
    EXPECT_EQ(bc.p1_memory, 1024LL * 1024 * 1024);
    EXPECT_EQ(bc.p2_memory, 1024LL * 1024 * 1024);
}

TEST_F(CliArgsTest, NodeLists) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-N"); add_arg("1k,2k");

    auto bc = parse();
    ASSERT_EQ(bc.common_nodes_list.size(), 2);
    EXPECT_EQ(bc.common_nodes_list[0], 1000);
    EXPECT_EQ(bc.common_nodes_list[1], 2000);
}

TEST_F(CliArgsTest, EnvVars) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    setenv("SIZE", "20", 1);

    auto bc = parse();
    EXPECT_EQ(bc.board_size, 20);
}

TEST_F(CliArgsTest, InvalidBoardSize) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-s"); add_arg("1");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, MissingRequired) {
    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, ThreadLimit) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-j"); add_arg("1000");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, PairsList) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-m"); add_arg("5,10");

    auto bc = parse();
    ASSERT_EQ(bc.min_pairs_list.size(), 2);
    EXPECT_EQ(bc.min_pairs_list[0], 5);
    EXPECT_EQ(bc.min_pairs_list[1], 10);
}

TEST_F(CliArgsTest, UnknownLongFlag) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("--unknown-flag");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, UnknownShortFlag) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-X");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, RiskTooHigh) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-r"); add_arg("1.5");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, RiskNegative) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-r"); add_arg("-0.5");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, ApiUrlWithoutKey) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("--api-url"); add_arg("http://example.com");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, ApiKeyWithoutUrl) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("--api-key"); add_arg("secret123");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, ApiUrlAndKey) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("--api-url"); add_arg("http://example.com/");
    add_arg("--api-key"); add_arg("key123");

    auto bc = parse();
    EXPECT_EQ(bc.api_url, "http://example.com");
    EXPECT_EQ(bc.api_key, "key123");
}

TEST_F(CliArgsTest, MaxPairsZero) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-M"); add_arg("0");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, BoardSizeTooLarge) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-s"); add_arg("50");

    EXPECT_THROW(parse(), std::runtime_error);
}

TEST_F(CliArgsTest, BoardSizeMinimum) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-s"); add_arg("5");

    auto bc = parse();
    EXPECT_EQ(bc.board_size, 5);
}

TEST_F(CliArgsTest, ExpandBatchCommonNodes) {
    Core::BatchConfig bc;
    bc.p1_cmd = "p1";
    bc.p2_cmd = "p2";
    bc.common_nodes_list = {1000, 2000};
    bc.min_pairs_list = {5};
    bc.max_pairs_list = {10};
    bc.repeat = 1;

    auto runs = App::CLI::expand_batch(bc);
    EXPECT_EQ(runs.size(), 2);

    for (const auto& r : runs) {
        EXPECT_EQ(r.p1_nodes, r.p2_nodes);
    }
}

TEST_F(CliArgsTest, ExpandBatchPerPlayerNodes) {
    Core::BatchConfig bc;
    bc.p1_cmd = "p1";
    bc.p2_cmd = "p2";
    bc.p1_nodes_list = {1000};
    bc.p2_nodes_list = {2000, 3000};
    bc.min_pairs_list = {5};
    bc.max_pairs_list = {10};
    bc.repeat = 1;

    auto runs = App::CLI::expand_batch(bc);
    EXPECT_EQ(runs.size(), 2);
}

TEST_F(CliArgsTest, GenerateConfigLabel) {
    Core::Config cfg;
    cfg.bot1.max_nodes = 1000000;
    cfg.bot2.max_nodes = 1000000;

    auto label = App::CLI::generate_config_label(cfg);
    EXPECT_EQ(label, "N=1m");
}

TEST_F(CliArgsTest, GenerateConfigLabelAsymmetric) {
    Core::Config cfg;
    cfg.bot1.max_nodes = 1000;
    cfg.bot2.max_nodes = 2000;

    auto label = App::CLI::generate_config_label(cfg);
    EXPECT_NE(label.find("N1=1k"), std::string::npos);
    EXPECT_NE(label.find("N2=2k"), std::string::npos);
}

TEST_F(CliArgsTest, DebugFlags) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("-d");
    add_arg("-b");

    auto bc = parse();
    EXPECT_TRUE(bc.debug);
    EXPECT_TRUE(bc.show_board);
}

TEST_F(CliArgsTest, RepeatAndSeed) {
    add_arg("-1"); add_arg("p1");
    add_arg("-2"); add_arg("p2");
    add_arg("--repeat"); add_arg("3");
    add_arg("--seed"); add_arg("100,200,300");

    auto bc = parse();
    EXPECT_EQ(bc.repeat, 3);
    ASSERT_EQ(bc.seeds.size(), 3);
    EXPECT_EQ(bc.seeds[0], 100);
    EXPECT_EQ(bc.seeds[1], 200);
    EXPECT_EQ(bc.seeds[2], 300);
}
