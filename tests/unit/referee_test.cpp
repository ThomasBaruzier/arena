#include "../common/test_utils.h"
#include "../src/game/referee.h"

using namespace Arena;

class RefereeTest :
    public ::testing::Test {
protected:
    App::GameParams p;
    Stats::Tracker stats;
    std::unique_ptr<
        Game::Referee
    > ref;

    void SetUp() override {
        p.pair = 1;
        p.leg = 0;
        p.context =
            std::make_shared<
                App::RunContext
            >();
        p.context->cfg.board_size = 15;
        p.p1_cfg.cmd = "p1";
        p.p2_cfg.cmd = "p2";

        rebuild();
    }

    void rebuild() {
        ref =
            std::make_unique<
                Game::Referee
            >(
                p,
                nullptr,
                stats,
                TestHelpers::make_handler()
            );
    }

    std::string finish_log(
        double result = 1.0
    ) {
        testing::internal::CaptureStdout();
        ref->finish(result);

        return testing::internal::
            GetCapturedStdout();
    }
};

TEST_F(
    RefereeTest,
    MoveParsing
) {
    auto move =
        ref->parse_and_validate_move(
            "5,5"
        );

    EXPECT_EQ(move.x, 5);
    EXPECT_EQ(move.y, 5);
}

TEST_F(
    RefereeTest,
    MoveParsingEdgeCases
) {
    auto move =
        ref->parse_and_validate_move(
            "  0,14"
        );

    EXPECT_EQ(move.x, 0);
    EXPECT_EQ(move.y, 14);
}

TEST_F(
    RefereeTest,
    InvalidMoveFormat
) {
    EXPECT_THROW(
        ref->parse_and_validate_move(
            "5 5"
        ),
        Core::PlayerError
    );

    EXPECT_THROW(
        ref->parse_and_validate_move(
            "a,b"
        ),
        Core::PlayerError
    );

    EXPECT_THROW(
        ref->parse_and_validate_move(
            "5,5,5"
        ),
        Core::PlayerError
    );
}

TEST_F(
    RefereeTest,
    OutOfBounds
) {
    EXPECT_THROW(
        ref->parse_and_validate_move(
            "-1,0"
        ),
        Core::PlayerError
    );

    EXPECT_THROW(
        ref->parse_and_validate_move(
            "15,0"
        ),
        Core::PlayerError
    );

    EXPECT_THROW(
        ref->parse_and_validate_move(
            "0,15"
        ),
        Core::PlayerError
    );
}

TEST_F(
    RefereeTest,
    OccupiedCell
) {
    ref->board_[0] = 1;

    EXPECT_THROW(
        ref->parse_and_validate_move(
            "0,0"
        ),
        Core::PlayerError
    );
}

TEST_F(
    RefereeTest,
    ColorAssignment
) {
    ref->moves_ = 0;

    EXPECT_EQ(
        ref->current_player(),
        Core::PlayerColor::BLACK
    );

    ref->moves_ = 1;

    EXPECT_EQ(
        ref->current_player(),
        Core::PlayerColor::WHITE
    );
}

TEST_F(
    RefereeTest,
    LastMover
) {
    ref->moves_ = 1;

    EXPECT_EQ(
        ref->get_last_mover_bot_id(),
        1
    );

    ref->moves_ = 2;

    EXPECT_EQ(
        ref->get_last_mover_bot_id(),
        2
    );
}

TEST_F(
    RefereeTest,
    LastMoverLeg1
) {
    p.leg = 1;
    rebuild();
    ref->moves_ = 1;

    EXPECT_EQ(
        ref->get_last_mover_bot_id(),
        2
    );
}

TEST_F(
    RefereeTest,
    CanonicalSlotMappingLeg0
) {
    EXPECT_EQ(
        ref->slot_for_color(
            Core::PlayerColor::BLACK
        ),
        1
    );

    EXPECT_EQ(
        ref->slot_for_color(
            Core::PlayerColor::WHITE
        ),
        2
    );

    EXPECT_EQ(
        ref->slot_for_player(
            &ref->pl1_
        ),
        1
    );

    EXPECT_EQ(
        ref->slot_for_player(
            &ref->pl2_
        ),
        2
    );
}

TEST_F(
    RefereeTest,
    CanonicalSlotMappingLeg1
) {
    p.leg = 1;
    rebuild();

    EXPECT_EQ(
        ref->slot_for_color(
            Core::PlayerColor::BLACK
        ),
        2
    );

    EXPECT_EQ(
        ref->slot_for_color(
            Core::PlayerColor::WHITE
        ),
        1
    );

    EXPECT_EQ(
        ref->slot_for_player(
            &ref->pl1_
        ),
        2
    );

    EXPECT_EQ(
        ref->slot_for_player(
            &ref->pl2_
        ),
        1
    );
}

TEST_F(
    RefereeTest,
    CanonicalTimingOwnershipAcrossLegs
) {
    stats.add_timing(
        ref->slot_for_color(
            Core::PlayerColor::BLACK
        ),
        100,
        80
    );

    stats.add_timing(
        ref->slot_for_color(
            Core::PlayerColor::WHITE
        ),
        200,
        100
    );

    p.leg = 1;
    rebuild();

    stats.add_timing(
        ref->slot_for_color(
            Core::PlayerColor::BLACK
        ),
        300,
        150
    );

    stats.add_timing(
        ref->slot_for_color(
            Core::PlayerColor::WHITE
        ),
        400,
        360
    );

    EXPECT_EQ(
        stats.p1_total_time_ms.load(),
        500
    );

    EXPECT_EQ(
        stats.p1_cpu_time_ms.load(),
        440
    );

    EXPECT_EQ(
        stats.p2_total_time_ms.load(),
        500
    );

    EXPECT_EQ(
        stats.p2_cpu_time_ms.load(),
        250
    );

    auto p1_eff =
        stats.get_p1_eff();
    auto p2_eff =
        stats.get_p2_eff();

    ASSERT_TRUE(
        p1_eff.has_value()
    );
    ASSERT_TRUE(
        p2_eff.has_value()
    );
    EXPECT_DOUBLE_EQ(*p1_eff, 88.0);
    EXPECT_DOUBLE_EQ(*p2_eff, 50.0);
}

TEST_F(
    RefereeTest,
    RunStartUsesOriginalBotOrderForLeg1
) {
    p.leg = 1;
    p.p1_cfg.cmd = "bot2";
    p.p2_cfg.cmd = "bot1";
    rebuild();

    ref->send_run_start_event_if_needed(
        p.context
    );

    EXPECT_EQ(
        p.context->p1_name,
        "bot1"
    );

    EXPECT_EQ(
        p.context->p2_name,
        "bot2"
    );
}

TEST_F(
    RefereeTest,
    BoardFullDetection
) {
    for (
        int index = 0;
        index < 225;
        ++index
    ) {
        ref->board_[index] = 1;
    }

    ref->moves_ = 225;

    EXPECT_GE(
        ref->moves_,
        15 * 15
    );
}

TEST_F(
    RefereeTest,
    TimeControlInit
) {
    p.p1_cfg.timeout_game = 5000;
    p.p2_cfg.timeout_game = 6000;
    rebuild();

    EXPECT_EQ(
        ref->time_p1_,
        5000
    );

    EXPECT_EQ(
        ref->time_p2_,
        6000
    );
}

TEST_F(
    RefereeTest,
    BoardCoordinate
) {
    auto move =
        ref->parse_and_validate_move(
            "14,14"
        );

    EXPECT_EQ(move.x, 14);
    EXPECT_EQ(move.y, 14);
}

TEST_F(
    RefereeTest,
    ZeroCoordinate
) {
    auto move =
        ref->parse_and_validate_move(
            "0,0"
        );

    EXPECT_EQ(move.x, 0);
    EXPECT_EQ(move.y, 0);
}

TEST_F(
    RefereeTest,
    GetOpeningSize
) {
    EXPECT_EQ(
        ref->get_opening_size(),
        0
    );

    p.opening = {
        {7, 7},
        {8, 8}
    };

    rebuild();

    EXPECT_EQ(
        ref->get_opening_size(),
        2
    );
}

TEST_F(
    RefereeTest,
    MoveHistoryEmpty
) {
    EXPECT_TRUE(
        ref->hist_.empty()
    );
}

TEST_F(
    RefereeTest,
    OpeningValidationOOB
) {
    Core::Point first = {
        -1,
        5
    };

    Core::Point second = {
        5,
        20
    };

    EXPECT_THROW(
        ref->validate_opening_move(
            first
        ),
        std::runtime_error
    );

    EXPECT_THROW(
        ref->validate_opening_move(
            second
        ),
        std::runtime_error
    );
}

TEST_F(
    RefereeTest,
    OpeningValidationOccupied
) {
    ref->board_[7 * 15 + 7] = 1;

    Core::Point occupied = {
        7,
        7
    };

    EXPECT_THROW(
        ref->validate_opening_move(
            occupied
        ),
        std::runtime_error
    );
}

TEST_F(
    RefereeTest,
    ApplyMoveUpdatesState
) {
    ref->moves_ = 0;

    Core::Point move = {
        7,
        7
    };

    ref->apply_move(move);

    EXPECT_EQ(ref->moves_, 1);
    EXPECT_EQ(
        ref->hist_.size(),
        1
    );

    EXPECT_EQ(
        ref->board_[7 * 15 + 7],
        static_cast<int>(
            Core::PlayerColor::BLACK
        )
    );
}

TEST_F(
    RefereeTest,
    ApplyMoveAlternatesColors
) {
    ref->moves_ = 0;

    ref->apply_move({
        5,
        5
    });

    EXPECT_EQ(
        ref->board_[5 * 15 + 5],
        1
    );

    ref->apply_move({
        6,
        6
    });

    EXPECT_EQ(
        ref->board_[6 * 15 + 6],
        2
    );
}

TEST_F(
    RefereeTest,
    ResultCallback
) {
    bool called = false;
    int callback_pair = 0;
    int callback_leg = -1;
    double callback_result = -1;
    long callback_wall = -1;

    auto callback = [&](
        int pair,
        int leg,
        double result,
        long wall
    ) {
        called = true;
        callback_pair = pair;
        callback_leg = leg;
        callback_result = result;
        callback_wall = wall;
    };

    ref =
        std::make_unique<
            Game::Referee
        >(
            p,
            nullptr,
            stats,
            callback
        );

    ref->finish(1.0);

    EXPECT_TRUE(called);
    EXPECT_EQ(callback_pair, 1);
    EXPECT_EQ(callback_leg, 0);
    EXPECT_DOUBLE_EQ(
        callback_result,
        1.0
    );
    EXPECT_GE(callback_wall, 0);
}

TEST_F(
    RefereeTest,
    GameLogOmitsUnavailableQualityMetrics
) {
    std::string output =
        finish_log();

    EXPECT_EQ(
        output.find(" | CMA:"),
        std::string::npos
    );

    EXPECT_EQ(
        output.find(" | Bln:"),
        std::string::npos
    );
}

TEST_F(
    RefereeTest,
    GameLogShowsBlunderWithoutCma
) {
    stats.add_metrics(
        1,
        0.1,
        0.01
    );

    std::string output =
        finish_log();

    EXPECT_EQ(
        output.find(" | CMA:"),
        std::string::npos
    );

    EXPECT_NE(
        output.find(
            " | Bln: 0.0% vs -"
        ),
        std::string::npos
    );
}

TEST_F(
    RefereeTest,
    GameLogUsesDashForOneSidedQualityData
) {
    stats.add_metrics(
        2,
        0.03,
        0.1
    );

    std::string output =
        finish_log();

    EXPECT_NE(
        output.find(
            " | CMA: - vs 0.0%"
        ),
        std::string::npos
    );

    EXPECT_NE(
        output.find(
            " | Bln: - vs 0.0%"
        ),
        std::string::npos
    );
}

TEST_F(
    RefereeTest,
    GameLogPreservesSampledZero
) {
    stats.add_metrics(
        1,
        0.03,
        0.1
    );

    stats.add_metrics(
        2,
        0.01,
        0.1
    );

    std::string output =
        finish_log();

    EXPECT_NE(
        output.find(
            " | CMA: 0.0% vs 100.0%"
        ),
        std::string::npos
    );

    EXPECT_NE(
        output.find(
            " | Bln: 0.0% vs 0.0%"
        ),
        std::string::npos
    );
}

TEST_F(
    RefereeTest,
    CreateEventExtId
) {
    p.pair = 5;
    p.leg = 1;
    p.run_id = "test_run";
    rebuild();

    auto event =
        ref->create_event("move");

    EXPECT_EQ(
        event.type,
        "move"
    );

    EXPECT_EQ(
        event.ext_id,
        "test_run_5_1"
    );
}

TEST_F(
    RefereeTest,
    FullBoardMoveCount
) {
    ref->moves_ = 224;

    EXPECT_EQ(
        ref->moves_,
        224
    );

    EXPECT_LT(
        ref->moves_,
        15 * 15
    );
}

TEST_F(
    RefereeTest,
    LastMoverAtZeroMoves
) {
    ref->moves_ = 0;

    EXPECT_EQ(
        ref->get_last_mover_bot_id(),
        0
    );
}

TEST_F(
    RefereeTest,
    BoardSizeFromContext
) {
    EXPECT_EQ(
        p.context->cfg.board_size,
        15
    );

    EXPECT_EQ(
        ref->p_.config().board_size,
        15
    );
}
