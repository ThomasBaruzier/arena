#include "tracker.h"
#include <cmath>
#include <iostream>
#include <iomanip>
#include "../core/logger.h"

namespace Arena::Stats {

    void Tracker::update_pair_stats(double p1_score) {
        std::lock_guard<std::mutex> l(mtx);
        if (p1_score > 0.99) p1_pair_wins++;
        else if (p1_score < 0.01) p1_pair_losses++;
        else p1_pair_draws++;
        games++;
        update_elo();
    }

    void Tracker::update_elo() {
        double score = p1_pair_wins + 0.5 * p1_pair_draws;
        double total = p1_pair_wins + p1_pair_losses + p1_pair_draws;
        if (total == 0) {
            p1_elo = Core::Constants::ELO_BASE;
            p2_elo = Core::Constants::ELO_BASE;
            return;
        }
        double ratio = score / total;
        if (ratio <= 0.001) ratio = 0.001;
        if (ratio >= 0.999) ratio = 0.999;

        double elo_diff = -400.0 * std::log10(1.0 / ratio - 1.0);
        p1_elo = Core::Constants::ELO_BASE + (int)(elo_diff / 2.0);
        p2_elo = Core::Constants::ELO_BASE - (int)(elo_diff / 2.0);
    }

    double Tracker::get_p1_z() const {
        double N = p1_pair_wins + p1_pair_losses + p1_pair_draws;
        if (N == 0) return 0.0;
        double score = p1_pair_wins + 0.5 * p1_pair_draws;
        double mu = 0.5 * N;
        double sigma = 0.5 * std::sqrt(N);
        return (score - mu) / sigma;
    }

    double Tracker::get_p2_z() const {
        return -get_p1_z();
    }

    double Tracker::get_p1_erf() const {
        return 0.5 * std::erfc(-get_p1_z() / std::sqrt(2.0)) * 100.0;
    }

    double Tracker::get_p2_erf() const {
        return 0.5 * std::erfc(-get_p2_z() / std::sqrt(2.0)) * 100.0;
    }

    void Tracker::add_metrics(int player, double regret, double sharpness) {
        std::lock_guard<std::mutex> l(mtx);
        if (player == 1) {
            p1_moves_analyzed++;
            if (regret > Core::Constants::METRIC_SEVERE_ERROR_REGRET)
                p1_severe_errors++;
            if (sharpness > Core::Constants::METRIC_CRITICAL_SHARPNESS) {
                p1_critical_total++;
                if (regret < Core::Constants::METRIC_CRITICAL_SUCCESS_REGRET)
                    p1_critical_success++;
            }
        } else {
            p2_moves_analyzed++;
            if (regret > Core::Constants::METRIC_SEVERE_ERROR_REGRET)
                p2_severe_errors++;
            if (sharpness > Core::Constants::METRIC_CRITICAL_SHARPNESS) {
                p2_critical_total++;
                if (regret < Core::Constants::METRIC_CRITICAL_SUCCESS_REGRET)
                    p2_critical_success++;
            }
        }
    }

    void Tracker::add_crash(int player) {
        crashes++;
        if (player == 1) p1_crashes++;
        else p2_crashes++;
    }

    double Tracker::calc_severe(int severe, int total) {
        if (total == 0) return 0.0;
        return 100.0 * (double)severe / total;
    }

    double Tracker::calc_cma(int success, int total) {
        if (total == 0) return 0.0;
        return 100.0 * (double)success / total;
    }

    double Tracker::get_p1_cma() const { return calc_cma(p1_critical_success, p1_critical_total); }
    double Tracker::get_p2_cma() const { return calc_cma(p2_critical_success, p2_critical_total); }
    double Tracker::get_p1_blunder() const { return calc_severe(p1_severe_errors, p1_moves_analyzed); }
    double Tracker::get_p2_blunder() const { return calc_severe(p2_severe_errors, p2_moves_analyzed); }

    void Tracker::print() const {
        std::lock_guard<std::mutex> l(mtx);

        std::stringstream ss;
        ss << "Run Finished | Elo: " << p1_elo << "-" << p2_elo
           << " | P1 -> +" << p1_pair_wins
           << " -" << p1_pair_losses
           << " =" << p1_pair_draws
           << " (Tot:" << (p1_pair_wins + p1_pair_losses + p1_pair_draws) << ")";

        if (p1_moves_analyzed > 0 || p2_moves_analyzed > 0) {
            ss << " | CMA: " << std::fixed << std::setprecision(1) << get_p1_cma() << "%"
               << " vs " << get_p2_cma() << "%"
               << " Bln: " << get_p1_blunder() << "%"
               << " vs " << get_p2_blunder() << "%";
        }

        ss << " | Z:" << std::fixed << std::setprecision(2) << get_p1_z()
           << " ERF:" << std::setprecision(1) << get_p1_erf() << "%"
           << " | Time: " << (p1_total_time_ms / 1000) << "s vs " << (p2_total_time_ms / 1000) << "s"
           << " | Crashes: " << p1_crashes.load() << "-" << p2_crashes.load();

        Core::Logger::log(Core::Logger::Level::INFO, ss.str());
    }
}
