#pragma once

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>
#include "constants.h"

namespace Arena::Core {

inline bool is_rapfi_bot(
    const std::string& name_or_cmd
) {
    std::string lower = name_or_cmd;

    std::transform(
        lower.begin(),
        lower.end(),
        lower.begin(),
        [](unsigned char character) {
            return static_cast<char>(
                std::tolower(character)
            );
        }
    );

    return lower.find("rapfi") !=
        std::string::npos;
}

struct BotConfig {
    std::string cmd;
    long long memory = 0;
    int timeout_announce = 0;
    int timeout_cutoff = 0;
    int timeout_game = 0;
    uint64_t max_nodes = 0;
    bool lenient = false;

    void calculate_timeout(
        const std::string& bot_name
    ) {
        if (timeout_cutoff != 0) return;

        if (max_nodes > 0) {
            timeout_cutoff =
                Constants::DEFAULT_MAX_NODE_TIMEOUT;
            return;
        }

        if (is_rapfi_bot(bot_name)) {
            timeout_cutoff =
                static_cast<int>(
                    timeout_announce *
                    Constants::ENGINE_CUTOFF_FACTOR
                ) +
                Constants::ENGINE_CUTOFF_PLUS_MS;
        } else {
            timeout_cutoff = timeout_announce;
        }
    }
};

struct RunSpec {
    uint64_t p1_nodes = 0;
    uint64_t p2_nodes = 0;
    uint64_t eval_nodes =
        Constants::DEFAULT_EVAL_NODES;
    int min_pairs = 1;
    int max_pairs = 10;
    int repeat_index = 0;
    std::optional<uint64_t> seed;
};

struct BatchConfig {
    std::string p1_cmd;
    std::string p2_cmd;
    std::string eval_cmd;
    int board_size =
        Constants::DEFAULT_BOARD_SIZE;
    std::string openings_path;
    bool shuffle_openings = false;
    int threads = Constants::DEFAULT_THREADS;

    int p1_timeout_announce =
        Constants::DEFAULT_TIMEOUT_TURN_MS;
    int p2_timeout_announce =
        Constants::DEFAULT_TIMEOUT_TURN_MS;
    int p1_timeout_cutoff = 0;
    int p2_timeout_cutoff = 0;
    int p1_timeout_game = 0;
    int p2_timeout_game = 0;
    int eval_timeout_cutoff =
        Constants::DEFAULT_EVAL_CUTOFF_MS;

    long long p1_memory = 0;
    long long p2_memory = 0;
    bool p1_lenient = false;
    bool p2_lenient = false;

    std::vector<uint64_t> common_nodes_list;
    std::vector<uint64_t> p1_nodes_list;
    std::vector<uint64_t> p2_nodes_list;
    std::vector<uint64_t> eval_nodes_list;
    std::vector<int> min_pairs_list;
    std::vector<int> max_pairs_list;
    std::vector<uint64_t> seeds;
    int repeat = 1;

    double risk = Constants::DEFAULT_RISK;
    std::string api_url;
    std::string api_key;
    int debounce_ms = 0;
    std::string export_results;
    bool debug = false;
    bool show_board = false;
    bool cleanup = false;
    bool exit_on_crash = false;
    bool force_board = false;
};

struct Config {
    BotConfig bot1;
    BotConfig bot2;
    std::string eval_path;
    int eval_timeout_cutoff =
        Constants::DEFAULT_EVAL_CUTOFF_MS;
    int board_size =
        Constants::DEFAULT_BOARD_SIZE;
    bool use_openings = false;
    std::string openings_path;
    bool shuffle_openings = false;
    int threads = Constants::DEFAULT_THREADS;
    int max_pairs =
        Constants::DEFAULT_MAX_PAIRS;
    int min_pairs =
        Constants::DEFAULT_MIN_PAIRS;
    double risk = Constants::DEFAULT_RISK;
    bool debug = false;
    bool show_board = false;
    bool cleanup = false;
    bool exit_on_crash = false;
    bool force_board = false;
    std::string api_url;
    std::string api_key;
    int debounce_ms = 0;
    uint64_t eval_max_nodes =
        Constants::DEFAULT_EVAL_NODES;
    std::string export_results;
    std::optional<uint64_t> seed;
    int repeat_index = 0;

    bool eval_enabled() const {
        return !eval_path.empty();
    }
};

}
