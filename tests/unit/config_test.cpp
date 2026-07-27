#include "../common/test_utils.h"
#include "../src/app/cli.h"

using namespace Arena;

class ConfigTest : public ::testing::Test {};

TEST_F(ConfigTest, BatchExpansionCartesian) {
    Core::BatchConfig batch;
    batch.p1_nodes_list = {10, 20};
    batch.p2_nodes_list = {30, 40};
    batch.min_pairs_list = {1};
    batch.max_pairs_list = {2};
    batch.repeat = 1;

    auto runs = App::CLI::expand_batch(batch);

    EXPECT_EQ(runs.size(), 4);
}

TEST_F(ConfigTest, BatchExpansionDiagonal) {
    Core::BatchConfig batch;
    batch.common_nodes_list = {10, 20};
    batch.min_pairs_list = {1};
    batch.max_pairs_list = {2};
    batch.repeat = 1;

    auto runs = App::CLI::expand_batch(batch);

    ASSERT_EQ(runs.size(), 2);

    for (const auto& run : runs) {
        EXPECT_EQ(
            run.p1_nodes,
            run.p2_nodes
        );
    }
}

TEST_F(ConfigTest, BatchExpansionAsymmetric) {
    Core::BatchConfig batch;
    batch.p1_nodes_list = {
        100,
        200,
        300
    };
    batch.p2_nodes_list = {500};
    batch.min_pairs_list = {1};
    batch.max_pairs_list = {10};
    batch.repeat = 1;

    auto runs = App::CLI::expand_batch(batch);

    ASSERT_EQ(runs.size(), 3);

    for (const auto& run : runs) {
        EXPECT_EQ(run.p2_nodes, 500);
    }
}

TEST_F(ConfigTest, BatchExpansionRepeatAndSeeds) {
    Core::BatchConfig batch;
    batch.common_nodes_list = {100};
    batch.min_pairs_list = {1};
    batch.max_pairs_list = {10};
    batch.repeat = 3;
    batch.seeds = {111, 222, 333};

    auto runs = App::CLI::expand_batch(batch);

    ASSERT_EQ(runs.size(), 3);

    std::vector<uint64_t> seeds;

    for (const auto& run : runs) {
        ASSERT_TRUE(run.seed.has_value());
        seeds.push_back(*run.seed);
    }

    std::sort(seeds.begin(), seeds.end());

    EXPECT_EQ(
        seeds,
        (
            std::vector<uint64_t>{
                111,
                222,
                333
            }
        )
    );
}

TEST_F(ConfigTest, BatchExpansionProduct) {
    Core::BatchConfig batch;
    batch.p1_nodes_list = {100, 200};
    batch.p2_nodes_list = {300, 400};
    batch.eval_nodes_list = {500, 600};
    batch.min_pairs_list = {1, 2};
    batch.max_pairs_list = {5, 10};
    batch.repeat = 2;

    auto runs = App::CLI::expand_batch(batch);

    EXPECT_EQ(runs.size(), 64);
}

TEST_F(ConfigTest, MinimumPairsClampToMaximum) {
    Core::BatchConfig batch;
    batch.common_nodes_list = {100};
    batch.min_pairs_list = {20};
    batch.max_pairs_list = {10};
    batch.repeat = 1;

    auto runs = App::CLI::expand_batch(batch);

    ASSERT_EQ(runs.size(), 1);
    EXPECT_EQ(runs[0].min_pairs, 10);
    EXPECT_EQ(runs[0].max_pairs, 10);
}

TEST_F(ConfigTest, BuildConfig) {
    Core::BatchConfig batch;
    batch.p1_cmd = "cmd1";
    batch.p2_cmd = "cmd2";
    batch.eval_cmd = "eval";
    batch.board_size = 19;
    batch.p1_timeout_announce = 3000;
    batch.p2_timeout_cutoff = 6000;
    batch.openings_path = "ops.txt";
    batch.shuffle_openings = true;
    batch.debounce_ms = 250;

    Core::RunSpec run;
    run.p1_nodes = 1000;
    run.p2_nodes = 2000;
    run.eval_nodes = 5000;
    run.seed = 12345;

    auto config =
        App::CLI::build_config(batch, run);

    EXPECT_EQ(config.bot1.cmd, "cmd1");
    EXPECT_EQ(config.bot2.cmd, "cmd2");
    EXPECT_EQ(config.eval_path, "eval");
    EXPECT_EQ(config.board_size, 19);
    EXPECT_EQ(config.bot1.max_nodes, 1000);
    EXPECT_EQ(config.bot2.max_nodes, 2000);
    EXPECT_EQ(
        config.bot1.timeout_announce,
        3000
    );
    EXPECT_EQ(
        config.bot2.timeout_cutoff,
        6000
    );
    EXPECT_EQ(
        config.openings_path,
        "ops.txt"
    );
    EXPECT_TRUE(config.use_openings);
    EXPECT_TRUE(config.shuffle_openings);
    EXPECT_EQ(config.eval_max_nodes, 5000);
    EXPECT_EQ(config.debounce_ms, 250);
    ASSERT_TRUE(config.seed.has_value());
    EXPECT_EQ(*config.seed, 12345);
}

TEST_F(ConfigTest, DefaultLabel) {
    Core::Config config;
    config.bot1.timeout_announce =
        Core::Constants::
            DEFAULT_TIMEOUT_TURN_MS;
    config.bot2.timeout_announce =
        Core::Constants::
            DEFAULT_TIMEOUT_TURN_MS;

    EXPECT_EQ(
        App::CLI::generate_config_label(
            config
        ),
        "default"
    );
}

TEST_F(ConfigTest, EqualNodeLabel) {
    Core::Config config;
    config.bot1.max_nodes = 1000000;
    config.bot2.max_nodes = 1000000;

    EXPECT_EQ(
        App::CLI::generate_config_label(
            config
        ),
        "N=1m"
    );
}

TEST_F(ConfigTest, AsymmetricNodeLabel) {
    Core::Config config;
    config.bot1.max_nodes = 1000;
    config.bot2.max_nodes = 2000000;

    std::string label =
        App::CLI::generate_config_label(
            config
        );

    EXPECT_NE(
        label.find("N1=1k"),
        std::string::npos
    );
    EXPECT_NE(
        label.find("N2=2m"),
        std::string::npos
    );
}

TEST_F(ConfigTest, TimeoutLabel) {
    Core::Config config;
    config.bot1.timeout_announce = 5000;
    config.bot2.timeout_announce = 10000;

    std::string label =
        App::CLI::generate_config_label(
            config
        );

    EXPECT_NE(
        label.find("T1=5s"),
        std::string::npos
    );
    EXPECT_NE(
        label.find("T2=10s"),
        std::string::npos
    );
}

TEST_F(ConfigTest, EqualTimeoutAndMemoryLabel) {
    Core::Config config;
    config.bot1.timeout_announce = 30000;
    config.bot2.timeout_announce = 30000;
    config.bot1.memory =
        512LL * 1024 * 1024;
    config.bot2.memory =
        512LL * 1024 * 1024;

    std::string label =
        App::CLI::generate_config_label(
            config
        );

    EXPECT_NE(
        label.find("T=30s"),
        std::string::npos
    );
    EXPECT_NE(
        label.find("M=512m"),
        std::string::npos
    );
}
