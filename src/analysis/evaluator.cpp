#include "evaluator.h"
#include "../core/constants.h"
#include "../core/logger.h"
#include "../sys/signals.h"
#include <regex>
#include <sstream>

namespace Arena::Analysis {

Evaluator::Evaluator(
    const std::string& cmd, int sz, int cutoff,
    bool exit_on_crash, uint64_t max_nodes,
    std::unique_ptr<Sys::Process> proc
) :
    proc_(std::move(proc)),
    cmd_(cmd),
    sz_(sz),
    cutoff_(cutoff),
    exit_on_crash_(exit_on_crash),
    max_nodes_(max_nodes)
{
    if (!proc_) proc_ = std::make_unique<Sys::Process>(cmd);
}

bool Evaluator::start() {
    if (!proc_->start(0)) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "Evaluator: failed to start process"
        );
        return false;
    }

    send_cmd("START " + std::to_string(sz_));
    long ign;
    auto r = proc_->read_line(cutoff_, &ign);

    if (!r || r->find("OK") == std::string::npos) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "Evaluator: START failed, got: ", r.value_or("(timeout)")
        );
        return false;
    }

    send_cmd("INFO timeout_turn 0");
    send_cmd("INFO timeout_match 0");
    send_cmd("INFO THREAD_NUM " +
        std::to_string(Core::Constants::PROTOCOL_THREAD_NUM));
    send_cmd("INFO MAX_NODE " + std::to_string(max_nodes_));
    return true;
}

void Evaluator::restart() {
    proc_->terminate();
    start();
}

void Evaluator::set_max_nodes(uint64_t nodes) {
    if (nodes != max_nodes_) {
        send_cmd("INFO MAX_NODE " + std::to_string(nodes));
        max_nodes_ = nodes;
    }
}

Stats::EvalMetrics Evaluator::eval(
    const std::vector<Core::Point>& moves)
{
    try {
        if (moves.empty()) return {};
        send_board(moves, moves.size() - 1);
        auto& last = moves.back();
        send_cmd(
            "ANALYZE_MOVE " + std::to_string(last.x) +
            "," + std::to_string(last.y)
        );
        return parse_eval_response();
    } catch (const Core::MatchTerminated&) {
        throw;
    } catch (const std::exception& e) {
        Core::Logger::log(
            Core::Logger::Level::WARN,
            "Evaluator failed on move ",
            moves.size(), ": ", e.what()
        );
        if (exit_on_crash_) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "STRICT MODE: Exiting due to evaluator error: ", e.what()
            );
            Sys::g_stop_flag = 1;
            throw Core::MatchTerminated();
        }
        restart();
        return {};
    }
}

void Evaluator::send_cmd(const std::string& cmd) {
    if (debug_) {
        Core::Logger::log(
            Core::Logger::Level::DEBUG, "-> EVAL: ", cmd
        );
    }
    proc_->write_line(cmd);
}

void Evaluator::send_board(
    const std::vector<Core::Point>& moves, size_t count)
{
    send_cmd("YXBOARD");
    for (size_t i = 0; i < count; ++i) {
        std::stringstream ss;
        ss << moves[i].x << "," << moves[i].y
           << "," << ((i % 2 == 0) ? 1 : 2);
        send_cmd(ss.str());
    }
    send_cmd("DONE");
}

Stats::EvalMetrics Evaluator::parse_eval_response() {
    static const std::regex eval_re(R"(EVAL_DATA\s+(\S+)\s+(\S+)\s+(\S+))");
    std::smatch m;

    while (auto l = proc_->read_line(cutoff_, nullptr)) {
        if (debug_)
            Core::Logger::log(Core::Logger::Level::DEBUG, "<- EVAL: ", *l);
        if (std::regex_search(*l, m, eval_re)) {
            Stats::EvalMetrics res;
            res.p_best = std::stod(m[1]);
            res.p_second = std::stod(m[2]);
            res.p_played = std::stod(m[3]);
            return res;
        }
    }
    return {};
}

}
