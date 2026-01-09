#pragma once

#include <string>
#include <vector>
#include <map>
#include <optional>
#include <unistd.h>
#include <sys/types.h>

namespace Arena::Sys {

class Process {
public:
    Process(const std::string& cmd);
    virtual ~Process() { terminate(); }
    Process(const Process&) = delete;
    Process& operator=(const Process&) = delete;

    virtual bool start(
        long long max_mem_bytes,
        const std::map<std::string, std::string>& env_vars = {}
    );
    virtual void terminate();
    virtual bool write_line(const std::string& line);
    virtual std::optional<std::string> read_line(int timeout_ms, long* elapsed_ms);

    virtual long get_peak_mem() const { return peak_mem_kb_; }
    virtual pid_t pid() const { return pid_; }
    virtual long get_current_rss_kb() const;

    int in_fd_ = -1;
    int out_fd_ = -1;
    pid_t pid_ = 0;

protected:
    virtual std::vector<std::string> parse_command_args();

private:
    void start_child_process(
        int in[2], int out[2], long long mem_bytes,
        char** argv, char** envp
    );
    void send_end_signal();
    void wait_or_kill();
    void close_fds();
    bool write_all(const std::string& data);
    std::optional<std::string> try_extract_line();
    std::string reap_exit_status();
    void read_available_data(int timeout_ms);
    static std::string decode_exit_status(int status);

    std::string cmd_;
    std::string buf_;
    size_t buf_pos_ = 0;
    long peak_mem_kb_ = 0;
};

}
