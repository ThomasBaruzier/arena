#pragma once

#include <string>
#include <vector>
#include <optional>
#include <cstdint>
#include <memory>
#include "../sys/process.h"
#include "../core/types.h"
#include "../stats/metrics.h"

namespace Arena::Analysis {
    class Evaluator {
    public:
        Evaluator(
            const std::string& cmd, int sz, int cutoff,
            bool exit_on_crash, uint64_t max_nodes,
            std::unique_ptr<Sys::Process> proc = nullptr
        );
        bool start();
        void restart();
        Stats::EvalMetrics eval(const std::vector<Core::Point>& moves);
        void set_max_nodes(uint64_t nodes);
        void set_debug(bool d) { debug_ = d; }
        pid_t pid() const { return proc_->pid(); }

    friend class EvaluatorTest;

    private:
        void send_cmd(const std::string& cmd);
        void send_board(const std::vector<Core::Point>& moves, size_t count);
        Stats::EvalMetrics parse_eval_response();

        std::unique_ptr<Sys::Process> proc_;
        std::string cmd_;
        int sz_;
        int cutoff_;
        bool exit_on_crash_;
        uint64_t max_nodes_;
        bool debug_ = false;
    };
}
