#pragma once

#include <string>
#include <vector>
#include <deque>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <optional>
#include <cstdint>
#include <curl/curl.h>

class ApiTest;

namespace Arena::Net {

    class CurlHandle {
    public:
        CurlHandle() { c_ = curl_easy_init(); }
        ~CurlHandle() { if (c_) curl_easy_cleanup(c_); }
        CURL* get() { return c_; }
        operator bool() const { return c_ != nullptr; }

    private:
        CURL* c_;
    };

    class ApiManager {
    public:
        struct Event {
            std::string type, ext_id, p1_name, p1v, p2_name, p2v, moves;
            int x = 0, y = 0, c = 0, winner = 0;
            bool shutdown = false;
            std::string run_id, config_label;
            int total_games = 0;
            bool black_is_p1 = true;
            int games_played = 0;
            int wins = 0, losses = 0, draws = 0;
            long long wall_time_ms = 0;
            double arena_load = 0.0, p1_efficiency = 0.0, p2_efficiency = 0.0;
            uint64_t p1_nodes = 0, p2_nodes = 0, eval_nodes = 0;
            int board_size = 0, min_pairs = 0, max_pairs = 0, repeat_index = 0;
            std::optional<uint64_t> seed;
            double p1_elo = 0, p2_elo = 0, p1_dqi = 0, p2_dqi = 0;
            double p1_cma = 0, p2_cma = 0, p1_blunder = 0, p2_blunder = 0;
            int p1_crashes = 0, p2_crashes = 0;
            bool is_done = false;
        };

        ApiManager(std::string url, std::string key, int debounce);
        ~ApiManager() { stop(); }

        void start();
        void stop();
        void enqueue(Event e);
        void reset();

    private:
        std::string generate_session_id();
        void enqueue_shutdown();
        void loop();

        std::pair<std::vector<Event>, bool> collect_batch(
            std::chrono::steady_clock::time_point last_send_time,
            bool in_shutdown
        );

        bool send_batch(CURL* c, const std::vector<Event>& batch, bool in_shutdown);
        std::string build_json_payload(const std::vector<Event>& batch);
        std::string build_event_json(const Event& e);

        std::string url_, key_, sess_;
        int debounce_;
        std::thread worker_;
        std::mutex mtx_;
        std::condition_variable cv_;
        std::deque<Event> q_;

        friend class ::ApiTest;
    };
}
