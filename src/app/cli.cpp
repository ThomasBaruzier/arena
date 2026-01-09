#include "cli.h"
#include "../core/constants.h"
#include "../core/utils.h"
#include <iostream>
#include <thread>
#include <algorithm>
#include <random>

namespace Arena::App {

Core::BatchConfig CLI::parse_batch_args(int argc, char* argv[]) {
    Core::BatchConfig bc;
    std::vector<std::string> args(argv + 1, argv + argc);

    auto print_help = [&]() {
        std::cout << "usage: " << argv[0] << " -1 <cmd> -2 <cmd> [options]\n\n"
            << "Gomoku Arena: batch tournament runner with Elo and decision quality metrics.\n\n";

        std::cout << "PLAYERS\n"
            << "  -1, --p1 <cmd>               player 1 executable (required)\n"
            << "  -2, --p2 <cmd>               player 2 executable (required)\n"
            << "  -e, --eval <cmd>             evaluator engine for quality metrics\n\n";

        std::cout << "GAME SETTINGS\n"
            << "  -s, --size <int>             board size, 5-40 (default: 20)\n"
            << "  -o, --openings <file>        opening positions file\n"
            << "  --shuffle-openings           randomize opening order\n\n";

        std::cout << "TIME CONTROL\n"
            << "  Units: ms, s (default), m, h. Suffix 1/2 for per-player: -t1 5s -t2 10s.\n"
            << "  Long forms: --p1-timeout-announce, --p2-timeout-game, etc.\n\n"
            << "  -t[1|2], --timeout-announce  thinking time hint to bots (default: 5s)\n"
            << "  -T[1|2], --timeout-cutoff    hard turn deadline (default: timeout announce)\n"
            << "  -g[1|2], --timeout-game      total game time bank (default: unlimited)\n\n";

        std::cout << "RESOURCE LIMITS\n"
            << "  Memory: k, m (default), g. Nodes override time control (deterministic).\n"
            << "  Long forms: --p1-memory, --p2-max-nodes, --eval-max-nodes, etc.\n\n"
            << "  -l[1|2], --memory            limit memory (default: unlimited)\n"
            << "  -N[1|2|e], --max-nodes       search node limit (evaluator default: 15M)\n\n";

        std::cout << "MATCH CONTROL\n"
            << "  -m, --min-pairs <int>        minimum pairs before early stop (default: 5)\n"
            << "  -M, --max-pairs <int>        maximum pairs to play (default: 10)\n"
            << "  -r, --risk <float>           early stop confidence threshold (default: 0)\n"
            << "  -j, --threads <int>          concurrent games (default: 4)\n\n";

        std::cout << "BATCH MODE\n"
            << "  Comma-separated lists (no spaces): -N 250k,500k,1m -M 25,50\n"
            << "  Arena generates Cartesian product; tournaments processed sequentially.\n"
            << "  Per-player lists (-N1, -N2) enable asymmetric comparison.\n\n"
            << "  --repeat <int>               run each configuration N times (default: 1)\n"
            << "  --seed <int,...>             explicit seeds to rotate through\n\n";

        std::cout << "API AND OUTPUT\n"
            << "  --api-url <url>              remote endpoint for live results\n"
            << "  --api-key <key>              API authentication key\n"
            << "  --debounce <time>            API batch interval (default: half of announce)\n"
            << "  --cleanup                    clear API database before starting\n"
            << "  --export-results <file>      NDJSON output, one line per finished config\n\n";

        std::cout << "DEBUGGING\n"
            << "  -b, --show-board             print board after each move\n"
            << "  -d, --debug                  verbose logging with CPU metrics\n"
            << "  --exit-on-crash              terminate immediately on bot crash\n"
            << "  -h, --help                   show this message\n\n";

        std::cout << "EXAMPLES\n"
            << "  arena -1 ./a -2 ./b -M 50\n"
            << "  arena -1 ./new -2 ./old -e ./rapfi -t 10s\n"
            << "  arena -1 ./a -2 ./b -t1 1s -t2 10s -N1 10000 -N2 10000\n"
            << "  arena -1 ./a -2 ./b -N 250k,500k,1m -M 25,50 --repeat 3\n"
            << "  arena -1 ./a -2 ./b -N1 100k,250k -N2 1m -M 25\n\n";

        std::cout << "ENVIRONMENT VARIABLES\n"
            << "  THREADS, MEMORY, SIZE, OPENINGS, TIMEOUT_ANNOUNCE, TIMEOUT_CUTOFF,\n"
            << "  TIMEOUT_GAME, MAX_PAIRS, MIN_PAIRS, RISK, API_URL, API_KEY, DEBOUNCE\n\n";

        std::cout << "METRICS\n"
            << "  Elo        relative strength from win/loss/draw outcomes\n"
            << "  SW-DQI     sharpness-weighted decision quality index (0-100)\n"
            << "  CMA        critical move accuracy: success rate in sharp positions\n"
            << "  Blunder    severe error rate: moves losing >20% win probability\n"
            << "  Crashes    process failures, timeouts, or illegal moves\n\n";

        std::cout << "EXIT CODES\n"
            << "  0   success\n"
            << "  1   system failure (config, I/O, resource)\n"
            << "  2   bot failure (crash, timeout, illegal move)\n";
        exit(0);
    };

    for (const auto& arg : args) {
        if (arg == "-h" || arg == "--help") print_help();
    }

    auto consume = [&](const std::string& flag) -> std::optional<std::string> {
        for (size_t i = 0; i < args.size(); ++i) {
            if (args[i] != flag) continue;
            args[i].clear();
            if (i + 1 < args.size() && !args[i + 1].empty() && args[i + 1][0] != '-') {
                std::string val = std::move(args[i + 1]);
                args[i + 1].clear();
                return val;
            }
            return "";
        }
        return std::nullopt;
    };

    auto consume_flag = [&](const std::string& flag) -> bool {
        for (auto& arg : args) if (arg == flag) { arg.clear(); return true; }
        return false;
    };

    auto get_str = [&](const std::string& s, const std::string& l, const char* e) {
        if (auto v = consume(s); v && !v->empty()) return *v;
        if (auto v = consume(l); v && !v->empty()) return *v;
        return (e && std::getenv(e)) ? std::string(std::getenv(e)) : std::string("");
    };

    auto get_int = [&](const std::string& s, const std::string& l, const char* e, int d) {
        if (auto v = consume(s); v && !v->empty()) return std::stoi(*v);
        if (auto v = consume(l); v && !v->empty()) return std::stoi(*v);
        return (e && std::getenv(e)) ? std::stoi(std::getenv(e)) : d;
    };

    auto get_dur = [&](const std::string& s, const std::string& l, const char* e, int d) {
        if (auto v = consume(s); v && !v->empty()) return Core::Utils::parse_duration_ms(*v);
        if (auto v = consume(l); v && !v->empty()) return Core::Utils::parse_duration_ms(*v);
        return (e && std::getenv(e)) ? Core::Utils::parse_duration_ms(std::getenv(e)) : d;
    };

    auto get_mem = [&](const std::string& s, const std::string& l, const char* e, long long d) {
        if (auto v = consume(s); v && !v->empty()) return Core::Utils::parse_memory_bytes(*v);
        if (auto v = consume(l); v && !v->empty()) return Core::Utils::parse_memory_bytes(*v);
        return (e && std::getenv(e)) ? Core::Utils::parse_memory_bytes(std::getenv(e)) : d;
    };

    auto get_node_list = [&](const std::string& s, const std::string& l) {
        std::vector<uint64_t> res;
        auto v = consume(s);
        if (!v) v = consume(l);
        if (v && !v->empty()) {
            for (const auto& i : Core::Utils::split_csv(*v))
                res.push_back(Core::Utils::parse_node_count(i));
        }
        return res;
    };

    bc.p1_cmd = get_str("-1", "--p1", nullptr);
    bc.p2_cmd = get_str("-2", "--p2", nullptr);
    bc.eval_cmd = get_str("-e", "--eval", nullptr);
    bc.board_size = get_int("-s", "--size", "SIZE", Core::Constants::DEFAULT_BOARD_SIZE);
    bc.openings_path = get_str("-o", "--openings", "OPENINGS");
    bc.shuffle_openings = consume_flag("--shuffle-openings");
    bc.threads = get_int("-j", "--threads", "THREADS", Core::Constants::DEFAULT_THREADS);

    int common_announce = get_dur(
        "-t", "--timeout-announce", "TIMEOUT_ANNOUNCE", Core::Constants::DEFAULT_TIMEOUT_TURN_MS
    );
    bc.p1_timeout_announce = get_dur("-t1", "--p1-timeout-announce", nullptr, common_announce);
    bc.p2_timeout_announce = get_dur("-t2", "--p2-timeout-announce", nullptr, common_announce);

    int common_cutoff = get_dur("-T", "--timeout-cutoff", "TIMEOUT_CUTOFF", 0);
    bc.p1_timeout_cutoff = get_dur("-T1", "--p1-timeout-cutoff", nullptr, common_cutoff);
    bc.p2_timeout_cutoff = get_dur("-T2", "--p2-timeout-cutoff", nullptr, common_cutoff);

    int common_game = get_dur("-g", "--timeout-game", "TIMEOUT_GAME", 0);
    bc.p1_timeout_game = get_dur("-g1", "--p1-timeout-game", nullptr, common_game);
    bc.p2_timeout_game = get_dur("-g2", "--p2-timeout-game", nullptr, common_game);

    bc.eval_timeout_cutoff = get_dur(
        "", "--eval-timeout-cutoff", nullptr, Core::Constants::DEFAULT_EVAL_CUTOFF_MS
    );

    long long common_mem = get_mem("-l", "--memory", "MEMORY", 0);
    bc.p1_memory = get_mem("-l1", "--p1-memory", nullptr, common_mem);
    bc.p2_memory = get_mem("-l2", "--p2-memory", nullptr, common_mem);

    bc.common_nodes_list = get_node_list("-N", "--max-nodes");
    bc.p1_nodes_list = get_node_list("-N1", "--p1-max-nodes");
    bc.p2_nodes_list = get_node_list("-N2", "--p2-max-nodes");
    bc.eval_nodes_list = get_node_list("-Ne", "--eval-max-nodes");

    if (auto v = consume("-m"))
        for (const auto& i : Core::Utils::split_csv(*v))
            bc.min_pairs_list.push_back(std::stoi(i));
    if (bc.min_pairs_list.empty()) {
        bc.min_pairs_list.push_back(
            get_int("", "--min-pairs", "MIN_PAIRS", Core::Constants::DEFAULT_MIN_PAIRS)
        );
    }

    if (auto v = consume("-M"))
        for (const auto& i : Core::Utils::split_csv(*v))
            bc.max_pairs_list.push_back(std::stoi(i));
    if (bc.max_pairs_list.empty()) {
        bc.max_pairs_list.push_back(
            get_int("", "--max-pairs", "MAX_PAIRS", Core::Constants::DEFAULT_MAX_PAIRS)
        );
    }

    bc.risk = [&]() {
        if (auto v = consume("-r"); v && !v->empty()) return std::stod(*v);
        if (auto v = consume("--risk"); v && !v->empty()) return std::stod(*v);
        return (std::getenv("RISK"))
            ? std::stod(std::getenv("RISK"))
            : Core::Constants::DEFAULT_RISK;
    }();

    bc.repeat = get_int("", "--repeat", nullptr, 1);
    if (auto v = consume("--seed"); v && !v->empty()) {
        for (const auto& i : Core::Utils::split_csv(*v)) bc.seeds.push_back(std::stoull(i));
    }

    bc.debug = consume_flag("-d") || consume_flag("--debug");
    bc.show_board = consume_flag("-b") || consume_flag("--show-board");
    bc.cleanup = consume_flag("--cleanup");
    bc.exit_on_crash = consume_flag("--exit-on-crash");
    bc.api_url = get_str("", "--api-url", "API_URL");
    bc.api_key = get_str("", "--api-key", "API_KEY");
    bc.debounce_ms = get_dur(
        "", "--debounce", "DEBOUNCE", std::max(100, bc.p1_timeout_announce / 2)
    );
    if (auto v = consume("--export-results");
    v && !v->empty()) bc.export_results = *v;

    if (bc.p1_cmd.empty() || bc.p2_cmd.empty()) {
        throw std::runtime_error("Missing -1/--p1 or -2/--p2");
    }

    if (!bc.api_url.empty() != !bc.api_key.empty()) {
        throw std::runtime_error("API URL and API Key must be provided together");
    }
    if (bc.board_size < 5 || bc.board_size > 40) {
        throw std::runtime_error("Board size must be between 5 and 40");
    }
    for (int mp : bc.max_pairs_list) {
        if (mp < 1) throw std::runtime_error("--max-pairs must be >= 1");
    }
    if (bc.risk < 0.0 || bc.risk > 1.0) {
        throw std::runtime_error("--risk must be between 0.0 and 1.0");
    }
    while (!bc.api_url.empty() && bc.api_url.back() == '/') {
        bc.api_url.pop_back();
    }
    if (bc.threads > (int)std::thread::hardware_concurrency()) {
        throw std::runtime_error(
            "Requested threads (" + std::to_string(bc.threads) +
            ") exceed hardware concurrency (" +
            std::to_string(std::thread::hardware_concurrency()) + ")"
        );
    }

    for (const auto& arg : args) {
        if (!arg.empty()) {
            throw std::runtime_error("Unknown argument: " + arg);
        }
    }

    return bc;
}

std::vector<Core::RunSpec> CLI::expand_batch(const Core::BatchConfig& bc) {
    std::vector<Core::RunSpec> runs;
    auto eval_nodes = bc.eval_nodes_list.empty()
        ? std::vector<uint64_t>{Core::Constants::DEFAULT_EVAL_NODES}
        : bc.eval_nodes_list;

    bool use_common = !bc.common_nodes_list.empty()
        && bc.p1_nodes_list.empty() && bc.p2_nodes_list.empty();

    auto add_run = [&](uint64_t n1, uint64_t n2, uint64_t ne, int minp, int maxp, int r) {
        Core::RunSpec rs;
        rs.p1_nodes = n1; rs.p2_nodes = n2; rs.eval_nodes = ne;
        rs.min_pairs = std::min(minp, maxp); rs.max_pairs = maxp;
        rs.repeat_index = r;
        if (r < (int)bc.seeds.size()) rs.seed = bc.seeds[r];
        runs.push_back(rs);
    };

    if (use_common) {
        auto nodes = bc.common_nodes_list;
        for (auto n : nodes)
            for (auto ne : eval_nodes)
                for (size_t mi = 0; mi < bc.min_pairs_list.size(); ++mi)
                    for (size_t ma = 0; ma < bc.max_pairs_list.size(); ++ma)
                        for (int r = 0; r < bc.repeat; ++r)
                            add_run(n, n, ne, bc.min_pairs_list[mi],
                                bc.max_pairs_list[ma], r);
    } else {
        auto p1_nodes = bc.p1_nodes_list.empty() ? std::vector<uint64_t>{0} : bc.p1_nodes_list;
        auto p2_nodes = bc.p2_nodes_list.empty() ? std::vector<uint64_t>{0} : bc.p2_nodes_list;
        for (auto n1 : p1_nodes)
            for (auto n2 : p2_nodes)
                for (auto ne : eval_nodes)
                    for (size_t mi = 0; mi < bc.min_pairs_list.size(); ++mi)
                        for (size_t ma = 0; ma < bc.max_pairs_list.size(); ++ma)
                            for (int r = 0; r < bc.repeat; ++r)
                                add_run(n1, n2, ne, bc.min_pairs_list[mi],
                                    bc.max_pairs_list[ma], r);
    }

    std::random_device rd;
    std::mt19937 g(rd());
    std::shuffle(runs.begin(), runs.end(), g);
    return runs;
}

Core::Config CLI::build_config(const Core::BatchConfig& bc, const Core::RunSpec& rs) {
    Core::Config cfg;
    cfg.bot1.cmd = bc.p1_cmd;
    cfg.bot2.cmd = bc.p2_cmd;
    cfg.eval_path = bc.eval_cmd;
    cfg.board_size = bc.board_size;
    cfg.openings_path = bc.openings_path;
    cfg.use_openings = !bc.openings_path.empty();
    cfg.shuffle_openings = bc.shuffle_openings;
    cfg.threads = bc.threads;
    cfg.max_pairs = rs.max_pairs;
    cfg.min_pairs = rs.min_pairs;
    cfg.risk = bc.risk;
    cfg.debug = bc.debug;
    cfg.show_board = bc.show_board;
    cfg.cleanup = bc.cleanup;
    cfg.exit_on_crash = bc.exit_on_crash;
    cfg.api_url = bc.api_url;
    cfg.api_key = bc.api_key;
    cfg.debounce_ms = bc.debounce_ms;
    cfg.eval_max_nodes = rs.eval_nodes;
    cfg.export_results = bc.export_results;
    cfg.seed = rs.seed;
    cfg.repeat_index = rs.repeat_index;
    cfg.eval_timeout_cutoff = bc.eval_timeout_cutoff;

    cfg.bot1.timeout_announce = bc.p1_timeout_announce;
    cfg.bot1.timeout_cutoff = bc.p1_timeout_cutoff;
    cfg.bot1.timeout_game = bc.p1_timeout_game;
    cfg.bot1.memory = bc.p1_memory;
    cfg.bot1.max_nodes = rs.p1_nodes;

    cfg.bot2.timeout_announce = bc.p2_timeout_announce;
    cfg.bot2.timeout_cutoff = bc.p2_timeout_cutoff;
    cfg.bot2.timeout_game = bc.p2_timeout_game;
    cfg.bot2.memory = bc.p2_memory;
    cfg.bot2.max_nodes = rs.p2_nodes;

    return cfg;
}

std::string CLI::generate_config_label(const Core::Config& cfg) {
    std::ostringstream ss;
    bool first = true;
    auto add = [&](const char* name, const std::string& val) {
        if (val.empty()) return;
        if (!first) ss << ", ";
        ss << name << "=" << val; first = false;
    };

    if (cfg.bot1.max_nodes == cfg.bot2.max_nodes && cfg.bot1.max_nodes > 0) {
        add("N", Core::Utils::format_nodes(cfg.bot1.max_nodes));
    } else {
        if (cfg.bot1.max_nodes > 0)
            add("N1", Core::Utils::format_nodes(cfg.bot1.max_nodes));
        if (cfg.bot2.max_nodes > 0)
            add("N2", Core::Utils::format_nodes(cfg.bot2.max_nodes));
    }

    if (cfg.bot1.max_nodes == 0 && cfg.bot2.max_nodes == 0) {
        if (cfg.bot1.timeout_announce == cfg.bot2.timeout_announce) {
            if (cfg.bot1.timeout_announce !=
                Core::Constants::DEFAULT_TIMEOUT_TURN_MS)
                add("T", std::to_string(cfg.bot1.timeout_announce / 1000) + "s");
        } else {
            add("T1", std::to_string(cfg.bot1.timeout_announce / 1000) + "s");
            add("T2", std::to_string(cfg.bot2.timeout_announce / 1000) + "s");
        }
    }

    if (cfg.bot1.memory > 0 && cfg.bot1.memory == cfg.bot2.memory) {
        add("M", std::to_string(cfg.bot1.memory / (1024 * 1024)) + "m");
    }

    return ss.str().empty() ? "default" : ss.str();
}

std::deque<GameParams> CLI::create_pending_games(
    const Core::Config& cfg,
    const std::vector<std::vector<Core::Point>>& ops,
    std::optional<uint64_t> seed,
    std::shared_ptr<RunContext> context,
    const std::string& run_id
) {
    std::deque<GameParams> pending_games;
    for (int i = 0; i < cfg.max_pairs; ++i) {
        std::vector<Core::Point> op;
        if (cfg.use_openings && !ops.empty()) {
            op = ops[i % ops.size()];
            for (const auto& p : op) {
                if (p.x < 0 || p.x >= cfg.board_size ||
                    p.y < 0 || p.y >= cfg.board_size) {
                    throw std::runtime_error("Opening move out of bounds");
                }
            }
        }
        pending_games.push_back(
            {i + 1, 0, cfg.bot1, cfg.bot2, op, seed, context, run_id, nullptr}
        );
        pending_games.push_back(
            {i + 1, 1, cfg.bot2, cfg.bot1, op, seed, context, run_id, nullptr}
        );
    }
    return pending_games;
}

}
