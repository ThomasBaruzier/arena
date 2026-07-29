#include "../common/test_utils.h"
#include "../src/stats/sprt.h"
#include "../src/stats/tracker.h"

using namespace Arena;

class StatsTest :
    public ::testing::Test {
protected:
    Stats::Tracker stats;

    std::string printed() {
        testing::internal::CaptureStdout();
        stats.print();
        return testing::internal::GetCapturedStdout();
    }
};

TEST_F(
    StatsTest,
    EloUpdateBasic
) {
    stats.update_pair_stats(1.0);

    EXPECT_GT(stats.p1_elo, 1000);
    EXPECT_LT(stats.p2_elo, 1000);
}

TEST_F(
    StatsTest,
    EloUpdateDraw
) {
    stats.p1_elo = 1200;
    stats.p2_elo = 1200;
    stats.p1_pair_draws = 10;

    stats.update_elo();

    EXPECT_EQ(stats.p1_elo, 1000);
    EXPECT_EQ(stats.p2_elo, 1000);
}

TEST_F(
    StatsTest,
    EloUpdateUnderdog
) {
    stats.update_pair_stats(1.0);

    int elo_after_win =
        stats.p1_elo;

    Stats::Tracker other;
    other.update_pair_stats(0.0);

    EXPECT_GT(elo_after_win, 1000);
    EXPECT_LT(other.p1_elo, 1000);
}

TEST_F(
    StatsTest,
    PairScoreClassification
) {
    EXPECT_EQ(
        Stats::Tracker::
            classify_pair_score(0.75),
        Stats::PairOutcome::WIN
    );

    EXPECT_EQ(
        Stats::Tracker::
            classify_pair_score(0.25),
        Stats::PairOutcome::LOSS
    );

    EXPECT_EQ(
        Stats::Tracker::
            classify_pair_score(0.5),
        Stats::PairOutcome::DRAW
    );
}

TEST_F(
    StatsTest,
    MetricsAggregation
) {
    stats.add_metrics(
        1,
        0.1,
        0.05
    );

    EXPECT_EQ(
        stats.p1_moves_analyzed,
        1
    );

    stats.add_metrics(
        1,
        0.21,
        0.0
    );

    EXPECT_EQ(
        stats.p1_severe_errors,
        1
    );
}

TEST_F(
    StatsTest,
    MetricsP2Aggregation
) {
    stats.add_metrics(
        2,
        0.15,
        0.08
    );

    EXPECT_EQ(
        stats.p2_moves_analyzed,
        1
    );

    EXPECT_EQ(
        stats.p2_critical_total,
        1
    );

    stats.add_metrics(
        2,
        0.25,
        0.0
    );

    EXPECT_EQ(
        stats.p2_severe_errors,
        1
    );
}

TEST_F(
    StatsTest,
    QualityMetricsAreUnavailableWithoutSamples
) {
    EXPECT_FALSE(
        stats.get_p1_cma_optional()
            .has_value()
    );
    EXPECT_FALSE(
        stats.get_p2_cma_optional()
            .has_value()
    );
    EXPECT_FALSE(
        stats.get_p1_blunder_optional()
            .has_value()
    );
    EXPECT_FALSE(
        stats.get_p2_blunder_optional()
            .has_value()
    );
}

TEST_F(
    StatsTest,
    BlunderCanBeAvailableWithoutCma
) {
    stats.add_metrics(
        1,
        0.1,
        0.01
    );

    EXPECT_FALSE(
        stats.get_p1_cma_optional()
            .has_value()
    );

    auto blunder =
        stats.get_p1_blunder_optional();

    ASSERT_TRUE(blunder.has_value());
    EXPECT_DOUBLE_EQ(*blunder, 0.0);
}

TEST_F(
    StatsTest,
    CmaUsesCriticalSamples
) {
    stats.add_metrics(
        1,
        0.01,
        0.1
    );
    stats.add_metrics(
        1,
        0.03,
        0.1
    );

    auto cma =
        stats.get_p1_cma_optional();

    ASSERT_TRUE(cma.has_value());
    EXPECT_DOUBLE_EQ(*cma, 50.0);
}

TEST_F(
    StatsTest,
    SampledZeroRemainsAvailable
) {
    stats.add_metrics(
        2,
        0.03,
        0.1
    );

    auto cma =
        stats.get_p2_cma_optional();
    auto blunder =
        stats.get_p2_blunder_optional();

    ASSERT_TRUE(cma.has_value());
    ASSERT_TRUE(blunder.has_value());
    EXPECT_DOUBLE_EQ(*cma, 0.0);
    EXPECT_DOUBLE_EQ(*blunder, 0.0);
}

TEST_F(
    StatsTest,
    CrashCounting
) {
    stats.add_crash(1);
    stats.add_crash(2);
    stats.add_crash(1);

    EXPECT_EQ(
        stats.crashes.load(),
        3
    );

    EXPECT_EQ(
        stats.p1_crashes.load(),
        2
    );

    EXPECT_EQ(
        stats.p2_crashes.load(),
        1
    );
}

TEST_F(
    StatsTest,
    Calculations
) {
    EXPECT_NEAR(
        Stats::Tracker::
            calc_severe(1, 10),
        10.0,
        0.01
    );

    EXPECT_EQ(
        Stats::Tracker::
            calc_severe(5, 0),
        0.0
    );

    EXPECT_NEAR(
        Stats::Tracker::
            calc_cma(3, 4),
        75.0,
        0.01
    );

    EXPECT_EQ(
        Stats::Tracker::
            calc_cma(3, 0),
        0.0
    );
}

TEST_F(
    StatsTest,
    TimingAggregation
) {
    stats.add_timing(
        1,
        100,
        80
    );

    stats.add_timing(
        1,
        300,
        240
    );

    stats.add_timing(
        2,
        500,
        125
    );

    EXPECT_EQ(
        stats.p1_total_time_ms.load(),
        400
    );

    EXPECT_EQ(
        stats.p1_cpu_time_ms.load(),
        320
    );

    EXPECT_EQ(
        stats.p2_total_time_ms.load(),
        500
    );

    EXPECT_EQ(
        stats.p2_cpu_time_ms.load(),
        125
    );

    auto first =
        stats.get_p1_eff();

    auto second =
        stats.get_p2_eff();

    ASSERT_TRUE(first.has_value());
    ASSERT_TRUE(second.has_value());

    EXPECT_DOUBLE_EQ(
        *first,
        80.0
    );

    EXPECT_DOUBLE_EQ(
        *second,
        25.0
    );
}

TEST_F(
    StatsTest,
    EfficiencyUsesAggregateTotals
) {
    stats.add_timing(
        1,
        10,
        10
    );

    stats.add_timing(
        1,
        990,
        495
    );

    auto efficiency =
        stats.get_p1_eff();

    ASSERT_TRUE(
        efficiency.has_value()
    );

    EXPECT_DOUBLE_EQ(
        *efficiency,
        50.5
    );
}

TEST_F(
    StatsTest,
    EfficiencyUnavailableWithoutWallTime
) {
    stats.add_timing(
        1,
        0,
        100
    );

    EXPECT_FALSE(
        stats.get_p1_eff()
            .has_value()
    );

    EXPECT_FALSE(
        stats.get_p2_eff()
            .has_value()
    );
}

TEST_F(
    StatsTest,
    EfficiencyCanExceedOneHundredPercent
) {
    stats.add_timing(
        1,
        100,
        175
    );

    auto efficiency =
        stats.get_p1_eff();

    ASSERT_TRUE(
        efficiency.has_value()
    );

    EXPECT_DOUBLE_EQ(
        *efficiency,
        175.0
    );
}

TEST_F(
    StatsTest,
    NegativeTimingSamplesAreIgnored
) {
    stats.add_timing(
        1,
        -100,
        -50
    );

    EXPECT_EQ(
        stats.p1_total_time_ms.load(),
        0
    );

    EXPECT_EQ(
        stats.p1_cpu_time_ms.load(),
        0
    );

    EXPECT_EQ(
        stats.p1_cpu_wall_time_ms.load(),
        0
    );

    EXPECT_FALSE(
        stats.get_p1_eff()
            .has_value()
    );
}

TEST_F(
    StatsTest,
    InvalidCpuSamplesDoNotBecomeZeroEfficiency
) {
    stats.add_timing(
        1,
        900,
        0,
        false
    );

    EXPECT_EQ(
        stats.p1_total_time_ms.load(),
        900
    );

    EXPECT_EQ(
        stats.p1_cpu_time_ms.load(),
        0
    );

    EXPECT_EQ(
        stats.p1_cpu_wall_time_ms.load(),
        0
    );

    EXPECT_FALSE(
        stats.get_p1_eff()
            .has_value()
    );

    stats.add_timing(
        1,
        100,
        50,
        true
    );

    EXPECT_EQ(
        stats.p1_total_time_ms.load(),
        1000
    );

    EXPECT_EQ(
        stats.p1_cpu_time_ms.load(),
        50
    );

    EXPECT_EQ(
        stats.p1_cpu_wall_time_ms.load(),
        100
    );

    auto efficiency =
        stats.get_p1_eff();

    ASSERT_TRUE(
        efficiency.has_value()
    );

    EXPECT_DOUBLE_EQ(
        *efficiency,
        50.0
    );
}

TEST_F(
    StatsTest,
    SPRTWaitsForMinimumPairs
) {
    App::MatchState state;
    Core::Config config;

    config.min_pairs = 5;
    config.max_pairs = 100;
    config.risk = 0.05;

    state.pairs_done = 3;
    state.wins = 3;

    EXPECT_FALSE(
        Stats::SPRT::check(
            state,
            config
        )
    );
}

TEST_F(
    StatsTest,
    SPRTStopsForSignificantFirstSlotLead
) {
    App::MatchState state;
    Core::Config config;

    config.min_pairs = 5;
    config.max_pairs = 100;
    config.risk = 0.05;

    state.pairs_done = 65;
    state.wins = 60;
    state.losses = 5;

    EXPECT_TRUE(
        Stats::SPRT::check(
            state,
            config
        )
    );
}

TEST_F(
    StatsTest,
    SPRTStopsForSignificantSecondSlotLead
) {
    App::MatchState state;
    Core::Config config;

    config.min_pairs = 5;
    config.max_pairs = 100;
    config.risk = 0.05;

    state.pairs_done = 65;
    state.wins = 5;
    state.losses = 60;

    EXPECT_TRUE(
        Stats::SPRT::check(
            state,
            config
        )
    );
}

TEST_F(
    StatsTest,
    SPRTDoesNotStopAnEqualRun
) {
    App::MatchState state;
    Core::Config config;

    config.min_pairs = 5;
    config.max_pairs = 100;
    config.risk = 0.05;

    state.pairs_done = 50;
    state.wins = 25;
    state.losses = 25;

    EXPECT_FALSE(
        Stats::SPRT::check(
            state,
            config
        )
    );
}

TEST_F(
    StatsTest,
    RiskZeroDisablesAllEarlyStopping
) {
    Core::Config config;

    config.min_pairs = 1;
    config.max_pairs = 100;
    config.risk = 0.0;

    App::MatchState first;
    first.pairs_done = 100;
    first.wins = 100;

    EXPECT_FALSE(
        Stats::SPRT::check(
            first,
            config
        )
    );

    App::MatchState second;
    second.pairs_done = 100;
    second.losses = 100;

    EXPECT_FALSE(
        Stats::SPRT::check(
            second,
            config
        )
    );
}

TEST_F(
    StatsTest,
    NegativeRiskDisablesAllEarlyStopping
) {
    App::MatchState state;
    Core::Config config;

    config.min_pairs = 1;
    config.max_pairs = 100;
    config.risk = -0.1;

    state.pairs_done = 100;
    state.wins = 100;

    EXPECT_FALSE(
        Stats::SPRT::check(
            state,
            config
        )
    );
}

TEST_F(
    StatsTest,
    FutilityStopIsSymmetric
) {
    Core::Config config;

    config.min_pairs = 5;
    config.max_pairs = 100;
    config.risk = 0.01;

    App::MatchState first_cannot_recover;
    first_cannot_recover.pairs_done = 60;
    first_cannot_recover.losses = 60;

    App::MatchState second_cannot_recover;
    second_cannot_recover.pairs_done = 60;
    second_cannot_recover.wins = 60;

    EXPECT_TRUE(
        Stats::SPRT::check(
            first_cannot_recover,
            config
        )
    );

    EXPECT_TRUE(
        Stats::SPRT::check(
            second_cannot_recover,
            config
        )
    );
}

TEST_F(
    StatsTest,
    FutilityDoesNotStopWhenMidpointIsReachable
) {
    Core::Config config;

    config.min_pairs = 5;
    config.max_pairs = 100;
    config.risk = 0.01;

    App::MatchState first;
    first.pairs_done = 60;
    first.wins = 10;
    first.losses = 50;

    App::MatchState mirror;
    mirror.pairs_done = 60;
    mirror.wins = 50;
    mirror.losses = 10;

    EXPECT_FALSE(
        Stats::SPRT::check(
            first,
            config
        )
    );

    EXPECT_FALSE(
        Stats::SPRT::check(
            mirror,
            config
        )
    );
}

TEST_F(
    StatsTest,
    PrintDoesNotThrow
) {
    stats.p1_elo = 1500;
    stats.p2_elo = 1400;

    stats.add_metrics(
        1,
        0.05,
        0.06
    );

    stats.add_metrics(
        2,
        0.1,
        0.04
    );

    stats.add_crash(1);

    stats.add_timing(
        1,
        100,
        90
    );

    stats.add_timing(
        2,
        100,
        80
    );

    EXPECT_NO_THROW(
        stats.print()
    );
}

TEST_F(
    StatsTest,
    PrintOmitsUnavailableQualityMetrics
) {
    std::string output = printed();

    EXPECT_EQ(
        output.find(" | CMA:"),
        std::string::npos
    );
    EXPECT_EQ(
        output.find(" | Bln:"),
        std::string::npos
    );
}

TEST_F(
    StatsTest,
    PrintShowsBlunderWithoutCma
) {
    stats.add_metrics(
        1,
        0.1,
        0.01
    );

    std::string output = printed();

    EXPECT_EQ(
        output.find(" | CMA:"),
        std::string::npos
    );
    EXPECT_NE(
        output.find(
            " | Bln: 0.0% vs -"
        ),
        std::string::npos
    );
}

TEST_F(
    StatsTest,
    PrintUsesDashForOneSidedCmaAvailability
) {
    stats.add_metrics(
        2,
        0.03,
        0.1
    );

    std::string output = printed();

    EXPECT_NE(
        output.find(
            " | CMA: - vs 0.0%"
        ),
        std::string::npos
    );
    EXPECT_NE(
        output.find(
            " | Bln: - vs 0.0%"
        ),
        std::string::npos
    );
}

TEST_F(
    StatsTest,
    PrintKeepsSampledZeroDistinctFromUnavailable
) {
    stats.add_metrics(
        1,
        0.03,
        0.1
    );
    stats.add_metrics(
        2,
        0.01,
        0.1
    );

    std::string output = printed();

    EXPECT_NE(
        output.find(
            " | CMA: 0.0% vs 100.0%"
        ),
        std::string::npos
    );
    EXPECT_NE(
        output.find(
            " | Bln: 0.0% vs 0.0%"
        ),
        std::string::npos
    );
}

TEST_F(
    StatsTest,
    SevereErrorBoundary
) {
    stats.add_metrics(
        1,
        0.20,
        0.0
    );

    EXPECT_EQ(
        stats.p1_severe_errors,
        0
    );

    stats.add_metrics(
        1,
        0.201,
        0.0
    );

    EXPECT_EQ(
        stats.p1_severe_errors,
        1
    );
}

TEST_F(
    StatsTest,
    ConcurrentEloUpdates
) {
    constexpr int thread_count = 8;
    constexpr int updates = 100;

    std::vector<std::thread> threads;

    for (
        int thread = 0;
        thread < thread_count;
        ++thread
    ) {
        threads.emplace_back(
            [
                this,
                thread
            ]() {
                for (
                    int update = 0;
                    update < updates;
                    ++update
                ) {
                    stats.update_pair_stats(
                        thread % 2 == 0
                            ? 1.0
                            : 0.0
                    );
                }
            }
        );
    }

    for (auto& thread : threads) {
        thread.join();
    }

    EXPECT_EQ(
        stats.games.load(),
        thread_count * updates
    );
}

TEST_F(
    StatsTest,
    ConcurrentMetricsAddition
) {
    constexpr int thread_count = 8;
    constexpr int updates = 100;

    std::vector<std::thread> threads;

    for (
        int thread = 0;
        thread < thread_count;
        ++thread
    ) {
        threads.emplace_back(
            [
                this,
                thread
            ]() {
                int player =
                    thread % 2 + 1;

                for (
                    int update = 0;
                    update < updates;
                    ++update
                ) {
                    stats.add_metrics(
                        player,
                        0.05,
                        0.03
                    );
                }
            }
        );
    }

    for (auto& thread : threads) {
        thread.join();
    }

    EXPECT_EQ(
        stats.p1_moves_analyzed +
            stats.p2_moves_analyzed,
        thread_count * updates
    );
}

TEST_F(
    StatsTest,
    ConcurrentCrashCounting
) {
    constexpr int thread_count = 10;
    constexpr int updates = 50;

    std::vector<std::thread> threads;

    for (
        int thread = 0;
        thread < thread_count;
        ++thread
    ) {
        threads.emplace_back(
            [
                this,
                thread
            ]() {
                int player =
                    thread % 2 + 1;

                for (
                    int update = 0;
                    update < updates;
                    ++update
                ) {
                    stats.add_crash(
                        player
                    );
                }
            }
        );
    }

    for (auto& thread : threads) {
        thread.join();
    }

    EXPECT_EQ(
        stats.crashes.load(),
        thread_count * updates
    );

    EXPECT_EQ(
        stats.p1_crashes.load() +
            stats.p2_crashes.load(),
        thread_count * updates
    );
}

TEST_F(
    StatsTest,
    ConcurrentTimingAddition
) {
    constexpr int thread_count = 8;
    constexpr int updates = 100;

    std::vector<std::thread> threads;

    for (
        int thread = 0;
        thread < thread_count;
        ++thread
    ) {
        threads.emplace_back(
            [
                this,
                thread
            ]() {
                int player =
                    thread % 2 + 1;

                for (
                    int update = 0;
                    update < updates;
                    ++update
                ) {
                    stats.add_timing(
                        player,
                        10,
                        5
                    );
                }
            }
        );
    }

    for (auto& thread : threads) {
        thread.join();
    }

    EXPECT_EQ(
        stats.p1_total_time_ms.load() +
            stats.p2_total_time_ms.load(),
        thread_count *
            updates *
            10
    );

    EXPECT_EQ(
        stats.p1_cpu_time_ms.load() +
            stats.p2_cpu_time_ms.load(),
        thread_count *
            updates *
            5
    );

    EXPECT_EQ(
        stats.p1_cpu_wall_time_ms.load() +
            stats.p2_cpu_wall_time_ms.load(),
        thread_count *
            updates *
            10
    );
}

TEST_F(
    StatsTest,
    ERFCalculation
) {
    stats.p1_pair_wins = 10;

    EXPECT_GT(
        stats.get_p1_erf(),
        99.0
    );

    EXPECT_LT(
        stats.get_p2_erf(),
        1.0
    );
}

TEST_F(
    StatsTest,
    ERFEqual
) {
    stats.p1_pair_wins = 5;
    stats.p1_pair_losses = 5;

    EXPECT_NEAR(
        stats.get_p1_erf(),
        50.0,
        0.1
    );
}
