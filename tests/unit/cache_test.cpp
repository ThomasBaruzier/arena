#include "../common/test_utils.h"
#include "../src/analysis/cache.h"

using namespace Arena;

class CacheTest : public ::testing::Test {
protected:
    void SetUp() override {
        Analysis::GlobalCache::init(20);
    }
};

TEST_F(CacheTest, StorageRetrieval) {
    std::vector<Core::Point> moves = {{9,9}};
    uint64_t h = Analysis::GlobalCache::hash(moves, 20);
    Stats::EvalMetrics m{0.9, 0.5, 0.5};

    Analysis::GlobalCache::set(h, m);
    auto res = Analysis::GlobalCache::get(h);

    ASSERT_TRUE(res.has_value());
    EXPECT_DOUBLE_EQ(res->p_best, 0.9);
}

TEST_F(CacheTest, Overwrite) {
    uint64_t h = 0xCAFEBABE;
    Analysis::GlobalCache::set(h, {0.1, 0.1, 0.1});
    Analysis::GlobalCache::set(h, {0.9, 0.9, 0.9});

    auto res = Analysis::GlobalCache::get(h);
    ASSERT_TRUE(res.has_value());
    EXPECT_DOUBLE_EQ(res->p_best, 0.9);
}

TEST_F(CacheTest, HashCollisionSimulation) {
    uint64_t h = 12345;
    Analysis::GlobalCache::set(h, {0.5, 0.5, 0.5});
    auto res = Analysis::GlobalCache::get(h);
    EXPECT_TRUE(res.has_value());

    auto miss = Analysis::GlobalCache::get(h + 1);
    EXPECT_FALSE(miss.has_value());
}

TEST_F(CacheTest, StressTest) {
    for (int i = 0; i < 1000; ++i) {
        uint64_t h = (uint64_t)i * 99999;
        Analysis::GlobalCache::set(h, {0.0, 0.0, 0.0});
    }
    auto res = Analysis::GlobalCache::get(0);
    EXPECT_TRUE(res.has_value());
}

TEST_F(CacheTest, ZeroHash) {
    Analysis::GlobalCache::set(0, {0.42, 0.42, 0.42});
    auto res = Analysis::GlobalCache::get(0);
    ASSERT_TRUE(res.has_value());
    EXPECT_DOUBLE_EQ(res->p_best, 0.42);
}

TEST_F(CacheTest, MaxHash) {
    uint64_t max_hash = ~0ULL;
    Analysis::GlobalCache::set(max_hash, {0.99, 0.01, 0.50});
    auto res = Analysis::GlobalCache::get(max_hash);
    ASSERT_TRUE(res.has_value());
    EXPECT_DOUBLE_EQ(res->p_best, 0.99);
}

TEST_F(CacheTest, ConcurrentSets) {
    const int N = 100;
    std::vector<std::thread> threads;
    for (int t = 0; t < 4; ++t) {
        threads.emplace_back([t, N]() {
            for (int i = 0; i < N; ++i) {
                uint64_t h = (uint64_t)(t * N + i);
                Analysis::GlobalCache::set(h, {0.5, 0.5, 0.5});
            }
        });
    }
    for (auto& t : threads) t.join();

    int found = 0;
    for (int i = 0; i < 4 * N; ++i) {
        if (Analysis::GlobalCache::get((uint64_t)i).has_value()) found++;
    }
    EXPECT_GT(found, 0);
}

TEST_F(CacheTest, HashFromMoves) {
    std::vector<Core::Point> moves1 = {{5, 5}};
    std::vector<Core::Point> moves2 = {{5, 5}, {6, 6}};

    uint64_t h1 = Analysis::GlobalCache::hash(moves1, 20);
    uint64_t h2 = Analysis::GlobalCache::hash(moves2, 20);

    EXPECT_NE(h1, h2);
}
