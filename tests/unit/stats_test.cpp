#include "../common/test_utils.h"
#include "../src/stats/tracker.h"
#include "../src/stats/sprt.h"

using namespace Arena;

class StatsTest : public ::testing::Test {
protected:
    Stats::Tracker stats;
};

TEST_F(StatsTest, EloUpdateBasic) {
    stats.p1_elo = 1000;
    stats.p2_elo = 1000;

    stats.update_elo(1.0);
    EXPECT_GT(stats.p1_elo, 1000);
    EXPECT_LT(stats.p2_elo, 1000);
}

TEST_F(StatsTest, EloUpdateDraw) {
    stats.p1_elo = 1200;
    stats.p2_elo = 1200;
    stats.update_elo(0.5);
    EXPECT_EQ(stats.p1_elo, 1200);
    EXPECT_EQ(stats.p2_elo, 1200);
}

TEST_F(StatsTest, EloUpdateUnderdog) {
    stats.p1_elo = 1000;
    stats.p2_elo = 1200;
    int prev_p1 = stats.p1_elo;

    stats.update_elo(1.0);
    int gain_underdog = stats.p1_elo - prev_p1;

    Stats::Tracker s2;
    s2.p1_elo = 1000;
    s2.p2_elo = 1000;
    s2.update_elo(1.0);
    int gain_equal = s2.p1_elo - 1000;

    EXPECT_GT(gain_underdog, gain_equal);
}

TEST_F(StatsTest, MetricsAggregation) {
    stats.add_metrics(1, 0.1, 0.05);
    EXPECT_EQ(stats.p1_moves_analyzed, 1);
    EXPECT_GT(stats.p1_sum_weights, 0.0);

    stats.add_metrics(1, 0.21, 0.0);
    EXPECT_EQ(stats.p1_severe_errors, 1);

    stats.add_metrics(2, 0.0, 0.06);
    EXPECT_EQ(stats.p2_critical_total, 1);
    EXPECT_EQ(stats.p2_critical_success, 1);
}

TEST_F(StatsTest, MetricsThresholds) {
    stats.add_metrics(1, 0.02, 0.051);
    EXPECT_EQ(stats.p1_critical_total, 1);
    EXPECT_EQ(stats.p1_critical_success, 0);

    stats.add_metrics(1, 0.019, 0.051);
    EXPECT_EQ(stats.p1_critical_success, 1);
}

TEST_F(StatsTest, CrashCounting) {
    stats.add_crash(1);
    stats.add_crash(2);
    stats.add_crash(1);
    EXPECT_EQ(stats.crashes.load(), 3);
    EXPECT_EQ(stats.p1_crashes.load(), 2);
    EXPECT_EQ(stats.p2_crashes.load(), 1);
}

TEST_F(StatsTest, Calculations) {
    EXPECT_NEAR(Stats::Tracker::calc_dqi(0.25, 1.0), 50.0, 0.001);
    EXPECT_EQ(Stats::Tracker::calc_dqi(0, 0), 0.0);
    EXPECT_NEAR(Stats::Tracker::calc_cma(3, 4), 75.0, 0.01);
    EXPECT_EQ(Stats::Tracker::calc_cma(5, 0), 0.0);
    EXPECT_NEAR(Stats::Tracker::calc_severe(1, 10), 10.0, 0.01);
}

TEST_F(StatsTest, SPRTCheck) {
    App::MatchState state;
    Core::Config cfg;
    cfg.min_pairs = 5;
    cfg.max_pairs = 100;
    cfg.risk = 0.05;

    state.pairs_done = 3;
    EXPECT_FALSE(Stats::SPRT::check(state, cfg));

    state.pairs_done = 65;
    state.wins = 60;
    state.losses = 5;
    EXPECT_TRUE(Stats::SPRT::check(state, cfg));

    state.pairs_done = 50;
    state.wins = 25;
    state.losses = 25;
    EXPECT_FALSE(Stats::SPRT::check(state, cfg));

    state.pairs_done = 95;
    state.wins = 0;
    state.losses = 95;
    EXPECT_TRUE(Stats::SPRT::check(state, cfg));
}

TEST_F(StatsTest, PrintDoesNotThrow) {
    stats.p1_elo = 1500;
    stats.p2_elo = 1400;
    stats.add_metrics(1, 0.05, 0.06);
    stats.add_metrics(2, 0.1, 0.04);
    stats.add_crash(1);
    EXPECT_NO_THROW(stats.print());
}

TEST_F(StatsTest, MetricsP2Aggregation) {
    stats.add_metrics(2, 0.15, 0.08);
    EXPECT_EQ(stats.p2_moves_analyzed, 1);
    EXPECT_GT(stats.p2_sum_weights, 0.0);

    stats.add_metrics(2, 0.25, 0.0);
    EXPECT_EQ(stats.p2_severe_errors, 1);
}

TEST_F(StatsTest, SevereErrorBoundary) {
    stats.add_metrics(1, 0.20, 0.0);
    EXPECT_EQ(stats.p1_severe_errors, 0);

    stats.add_metrics(1, 0.201, 0.0);
    EXPECT_EQ(stats.p1_severe_errors, 1);
}

TEST_F(StatsTest, CriticalMoveSuccess) {
    stats.add_metrics(1, 0.01, 0.06);
    EXPECT_EQ(stats.p1_critical_total, 1);
    EXPECT_EQ(stats.p1_critical_success, 1);
}

TEST_F(StatsTest, CalcSevereZeroTotal) {
    EXPECT_DOUBLE_EQ(Stats::Tracker::calc_severe(5, 0), 0.0);
}

TEST_F(StatsTest, ConcurrentEloUpdates) {
    const int NUM_THREADS = 8;
    const int UPDATES_PER_THREAD = 100;

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_THREADS; ++t) {
        threads.emplace_back([this, t]() {
            for (int i = 0; i < UPDATES_PER_THREAD; ++i) {
                stats.update_elo(t % 2 == 0 ? 1.0 : 0.0);
            }
        });
    }

    for (auto& t : threads) t.join();

    EXPECT_EQ(stats.games.load(), NUM_THREADS * UPDATES_PER_THREAD);
}

TEST_F(StatsTest, ConcurrentMetricsAddition) {
    const int NUM_THREADS = 8;
    const int UPDATES_PER_THREAD = 100;

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_THREADS; ++t) {
        threads.emplace_back([this, t]() {
            int player = (t % 2) + 1;
            for (int i = 0; i < UPDATES_PER_THREAD; ++i) {
                stats.add_metrics(player, 0.05, 0.03);
            }
        });
    }

    for (auto& t : threads) t.join();

    int total = stats.p1_moves_analyzed + stats.p2_moves_analyzed;
    EXPECT_EQ(total, NUM_THREADS * UPDATES_PER_THREAD);
}

TEST_F(StatsTest, ConcurrentCrashCounting) {
    const int NUM_THREADS = 10;
    const int CRASHES_PER_THREAD = 50;

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_THREADS; ++t) {
        threads.emplace_back([this, t]() {
            int player = (t % 2) + 1;
            for (int i = 0; i < CRASHES_PER_THREAD; ++i) {
                stats.add_crash(player);
            }
        });
    }

    for (auto& t : threads) t.join();

    EXPECT_EQ(stats.crashes.load(), NUM_THREADS * CRASHES_PER_THREAD);
    EXPECT_EQ(stats.p1_crashes.load() + stats.p2_crashes.load(),
              NUM_THREADS * CRASHES_PER_THREAD);
}

TEST_F(StatsTest, DQICalculationPerfect) {
    EXPECT_DOUBLE_EQ(Stats::Tracker::calc_dqi(0.0, 1.0), 100.0);
}

TEST_F(StatsTest, DQICalculationWorst) {
    EXPECT_DOUBLE_EQ(Stats::Tracker::calc_dqi(1.0, 1.0), 0.0);
}

TEST_F(StatsTest, SPRTEarlyStopMinPairs) {
    App::MatchState state;
    Core::Config cfg;
    cfg.min_pairs = 10;
    cfg.max_pairs = 100;
    cfg.risk = 0.05;

    state.pairs_done = 5;
    state.wins = 5;
    state.losses = 0;
    EXPECT_FALSE(Stats::SPRT::check(state, cfg));
}

TEST_F(StatsTest, SPRTNoRisk) {
    App::MatchState state;
    Core::Config cfg;
    cfg.min_pairs = 5;
    cfg.max_pairs = 100;
    cfg.risk = 0.0;

    state.pairs_done = 50;
    state.wins = 50;
    state.losses = 0;
    EXPECT_FALSE(Stats::SPRT::check(state, cfg));
}
