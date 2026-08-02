#include "cache.h"
#include "zobrist.h"
#include "../core/constants.h"
#include <algorithm>
#include <mutex>

namespace {

uint64_t mix64(uint64_t value) {
    value ^= value >> 30;
    value *= 0xbf58476d1ce4e5b9ULL;
    value ^= value >> 27;
    value *= 0x94d049bb133111ebULL;
    value ^= value >> 31;
    return value;
}

}

namespace Arena::Analysis {

std::shared_mutex GlobalCache::mtx_;
std::vector<GlobalCache::Entry> GlobalCache::table_;

void GlobalCache::init(int) {
    clear();
}

void GlobalCache::clear() {
    std::unique_lock<std::shared_mutex> lock(mtx_);

    if (table_.size() != Core::Constants::CACHE_MAX_SIZE) {
        table_.assign(Core::Constants::CACHE_MAX_SIZE, Entry{});
    } else {
        std::fill(table_.begin(), table_.end(), Entry{});
    }
}

GlobalCache::Key GlobalCache::make_key(
    const std::vector<Core::Point>& moves,
    int board_size,
    uint64_t max_nodes,
    const std::string& evaluator_cmd
) {
    return {
        Zobrist::hash(moves, board_size),
        hash_command(evaluator_cmd),
        max_nodes,
        static_cast<uint32_t>(board_size)
    };
}

std::optional<Stats::EvalMetrics> GlobalCache::get(const Key& key) {
    std::shared_lock<std::shared_mutex> lock(mtx_);

    if (table_.empty()) {
        return std::nullopt;
    }

    const Entry& entry = table_[index_for(key)];

    return entry.valid && entry.key == key
        ? std::optional<Stats::EvalMetrics>(entry.metrics)
        : std::nullopt;
}

void GlobalCache::set(const Key& key, const Stats::EvalMetrics& metrics) {
    std::unique_lock<std::shared_mutex> lock(mtx_);

    if (table_.empty()) {
        table_.assign(Core::Constants::CACHE_MAX_SIZE, Entry{});
    }

    table_[index_for(key)] = {key, metrics, true};
}

size_t GlobalCache::index_for(const Key& key) {
    uint64_t hash = mix64(key.position);
    hash ^= mix64(key.evaluator + 0x9e3779b97f4a7c15ULL);
    hash ^= mix64(key.max_nodes + 0x3c79ac492ba7b653ULL);
    hash ^= mix64(
        static_cast<uint64_t>(key.board_size) + 0x1c69b3f74ac4ae35ULL
    );

    return static_cast<size_t>(
        hash & (Core::Constants::CACHE_MAX_SIZE - 1)
    );
}

uint64_t GlobalCache::hash_command(const std::string& command) {
    uint64_t hash = 1469598103934665603ULL;

    for (unsigned char value : command) {
        hash ^= value;
        hash *= 1099511628211ULL;
    }

    return hash;
}

}
