#pragma once

#include <algorithm>
#include <cmath>
#include "../app/context.h"
#include "../core/config_types.h"

namespace Arena::Stats {

class SPRT {
public:
    static bool check(
        const App::MatchState& state,
        const Core::Config& config
    ) {
        if (
            config.risk <= 0.0 ||
            state.pairs_done < config.min_pairs ||
            config.max_pairs <= 0
        ) {
            return false;
        }

        double total = static_cast<double>(config.max_pairs);
        double midpoint = 0.5 * total;
        double deviation = 0.5 * std::sqrt(total);
        double first_score = state.wins + 0.5 * state.draws;
        double second_score = state.losses + 0.5 * state.draws;
        double remaining = std::max(
            0.0,
            total - state.pairs_done
        );

        auto upper_tail = [midpoint, deviation](double score) {
            double z = (score - midpoint) / deviation;
            return 0.5 * std::erfc(z / std::sqrt(2.0));
        };

        auto significant = [&](double score) {
            return score > midpoint && upper_tail(score) < config.risk;
        };

        if (
            significant(first_score) ||
            significant(second_score)
        ) {
            return true;
        }

        auto cannot_reach_midpoint = [&](double score) {
            double best_possible = score + remaining;

            return
                best_possible + 1e-9 < midpoint &&
                upper_tail(best_possible) > config.risk;
        };

        return
            cannot_reach_midpoint(first_score) ||
            cannot_reach_midpoint(second_score);
    }
};

}
