#pragma once

#include <chrono>
#include <iomanip>
#include <iostream>
#include <mutex>

namespace Arena::Core {

class Logger {
public:
    enum class Level {
        DEBUG,
        INFO,
        WARN,
        ERROR
    };

    static void set_level(Level level) {
        get().level_ = level;
    }

    static bool is_debug() {
        return get().level_ == Level::DEBUG;
    }

    template<typename... Args>
    static void log(Level level, Args... args) {
        if (level < get().level_) {
            return;
        }

        std::lock_guard<std::mutex> lock(get().mutex_);

        print_timestamp();
        std::cout << get_level_str(level);
        (std::cout << ... << args) << std::endl;
    }

private:
    Logger() = default;

    static Logger& get() {
        static Logger instance;
        return instance;
    }

    static void print_timestamp() {
        using namespace std::chrono;

        auto now = system_clock::now();
        auto time_now = system_clock::to_time_t(now);
        auto milliseconds =
            duration_cast<std::chrono::milliseconds>(
                now.time_since_epoch()
            ) % 1000;

        std::tm time {};
        localtime_r(&time_now, &time);

        std::cout
            << '['
            << std::setfill('0') << std::setw(2) << time.tm_hour << ':'
            << std::setfill('0') << std::setw(2) << time.tm_min << ':'
            << std::setfill('0') << std::setw(2) << time.tm_sec << ':'
            << std::setfill('0') << std::setw(4) << milliseconds.count()
            << "] ";
    }

    static const char* get_level_str(Level level) {
        switch (level) {
            case Level::DEBUG:
                return "[DEBUG] ";
            case Level::INFO:
                return "[INFO]  ";
            case Level::WARN:
                return "[WARN]  ";
            case Level::ERROR:
                return "[ERROR] ";
        }

        return "";
    }

    Level level_ = Level::INFO;
    std::mutex mutex_;
};

}
