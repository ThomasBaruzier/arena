#pragma once

#include <shared_mutex>
#include <vector>
#include <optional>
#include "../stats/metrics.h"
#include "zobrist.h"

namespace Arena::Analysis {
    class GlobalCache {
    public:
        static void init(int size);
        static std::optional<Stats::EvalMetrics> get(uint64_t h);
        static void set(uint64_t h, Stats::EvalMetrics v);

        static uint64_t hash(const std::vector<Core::Point>& moves, int sz) {
            return Zobrist::hash(moves, sz);
        }

    private:
        struct Entry {
            uint64_t hash = 0;
            Stats::EvalMetrics metrics;
        };

        static std::shared_mutex mtx_;
        static std::vector<Entry> table_;
    };
}
