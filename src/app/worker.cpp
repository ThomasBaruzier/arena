#include "worker.h"
#include "../analysis/cache.h"
#include "../analysis/evaluator.h"
#include "../core/logger.h"
#include "../net/json.h"
#include "../stats/sprt.h"
#include "../sys/cpu_monitor.h"
#include "../sys/signals.h"
#include <algorithm>
#include <chrono>
#include <iomanip>
#include <optional>

namespace Arena::App {

struct TaskResult {
    std::optional<EvalJob> eval;
    std::shared_ptr<
        Game::Referee
    > game;
    bool stop = false;
    bool retry = false;
};

double slot1_pair_score(
    double first_leg_black_score,
    double second_leg_black_score
) {
    return (
        first_leg_black_score +
        1.0 -
        second_leg_black_score
    ) / 2.0;
}

bool record_completed_pair(
    MatchState& state,
    Stats::Tracker& stats,
    double first_leg_black_score,
    double second_leg_black_score
) {
    if (
        first_leg_black_score < 0.0 ||
        second_leg_black_score < 0.0
    ) {
        return false;
    }

    Stats::PairOutcome outcome =
        stats.update_pair_stats(
            slot1_pair_score(
                first_leg_black_score,
                second_leg_black_score
            )
        );

    if (
        outcome ==
        Stats::PairOutcome::WIN
    ) {
        state.wins++;
    } else if (
        outcome ==
        Stats::PairOutcome::LOSS
    ) {
        state.losses++;
    } else {
        state.draws++;
    }

    state.pairs_done++;
    return true;
}

static void populate_event_stats(
    Net::ApiManager::Event& event,
    const Stats::Tracker& stats
) {
    event.p1_elo = stats.p1_elo;
    event.p2_elo = stats.p2_elo;
    event.p1_erf =
        stats.get_p1_erf();
    event.p2_erf =
        stats.get_p2_erf();
    event.p1_time =
        stats.p1_total_time_ms.load();
    event.p2_time =
        stats.p2_total_time_ms.load();
    event.p1_cpu_time =
        stats.p1_cpu_time_ms.load();
    event.p2_cpu_time =
        stats.p2_cpu_time_ms.load();
    event.p1_cpu_wall_time =
        stats.p1_cpu_wall_time_ms.load();
    event.p2_cpu_wall_time =
        stats.p2_cpu_wall_time_ms.load();
    event.p1_crashes =
        stats.p1_crashes.load();
    event.p2_crashes =
        stats.p2_crashes.load();
    event.p1_cma =
        stats.get_p1_cma();
    event.p2_cma =
        stats.get_p2_cma();
    event.p1_blunder =
        stats.get_p1_blunder();
    event.p2_blunder =
        stats.get_p2_blunder();
    event.p1_moves_analyzed =
        stats.p1_moves_analyzed;
    event.p2_moves_analyzed =
        stats.p2_moves_analyzed;
    event.p1_critical_total =
        stats.p1_critical_total;
    event.p2_critical_total =
        stats.p2_critical_total;
}

static void populate_stats(
    Net::JsonStream& json,
    const Stats::Tracker& stats,
    int player
) {
    if (player == 1) {
        json.add(
            "elo",
            stats.p1_elo
        );
        json.add(
            "erf",
            stats.get_p1_erf()
        );
        json.add(
            "time",
            stats.p1_total_time_ms.load()
        );
        json.add(
            "cpu_time",
            stats.p1_cpu_time_ms.load()
        );
        json.add(
            "cpu_wall_time",
            stats.p1_cpu_wall_time_ms.load()
        );

        auto efficiency =
            stats.get_p1_eff();

        if (efficiency) {
            json.add(
                "eff",
                *efficiency
            );
        } else {
            json.add_null("eff");
        }

        json.add(
            "crashes",
            stats.p1_crashes.load()
        );
        json.add(
            "cma",
            stats.get_p1_cma()
        );
        json.add(
            "blunder",
            stats.get_p1_blunder()
        );
        json.add(
            "moves_analyzed",
            stats.p1_moves_analyzed
        );
        json.add(
            "critical_total",
            stats.p1_critical_total
        );
        return;
    }

    json.add(
        "elo",
        stats.p2_elo
    );
    json.add(
        "erf",
        stats.get_p2_erf()
    );
    json.add(
        "time",
        stats.p2_total_time_ms.load()
    );
    json.add(
        "cpu_time",
        stats.p2_cpu_time_ms.load()
    );
    json.add(
        "cpu_wall_time",
        stats.p2_cpu_wall_time_ms.load()
    );

    auto efficiency =
        stats.get_p2_eff();

    if (efficiency) {
        json.add(
            "eff",
            *efficiency
        );
    } else {
        json.add_null("eff");
    }

    json.add(
        "crashes",
        stats.p2_crashes.load()
    );
    json.add(
        "cma",
        stats.get_p2_cma()
    );
    json.add(
        "blunder",
        stats.get_p2_blunder()
    );
    json.add(
        "moves_analyzed",
        stats.p2_moves_analyzed
    );
    json.add(
        "critical_total",
        stats.p2_critical_total
    );
}

std::string format_ndjson_line(
    const Core::BatchConfig& batch,
    const Core::RunSpec& run,
    const MatchState& state,
    const Stats::Tracker& stats,
    double duration,
    const std::string& status
) {
    Net::JsonStream json;

    json.add_str(
        "p1_cmd",
        batch.p1_cmd
    );
    json.add_str(
        "p2_cmd",
        batch.p2_cmd
    );
    json.add(
        "p1_nodes",
        run.p1_nodes
    );
    json.add(
        "p2_nodes",
        run.p2_nodes
    );
    json.add(
        "eval_nodes",
        run.eval_nodes
    );
    json.add(
        "board_size",
        batch.board_size
    );
    json.add(
        "min_pairs",
        run.min_pairs
    );
    json.add(
        "max_pairs",
        run.max_pairs
    );
    json.add(
        "repeat_index",
        run.repeat_index
    );

    if (run.seed) {
        json.add(
            "seed",
            *run.seed
        );
    } else {
        json.add_null("seed");
    }

    json.add_str(
        "status",
        status
    );
    json.add(
        "duration",
        duration
    );
    json.add(
        "wins",
        state.wins
    );
    json.add(
        "losses",
        state.losses
    );
    json.add(
        "draws",
        state.draws
    );
    json.add(
        "pairs",
        state.pairs_done
    );

    Net::JsonStream p1;
    populate_stats(
        p1,
        stats,
        1
    );
    json.add_raw(
        "p1",
        p1.str()
    );

    Net::JsonStream p2;
    populate_stats(
        p2,
        stats,
        2
    );
    json.add_raw(
        "p2",
        p2.str()
    );

    return json.str();
}

bool run_ready_to_finalize(
    const RunContext& context
) {
    int handled =
        context.games_completed.load() +
        context.games_skipped.load();

    return
        handled >=
            context.total_games_expected &&
        context.pending_evaluations.load() ==
            0;
}

std::string run_status(
    const RunContext& context,
    bool finalized,
    bool incomplete
) {
    if (!finalized) {
        return "live";
    }

    if (
        incomplete ||
        context.failed.load() ||
        context.games_skipped.load() >
            0 ||
        context.games_completed.load() <
            context.total_games_expected ||
        context.pending_evaluations.load() >
            0
    ) {
        return "stopped";
    }

    return "ended";
}

static void finalize_run(
    const std::shared_ptr<
        RunContext
    >& context,
    const Core::BatchConfig& batch,
    std::ofstream& ndjson_out,
    std::mutex& ndjson_mtx,
    const std::shared_ptr<
        Net::ApiManager
    >& api,
    bool incomplete
) {
    if (!context) {
        return;
    }

    std::call_once(
        context->finalized_flag,
        [&]() {
            auto now =
                std::chrono::
                    steady_clock::now();

            long wall_time =
                std::chrono::
                    duration_cast<
                        std::chrono::
                            milliseconds
                    >(
                        now -
                        context->run_start
                    ).count();

            std::string status =
                run_status(
                    *context,
                    true,
                    incomplete
                );

            if (api) {
                Net::ApiManager::Event event;
                event.type =
                    "run_update";
                event.run_id =
                    context->id;
                event.status = status;
                event.games_played =
                    context
                        ->games_completed
                        .load();

                {
                    std::lock_guard<
                        std::mutex
                    > lock(
                        context
                            ->match_state
                            .mtx
                    );

                    event.wins =
                        context
                            ->match_state
                            .wins;
                    event.losses =
                        context
                            ->match_state
                            .losses;
                    event.draws =
                        context
                            ->match_state
                            .draws;
                }

                event.wall_time_ms =
                    context
                        ->total_wall_time_ms
                        .load();

                {
                    std::lock_guard<
                        std::mutex
                    > lock(
                        context
                            ->stats
                            .mtx
                    );

                    populate_event_stats(
                        event,
                        context->stats
                    );
                }

                api->enqueue(
                    std::move(event)
                );
            }

            if (
                ndjson_out.is_open()
            ) {
                std::lock_guard<
                    std::mutex
                > lock(ndjson_mtx);

                ndjson_out
                    << format_ndjson_line(
                        batch,
                        context->run_spec,
                        context->match_state,
                        context->stats,
                        static_cast<double>(
                            wall_time
                        ) /
                            1000.0,
                        status
                    )
                    << std::endl;
            }

            Core::Logger::log(
                Core::Logger::Level::INFO,
                "Run ",
                context->id,
                " ",
                status,
                " (",
                context->config_label,
                ") N1=",
                context
                    ->run_spec
                    .p1_nodes,
                " N2=",
                context
                    ->run_spec
                    .p2_nodes,
                " pairs=",
                context
                    ->run_spec
                    .min_pairs,
                "-",
                context
                    ->run_spec
                    .max_pairs
            );

            context->stats.print();
        }
    );
}

static void maybe_finalize_run(
    const std::shared_ptr<
        RunContext
    >& context,
    WorkerState& state
) {
    if (
        context &&
        run_ready_to_finalize(
            *context
        )
    ) {
        finalize_run(
            context,
            state.bc,
            state.ndjson_out,
            state.ndjson_mtx,
            state.api,
            false
        );
    }
}

static void mark_evaluator_failure(
    WorkerState& state,
    const std::shared_ptr<
        RunContext
    >& context
) {
    if (context) {
        context->failed = true;
        context->stop_flag = true;
        return;
    }

    for (
        const auto& current :
        state.contexts
    ) {
        current->failed = true;
        current->stop_flag = true;
    }
}

static TaskResult fetch_next_task(
    WorkerState& state,
    int thread_limit
) {
    std::unique_lock<
        std::mutex
    > lock(state.task_mtx);

    state.task_cv.wait_for(
        lock,
        std::chrono::milliseconds(
            Core::Constants::
                WORKER_IDLE_WAIT_MS
        ),
        [&]() {
            return
                Sys::g_stop_flag ||
                !state.eval_queue.empty() ||
                !state.game_queue.empty() ||
                (
                    state.active_games.load() <
                        thread_limit &&
                    !state
                        .global_game_queue
                        .empty()
                );
        }
    );

    if (Sys::g_stop_flag) {
        return {
            std::nullopt,
            nullptr,
            true,
            false
        };
    }

    if (
        !state.eval_queue.empty()
    ) {
        EvalJob job =
            std::move(
                state
                    .eval_queue
                    .front()
            );

        state.eval_queue.pop_front();

        return {
            std::move(job),
            nullptr,
            false,
            false
        };
    }

    if (
        !state.game_queue.empty()
    ) {
        auto game =
            std::move(
                state
                    .game_queue
                    .front()
            );

        state.game_queue.pop_front();

        return {
            std::nullopt,
            std::move(game),
            false,
            false
        };
    }

    if (
        state.active_games.load() <
            thread_limit &&
        !state
            .global_game_queue
            .empty()
    ) {
        GameParams params =
            std::move(
                state
                    .global_game_queue
                    .front()
            );

        state
            .global_game_queue
            .pop_front();

        if (
            params.context &&
            params.context
                ->stop_flag
                .load()
        ) {
            auto context =
                params.context;

            context
                ->games_skipped
                .fetch_add(1);

            lock.unlock();

            maybe_finalize_run(
                context,
                state
            );

            return {
                std::nullopt,
                nullptr,
                false,
                true
            };
        }

        state.active_games.fetch_add(1);

        auto callback = [
            &state,
            context = params.context,
            api = state.api
        ](
            int pair,
            int leg,
            double black_score,
            long wall_ms
        ) {
            if (!context) {
                return;
            }

            context
                ->total_wall_time_ms
                .fetch_add(wall_ms);

            {
                std::lock_guard<
                    std::mutex
                > match_lock(
                    context
                        ->match_state
                        .mtx
                );

                auto [
                    position,
                    inserted
                ] =
                    context
                        ->match_state
                        .results
                        .emplace(
                            pair,
                            std::make_pair(
                                Core::Constants::
                                    PAIR_RESULT_UNSET,
                                Core::Constants::
                                    PAIR_RESULT_UNSET
                            )
                        );

                auto& result =
                    position->second;

                if (leg == 0) {
                    result.first =
                        black_score;
                } else {
                    result.second =
                        black_score;
                }

                if (
                    result.first >= 0.0 &&
                    result.second >= 0.0
                ) {
                    record_completed_pair(
                        context
                            ->match_state,
                        context->stats,
                        result.first,
                        result.second
                    );

                    context
                        ->match_state
                        .cv
                        .notify_one();

                    if (
                        Stats::SPRT::check(
                            context
                                ->match_state,
                            context->cfg
                        )
                    ) {
                        context
                            ->stop_flag =
                            true;
                    }
                }

                static_cast<void>(
                    inserted
                );
            }

            if (
                api &&
                context
                    ->should_send_update()
            ) {
                Net::ApiManager::Event event;
                event.type =
                    "run_update";
                event.run_id =
                    context->id;
                event.status =
                    run_status(
                        *context,
                        false
                    );
                event.games_played =
                    context
                        ->games_completed
                        .load() +
                    1;

                {
                    std::lock_guard<
                        std::mutex
                    > match_lock(
                        context
                            ->match_state
                            .mtx
                    );

                    event.wins =
                        context
                            ->match_state
                            .wins;
                    event.losses =
                        context
                            ->match_state
                            .losses;
                    event.draws =
                        context
                            ->match_state
                            .draws;
                }

                event.wall_time_ms =
                    context
                        ->total_wall_time_ms
                        .load();

                {
                    std::lock_guard<
                        std::mutex
                    > stats_lock(
                        context
                            ->stats
                            .mtx
                    );

                    populate_event_stats(
                        event,
                        context->stats
                    );
                }

                api->enqueue(
                    std::move(event)
                );
            }
        };

        return {
            std::nullopt,
            std::make_shared<
                Game::Referee
            >(
                params,
                state.api,
                params.context->stats,
                std::move(callback)
            ),
            false,
            false
        };
    }

    if (
        state
            .global_game_queue
            .empty() &&
        state.game_queue.empty() &&
        state.eval_queue.empty() &&
        state.active_games.load() == 0
    ) {
        state.task_cv.notify_all();

        return {
            std::nullopt,
            nullptr,
            true,
            false
        };
    }

    return {
        std::nullopt,
        nullptr,
        false,
        true
    };
}

void finalize_all_runs(
    WorkerState& state
) {
    for (
        const auto& context :
        state.contexts
    ) {
        finalize_run(
            context,
            state.bc,
            state.ndjson_out,
            state.ndjson_mtx,
            state.api,
            true
        );
    }
}

static void process_metrics(
    const EvalJob& job,
    const Stats::EvalMetrics& metrics
) {
    if (
        metrics.p_best <
        Core::Constants::
            GARBAGE_TIME_PROB_THRESHOLD
    ) {
        if (
            Core::Logger::is_debug()
        ) {
            Core::Logger::log(
                Core::Logger::Level::DEBUG,
                "Move ",
                job.moves.size(),
                " SKIPPED (Garbage Time p_best=",
                std::fixed,
                std::setprecision(3),
                metrics.p_best,
                ")"
            );
        }

        return;
    }

    double regret =
        std::max(
            0.0,
            metrics.p_best -
                metrics.p_played
        );

    double sharpness =
        std::max(
            0.0,
            metrics.p_best -
                metrics.p_second
        );

    if (
        Core::Logger::is_debug()
    ) {
        Core::Logger::log(
            Core::Logger::Level::DEBUG,
            "Move ",
            job.moves.size(),
            " P",
            job.bot_id,
            " | p_best=",
            std::fixed,
            std::setprecision(4),
            metrics.p_best,
            " p_second=",
            metrics.p_second,
            " p_played=",
            metrics.p_played,
            " | Regret=",
            regret,
            " Sharpness=",
            sharpness
        );
    }

    if (
        regret >
        Core::Constants::
            METRIC_SEVERE_ERROR_REGRET
    ) {
        Core::Logger::log(
            Core::Logger::Level::DEBUG,
            "BLUNDER: Move ",
            job.moves.size(),
            " P",
            job.bot_id,
            " Regret=",
            std::fixed,
            std::setprecision(3),
            regret,
            " (played=",
            metrics.p_played,
            " vs best=",
            metrics.p_best,
            ")"
        );
    }

    job.context
        ->stats
        .add_metrics(
            job.bot_id,
            regret,
            sharpness
        );
}

void interleaved_worker_loop(
    const Core::Config& config,
    WorkerState& state
) {
    std::unique_ptr<
        Analysis::Evaluator
    > evaluator;

    if (
        !state.bc.eval_cmd.empty()
    ) {
        evaluator =
            std::make_unique<
                Analysis::Evaluator
            >(
                state.bc.eval_cmd,
                state.bc.board_size,
                state.bc
                    .eval_timeout_cutoff,
                state.bc.exit_on_crash,
                state.bc
                    .eval_nodes_list
                    .empty()
                    ? Core::Constants::
                        DEFAULT_EVAL_NODES
                    : state.bc
                        .eval_nodes_list[0]
            );

        try {
            if (!evaluator->start()) {
                evaluator.reset();
            }
        } catch (
            const Core::MatchTerminated&
        ) {
            mark_evaluator_failure(
                state,
                nullptr
            );
            throw;
        }
    }

    while (true) {
        TaskResult task =
            fetch_next_task(
                state,
                config.threads
            );

        if (task.stop) {
            break;
        }

        if (task.retry) {
            continue;
        }

        if (task.eval) {
            EvalJob job =
                std::move(*task.eval);

            auto complete = [&]() {
                job.context
                    ->pending_evaluations
                    .fetch_sub(1);

                maybe_finalize_run(
                    job.context,
                    state
                );
            };

            try {
                std::optional<
                    Stats::EvalMetrics
                > metrics;

                auto key =
                    Analysis::GlobalCache::
                        make_key(
                            job.moves,
                            job.context
                                ->cfg
                                .board_size,
                            job.max_nodes,
                            state.bc.eval_cmd
                        );

                metrics =
                    Analysis::GlobalCache::
                        get(key);

                if (metrics) {
                    if (
                        Core::Logger::
                            is_debug()
                    ) {
                        Core::Logger::log(
                            Core::Logger::
                                Level::DEBUG,
                            "[CACHE HIT] Move ",
                            job.moves.size(),
                            " hash=",
                            key.position
                        );
                    }
                } else if (evaluator) {
                    if (
                        Core::Logger::
                            is_debug()
                    ) {
                        Core::Logger::log(
                            Core::Logger::
                                Level::DEBUG,
                            "[CACHE MISS] Move ",
                            job.moves.size(),
                            " hash=",
                            key.position
                        );
                    }

                    if (
                        evaluator
                            ->set_max_nodes(
                                job.max_nodes
                            )
                    ) {
                        Sys::CpuMonitor::Times
                            cpu_start{
                                0,
                                0
                            };

                        if (
                            Core::Logger::
                                is_debug()
                        ) {
                            cpu_start =
                                Sys::CpuMonitor::
                                    get_times(
                                        evaluator
                                            ->pid()
                                    );
                        }

                        auto start =
                            std::chrono::
                                steady_clock::
                                now();

                        metrics =
                            evaluator->eval(
                                job.moves
                            );

                        auto end =
                            std::chrono::
                                steady_clock::
                                now();

                        if (metrics) {
                            Analysis::
                                GlobalCache::
                                set(
                                    key,
                                    *metrics
                                );
                        }

                        if (
                            Core::Logger::
                                is_debug()
                        ) {
                            long wall_ms =
                                std::chrono::
                                    duration_cast<
                                        std::chrono::
                                            milliseconds
                                    >(
                                        end -
                                        start
                                    ).count();

                            auto cpu_end =
                                Sys::CpuMonitor::
                                    get_times(
                                        evaluator
                                            ->pid()
                                    );

                            double load =
                                Sys::CpuMonitor::
                                    calculate_load(
                                        cpu_start,
                                        cpu_end,
                                        wall_ms
                                    );

                            long cpu_ms =
                                (
                                    cpu_end.user_ms -
                                    cpu_start.user_ms
                                ) +
                                (
                                    cpu_end.sys_ms -
                                    cpu_start.sys_ms
                                );

                            Core::Logger::log(
                                Core::Logger::
                                    Level::DEBUG,
                                "Eval Move ",
                                job.moves.size(),
                                " | Wall: ",
                                wall_ms,
                                "ms | CPU: ",
                                cpu_ms,
                                "ms | Load: ",
                                static_cast<int>(
                                    load
                                ),
                                "%"
                            );
                        }
                    } else if (
                        !evaluator->restart()
                    ) {
                        evaluator.reset();
                    }
                }

                if (metrics) {
                    process_metrics(
                        job,
                        *metrics
                    );
                }

                complete();
            } catch (
                const Core::
                    MatchTerminated&
            ) {
                mark_evaluator_failure(
                    state,
                    job.context
                );
                complete();
                throw;
            } catch (...) {
                complete();
                throw;
            }

            continue;
        }

        if (!task.game) {
            continue;
        }

        std::vector<
            Core::Point
        > history;

        Game::Referee::Status status;

        auto context =
            task.game
                ->params()
                .context;

        try {
            status =
                task.game->step(
                    history
                );
        } catch (
            const Core::MatchTerminated&
        ) {
            std::lock_guard<
                std::mutex
            > lock(state.task_mtx);

            state.active_games.fetch_sub(1);
            state.game_queue.clear();
            state.task_cv.notify_all();
            throw;
        }

        {
            std::lock_guard<
                std::mutex
            > lock(state.task_mtx);

            if (
                config.eval_enabled() &&
                !history.empty() &&
                history.size() >
                    static_cast<size_t>(
                        task.game
                            ->get_opening_size()
                    )
            ) {
                context
                    ->pending_evaluations
                    .fetch_add(1);

                state.eval_queue.push_back({
                    history,
                    task.game
                        ->get_last_mover_bot_id(),
                    context,
                    context->cfg
                        .eval_max_nodes
                });
            }

            if (
                status ==
                Game::Referee::Status::
                    RUNNING
            ) {
                state.game_queue.push_back(
                    task.game
                );
            } else {
                state.active_games.fetch_sub(1);
                context
                    ->games_completed
                    .fetch_add(1);
            }

            state.task_cv.notify_all();
        }

        maybe_finalize_run(
            context,
            state
        );
    }
}

}
