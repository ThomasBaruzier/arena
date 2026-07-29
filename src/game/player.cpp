#include "player.h"
#include "../core/constants.h"
#include "../core/logger.h"
#include "../core/utils.h"
#include "../core/types.h"
#include <algorithm>
#include <chrono>
#include <regex>

namespace Arena::Game {

Player::Player(
    std::string path,
    std::string id,
    std::unique_ptr<Sys::Process> proc
) :
    proc_(std::move(proc)),
    id_(std::move(id)),
    path_(std::move(path)),
    version_("unknown")
{
    if (!proc_) {
        proc_ =
            std::make_unique<
                Sys::Process
            >(path_);
    }

    name_ =
        path_.substr(
            path_.find_last_of("/\\") + 1
        );
}

bool Player::start(
    long long memory,
    const std::map<
        std::string,
        std::string
    >& environment
) {
    bool started =
        proc_->start(
            memory,
            environment
        );

    if (started) {
        Core::Logger::log(
            Core::Logger::Level::DEBUG,
            "Started ",
            id_,
            " (",
            name_,
            ") PID: ",
            proc_->pid()
        );
    }

    return started;
}

void Player::send(
    const std::string& command
) {
    if (Core::Logger::is_debug()) {
        Core::Logger::log(
            Core::Logger::Level::DEBUG,
            "-> ",
            id_,
            " (",
            command.size(),
            "B): ",
            Core::Utils::truncate(
                command
            )
        );
    }

    if (!proc_->write_line(command)) {
        throw std::runtime_error(
            "Write to process failed"
        );
    }
}

std::string Player::read(
    int timeout,
    long& elapsed
) {
    auto started =
        std::chrono::steady_clock::now();

    long reported_elapsed = 0;
    int safe_timeout =
        std::max(0, timeout);

    auto current_elapsed = [&]() {
        long wall_elapsed =
            static_cast<long>(
                std::chrono::duration_cast<
                    std::chrono::milliseconds
                >(
                    std::chrono::steady_clock::now() -
                    started
                ).count()
            );

        return std::max(
            reported_elapsed,
            wall_elapsed
        );
    };

    while (true) {
        long used =
            current_elapsed();

        if (used >= safe_timeout) {
            elapsed = used;
            throw Core::PlayerError(
                "Timeout"
            );
        }

        long turn_elapsed = 0;
        std::optional<std::string> line;

        try {
            line = proc_->read_line(
                std::max(
                    1,
                    safe_timeout -
                        static_cast<int>(used)
                ),
                &turn_elapsed
            );
        } catch (...) {
            reported_elapsed +=
                std::max(
                    0L,
                    turn_elapsed
                );
            elapsed =
                current_elapsed();
            throw;
        }

        reported_elapsed +=
            std::max(
                0L,
                turn_elapsed
            );

        if (!line) {
            elapsed =
                current_elapsed();
            throw Core::PlayerError(
                "Timeout"
            );
        }

        std::string response =
            std::move(*line);

        if (Core::Logger::is_debug()) {
            Core::Logger::log(
                Core::Logger::Level::DEBUG,
                "<- ",
                id_,
                " (",
                response.size(),
                "B): ",
                Core::Utils::truncate(
                    response
                )
            );
        }

        if (response.empty()) {
            continue;
        }

        if (
            is_message_or_debug(
                response
            )
        ) {
            Core::Logger::log(
                Core::Logger::Level::INFO,
                "[",
                id_,
                "] ",
                response
            );
            continue;
        }

        if (
            response.rfind(
                "UNKNOWN",
                0
            ) == 0
        ) {
            Core::Logger::log(
                Core::Logger::Level::WARN,
                id_,
                " UNKNOWN cmd: ",
                response
            );
            continue;
        }

        static const std::regex
            move_pattern(
                "^[0-9]+,[0-9]+$"
            );

        static const std::regex
            ok_pattern("^OK$");

        bool looks_valid =
            std::regex_match(
                response,
                move_pattern
            ) ||
            std::regex_match(
                response,
                ok_pattern
            );

        if (
            !looks_valid &&
            lenient_
        ) {
            Core::Logger::log(
                Core::Logger::Level::WARN,
                id_,
                " (ignored garbage): ",
                Core::Utils::truncate(
                    response
                )
            );
            continue;
        }

        elapsed =
            current_elapsed();

        return response;
    }
}

void Player::meta() {
    send("ABOUT");

    long elapsed = 0;

    std::string response =
        read(
            Core::Constants::
                META_TIMEOUT_MS,
            elapsed
        );

    extract_name(response);
    extract_version(response);
}

bool Player::is_message_or_debug(
    const std::string& response
) {
    return
        response.rfind(
            "MESSAGE",
            0
        ) == 0 ||
        response.rfind(
            "DEBUG",
            0
        ) == 0 ||
        response.find(
            "Command not found"
        ) != std::string::npos;
}

void Player::extract_name(
    const std::string& response
) {
    static const std::regex
        name_pattern(
            "name=\"([^\"]+)\""
        );

    std::smatch match;

    if (
        !std::regex_search(
            response,
            match,
            name_pattern
        ) ||
        match.size() <= 1
    ) {
        return;
    }

    std::string extracted_name =
        match[1].str();

    static const std::regex
        valid_name_pattern(
            "^[a-zA-Z0-9 _.-]{1,16}$"
        );

    if (
        std::regex_match(
            extracted_name,
            valid_name_pattern
        )
    ) {
        name_ =
            std::move(
                extracted_name
            );
        return;
    }

    Core::Logger::log(
        Core::Logger::Level::WARN,
        "Bot ",
        path_,
        " invalid name: '",
        extracted_name,
        "'."
    );
}

void Player::extract_version(
    const std::string& response
) {
    static const std::regex
        version_pattern(
            "version=\"([^\"]+)\""
        );

    std::smatch match;

    if (
        !std::regex_search(
            response,
            match,
            version_pattern
        ) ||
        match.size() <= 1
    ) {
        return;
    }

    std::string raw_version =
        match[1].str();

    static const std::regex
        clean_version_pattern(
            "^([0-9]+(?:\\.[0-9]+)*)"
        );

    std::smatch clean_match;

    if (
        std::regex_search(
            raw_version,
            clean_match,
            clean_version_pattern
        ) &&
        clean_match.size() > 1
    ) {
        version_ =
            clean_match[1].str();
    } else {
        version_ =
            raw_version.substr(
                0,
                Core::Constants::
                    MAX_VERSION_LENGTH
            );
    }
}

}
