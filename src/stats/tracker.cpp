#include "tracker.h"
#include <cmath>
#include <iostream>
#include <iomanip>
#include "../core/logger.h"

namespace Arena::Stats {

    void Tracker::update_elo(double score) {
        std::lock_guard<std::mutex> l(mtx);
        double exp = 1.0 /
            (1.0 + pow(10, (p2_elo - p1_elo) / Core::Constants::ELO_DIVISOR)
        );
        int delta = (int)(Core::Constants::ELO_K_FACTOR * (score - exp));

        p1_elo += delta;
        p2_elo -= delta;
        games++;
    }

    void Tracker::add_metrics(int player, double regret, double sharpness) {
        std::lock_guard<std::mutex> l(mtx);
        double weight = 1.0 +
            Core::Constants::METRIC_WEIGHT_SHARPNESS_FACTOR * sharpness * sharpness;

        if (player == 1) {
            p1_sum_weighted_sq_err += weight * regret * regret;
            p1_sum_weights += weight;
            p1_moves_analyzed++;

            if (sharpness > Core::Constants::METRIC_CRITICAL_SHARPNESS) {
                p1_critical_total++;
                if (regret < Core::Constants::METRIC_CRITICAL_SUCCESS_REGRET) {
                    p1_critical_success++;
                }
            }
            if (regret > Core::Constants::METRIC_SEVERE_ERROR_REGRET) {
                p1_severe_errors++;
            }
        } else {
            p2_sum_weighted_sq_err += weight * regret * regret;
            p2_sum_weights += weight;
            p2_moves_analyzed++;

            if (sharpness > Core::Constants::METRIC_CRITICAL_SHARPNESS) {
                p2_critical_total++;
                if (regret < Core::Constants::METRIC_CRITICAL_SUCCESS_REGRET) {
                    p2_critical_success++;
                }
            }
            if (regret > Core::Constants::METRIC_SEVERE_ERROR_REGRET) {
                p2_severe_errors++;
            }
        }
    }

    void Tracker::add_crash(int player) {
        crashes++;
        if (player == 1) p1_crashes++;
        else p2_crashes++;
    }

    double Tracker::calc_dqi(double sum_w_sq, double sum_w) {
        if (sum_w == 0) return 0.0;
        double rmse = std::sqrt(sum_w_sq / sum_w);
        return 100.0 * (1.0 - rmse);
    }

    double Tracker::calc_cma(int success, int total) {
        if (total == 0) return 0.0;
        return 100.0 * (double)success / total;
    }

    double Tracker::calc_severe(int severe, int total) {
        if (total == 0) return 0.0;
        return 100.0 * (double)severe / total;
    }

    void Tracker::print() const {
        std::lock_guard<std::mutex> l(mtx);

        Core::Logger::log(
            Core::Logger::Level::INFO, "P1 Final: Elo=", p1_elo,
            " | SW-DQI=", std::fixed, std::setprecision(1),
            calc_dqi(p1_sum_weighted_sq_err, p1_sum_weights),
            " | CMA=", calc_cma(p1_critical_success, p1_critical_total), "%",
            " | Blunder=", calc_severe(p1_severe_errors, p1_moves_analyzed), "%",
            " | Crashes=", p1_crashes.load()
        );

        Core::Logger::log(
            Core::Logger::Level::INFO, "P2 Final: Elo=", p2_elo,
            " | SW-DQI=", std::fixed, std::setprecision(1),
            calc_dqi(p2_sum_weighted_sq_err, p2_sum_weights),
            " | CMA=", calc_cma(p2_critical_success, p2_critical_total), "%",
            " | Blunder=", calc_severe(p2_severe_errors, p2_moves_analyzed), "%",
            " | Crashes=", p2_crashes.load()
        );
    }
}
