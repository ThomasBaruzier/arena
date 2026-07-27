#include "evaluator.h"
#include "../core/constants.h"
#include "../core/logger.h"
#include "../core/utils.h"
#include "../sys/signals.h"
#include <cmath>
#include <regex>
#include <sstream>
#include <stdexcept>

namespace {

std::optional<double> parse_probability(
    const std::string& text
) {
    try {
        size_t consumed = 0;
        double value = std::stod(text, &consumed);

        if (
            consumed != text.size() ||
            !std::isfinite(value) ||
            value < 0.0 ||
            value > 1.0
        ) {
            return std::nullopt;
        }

        return value;
    } catch (...) {
        return std::nullopt;
    }
}

bool is_ok_response(const std::string& response) {
    return response == "OK" ||
        response.rfind("OK ", 0) == 0;
}

}

namespace Arena::Analysis {

Evaluator::Evaluator(
    const std::string& cmd,
    int board_size,
    int cutoff,
    bool exit_on_crash,
    uint64_t max_nodes,
    std::unique_ptr<Sys::Process> process
) :
    process_(std::move(process)),
    cmd_(cmd),
    board_size_(board_size),
    cutoff_(cutoff),
    exit_on_crash_(exit_on_crash),
    max_nodes_(max_nodes)
{
    if (!process_) {
        process_ = std::make_unique<Sys::Process>(cmd_);
    }
}

bool Evaluator::start() {
    try {
        if (!process_->start(0)) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "Evaluator: failed to start process"
            );
            return false;
        }

        if (
            !send_cmd(
                "START " +
                std::to_string(board_size_)
            )
        ) {
            process_->terminate();
            return false;
        }

        long elapsed = 0;
        auto response =
            process_->read_line(cutoff_, &elapsed);

        if (
            !response ||
            !is_ok_response(*response)
        ) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "Evaluator: START failed, got: ",
                response.value_or("(timeout)")
            );
            process_->terminate();
            return false;
        }

        if (
            !send_cmd("INFO timeout_turn 0") ||
            !send_cmd("INFO timeout_match 0") ||
            !send_cmd(
                "INFO THREAD_NUM " +
                std::to_string(
                    Core::Constants::PROTOCOL_THREAD_NUM
                )
            ) ||
            !send_cmd(
                "INFO MAX_NODE " +
                std::to_string(max_nodes_)
            )
        ) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "Evaluator: initialization write failed"
            );
            process_->terminate();
            return false;
        }

        return true;
    } catch (const Core::MatchTerminated&) {
        throw;
    } catch (const std::exception& error) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "Evaluator: startup failed: ",
            error.what()
        );
        process_->terminate();
        return false;
    }
}

bool Evaluator::restart() {
    process_->terminate();
    return start();
}

bool Evaluator::set_max_nodes(uint64_t nodes) {
    if (nodes == max_nodes_) return true;

    if (
        !send_cmd(
            "INFO MAX_NODE " +
            std::to_string(nodes)
        )
    ) {
        return false;
    }

    max_nodes_ = nodes;
    return true;
}

std::optional<Stats::EvalMetrics> Evaluator::eval(
    const std::vector<Core::Point>& moves
) {
    if (moves.empty()) return std::nullopt;

    try {
        if (!send_board(moves, moves.size() - 1)) {
            throw std::runtime_error(
                "failed to send board"
            );
        }

        const auto& last = moves.back();

        if (
            !send_cmd(
                "ANALYZE_MOVE " +
                std::to_string(last.x) +
                "," +
                std::to_string(last.y)
            )
        ) {
            throw std::runtime_error(
                "failed to request analysis"
            );
        }

        auto result = parse_eval_response();

        if (!result) {
            throw std::runtime_error(
                "invalid or timed out response"
            );
        }

        return result;
    } catch (const Core::MatchTerminated&) {
        throw;
    } catch (const std::exception& error) {
        Core::Logger::log(
            Core::Logger::Level::WARN,
            "Evaluator failed on move ",
            moves.size(),
            ": ",
            error.what()
        );

        if (exit_on_crash_) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "STRICT MODE: Exiting due to evaluator error: ",
                error.what()
            );
            Sys::g_stop_flag = 1;
            throw Core::MatchTerminated();
        }

        if (!restart()) {
            Core::Logger::log(
                Core::Logger::Level::ERROR,
                "Evaluator: restart failed"
            );
        }

        return std::nullopt;
    }
}

bool Evaluator::send_cmd(
    const std::string& command
) {
    if (Core::Logger::is_debug()) {
        Core::Logger::log(
            Core::Logger::Level::DEBUG,
            "-> EVAL (",
            command.size(),
            "B): ",
            Core::Utils::truncate(command)
        );
    }

    return process_->write_line(command);
}

bool Evaluator::send_board(
    const std::vector<Core::Point>& moves,
    size_t count
) {
    if (!send_cmd("YXBOARD")) return false;

    for (size_t i = 0; i < count; ++i) {
        std::stringstream line;
        line << moves[i].x
             << ","
             << moves[i].y
             << ","
             << ((i % 2 == 0) ? 1 : 2);

        if (!send_cmd(line.str())) return false;
    }

    return send_cmd("DONE");
}

std::optional<Stats::EvalMetrics>
Evaluator::parse_eval_response() {
    static const std::regex pattern(
        R"(^\s*EVAL_DATA\s+(\S+)\s+(\S+)\s+(\S+)\s*$)"
    );

    while (
        auto line =
            process_->read_line(cutoff_, nullptr)
    ) {
        if (Core::Logger::is_debug()) {
            Core::Logger::log(
                Core::Logger::Level::DEBUG,
                "<- EVAL (",
                line->size(),
                "B): ",
                Core::Utils::truncate(*line)
            );
        }

        std::smatch match;

        if (!std::regex_match(*line, match, pattern)) {
            if (line->find("EVAL_DATA") != std::string::npos) {
                return std::nullopt;
            }

            continue;
        }

        auto best = parse_probability(match[1].str());
        auto second = parse_probability(match[2].str());
        auto played = parse_probability(match[3].str());

        if (!best || !second || !played) {
            return std::nullopt;
        }

        return Stats::EvalMetrics{
            *best,
            *second,
            *played
        };
    }

    return std::nullopt;
}

}
