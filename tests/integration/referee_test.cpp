#include "../common/test_utils.h"
#include "../src/game/referee.h"
#include "../src/sys/signals.h"
#include <string>

using namespace Arena;

class ModularRefereeIntegrationTest :
    public ::testing::Test {
protected:
    App::GameParams p;
    Stats::Tracker stats;
    std::shared_ptr<
        Game::Referee
    > ref;

    void SetUp() override {
        Sys::g_stop_flag = 0;
        p.pair = 1;
        p.leg = 0;
        p.run_id = "run";
        p.context =
            std::make_shared<
                App::RunContext
            >();
        p.context->cfg.board_size = 15;
        p.context->cfg.max_pairs = 1;
        p.p1_cfg.cmd = "p1";
        p.p2_cfg.cmd = "p2";
        p.p1_cfg.timeout_announce = 1000;
        p.p1_cfg.timeout_cutoff = 1000;
        p.p1_cfg.timeout_game = 60000;
        p.p2_cfg = p.p1_cfg;
        p.p2_cfg.cmd = "p2";
    }

    void TearDown() override {
        Sys::g_stop_flag = 0;
    }

    void setup_bots(
        TestHelpers::MockProcess::Responder first,
        TestHelpers::MockProcess::Responder second
    ) {
        p.process_factory = [=](
            const std::string& command
        ) -> std::unique_ptr<
            Sys::Process
        > {
            if (command == "p1") {
                return std::make_unique<
                    TestHelpers::MockProcess
                >(first);
            }

            return std::make_unique<
                TestHelpers::MockProcess
            >(second);
        };

        ref = std::make_shared<
            Game::Referee
        >(
            p,
            nullptr,
            stats,
            TestHelpers::make_handler()
        );
    }

    static std::string metadata(
        const std::string& name
    ) {
        return
            "name=\"" +
            name +
            "\" version=\"1.0\"";
    }
};

auto StandardBot = [](
    const std::string& command
) -> std::string {
    static int move_count = 0;

    if (
        command.find("START") == 0
    ) {
        move_count = 0;
        return "OK";
    }

    if (command == "ABOUT") {
        return
            "name=\"Bot\" "
            "version=\"1.0\"";
    }

    if (command == "BEGIN") {
        return "7,7";
    }

    if (
        command.find("TURN") == 0 ||
        command.find("BOARD") == 0
    ) {
        move_count++;

        return
            std::to_string(
                move_count % 15
            ) +
            "," +
            std::to_string(
                move_count / 15
            );
    }

    return "";
};

TEST_F(
    ModularRefereeIntegrationTest,
    FullGameFlow
) {
    setup_bots(
        StandardBot,
        StandardBot
    );

    std::vector<
        Core::Point
    > history;

    EXPECT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    EXPECT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    EXPECT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    EXPECT_EQ(history.size(), 2);
}

TEST_F(
    ModularRefereeIntegrationTest,
    WhiteReceivesBlackAsOpponent
) {
    std::string white_board;

    auto black = [&](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return metadata("Black");
        }

        if (command == "BEGIN") {
            return std::string("7,7");
        }

        return std::string("9,7");
    };

    auto white = [&](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return metadata("White");
        }

        if (
            command.find("BOARD\n") == 0
        ) {
            white_board = command;
            return std::string("8,7");
        }

        return std::string("8,7");
    };

    setup_bots(black, white);

    std::vector<
        Core::Point
    > history;

    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );

    EXPECT_EQ(
        white_board,
        "BOARD\n"
        "7,7,2\n"
        "DONE"
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    ForceBoardUsesBlackPerspective
) {
    p.context->cfg.force_board = true;
    std::string black_board;

    auto black = [&](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return metadata("Black");
        }

        if (command == "BEGIN") {
            return std::string("7,7");
        }

        if (
            command.find("BOARD\n") == 0
        ) {
            black_board = command;
            return std::string("9,7");
        }

        return std::string("9,7");
    };

    auto white = [&](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return metadata("White");
        }

        if (
            command.find("BOARD\n") == 0
        ) {
            return std::string("8,7");
        }

        return std::string("8,7");
    };

    setup_bots(black, white);

    std::vector<
        Core::Point
    > history;

    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );

    EXPECT_EQ(
        black_board,
        "BOARD\n"
        "7,7,1\n"
        "8,7,2\n"
        "DONE"
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    OddOpeningUsesWhitePerspective
) {
    p.opening = {
        {7, 7},
        {8, 8},
        {9, 9}
    };

    std::string white_board;

    auto black = [&](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return metadata("Black");
        }

        return std::string("6,6");
    };

    auto white = [&](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return metadata("White");
        }

        if (
            command.find("BOARD\n") == 0
        ) {
            white_board = command;
        }

        return std::string("10,10");
    };

    setup_bots(black, white);

    std::vector<
        Core::Point
    > history;

    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );

    EXPECT_EQ(
        white_board,
        "BOARD\n"
        "7,7,2\n"
        "8,8,1\n"
        "9,9,2\n"
        "DONE"
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    EvenOpeningUsesBlackPerspective
) {
    p.opening = {
        {7, 7},
        {8, 8}
    };

    std::string black_board;

    auto black = [&](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return metadata("Black");
        }

        if (
            command.find("BOARD\n") == 0
        ) {
            black_board = command;
        }

        return std::string("9,9");
    };

    auto white = [&](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return metadata("White");
        }

        return std::string("10,10");
    };

    setup_bots(black, white);

    std::vector<
        Core::Point
    > history;

    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );

    EXPECT_EQ(
        black_board,
        "BOARD\n"
        "7,7,1\n"
        "8,8,2\n"
        "DONE"
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    RepeatedOkUsesOneTurnDeadline
) {
    p.p1_cfg.timeout_cutoff = 5;
    p.p2_cfg.timeout_cutoff = 5;

    auto repeated_ok = [&](
        const std::string& command
    ) {
        if (command == "ABOUT") {
            return metadata("RepeatedOk");
        }

        return std::string("OK");
    };

    setup_bots(
        repeated_ok,
        StandardBot
    );

    std::vector<
        Core::Point
    > history;

    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    EXPECT_EQ(
        ref->step(history),
        Game::Referee::Status::FINISHED
    );
    EXPECT_EQ(
        stats.p1_crashes.load(),
        1
    );
    EXPECT_GE(
        stats.p1_total_time_ms.load(),
        5
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    MoveAfterOneStrayOkSucceeds
) {
    int begin_reads = 0;

    auto black = [&](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return metadata("Black");
        }

        if (command == "BEGIN") {
            return ++begin_reads == 1
                ? std::string("OK")
                : std::string("7,7");
        }

        return std::string("9,7");
    };

    setup_bots(
        black,
        StandardBot
    );

    std::vector<
        Core::Point
    > history;

    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    EXPECT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(history.size(), 1U);
    EXPECT_EQ(history[0].x, 7);
    EXPECT_EQ(history[0].y, 7);
    EXPECT_EQ(
        stats.p1_crashes.load(),
        0
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    TimingUsesCanonicalSlotsInLegZero
) {
    auto bot = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"Bot\" "
                "version=\"1.0\""
            );
        }

        if (command == "BEGIN") {
            return std::string("7,7");
        }

        if (
            command.find("BOARD") == 0 ||
            command.find("TURN") == 0
        ) {
            return std::string("8,7");
        }

        return std::string();
    };

    setup_bots(bot, bot);

    std::vector<
        Core::Point
    > history;

    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );

    EXPECT_EQ(
        stats.p1_total_time_ms.load(),
        1
    );
    EXPECT_EQ(
        stats.p2_total_time_ms.load(),
        1
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    TimingUsesCanonicalSlotsInReversedLeg
) {
    p.leg = 1;

    auto black = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"Black\" "
                "version=\"1.0\""
            );
        }

        if (command == "BEGIN") {
            return std::string("7,7");
        }

        return std::string();
    };

    auto white = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"White\" "
                "version=\"1.0\""
            );
        }

        if (
            command.find("BOARD") == 0 ||
            command.find("TURN") == 0
        ) {
            return std::string("8,7");
        }

        return std::string();
    };

    setup_bots(black, white);

    std::vector<
        Core::Point
    > history;

    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );
    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );

    EXPECT_EQ(
        stats.p1_total_time_ms.load(),
        0
    );
    EXPECT_EQ(
        stats.p2_total_time_ms.load(),
        1
    );

    ASSERT_EQ(
        ref->step(history),
        Game::Referee::Status::RUNNING
    );

    EXPECT_EQ(
        stats.p1_total_time_ms.load(),
        1
    );
    EXPECT_EQ(
        stats.p2_total_time_ms.load(),
        1
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    BotTimeout
) {
    auto timeout = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"FailureBot\" "
                "version=\"1.0\""
            );
        }

        if (
            command == "BEGIN" ||
            command.find("TURN") == 0
        ) {
            return std::string(
                "__TIMEOUT__"
            );
        }

        return std::string();
    };

    setup_bots(
        timeout,
        StandardBot
    );

    std::vector<
        Core::Point
    > history;

    ref->step(history);

    EXPECT_EQ(
        ref->step(history),
        Game::Referee::Status::FINISHED
    );
    EXPECT_GE(
        stats.p1_total_time_ms.load(),
        1
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    BotCrash
) {
    auto crash = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"FailureBot\" "
                "version=\"1.0\""
            );
        }

        if (command == "BEGIN") {
            return std::string(
                "__CRASH__"
            );
        }

        return std::string();
    };

    setup_bots(
        crash,
        StandardBot
    );

    std::vector<
        Core::Point
    > history;

    ref->step(history);

    EXPECT_EQ(
        ref->step(history),
        Game::Referee::Status::FINISHED
    );
    EXPECT_EQ(
        stats.p1_crashes.load(),
        1
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    IllegalMove
) {
    auto illegal = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"FailureBot\" "
                "version=\"1.0\""
            );
        }

        if (command == "BEGIN") {
            return std::string(
                "100,100"
            );
        }

        return std::string();
    };

    setup_bots(
        illegal,
        StandardBot
    );

    std::vector<
        Core::Point
    > history;

    ref->step(history);

    EXPECT_EQ(
        ref->step(history),
        Game::Referee::Status::FINISHED
    );
    EXPECT_GE(
        stats.p1_total_time_ms.load(),
        1
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    GarbageOutput
) {
    auto garbage = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"FailureBot\" "
                "version=\"1.0\""
            );
        }

        if (command == "BEGIN") {
            return std::string(
                "NotAMove"
            );
        }

        return std::string();
    };

    setup_bots(
        garbage,
        StandardBot
    );

    std::vector<
        Core::Point
    > history;

    ref->step(history);

    EXPECT_EQ(
        ref->step(history),
        Game::Referee::Status::FINISHED
    );
}

TEST_F(
    ModularRefereeIntegrationTest,
    CompletedPairIsVisibleInGameLog
) {
    auto callback = [&](
        int,
        int,
        double,
        long
    ) {
        stats.update_pair_stats(1.0);
    };

    ref = std::make_shared<
        Game::Referee
    >(
        p,
        nullptr,
        stats,
        callback
    );

    testing::internal::CaptureStdout();
    ref->finish(1.0);

    std::string output =
        testing::internal::
            GetCapturedStdout();

    EXPECT_NE(
        output.find(
            "P1 -> +1 -0 =0"
        ),
        std::string::npos
    );
}

class ExitOnCrashTest :
    public ::testing::Test {
protected:
    App::GameParams p;
    Stats::Tracker stats;

    void SetUp() override {
        Sys::g_stop_flag = 0;
        p.pair = 1;
        p.leg = 0;
        p.context =
            std::make_shared<
                App::RunContext
            >();
        p.context->cfg.board_size = 15;
        p.context->cfg.exit_on_crash = true;
        p.p1_cfg.cmd = "p1";
        p.p2_cfg.cmd = "p2";
        p.p1_cfg.timeout_announce = 1000;
        p.p1_cfg.timeout_cutoff = 1000;
        p.p1_cfg.timeout_game = 60000;
        p.p2_cfg = p.p1_cfg;
        p.p2_cfg.cmd = "p2";
    }

    void TearDown() override {
        Sys::g_stop_flag = 0;
    }

    void setup_bots(
        TestHelpers::MockProcess::Responder first,
        TestHelpers::MockProcess::Responder second
    ) {
        p.process_factory = [=](
            const std::string& command
        ) -> std::unique_ptr<
            Sys::Process
        > {
            if (command == "p1") {
                return std::make_unique<
                    TestHelpers::MockProcess
                >(first);
            }

            return std::make_unique<
                TestHelpers::MockProcess
            >(second);
        };
    }

    std::shared_ptr<
        Game::Referee
    > make_referee() {
        return std::make_shared<
            Game::Referee
        >(
            p,
            nullptr,
            stats,
            TestHelpers::make_handler()
        );
    }

    static std::string standard(
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return "OK";
        }

        if (command == "ABOUT") {
            return
                "name=\"Bot\" "
                "version=\"1.0\"";
        }

        return "7,7";
    }
};

TEST_F(
    ExitOnCrashTest,
    TimeoutExits
) {
    auto timeout = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"FailureBot\" "
                "version=\"1.0\""
            );
        }

        if (
            command == "BEGIN" ||
            command.find("TURN") == 0
        ) {
            return std::string(
                "__TIMEOUT__"
            );
        }

        return std::string();
    };

    setup_bots(
        timeout,
        standard
    );

    auto referee =
        make_referee();

    std::vector<
        Core::Point
    > history;

    referee->step(history);

    EXPECT_THROW(
        referee->step(history),
        Core::MatchTerminated
    );
}

TEST_F(
    ExitOnCrashTest,
    CrashExits
) {
    auto crash = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"FailureBot\" "
                "version=\"1.0\""
            );
        }

        if (command == "BEGIN") {
            return std::string(
                "__CRASH__"
            );
        }

        return std::string();
    };

    setup_bots(
        crash,
        standard
    );

    auto referee =
        make_referee();

    std::vector<
        Core::Point
    > history;

    referee->step(history);

    EXPECT_THROW(
        referee->step(history),
        Core::MatchTerminated
    );
}

TEST_F(
    ExitOnCrashTest,
    IllegalMoveExits
) {
    auto illegal = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"FailureBot\" "
                "version=\"1.0\""
            );
        }

        if (command == "BEGIN") {
            return std::string(
                "100,100"
            );
        }

        return std::string();
    };

    setup_bots(
        illegal,
        standard
    );

    auto referee =
        make_referee();

    std::vector<
        Core::Point
    > history;

    referee->step(history);

    EXPECT_THROW(
        referee->step(history),
        Core::MatchTerminated
    );
}

TEST_F(
    ExitOnCrashTest,
    OccupiedCellExits
) {
    auto repeat = [](
        const std::string& command
    ) {
        if (
            command.find("START") == 0
        ) {
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"Bot\" "
                "version=\"1.0\""
            );
        }

        return std::string("7,7");
    };

    setup_bots(repeat, repeat);

    auto referee =
        make_referee();

    std::vector<
        Core::Point
    > history;

    referee->step(history);
    referee->step(history);

    EXPECT_THROW(
        referee->step(history),
        Core::MatchTerminated
    );
}

TEST_F(
    ExitOnCrashTest,
    HappyPathContinues
) {
    p.context->cfg.exit_on_crash = false;

    auto good = [](
        const std::string& command
    ) {
        static int move_count = 0;

        if (
            command.find("START") == 0
        ) {
            move_count = 0;
            return std::string("OK");
        }

        if (command == "ABOUT") {
            return std::string(
                "name=\"Bot\" "
                "version=\"1.0\""
            );
        }

        if (command == "BEGIN") {
            return std::string("7,7");
        }

        if (
            command.find("TURN") == 0 ||
            command.find("BOARD") == 0
        ) {
            move_count++;

            return
                std::to_string(
                    move_count % 15
                ) +
                "," +
                std::to_string(
                    move_count / 15
                );
        }

        return std::string();
    };

    setup_bots(good, good);

    auto referee =
        make_referee();

    std::vector<
        Core::Point
    > history;

    EXPECT_EQ(
        referee->step(history),
        Game::Referee::Status::RUNNING
    );
    EXPECT_EQ(
        referee->step(history),
        Game::Referee::Status::RUNNING
    );
    EXPECT_EQ(
        referee->step(history),
        Game::Referee::Status::RUNNING
    );
}
