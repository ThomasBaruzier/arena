#pragma once

#include <cmath>
#include "../app/context.h"
#include "../core/config_types.h"

namespace Arena::Stats {

    class SPRT {
    public:
        static bool check(const App::MatchState& state, const Core::Config& cfg) {
            if (state.pairs_done < cfg.min_pairs) return false;
            double N = cfg.max_pairs;
            double mu = 0.5 * N;
            double sigma = 0.5 * sqrt(N);
            double s1 = state.wins + 0.5 * state.draws;
            double s2 = state.losses + 0.5 * state.draws;
            double rem = N - state.pairs_done;

            auto z_test = [&](double s) {
                return 0.5 * erfc(((s - mu) / sigma) / sqrt(2.0));
            };

            if (s1 > mu && z_test(s1) < cfg.risk) return true;
            if (s2 > mu && z_test(s2) < cfg.risk) return true;
            if (s1 + rem < mu + 1e-9 && z_test(s1 + rem) > cfg.risk) return true;
            return false;
        }
    };
}
