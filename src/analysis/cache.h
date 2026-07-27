#pragma once

#include <cstdint>
#include <optional>
#include <shared_mutex>
#include <string>
#include <vector>
#include "../core/types.h"
#include "../stats/metrics.h"

namespace Arena::Analysis {

class GlobalCache {
public:
    struct Key {
        uint64_t position = 0;
        uint64_t evaluator = 0;
        uint64_t max_nodes = 0;
        uint32_t board_size = 0;

        bool operator==(const Key& other) const {
            return position == other.position &&
                evaluator == other.evaluator &&
                max_nodes == other.max_nodes &&
                board_size == other.board_size;
        }
    };

    static void init(int board_size);
    static void clear();

    static Key make_key(
        const std::vector<Core::Point>& moves,
        int board_size,
        uint64_t max_nodes,
        const std::string& evaluator_cmd
    );

    static std::optional<Stats::EvalMetrics> get(
        const Key& key
    );

    static void set(
        const Key& key,
        const Stats::EvalMetrics& metrics
    );

private:
    struct Entry {
        Key key;
        Stats::EvalMetrics metrics;
        bool valid = false;
    };

    static size_t index_for(const Key& key);
    static uint64_t hash_command(const std::string& command);

    static std::shared_mutex mtx_;
    static std::vector<Entry> table_;
};

}
