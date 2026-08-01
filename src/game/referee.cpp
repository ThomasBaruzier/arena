#include "referee.h"
#include "rules.h"
#include "../core/logger.h"
#include "../core/types.h"
#include "../core/utils.h"
#include "../sys/cpu_monitor.h"
#include "../sys/signals.h"
#include <algorithm>
#include <chrono>
#include <iomanip>
#include <sstream>

namespace Arena::Game {

namespace {

struct InitializationError :
    std::runtime_error {
    InitializationError(
        Player* failed_player,
        const std::string& message
    ) :
        std::runtime_error(message),
        player(failed_player)
    {}

    Player* player;
};

struct OpeningError :
    std::runtime_error {
    using std::runtime_error::runtime_error;
};

Net::ApiManager::Event make_run_start_event(
    const std::shared_ptr<App::RunContext>& context,
    const Player& slot1,
    const Player& slot2
) {
    Net::ApiManager::Event event;
    event.type = "run_start";
    event.run_id = context->id;
    event.p1_name = slot1.name();
    event.p1v = slot1.version();
    event.p2_name = slot2.name();
    event.p2v = slot2.version();
    event.p1_cmd = slot1.path();
    event.p2_cmd = slot2.path();
    event.config_label =
        context->config_label;
    event.analysis_enabled =
        context->cfg.eval_enabled();
    event.total_games =
        context->total_games_expected;
    event.p1_nodes =
        context->run_spec.p1_nodes;
    event.p2_nodes =
        context->run_spec.p2_nodes;
    event.eval_nodes =
        context->run_spec.eval_nodes;
    event.board_size =
        context->cfg.board_size;
    event.min_pairs =
        context->run_spec.min_pairs;
    event.max_pairs =
        context->run_spec.max_pairs;
    event.repeat_index =
        context->run_spec.repeat_index;
    event.seed =
        context->run_spec.seed;
    return event;
}

}

Referee::Referee(
    App::GameParams params,
    std::shared_ptr<Net::ApiManager> api,
    Stats::Tracker& stats,
    ResultCallback callback
) :
    wall_start_(
        std::chrono::steady_clock::now()
    ),
    p_(std::move(params)),
    api_(std::move(api)),
    stats_(stats),
    cb_(std::move(callback)),
    pl1_(
        p_.p1_cfg.cmd,
        "P1",
        p_.create_process(
            p_.p1_cfg.cmd
        )
    ),
    pl2_(
        p_.p2_cfg.cmd,
        "P2",
        p_.create_process(
            p_.p2_cfg.cmd
        )
    ),
    board_(
        p_.config().board_size *
            p_.config().board_size,
        0
    ),
    time_p1_(
        p_.p1_cfg.timeout_game
    ),
    time_p2_(
        p_.p2_cfg.timeout_game
    )
{}

Referee::~Referee() {
    if (
        start_sent_ &&
        !result_sent_
    ) {
        try {
            send_result_event(
                -1.0,
                ResultReason::VOID
            );
        } catch (...) {
        }
    }

    pl1_.stop();
    pl2_.stop();
}

const char* Referee::result_reason_text(
    ResultReason reason
) {
    switch (reason) {
        case ResultReason::LINE:
            return "line";
        case ResultReason::DRAW:
            return "draw";
        case ResultReason::ADJUDICATION:
            return "adjudication";
        case ResultReason::VOID:
            return "void";
    }

    return "void";
}

Referee::Status Referee::step(
    std::vector<Core::Point>& out_history
) {
    try {
        if (
            state_ ==
            State::UNINITIALIZED
        ) {
            initialize_game(
                out_history
            );
            return Status::RUNNING;
        }

        return play_turn(out_history)
            ? Status::FINISHED
            : Status::RUNNING;
    } catch (
        const Core::PlayerError& error
    ) {
        Core::Logger::log(
            Core::Logger::Level::WARN,
            "Pair ",
            p_.pair,
            " Leg ",
            p_.leg,
            " Player Error: ",
            error.what()
        );

        Core::PlayerColor loser =
            current_player();

        record_crash(loser);

        finish(
            loser ==
                Core::PlayerColor::BLACK
                ? 0.0
                : 1.0,
            ResultReason::ADJUDICATION
        );

        if (
            p_.config()
                .exit_on_crash
        ) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "STRICT MODE: Exiting due to player error: ",
                error.what()
            );

            Sys::g_stop_flag = 1;
            throw Core::MatchTerminated();
        }

        return Status::FINISHED;
    } catch (
        const Core::MatchTerminated&
    ) {
        if (
            state_ ==
            State::INITIALIZED
        ) {
            declare_game_if_needed();

            finish(
                -1.0,
                ResultReason::VOID
            );
        } else {
            pl1_.stop();
            pl2_.stop();
        }

        throw;
    } catch (
        const InitializationError& error
    ) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "Pair ",
            p_.pair,
            " Leg ",
            p_.leg,
            " Initialization Error: ",
            error.what()
        );

        declare_game_if_needed();
        record_crash(error.player);

        finish(
            loss_for_player(
                error.player
            ),
            ResultReason::ADJUDICATION
        );

        if (
            p_.config()
                .exit_on_crash
        ) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "STRICT MODE: Exiting due to initialization error: ",
                error.what()
            );

            Sys::g_stop_flag = 1;
            throw Core::MatchTerminated();
        }

        return Status::FINISHED;
    } catch (
        const OpeningError& error
    ) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "Pair ",
            p_.pair,
            " Leg ",
            p_.leg,
            " Opening Error: ",
            error.what()
        );

        if (p_.context) {
            p_.context->failed = true;
        }

        finish(
            -1.0,
            ResultReason::VOID
        );

        if (
            p_.config()
                .exit_on_crash
        ) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "STRICT MODE: Exiting due to opening error: ",
                error.what()
            );

            Sys::g_stop_flag = 1;
            throw Core::MatchTerminated();
        }

        return Status::FINISHED;
    } catch (
        const std::exception& error
    ) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "Pair ",
            p_.pair,
            " Leg ",
            p_.leg,
            " System Error: ",
            error.what()
        );

        Core::PlayerColor loser =
            current_player();

        record_crash(loser);

        finish(
            loser ==
                Core::PlayerColor::BLACK
                ? 0.0
                : 1.0,
            ResultReason::ADJUDICATION
        );

        if (
            p_.config()
                .exit_on_crash
        ) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "STRICT MODE: Exiting due to system error: ",
                error.what()
            );

            Sys::g_stop_flag = 1;
            throw Core::MatchTerminated();
        }

        return Status::FINISHED;
    }
}

int Referee::
get_last_mover_bot_id() const {
    if (moves_ == 0) {
        return 0;
    }

    bool black_played =
        moves_ % 2 != 0;

    if (p_.leg == 0) {
        return black_played
            ? 1
            : 2;
    }

    return black_played
        ? 2
        : 1;
}

Core::PlayerColor
Referee::current_player() const {
    return moves_ % 2 == 0
        ? Core::PlayerColor::BLACK
        : Core::PlayerColor::WHITE;
}

int Referee::slot_for_color(
    Core::PlayerColor color
) const {
    if (
        color ==
        Core::PlayerColor::BLACK
    ) {
        return p_.leg == 0
            ? 1
            : 2;
    }

    return p_.leg == 0
        ? 2
        : 1;
}

int Referee::slot_for_player(
    const Player* player
) const {
    if (player == &pl1_) {
        return p_.leg == 0
            ? 1
            : 2;
    }

    return p_.leg == 0
        ? 2
        : 1;
}

void Referee::record_crash(
    Core::PlayerColor loser
) {
    stats_.add_crash(
        slot_for_color(loser)
    );
}

void Referee::record_crash(
    Player* player
) {
    stats_.add_crash(
        slot_for_player(player)
    );
}

double Referee::loss_for_player(
    const Player* player
) const {
    return player == &pl1_
        ? 0.0
        : 1.0;
}

void Referee::initialize_game(
    std::vector<Core::Point>& out_history
) {
    state_ = State::INITIALIZED;

    std::map<
        std::string,
        std::string
    > environment;

    if (p_.seed) {
        environment[
            "GOMOKU_SEED"
        ] = std::to_string(
            *p_.seed
        );
    }

    long long memory1 =
        p_.p1_cfg.memory;

    long long memory2 =
        p_.p2_cfg.memory;

    if (
        memory1 > 0 &&
        Core::is_rapfi_bot(
            p_.p1_cfg.cmd
        )
    ) {
        memory1 +=
            Core::Constants::
                PROCESS_MEMORY_OVERHEAD;
    }

    if (
        memory2 > 0 &&
        Core::is_rapfi_bot(
            p_.p2_cfg.cmd
        )
    ) {
        memory2 +=
            Core::Constants::
                PROCESS_MEMORY_OVERHEAD;
    }

    if (
        !pl1_.start(
            memory1,
            environment
        )
    ) {
        throw InitializationError(
            &pl1_,
            "P1 start failed"
        );
    }

    if (
        !pl2_.start(
            memory2,
            environment
        )
    ) {
        throw InitializationError(
            &pl2_,
            "P2 start failed"
        );
    }

    try {
        pl1_.meta();
    } catch (
        const Core::MatchTerminated&
    ) {
        throw;
    } catch (
        const std::exception& error
    ) {
        throw InitializationError(
            &pl1_,
            error.what()
        );
    }

    try {
        pl2_.meta();
    } catch (
        const Core::MatchTerminated&
    ) {
        throw;
    } catch (
        const std::exception& error
    ) {
        throw InitializationError(
            &pl2_,
            error.what()
        );
    }

    declare_game_if_needed();

    pl1_.set_lenient(
        p_.p1_cfg.lenient
    );

    pl2_.set_lenient(
        p_.p2_cfg.lenient
    );

    try {
        init_player(
            pl1_,
            p_.p1_cfg
        );
    } catch (
        const Core::MatchTerminated&
    ) {
        throw;
    } catch (
        const std::exception& error
    ) {
        throw InitializationError(
            &pl1_,
            error.what()
        );
    }

    try {
        init_player(
            pl2_,
            p_.p2_cfg
        );
    } catch (
        const Core::MatchTerminated&
    ) {
        throw;
    } catch (
        const std::exception& error
    ) {
        throw InitializationError(
            &pl2_,
            error.what()
        );
    }

    apply_opening_moves();
    out_history = hist_;
}

void Referee::declare_game_if_needed() {
    if (p_.context) {
        send_run_start_event_if_needed(
            p_.context
        );
    }

    send_start_event();
}

void Referee::init_player(
    Player& player,
    Core::BotConfig& config
) {
    player.send(
        "START " +
        std::to_string(
            p_.config().board_size
        )
    );

    config.calculate_timeout(
        player.name()
    );

    long elapsed = 0;

    if (
        player.read(
            config.timeout_cutoff,
            elapsed
        ) != "OK"
    ) {
        throw Core::PlayerError(
            "Expected OK"
        );
    }

    if (config.max_nodes > 0) {
        player.send(
            "INFO MAX_NODE " +
            std::to_string(
                config.max_nodes
            )
        );

        player.send(
            "INFO timeout_turn 0"
        );

        player.send(
            "INFO timeout_match 0"
        );
    } else {
        player.send(
            "INFO timeout_turn " +
            std::to_string(
                config.timeout_announce
            )
        );

        player.send(
            "INFO timeout_match " +
            std::to_string(
                config.timeout_game
            )
        );
    }

    player.send(
        "INFO max_memory " +
        std::to_string(
            config.memory
        )
    );

    player.send(
        "INFO game_type 1"
    );

    player.send(
        "INFO rule 0"
    );

    player.send(
        "INFO THREAD_NUM 1"
    );
}

bool Referee::play_turn(
    std::vector<Core::Point>& out_history
) {
    if (
        moves_ >=
        p_.config().board_size *
            p_.config().board_size
    ) {
        finish(
            0.5,
            ResultReason::DRAW
        );

        return true;
    }

    Core::PlayerColor color =
        current_player();

    Player* current =
        color ==
            Core::PlayerColor::BLACK
            ? &pl1_
            : &pl2_;

    int& time_bank =
        color ==
            Core::PlayerColor::BLACK
            ? time_p1_
            : time_p2_;

    const int turn_limit =
        std::max(
            0,
            color ==
                Core::PlayerColor::BLACK
                ? p_.p1_cfg
                    .timeout_cutoff
                : p_.p2_cfg
                    .timeout_cutoff
        );

    if (time_bank > 0) {
        current->send(
            "INFO time_left " +
            std::to_string(
                time_bank
            )
        );
    }

    auto cpu_start =
        Sys::CpuMonitor::get_times(
            current->pid()
        );

    auto thinking_start =
        std::chrono::
            steady_clock::now();

    long elapsed = 0;
    long measured_wall = 0;
    long measured_cpu = 0;
    bool cpu_measured = false;
    bool timing_recorded = false;

    auto wall_elapsed = [&]() {
        return static_cast<long>(
            std::chrono::
                duration_cast<
                    std::chrono::
                        milliseconds
                >(
                    std::chrono::
                        steady_clock::now() -
                    thinking_start
                ).count()
        );
    };

    auto record_timing = [&]() {
        if (timing_recorded) {
            return;
        }

        measured_wall =
            std::max(
                0L,
                std::max(
                    elapsed,
                    wall_elapsed()
                )
            );

        auto cpu_end =
            Sys::CpuMonitor::get_times(
                current->pid()
            );

        long cpu_delta =
            cpu_end.total_ms() -
            cpu_start.total_ms();

        cpu_measured =
            cpu_start.valid &&
            cpu_end.valid &&
            cpu_delta >= 0;

        measured_cpu =
            cpu_measured
                ? cpu_delta
                : 0;

        if (
            color ==
            Core::PlayerColor::BLACK
        ) {
            p1_wall_ms_ +=
                measured_wall;
        } else {
            p2_wall_ms_ +=
                measured_wall;
        }

        stats_.add_timing(
            slot_for_color(color),
            measured_wall,
            measured_cpu,
            cpu_measured
        );

        timing_recorded = true;
    };

    std::string response;

    try {
        send_turn_command(current);

        while (true) {
            long used =
                std::max(
                    elapsed,
                    wall_elapsed()
                );

            if (used >= turn_limit) {
                elapsed = used;

                throw Core::PlayerError(
                    "Timeout"
                );
            }

            long local_elapsed = 0;

            int remaining =
                turn_limit -
                static_cast<int>(used);

            try {
                response =
                    current->read(
                        remaining,
                        local_elapsed
                    );
            } catch (...) {
                elapsed +=
                    std::max(
                        0L,
                        local_elapsed
                    );

                throw;
            }

            elapsed +=
                std::max(
                    0L,
                    local_elapsed
                );

            if (response != "OK") {
                break;
            }
        }
    } catch (...) {
        record_timing();
        throw;
    }

    record_timing();

    if (
        time_bank > 0 &&
        (
            time_bank -=
                static_cast<int>(
                    measured_wall
                )
        ) < 0
    ) {
        throw Core::PlayerError(
            "Game timeout"
        );
    }

    Core::Point move =
        parse_and_validate_move(
            response
        );

    apply_move(move);
    out_history = hist_;

    if (p_.config().debug) {
        std::string cpu_text =
            cpu_measured
                ? std::to_string(
                    measured_cpu
                ) + "ms"
                : "-";

        std::string load_text =
            cpu_measured &&
            measured_wall > 0
                ? std::to_string(
                    static_cast<int>(
                        static_cast<double>(
                            measured_cpu
                        ) *
                        100.0 /
                        static_cast<double>(
                            measured_wall
                        )
                    )
                ) + "%"
                : "-";

        Core::Logger::log(
            Core::Logger::Level::DEBUG,
            "Move ",
            moves_,
            " (",
            color ==
                Core::PlayerColor::BLACK
                ? "P1"
                : "P2",
            "): ",
            move.x,
            ",",
            move.y,
            " | Wall: ",
            measured_wall,
            "ms | CPU: ",
            cpu_text,
            " | Load: ",
            load_text
        );
    }

    if (p_.config().show_board) {
        print_board();
    }

    if (
        Rules::check_win(
            board_,
            p_.config().board_size,
            move.x,
            move.y,
            static_cast<int>(color)
        )
    ) {
        finish(
            color ==
                Core::PlayerColor::BLACK
                ? 1.0
                : 0.0,
            ResultReason::LINE
        );

        return true;
    }

    return false;
}

void Referee::apply_move(
    const Core::Point& move
) {
    Core::PlayerColor color =
        current_player();

    board_[
        move.y *
            p_.config().board_size +
        move.x
    ] = static_cast<int>(color);

    hist_.push_back(move);
    moves_++;

    send_move_event(
        move,
        static_cast<int>(color)
    );
}

void Referee::finish(
    double result,
    ResultReason reason
) {
    result_sent_ = true;
    pl1_.stop();
    pl2_.stop();

    long wall_ms =
        std::chrono::
            duration_cast<
                std::chrono::milliseconds
            >(
                std::chrono::
                    steady_clock::now() -
                wall_start_
            ).count();

    bool slot1_black =
        p_.leg == 0;

    Player& slot1 =
        slot1_black
            ? pl1_
            : pl2_;

    Player& slot2 =
        slot1_black
            ? pl2_
            : pl1_;

    double score1 =
        result < 0
            ? result
            : slot1_black
                ? result
                : 1.0 - result;

    double score2 =
        result < 0
            ? result
            : 1.0 - score1;

    long time1 =
        slot1_black
            ? p1_wall_ms_
            : p2_wall_ms_;

    long time2 =
        slot1_black
            ? p2_wall_ms_
            : p1_wall_ms_;

    long memory1 =
        slot1.peak_mem();

    long memory2 =
        slot2.peak_mem();

    auto format_result = [](
        double score,
        long time,
        long memory_kb
    ) {
        std::stringstream text;

        if (score < 0) {
            text << "(void)";
            return text.str();
        }

        text
            << "("
            << (
                score > 0.9
                    ? "win"
                    : score < 0.1
                        ? "lose"
                        : "draw"
            )
            << ", "
            << std::fixed
            << std::setprecision(1)
            << time / 1000.0
            << "s, "
            << std::setprecision(2)
            << memory_kb / 1024.0
            << "MB)";

        return text.str();
    };

    send_result_event(
        result,
        reason,
        wall_ms
    );

    cb_(
        p_.pair,
        p_.leg,
        result,
        wall_ms
    );

    std::lock_guard<std::mutex> lock(
        stats_.mtx
    );

    std::stringstream text;

    text
        << "Game "
        << p_.pair
        << "/"
        << p_.config().max_pairs
        << " | "
        << slot1.name()
        << " "
        << slot1.version()
        << " "
        << format_result(
            score1,
            time1,
            memory1
        )
        << " vs "
        << slot2.name()
        << " "
        << slot2.version()
        << " "
        << format_result(
            score2,
            time2,
            memory2
        )
        << " | Elo: "
        << stats_.p1_elo
        << "-"
        << stats_.p2_elo
        << " | P1 -> +"
        << stats_.p1_pair_wins
        << " -"
        << stats_.p1_pair_losses
        << " ="
        << stats_.p1_pair_draws;

    auto append_percent = [&text](
        const std::optional<double>& value
    ) {
        if (value) {
            text
                << std::fixed
                << std::setprecision(1)
                << *value
                << "%";
        } else {
            text << "-";
        }
    };

    auto p1_cma =
        stats_.get_p1_cma_optional();

    auto p2_cma =
        stats_.get_p2_cma_optional();

    if (p1_cma || p2_cma) {
        text << " | CMA: ";
        append_percent(p1_cma);
        text << " vs ";
        append_percent(p2_cma);
    }

    auto p1_blunder =
        stats_.get_p1_blunder_optional();

    auto p2_blunder =
        stats_.get_p2_blunder_optional();

    if (p1_blunder || p2_blunder) {
        text << " | Bln: ";
        append_percent(p1_blunder);
        text << " vs ";
        append_percent(p2_blunder);
    }

    text
        << " | Z:"
        << std::fixed
        << std::setprecision(2)
        << stats_.get_p1_z()
        << " ERF:"
        << std::setprecision(1)
        << stats_.get_p1_erf()
        << "%";

    Core::Logger::log(
        Core::Logger::Level::INFO,
        text.str()
    );
}

void Referee::send_turn_command(
    Player* current
) {
    if (
        p_.config().force_board ||
        moves_ <=
            static_cast<int>(
                p_.opening.size()
            ) +
            1
    ) {
        if (moves_ > 0) {
            send_board_state(
                current
            );
        } else {
            current->send("BEGIN");
        }

        return;
    }

    current->send(
        "TURN " +
        std::to_string(
            hist_.back().x
        ) +
        "," +
        std::to_string(
            hist_.back().y
        )
    );
}

void Referee::send_board_state(
    Player* current
) {
    std::stringstream board;
    board << "BOARD\n";

    bool receiver_is_black =
        current == &pl1_;

    for (
        size_t index = 0;
        index < hist_.size();
        ++index
    ) {
        int absolute_color =
            index % 2 == 0
                ? 1
                : 2;

        int relative_color =
            receiver_is_black
                ? absolute_color
                : 3 - absolute_color;

        board
            << hist_[index].x
            << ","
            << hist_[index].y
            << ","
            << relative_color
            << "\n";
    }

    board << "DONE";
    current->send(board.str());
}

Core::Point
Referee::parse_and_validate_move(
    const std::string& response
) {
    int x = 0;
    int y = 0;
    char separator = 0;
    std::string extra;
    std::stringstream parser(
        response
    );

    if (
        !(parser >> x >> separator >> y) ||
        separator != ',' ||
        parser >> extra
    ) {
        throw Core::PlayerError(
            "Invalid move: " +
            response
        );
    }

    if (
        x < 0 ||
        x >= p_.config().board_size ||
        y < 0 ||
        y >= p_.config().board_size
    ) {
        throw Core::PlayerError(
            "OOB"
        );
    }

    if (
        board_[
            y *
                p_.config()
                    .board_size +
            x
        ]
    ) {
        throw Core::PlayerError(
            "Occupied"
        );
    }

    return {
        x,
        y
    };
}

void Referee::
send_run_start_event_if_needed(
    const std::shared_ptr<App::RunContext>& context
) {
    std::lock_guard<std::mutex> lock(
        context->name_mtx
    );

    if (context->names_set) {
        return;
    }

    Player& slot1 =
        p_.leg == 0
            ? pl1_
            : pl2_;

    Player& slot2 =
        p_.leg == 0
            ? pl2_
            : pl1_;

    context->p1_name =
        slot1.name();

    context->p1_version =
        slot1.version();

    context->p2_name =
        slot2.name();

    context->p2_version =
        slot2.version();

    context->names_set = true;

    if (api_) {
        api_->enqueue(
            make_run_start_event(
                context,
                slot1,
                slot2
            )
        );
    }
}

void Referee::apply_opening_moves() {
    for (
        const auto& move :
        p_.opening
    ) {
        validate_opening_move(
            move
        );

        Core::PlayerColor color =
            moves_ % 2 == 0
                ? Core::PlayerColor::BLACK
                : Core::PlayerColor::WHITE;

        board_[
            move.y *
                p_.config()
                    .board_size +
            move.x
        ] = static_cast<int>(
            color
        );

        hist_.push_back(move);
        moves_++;

        send_move_event(
            move,
            static_cast<int>(color)
        );
    }
}

void Referee::validate_opening_move(
    const Core::Point& move
) {
    if (
        move.x < 0 ||
        move.x >=
            p_.config().board_size ||
        move.y < 0 ||
        move.y >=
            p_.config().board_size
    ) {
        throw OpeningError(
            "OOB Opening"
        );
    }

    if (
        board_[
            move.y *
                p_.config()
                    .board_size +
            move.x
        ]
    ) {
        throw OpeningError(
            "Occupied Opening"
        );
    }
}

void Referee::send_start_event() {
    if (
        !api_ ||
        start_sent_
    ) {
        return;
    }

    auto event =
        create_event("start");

    event.black_slot =
        p_.leg == 0
            ? 1
            : 2;

    event.white_slot =
        p_.leg == 0
            ? 2
            : 1;

    event.op_len =
        get_opening_size();

    api_->enqueue(
        std::move(event)
    );

    start_sent_ = true;
}

void Referee::send_move_event(
    const Core::Point& move,
    int color
) {
    if (!api_) {
        return;
    }

    auto event =
        create_event("move");

    event.x = move.x;
    event.y = move.y;
    event.c = color;

    api_->enqueue(
        std::move(event)
    );
}

void Referee::send_result_event(
    double result,
    ResultReason reason,
    long duration
) {
    if (
        !api_ ||
        !start_sent_
    ) {
        return;
    }

    std::stringstream moves;

    for (
        size_t index = 0;
        index < hist_.size();
        ++index
    ) {
        if (index > 0) {
            moves << ";";
        }

        moves
            << hist_[index].x
            << ","
            << hist_[index].y
            << ","
            << (
                index % 2 == 0
                    ? 1
                    : 2
            );
    }

    auto event =
        create_event("result");

    event.moves = moves.str();

    event.winner =
        result == 1.0
            ? 1
            : result == 0.0
                ? 2
                : result == -1.0
                    ? 4
                    : 3;

    event.reason =
        result_reason_text(reason);

    event.op_len =
        get_opening_size();

    event.duration = duration;

    api_->enqueue(
        std::move(event)
    );
}

Net::ApiManager::Event
Referee::create_event(
    const std::string& type
) {
    Net::ApiManager::Event event;
    event.type = type;
    event.run_id = p_.run_id;
    event.ext_id =
        p_.run_id +
        "_" +
        std::to_string(p_.pair) +
        "_" +
        std::to_string(p_.leg);

    return event;
}

void Referee::print_board() {
    Core::Logger::log(
        Core::Logger::Level::INFO,
        "P1: ",
        pl1_.name(),
        " [X] vs P2: ",
        pl2_.name(),
        " [O]"
    );

    std::stringstream board;
    board << "\n";

    for (
        int y = 0;
        y < p_.config().board_size;
        ++y
    ) {
        for (
            int x = 0;
            x < p_.config().board_size;
            ++x
        ) {
            int color =
                board_[
                    y *
                        p_.config()
                            .board_size +
                    x
                ];

            board
                << (
                    color == 0
                        ? "."
                        : color == 1
                            ? "X"
                            : "O"
                )
                << " ";
        }

        board << "\n";
    }

    Core::Logger::log(
        Core::Logger::Level::INFO,
        board.str()
    );
}

}
