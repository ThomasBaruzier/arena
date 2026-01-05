#include "cache.h"
#include "../core/constants.h"
#include <mutex>

namespace Arena::Analysis {

    std::shared_mutex GlobalCache::mtx_;
    std::vector<GlobalCache::Entry> GlobalCache::table_;

    void GlobalCache::init(int size) {
        std::unique_lock<std::shared_mutex> l(mtx_);
        Zobrist::init(size);
        if (table_.empty()) table_.resize(Core::Constants::CACHE_MAX_SIZE);
    }

    std::optional<Stats::EvalMetrics> GlobalCache::get(uint64_t h) {
        size_t idx = h & (Core::Constants::CACHE_MAX_SIZE - 1);
        std::shared_lock<std::shared_mutex> l(mtx_);
        if (table_[idx].hash != h) return std::nullopt;
        return table_[idx].metrics;
    }

    void GlobalCache::set(uint64_t h, Stats::EvalMetrics v) {
        size_t idx = h & (Core::Constants::CACHE_MAX_SIZE - 1);
        std::unique_lock<std::shared_mutex> l(mtx_);
        table_[idx] = {h, v};
    }
}
