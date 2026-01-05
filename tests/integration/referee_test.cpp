#include "../common/test_utils.h"
#include "../src/game/referee.h"
#include "../src/sys/signals.h"

using namespace Arena;

class ModularRefereeIntegrationTest : public ::testing::Test {
protected:
    App::GameParams p;
    Stats::Tracker stats;
    std::shared_ptr<Game::Referee> ref;

    void SetUp() override {
        p.pair = 1;
        p.leg = 0;
        p.context = std::make_shared<App::RunContext>();
        p.context->cfg.board_size = 15;
        p.p1_cfg.cmd = "p1";
        p.p2_cfg.cmd = "p2";
        p.p1_cfg.timeout_announce = 1000;
        p.p1_cfg.timeout_cutoff = 1000;
        p.p1_cfg.timeout_game = 60000;
        p.p2_cfg = p.p1_cfg;
    }

    void SetupBots(
        TestHelpers::MockProcess::Responder r1,
        TestHelpers::MockProcess::Responder r2
    ) {
        p.process_factory = [=](
            const std::string& cmd
        ) -> std::unique_ptr<Sys::Process> {
            if (cmd == "p1") return std::make_unique<TestHelpers::MockProcess>(r1);
            return std::make_unique<TestHelpers::MockProcess>(r2);
        };
        ref = std::make_shared<Game::Referee>(
            p, nullptr, stats, TestHelpers::make_handler()
        );
    }
};

auto StandardBot = [](const std::string& cmd) -> std::string {
    static int move_count = 0;
    if (cmd.find("START") == 0) { move_count = 0; return "OK"; }
    if (cmd == "ABOUT") return "name=\"Bot\" version=\"1.0\"";
    if (cmd == "BEGIN") return "7,7";
    if (cmd.find("TURN") == 0 || cmd.find("BOARD") == 0) {
        move_count++;
        return std::to_string(move_count % 15) + "," + std::to_string(move_count / 15);
    }
    return "";
};

TEST_F(ModularRefereeIntegrationTest, FullGameFlow) {
    SetupBots(StandardBot, StandardBot);
    std::vector<Core::Point> history;

    EXPECT_EQ(ref->step(history), Game::Referee::Status::RUNNING);
    EXPECT_EQ(ref->step(history), Game::Referee::Status::RUNNING);
    EXPECT_EQ(ref->step(history), Game::Referee::Status::RUNNING);
    EXPECT_EQ(history.size(), 2);
}

TEST_F(ModularRefereeIntegrationTest, BotTimeout) {
    auto TimeoutBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "BEGIN" || cmd.find("TURN") == 0) return "__TIMEOUT__";
        return "";
    };

    SetupBots(TimeoutBot, StandardBot);
    std::vector<Core::Point> history;
    ref->step(history);

    auto status = ref->step(history);
    EXPECT_EQ(status, Game::Referee::Status::FINISHED);
}

TEST_F(ModularRefereeIntegrationTest, BotCrash) {
    auto CrashBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "BEGIN") return "__CRASH__";
        return "";
    };

    SetupBots(CrashBot, StandardBot);
    std::vector<Core::Point> history;
    ref->step(history);

    auto status = ref->step(history);
    EXPECT_EQ(status, Game::Referee::Status::FINISHED);
    EXPECT_EQ(stats.p1_crashes, 1);
}

TEST_F(ModularRefereeIntegrationTest, IllegalMove) {
    auto IllegalBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "BEGIN") return "100,100";
        return "";
    };

    SetupBots(IllegalBot, StandardBot);
    std::vector<Core::Point> history;
    ref->step(history);

    auto status = ref->step(history);
    EXPECT_EQ(status, Game::Referee::Status::FINISHED);
}

TEST_F(ModularRefereeIntegrationTest, GarbageOutput) {
    auto GarbageBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "BEGIN") return "NotAMove";
        return "";
    };

    SetupBots(GarbageBot, StandardBot);
    std::vector<Core::Point> history;
    ref->step(history);

    auto status = ref->step(history);
    EXPECT_EQ(status, Game::Referee::Status::FINISHED);
}

class ExitOnCrashTest : public ::testing::Test {
protected:
    App::GameParams p;
    Stats::Tracker stats;

    void SetUp() override {
        Sys::g_stop_flag = 0;
        p.pair = 1;
        p.leg = 0;
        p.context = std::make_shared<App::RunContext>();
        p.context->cfg.board_size = 15;
        p.context->cfg.exit_on_crash = true;
        p.p1_cfg.cmd = "p1";
        p.p2_cfg.cmd = "p2";
        p.p1_cfg.timeout_announce = 1000;
        p.p1_cfg.timeout_cutoff = 1000;
        p.p1_cfg.timeout_game = 60000;
        p.p2_cfg = p.p1_cfg;
    }

    void TearDown() override {
        Sys::g_stop_flag = 0;
    }

    void SetupBots(
        TestHelpers::MockProcess::Responder r1,
        TestHelpers::MockProcess::Responder r2
    ) {
        p.process_factory = [=](
            const std::string& cmd
        ) -> std::unique_ptr<Sys::Process> {
            if (cmd == "p1") return std::make_unique<TestHelpers::MockProcess>(r1);
            return std::make_unique<TestHelpers::MockProcess>(r2);
        };
    }
};

TEST_F(ExitOnCrashTest, TimeoutExits) {
    auto TimeoutBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "BEGIN" || cmd.find("TURN") == 0) return "__TIMEOUT__";
        return "";
    };
    auto StandardBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "ABOUT") return "name=\"Bot\" version=\"1.0\"";
        return "7,7";
    };

    SetupBots(TimeoutBot, StandardBot);

    auto ref = std::make_shared<Game::Referee>(
        p, nullptr, stats, TestHelpers::make_handler()
    );
    std::vector<Core::Point> history;
    ref->step(history);
    EXPECT_THROW(ref->step(history), Core::MatchTerminated);
}

TEST_F(ExitOnCrashTest, CrashExits) {
    auto CrashBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "BEGIN") return "__CRASH__";
        return "";
    };
    auto StandardBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "ABOUT") return "name=\"Bot\" version=\"1.0\"";
        return "7,7";
    };

    SetupBots(CrashBot, StandardBot);

    auto ref = std::make_shared<Game::Referee>(
        p, nullptr, stats, TestHelpers::make_handler()
    );
    std::vector<Core::Point> history;
    ref->step(history);
    EXPECT_THROW(ref->step(history), Core::MatchTerminated);
}

TEST_F(ExitOnCrashTest, IllegalMoveExits) {
    auto IllegalBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "BEGIN") return "100,100";
        return "";
    };
    auto StandardBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        if (cmd == "ABOUT") return "name=\"Bot\" version=\"1.0\"";
        return "7,7";
    };

    SetupBots(IllegalBot, StandardBot);

    auto ref = std::make_shared<Game::Referee>(
        p, nullptr, stats, TestHelpers::make_handler()
    );
    std::vector<Core::Point> history;
    ref->step(history);
    EXPECT_THROW(ref->step(history), Core::MatchTerminated);
}

TEST_F(ExitOnCrashTest, OccupiedCellExits) {
    auto RepeatBot = [](const std::string& cmd) -> std::string {
        if (cmd.find("START") == 0) return "OK";
        return "7,7";
    };

    SetupBots(RepeatBot, RepeatBot);

    auto ref = std::make_shared<Game::Referee>(
        p, nullptr, stats, TestHelpers::make_handler()
    );
    std::vector<Core::Point> history;
    ref->step(history);
    ref->step(history);
    EXPECT_THROW(ref->step(history), Core::MatchTerminated);
}

TEST_F(ExitOnCrashTest, HappyPathContinues) {
    p.context->cfg.exit_on_crash = false;

    auto GoodBot = [](const std::string& cmd) -> std::string {
        static int move_count = 0;
        if (cmd.find("START") == 0) { move_count = 0; return "OK"; }
        if (cmd == "ABOUT") return "name=\"Bot\" version=\"1.0\"";
        if (cmd == "BEGIN") return "7,7";
        if (cmd.find("TURN") == 0 || cmd.find("BOARD") == 0) {
            move_count++;
            return std::to_string(move_count % 15) + "," + std::to_string(move_count / 15);
        }
        return "";
    };

    SetupBots(GoodBot, GoodBot);

    auto ref = std::make_shared<Game::Referee>(
        p, nullptr, stats, TestHelpers::make_handler()
    );
    std::vector<Core::Point> history;

    EXPECT_EQ(ref->step(history), Game::Referee::Status::RUNNING);
    EXPECT_EQ(ref->step(history), Game::Referee::Status::RUNNING);
    EXPECT_EQ(ref->step(history), Game::Referee::Status::RUNNING);
}
