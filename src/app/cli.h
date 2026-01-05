#pragma once

#include <vector>
#include <deque>
#include <memory>
#include "../core/config_types.h"
#include "../core/types.h"
#include "context.h"

namespace Arena::App {

    class CLI {
    public:
        static Core::BatchConfig parse_batch_args(int argc, char* argv[]);
        static std::vector<Core::RunSpec> expand_batch(const Core::BatchConfig& bc);
        static Core::Config build_config(
            const Core::BatchConfig& bc, const Core::RunSpec& rs
        );

        static std::string generate_config_label(const Core::Config& cfg);

        static std::deque<GameParams> create_pending_games(
            const Core::Config& cfg,
            const std::vector<std::vector<Core::Point>>& ops,
            std::optional<uint64_t> seed,
            std::shared_ptr<RunContext> context,
            const std::string& run_id
        );
    };
}
