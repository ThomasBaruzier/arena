#pragma once

#include <condition_variable>
#include <cstdint>
#include <curl/curl.h>
#include <deque>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

class ApiTest;

namespace Arena::Net {

class CurlHandle {
public:
    CurlHandle() : handle_(curl_easy_init()) {}

    ~CurlHandle() {
        if (handle_) curl_easy_cleanup(handle_);
    }

    CurlHandle(const CurlHandle&) = delete;
    CurlHandle& operator=(const CurlHandle&) = delete;

    CURL* get() const { return handle_; }
    explicit operator bool() const { return handle_ != nullptr; }

private:
    CURL* handle_;
};

class ApiManager {
public:
    struct Event {
        std::string type;
        std::string ext_id;
        std::string p1_name;
        std::string p1v;
        std::string p2_name;
        std::string p2v;
        std::string moves;
        std::string p1_cmd;
        std::string p2_cmd;
        int x = 0;
        int y = 0;
        int c = 0;
        int winner = 0;
        int op_len = 0;
        int black_slot = 0;
        int white_slot = 0;
        long duration = 0;
        std::string run_id;
        std::string config_label;
        int total_games = 0;
        int games_played = 0;
        int wins = 0;
        int losses = 0;
        int draws = 0;
        long long wall_time_ms = 0;
        uint64_t p1_nodes = 0;
        uint64_t p2_nodes = 0;
        uint64_t eval_nodes = 0;
        int board_size = 0;
        int min_pairs = 0;
        int max_pairs = 0;
        int repeat_index = 0;
        std::optional<uint64_t> seed;
        double p1_elo = 0;
        double p2_elo = 0;
        double p1_erf = 0;
        double p2_erf = 0;
        long long p1_time = 0;
        long long p2_time = 0;
        int p1_crashes = 0;
        int p2_crashes = 0;
        double p1_cma = 0;
        double p2_cma = 0;
        double p1_blunder = 0;
        double p2_blunder = 0;
        bool is_done = false;
        bool timed_out = false;
    };

    ApiManager(std::string url, std::string key, int debounce);
    ~ApiManager() { stop(); }

    void start();
    void stop();
    void enqueue(Event event);
    void reset();

private:
    static bool is_progress_update(const Event& event);
    static bool is_move(const Event& event);

    bool make_room_locked();
    std::vector<Event> take_batch_locked();
    void discard_locked(size_t additional);
    void report_dropped();
    void loop();

    bool send_batch(CURL* curl, const std::vector<Event>& batch);
    std::string build_json_payload(const std::vector<Event>& batch);
    std::string build_event_json(const Event& event);

    std::string url_;
    std::string key_;
    int debounce_;
    std::thread worker_;
    std::mutex mtx_;
    std::condition_variable cv_;
    std::deque<Event> queue_;
    bool started_ = false;
    bool accepting_ = true;
    bool stopping_ = false;
    bool disabled_ = false;
    size_t dropped_ = 0;
    bool dropped_reported_ = false;

    friend class ::ApiTest;
};

}
