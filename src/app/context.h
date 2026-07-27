#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>
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
    int pairs_done = 0;
    int wins = 0;
    int losses = 0;
    int draws = 0;
};

struct RunContext {
    RunContext() :
        last_api_update(std::chrono::steady_clock::now())
    {}

    std::string id;
    std::string config_label;
    Core::Config cfg;
    Core::RunSpec run_spec;
    Stats::Tracker stats;
    MatchState match_state;

    std::atomic<long long> total_wall_time_ms{0};

    std::chrono::steady_clock::time_point run_start;
    Sys::CpuMonitor::Times run_start_cpu;

    std::atomic<int> games_completed{0};
    std::atomic<int> games_skipped{0};
    std::atomic<int> pending_evaluations{0};
    int total_games_expected = 0;

    std::atomic<bool> stop_flag{false};
    std::atomic<bool> failed{false};
    std::once_flag finalized_flag;

    std::chrono::steady_clock::time_point last_api_update;
    std::mutex api_mtx;

    std::string p1_name;
    std::string p1_version;
    std::string p2_name;
    std::string p2_version;
    std::mutex name_mtx;
    bool names_set = false;

    bool should_send_update() {
        std::lock_guard<std::mutex> lock(api_mtx);
        auto now = std::chrono::steady_clock::now();
        auto elapsed =
            std::chrono::duration_cast<std::chrono::milliseconds>(
                now - last_api_update
            ).count();

        if (elapsed < cfg.debounce_ms) return false;

        last_api_update = now;
        return true;
    }
};

struct GameParams {
    int pair = 0;
    int leg = 0;
    Core::BotConfig p1_cfg;
    Core::BotConfig p2_cfg;
    std::vector<Core::Point> opening;
    std::optional<uint64_t> seed;
    std::shared_ptr<RunContext> context;
    std::string run_id;

    std::function<std::unique_ptr<Sys::Process>(
        const std::string&
    )> process_factory;

    std::unique_ptr<Sys::Process> create_process(
        const std::string& cmd
    ) const {
        if (process_factory) return process_factory(cmd);
        return nullptr;
    }

    const Core::Config& config() const {
        return context->cfg;
    }
};

struct EvalJob {
    std::vector<Core::Point> moves;
    int bot_id = 0;
    std::shared_ptr<RunContext> context;
    uint64_t max_nodes = 0;
};

}
