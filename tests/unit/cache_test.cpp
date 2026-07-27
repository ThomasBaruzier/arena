#include "../common/test_utils.h"
#include "../src/analysis/cache.h"

using namespace Arena;

class CacheTest : public ::testing::Test {
protected:
    void SetUp() override {
        Analysis::GlobalCache::init(20);
    }

    static Analysis::GlobalCache::Key key(
        const std::vector<Core::Point>& moves,
        int board_size = 20,
        uint64_t nodes = 2000000,
        const std::string& command = "rapfi"
    ) {
        return Analysis::GlobalCache::make_key(
            moves,
            board_size,
            nodes,
            command
        );
    }
};

TEST_F(CacheTest, StorageRetrieval) {
    auto cache_key = key({{9, 9}});
    Stats::EvalMetrics metrics{
        0.9,
        0.5,
        0.4
    };

    Analysis::GlobalCache::set(
        cache_key,
        metrics
    );

    auto result =
        Analysis::GlobalCache::get(cache_key);

    ASSERT_TRUE(result.has_value());
    EXPECT_DOUBLE_EQ(result->p_best, 0.9);
    EXPECT_DOUBLE_EQ(result->p_second, 0.5);
    EXPECT_DOUBLE_EQ(result->p_played, 0.4);
}

TEST_F(CacheTest, Overwrite) {
    auto cache_key = key({{3, 4}});

    Analysis::GlobalCache::set(
        cache_key,
        {0.1, 0.1, 0.1}
    );
    Analysis::GlobalCache::set(
        cache_key,
        {0.9, 0.8, 0.7}
    );

    auto result =
        Analysis::GlobalCache::get(cache_key);

    ASSERT_TRUE(result.has_value());
    EXPECT_DOUBLE_EQ(result->p_best, 0.9);
}

TEST_F(CacheTest, DifferentPositionMisses) {
    auto first = key({{5, 5}});
    auto second = key({{5, 6}});

    Analysis::GlobalCache::set(
        first,
        {0.5, 0.4, 0.3}
    );

    EXPECT_FALSE(
        Analysis::GlobalCache::get(second)
            .has_value()
    );
}

TEST_F(CacheTest, DifferentNodeBudgetMisses) {
    std::vector<Core::Point> moves = {
        {5, 5},
        {6, 6}
    };

    auto low = key(moves, 20, 1000);
    auto high = key(moves, 20, 2000);

    Analysis::GlobalCache::set(
        low,
        {0.5, 0.4, 0.3}
    );

    EXPECT_FALSE(
        Analysis::GlobalCache::get(high)
            .has_value()
    );
}

TEST_F(CacheTest, DifferentBoardSizeMisses) {
    std::vector<Core::Point> moves = {
        {5, 5}
    };

    auto fifteen = key(moves, 15);
    auto twenty = key(moves, 20);

    Analysis::GlobalCache::set(
        fifteen,
        {0.5, 0.4, 0.3}
    );

    EXPECT_FALSE(
        Analysis::GlobalCache::get(twenty)
            .has_value()
    );
}

TEST_F(CacheTest, DifferentEvaluatorMisses) {
    std::vector<Core::Point> moves = {
        {5, 5}
    };

    auto first = key(
        moves,
        20,
        2000000,
        "./rapfi-a"
    );
    auto second = key(
        moves,
        20,
        2000000,
        "./rapfi-b"
    );

    Analysis::GlobalCache::set(
        first,
        {0.5, 0.4, 0.3}
    );

    EXPECT_FALSE(
        Analysis::GlobalCache::get(second)
            .has_value()
    );
}

TEST_F(CacheTest, ZeroKeyStartsEmpty) {
    Analysis::GlobalCache::Key zero;

    EXPECT_FALSE(
        Analysis::GlobalCache::get(zero)
            .has_value()
    );

    Analysis::GlobalCache::set(
        zero,
        {0.42, 0.41, 0.40}
    );

    auto result =
        Analysis::GlobalCache::get(zero);

    ASSERT_TRUE(result.has_value());
    EXPECT_DOUBLE_EQ(result->p_best, 0.42);
}

TEST_F(CacheTest, ClearInvalidatesEntries) {
    auto cache_key = key({{1, 1}});

    Analysis::GlobalCache::set(
        cache_key,
        {0.7, 0.6, 0.5}
    );

    ASSERT_TRUE(
        Analysis::GlobalCache::get(cache_key)
            .has_value()
    );

    Analysis::GlobalCache::clear();

    EXPECT_FALSE(
        Analysis::GlobalCache::get(cache_key)
            .has_value()
    );
}

TEST_F(CacheTest, ConcurrentSetsAndGets) {
    constexpr int thread_count = 4;
    constexpr int values_per_thread = 100;
    std::vector<std::thread> threads;

    for (int thread = 0; thread < thread_count; ++thread) {
        threads.emplace_back([thread]() {
            for (
                int i = 0;
                i < values_per_thread;
                ++i
            ) {
                std::vector<Core::Point> moves = {
                    {thread, i}
                };

                auto cache_key =
                    Analysis::GlobalCache::make_key(
                        moves,
                        20,
                        1000 + i,
                        "rapfi"
                    );

                Analysis::GlobalCache::set(
                    cache_key,
                    {0.5, 0.5, 0.5}
                );

                Analysis::GlobalCache::get(
                    cache_key
                );
            }
        });
    }

    for (auto& thread : threads) {
        thread.join();
    }

    int found = 0;

    for (int thread = 0; thread < thread_count; ++thread) {
        for (
            int i = 0;
            i < values_per_thread;
            ++i
        ) {
            auto cache_key =
                Analysis::GlobalCache::make_key(
                    {{thread, i}},
                    20,
                    1000 + i,
                    "rapfi"
                );

            if (
                Analysis::GlobalCache::get(cache_key)
                    .has_value()
            ) {
                ++found;
            }
        }
    }

    EXPECT_GT(found, 0);
}

TEST_F(CacheTest, MoveOrderChangesKey) {
    auto first = key({
        {5, 5},
        {6, 6},
        {7, 7}
    });
    auto second = key({
        {7, 7},
        {6, 6},
        {5, 5}
    });

    EXPECT_FALSE(first == second);
}
