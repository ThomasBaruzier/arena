#include "process.h"
#include <sys/wait.h>
#include <sys/resource.h>
#include <sys/prctl.h>
#include <fcntl.h>
#include <wordexp.h>
#include <cstring>
#include <poll.h>
#include <thread>
#include <chrono>
#include "../core/constants.h"
#include "../core/types.h"
#include "signals.h"

extern char** environ;

namespace Arena::Sys {

Process::Process(const std::string& cmd) : cmd_(cmd) {}

bool Process::start(
    long long max_mem_bytes,
    const std::map<std::string, std::string>& env_vars
) {
    auto args = parse_command_args();
    if (args.empty()) return false;

    if (args[0].find('/') == std::string::npos &&
        access(args[0].c_str(), F_OK) == 0) {
        args[0] = "./" + args[0];
    }

    std::vector<char*> c_args;
    for (auto& a : args)
        c_args.push_back(const_cast<char*>(a.c_str()));
    c_args.push_back(nullptr);

    std::vector<char*> envp;
    std::vector<std::string> env_storage;
    for (char** env = environ; *env; ++env)
        env_storage.emplace_back(*env);
    for (const auto& [key, val] : env_vars)
        env_storage.emplace_back(key + "=" + val);
    for (auto& s : env_storage)
        envp.push_back(&s[0]);
    envp.push_back(nullptr);

    int in[2], out[2];
    if (pipe2(in, O_CLOEXEC) != 0) return false;
    if (pipe2(out, O_CLOEXEC) != 0) {
        close(in[0]); close(in[1]);
        return false;
    }

    pid_ = fork();
    if (pid_ < 0) {
        close(in[0]); close(in[1]);
        close(out[0]); close(out[1]);
        return false;
    }

    if (pid_ == 0) {
        start_child_process(in, out, max_mem_bytes, c_args.data(), envp.data());
    }

    in_fd_ = in[1];
    out_fd_ = out[0];
    close(in[0]);
    close(out[1]);
    return true;
}

void Process::terminate() {
    if (pid_ <= 0) return;
    try {
        send_end_signal();
        wait_or_kill();
    } catch (...) {}
    close_fds();
    pid_ = 0;
    in_fd_ = -1;
    out_fd_ = -1;
}

bool Process::write_line(const std::string& line) {
    if (pid_ <= 0) return false;
    return write_all(line + "\n");
}

std::optional<std::string> Process::read_line(
    int timeout_ms, long* elapsed_ms
) {
    if (pid_ <= 0) return std::nullopt;
    auto start = std::chrono::steady_clock::now();

    while (true) {
        if (g_stop_flag) throw Core::MatchTerminated();

        if (auto line = try_extract_line()) {
            if (elapsed_ms) {
                auto now = std::chrono::steady_clock::now();
                *elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                    now - start
                ).count();
            }
            return line;
        }

        auto now = std::chrono::steady_clock::now();
        long used = std::chrono::duration_cast<std::chrono::milliseconds>(
            now - start
        ).count();
        if (used >= timeout_ms) {
            if (elapsed_ms) *elapsed_ms = used;
            return std::nullopt;
        }

        int remaining = std::min((int)(timeout_ms - used),
            Core::Constants::POLL_TIMEOUT_MS);
        read_available_data(std::max(0, remaining));
    }
}

long Process::get_current_rss_kb() const {
    if (pid_ <= 0) return 0;
    char path[Core::Constants::PATH_BUFFER_SIZE];
    snprintf(path, sizeof(path), "/proc/%d/statm", pid_);

    FILE* f = fopen(path, "r");
    if (!f) return 0;
    long pages = 0;
    if (fscanf(f, "%*d %ld", &pages) != 1) pages = 0;
    fclose(f);
    return pages * (sysconf(_SC_PAGESIZE) / 1024);
}

void Process::start_child_process(
    int in[2], int out[2], long long mem_bytes,
    char** argv, char** envp
) {
    setpgid(0, 0);
    prctl(PR_SET_PDEATHSIG, SIGTERM);

    if (mem_bytes > 0) {
        struct rlimit rl;
        rl.rlim_cur = mem_bytes;
        rl.rlim_max = rl.rlim_cur;
        setrlimit(RLIMIT_AS, &rl);
    }

    dup2(in[0], STDIN_FILENO);
    dup2(out[1], STDOUT_FILENO);
    dup2(out[1], STDERR_FILENO);
    close(in[0]); close(in[1]);
    close(out[0]); close(out[1]);

    environ = envp;
    execvp(argv[0], argv);
    _exit(Core::Constants::EXIT_CODE_EXEC_FAILED);
}

std::vector<std::string> Process::parse_command_args() {
    std::vector<std::string> args;
    wordexp_t p;
    if (wordexp(cmd_.c_str(), &p, WRDE_NOCMD) == 0) {
        for (size_t i = 0; i < p.we_wordc; ++i)
            args.emplace_back(p.we_wordv[i]);
        wordfree(&p);
    }
    return args;
}

void Process::send_end_signal() {
    if (in_fd_ == -1) return;
    write(in_fd_, "END\n", 4);
}

void Process::wait_or_kill() {
    std::this_thread::sleep_for(std::chrono::milliseconds(
        Core::Constants::TERMINATION_GRACE_MS)
    );
    int status;
    struct rusage usage;
    if (wait4(pid_, &status, WNOHANG, &usage) == 0) {
        kill(-pid_, SIGKILL);
        wait4(pid_, &status, 0, &usage);
    }
    peak_mem_kb_ = usage.ru_maxrss;
}

void Process::close_fds() {
    if (in_fd_ != -1) close(in_fd_);
    if (out_fd_ != -1) close(out_fd_);
}

bool Process::write_all(const std::string& data) {
    size_t sent = 0;
    while (sent < data.size()) {
        struct pollfd pfd = {in_fd_, POLLOUT, 0};
        int ret = poll(&pfd, 1, Core::Constants::WRITE_TIMEOUT_MS);
        if (ret <= 0) {
            if (ret < 0 && errno == EINTR) continue;
            return false;
        }

        if (!(pfd.revents & POLLOUT)) return false;
        ssize_t n = write(in_fd_, data.c_str() + sent, data.size() - sent);
        if (n < 0) {
            if (errno == EINTR) continue;
            return false;
        }
        sent += n;
    }
    return true;
}

std::optional<std::string> Process::try_extract_line() {
    auto nl = buf_.find('\n', buf_pos_);
    if (nl == std::string::npos) return std::nullopt;

    std::string line = buf_.substr(buf_pos_, nl - buf_pos_);
    buf_pos_ = nl + 1;

    if (buf_pos_ > Core::Constants::READ_BUFFER_SIZE) {
        buf_.erase(0, buf_pos_);
        buf_pos_ = 0;
    }
    if (!line.empty() && line.back() == '\r') line.pop_back();
    return line;
}

std::string Process::reap_exit_status() {
    if (pid_ <= 0) return "Process not running";
    int status;
    struct rusage usage;
    pid_t result = 0;

    for (int i = 0; i < Core::Constants::EXIT_CHECK_RETRIES; ++i) {
        result = wait4(pid_, &status, WNOHANG, &usage);
        if (result != 0) break;
        std::this_thread::sleep_for(std::chrono::milliseconds(
            Core::Constants::EXIT_CHECK_INTERVAL_MS)
        );
    }

    if (result == 0)
        return "Process still running";
    if (result < 0)
        return "waitpid failed: " + std::string(strerror(errno));

    peak_mem_kb_ = usage.ru_maxrss;
    pid_ = 0;

    if (WIFEXITED(status)) {
        int code = WEXITSTATUS(status);
        return (code == 0)
            ? "Exited normally"
            : "Exited with code " + std::to_string(code);
    } else if (WIFSIGNALED(status)) {
        int sig = WTERMSIG(status);
        switch (sig) {
            case SIGKILL: return "Killed by SIGKILL (killed/OOM)";
            case SIGSEGV: return "Killed by SIGSEGV (segfault)";
            case SIGABRT: return "Killed by SIGABRT (abort)";
            case SIGTERM: return "Killed by SIGTERM (terminated)";
            default:      return "Killed by signal " + std::to_string(sig);
        }
    }
    return "Unknown exit status";
}

void Process::read_available_data(int timeout_ms) {
    struct pollfd pfd = {out_fd_, POLLIN, 0};
    struct timespec ts = {
        timeout_ms / 1000, (timeout_ms % 1000) * 1000000L
    };
    sigset_t empty_mask;
    sigemptyset(&empty_mask);

    int ret;
    do {
        ret = ppoll(&pfd, 1, &ts, &empty_mask);
    } while (ret < 0 && errno == EINTR);

    if (ret < 0) throw std::runtime_error("Poll failed");
    if (ret == 0) return;

    if ((pfd.revents & (POLLHUP | POLLERR)) && !(pfd.revents & POLLIN)) {
        throw Core::PlayerError("Process died: " + reap_exit_status());
    }

    if (!(pfd.revents & POLLIN)) return;

    char tmp[Core::Constants::READ_BUFFER_SIZE];
    ssize_t n = read(out_fd_, tmp, sizeof(tmp));
    if (n <= 0) throw Core::PlayerError("Process died: " + reap_exit_status());

    if (buf_.size() + n > Core::Constants::PROCESS_BUFFER_MAX) {
        throw Core::PlayerError("Process Output Buffer Overflow");
    }
    buf_.append(tmp, n);
}

}
