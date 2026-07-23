#include "referee.h"
#include "rules.h"
#include "../core/logger.h"
#include "../core/utils.h"
#include "../sys/cpu_monitor.h"
#include "../sys/signals.h"
#include <iomanip>
#include <chrono>
#include <optional>
#include <sys/stat.h>
#include <unistd.h>
#include <wordexp.h>

namespace Arena::Game {

namespace {
    std::optional<std::string> resolve_executable_path(const std::string& cmd) {
        wordexp_t words;
        if (wordexp(cmd.c_str(), &words, WRDE_NOCMD) != 0) return std::nullopt;
        if (words.we_wordc == 0) {
            wordfree(&words);
            return std::nullopt;
        }

        std::string path = words.we_wordv[0];
        wordfree(&words);

        if (path.find('/') != std::string::npos) return path;
        if (access(path.c_str(), X_OK) == 0) return "./" + path;

        const char* path_env = getenv("PATH");
        if (!path_env) return path;

        std::stringstream paths(path_env);
        std::string dir;
        while (std::getline(paths, dir, ':')) {
            std::string candidate = dir + "/" + path;
            if (access(candidate.c_str(), X_OK) == 0) return candidate;
        }
        return path;
    }

    std::optional<long long> executable_mtime_ms(const std::string& cmd) {
        auto path = resolve_executable_path(cmd);
        if (!path) return std::nullopt;

        struct stat st;
        if (stat(path->c_str(), &st) != 0) return std::nullopt;
        return static_cast<long long>(st.st_mtim.tv_sec) * 1000LL + st.st_mtim.tv_nsec / 1000000LL;
    }
}

Referee::Referee(
    App::GameParams p,
    std::shared_ptr<Net::ApiManager> api,
    Stats::Tracker& st,
    ResultCallback cb
) :
    wall_start_(std::chrono::steady_clock::now()),
    p_(p), api_(api), stats_(st), cb_(cb),
    pl1_(p.p1_cfg.cmd, "P1", p.create_process(p.p1_cfg.cmd)),
    pl2_(p.p2_cfg.cmd, "P2", p.create_process(p.p2_cfg.cmd)),
    board_(p.config().board_size * p.config().board_size, 0),
    time_p1_(p.p1_cfg.timeout_game),
    time_p2_(p.p2_cfg.timeout_game)
{}

Referee::~Referee() {
    if (start_sent_ && !result_sent_) {
        double res = Sys::g_stop_flag ? -1.0 : 0.5;
        try { send_result_event(res); } catch (...) {}
    }
    pl1_.stop();
    pl2_.stop();
}

Referee::Status Referee::step(std::vector<Core::Point>& out_history) {
    try {
        if (state_ == State::UNINITIALIZED) {
            initialize_game(out_history);
            return Status::RUNNING;
        }

        if (play_turn(out_history)) return Status::FINISHED;
        return Status::RUNNING;

    } catch (const Core::PlayerError& e) {
        Core::Logger::log(
            Core::Logger::Level::WARN,
            "Pair ", p_.pair, " Leg ", p_.leg,
            " Player Error: ", e.what()
        );
        if (p_.config().exit_on_crash) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "STRICT MODE: Exiting due to player error: ", e.what()
            );
            Sys::g_stop_flag = 1;
            throw Core::MatchTerminated();
        }
        Core::PlayerColor loser = current_player();
        stats_.add_crash(loser == Core::PlayerColor::BLACK ? 1 : 2);
        finish(loser == Core::PlayerColor::BLACK ? 0.0 : 1.0);
        return Status::FINISHED;
    } catch (const Core::MatchTerminated&) {
        if (state_ == State::INITIALIZED) finish(-1.0);
        else { pl1_.stop(); pl2_.stop(); }
        throw;
    } catch (const std::exception& e) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "Pair ", p_.pair, " Leg ", p_.leg,
            " System Error: ", e.what()
        );
        if (p_.config().exit_on_crash) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "STRICT MODE: Exiting due to system error: ", e.what()
            );
            Sys::g_stop_flag = 1;
            throw Core::MatchTerminated();
        }
        Core::PlayerColor crash_p = current_player();
        stats_.add_crash(crash_p == Core::PlayerColor::BLACK ? 1 : 2);
        finish(crash_p == Core::PlayerColor::BLACK ? 0.0 : 1.0);
        return Status::FINISHED;
    }
}

int Referee::get_last_mover_bot_id() const {
    if (moves_ == 0) return 0;
    bool black_played = (moves_ % 2 != 0);
    return (p_.leg == 0)
        ? (black_played ? 1 : 2)
        : (black_played ? 2 : 1);
}

Core::PlayerColor Referee::current_player() const {
    return (moves_ % 2 == 0)
        ? Core::PlayerColor::BLACK
        : Core::PlayerColor::WHITE;
}

void Referee::initialize_game(std::vector<Core::Point>& out_history) {
    state_ = State::INITIALIZED;

    std::map<std::string, std::string> env_vars;
    if (p_.seed) env_vars["GOMOKU_SEED"] = std::to_string(*p_.seed);

    long long mem1 = p_.p1_cfg.memory;
    if (mem1 > 0 && Core::is_rapfi_bot(p_.p1_cfg.cmd))
        mem1 += Core::Constants::PROCESS_MEMORY_OVERHEAD;

    long long mem2 = p_.p2_cfg.memory;
    if (mem2 > 0 && Core::is_rapfi_bot(p_.p2_cfg.cmd))
        mem2 += Core::Constants::PROCESS_MEMORY_OVERHEAD;

    if (!pl1_.start(mem1, env_vars))
        throw std::runtime_error("P1 start failed");
    if (!pl2_.start(mem2, env_vars))
        throw std::runtime_error("P2 start failed");

    pl1_.meta();
    pl2_.meta();
    pl1_.set_lenient(p_.p1_cfg.lenient);
    pl2_.set_lenient(p_.p2_cfg.lenient);

    if (auto ctx = p_.context) send_run_start_event_if_needed(ctx);

    send_start_event();
    init_player(pl1_, p_.p1_cfg);
    init_player(pl2_, p_.p2_cfg);
    apply_opening_moves();
    out_history = hist_;
}

void Referee::init_player(Player& p, Core::BotConfig& cfg) {
    p.send("START " + std::to_string(p_.config().board_size));
    cfg.calculate_timeout(p.name());
    long e = 0;
    if (p.read(cfg.timeout_cutoff, e) != "OK")
        throw Core::PlayerError("Expected OK");

    if (cfg.max_nodes > 0) {
        p.send("INFO MAX_NODE " + std::to_string(cfg.max_nodes));
        p.send("INFO timeout_turn 0");
        p.send("INFO timeout_match 0");
    } else {
        p.send("INFO timeout_turn " + std::to_string(cfg.timeout_announce));
        p.send("INFO timeout_match " + std::to_string(cfg.timeout_game));
    }
    p.send("INFO max_memory " + std::to_string(cfg.memory));
    p.send("INFO game_type 1");
    p.send("INFO rule 0");
    p.send("INFO THREAD_NUM 1");
}

bool Referee::play_turn(std::vector<Core::Point>& out_history) {
    if (moves_ >= p_.config().board_size * p_.config().board_size) {
        finish(0.5);
        return true;
    }

    Core::PlayerColor c = current_player();
    Player* cp = (c == Core::PlayerColor::BLACK)
        ? &pl1_ : &pl2_;
    int& time_bank = (c == Core::PlayerColor::BLACK)
        ? time_p1_ : time_p2_;
    int turn_lim = (c == Core::PlayerColor::BLACK)
        ? p_.p1_cfg.timeout_cutoff : p_.p2_cfg.timeout_cutoff;

    if (time_bank > 0)
        cp->send("INFO time_left " + std::to_string(time_bank));
    auto cpu_start = Sys::CpuMonitor::get_times(cp->pid());
    send_turn_command(cp);

    long el = 0;
    std::string r;
    while (true) {
        long local_el = 0;
        r = cp->read(turn_lim, local_el);
        el += local_el;
        if (r == "OK") {
            turn_lim = std::max(
                Core::Constants::MIN_TURN_TIMEOUT_MS,
                turn_lim - (int)local_el
            );
            continue;
        }
        break;
    }

    if (time_bank > 0 && (time_bank -= static_cast<int>(el)) < 0)
        throw Core::PlayerError("Game timeout");

    auto move = parse_and_validate_move(r);
    apply_move(move);
    out_history = hist_;

    auto cpu_end = Sys::CpuMonitor::get_times(cp->pid());
    long cpu_delta = (cpu_end.user_ms - cpu_start.user_ms) +
        (cpu_end.sys_ms - cpu_start.sys_ms);

    if (c == Core::PlayerColor::BLACK) {
        p1_cpu_ms_ += cpu_delta;
        p1_wall_ms_ += el;
        if (p_.context) {
            stats_.p1_total_time_ms += el;
        }
    } else {
        p2_cpu_ms_ += cpu_delta;
        p2_wall_ms_ += el;
        if (p_.context) {
            stats_.p2_total_time_ms += el;
        }
    }

    if (p_.config().debug) {
        double load_pct = Sys::CpuMonitor::calculate_load(
            cpu_start, cpu_end, el
        );
        Core::Logger::log(
            Core::Logger::Level::DEBUG,
            "Move ", moves_, " (",
            (c == Core::PlayerColor::BLACK ? "P1" : "P2"), "): ",
            move.x, ",", move.y, " | Wall: ", el, "ms | CPU: ",
            cpu_delta, "ms | Load: ", (int)load_pct, "%"
        );
    }

    if (p_.config().show_board) print_board();

    if (Rules::check_win(board_, p_.config().board_size,
        move.x, move.y, static_cast<int>(c))) {
        finish((cp == &pl1_) ? 1.0 : 0.0);
        return true;
    }
    return false;
}

void Referee::apply_move(const Core::Point& m) {
    Core::PlayerColor c = current_player();
    board_[m.y * p_.config().board_size + m.x] = static_cast<int>(c);
    hist_.push_back(m);
    moves_++;
    send_move_event(m, static_cast<int>(c));
}

void Referee::finish(double res) {
    result_sent_ = true;
    pl1_.stop();
    pl2_.stop();

    long wall_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - wall_start_
    ).count();

    bool p1_is_black = (p_.leg == 0);
    auto& bot1 = p1_is_black ? pl1_ : pl2_;
    auto& bot2 = p1_is_black ? pl2_ : pl1_;

    double s1 = p1_is_black ? res : 1.0 - res;
    double s2 = 1.0 - s1;
    long t1 = p1_is_black ? p1_wall_ms_ : p2_wall_ms_;
    long t2 = p1_is_black ? p2_wall_ms_ : p1_wall_ms_;
    long mem1 = bot1.peak_mem();
    long mem2 = bot2.peak_mem();

    auto fmt_res = [](double s, long t, long m_kb) {
        std::stringstream ss;
        double mb = m_kb / 1024.0;
        if (s < 0) ss << "(crash)";
        else ss << "(" << (s > 0.9 ? "win" : s < 0.1 ? "lose" : "draw")
           << ", " << std::fixed << std::setprecision(1) << (t / 1000.0) << "s, "
           << std::setprecision(2) << mb << "MB)";
        return ss.str();
    };

    {
        std::lock_guard<std::mutex> l(stats_.mtx);

        std::stringstream ss;
        ss << "Game " << p_.pair << "/" << p_.config().max_pairs
           << " | " << bot1.name() << " " << bot1.version()
           << " " << fmt_res(s1, t1, mem1)
           << " vs " << bot2.name() << " " << bot2.version()
           << " " << fmt_res(s2, t2, mem2)
           << " | Elo: " << stats_.p1_elo << "-" << stats_.p2_elo
           << " | P1 -> +" << stats_.p1_pair_wins
           << " -" << stats_.p1_pair_losses
           << " =" << stats_.p1_pair_draws;

        if (stats_.p1_moves_analyzed > 0 || stats_.p2_moves_analyzed > 0) {
            ss << " | CMA:" << std::fixed << std::setprecision(1) << stats_.get_p1_cma() << "%"
               << " vs " << stats_.get_p2_cma() << "%";
        }

        ss << " | Z:" << std::fixed << std::setprecision(2) << stats_.get_p1_z()
           << " ERF:" << std::setprecision(1) << stats_.get_p1_erf() << "%";

        Core::Logger::log(Core::Logger::Level::INFO, ss.str());
    }

    send_result_event(res, wall_ms);
    cb_(p_.pair, p_.leg, res, wall_ms, p1_cpu_ms_, p2_cpu_ms_);
}

void Referee::send_turn_command(Player* cp) {
    if (p_.config().force_board || moves_ <= (int)p_.opening.size() + 1) {
        if (moves_ > 0) send_board_state(cp);
        else cp->send("BEGIN");
    } else {
        cp->send(
            "TURN " + std::to_string(hist_.back().x) +
            "," + std::to_string(hist_.back().y)
        );
    }
}

void Referee::send_board_state(Player* cp) {
    std::stringstream ss;
    ss << "BOARD\n";
    for (size_t i = 0; i < hist_.size(); ++i) {
        ss << hist_[i].x << "," << hist_[i].y
           << "," << ((i % 2 == 0) ? 1 : 2) << "\n";
    }
    ss << "DONE";
    cp->send(ss.str());
}

Core::Point Referee::parse_and_validate_move(const std::string& r) {
    int x = 0, y = 0; char c = 0;
    std::stringstream ss(r);
    std::string extra;
    if (!(ss >> x >> c >> y) || c != ',' || (ss >> extra))
        throw Core::PlayerError("Invalid move: " + r);
    if (x < 0 || x >= p_.config().board_size || y < 0 || y >= p_.config().board_size)
        throw Core::PlayerError("OOB");
    if (board_[y * p_.config().board_size + x])
        throw Core::PlayerError("Occupied");
    return {x, y};
}

void Referee::send_run_start_event_if_needed(std::shared_ptr<App::RunContext> ctx) {
    std::lock_guard<std::mutex> l(ctx->name_mtx);
    if (ctx->names_set) return;
    ctx->names_set = true;
    auto& run_p1 = (p_.leg == 0) ? pl1_ : pl2_;
    auto& run_p2 = (p_.leg == 0) ? pl2_ : pl1_;
    ctx->p1_name = run_p1.name(); ctx->p1_version = run_p1.version();
    ctx->p2_name = run_p2.name(); ctx->p2_version = run_p2.version();

    if (auto api = api_) {
        Net::ApiManager::Event e;
        e.type = "run_start"; e.run_id = ctx->id;
        e.p1_name = ctx->p1_name; e.p1v = ctx->p1_version;
        e.p2_name = ctx->p2_name; e.p2v = ctx->p2_version;
        e.p1_cmd = run_p1.path(); e.p2_cmd = run_p2.path();
        e.p1_mtime = executable_mtime_ms(e.p1_cmd);
        e.p2_mtime = executable_mtime_ms(e.p2_cmd);
        e.config_label = ctx->config_label; e.total_games = ctx->total_games_expected;
        e.p1_nodes = ctx->run_spec.p1_nodes; e.p2_nodes = ctx->run_spec.p2_nodes;
        e.eval_nodes = ctx->run_spec.eval_nodes; e.board_size = ctx->cfg.board_size;
        e.min_pairs = ctx->run_spec.min_pairs; e.max_pairs = ctx->run_spec.max_pairs;
        e.repeat_index = ctx->run_spec.repeat_index; e.seed = ctx->run_spec.seed;
        api->enqueue(e);
    }
}

void Referee::apply_opening_moves() {
    for (const auto& m : p_.opening) {
        validate_opening_move(m);
        Core::PlayerColor c = (moves_ % 2 == 0)
            ? Core::PlayerColor::BLACK
            : Core::PlayerColor::WHITE;
        board_[m.y * p_.config().board_size + m.x] = static_cast<int>(c);
        hist_.push_back(m); moves_++;
        send_move_event(m, static_cast<int>(c));
    }
}

void Referee::validate_opening_move(const Core::Point& m) {
    if (m.x < 0 || m.x >= p_.config().board_size ||
        m.y < 0 || m.y >= p_.config().board_size)
        throw std::runtime_error("OOB Opening");
    if (board_[m.y * p_.config().board_size + m.x])
        throw std::runtime_error("Occupied Opening");
}

void Referee::send_start_event() {
    if (!api_) return;
    auto e = create_event("start");
    e.black_slot = (p_.leg == 0) ? 1 : 2;
    e.white_slot = (p_.leg == 0) ? 2 : 1;
    e.op_len = get_opening_size();
    api_->enqueue(e);
    start_sent_ = true;
}

void Referee::send_move_event(const Core::Point& m, int color) {
    if (!api_) return;
    auto e = create_event("move");
    e.x = m.x; e.y = m.y; e.c = color;
    api_->enqueue(e);
}

void Referee::send_result_event(double res, long duration) {
    if (!api_ || !start_sent_) return;
    std::stringstream ss;
    for (size_t i = 0; i < hist_.size(); ++i) {
        if (i > 0) ss << ";";
        ss << hist_[i].x << "," << hist_[i].y << "," << (i % 2 ? 2 : 1);
    }
    auto e = create_event("result");
    e.moves = ss.str();
    e.winner = (res == 1.0) ? 1 : (res == 0.0) ? 2 : (res == -1.0) ? 4 : 3;
    e.op_len = get_opening_size();
    e.duration = duration;
    api_->enqueue(e);
}

Net::ApiManager::Event Referee::create_event(const std::string& type) {
    Net::ApiManager::Event e{};
    e.type = type;
    e.run_id = p_.run_id;
    e.ext_id = p_.run_id + "_" + std::to_string(p_.pair) +
        "_" + std::to_string(p_.leg);
    return e;
}

void Referee::print_board() {
    Core::Logger::log(
        Core::Logger::Level::INFO,
        "P1: ", pl1_.name(), " [X] vs P2: ", pl2_.name(), " [O]"
    );
    std::stringstream ss;
    ss << "\n";
    for (int y = 0; y < p_.config().board_size; ++y) {
        for (int x = 0; x < p_.config().board_size; ++x) {
            int c = board_[y * p_.config().board_size + x];
            ss << (c == 0 ? "." : c == 1 ? "X" : "O") << " ";
        }
        ss << "\n";
    }
    Core::Logger::log(Core::Logger::Level::INFO, ss.str());
}

}
