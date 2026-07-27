#include "process.h"
#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cctype>
#include <cstring>
#include <fcntl.h>
#include <poll.h>
#include <set>
#include <signal.h>
#include <sstream>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/wait.h>
#include <thread>
#include <wordexp.h>
#include "../core/constants.h"
#include "../core/types.h"
#include "signals.h"

extern char** environ;

namespace {

std::string environment_name(const std::string& entry) {
    size_t pos = entry.find('=');
    return pos == std::string::npos ? entry : entry.substr(0, pos);
}

bool has_suffix(
    const std::string& value,
    const std::string& suffix
) {
    return value.size() >= suffix.size() &&
        value.compare(
            value.size() - suffix.size(),
            suffix.size(),
            suffix
        ) == 0;
}

bool is_sensitive_environment_name(const std::string& name) {
    std::string upper = name;
    std::transform(
        upper.begin(),
        upper.end(),
        upper.begin(),
        [](unsigned char c) {
            return static_cast<char>(std::toupper(c));
        }
    );

    if (
        upper == "API_KEY" ||
        upper == "GOMOKU_API_KEY" ||
        upper == "GITHUB_TOKEN" ||
        upper == "GH_TOKEN" ||
        upper == "SSH_AUTH_SOCK" ||
        upper == "SSH_AGENT_PID"
    ) {
        return true;
    }

    return has_suffix(upper, "_KEY") ||
        has_suffix(upper, "_TOKEN") ||
        has_suffix(upper, "_SECRET");
}

}

namespace Arena::Sys {

Process::Process(const std::string& cmd) : cmd_(cmd) {}

bool Process::start(
    long long max_mem_bytes,
    const std::map<std::string, std::string>& env_vars
) {
    if (pid_ > 0) {
        int status = 0;
        struct rusage usage {};
        pid_t result;

        do {
            result = wait4(pid_, &status, WNOHANG, &usage);
        } while (result < 0 && errno == EINTR);

        if (result == 0) return false;
        if (result < 0 && errno != ECHILD) return false;
        pid_ = 0;
    }

    close_fds();
    buf_.clear();
    buf_pos_ = 0;
    peak_mem_kb_ = 0;

    auto args = parse_command_args();
    if (args.empty()) return false;

    if (
        args[0].find('/') == std::string::npos &&
        access(args[0].c_str(), F_OK) == 0
    ) {
        args[0] = "./" + args[0];
    }

    std::string resolved_path = resolve_path(args[0]);

    std::vector<char*> c_args;
    c_args.reserve(args.size() + 1);
    for (auto& arg : args) {
        c_args.push_back(arg.data());
    }
    c_args.push_back(nullptr);

    std::set<std::string> overridden_names;
    for (const auto& [key, value] : env_vars) {
        static_cast<void>(value);
        if (!is_sensitive_environment_name(key)) {
            overridden_names.insert(key);
        }
    }

    std::vector<std::string> env_storage;
    for (char** env = environ; *env; ++env) {
        std::string entry(*env);
        std::string name = environment_name(entry);

        if (is_sensitive_environment_name(name)) continue;
        if (overridden_names.find(name) != overridden_names.end()) {
            continue;
        }

        env_storage.push_back(std::move(entry));
    }

    for (const auto& [key, value] : env_vars) {
        if (is_sensitive_environment_name(key)) continue;
        env_storage.emplace_back(key + "=" + value);
    }

    std::vector<char*> envp;
    envp.reserve(env_storage.size() + 1);
    for (auto& entry : env_storage) {
        envp.push_back(entry.data());
    }
    envp.push_back(nullptr);

    int in[2];
    int out[2];

    if (pipe2(in, O_CLOEXEC) != 0) return false;

    if (pipe2(out, O_CLOEXEC) != 0) {
        close(in[0]);
        close(in[1]);
        return false;
    }

    pid_ = fork();

    if (pid_ < 0) {
        close(in[0]);
        close(in[1]);
        close(out[0]);
        close(out[1]);
        pid_ = 0;
        return false;
    }

    if (pid_ == 0) {
        start_child_process(
            in,
            out,
            max_mem_bytes,
            c_args.data(),
            envp.data(),
            resolved_path.c_str()
        );
    }

    in_fd_ = in[1];
    out_fd_ = out[0];
    close(in[0]);
    close(out[1]);
    return true;
}

void Process::terminate() {
    if (pid_ > 0) {
        send_end_signal();
        wait_or_kill();
    }

    close_fds();
    pid_ = 0;
}

bool Process::write_line(const std::string& line) {
    if (pid_ <= 0 || in_fd_ < 0) return false;
    return write_all(line + "\n");
}

std::optional<std::string> Process::read_line(
    int timeout_ms,
    long* elapsed_ms
) {
    if (pid_ <= 0 || out_fd_ < 0) return std::nullopt;

    auto start = std::chrono::steady_clock::now();

    while (true) {
        if (g_stop_flag) throw Core::MatchTerminated();

        if (auto line = try_extract_line()) {
            if (elapsed_ms) {
                auto now = std::chrono::steady_clock::now();
                *elapsed_ms =
                    std::chrono::duration_cast<std::chrono::milliseconds>(
                        now - start
                    ).count();
            }
            return line;
        }

        auto now = std::chrono::steady_clock::now();
        long used =
            std::chrono::duration_cast<std::chrono::milliseconds>(
                now - start
            ).count();

        if (used >= timeout_ms) {
            int status = 0;
            struct rusage usage {};
            pid_t result;

            do {
                result = wait4(pid_, &status, WNOHANG, &usage);
            } while (result < 0 && errno == EINTR);

            if (result > 0) {
                peak_mem_kb_ = usage.ru_maxrss;
                pid_ = 0;
                close_fds();
                throw Core::PlayerError(
                    "Process died: " + decode_exit_status(status)
                );
            }

            if (result < 0 && errno == ECHILD) {
                pid_ = 0;
                close_fds();
                throw Core::PlayerError(
                    "Process died: Process already reaped"
                );
            }

            if (elapsed_ms) *elapsed_ms = used;
            return std::nullopt;
        }

        int remaining = std::min(
            static_cast<int>(timeout_ms - used),
            Core::Constants::POLL_TIMEOUT_MS
        );
        read_available_data(std::max(0, remaining));
    }
}

long Process::get_current_rss_kb() const {
    if (pid_ <= 0) return 0;

    char path[Core::Constants::PATH_BUFFER_SIZE];
    snprintf(path, sizeof(path), "/proc/%d/statm", pid_);

    FILE* file = fopen(path, "r");
    if (!file) return 0;

    long pages = 0;
    if (fscanf(file, "%*d %ld", &pages) != 1) {
        pages = 0;
    }
    fclose(file);

    return pages * (sysconf(_SC_PAGESIZE) / 1024);
}

void Process::start_child_process(
    int in[2],
    int out[2],
    long long mem_bytes,
    char** argv,
    char** envp,
    const char* path
) {
    sigset_t signal_mask;
    sigemptyset(&signal_mask);
    sigprocmask(SIG_SETMASK, &signal_mask, nullptr);

    setpgid(0, 0);
    prctl(PR_SET_PDEATHSIG, SIGTERM);

    if (mem_bytes > 0) {
        struct rlimit limit {};
        limit.rlim_cur = mem_bytes;
        limit.rlim_max = mem_bytes;
        setrlimit(RLIMIT_AS, &limit);
    }

    dup2(in[0], STDIN_FILENO);
    dup2(out[1], STDOUT_FILENO);
    dup2(out[1], STDERR_FILENO);

    close(in[0]);
    close(in[1]);
    close(out[0]);
    close(out[1]);

    execve(path, argv, envp);
    _exit(Core::Constants::EXIT_CODE_EXEC_FAILED);
}

std::vector<std::string> Process::parse_command_args() {
    std::vector<std::string> args;
    wordexp_t parsed {};

    if (wordexp(cmd_.c_str(), &parsed, WRDE_NOCMD) == 0) {
        for (size_t i = 0; i < parsed.we_wordc; ++i) {
            args.emplace_back(parsed.we_wordv[i]);
        }
        wordfree(&parsed);
    }

    return args;
}

void Process::send_end_signal() {
    if (in_fd_ < 0) return;

    ssize_t result;
    do {
        result = write(in_fd_, "END\n", 4);
    } while (result < 0 && errno == EINTR);
}

void Process::wait_or_kill() {
    if (pid_ <= 0) return;

    int status = 0;
    struct rusage usage {};

    auto wait_child = [&](int options) {
        pid_t result;
        do {
            result = wait4(pid_, &status, options, &usage);
        } while (result < 0 && errno == EINTR);
        return result;
    };

    pid_t result = wait_child(WNOHANG);

    if (result == 0) {
        std::this_thread::sleep_for(
            std::chrono::milliseconds(
                Core::Constants::TERMINATION_GRACE_MS
            )
        );
        result = wait_child(WNOHANG);
    }

    if (result == 0) {
        if (kill(-pid_, SIGKILL) != 0 && errno == ESRCH) {
            kill(pid_, SIGKILL);
        }
        result = wait_child(0);
    }

    if (result > 0) {
        peak_mem_kb_ = usage.ru_maxrss;
    }

    pid_ = 0;
}

void Process::close_fds() {
    if (in_fd_ >= 0) {
        close(in_fd_);
        in_fd_ = -1;
    }

    if (out_fd_ >= 0) {
        close(out_fd_);
        out_fd_ = -1;
    }
}

bool Process::write_all(const std::string& data) {
    size_t sent = 0;

    while (sent < data.size()) {
        struct pollfd descriptor {
            in_fd_,
            POLLOUT,
            0
        };

        int result = poll(
            &descriptor,
            1,
            Core::Constants::WRITE_TIMEOUT_MS
        );

        if (result <= 0) {
            if (result < 0 && errno == EINTR) {
                if (g_stop_flag) return false;
                continue;
            }
            return false;
        }

        if (!(descriptor.revents & POLLOUT)) return false;

        ssize_t count = write(
            in_fd_,
            data.data() + sent,
            data.size() - sent
        );

        if (count < 0) {
            if (errno == EINTR) continue;
            return false;
        }

        if (count == 0) return false;
        sent += static_cast<size_t>(count);
    }

    return true;
}

std::optional<std::string> Process::try_extract_line() {
    size_t newline = buf_.find('\n', buf_pos_);
    if (newline == std::string::npos) return std::nullopt;

    std::string line = buf_.substr(
        buf_pos_,
        newline - buf_pos_
    );
    buf_pos_ = newline + 1;

    if (buf_pos_ > Core::Constants::READ_BUFFER_SIZE) {
        buf_.erase(0, buf_pos_);
        buf_pos_ = 0;
    }

    if (!line.empty() && line.back() == '\r') {
        line.pop_back();
    }

    return line;
}

std::string Process::reap_exit_status() {
    if (pid_ <= 0) return "Process not running";

    int status = 0;
    struct rusage usage {};
    pid_t result = 0;

    for (
        int i = 0;
        i < Core::Constants::EXIT_CHECK_RETRIES;
        ++i
    ) {
        do {
            result = wait4(pid_, &status, WNOHANG, &usage);
        } while (result < 0 && errno == EINTR);

        if (result != 0) break;

        std::this_thread::sleep_for(
            std::chrono::milliseconds(
                Core::Constants::EXIT_CHECK_INTERVAL_MS
            )
        );
    }

    if (result == 0) return "Process still running";

    if (result < 0) {
        std::string reason =
            errno == ECHILD
                ? "Process already reaped"
                : "wait4 failed: " + std::string(strerror(errno));

        if (errno == ECHILD) {
            pid_ = 0;
            close_fds();
        }

        return reason;
    }

    peak_mem_kb_ = usage.ru_maxrss;
    pid_ = 0;
    close_fds();
    return decode_exit_status(status);
}

std::string Process::decode_exit_status(int status) {
    if (WIFEXITED(status)) {
        int code = WEXITSTATUS(status);
        return code == 0
            ? "Exited normally"
            : "Exited with code " + std::to_string(code);
    }

    if (WIFSIGNALED(status)) {
        int signal_number = WTERMSIG(status);

        switch (signal_number) {
            case SIGKILL:
                return "Killed by SIGKILL (killed/OOM)";
            case SIGSEGV:
                return "Killed by SIGSEGV (segfault)";
            case SIGABRT:
                return "Killed by SIGABRT (abort)";
            case SIGTERM:
                return "Killed by SIGTERM (terminated)";
            default:
                return "Killed by signal " +
                    std::to_string(signal_number);
        }
    }

    return "Unknown exit status";
}

void Process::read_available_data(int timeout_ms) {
    struct pollfd descriptor {
        out_fd_,
        POLLIN,
        0
    };

    int result = poll(&descriptor, 1, timeout_ms);

    if (result < 0) {
        if (errno == EINTR) return;
        throw std::runtime_error("Poll failed");
    }

    if (result == 0) return;

    if (
        (descriptor.revents & (POLLHUP | POLLERR)) &&
        !(descriptor.revents & POLLIN)
    ) {
        throw Core::PlayerError(
            "Process died: " + reap_exit_status()
        );
    }

    if (!(descriptor.revents & POLLIN)) return;

    char data[Core::Constants::READ_BUFFER_SIZE];
    ssize_t count = read(out_fd_, data, sizeof(data));

    if (count <= 0) {
        throw Core::PlayerError(
            "Process died: " + reap_exit_status()
        );
    }

    if (
        buf_.size() + static_cast<size_t>(count) >
        Core::Constants::PROCESS_BUFFER_MAX
    ) {
        throw Core::PlayerError(
            "Process Output Buffer Overflow"
        );
    }

    buf_.append(data, static_cast<size_t>(count));
}

std::string Process::resolve_path(const std::string& file) {
    if (file.find('/') != std::string::npos) return file;

    const char* path_env = getenv("PATH");
    if (!path_env) return file;

    std::stringstream stream(path_env);
    std::string directory;

    while (std::getline(stream, directory, ':')) {
        if (directory.empty()) directory = ".";

        std::string full_path = directory + "/" + file;
        if (access(full_path.c_str(), X_OK) == 0) {
            return full_path;
        }
    }

    return file;
}

}
