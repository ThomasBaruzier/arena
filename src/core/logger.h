#pragma once

#include <iostream>
#include <mutex>
#include <chrono>
#include <iomanip>

namespace Arena::Core {

    class Logger {
    public:
        enum class Level { DEBUG, INFO, WARN, ERROR };

        static void set_level(Level level) { get().level_ = level; }

        template<typename... Args>
        static void log(Level level, Args... args) {
            if (level < get().level_) return;
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
            auto time_t_now = system_clock::to_time_t(now);
            auto ms = duration_cast<milliseconds>(now.time_since_epoch()) % 1000;
            std::tm tm_buf;
            localtime_r(&time_t_now, &tm_buf);

            std::cout << '['
              << std::setfill('0') << std::setw(2) << tm_buf.tm_hour << ':'
              << std::setfill('0') << std::setw(2) << tm_buf.tm_min << ':'
              << std::setfill('0') << std::setw(2) << tm_buf.tm_sec << ':'
              << std::setfill('0') << std::setw(4) << ms.count()
            << "] ";
        }

        static const char* get_level_str(Level level) {
            switch (level) {
                case Level::DEBUG: return "[DEBUG] ";
                case Level::INFO:  return "[INFO]  ";
                case Level::WARN:  return "[WARN]  ";
                case Level::ERROR: return "[ERROR] ";
                default:           return "";
            }
        }

        Level level_ = Level::INFO;
        std::mutex mutex_;
    };
}
