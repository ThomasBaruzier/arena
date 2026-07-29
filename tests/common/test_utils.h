#pragma once

#include <gtest/gtest.h>
#include <chrono>
#include <dirent.h>
#include <fstream>
#include <functional>
#include <limits.h>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <unistd.h>
#include <vector>

#define private public
#define protected public

#include "../src/app/context.h"
#include "../src/app/worker.h"
#include "../src/core/config_types.h"
#include "../src/game/referee.h"
#include "../src/sys/process.h"

namespace TestHelpers {

class MockProcess :
    public Arena::Sys::Process {
public:
    using Responder =
        std::function<
            std::string(
                const std::string&
            )
        >;

    explicit MockProcess(
        Responder responder
    ) :
        Arena::Sys::Process("mock"),
        responder_(
            std::move(responder)
        )
    {}

    bool start(
        long long,
        const std::map<
            std::string,
            std::string
        >&
    ) override {
        return true;
    }

    void terminate() override {}

    bool write_line(
        const std::string& line
    ) override {
        last_cmd_ = line;
        return true;
    }

    std::optional<std::string> read_line(
        int,
        long* elapsed
    ) override {
        if (elapsed) {
            *elapsed = 1;
        }

        std::string response =
            responder_(last_cmd_);

        if (
            response ==
            "__TIMEOUT__"
        ) {
            return std::nullopt;
        }

        if (
            response ==
            "__CRASH__"
        ) {
            throw std::runtime_error(
                "Mock process crashed"
            );
        }

        return response;
    }

    long get_peak_mem() const override {
        return 1024;
    }

    long get_current_rss_kb() const override {
        return 1024;
    }

    pid_t pid() const override {
        return 12345;
    }

private:
    std::string last_cmd_;
    Responder responder_;
};

inline Arena::Game::ResultCallback
make_handler() {
    return [](
        int,
        int,
        double,
        long
    ) {};
}

inline int get_fd_count() {
    int count = 0;
    char path[64];

    snprintf(
        path,
        sizeof(path),
        "/proc/%d/fd",
        getpid()
    );

    DIR* directory =
        opendir(path);

    if (!directory) {
        return -1;
    }

    while (readdir(directory)) {
        count++;
    }

    closedir(directory);
    return count;
}

inline std::string get_test_bot_path(
    const std::string& name
) {
    char cwd[1024];

    if (
        getcwd(
            cwd,
            sizeof(cwd)
        ) != nullptr
    ) {
        return
            std::string(cwd) +
            "/tests/test_bots/" +
            name;
    }

    return "";
}

}
