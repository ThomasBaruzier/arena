#pragma once

#include <atomic>
#include <mutex>
#include "../core/constants.h"

namespace Arena::Stats {

    struct Tracker {
        int p1_elo = Core::Constants::ELO_BASE;
        int p2_elo = Core::Constants::ELO_BASE;

        double p1_sum_weighted_sq_err = 0;
        double p1_sum_weights = 0;
        double p2_sum_weighted_sq_err = 0;
        double p2_sum_weights = 0;

        int p1_critical_total = 0;
        int p1_critical_success = 0;
        int p2_critical_total = 0;
        int p2_critical_success = 0;

        int p1_severe_errors = 0;
        int p1_moves_analyzed = 0;
        int p2_severe_errors = 0;
        int p2_moves_analyzed = 0;

        std::atomic<int> games = 0;
        std::atomic<int> crashes = 0;
        std::atomic<int> p1_crashes = 0;
        std::atomic<int> p2_crashes = 0;
        mutable std::mutex mtx;

        void update_elo(double score);
        void add_metrics(int player, double regret, double sharpness);
        void add_crash(int player);
        void print() const;

        static double calc_dqi(double sum_w_sq, double sum_w);
        static double calc_cma(int success, int total);
        static double calc_severe(int severe, int total);
    };
}
