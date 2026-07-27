#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>
#include "../core/types.h"
#include "../stats/metrics.h"
#include "../sys/process.h"

namespace Arena::Analysis {

class Evaluator {
public:
    Evaluator(
        const std::string& cmd,
        int board_size,
        int cutoff,
        bool exit_on_crash,
        uint64_t max_nodes,
        std::unique_ptr<Sys::Process> process = nullptr
    );

    bool start();
    bool restart();

    std::optional<Stats::EvalMetrics> eval(
        const std::vector<Core::Point>& moves
    );

    bool set_max_nodes(uint64_t nodes);
    pid_t pid() const { return process_->pid(); }

private:
    bool send_cmd(const std::string& command);

    bool send_board(
        const std::vector<Core::Point>& moves,
        size_t count
    );

    std::optional<Stats::EvalMetrics>
    parse_eval_response();

    std::unique_ptr<Sys::Process> process_;
    std::string cmd_;
    int board_size_;
    int cutoff_;
    bool exit_on_crash_;
    uint64_t max_nodes_;
};

}
