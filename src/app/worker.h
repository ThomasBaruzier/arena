#pragma once

#include <atomic>
#include <condition_variable>
#include <deque>
#include <fstream>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
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

double slot1_pair_score(
    double first_leg_black_score,
    double second_leg_black_score
);

bool record_completed_pair(
    MatchState& state,
    Stats::Tracker& stats,
    double first_leg_black_score,
    double second_leg_black_score
);

bool run_ready_to_finalize(
    const RunContext& context
);

std::string run_status(
    const RunContext& context,
    bool finalized,
    bool incomplete = false
);

void interleaved_worker_loop(
    const Core::Config& config,
    WorkerState& state
);

void finalize_all_runs(
    WorkerState& state
);

std::string format_ndjson_line(
    const Core::BatchConfig& batch,
    const Core::RunSpec& run,
    const MatchState& state,
    const Stats::Tracker& stats,
    double duration,
    const std::string& status
);

}
