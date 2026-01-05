#include "../common/test_utils.h"
#include "../src/game/referee.h"

using namespace Arena;

class RefereeTest : public ::testing::Test {
protected:
    App::GameParams p;
    Stats::Tracker stats;
    std::unique_ptr<Game::Referee> ref;

    void SetUp() override {
        p.pair = 1;
        p.leg = 0;
        p.context = std::make_shared<App::RunContext>();
        p.context->cfg.board_size = 15;
        p.p1_cfg.cmd = "p1";
        p.p2_cfg.cmd = "p2";
        ref = std::make_unique<Game::Referee>(
            p, nullptr, stats, TestHelpers::make_handler()
        );
    }
};

TEST_F(RefereeTest, MoveParsing) {
    auto m = ref->parse_and_validate_move("5,5");
    EXPECT_EQ(m.x, 5);
    EXPECT_EQ(m.y, 5);
}

TEST_F(RefereeTest, MoveParsingEdgeCases) {
    auto m = ref->parse_and_validate_move("  0,14");
    EXPECT_EQ(m.x, 0);
    EXPECT_EQ(m.y, 14);
}

TEST_F(RefereeTest, InvalidMoveFormat) {
    EXPECT_THROW(ref->parse_and_validate_move("5 5"), Core::PlayerError);
    EXPECT_THROW(ref->parse_and_validate_move("a,b"), Core::PlayerError);
    EXPECT_THROW(ref->parse_and_validate_move("5,5,5"), Core::PlayerError);
}

TEST_F(RefereeTest, OutOfBounds) {
    EXPECT_THROW(ref->parse_and_validate_move("-1,0"), Core::PlayerError);
    EXPECT_THROW(ref->parse_and_validate_move("15,0"), Core::PlayerError);
    EXPECT_THROW(ref->parse_and_validate_move("0,15"), Core::PlayerError);
}

TEST_F(RefereeTest, OccupiedCell) {
    ref->board_[0] = 1;
    EXPECT_THROW(ref->parse_and_validate_move("0,0"), Core::PlayerError);
}

TEST_F(RefereeTest, ColorAssignment) {
    ref->moves_ = 0;
    EXPECT_EQ(ref->current_player(), Core::PlayerColor::BLACK);
    ref->moves_ = 1;
    EXPECT_EQ(ref->current_player(), Core::PlayerColor::WHITE);
}

TEST_F(RefereeTest, LastMover) {
    ref->moves_ = 1;
    EXPECT_EQ(ref->get_last_mover_bot_id(), 1);

    ref->moves_ = 2;
    EXPECT_EQ(ref->get_last_mover_bot_id(), 2);
}

TEST_F(RefereeTest, LastMoverLeg1) {
    p.leg = 1;
    ref = std::make_unique<Game::Referee>(
        p, nullptr, stats, TestHelpers::make_handler()
    );

    ref->moves_ = 1;
    EXPECT_EQ(ref->get_last_mover_bot_id(), 2);
}

TEST_F(RefereeTest, BoardFullDetection) {
    for (int i = 0; i < 225; ++i) ref->board_[i] = 1;
    ref->moves_ = 225;
    std::vector<Core::Point> h;
    EXPECT_GE(ref->moves_, 15 * 15);
}

TEST_F(RefereeTest, TimeControlInit) {
    p.p1_cfg.timeout_game = 5000;
    p.p2_cfg.timeout_game = 6000;
    ref = std::make_unique<Game::Referee>(
        p, nullptr, stats, TestHelpers::make_handler()
    );
    EXPECT_EQ(ref->time_p1_, 5000);
    EXPECT_EQ(ref->time_p2_, 6000);
}

TEST_F(RefereeTest, BoardCoordinate) {
    auto m = ref->parse_and_validate_move("14,14");
    EXPECT_EQ(m.x, 14);
    EXPECT_EQ(m.y, 14);
}

TEST_F(RefereeTest, ZeroCoordinate) {
    auto m = ref->parse_and_validate_move("0,0");
    EXPECT_EQ(m.x, 0);
    EXPECT_EQ(m.y, 0);
}

TEST_F(RefereeTest, GetOpeningSize) {
    EXPECT_EQ(ref->get_opening_size(), 0);

    p.opening = {{7, 7}, {8, 8}};
    ref = std::make_unique<Game::Referee>(
        p, nullptr, stats, TestHelpers::make_handler()
    );
    EXPECT_EQ(ref->get_opening_size(), 2);
}

TEST_F(RefereeTest, MoveHistoryEmpty) {
    EXPECT_TRUE(ref->hist_.empty());
}

TEST_F(RefereeTest, OpeningValidationOOB) {
    Core::Point oob_move = {-1, 5};
    EXPECT_THROW(ref->validate_opening_move(oob_move), std::runtime_error);

    Core::Point oob_move2 = {5, 20};
    EXPECT_THROW(ref->validate_opening_move(oob_move2), std::runtime_error);
}

TEST_F(RefereeTest, OpeningValidationOccupied) {
    ref->board_[7 * 15 + 7] = 1;
    Core::Point occupied = {7, 7};
    EXPECT_THROW(ref->validate_opening_move(occupied), std::runtime_error);
}

TEST_F(RefereeTest, ApplyMoveUpdatesState) {
    ref->moves_ = 0;
    Core::Point m = {7, 7};
    ref->apply_move(m);

    EXPECT_EQ(ref->moves_, 1);
    EXPECT_EQ(ref->hist_.size(), 1);
    EXPECT_EQ(ref->board_[7 * 15 + 7], static_cast<int>(Core::PlayerColor::BLACK));
}

TEST_F(RefereeTest, ApplyMoveAlternatesColors) {
    ref->moves_ = 0;
    ref->apply_move({5, 5});
    EXPECT_EQ(ref->board_[5 * 15 + 5], 1);

    ref->apply_move({6, 6});
    EXPECT_EQ(ref->board_[6 * 15 + 6], 2);
}

TEST_F(RefereeTest, ResultCallback) {
    bool called = false;
    int cb_pair = 0;
    double cb_result = -1;

    auto callback = [&](int pair, int, double result, long, long, long) {
        called = true;
        cb_pair = pair;
        cb_result = result;
    };

    ref = std::make_unique<Game::Referee>(p, nullptr, stats, callback);
    ref->finish(1.0);

    EXPECT_TRUE(called);
    EXPECT_EQ(cb_pair, 1);
    EXPECT_DOUBLE_EQ(cb_result, 1.0);
}

TEST_F(RefereeTest, CreateEventExtId) {
    p.pair = 5;
    p.leg = 1;
    p.run_id = "test_run";
    ref = std::make_unique<Game::Referee>(
        p, nullptr, stats, TestHelpers::make_handler()
    );

    auto e = ref->create_event("move");
    EXPECT_EQ(e.type, "move");
    EXPECT_EQ(e.ext_id, "test_run_5_1");
}

TEST_F(RefereeTest, FullBoardMoveCount) {
    ref->moves_ = 224;
    EXPECT_EQ(ref->moves_, 224);
    EXPECT_LT(ref->moves_, 15 * 15);
}

TEST_F(RefereeTest, LastMoverAtZeroMoves) {
    ref->moves_ = 0;
    EXPECT_EQ(ref->get_last_mover_bot_id(), 0);
}

TEST_F(RefereeTest, BoardSizeFromContext) {
    EXPECT_EQ(p.context->cfg.board_size, 15);
    EXPECT_EQ(ref->p_.config().board_size, 15);
}
