#pragma once

#include <vector>
#include <deque>
#include <memory>
#include <mutex>
#include <condition_variable>
#include <fstream>
#include "context.h"
#include "../game/referee.h"
#include "../net/api_client.h"

namespace Arena::App {

    struct WorkerState {
        std::deque<EvalJob>& eval_queue;
        std::deque<std::shared_ptr<Game::Referee>>& game_queue;
        std::deque<GameParams>& global_game_queue;
        std::mutex& task_mtx;
        std::condition_variable& task_cv;
        std::atomic<int>& active_games;
        std::shared_ptr<Net::ApiManager> api;
        std::vector<std::shared_ptr<RunContext>>& contexts;
        const Core::BatchConfig& bc;
        std::ofstream& ndjson_out;
        std::mutex& ndjson_mtx;
    };

    void interleaved_worker_loop(const Core::Config& cfg, WorkerState& ws);

    std::string format_ndjson_line(
        const Core::BatchConfig& bc, const Core::RunSpec& rs, const MatchState& state,
        const Stats::Tracker& stats, double duration, double arena_load,
        double p1_efficiency, double p2_efficiency
    );
}
