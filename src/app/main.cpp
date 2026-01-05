#include <csignal>
#include <iostream>
#include <fstream>
#include <thread>
#include <deque>
#include <vector>
#include <memory>
#include <curl/curl.h>

#include "../core/constants.h"
#include "../core/logger.h"
#include "../sys/signals.h"
#include "../sys/cpu_monitor.h"
#include "../analysis/cache.h"
#include "../game/openings.h"
#include "../net/api_client.h"
#include "../core/utils.h"
#include "cli.h"
#include "context.h"
#include "worker.h"

using namespace Arena;

int main(int argc, char* argv[]) {
    signal(SIGPIPE, SIG_IGN);
    sigset_t block_mask;
    sigemptyset(&block_mask);
    sigaddset(&block_mask, SIGINT);
    sigaddset(&block_mask, SIGTERM);
    sigprocmask(SIG_BLOCK, &block_mask, nullptr);

    struct sigaction sa;
    sa.sa_handler = Sys::signal_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = 0;
    sigaction(SIGINT, &sa, nullptr);
    sigaction(SIGTERM, &sa, nullptr);
    curl_global_init(CURL_GLOBAL_ALL);

    bool had_bot_failure = false;
    std::shared_ptr<Net::ApiManager> api;

    try {
        Core::BatchConfig bc = App::CLI::parse_batch_args(argc, argv);
        auto runs = App::CLI::expand_batch(bc);
        if (bc.debug)
            Core::Logger::set_level(Core::Logger::Level::DEBUG);
        Analysis::GlobalCache::init(bc.board_size);

        if (!bc.api_url.empty()) {
            api = std::make_shared<Net::ApiManager>(
                bc.api_url, bc.api_key, bc.debounce_ms
            );
            api->start();
            if (bc.cleanup) api->reset();
        }

        std::vector<std::vector<Core::Point>> ops;
        if (!bc.openings_path.empty()) {
            ops = Game::Openings::load(bc.openings_path);
            if (ops.empty()) {
                Core::Logger::log(
                    Core::Logger::Level::ERROR,
                    "No openings found in: ", bc.openings_path
                );
                return Core::Constants::EXIT_CODE_SYSTEM_FAILURE;
            }
            if (bc.shuffle_openings) {
                std::random_device rd;
                std::mt19937 g(rd());
                std::shuffle(ops.begin(), ops.end(), g);
            }
        }

        std::ofstream ndjson_out;
        if (!bc.export_results.empty()) {
            ndjson_out.open(bc.export_results, std::ios::trunc);
            if (!ndjson_out) {
                Core::Logger::log(
                    Core::Logger::Level::ERROR,
                    "Cannot open export file: ", bc.export_results
                );
                return Core::Constants::EXIT_CODE_SYSTEM_FAILURE;
            }
        }

        Core::Logger::log(
            Core::Logger::Level::INFO,
            "Starting ", runs.size(), " batch configuration(s)"
        );

        std::vector<std::shared_ptr<App::RunContext>> contexts;
        std::deque<App::GameParams> global_game_queue;

        for (size_t run_idx = 0; run_idx < runs.size(); ++run_idx) {
            const auto& rs = runs[run_idx];
            Core::Config cfg = App::CLI::build_config(bc, rs);
            auto ctx = std::make_shared<App::RunContext>();

            ctx->id = Core::Utils::generate_run_id();
            ctx->cfg = cfg;
            ctx->run_spec = rs;
            ctx->config_label = App::CLI::generate_config_label(cfg);
            ctx->total_games_expected = cfg.max_pairs * 2;
            ctx->run_start = std::chrono::steady_clock::now();
            ctx->run_start_cpu = Sys::CpuMonitor::get_times(getpid());
            contexts.push_back(ctx);

            Core::Logger::log(
                Core::Logger::Level::INFO,
                "[", run_idx + 1, "/", runs.size(), "] ",
                "Creating run ", ctx->id, " (", ctx->config_label, ") ",
                "N1=", rs.p1_nodes, " N2=", rs.p2_nodes,
                " pairs=", rs.min_pairs, "-", rs.max_pairs
            );

            auto games = App::CLI::create_pending_games(
                cfg, ops, rs.seed, ctx, ctx->id
            );
            for (auto& g : games) {
                global_game_queue.push_back(std::move(g));
            }
        }

        Core::Logger::log(
            Core::Logger::Level::INFO,
            "Queued ", global_game_queue.size(), " games."
        );

        std::deque<App::EvalJob> eval_queue;
        std::deque<std::shared_ptr<Game::Referee>> game_queue;
        std::mutex task_mtx;
        std::condition_variable task_cv;
        std::atomic<int> active_games = 0;
        std::mutex ndjson_mtx;

        auto& primary_cfg = contexts[0]->cfg;
        Sys::g_stop_flag = 0;
        std::vector<std::thread> workers;

        for (int i = 0; i < primary_cfg.threads; ++i) {
            workers.emplace_back([&, cfg = primary_cfg]() {
                App::WorkerState ws{
                    eval_queue, game_queue, global_game_queue,
                    task_mtx, task_cv, active_games, api,
                    contexts, bc, ndjson_out, ndjson_mtx
                };
                try {
                    App::interleaved_worker_loop(cfg, ws);
                } catch (const Core::MatchTerminated&) {
                } catch (const std::exception& e) {
                    Core::Logger::log(
                        Core::Logger::Level::ERROR,
                        "Worker exception: ", e.what()
                    );
                }
            });
        }
        for (auto& t : workers) t.join();

        Core::Logger::log(
            Core::Logger::Level::INFO,
            "===== ALL RUNS COMPLETE ====="
        );
        for (size_t i = 0; i < contexts.size(); ++i) {
            auto& ctx = contexts[i];
            Core::Logger::log(
                Core::Logger::Level::INFO, "Run ", i + 1, "/", contexts.size(),
                " (", ctx->config_label, "):"
            );
            ctx->stats.print();
            if (ctx->stats.crashes.load() > 0) had_bot_failure = true;
        }

        if (ndjson_out) {
            ndjson_out.close();
            Core::Logger::log(
                Core::Logger::Level::INFO,
                "Results exported to: ", bc.export_results
            );
        }

        if (api) api->stop();
        curl_global_cleanup();

        return had_bot_failure
            ? Core::Constants::EXIT_CODE_BOT_FAILURE
            : Core::Constants::EXIT_CODE_SUCCESS;

    } catch (const Core::MatchTerminated&) {
        if (api) api->stop();
        curl_global_cleanup();
        return had_bot_failure
            ? Core::Constants::EXIT_CODE_BOT_FAILURE
            : Core::Constants::EXIT_CODE_SUCCESS;
    } catch (const std::exception& e) {
        Core::Logger::log(
            Core::Logger::Level::ERROR, "Fatal error: ", e.what()
        );
        if (api) api->stop();
        curl_global_cleanup();
        return Core::Constants::EXIT_CODE_SYSTEM_FAILURE;
    }
}
