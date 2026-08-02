#pragma once

#include <map>
#include <memory>
#include <string>
#include "../sys/process.h"

namespace Arena::Game {

class Player {
public:
    Player(
        std::string path,
        std::string id,
        std::unique_ptr<Sys::Process> process = nullptr
    );

    bool start(
        long long memory,
        const std::map<std::string, std::string>& environment = {}
    );

    void stop() {
        process_->terminate();
    }

    long peak_mem() const {
        return process_->get_peak_mem();
    }

    long current_rss_kb() const {
        return process_->get_current_rss_kb();
    }

    std::string name() const {
        return name_;
    }

    std::string version() const {
        return version_;
    }

    pid_t pid() const {
        return process_->pid();
    }

    std::string path() const {
        return path_;
    }

    void send(const std::string& command);
    std::string read(int timeout, long& elapsed);
    void meta();

    void set_lenient(bool lenient) {
        lenient_ = lenient;
    }

private:
    bool is_message_or_debug(const std::string& response);
    void extract_name(const std::string& response);
    void extract_version(const std::string& response);

    std::unique_ptr<Sys::Process> process_;
    std::string id_;
    std::string name_;
    std::string path_;
    std::string version_;
    bool lenient_ = false;
};

}
