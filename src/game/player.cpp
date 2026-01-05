#include "player.h"
#include "../core/constants.h"
#include "../core/logger.h"
#include "../core/types.h"
#include <regex>

namespace Arena::Game {

    Player::Player(
        std::string path, std::string id,
        std::unique_ptr<Sys::Process> proc
    ) : proc_(std::move(proc)), id_(id), path_(path)
    {
        if (!proc_)
            proc_ = std::make_unique<Sys::Process>(path);
        name_ = path.substr(path.find_last_of("/\\") + 1);
    }

    bool Player::start(
        long long mem, const std::map<std::string, std::string>& env_vars)
    {
        return proc_->start(mem, env_vars);
    }

    void Player::send(const std::string& cmd) {
        Core::Logger::log(
            Core::Logger::Level::DEBUG, "-> ", id_, ": ", cmd
        );
        if (!proc_->write_line(cmd))
            throw std::runtime_error("Write to process failed");
    }

    std::string Player::read(int timeout, long& elapsed) {
        long total_elapsed = 0;
        while (true) {
            long turn_elapsed = 0;
            auto line = proc_->read_line(timeout, &turn_elapsed);
            total_elapsed += turn_elapsed;

            if (!line) {
                elapsed = total_elapsed;
                throw Core::PlayerError("Timeout");
            }

            std::string s = *line;
            if (is_message_or_debug(s)) {
                Core::Logger::log(
                    Core::Logger::Level::INFO,
                    id_, " says: ", s
                );
                timeout = std::max(
                    Core::Constants::MIN_TURN_TIMEOUT_MS,
                    timeout - (int)turn_elapsed
                );
                continue;
            }

            if (s.rfind("UNKNOWN", 0) == 0) {
                Core::Logger::log(
                    Core::Logger::Level::WARN,
                    id_, " UNKNOWN cmd: ", s
                );
                timeout = std::max(
                    Core::Constants::MIN_TURN_TIMEOUT_MS,
                    timeout - (int)turn_elapsed
                );
                continue;
            }

            elapsed = total_elapsed;
            return s;
        }
    }

    void Player::meta() {
        send("ABOUT");
        long ign = 0;
        std::string s = read(Core::Constants::META_TIMEOUT_MS, ign);
        extract_name(s);
        extract_version(s);
    }

    bool Player::is_message_or_debug(const std::string& s) {
        return s.rfind("MESSAGE", 0) == 0 || s.rfind("DEBUG", 0) == 0;
    }

    void Player::extract_name(const std::string& s) {
        static const std::regex name_re("name=\"([^\"]+)\"");
        std::smatch m;
        if (!std::regex_search(s, m, name_re) || m.size() <= 1) return;

        std::string extracted_name = m[1].str();
        static const std::regex valid_name_re("^[a-zA-Z0-9 _.-]{1,16}$");

        if (std::regex_match(extracted_name, valid_name_re)) {
            name_ = extracted_name;
        } else {
            Core::Logger::log(
                Core::Logger::Level::WARN, "Bot ", path_,
                " invalid name: '", extracted_name, "'."
            );
        }
    }

    void Player::extract_version(const std::string& s) {
        static const std::regex ver_re("version=\"([^\"]+)\"");
        std::smatch m;
        if (!std::regex_search(s, m, ver_re) || m.size() <= 1)
            return;

        std::string raw_ver = m[1].str();
        static const std::regex clean_ver_re("^([0-9]+(?:\\.[0-9]+)*)");
        std::smatch vm;

        if (std::regex_search(raw_ver, vm, clean_ver_re) && vm.size() > 1)
            version_ = vm[1].str();
        else version_ = raw_ver.substr(
            0, Core::Constants::MAX_VERSION_LENGTH
        );
    }
}
