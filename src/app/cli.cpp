#include "cli.h"
#include "../core/constants.h"
#include "../core/utils.h"
#include "../game/openings.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <random>
#include <sstream>
#include <stdexcept>
#include <thread>

namespace {

int parse_int(
    const std::string& value,
    const std::string& label
) {
    if (value.empty()) {
        throw std::runtime_error(
            "Missing value for " + label
        );
    }

    size_t consumed = 0;
    long long parsed = 0;

    try {
        parsed = std::stoll(value, &consumed);
    } catch (const std::exception&) {
        throw std::runtime_error(
            "Invalid integer for " +
            label +
            ": " +
            value
        );
    }

    if (
        consumed != value.size() ||
        parsed <
            std::numeric_limits<int>::min() ||
        parsed >
            std::numeric_limits<int>::max()
    ) {
        throw std::runtime_error(
            "Invalid integer for " +
            label +
            ": " +
            value
        );
    }

    return static_cast<int>(parsed);
}

double parse_double(
    const std::string& value,
    const std::string& label
) {
    if (value.empty()) {
        throw std::runtime_error(
            "Missing value for " + label
        );
    }

    size_t consumed = 0;
    double parsed = 0;

    try {
        parsed = std::stod(value, &consumed);
    } catch (const std::exception&) {
        throw std::runtime_error(
            "Invalid number for " +
            label +
            ": " +
            value
        );
    }

    if (
        consumed != value.size() ||
        !std::isfinite(parsed)
    ) {
        throw std::runtime_error(
            "Invalid number for " +
            label +
            ": " +
            value
        );
    }

    return parsed;
}

uint64_t parse_unsigned(
    const std::string& value,
    const std::string& label
) {
    if (
        value.empty() ||
        value.front() == '-'
    ) {
        throw std::runtime_error(
            "Invalid unsigned integer for " +
            label +
            ": " +
            value
        );
    }

    size_t consumed = 0;
    unsigned long long parsed = 0;

    try {
        parsed = std::stoull(
            value,
            &consumed
        );
    } catch (const std::exception&) {
        throw std::runtime_error(
            "Invalid unsigned integer for " +
            label +
            ": " +
            value
        );
    }

    if (consumed != value.size()) {
        throw std::runtime_error(
            "Invalid unsigned integer for " +
            label +
            ": " +
            value
        );
    }

    return static_cast<uint64_t>(parsed);
}

std::vector<std::string> parse_csv(
    const std::string& value
) {
    if (
        !value.empty() &&
        (
            value.front() == ',' ||
            value.back() == ',' ||
            value.find(",,") != std::string::npos
        )
    ) {
        throw std::runtime_error(
            "Invalid comma-separated list: " + value
        );
    }

    return Arena::Core::Utils::split_csv(value);
}

}

namespace Arena::App {

Core::BatchConfig CLI::parse_batch_args(
    int argc,
    char* argv[]
) {
    Core::BatchConfig batch;
    std::vector<std::string> args(
        argv + 1,
        argv + argc
    );

    auto print_help = [&]() {
        std::cout
            << "usage: "
            << argv[0]
            << " -1 <cmd> -2 <cmd> [options]\n\n"
            << "Arena: high-performance Gomoku tournament runner.\n\n"
            << "PLAYERS\n"
            << "  -1, --p1 <cmd>               player 1 executable (required)\n"
            << "  -2, --p2 <cmd>               player 2 executable (required)\n"
            << "  -e, --eval <cmd>             evaluator engine for quality metrics\n"
            << "  -L, --lenient                ignore garbage output\n"
            << "  -L1, --p1-lenient            lenient mode for player 1 only\n"
            << "  -L2, --p2-lenient            lenient mode for player 2 only\n\n"
            << "GAME SETTINGS\n"
            << "  -s, --size <int>             board size, 5-40 (default: 20)\n"
            << "  -o, --openings <file>        opening positions file\n"
            << "  --shuffle-openings           randomize opening order\n"
            << "  -B, --force-board            force BOARD command every turn\n\n"
            << "TIME CONTROL\n"
            << "  Units: ms, s (default), m, h. Suffix 1/2 applies per player.\n"
            << "  -t[1|2], --timeout-announce  thinking time hint to bots\n"
            << "  -T[1|2], --timeout-cutoff    hard turn deadline\n"
            << "  -g[1|2], --timeout-game      total game time bank\n\n"
            << "RESOURCE LIMITS\n"
            << "  Memory: k, m (default), g. Nodes override time control.\n"
            << "  -l[1|2], --memory            memory limit\n"
            << "  -N[1|2|e], --max-nodes       search node limit\n\n"
            << "MATCH CONTROL\n"
            << "  -m, --min-pairs <int>        minimum pairs before early stop\n"
            << "  -M, --max-pairs <int>        maximum pairs to play\n"
            << "  -r, --risk <float>           SPRT risk threshold\n"
            << "  -j, --threads <int>          concurrent games\n\n"
            << "BATCH MODE\n"
            << "  Comma-separated values create batch configurations.\n"
            << "  --repeat <int>               repeat each configuration\n"
            << "  --seed <int,...>             explicit random seeds\n\n"
            << "API AND OUTPUT\n"
            << "  --api-url <url>              live update endpoint\n"
            << "  --api-key <key>              API authentication key\n"
            << "  --debounce <time>            API batch interval\n"
            << "  --cleanup                    clear API database first\n"
            << "  --export-results <file>      NDJSON result output\n\n"
            << "DEBUGGING\n"
            << "  -b, --show-board             print the board\n"
            << "  -d, --debug                  verbose logging\n"
            << "  --exit-on-crash              stop on bot failure\n"
            << "  -h, --help                   show this help\n";
        std::exit(0);
    };

    for (const auto& arg : args) {
        if (arg == "-h" || arg == "--help") {
            print_help();
        }
    }

    auto consume = [&](
        const std::string& flag,
        bool allow_dash = false
    ) -> std::optional<std::string> {
        if (flag.empty()) return std::nullopt;

        for (size_t i = 0; i < args.size(); ++i) {
            if (args[i] != flag) continue;

            args[i].clear();

            if (
                i + 1 < args.size() &&
                !args[i + 1].empty() &&
                (
                    allow_dash ||
                    args[i + 1].front() != '-'
                )
            ) {
                std::string value =
                    std::move(args[i + 1]);
                args[i + 1].clear();
                return value;
            }

            return "";
        }

        return std::nullopt;
    };

    auto consume_flag = [&](
        const std::string& flag
    ) {
        for (auto& arg : args) {
            if (arg != flag) continue;
            arg.clear();
            return true;
        }

        return false;
    };

    auto value_for = [&](
        const std::string& short_flag,
        const std::string& long_flag,
        bool allow_dash = false
    ) -> std::optional<std::string> {
        if (auto value = consume(
            short_flag,
            allow_dash
        )) {
            if (value->empty()) {
                throw std::runtime_error(
                    "Missing value for " +
                    short_flag
                );
            }
            return value;
        }

        if (auto value = consume(
            long_flag,
            allow_dash
        )) {
            if (value->empty()) {
                throw std::runtime_error(
                    "Missing value for " +
                    long_flag
                );
            }
            return value;
        }

        return std::nullopt;
    };

    auto get_string = [&](
        const std::string& short_flag,
        const std::string& long_flag,
        const char* environment
    ) {
        if (
            auto value = value_for(
                short_flag,
                long_flag
            )
        ) {
            return *value;
        }

        if (
            environment &&
            std::getenv(environment)
        ) {
            return std::string(
                std::getenv(environment)
            );
        }

        return std::string();
    };

    auto get_integer = [&](
        const std::string& short_flag,
        const std::string& long_flag,
        const char* environment,
        int fallback,
        bool* provided = nullptr
    ) {
        if (
            auto value = value_for(
                short_flag,
                long_flag,
                true
            )
        ) {
            if (provided) *provided = true;
            return parse_int(
                *value,
                !short_flag.empty()
                    ? short_flag
                    : long_flag
            );
        }

        if (
            environment &&
            std::getenv(environment)
        ) {
            if (provided) *provided = true;
            return parse_int(
                std::getenv(environment),
                environment
            );
        }

        return fallback;
    };

    auto get_duration = [&](
        const std::string& short_flag,
        const std::string& long_flag,
        const char* environment,
        int fallback
    ) {
        if (
            auto value = value_for(
                short_flag,
                long_flag,
                true
            )
        ) {
            return Core::Utils::parse_duration_ms(
                *value
            );
        }

        if (
            environment &&
            std::getenv(environment)
        ) {
            return Core::Utils::parse_duration_ms(
                std::getenv(environment)
            );
        }

        return fallback;
    };

    auto get_memory = [&](
        const std::string& short_flag,
        const std::string& long_flag,
        const char* environment,
        long long fallback
    ) {
        if (
            auto value = value_for(
                short_flag,
                long_flag,
                true
            )
        ) {
            return Core::Utils::parse_memory_bytes(
                *value
            );
        }

        if (
            environment &&
            std::getenv(environment)
        ) {
            return Core::Utils::parse_memory_bytes(
                std::getenv(environment)
            );
        }

        return fallback;
    };

    auto require_json_safe = [](
        uint64_t value,
        const std::string& label
    ) {
        if (
            value >
            Core::Constants::
                JSON_SAFE_INTEGER_MAX
        ) {
            throw std::runtime_error(
                label +
                " exceeds JSON safe integer range"
            );
        }

        return value;
    };

    auto get_node_list = [&](
        const std::string& short_flag,
        const std::string& long_flag
    ) {
        std::vector<uint64_t> result;

        auto value = value_for(
            short_flag,
            long_flag,
            true
        );

        if (!value) return result;

        auto items =
            parse_csv(*value);

        if (items.empty()) {
            throw std::runtime_error(
                "Empty node count list"
            );
        }

        for (const auto& item : items) {
            result.push_back(
                require_json_safe(
                    Core::Utils::parse_node_count(
                        item
                    ),
                    "node count"
                )
            );
        }

        return result;
    };

    batch.p1_cmd =
        get_string("-1", "--p1", nullptr);
    batch.p2_cmd =
        get_string("-2", "--p2", nullptr);
    batch.eval_cmd =
        get_string("-e", "--eval", nullptr);

    batch.board_size = get_integer(
        "-s",
        "--size",
        "SIZE",
        Core::Constants::DEFAULT_BOARD_SIZE
    );

    batch.openings_path = get_string(
        "-o",
        "--openings",
        "OPENINGS"
    );

    batch.shuffle_openings =
        consume_flag("--shuffle-openings");

    bool threads_provided = false;
    batch.threads = get_integer(
        "-j",
        "--threads",
        "THREADS",
        -1,
        &threads_provided
    );

    int common_announce = get_duration(
        "-t",
        "--timeout-announce",
        "TIMEOUT_ANNOUNCE",
        Core::Constants::
            DEFAULT_TIMEOUT_TURN_MS
    );

    batch.p1_timeout_announce =
        get_duration(
            "-t1",
            "--p1-timeout-announce",
            nullptr,
            common_announce
        );

    batch.p2_timeout_announce =
        get_duration(
            "-t2",
            "--p2-timeout-announce",
            nullptr,
            common_announce
        );

    int common_cutoff = get_duration(
        "-T",
        "--timeout-cutoff",
        "TIMEOUT_CUTOFF",
        0
    );

    batch.p1_timeout_cutoff =
        get_duration(
            "-T1",
            "--p1-timeout-cutoff",
            nullptr,
            common_cutoff
        );

    batch.p2_timeout_cutoff =
        get_duration(
            "-T2",
            "--p2-timeout-cutoff",
            nullptr,
            common_cutoff
        );

    int common_game = get_duration(
        "-g",
        "--timeout-game",
        "TIMEOUT_GAME",
        0
    );

    batch.p1_timeout_game =
        get_duration(
            "-g1",
            "--p1-timeout-game",
            nullptr,
            common_game
        );

    batch.p2_timeout_game =
        get_duration(
            "-g2",
            "--p2-timeout-game",
            nullptr,
            common_game
        );

    batch.eval_timeout_cutoff =
        get_duration(
            "",
            "--eval-timeout-cutoff",
            nullptr,
            Core::Constants::
                DEFAULT_EVAL_CUTOFF_MS
        );

    long long common_memory = get_memory(
        "-l",
        "--memory",
        "MEMORY",
        0
    );

    batch.p1_memory = get_memory(
        "-l1",
        "--p1-memory",
        nullptr,
        common_memory
    );

    batch.p2_memory = get_memory(
        "-l2",
        "--p2-memory",
        nullptr,
        common_memory
    );

    bool lenient_short =
        consume_flag("-L");
    bool lenient_long =
        consume_flag("--lenient");
    bool common_lenient =
        lenient_short || lenient_long;

    bool p1_lenient_short =
        consume_flag("-L1");
    bool p1_lenient_long =
        consume_flag("--p1-lenient");
    bool p2_lenient_short =
        consume_flag("-L2");
    bool p2_lenient_long =
        consume_flag("--p2-lenient");

    batch.p1_lenient =
        common_lenient ||
        p1_lenient_short ||
        p1_lenient_long;

    batch.p2_lenient =
        common_lenient ||
        p2_lenient_short ||
        p2_lenient_long;

    batch.common_nodes_list =
        get_node_list(
            "-N",
            "--max-nodes"
        );

    batch.p1_nodes_list =
        get_node_list(
            "-N1",
            "--p1-max-nodes"
        );

    batch.p2_nodes_list =
        get_node_list(
            "-N2",
            "--p2-max-nodes"
        );

    batch.eval_nodes_list =
        get_node_list(
            "-Ne",
            "--eval-max-nodes"
        );

    if (
        auto value = value_for(
            "-m",
            "",
            true
        )
    ) {
        auto items =
            parse_csv(*value);

        if (items.empty()) {
            throw std::runtime_error(
                "Empty minimum-pairs list"
            );
        }

        for (const auto& item : items) {
            batch.min_pairs_list.push_back(
                parse_int(item, "-m")
            );
        }
    }

    if (batch.min_pairs_list.empty()) {
        batch.min_pairs_list.push_back(
            get_integer(
                "",
                "--min-pairs",
                "MIN_PAIRS",
                Core::Constants::
                    DEFAULT_MIN_PAIRS
            )
        );
    }

    if (
        auto value = value_for(
            "-M",
            "",
            true
        )
    ) {
        auto items =
            parse_csv(*value);

        if (items.empty()) {
            throw std::runtime_error(
                "Empty maximum-pairs list"
            );
        }

        for (const auto& item : items) {
            batch.max_pairs_list.push_back(
                parse_int(item, "-M")
            );
        }
    }

    if (batch.max_pairs_list.empty()) {
        batch.max_pairs_list.push_back(
            get_integer(
                "",
                "--max-pairs",
                "MAX_PAIRS",
                Core::Constants::
                    DEFAULT_MAX_PAIRS
            )
        );
    }

    if (
        auto value = value_for(
            "-r",
            "--risk",
            true
        )
    ) {
        batch.risk = parse_double(
            *value,
            "--risk"
        );
    } else if (std::getenv("RISK")) {
        batch.risk = parse_double(
            std::getenv("RISK"),
            "RISK"
        );
    } else {
        batch.risk =
            Core::Constants::DEFAULT_RISK;
    }

    batch.repeat = get_integer(
        "",
        "--repeat",
        nullptr,
        1
    );

    if (
        auto value = value_for(
            "",
            "--seed",
            true
        )
    ) {
        auto items =
            parse_csv(*value);

        if (items.empty()) {
            throw std::runtime_error(
                "Empty seed list"
            );
        }

        for (const auto& item : items) {
            batch.seeds.push_back(
                require_json_safe(
                    parse_unsigned(
                        item,
                        "--seed"
                    ),
                    "seed"
                )
            );
        }
    }

    bool debug_short =
        consume_flag("-d");
    bool debug_long =
        consume_flag("--debug");
    batch.debug =
        debug_short || debug_long;

    bool board_short =
        consume_flag("-b");
    bool board_long =
        consume_flag("--show-board");
    batch.show_board =
        board_short || board_long;

    batch.cleanup =
        consume_flag("--cleanup");
    batch.exit_on_crash =
        consume_flag("--exit-on-crash");

    bool force_short =
        consume_flag("-B");
    bool force_long =
        consume_flag("--force-board");
    batch.force_board =
        force_short || force_long;

    batch.api_url = get_string(
        "",
        "--api-url",
        "API_URL"
    );

    batch.api_key = get_string(
        "",
        "--api-key",
        "API_KEY"
    );

    batch.debounce_ms = get_duration(
        "",
        "--debounce",
        "DEBOUNCE",
        500
    );

    if (
        auto value = value_for(
            "",
            "--export-results"
        )
    ) {
        batch.export_results = *value;
    }

    if (
        batch.p1_cmd.empty() ||
        batch.p2_cmd.empty()
    ) {
        throw std::runtime_error(
            "Missing -1/--p1 or -2/--p2"
        );
    }

    if (
        !batch.api_url.empty() !=
        !batch.api_key.empty()
    ) {
        throw std::runtime_error(
            "API URL and API Key must be provided together"
        );
    }

    if (
        batch.board_size < 5 ||
        batch.board_size > 40
    ) {
        throw std::runtime_error(
            "Board size must be between 5 and 40"
        );
    }

    if (
        threads_provided &&
        batch.threads < 1
    ) {
        throw std::runtime_error(
            "--threads must be >= 1"
        );
    }

    if (batch.repeat < 1) {
        throw std::runtime_error(
            "--repeat must be >= 1"
        );
    }

    for (int pairs : batch.min_pairs_list) {
        if (pairs < 1) {
            throw std::runtime_error(
                "--min-pairs must be >= 1"
            );
        }
    }

    for (int pairs : batch.max_pairs_list) {
        if (pairs < 1) {
            throw std::runtime_error(
                "--max-pairs must be >= 1"
            );
        }
    }

    if (
        batch.risk < 0.0 ||
        batch.risk > 1.0
    ) {
        throw std::runtime_error(
            "--risk must be between 0.0 and 1.0"
        );
    }

    while (
        !batch.api_url.empty() &&
        batch.api_url.back() == '/'
    ) {
        batch.api_url.pop_back();
    }

    if (
        !batch.api_url.empty() !=
        !batch.api_key.empty()
    ) {
        throw std::runtime_error(
            "API URL and API Key must be provided together"
        );
    }

    unsigned int hardware =
        std::thread::hardware_concurrency();

    if (
        batch.threads > 0 &&
        hardware > 0 &&
        batch.threads >
            static_cast<int>(hardware)
    ) {
        throw std::runtime_error(
            "Requested threads (" +
            std::to_string(batch.threads) +
            ") exceed hardware concurrency (" +
            std::to_string(hardware) +
            ")"
        );
    }

    for (const auto& arg : args) {
        if (!arg.empty()) {
            throw std::runtime_error(
                "Unknown argument: " + arg
            );
        }
    }

    if (batch.threads == -1) {
        bool iterative =
            !batch.common_nodes_list.empty() ||
            !batch.p1_nodes_list.empty() ||
            !batch.p2_nodes_list.empty();

        int available =
            hardware == 0
                ? 4
                : static_cast<int>(hardware);

        batch.threads = iterative
            ? available
            : std::max(
                1,
                available / 2 - 1
            );
    }

    return batch;
}

std::vector<Core::RunSpec>
CLI::expand_batch(
    const Core::BatchConfig& batch
) {
    std::vector<Core::RunSpec> runs;

    auto evaluator_nodes =
        batch.eval_nodes_list.empty()
            ? std::vector<uint64_t>{
                Core::Constants::
                    DEFAULT_EVAL_NODES
            }
            : batch.eval_nodes_list;

    bool use_common =
        !batch.common_nodes_list.empty() &&
        batch.p1_nodes_list.empty() &&
        batch.p2_nodes_list.empty();

    auto add_run = [&](
        uint64_t p1_nodes,
        uint64_t p2_nodes,
        uint64_t eval_nodes,
        int min_pairs,
        int max_pairs,
        int repeat_index
    ) {
        Core::RunSpec run;
        run.p1_nodes = p1_nodes;
        run.p2_nodes = p2_nodes;
        run.eval_nodes = eval_nodes;
        run.min_pairs =
            std::min(min_pairs, max_pairs);
        run.max_pairs = max_pairs;
        run.repeat_index = repeat_index;

        if (
            repeat_index <
            static_cast<int>(
                batch.seeds.size()
            )
        ) {
            run.seed =
                batch.seeds[repeat_index];
        }

        runs.push_back(run);
    };

    if (use_common) {
        for (
            uint64_t nodes :
            batch.common_nodes_list
        ) {
            for (
                uint64_t eval_nodes :
                evaluator_nodes
            ) {
                for (
                    int min_pairs :
                    batch.min_pairs_list
                ) {
                    for (
                        int max_pairs :
                        batch.max_pairs_list
                    ) {
                        for (
                            int repeat = 0;
                            repeat < batch.repeat;
                            ++repeat
                        ) {
                            add_run(
                                nodes,
                                nodes,
                                eval_nodes,
                                min_pairs,
                                max_pairs,
                                repeat
                            );
                        }
                    }
                }
            }
        }
    } else {
        auto p1_nodes =
            batch.p1_nodes_list.empty()
                ? std::vector<uint64_t>{0}
                : batch.p1_nodes_list;

        auto p2_nodes =
            batch.p2_nodes_list.empty()
                ? std::vector<uint64_t>{0}
                : batch.p2_nodes_list;

        for (uint64_t first : p1_nodes) {
            for (uint64_t second : p2_nodes) {
                for (
                    uint64_t eval_nodes :
                    evaluator_nodes
                ) {
                    for (
                        int min_pairs :
                        batch.min_pairs_list
                    ) {
                        for (
                            int max_pairs :
                            batch.max_pairs_list
                        ) {
                            for (
                                int repeat = 0;
                                repeat < batch.repeat;
                                ++repeat
                            ) {
                                add_run(
                                    first,
                                    second,
                                    eval_nodes,
                                    min_pairs,
                                    max_pairs,
                                    repeat
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    std::mt19937 generator(
        std::random_device{}()
    );
    std::shuffle(
        runs.begin(),
        runs.end(),
        generator
    );

    return runs;
}

Core::Config CLI::build_config(
    const Core::BatchConfig& batch,
    const Core::RunSpec& run
) {
    Core::Config config;

    config.bot1.cmd = batch.p1_cmd;
    config.bot2.cmd = batch.p2_cmd;
    config.eval_path = batch.eval_cmd;
    config.board_size = batch.board_size;
    config.openings_path =
        batch.openings_path;
    config.use_openings =
        !batch.openings_path.empty();
    config.shuffle_openings =
        batch.shuffle_openings;
    config.threads = batch.threads;
    config.max_pairs = run.max_pairs;
    config.min_pairs = run.min_pairs;
    config.risk = batch.risk;
    config.debug = batch.debug;
    config.show_board = batch.show_board;
    config.cleanup = batch.cleanup;
    config.exit_on_crash =
        batch.exit_on_crash;
    config.force_board =
        batch.force_board;
    config.api_url = batch.api_url;
    config.api_key = batch.api_key;
    config.debounce_ms =
        batch.debounce_ms;
    config.eval_max_nodes =
        run.eval_nodes;
    config.export_results =
        batch.export_results;
    config.seed = run.seed;
    config.repeat_index =
        run.repeat_index;
    config.eval_timeout_cutoff =
        batch.eval_timeout_cutoff;

    config.bot1.timeout_announce =
        batch.p1_timeout_announce;
    config.bot1.timeout_cutoff =
        batch.p1_timeout_cutoff;
    config.bot1.timeout_game =
        batch.p1_timeout_game;
    config.bot1.memory =
        batch.p1_memory;
    config.bot1.max_nodes =
        run.p1_nodes;
    config.bot1.lenient =
        batch.p1_lenient;

    config.bot2.timeout_announce =
        batch.p2_timeout_announce;
    config.bot2.timeout_cutoff =
        batch.p2_timeout_cutoff;
    config.bot2.timeout_game =
        batch.p2_timeout_game;
    config.bot2.memory =
        batch.p2_memory;
    config.bot2.max_nodes =
        run.p2_nodes;
    config.bot2.lenient =
        batch.p2_lenient;

    return config;
}

std::string CLI::generate_config_label(
    const Core::Config& config
) {
    std::ostringstream label;
    bool first = true;

    auto add = [&](
        const char* name,
        const std::string& value
    ) {
        if (value.empty()) return;

        if (!first) label << ", ";
        label << name << "=" << value;
        first = false;
    };

    if (
        config.bot1.max_nodes ==
            config.bot2.max_nodes &&
        config.bot1.max_nodes > 0
    ) {
        add(
            "N",
            Core::Utils::format_nodes(
                config.bot1.max_nodes
            )
        );
    } else {
        if (config.bot1.max_nodes > 0) {
            add(
                "N1",
                Core::Utils::format_nodes(
                    config.bot1.max_nodes
                )
            );
        }

        if (config.bot2.max_nodes > 0) {
            add(
                "N2",
                Core::Utils::format_nodes(
                    config.bot2.max_nodes
                )
            );
        }
    }

    if (
        config.bot1.max_nodes == 0 &&
        config.bot2.max_nodes == 0
    ) {
        if (
            config.bot1.timeout_announce ==
            config.bot2.timeout_announce
        ) {
            if (
                config.bot1.timeout_announce !=
                Core::Constants::
                    DEFAULT_TIMEOUT_TURN_MS
            ) {
                add(
                    "T",
                    std::to_string(
                        config.bot1
                            .timeout_announce /
                        1000
                    ) +
                    "s"
                );
            }
        } else {
            add(
                "T1",
                std::to_string(
                    config.bot1
                        .timeout_announce /
                    1000
                ) +
                "s"
            );
            add(
                "T2",
                std::to_string(
                    config.bot2
                        .timeout_announce /
                    1000
                ) +
                "s"
            );
        }
    }

    if (
        config.bot1.memory > 0 &&
        config.bot1.memory ==
            config.bot2.memory
    ) {
        add(
            "M",
            std::to_string(
                config.bot1.memory /
                (1024 * 1024)
            ) +
            "m"
        );
    }

    return first
        ? "default"
        : label.str();
}

std::deque<GameParams>
CLI::create_pending_games(
    const Core::Config& config,
    const std::vector<
        std::vector<Core::Point>
    >& openings,
    std::optional<uint64_t> seed,
    std::shared_ptr<RunContext> context,
    const std::string& run_id
) {
    if (config.use_openings) {
        if (openings.empty()) {
            throw std::runtime_error(
                "No openings available"
            );
        }

        for (
            size_t index = 0;
            index < openings.size();
            ++index
        ) {
            try {
                Game::Openings::validate(
                    openings[index],
                    config.board_size
                );
            } catch (
                const std::exception& error
            ) {
                throw std::runtime_error(
                    "Invalid opening " +
                    std::to_string(index + 1) +
                    ": " +
                    error.what()
                );
            }
        }
    }

    std::deque<GameParams> pending;

    for (
        int pair = 0;
        pair < config.max_pairs;
        ++pair
    ) {
        std::vector<Core::Point> opening;

        if (config.use_openings) {
            opening =
                openings[
                    static_cast<size_t>(pair) %
                    openings.size()
                ];
        }

        pending.push_back({
            pair + 1,
            0,
            config.bot1,
            config.bot2,
            opening,
            seed,
            context,
            run_id,
            nullptr
        });

        pending.push_back({
            pair + 1,
            1,
            config.bot2,
            config.bot1,
            opening,
            seed,
            context,
            run_id,
            nullptr
        });
    }

    return pending;
}

}
