#pragma once

#include <atomic>
#include <mutex>
#include "../core/constants.h"

namespace Arena::Stats {

    struct Tracker {
        int p1_elo = Core::Constants::ELO_BASE;
        int p2_elo = Core::Constants::ELO_BASE;

        std::atomic<long long> p1_total_time_ms{0};
        std::atomic<long long> p2_total_time_ms{0};

        int p1_pair_wins = 0;
        int p1_pair_losses = 0;
        int p1_pair_draws = 0;

        int p1_severe_errors = 0;
        int p1_moves_analyzed = 0;
        int p2_severe_errors = 0;
        int p2_moves_analyzed = 0;

        int p1_critical_success = 0;
        int p1_critical_total = 0;
        int p2_critical_success = 0;
        int p2_critical_total = 0;

        std::atomic<int> games = 0;
        std::atomic<int> crashes = 0;
        std::atomic<int> p1_crashes = 0;
        std::atomic<int> p2_crashes = 0;
        mutable std::mutex mtx;

        void update_elo();
        void update_pair_stats(double p1_score);
        void add_metrics(int player, double regret, double sharpness);
        void add_crash(int player);
        void print() const;

        static double calc_severe(int severe, int total);
        static double calc_cma(int success, int total);
        double get_p1_erf() const;
        double get_p2_erf() const;
        double get_p1_z() const;
        double get_p2_z() const;
        double get_p1_cma() const;
        double get_p2_cma() const;
        double get_p1_blunder() const;
        double get_p2_blunder() const;
    };
}
