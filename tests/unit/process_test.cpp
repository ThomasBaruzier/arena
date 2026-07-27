#include "../common/test_utils.h"
#include "../src/sys/process.h"
#include "../src/sys/signals.h"
#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>

using namespace Arena;

class ProcessTest : public ::testing::Test {};

TEST_F(ProcessTest, BasicLifecycle) {
    Sys::Process process("echo hello");
    ASSERT_TRUE(process.start(0));

    auto line = process.read_line(1000, nullptr);
    ASSERT_TRUE(line.has_value());
    EXPECT_EQ(*line, "hello");

    process.terminate();
    EXPECT_EQ(process.pid(), 0);
    EXPECT_EQ(process.in_fd_, -1);
    EXPECT_EQ(process.out_fd_, -1);
}

TEST_F(ProcessTest, EnvironmentVariables) {
    Sys::Process process("printenv TEST_VAR");
    std::map<std::string, std::string> environment = {
        {"TEST_VAR", "FOUND"}
    };

    ASSERT_TRUE(process.start(0, environment));

    auto line = process.read_line(1000, nullptr);
    ASSERT_TRUE(line.has_value());
    EXPECT_EQ(*line, "FOUND");
}

TEST_F(ProcessTest, SensitiveEnvironmentVariablesAreRemoved) {
    setenv("API_KEY", "secret", 1);
    setenv("GITHUB_TOKEN", "secret", 1);

    Sys::Process process(
        "sh -c 'if env | grep -Eq "
        "\"^(API_KEY|GITHUB_TOKEN)=\"; "
        "then echo leaked; else echo scrubbed; fi'"
    );

    bool started = process.start(0);
    unsetenv("API_KEY");
    unsetenv("GITHUB_TOKEN");

    ASSERT_TRUE(started);

    auto line = process.read_line(1000, nullptr);
    ASSERT_TRUE(line.has_value());
    EXPECT_EQ(*line, "scrubbed");
}

TEST_F(ProcessTest, ExplicitSensitiveEnvironmentVariablesAreRemoved) {
    Sys::Process process(
        "sh -c 'if env | grep -Eq "
        "\"^(API_KEY|PROD_WRITE_TOKEN)=\"; "
        "then echo leaked; else echo scrubbed; fi'"
    );

    std::map<std::string, std::string> environment = {
        {"API_KEY", "secret"},
        {"PROD_WRITE_TOKEN", "secret"},
        {"GOMOKU_SEED", "42"}
    };

    ASSERT_TRUE(process.start(0, environment));

    auto line = process.read_line(1000, nullptr);
    ASSERT_TRUE(line.has_value());
    EXPECT_EQ(*line, "scrubbed");
}

TEST_F(ProcessTest, CommandParsing) {
    Sys::Process process("./bot arg1 \"arg 2\"");
    auto args = process.parse_command_args();

    ASSERT_EQ(args.size(), 3);
    EXPECT_EQ(args[0], "./bot");
    EXPECT_EQ(args[1], "arg1");
    EXPECT_EQ(args[2], "arg 2");
}

TEST_F(ProcessTest, IntegrationRealScript) {
    std::string path =
        TestHelpers::get_test_bot_path("dummy_bot.sh");

    if (path.empty()) return;

    Sys::Process process(path);
    ASSERT_TRUE(process.start(0));
    ASSERT_TRUE(process.write_line("START 20"));

    auto response = process.read_line(1000, nullptr);
    ASSERT_TRUE(response.has_value());
    EXPECT_EQ(*response, "OK");
}

TEST_F(ProcessTest, ZombieReaping) {
    Sys::Process process(
        "sh -c 'trap \"\" TERM; sleep 0.1'"
    );

    ASSERT_TRUE(process.start(0));

    pid_t pid = process.pid();
    ASSERT_GT(pid, 0);

    process.terminate();

    EXPECT_EQ(kill(pid, 0), -1);
    EXPECT_EQ(errno, ESRCH);
}

TEST_F(ProcessTest, ReadTimeout) {
    Sys::Process process("sleep 10");
    ASSERT_TRUE(process.start(0));

    long elapsed_ms = 0;
    auto line = process.read_line(50, &elapsed_ms);

    EXPECT_FALSE(line.has_value());
    EXPECT_GE(elapsed_ms, 50);

    process.terminate();
}

TEST_F(ProcessTest, MultipleLines) {
    Sys::Process process(
        "printf 'line1\\nline2\\nline3\\n'"
    );

    ASSERT_TRUE(process.start(0));

    auto line1 = process.read_line(1000, nullptr);
    auto line2 = process.read_line(1000, nullptr);
    auto line3 = process.read_line(1000, nullptr);

    ASSERT_TRUE(line1.has_value());
    ASSERT_TRUE(line2.has_value());
    ASSERT_TRUE(line3.has_value());

    EXPECT_EQ(*line1, "line1");
    EXPECT_EQ(*line2, "line2");
    EXPECT_EQ(*line3, "line3");
}

TEST_F(ProcessTest, PidReporting) {
    Sys::Process process("echo test");

    ASSERT_TRUE(process.start(0));
    EXPECT_GT(process.pid(), 0);

    process.terminate();
}

TEST_F(ProcessTest, RSSMonitoring) {
    Sys::Process process("sleep 0.01");

    ASSERT_TRUE(process.start(0));

    long rss = process.get_current_rss_kb();
    EXPECT_GE(rss, 0);

    process.terminate();
}

TEST_F(ProcessTest, ExitStatusSegFault) {
    Sys::Process process("sh -c 'kill -SEGV $$'");
    ASSERT_TRUE(process.start(0));

    EXPECT_THROW(
        {
            for (int i = 0; i < 100; ++i) {
                if (!process.read_line(1000, nullptr)) break;
            }
        },
        Core::PlayerError
    );
}

TEST_F(ProcessTest, ExitStatusAbort) {
    Sys::Process process("sh -c 'kill -ABRT $$'");
    ASSERT_TRUE(process.start(0));

    EXPECT_THROW(
        {
            for (int i = 0; i < 100; ++i) {
                if (!process.read_line(1000, nullptr)) break;
            }
        },
        Core::PlayerError
    );
}

TEST_F(ProcessTest, ExitStatusKill) {
    Sys::Process process("sh -c 'kill -KILL $$'");
    ASSERT_TRUE(process.start(0));

    EXPECT_THROW(
        {
            for (int i = 0; i < 100; ++i) {
                if (!process.read_line(1000, nullptr)) break;
            }
        },
        Core::PlayerError
    );
}

TEST_F(ProcessTest, ElapsedTimeTracking) {
    Sys::Process process("echo immediate");

    ASSERT_TRUE(process.start(0));

    long elapsed = 0;
    auto line = process.read_line(1000, &elapsed);

    EXPECT_TRUE(line.has_value());
    EXPECT_GE(elapsed, 0);
    EXPECT_LT(elapsed, 1000);
}

TEST_F(ProcessTest, CommandParsingEmptyArgs) {
    Sys::Process process("echo");
    auto args = process.parse_command_args();

    ASSERT_EQ(args.size(), 1);
    EXPECT_EQ(args[0], "echo");
}

TEST_F(ProcessTest, CommandParsingQuotedSpaces) {
    Sys::Process process(
        "./cmd --arg \"value with spaces\""
    );

    auto args = process.parse_command_args();

    ASSERT_EQ(args.size(), 3);
    EXPECT_EQ(args[2], "value with spaces");
}

TEST_F(ProcessTest, CommandParsingSingleQuotes) {
    Sys::Process process("./cmd 'single quoted arg'");
    auto args = process.parse_command_args();

    ASSERT_EQ(args.size(), 2);
    EXPECT_EQ(args[1], "single quoted arg");
}

TEST_F(ProcessTest, CarriageReturnStripping) {
    Sys::Process process("printf 'hello\\r\\n'");

    ASSERT_TRUE(process.start(0));

    auto line = process.read_line(1000, nullptr);

    ASSERT_TRUE(line.has_value());
    EXPECT_EQ(*line, "hello");
}

TEST_F(ProcessTest, MixedNewlines) {
    Sys::Process process(
        "printf 'line1\\r\\nline2\\nline3\\r\\n'"
    );

    ASSERT_TRUE(process.start(0));

    auto line1 = process.read_line(1000, nullptr);
    auto line2 = process.read_line(1000, nullptr);
    auto line3 = process.read_line(1000, nullptr);

    ASSERT_TRUE(line1 && line2 && line3);
    EXPECT_EQ(*line1, "line1");
    EXPECT_EQ(*line2, "line2");
    EXPECT_EQ(*line3, "line3");
}

TEST_F(ProcessTest, EmptyLines) {
    Sys::Process process("printf '\\n\\ndata\\n'");

    ASSERT_TRUE(process.start(0));

    auto line1 = process.read_line(1000, nullptr);
    auto line2 = process.read_line(1000, nullptr);
    auto line3 = process.read_line(1000, nullptr);

    ASSERT_TRUE(line1 && line2 && line3);
    EXPECT_EQ(*line1, "");
    EXPECT_EQ(*line2, "");
    EXPECT_EQ(*line3, "data");
}

TEST_F(ProcessTest, LongOutput) {
    Sys::Process process("seq 1 100");

    ASSERT_TRUE(process.start(0));

    int count = 0;

    try {
        while (
            auto line =
                process.read_line(1000, nullptr)
        ) {
            ++count;
            EXPECT_EQ(*line, std::to_string(count));
        }
    } catch (const Core::PlayerError&) {
    }

    EXPECT_EQ(count, 100);
}

TEST_F(ProcessTest, PeakMemoryTracking) {
    Sys::Process process("sleep 0.01");

    ASSERT_TRUE(process.start(0));
    process.terminate();

    EXPECT_GE(process.get_peak_mem(), 0);
}

TEST_F(ProcessTest, RelativePathResolution) {
    Sys::Process process("echo test");
    auto args = process.parse_command_args();

    ASSERT_FALSE(args.empty());
    EXPECT_EQ(args[0], "echo");
}

TEST_F(ProcessTest, RejectsSecondStartWhileRunning) {
    Sys::Process process("sleep 10");

    ASSERT_TRUE(process.start(0));
    EXPECT_FALSE(process.start(0));

    process.terminate();
}

TEST_F(ProcessTest, ReusesInstanceWithoutBufferedOutput) {
    setenv("PROCESS_REUSE_VALUE", "first", 1);

    Sys::Process process(
        "sh -c 'printf \"%s\\n\" "
        "\"$PROCESS_REUSE_VALUE\"; "
        "printf \"stale\\n\"'"
    );

    ASSERT_TRUE(process.start(0));
    auto first = process.read_line(1000, nullptr);
    ASSERT_TRUE(first.has_value());
    EXPECT_EQ(*first, "first");
    process.terminate();

    setenv("PROCESS_REUSE_VALUE", "second", 1);

    ASSERT_TRUE(process.start(0));
    auto second = process.read_line(1000, nullptr);
    ASSERT_TRUE(second.has_value());
    EXPECT_EQ(*second, "second");
    process.terminate();

    unsetenv("PROCESS_REUSE_VALUE");
}

TEST_F(ProcessTest, TerminatesAlreadyExitedChild) {
    Sys::Process process("true");

    ASSERT_TRUE(process.start(0));
    std::this_thread::sleep_for(
        std::chrono::milliseconds(20)
    );

    EXPECT_NO_THROW(process.terminate());
    EXPECT_EQ(process.pid(), 0);
    EXPECT_EQ(process.in_fd_, -1);
    EXPECT_EQ(process.out_fd_, -1);
}

TEST_F(ProcessTest, RepeatedLifecycleDoesNotLeakDescriptors) {
    int before = TestHelpers::get_fd_count();
    ASSERT_GE(before, 0);

    Sys::Process process("true");

    for (int i = 0; i < 40; ++i) {
        ASSERT_TRUE(process.start(0));
        process.terminate();
        EXPECT_EQ(process.in_fd_, -1);
        EXPECT_EQ(process.out_fd_, -1);
    }

    int after = TestHelpers::get_fd_count();
    ASSERT_GE(after, 0);
    EXPECT_LE(after, before + 1);
}

TEST_F(ProcessTest, ChildDoesNotInheritBlockedTerminationSignals) {
    sigset_t blocked;
    sigset_t previous;
    sigemptyset(&blocked);
    sigaddset(&blocked, SIGTERM);
    ASSERT_EQ(
        sigprocmask(SIG_BLOCK, &blocked, &previous),
        0
    );

    Sys::Process process(
        "sh -c 'kill -TERM $$; echo survived'"
    );
    bool started = process.start(0);

    ASSERT_EQ(
        sigprocmask(SIG_SETMASK, &previous, nullptr),
        0
    );
    ASSERT_TRUE(started);

    bool terminated = false;

    try {
        auto line = process.read_line(1000, nullptr);
        terminated = !line.has_value();
    } catch (const Core::PlayerError&) {
        terminated = true;
    }

    EXPECT_TRUE(terminated);
    process.terminate();
}

TEST_F(ProcessTest, TerminationSignalCleansChildProcess) {
    int descriptors[2];
    ASSERT_EQ(pipe(descriptors), 0);

    pid_t controller = fork();
    ASSERT_GE(controller, 0);

    if (controller == 0) {
        close(descriptors[0]);
        Sys::g_stop_flag = 0;

        if (!Sys::install_termination_handlers()) {
            _exit(2);
        }

        Sys::Process process("sleep 3600");

        if (!process.start(0)) {
            _exit(3);
        }

        pid_t child = process.pid();
        ssize_t written;

        do {
            written = write(
                descriptors[1],
                &child,
                sizeof(child)
            );
        } while (written < 0 && errno == EINTR);

        close(descriptors[1]);

        if (written != static_cast<ssize_t>(sizeof(child))) {
            process.terminate();
            _exit(4);
        }

        while (!Sys::g_stop_flag) {
            usleep(10000);
        }

        process.terminate();
        _exit(0);
    }

    close(descriptors[1]);

    pid_t child = -1;
    size_t received = 0;

    while (received < sizeof(child)) {
        ssize_t count = read(
            descriptors[0],
            reinterpret_cast<char*>(&child) + received,
            sizeof(child) - received
        );

        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) break;
        received += static_cast<size_t>(count);
    }

    close(descriptors[0]);

    if (received != sizeof(child) || child <= 0) {
        kill(controller, SIGKILL);
        waitpid(controller, nullptr, 0);
        FAIL() << "Controller did not report its child";
    }

    ASSERT_EQ(kill(controller, SIGTERM), 0);

    int status = 0;
    bool controller_exited = false;

    for (int i = 0; i < 300; ++i) {
        pid_t result = waitpid(
            controller,
            &status,
            WNOHANG
        );

        if (result == controller) {
            controller_exited = true;
            break;
        }

        ASSERT_NE(result, -1);
        std::this_thread::sleep_for(
            std::chrono::milliseconds(10)
        );
    }

    if (!controller_exited) {
        kill(controller, SIGKILL);
        waitpid(controller, &status, 0);
    }

    EXPECT_TRUE(controller_exited);
    ASSERT_TRUE(WIFEXITED(status));
    EXPECT_EQ(WEXITSTATUS(status), 0);

    bool child_gone = false;

    for (int i = 0; i < 100; ++i) {
        if (kill(child, 0) == -1 && errno == ESRCH) {
            child_gone = true;
            break;
        }

        std::this_thread::sleep_for(
            std::chrono::milliseconds(10)
        );
    }

    EXPECT_TRUE(child_gone);
}
