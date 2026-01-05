#include "../common/test_utils.h"
#include "../src/sys/process.h"

using namespace Arena;

class ProcessTest : public ::testing::Test {};

TEST_F(ProcessTest, BasicLifecycle) {
    Sys::Process proc("echo hello");
    ASSERT_TRUE(proc.start(0));

    auto line = proc.read_line(1000, nullptr);
    ASSERT_TRUE(line.has_value());
    EXPECT_EQ(*line, "hello");

    proc.terminate();
}

TEST_F(ProcessTest, EnvironmentVariables) {
    Sys::Process proc("printenv TEST_VAR");
    std::map<std::string, std::string> env = {{"TEST_VAR", "FOUND"}};
    ASSERT_TRUE(proc.start(0, env));

    auto line = proc.read_line(1000, nullptr);
    ASSERT_TRUE(line.has_value());
    EXPECT_EQ(*line, "FOUND");
}

TEST_F(ProcessTest, CommandParsing) {
    Sys::Process proc("./bot arg1 \"arg 2\"");
    auto args = proc.parse_command_args();
    ASSERT_EQ(args.size(), 3);
    EXPECT_EQ(args[0], "./bot");
    EXPECT_EQ(args[1], "arg1");
    EXPECT_EQ(args[2], "arg 2");
}

TEST_F(ProcessTest, IntegrationRealScript) {
    std::string path = TestHelpers::get_test_bot_path("dummy_bot.sh");
    if (path.empty()) return;

    Sys::Process proc(path);
    ASSERT_TRUE(proc.start(0));
    ASSERT_TRUE(proc.write_line("START 20"));

    auto res = proc.read_line(1000, nullptr);
    ASSERT_TRUE(res.has_value());
    EXPECT_EQ(*res, "OK");
}

TEST_F(ProcessTest, ZombieReaping) {
    Sys::Process proc("sh -c 'trap \"\" TERM; sleep 0.1'");
    ASSERT_TRUE(proc.start(0));
    int pid = proc.pid();
    ASSERT_GT(pid, 0);
    proc.terminate();

    EXPECT_EQ(kill(pid, 0), -1);
    EXPECT_EQ(errno, ESRCH);
}

TEST_F(ProcessTest, ReadTimeout) {
    Sys::Process proc("sleep 10");
    ASSERT_TRUE(proc.start(0));

    long elapsed_ms = 0;
    auto line = proc.read_line(50, &elapsed_ms);

    EXPECT_FALSE(line.has_value());
    EXPECT_GE(elapsed_ms, 50);
    proc.terminate();
}

TEST_F(ProcessTest, MultipleLines) {
    Sys::Process proc("printf 'line1\\nline2\\nline3\\n'");
    ASSERT_TRUE(proc.start(0));

    auto line1 = proc.read_line(1000, nullptr);
    auto line2 = proc.read_line(1000, nullptr);
    auto line3 = proc.read_line(1000, nullptr);

    ASSERT_TRUE(line1.has_value());
    ASSERT_TRUE(line2.has_value());
    ASSERT_TRUE(line3.has_value());
    EXPECT_EQ(*line1, "line1");
    EXPECT_EQ(*line2, "line2");
    EXPECT_EQ(*line3, "line3");
}

TEST_F(ProcessTest, PidReporting) {
    Sys::Process proc("echo test");
    ASSERT_TRUE(proc.start(0));
    EXPECT_GT(proc.pid(), 0);
    proc.terminate();
}

TEST_F(ProcessTest, RSSMonitoring) {
    Sys::Process proc("sleep 0.01");
    ASSERT_TRUE(proc.start(0));

    long rss = proc.get_current_rss_kb();
    EXPECT_GE(rss, 0);
    proc.terminate();
}

TEST_F(ProcessTest, ExitStatusSegFault) {
    Sys::Process proc("sh -c 'kill -SEGV $$'");
    proc.start(0);
    EXPECT_THROW(proc.read_line(1000, nullptr), Core::PlayerError);
}

TEST_F(ProcessTest, ExitStatusAbort) {
    Sys::Process proc("sh -c 'kill -ABRT $$'");
    proc.start(0);
    EXPECT_THROW(proc.read_line(1000, nullptr), Core::PlayerError);
}

TEST_F(ProcessTest, ExitStatusKill) {
    Sys::Process proc("sh -c 'kill -KILL $$'");
    proc.start(0);
    EXPECT_THROW(proc.read_line(1000, nullptr), Core::PlayerError);
}

TEST_F(ProcessTest, ElapsedTimeTracking) {
    Sys::Process proc("echo immediate");
    ASSERT_TRUE(proc.start(0));

    long elapsed = 0;
    auto line = proc.read_line(1000, &elapsed);

    EXPECT_TRUE(line.has_value());
    EXPECT_GE(elapsed, 0);
    EXPECT_LT(elapsed, 1000);
}

TEST_F(ProcessTest, CommandParsingEmptyArgs) {
    Sys::Process proc("echo");
    auto args = proc.parse_command_args();
    ASSERT_EQ(args.size(), 1);
    EXPECT_EQ(args[0], "echo");
}

TEST_F(ProcessTest, CommandParsingQuotedSpaces) {
    Sys::Process proc("./cmd --arg \"value with spaces\"");
    auto args = proc.parse_command_args();
    ASSERT_EQ(args.size(), 3);
    EXPECT_EQ(args[2], "value with spaces");
}

TEST_F(ProcessTest, CommandParsingSingleQuotes) {
    Sys::Process proc("./cmd 'single quoted arg'");
    auto args = proc.parse_command_args();
    ASSERT_EQ(args.size(), 2);
    EXPECT_EQ(args[1], "single quoted arg");
}

TEST_F(ProcessTest, CarriageReturnStripping) {
    Sys::Process proc("printf 'hello\\r\\n'");
    ASSERT_TRUE(proc.start(0));
    auto line = proc.read_line(1000, nullptr);
    ASSERT_TRUE(line.has_value());
    EXPECT_EQ(*line, "hello");
}

TEST_F(ProcessTest, MixedNewlines) {
    Sys::Process proc("printf 'line1\\r\\nline2\\nline3\\r\\n'");
    ASSERT_TRUE(proc.start(0));
    auto l1 = proc.read_line(1000, nullptr);
    auto l2 = proc.read_line(1000, nullptr);
    auto l3 = proc.read_line(1000, nullptr);
    ASSERT_TRUE(l1 && l2 && l3);
    EXPECT_EQ(*l1, "line1");
    EXPECT_EQ(*l2, "line2");
    EXPECT_EQ(*l3, "line3");
}

TEST_F(ProcessTest, EmptyLines) {
    Sys::Process proc("printf '\\n\\ndata\\n'");
    ASSERT_TRUE(proc.start(0));
    auto l1 = proc.read_line(1000, nullptr);
    auto l2 = proc.read_line(1000, nullptr);
    auto l3 = proc.read_line(1000, nullptr);
    ASSERT_TRUE(l1 && l2 && l3);
    EXPECT_EQ(*l1, "");
    EXPECT_EQ(*l2, "");
    EXPECT_EQ(*l3, "data");
}

TEST_F(ProcessTest, LongOutput) {
    Sys::Process proc("seq 1 100");
    ASSERT_TRUE(proc.start(0));

    int count = 0;
    try {
        while (auto line = proc.read_line(1000, nullptr)) {
            count++;
            EXPECT_EQ(*line, std::to_string(count));
        }
    } catch (const Core::PlayerError&) {
    }
    EXPECT_EQ(count, 100);
}

TEST_F(ProcessTest, PeakMemoryTracking) {
    Sys::Process proc("sleep 0.01");
    ASSERT_TRUE(proc.start(0));
    proc.terminate();
    EXPECT_GE(proc.get_peak_mem(), 0);
}

TEST_F(ProcessTest, RelativePathResolution) {
    Sys::Process proc("echo test");
    auto args = proc.parse_command_args();
    ASSERT_FALSE(args.empty());
    EXPECT_EQ(args[0], "echo");
}
