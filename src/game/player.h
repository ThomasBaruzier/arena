#pragma once

#include <string>
#include <memory>
#include "../sys/process.h"

namespace Arena::Game {
    class Player {
    public:
        Player(std::string path, std::string id,
            std::unique_ptr<Sys::Process> proc = nullptr);
        bool start(long long mem, const std::map<std::string,
            std::string>& env_vars = {});
        void stop() { proc_->terminate(); }
        long peak_mem() const { return proc_->get_peak_mem(); }
        long current_rss_kb() const { return proc_->get_current_rss_kb(); }
        std::string name() const { return name_; }
        std::string version() const { return version_; }
        pid_t pid() const { return proc_->pid(); }
        void send(const std::string& cmd);
        std::string read(int timeout, long& elapsed);
        void meta();

    private:
        bool is_message_or_debug(const std::string& s);
        void extract_name(const std::string& s);
        void extract_version(const std::string& s);

        std::unique_ptr<Sys::Process> proc_;
        std::string id_, name_, path_, version_;
    };
}
