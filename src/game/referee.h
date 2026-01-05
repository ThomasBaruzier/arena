#pragma once

#include <vector>
#include <memory>
#include <functional>
#include <chrono>
#include "player.h"
#include "../app/context.h"
#include "../net/api_client.h"

namespace Arena::Game {

    using ResultCallback = std::function<
        void(
            int pair, int leg, double p1_score,
            long wall_ms, long p1_cpu, long p2_cpu
        )
    >;

    class Referee : public std::enable_shared_from_this<Referee> {
    public:
        enum class Status { RUNNING, FINISHED };

        Referee(
            App::GameParams p, std::shared_ptr<Net::ApiManager> api,
            Stats::Tracker& st, ResultCallback cb
        );
        ~Referee();

        Status step(std::vector<Core::Point>& out_history);
        int get_opening_size() const {
            return static_cast<int>(p_.opening.size());
        }
        int get_last_mover_bot_id() const;
        const App::GameParams& params() const { return p_; }

    private:
        enum class State { UNINITIALIZED, INITIALIZED };

        Core::PlayerColor current_player() const;
        void initialize_game(std::vector<Core::Point>& out_history);
        void send_run_start_event_if_needed(std::shared_ptr<App::RunContext> ctx);
        Net::ApiManager::Event create_event(const std::string& type);
        void send_start_event();
        void init_player(Player& p, Core::BotConfig& cfg);
        void apply_opening_moves();
        void validate_opening_move(const Core::Point& m);
        void send_move_event(const Core::Point& m, int color);
        bool play_turn(std::vector<Core::Point>& out_history);
        void send_turn_command(Player* cp);
        void send_board_state(Player* cp);
        Core::Point parse_and_validate_move(const std::string& r);
        void apply_move(const Core::Point& m);
        void finish(double res);
        void send_result_event(double res);
        void print_board();

        std::chrono::steady_clock::time_point wall_start_;
        App::GameParams p_;
        std::shared_ptr<Net::ApiManager> api_;
        Stats::Tracker& stats_;
        ResultCallback cb_;
        Player pl1_, pl2_;
        std::vector<int> board_;
        std::vector<Core::Point> hist_;
        int moves_ = 0;
        int time_p1_ = 0, time_p2_ = 0;
        long p1_cpu_ms_ = 0, p2_cpu_ms_ = 0;
        State state_ = State::UNINITIALIZED;
        bool start_sent_ = false;
        bool result_sent_ = false;
    };
}
