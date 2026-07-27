#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <csignal>
#include <curl/curl.h>
#include <deque>
#include <fstream>
#include <iostream>
#include <memory>
#include <mutex>
#include <random>
#include <thread>
#include <vector>

#include "../analysis/cache.h"
#include "../core/constants.h"
#include "../core/logger.h"
#include "../core/utils.h"
#include "../game/openings.h"
#include "../net/api_client.h"
#include "../sys/cpu_monitor.h"
#include "../sys/signals.h"
#include "cli.h"
#include "context.h"
#include "worker.h"

using namespace Arena;

int main(int argc, char* argv[]) {
    signal(SIGPIPE, SIG_IGN);
    Sys::g_stop_flag = 0;

    if (!Sys::install_termination_handlers()) {
        std::cerr << "Failed to install termination handlers\n";
        return Core::Constants::EXIT_CODE_SYSTEM_FAILURE;
    }

    curl_global_init(CURL_GLOBAL_ALL);

    bool had_bot_failure = false;
    std::shared_ptr<Net::ApiManager> api;

    try {
        Core::BatchConfig batch =
            App::CLI::parse_batch_args(argc, argv);
        auto runs = App::CLI::expand_batch(batch);

        if (batch.debug) {
            Core::Logger::set_level(
                Core::Logger::Level::DEBUG
            );
        }

        Analysis::GlobalCache::init(
            batch.board_size
        );

        if (!batch.api_url.empty()) {
            api = std::make_shared<Net::ApiManager>(
                batch.api_url,
                batch.api_key,
                batch.debounce_ms
            );
            api->start();

            if (batch.cleanup) {
                api->reset();
            }
        }

        std::vector<std::vector<Core::Point>>
            openings;

        if (!batch.openings_path.empty()) {
            openings = Game::Openings::load(
                batch.openings_path
            );

            if (openings.empty()) {
                throw std::runtime_error(
                    "No openings found in: " +
                    batch.openings_path
                );
            }

            if (batch.shuffle_openings) {
                std::mt19937 generator(
                    std::random_device{}()
                );
                std::shuffle(
                    openings.begin(),
                    openings.end(),
                    generator
                );
            }
        }

        std::ofstream ndjson_out;

        if (!batch.export_results.empty()) {
            ndjson_out.open(
                batch.export_results,
                std::ios::trunc
            );

            if (!ndjson_out) {
                throw std::runtime_error(
                    "Cannot open export file: " +
                    batch.export_results
                );
            }
        }

        Core::Logger::log(
            Core::Logger::Level::INFO,
            "Starting ",
            runs.size(),
            " batch configuration(s)"
        );

        std::vector<std::shared_ptr<App::RunContext>>
            contexts;
        std::deque<App::GameParams>
            global_game_queue;

        for (
            size_t run_index = 0;
            run_index < runs.size();
            ++run_index
        ) {
            const auto& run_spec = runs[run_index];
            Core::Config config =
                App::CLI::build_config(
                    batch,
                    run_spec
                );
            auto context =
                std::make_shared<App::RunContext>();

            context->id =
                Core::Utils::generate_run_id();
            context->cfg = config;
            context->run_spec = run_spec;
            context->config_label =
                App::CLI::generate_config_label(
                    config
                );
            context->total_games_expected =
                config.max_pairs * 2;
            context->run_start =
                std::chrono::steady_clock::now();
            context->run_start_cpu =
                Sys::CpuMonitor::get_times(
                    getpid()
                );

            contexts.push_back(context);

            Core::Logger::log(
                Core::Logger::Level::INFO,
                "[",
                run_index + 1,
                "/",
                runs.size(),
                "] Creating run ",
                context->id,
                " (",
                context->config_label,
                ") N1=",
                run_spec.p1_nodes,
                " N2=",
                run_spec.p2_nodes,
                " pairs=",
                run_spec.min_pairs,
                "-",
                run_spec.max_pairs
            );

            auto games =
                App::CLI::create_pending_games(
                    config,
                    openings,
                    run_spec.seed,
                    context,
                    context->id
                );

            for (auto& game : games) {
                global_game_queue.push_back(
                    std::move(game)
                );
            }
        }

        Core::Logger::log(
            Core::Logger::Level::INFO,
            "Queued ",
            global_game_queue.size(),
            " games."
        );

        std::deque<App::EvalJob> eval_queue;
        std::deque<std::shared_ptr<Game::Referee>>
            game_queue;
        std::mutex task_mtx;
        std::condition_variable task_cv;
        std::atomic<int> active_games = 0;
        std::mutex ndjson_mtx;

        const auto& primary_config =
            contexts.front()->cfg;
        std::vector<std::thread> workers;

        for (
            int index = 0;
            index < primary_config.threads;
            ++index
        ) {
            workers.emplace_back(
                [&, config = primary_config]() {
                    App::WorkerState state{
                        eval_queue,
                        game_queue,
                        global_game_queue,
                        task_mtx,
                        task_cv,
                        active_games,
                        api,
                        contexts,
                        batch,
                        ndjson_out,
                        ndjson_mtx
                    };

                    try {
                        App::interleaved_worker_loop(
                            config,
                            state
                        );
                    } catch (
                        const Core::MatchTerminated&
                    ) {
                    } catch (
                        const std::exception& error
                    ) {
                        Core::Logger::log(
                            Core::Logger::Level::ERROR,
                            "Worker exception: ",
                            error.what()
                        );
                    }
                }
            );
        }

        for (auto& worker : workers) {
            worker.join();
        }

        if (Sys::g_stop_flag) {
            App::WorkerState state{
                eval_queue,
                game_queue,
                global_game_queue,
                task_mtx,
                task_cv,
                active_games,
                api,
                contexts,
                batch,
                ndjson_out,
                ndjson_mtx
            };
            App::finalize_all_runs(state);
        }

        Core::Logger::log(
            Core::Logger::Level::INFO,
            "===== ALL RUNS COMPLETE ====="
        );

        for (
            size_t index = 0;
            index < contexts.size();
            ++index
        ) {
            const auto& context =
                contexts[index];

            Core::Logger::log(
                Core::Logger::Level::INFO,
                "Run ",
                index + 1,
                "/",
                contexts.size(),
                " (",
                context->config_label,
                "):"
            );

            context->stats.print();

            if (
                context->stats.crashes.load() > 0 ||
                context->failed.load()
            ) {
                had_bot_failure = true;
            }
        }

        if (ndjson_out.is_open()) {
            ndjson_out.close();

            Core::Logger::log(
                Core::Logger::Level::INFO,
                "Results exported to: ",
                batch.export_results
            );
        }

        if (api) {
            api->stop();
        }

        curl_global_cleanup();

        return had_bot_failure
            ? Core::Constants::EXIT_CODE_BOT_FAILURE
            : Core::Constants::EXIT_CODE_SUCCESS;
    } catch (const Core::MatchTerminated&) {
        if (api) {
            api->stop();
        }

        curl_global_cleanup();

        return had_bot_failure
            ? Core::Constants::EXIT_CODE_BOT_FAILURE
            : Core::Constants::EXIT_CODE_SUCCESS;
    } catch (const std::exception& error) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "Fatal error: ",
            error.what()
        );

        if (api) {
            api->stop();
        }

        curl_global_cleanup();

        return Core::Constants::
            EXIT_CODE_SYSTEM_FAILURE;
    }
}
