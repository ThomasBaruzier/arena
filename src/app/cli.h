#pragma once

#include <deque>
#include <memory>
#include <optional>
#include <string>
#include <vector>
#include "../core/config_types.h"
#include "../core/types.h"
#include "context.h"

namespace Arena::App {

class CLI {
public:
    static Core::BatchConfig parse_batch_args(
        int argc,
        char* argv[]
    );

    static std::vector<Core::RunSpec>
    expand_batch(
        const Core::BatchConfig& batch
    );

    static Core::Config build_config(
        const Core::BatchConfig& batch,
        const Core::RunSpec& run
    );

    static std::string generate_config_label(
        const Core::Config& config
    );

    static std::deque<GameParams>
    create_pending_games(
        const Core::Config& config,
        const std::vector<
            std::vector<Core::Point>
        >& openings,
        std::optional<uint64_t> seed,
        std::shared_ptr<RunContext> context,
        const std::string& run_id
    );
};

}
