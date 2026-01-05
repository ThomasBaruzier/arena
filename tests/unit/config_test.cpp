#include "../common/test_utils.h"
#include "../src/app/cli.h"

using namespace Arena;

class ConfigTest : public ::testing::Test {};

TEST_F(ConfigTest, BatchExpansionCartesian) {
    Core::BatchConfig bc;
    bc.p1_nodes_list = {10, 20};
    bc.p2_nodes_list = {30, 40};
    bc.min_pairs_list = {1};
    bc.max_pairs_list = {2};
    bc.repeat = 1;

    auto runs = App::CLI::expand_batch(bc);
    EXPECT_EQ(runs.size(), 4);
}

TEST_F(ConfigTest, BatchExpansionDiagonal) {
    Core::BatchConfig bc;
    bc.common_nodes_list = {10, 20};
    bc.min_pairs_list = {1};
    bc.max_pairs_list = {2};
    bc.repeat = 1;

    auto runs = App::CLI::expand_batch(bc);
    EXPECT_EQ(runs.size(), 2);
    auto has_equal = std::any_of(runs.begin(), runs.end(), [](auto& r) {
        return r.p1_nodes == r.p2_nodes;
    });
    EXPECT_TRUE(has_equal);
}

TEST_F(ConfigTest, BatchExpansionAsymmetric) {
    Core::BatchConfig bc;
    bc.p1_nodes_list = {100, 200, 300};
    bc.p2_nodes_list = {500};
    bc.min_pairs_list = {1};
    bc.max_pairs_list = {10};
    bc.repeat = 1;

    auto runs = App::CLI::expand_batch(bc);
    ASSERT_EQ(runs.size(), 3);
    for (const auto& run : runs) EXPECT_EQ(run.p2_nodes, 500);
}

TEST_F(ConfigTest, BatchExpansionRepeatAndSeeds) {
    Core::BatchConfig bc;
    bc.common_nodes_list = {100};
    bc.min_pairs_list = {1};
    bc.max_pairs_list = {10};
    bc.repeat = 3;
    bc.seeds = {111, 222, 333};

    auto runs = App::CLI::expand_batch(bc);
    EXPECT_EQ(runs.size(), 3);

    std::vector<uint64_t> seeds;
    for (const auto& r : runs) if (r.seed) seeds.push_back(*r.seed);
    std::sort(seeds.begin(), seeds.end());

    ASSERT_EQ(seeds.size(), 3);
    EXPECT_EQ(seeds[0], 111);
    EXPECT_EQ(seeds[1], 222);
    EXPECT_EQ(seeds[2], 333);
}

TEST_F(ConfigTest, BatchExpansionLargeProduct) {
    Core::BatchConfig bc;
    bc.p1_nodes_list = {100, 200};
    bc.p2_nodes_list = {300, 400};
    bc.min_pairs_list = {1, 2};
    bc.max_pairs_list = {5, 10};
    bc.repeat = 2;

    auto runs = App::CLI::expand_batch(bc);
    EXPECT_EQ(runs.size(), 32);
}

TEST_F(ConfigTest, BuildConfig) {
    Core::BatchConfig bc;
    bc.p1_cmd = "cmd1";
    bc.p2_cmd = "cmd2";
    bc.board_size = 19;
    bc.p1_timeout_announce = 3000;
    bc.p2_timeout_cutoff = 6000;
    bc.openings_path = "ops.txt";
    bc.shuffle_openings = true;

    Core::RunSpec rs;
    rs.p1_nodes = 1000;
    rs.p2_nodes = 2000;
    rs.eval_nodes = 5000;
    rs.seed = 12345;

    auto cfg = App::CLI::build_config(bc, rs);
    EXPECT_EQ(cfg.bot1.cmd, "cmd1");
    EXPECT_EQ(cfg.board_size, 19);
    EXPECT_EQ(cfg.bot1.max_nodes, 1000);
    EXPECT_EQ(cfg.bot1.timeout_announce, 3000);
    EXPECT_EQ(cfg.bot2.timeout_cutoff, 6000);
    EXPECT_EQ(cfg.openings_path, "ops.txt");
    EXPECT_TRUE(cfg.shuffle_openings);
    EXPECT_EQ(cfg.eval_max_nodes, 5000);
    EXPECT_TRUE(cfg.seed.has_value());
    EXPECT_EQ(*cfg.seed, 12345);
}

TEST_F(ConfigTest, GenerateConfigLabelDefault) {
    Core::Config cfg;
    cfg.bot1.max_nodes = 0;
    cfg.bot2.max_nodes = 0;
    cfg.bot1.timeout_announce = Core::Constants::DEFAULT_TIMEOUT_TURN_MS;
    cfg.bot2.timeout_announce = Core::Constants::DEFAULT_TIMEOUT_TURN_MS;
    cfg.bot1.memory = 0;
    cfg.bot2.memory = 0;

    std::string label = App::CLI::generate_config_label(cfg);
    EXPECT_EQ(label, "default");
}

TEST_F(ConfigTest, GenerateConfigLabelEqualNodes) {
    Core::Config cfg;
    cfg.bot1.max_nodes = 1000000;
    cfg.bot2.max_nodes = 1000000;

    std::string label = App::CLI::generate_config_label(cfg);
    EXPECT_EQ(label, "N=1m");
}

TEST_F(ConfigTest, GenerateConfigLabelAsymmetricNodes) {
    Core::Config cfg;
    cfg.bot1.max_nodes = 1000;
    cfg.bot2.max_nodes = 2000000;

    std::string label = App::CLI::generate_config_label(cfg);
    EXPECT_NE(label.find("N1=1k"), std::string::npos);
    EXPECT_NE(label.find("N2=2m"), std::string::npos);
}

TEST_F(ConfigTest, GenerateConfigLabelAsymmetricTimeouts) {
    Core::Config cfg;
    cfg.bot1.max_nodes = 0;
    cfg.bot2.max_nodes = 0;
    cfg.bot1.timeout_announce = 5000;
    cfg.bot2.timeout_announce = 10000;

    std::string label = App::CLI::generate_config_label(cfg);
    EXPECT_NE(label.find("T1=5s"), std::string::npos);
    EXPECT_NE(label.find("T2=10s"), std::string::npos);
}

TEST_F(ConfigTest, GenerateConfigLabelEqualNonDefaultTimeouts) {
    Core::Config cfg;
    cfg.bot1.max_nodes = 0;
    cfg.bot2.max_nodes = 0;
    cfg.bot1.timeout_announce = 30000;
    cfg.bot2.timeout_announce = 30000;

    std::string label = App::CLI::generate_config_label(cfg);
    EXPECT_NE(label.find("T=30s"), std::string::npos);
}

TEST_F(ConfigTest, GenerateConfigLabelWithMemory) {
    Core::Config cfg;
    cfg.bot1.max_nodes = 1000;
    cfg.bot2.max_nodes = 1000;
    cfg.bot1.memory = 512 * 1024 * 1024;
    cfg.bot2.memory = 512 * 1024 * 1024;

    std::string label = App::CLI::generate_config_label(cfg);
    EXPECT_NE(label.find("N=1k"), std::string::npos);
    EXPECT_NE(label.find("M=512m"), std::string::npos);
}

TEST_F(ConfigTest, GenerateConfigLabelOnlyP1Nodes) {
    Core::Config cfg;
    cfg.bot1.max_nodes = 5000;
    cfg.bot2.max_nodes = 0;

    std::string label = App::CLI::generate_config_label(cfg);
    EXPECT_NE(label.find("N1=5k"), std::string::npos);
    EXPECT_EQ(label.find("N2="), std::string::npos);
}
