#include "../common/test_utils.h"
#include "../src/app/worker.h"

using namespace Arena;

class PairOutcomeTest :
    public ::testing::Test {};

struct PairCase {
    double first;
    double second;
    Stats::PairOutcome outcome;
    int wins;
    int losses;
    int draws;
};

TEST_F(
    PairOutcomeTest,
    UsesOneClassificationForAllPairStatistics
) {
    const PairCase cases[] = {
        {
            1.0,
            0.5,
            Stats::PairOutcome::WIN,
            1,
            0,
            0
        },
        {
            0.5,
            0.0,
            Stats::PairOutcome::WIN,
            1,
            0,
            0
        },
        {
            0.0,
            0.5,
            Stats::PairOutcome::LOSS,
            0,
            1,
            0
        },
        {
            0.5,
            1.0,
            Stats::PairOutcome::LOSS,
            0,
            1,
            0
        },
        {
            1.0,
            1.0,
            Stats::PairOutcome::DRAW,
            0,
            0,
            1
        },
        {
            0.0,
            0.0,
            Stats::PairOutcome::DRAW,
            0,
            0,
            1
        }
    };

    for (const auto& test : cases) {
        App::MatchState state;
        Stats::Tracker stats;

        ASSERT_TRUE(
            App::record_completed_pair(
                state,
                stats,
                test.first,
                test.second
            )
        );

        EXPECT_EQ(
            Stats::Tracker::
                classify_pair_score(
                    App::slot1_pair_score(
                        test.first,
                        test.second
                    )
                ),
            test.outcome
        );
        EXPECT_EQ(state.wins, test.wins);
        EXPECT_EQ(state.losses, test.losses);
        EXPECT_EQ(state.draws, test.draws);
        EXPECT_EQ(
            stats.p1_pair_wins,
            test.wins
        );
        EXPECT_EQ(
            stats.p1_pair_losses,
            test.losses
        );
        EXPECT_EQ(
            stats.p1_pair_draws,
            test.draws
        );
        EXPECT_EQ(state.pairs_done, 1);
        EXPECT_EQ(stats.games.load(), 1);
    }
}

TEST_F(
    PairOutcomeTest,
    RejectsIncompletePairs
) {
    App::MatchState state;
    Stats::Tracker stats;

    EXPECT_FALSE(
        App::record_completed_pair(
            state,
            stats,
            -1.0,
            0.5
        )
    );

    EXPECT_EQ(state.pairs_done, 0);
    EXPECT_EQ(stats.games.load(), 0);
}
