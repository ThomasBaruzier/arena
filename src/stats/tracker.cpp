#include "tracker.h"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include "../core/logger.h"

namespace Arena::Stats {

PairOutcome Tracker::classify_pair_score(
    double p1_score
) {
    if (p1_score > 0.5) {
        return PairOutcome::WIN;
    }

    if (p1_score < 0.5) {
        return PairOutcome::LOSS;
    }

    return PairOutcome::DRAW;
}

PairOutcome Tracker::update_pair_stats(
    double p1_score
) {
    std::lock_guard<std::mutex> lock(mtx);
    PairOutcome outcome =
        classify_pair_score(p1_score);

    if (outcome == PairOutcome::WIN) {
        p1_pair_wins++;
    } else if (
        outcome == PairOutcome::LOSS
    ) {
        p1_pair_losses++;
    } else {
        p1_pair_draws++;
    }

    games++;
    update_elo();
    return outcome;
}

void Tracker::update_elo() {
    double score =
        p1_pair_wins +
        0.5 * p1_pair_draws;
    double total =
        p1_pair_wins +
        p1_pair_losses +
        p1_pair_draws;

    if (total == 0) {
        p1_elo = Core::Constants::ELO_BASE;
        p2_elo = Core::Constants::ELO_BASE;
        return;
    }

    double ratio = score / total;
    ratio = std::max(0.001, ratio);
    ratio = std::min(0.999, ratio);

    double elo_diff =
        -400.0 *
        std::log10(
            1.0 / ratio - 1.0
        );

    p1_elo =
        Core::Constants::ELO_BASE +
        static_cast<int>(elo_diff / 2.0);
    p2_elo =
        Core::Constants::ELO_BASE -
        static_cast<int>(elo_diff / 2.0);
}

double Tracker::get_p1_z() const {
    double count =
        p1_pair_wins +
        p1_pair_losses +
        p1_pair_draws;

    if (count == 0) return 0.0;

    double score =
        p1_pair_wins +
        0.5 * p1_pair_draws;
    double mean = 0.5 * count;
    double deviation =
        0.5 * std::sqrt(count);

    return (score - mean) / deviation;
}

double Tracker::get_p2_z() const {
    return -get_p1_z();
}

double Tracker::get_p1_erf() const {
    return
        0.5 *
        std::erfc(
            -get_p1_z() /
            std::sqrt(2.0)
        ) *
        100.0;
}

double Tracker::get_p2_erf() const {
    return
        0.5 *
        std::erfc(
            -get_p2_z() /
            std::sqrt(2.0)
        ) *
        100.0;
}

void Tracker::add_metrics(
    int player,
    double regret,
    double sharpness
) {
    std::lock_guard<std::mutex> lock(mtx);

    if (player == 1) {
        p1_moves_analyzed++;

        if (
            regret >
            Core::Constants::
                METRIC_SEVERE_ERROR_REGRET
        ) {
            p1_severe_errors++;
        }

        if (
            sharpness >
            Core::Constants::
                METRIC_CRITICAL_SHARPNESS
        ) {
            p1_critical_total++;

            if (
                regret <
                Core::Constants::
                    METRIC_CRITICAL_SUCCESS_REGRET
            ) {
                p1_critical_success++;
            }
        }

        return;
    }

    p2_moves_analyzed++;

    if (
        regret >
        Core::Constants::
            METRIC_SEVERE_ERROR_REGRET
    ) {
        p2_severe_errors++;
    }

    if (
        sharpness >
        Core::Constants::
            METRIC_CRITICAL_SHARPNESS
    ) {
        p2_critical_total++;

        if (
            regret <
            Core::Constants::
                METRIC_CRITICAL_SUCCESS_REGRET
        ) {
            p2_critical_success++;
        }
    }
}

void Tracker::add_crash(int player) {
    crashes++;

    if (player == 1) {
        p1_crashes++;
    } else {
        p2_crashes++;
    }
}

void Tracker::add_timing(
    int player,
    long long wall_ms,
    long long cpu_ms,
    bool cpu_valid
) {
    long long safe_wall =
        std::max(0LL, wall_ms);

    bool measured =
        cpu_valid &&
        wall_ms > 0 &&
        cpu_ms >= 0;

    if (player == 1) {
        p1_total_time_ms.fetch_add(
            safe_wall
        );

        if (measured) {
            p1_cpu_time_ms.fetch_add(
                cpu_ms
            );
            p1_cpu_wall_time_ms.fetch_add(
                safe_wall
            );
        }

        return;
    }

    p2_total_time_ms.fetch_add(
        safe_wall
    );

    if (measured) {
        p2_cpu_time_ms.fetch_add(
            cpu_ms
        );
        p2_cpu_wall_time_ms.fetch_add(
            safe_wall
        );
    }
}

double Tracker::calc_severe(
    int severe,
    int total
) {
    if (total == 0) return 0.0;

    return
        100.0 *
        static_cast<double>(severe) /
        total;
}

double Tracker::calc_cma(
    int success,
    int total
) {
    if (total == 0) return 0.0;

    return
        100.0 *
        static_cast<double>(success) /
        total;
}

std::optional<double>
Tracker::calc_efficiency(
    long long cpu_ms,
    long long wall_ms
) {
    if (wall_ms <= 0) {
        return std::nullopt;
    }

    return
        100.0 *
        static_cast<double>(cpu_ms) /
        static_cast<double>(wall_ms);
}

double Tracker::get_p1_cma() const {
    return calc_cma(
        p1_critical_success,
        p1_critical_total
    );
}

double Tracker::get_p2_cma() const {
    return calc_cma(
        p2_critical_success,
        p2_critical_total
    );
}

double Tracker::get_p1_blunder() const {
    return calc_severe(
        p1_severe_errors,
        p1_moves_analyzed
    );
}

double Tracker::get_p2_blunder() const {
    return calc_severe(
        p2_severe_errors,
        p2_moves_analyzed
    );
}

std::optional<double>
Tracker::get_p1_cma_optional() const {
    if (p1_critical_total <= 0) {
        return std::nullopt;
    }

    return get_p1_cma();
}

std::optional<double>
Tracker::get_p2_cma_optional() const {
    if (p2_critical_total <= 0) {
        return std::nullopt;
    }

    return get_p2_cma();
}

std::optional<double>
Tracker::get_p1_blunder_optional() const {
    if (p1_moves_analyzed <= 0) {
        return std::nullopt;
    }

    return get_p1_blunder();
}

std::optional<double>
Tracker::get_p2_blunder_optional() const {
    if (p2_moves_analyzed <= 0) {
        return std::nullopt;
    }

    return get_p2_blunder();
}

std::optional<double>
Tracker::get_p1_eff() const {
    return calc_efficiency(
        p1_cpu_time_ms.load(),
        p1_cpu_wall_time_ms.load()
    );
}

std::optional<double>
Tracker::get_p2_eff() const {
    return calc_efficiency(
        p2_cpu_time_ms.load(),
        p2_cpu_wall_time_ms.load()
    );
}

void Tracker::print() const {
    std::lock_guard<std::mutex> lock(mtx);

    std::stringstream output;

    output
        << "Run Finished | Elo: "
        << p1_elo
        << "-"
        << p2_elo
        << " | P1 -> +"
        << p1_pair_wins
        << " -"
        << p1_pair_losses
        << " ="
        << p1_pair_draws
        << " (Tot:"
        << (
            p1_pair_wins +
            p1_pair_losses +
            p1_pair_draws
        )
        << ")";

    auto append_percent = [&output](
        const std::optional<double>& value
    ) {
        if (value) {
            output
                << std::fixed
                << std::setprecision(1)
                << *value
                << "%";
        } else {
            output << "-";
        }
    };

    auto p1_cma = get_p1_cma_optional();
    auto p2_cma = get_p2_cma_optional();

    if (p1_cma || p2_cma) {
        output << " | CMA: ";
        append_percent(p1_cma);
        output << " vs ";
        append_percent(p2_cma);
    }

    auto p1_blunder =
        get_p1_blunder_optional();
    auto p2_blunder =
        get_p2_blunder_optional();

    if (p1_blunder || p2_blunder) {
        output << " | Bln: ";
        append_percent(p1_blunder);
        output << " vs ";
        append_percent(p2_blunder);
    }

    output
        << " | Z:"
        << std::fixed
        << std::setprecision(2)
        << get_p1_z()
        << " ERF:"
        << std::setprecision(1)
        << get_p1_erf()
        << "%"
        << " | Time: "
        << p1_total_time_ms.load() / 1000
        << "s vs "
        << p2_total_time_ms.load() / 1000
        << "s";

    auto p1_eff = get_p1_eff();
    auto p2_eff = get_p2_eff();

    if (p1_eff || p2_eff) {
        output << " | Eff: ";

        if (p1_eff) {
            output
                << std::fixed
                << std::setprecision(1)
                << *p1_eff
                << "%";
        } else {
            output << "-";
        }

        output << " vs ";

        if (p2_eff) {
            output
                << std::fixed
                << std::setprecision(1)
                << *p2_eff
                << "%";
        } else {
            output << "-";
        }
    }

    output
        << " | Crashes: "
        << p1_crashes.load()
        << "-"
        << p2_crashes.load();

    Core::Logger::log(
        Core::Logger::Level::INFO,
        output.str()
    );
}

}
