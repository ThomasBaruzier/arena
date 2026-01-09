#pragma once

#include <string>
#include <vector>
#include <map>
#include <mutex>
#include <atomic>
#include <condition_variable>
#include <chrono>
#include <memory>
#include <functional>
#include "../core/config_types.h"
#include "../core/types.h"
#include "../stats/tracker.h"
#include "../sys/cpu_monitor.h"
#include "../sys/process.h"

namespace Arena::App {

    struct MatchState {
        std::map<int, std::pair<double, double>> results;
        std::mutex mtx;
        std::condition_variable cv;
        int pairs_done = 0, wins = 0, losses = 0, draws = 0;
    };

    struct RunContext {
        RunContext() { last_api_update = std::chrono::steady_clock::now(); }

        std::string id, config_label;
        Core::Config cfg;
        Core::RunSpec run_spec;
        Stats::Tracker stats;
        MatchState match_state;

        std::atomic<long long> total_wall_time_ms{0};
        std::atomic<long long> total_p1_cpu{0}, total_p2_cpu{0};
        std::atomic<long long> total_p1_wall{0}, total_p2_wall{0};

        std::chrono::steady_clock::time_point run_start;
        Sys::CpuMonitor::Times run_start_cpu;

        std::atomic<int> games_completed{0}, games_skipped{0};
        int total_games_expected = 0;

        std::atomic<bool> stop_flag{false};
        std::once_flag finalized_flag;

        std::chrono::steady_clock::time_point last_api_update;
        std::mutex api_mtx;

        std::string p1_name, p1_version, p2_name, p2_version;
        std::mutex name_mtx;
        bool names_set = false;

        bool should_send_update() {
            std::lock_guard<std::mutex> l(api_mtx);
            auto now = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                now - last_api_update
            ).count();
            if (elapsed >= cfg.debounce_ms) {
                last_api_update = now;
                return true;
            }
            return false;
        }
    };

    struct GameParams {
        int pair, leg;
        Core::BotConfig p1_cfg, p2_cfg;
        std::vector<Core::Point> opening;
        std::optional<uint64_t> seed;
        std::shared_ptr<RunContext> context;
        std::string run_id;

        std::function<std::unique_ptr<Sys::Process>(
            const std::string&
        )> process_factory;

        std::unique_ptr<Sys::Process> create_process(const std::string& cmd) const {
            if (process_factory) return process_factory(cmd);
            return nullptr;
        }

        const Core::Config& config() const { return context->cfg; }
    };

    struct EvalJob {
        std::vector<Core::Point> moves;
        int bot_id;
        std::shared_ptr<RunContext> context;
        uint64_t max_nodes;
    };
}
