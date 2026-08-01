#pragma once

#include <chrono>
#include <functional>
#include <memory>
#include <string>
#include <vector>
#include "player.h"
#include "../app/context.h"
#include "../net/api_client.h"

namespace Arena::Game {

using ResultCallback = std::function<
    void(
        int pair,
        int leg,
        double p1_score,
        long wall_ms
    )
>;

class Referee {
public:
    enum class Status {
        RUNNING,
        FINISHED
    };

    Referee(
        App::GameParams params,
        std::shared_ptr<Net::ApiManager> api,
        Stats::Tracker& stats,
        ResultCallback callback
    );

    ~Referee();

    Status step(
        std::vector<Core::Point>& out_history
    );

    int get_opening_size() const {
        return static_cast<int>(
            p_.opening.size()
        );
    }

    int get_last_mover_bot_id() const;

    const App::GameParams& params() const {
        return p_;
    }

private:
    enum class State {
        UNINITIALIZED,
        INITIALIZED
    };

    enum class ResultReason {
        LINE,
        DRAW,
        ADJUDICATION,
        VOID
    };

    static const char* result_reason_text(
        ResultReason reason
    );

    Core::PlayerColor current_player() const;

    int slot_for_color(
        Core::PlayerColor color
    ) const;

    int slot_for_player(
        const Player* player
    ) const;

    void record_crash(
        Core::PlayerColor loser
    );

    void record_crash(
        Player* player
    );

    double loss_for_player(
        const Player* player
    ) const;

    void initialize_game(
        std::vector<Core::Point>& out_history
    );

    void declare_game_if_needed();

    void send_run_start_event_if_needed(
        const std::shared_ptr<App::RunContext>& context
    );

    Net::ApiManager::Event create_event(
        const std::string& type
    );

    void send_start_event();

    void init_player(
        Player& player,
        Core::BotConfig& config
    );

    void apply_opening_moves();

    void validate_opening_move(
        const Core::Point& move
    );

    void send_move_event(
        const Core::Point& move,
        int color
    );

    bool play_turn(
        std::vector<Core::Point>& out_history
    );

    void send_turn_command(
        Player* current
    );

    void send_board_state(
        Player* current
    );

    Core::Point parse_and_validate_move(
        const std::string& response
    );

    void apply_move(
        const Core::Point& move
    );

    void finish(
        double result,
        ResultReason reason
    );

    void send_result_event(
        double result,
        ResultReason reason,
        long duration = 0
    );

    void print_board();

    std::chrono::steady_clock::time_point wall_start_;
    App::GameParams p_;
    std::shared_ptr<Net::ApiManager> api_;
    Stats::Tracker& stats_;
    ResultCallback cb_;
    Player pl1_;
    Player pl2_;
    std::vector<int> board_;
    std::vector<Core::Point> hist_;
    int moves_ = 0;
    int time_p1_ = 0;
    int time_p2_ = 0;
    long p1_wall_ms_ = 0;
    long p2_wall_ms_ = 0;
    State state_ = State::UNINITIALIZED;
    bool start_sent_ = false;
    bool result_sent_ = false;
};

}
