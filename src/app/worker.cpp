#include "worker.h"
#include "../analysis/evaluator.h"
#include "../analysis/cache.h"
#include "../core/logger.h"
#include "../sys/signals.h"
#include "../sys/cpu_monitor.h"
#include "../net/json.h"
#include "../stats/sprt.h"

namespace Arena::App {

struct TaskResult {
    std::optional<EvalJob> eval;
    std::shared_ptr<Game::Referee> game;
    bool stop = false;
    bool retry = false;
};

static void update_pair_outcome(
    MatchState& state, double res_first, double res_second)
{
    if (res_first < 0 || res_second < 0) return;
    double total_score = res_first + (1.0 - res_second);
    if (total_score > 1.0) state.wins++;
    else if (total_score < 1.0) state.losses++;
    else state.draws++;
}

static void populate_event_stats(
    Net::ApiManager::Event& e, const Stats::Tracker& stats)
{
    e.p1_elo = stats.p1_elo;
    e.p2_elo = stats.p2_elo;
    e.p1_erf = stats.get_p1_erf();
    e.p2_erf = stats.get_p2_erf();
    e.p1_time = stats.p1_total_time_ms.load();
    e.p2_time = stats.p2_total_time_ms.load();
    e.p1_crashes = stats.p1_crashes.load();
    e.p2_crashes = stats.p2_crashes.load();
    e.p1_cma = stats.get_p1_cma();
    e.p2_cma = stats.get_p2_cma();
    e.p1_blunder = stats.get_p1_blunder();
    e.p2_blunder = stats.get_p2_blunder();
}

static void populate_stats(
    Net::JsonStream& js, const Stats::Tracker& stats, int p_num)
{
    if (p_num == 1) {
        js.add("elo", stats.p1_elo);
        js.add("erf", stats.get_p1_erf());
        js.add("time", stats.p1_total_time_ms.load());
        js.add("crashes", stats.p1_crashes.load());
        js.add("cma", stats.get_p1_cma());
        js.add("blunder", stats.get_p1_blunder());
    } else {
        js.add("elo", stats.p2_elo);
        js.add("erf", stats.get_p2_erf());
        js.add("time", stats.p2_total_time_ms.load());
        js.add("crashes", stats.p2_crashes.load());
        js.add("cma", stats.get_p2_cma());
        js.add("blunder", stats.get_p2_blunder());
    }
}

std::string format_ndjson_line(
    const Core::BatchConfig& bc,
    const Core::RunSpec& rs,
    const MatchState& state,
    const Stats::Tracker& stats,
    double duration
) {
    Net::JsonStream js;
    js.add_str("p1_cmd", bc.p1_cmd);
    js.add_str("p2_cmd", bc.p2_cmd);
    js.add("p1_nodes", rs.p1_nodes);
    js.add("p2_nodes", rs.p2_nodes);
    js.add("eval_nodes", rs.eval_nodes);
    js.add("board_size", bc.board_size);
    js.add("min_pairs", rs.min_pairs);
    js.add("max_pairs", rs.max_pairs);
    js.add("repeat_index", rs.repeat_index);
    if (rs.seed) js.add("seed", *rs.seed);
    else js.add_null("seed");
    js.add("duration", duration);
    js.add("wins", state.wins);
    js.add("losses", state.losses);
    js.add("draws", state.draws);
    js.add("pairs", state.pairs_done);

    {
        Net::JsonStream p1;
        populate_stats(p1, stats, 1);
        js.add_raw("p1", p1.str());
    }
    {
        Net::JsonStream p2;
        populate_stats(p2, stats, 2);
        js.add_raw("p2", p2.str());
    }
    return js.str();
}

static void finalize_run(
    std::shared_ptr<RunContext> ctx,
    const Core::BatchConfig& bc,
    std::ofstream& ndjson_out,
    std::mutex& ndjson_mtx,
    std::shared_ptr<Net::ApiManager> api
) {
    if (!ctx) return;
    std::call_once(ctx->finalized_flag, [&]() {
        auto now = std::chrono::steady_clock::now();
        long run_wall = std::chrono::duration_cast<std::chrono::milliseconds>(
            now - ctx->run_start
        ).count();

        if (api) {
            Net::ApiManager::Event e;
            e.type = "run_update"; e.run_id = ctx->id; e.is_done = true;
            e.timed_out = Sys::g_stop_flag || ctx->games_completed + ctx->games_skipped < ctx->total_games_expected;
            e.games_played = ctx->games_completed + ctx->games_skipped;
            {
                std::lock_guard<std::mutex> l(ctx->match_state.mtx);
                e.wins = ctx->match_state.wins;
                e.losses = ctx->match_state.losses;
                e.draws = ctx->match_state.draws;
            }
            e.wall_time_ms = ctx->total_wall_time_ms;

            {
                std::lock_guard<std::mutex> l(ctx->stats.mtx);
                populate_event_stats(e, ctx->stats);
            }
            api->enqueue(e);
        }

        if (ndjson_out.is_open()) {
            std::lock_guard<std::mutex> l(ndjson_mtx);
            ndjson_out << format_ndjson_line(
                bc, ctx->run_spec, ctx->match_state, ctx->stats,
                (double)run_wall / 1000.0
            ) << std::endl;
        }

        Core::Logger::log(
             Core::Logger::Level::INFO,
             "Run ", ctx->id, " Finished (", ctx->config_label, ") ",
             "N1=", ctx->run_spec.p1_nodes, " N2=", ctx->run_spec.p2_nodes,
             " pairs=", ctx->run_spec.min_pairs, "-", ctx->run_spec.max_pairs
        );
        ctx->stats.print();
    });
}

static TaskResult fetch_next_task(WorkerState& ws, int thread_limit) {
    std::unique_lock<std::mutex> l(ws.task_mtx);
    ws.task_cv.wait_for(
        l, std::chrono::milliseconds(Core::Constants::WORKER_IDLE_WAIT_MS
    ), [&]{
        return Sys::g_stop_flag || !ws.eval_queue.empty() || !ws.game_queue.empty() ||
            (ws.active_games < thread_limit && !ws.global_game_queue.empty());
    });

    if (Sys::g_stop_flag) return {std::nullopt, nullptr, true, false};

    if (!ws.eval_queue.empty()) {
        auto j = std::move(ws.eval_queue.front());
        ws.eval_queue.pop_front();
        return {std::move(j), nullptr, false, false};
    }

    if (!ws.game_queue.empty()) {
        auto g = std::move(ws.game_queue.front());
        ws.game_queue.pop_front();
        return {std::nullopt, std::move(g), false, false};
    }

    if (ws.active_games < thread_limit && !ws.global_game_queue.empty()) {
        auto p = std::move(ws.global_game_queue.front());
        ws.global_game_queue.pop_front();

        if (p.context && p.context->stop_flag) {
            if (++p.context->games_skipped + p.context->games_completed >=
                p.context->total_games_expected) {
                finalize_run(p.context, ws.bc, ws.ndjson_out, ws.ndjson_mtx, ws.api);
            }
            return {std::nullopt, nullptr, false, true};
        }

        ws.active_games++;

        auto cb = [&ws, ctx = p.context, api = ws.api](
            int pair, int leg, double p1_score, long wall_ms, long, long
        ) {
            if (!ctx) return;
            ctx->total_wall_time_ms += wall_ms;

            {
                std::lock_guard<std::mutex> lock(ctx->match_state.mtx);
                if (ctx->match_state.results.find(pair) ==
                    ctx->match_state.results.end()) {
                    ctx->match_state.results[pair] = {
                        Core::Constants::PAIR_RESULT_UNSET,
                        Core::Constants::PAIR_RESULT_UNSET
                    };
                }

                auto& res = ctx->match_state.results[pair];
                if (leg == 0) res.first = p1_score; else res.second = p1_score;

                if (res.first >= 0.0 && res.second >= 0.0) {
                    ctx->match_state.pairs_done++;
                    update_pair_outcome(ctx->match_state, res.first, res.second);

                    double pair_score_p1 = res.first + (1.0 - res.second);
                    ctx->stats.update_pair_stats(pair_score_p1 / 2.0);

                    ctx->match_state.cv.notify_one();

                    if (Stats::SPRT::check(ctx->match_state, ctx->cfg))
                        ctx->stop_flag = true;
                }
            }

            if (api && ctx->should_send_update()) {
                Net::ApiManager::Event e;
                e.type = "run_update";
                e.run_id = ctx->id;
                e.games_played = ctx->games_completed + 1;

                {
                    std::lock_guard<std::mutex> lock(ctx->match_state.mtx);
                    e.wins = ctx->match_state.wins;
                    e.losses = ctx->match_state.losses;
                    e.draws = ctx->match_state.draws;
                }

                e.wall_time_ms = ctx->total_wall_time_ms;

                {
                    std::lock_guard<std::mutex> lock(ctx->stats.mtx);
                    populate_event_stats(e, ctx->stats);
                }
                api->enqueue(e);
            }

            if (++ctx->games_completed + ctx->games_skipped >=
                ctx->total_games_expected) {
                finalize_run(ctx, ws.bc, ws.ndjson_out, ws.ndjson_mtx, ws.api);
            }
        };

        return {
            std::nullopt,
            std::make_shared<Game::Referee>(p, ws.api, p.context->stats, cb),
            false, false
        };
    }

    if (ws.global_game_queue.empty() && ws.game_queue.empty() &&
        ws.eval_queue.empty() && ws.active_games == 0) {
        Sys::g_stop_flag = 1;
        ws.task_cv.notify_all();
        return {std::nullopt, nullptr, true, false};
    }

    return {std::nullopt, nullptr, false, true};
}

void finalize_all_runs(WorkerState& ws) {
    for (auto& ctx : ws.contexts) {
        if (ctx) finalize_run(ctx, ws.bc, ws.ndjson_out, ws.ndjson_mtx, ws.api);
    }
}

void interleaved_worker_loop(const Core::Config& cfg, WorkerState& ws) {
    std::unique_ptr<Analysis::Evaluator> eval;
    if (!ws.bc.eval_cmd.empty()) {
        eval = std::make_unique<Analysis::Evaluator>(
            ws.bc.eval_cmd, ws.bc.board_size, ws.bc.eval_timeout_cutoff,
            ws.bc.exit_on_crash,
            ws.bc.eval_nodes_list.empty()
                ? Core::Constants::DEFAULT_EVAL_NODES
                : ws.bc.eval_nodes_list[0]
        );
        if (!eval->start()) eval.reset();
    }

    while (true) {
        auto task = fetch_next_task(ws, cfg.threads);
        if (task.stop) break;
        if (task.retry) continue;

        if (task.eval) {
            if (!eval) continue;

            auto& job = *task.eval;
            int board_size = job.context->cfg.board_size;

            uint64_t h = Analysis::GlobalCache::hash(job.moves, board_size);
            auto cached = Analysis::GlobalCache::get(h);

            Stats::EvalMetrics m;

            if (cached) {
                m = *cached;
                if (Core::Logger::is_debug()) {
                    Core::Logger::log(
                        Core::Logger::Level::DEBUG,
                        "[CACHE HIT] Move ", job.moves.size(), " hash=", h
                    );
                }
            } else {

                if (Core::Logger::is_debug()) {
                    Core::Logger::log(
                        Core::Logger::Level::DEBUG,
                        "[CACHE MISS] Move ", job.moves.size(), " hash=", h
                    );
                }

                Sys::CpuMonitor::Times cpu_start{0, 0};
                if (Core::Logger::is_debug() && eval)
                    cpu_start = Sys::CpuMonitor::get_times(eval->pid());

                auto t0 = std::chrono::steady_clock::now();
                if (eval) {
                    eval->set_max_nodes(job.max_nodes);
                    m = eval->eval(job.moves);
                }
                auto t1 = std::chrono::steady_clock::now();

                Analysis::GlobalCache::set(h, m);

                if (Core::Logger::is_debug() && eval) {
                    long wall_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                        t1 - t0
                    ).count();
                    auto cpu_end = Sys::CpuMonitor::get_times(eval->pid());
                    double load = Sys::CpuMonitor::calculate_load(
                        cpu_start, cpu_end, wall_ms
                    );
                    long cpu_ms = (cpu_end.user_ms - cpu_start.user_ms) +
                        (cpu_end.sys_ms - cpu_start.sys_ms);
                    Core::Logger::log(
                        Core::Logger::Level::DEBUG,
                        "Eval Move ", job.moves.size(), " | Wall: ", wall_ms,
                        "ms | CPU: ", cpu_ms, "ms | Load: ", (int)load, "%"
                    );
                }
            }

            if (m.p_best < Core::Constants::GARBAGE_TIME_PROB_THRESHOLD) {
                if (Core::Logger::is_debug()) {
                    Core::Logger::log(
                        Core::Logger::Level::DEBUG,
                        "Move ", job.moves.size(), " SKIPPED (Garbage Time p_best=",
                        std::fixed, std::setprecision(3), m.p_best, ")"
                    );
                }
            } else {
                double regret = std::max(0.0, m.p_best - m.p_played);
                double sharpness = std::max(0.0, m.p_best - m.p_second);

                if (Core::Logger::is_debug()) {
                    Core::Logger::log(
                        Core::Logger::Level::DEBUG,
                        "Move ", job.moves.size(), " P", job.bot_id,
                        " | p_best=", std::fixed, std::setprecision(4), m.p_best,
                        " p_second=", m.p_second,
                        " p_played=", m.p_played,
                        " | Regret=", regret, " Sharpness=", sharpness
                    );
                }

                if (regret > Core::Constants::METRIC_SEVERE_ERROR_REGRET) {
                    Core::Logger::log(
                        Core::Logger::Level::DEBUG,
                        "BLUNDER: Move ", job.moves.size(), " P", job.bot_id,
                        " Regret=", std::fixed, std::setprecision(3), regret,
                        " (played=", m.p_played, " vs best=", m.p_best, ")"
                    );
                }

                job.context->stats.add_metrics(job.bot_id, regret, sharpness);
            }
        } else if (task.game) {
            std::vector<Core::Point> hist;
            Game::Referee::Status status;
            try {
                status = task.game->step(hist);
            } catch (const Core::MatchTerminated&) {
                std::lock_guard<std::mutex> l(ws.task_mtx);
                ws.active_games--;
                ws.game_queue.clear();
                ws.task_cv.notify_all();
                throw;
            }
            std::lock_guard<std::mutex> l(ws.task_mtx);

            if (cfg.eval_enabled() && !hist.empty() &&
                hist.size() > (size_t)task.game->get_opening_size()) {
                ws.eval_queue.push_back({
                    hist,
                    task.game->get_last_mover_bot_id(),
                    task.game->params().context,
                    task.game->params().context->cfg.eval_max_nodes
                });
            }

            if (status == Game::Referee::Status::RUNNING)
                ws.game_queue.push_back(task.game);
            else ws.active_games--;
            ws.task_cv.notify_all();
        }
    }
}

}
