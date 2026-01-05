#include "api_client.h"
#include "json.h"
#include "../core/constants.h"
#include "../core/logger.h"
#include <random>
#include <sstream>

namespace Arena::Net {

ApiManager::ApiManager(std::string url, std::string key, int debounce) :
    url_(std::move(url)), key_(std::move(key)), debounce_(debounce)
{
    sess_ = generate_session_id();
}

void ApiManager::start() {
    worker_ = std::thread(&ApiManager::loop, this);
}

void ApiManager::stop() {
    enqueue_shutdown();
    if (worker_.joinable()) worker_.join();
}

void ApiManager::enqueue(Event e) {
    std::lock_guard<std::mutex> l(mtx_);
    if (q_.size() >= Core::Constants::API_QUEUE_MAX) {
        Core::Logger::log(
            Core::Logger::Level::WARN,
            "API queue full, dropping event"
        );
        return;
    }
    q_.push_back(std::move(e));
    cv_.notify_one();
}

void ApiManager::reset() {
    if (url_.empty()) return;
    CurlHandle c;
    if (!c) return;

    struct curl_slist* h = curl_slist_append(
        nullptr, ("X-API-KEY: " + key_).c_str()
    );
    curl_easy_setopt(c.get(), CURLOPT_URL, (url_ + "/api/reset").c_str());
    curl_easy_setopt(c.get(), CURLOPT_CUSTOMREQUEST, "DELETE");
    curl_easy_setopt(c.get(), CURLOPT_TIMEOUT,
        (long)Core::Constants::API_TIMEOUT_SEC);
    curl_easy_setopt(c.get(), CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(c.get(), CURLOPT_HTTPHEADER, h);

    std::string response_body;
    curl_easy_setopt(c.get(), CURLOPT_WRITEDATA, &response_body);
    curl_easy_setopt(c.get(), CURLOPT_WRITEFUNCTION,
        +[](void* ptr, size_t s, size_t n, void* u)
    {
        size_t rs = s * n;
        static_cast<std::string*>(u)->append((char*)ptr, rs);
        return rs;
    });

    Core::Logger::log(
        Core::Logger::Level::INFO, "Resetting API database..."
    );
    CURLcode res = curl_easy_perform(c.get());
    if (res != CURLE_OK) {
        Core::Logger::log(
            Core::Logger::Level::ERROR, "API Reset failed: ",
            curl_easy_strerror(res)
        );
    }
    curl_slist_free_all(h);
}

std::string ApiManager::generate_session_id() {
    thread_local std::mt19937 g(std::random_device{}());
    std::uniform_int_distribution<> d(0, 15);
    std::stringstream ss;
    for (int i = 0; i < 8; ++i) ss << std::hex << d(g);
    return ss.str();
}

void ApiManager::enqueue_shutdown() {
    std::lock_guard<std::mutex> l(mtx_);
    Event e;
    e.shutdown = true;
    q_.push_back(e);
    cv_.notify_one();
}

void ApiManager::loop() {
    CurlHandle c;
    if (!c) return;

    struct curl_slist* h = curl_slist_append(
        nullptr, "Content-Type: application/json"
    );
    h = curl_slist_append(h, ("X-API-KEY: " + key_).c_str());
    curl_easy_setopt(c.get(), CURLOPT_HTTPHEADER, h);
    curl_easy_setopt(c.get(), CURLOPT_TIMEOUT,
        (long)Core::Constants::API_TIMEOUT_SEC);
    curl_easy_setopt(c.get(), CURLOPT_NOSIGNAL, 1L);

    curl_easy_setopt(c.get(), CURLOPT_WRITEFUNCTION,
        +[](void* ptr, size_t s, size_t n, void* u)
    {
        size_t rs = s * n;
        static_cast<std::string*>(u)->append((char*)ptr, rs);
        return rs;
    });

    auto last_send_time = std::chrono::steady_clock::now();
    int backoff_sec = Core::Constants::API_BACKOFF_MIN_SEC;
    int shutdown_retries = 0;
    bool in_shutdown = false;

    while (true) {
        auto [batch, shutdown] = collect_batch(last_send_time, in_shutdown);
        if (shutdown && !in_shutdown) {
            in_shutdown = true;
            shutdown_retries = Core::Constants::API_SHUTDOWN_MAX_RETRIES;
        }

        if (batch.empty()) {
            if (shutdown || in_shutdown) break;
            continue;
        }

        if (send_batch(c.get(), batch, in_shutdown)) {
            backoff_sec = Core::Constants::API_BACKOFF_MIN_SEC;
            last_send_time = std::chrono::steady_clock::now();
            continue;
        }

        if (!in_shutdown) {
            std::lock_guard<std::mutex> l(mtx_);
            for (auto it = batch.rbegin(); it != batch.rend(); ++it)
                q_.push_front(std::move(*it));
            std::this_thread::sleep_for(std::chrono::seconds(backoff_sec));
            backoff_sec = std::min(
                Core::Constants::API_BACKOFF_MAX_SEC, backoff_sec + 2
            );
            continue;
        }

        if (--shutdown_retries <= 0) break;
        std::this_thread::sleep_for(
            std::chrono::seconds(Core::Constants::API_SHUTDOWN_BACKOFF_SEC)
        );
    }
    curl_slist_free_all(h);
}

std::pair<std::vector<ApiManager::Event>, bool> ApiManager::collect_batch(
    std::chrono::steady_clock::time_point last_send_time, bool in_shutdown
) {
    std::vector<Event> batch;
    bool shutdown = false;
    std::unique_lock<std::mutex> l(mtx_);

    if (!in_shutdown) {
        auto next_send_time = last_send_time +
            std::chrono::milliseconds(debounce_);
        while (q_.empty() || q_.size() < Core::Constants::API_QUEUE_MAX) {
            if (q_.empty()) {
                cv_.wait_until(l, next_send_time);
            } else {
                auto now = std::chrono::steady_clock::now();
                if (now >= next_send_time) break;
                cv_.wait_until(l, next_send_time);
            }
            auto now = std::chrono::steady_clock::now();
            if (now >= next_send_time ||
                (!q_.empty() && q_.front().shutdown)
            ) break;
        }
    }

    while (!q_.empty()) {
        if (q_.front().shutdown) {
            shutdown = true;
            break;
        }
        batch.push_back(std::move(q_.front()));
        q_.pop_front();
    }
    return {batch, shutdown};
}

bool ApiManager::send_batch(
    CURL* c, const std::vector<Event>& batch, bool in_shutdown
) {
    std::string body = build_json_payload(batch);
    curl_easy_setopt(c, CURLOPT_URL, (url_ + "/api/batch").c_str());
    curl_easy_setopt(c, CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(c, CURLOPT_POSTFIELDSIZE, (long)body.length());

    std::string response_body;
    curl_easy_setopt(c, CURLOPT_WRITEDATA, &response_body);
    CURLcode res = curl_easy_perform(c);
    curl_easy_setopt(c, CURLOPT_WRITEDATA, nullptr);

    long http_code = 0;
    curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &http_code);

    if (res != CURLE_OK || http_code >= 400) {
        auto level = in_shutdown
            ? Core::Logger::Level::WARN
            : Core::Logger::Level::ERROR;
        Core::Logger::log(level, "API Request failed. Code: ", http_code);
        return false;
    }
    return true;
}

std::string ApiManager::build_json_payload(const std::vector<Event>& batch) {
    std::stringstream js;
    js << "[";
    for (size_t i = 0; i < batch.size(); ++i) {
        if (i > 0) js << ",";
        js << build_event_json(batch[i]);
    }
    js << "]";
    return js.str();
}

std::string ApiManager::build_event_json(const Event& e) {
    JsonStream js;
    if (e.type == "run_start") {
        js.add_str("type", "run_start");
        js.add_str("run_id", e.run_id);
        js.add_str("p1_name", e.p1_name);
        js.add_str("p1_version", e.p1v);
        js.add_str("p2_name", e.p2_name);
        js.add_str("p2_version", e.p2v);
        js.add_str("config_label", e.config_label);
        js.add("total_games", e.total_games);
        js.add("p1_nodes", e.p1_nodes);
        js.add("p2_nodes", e.p2_nodes);
        js.add("eval_nodes", e.eval_nodes);
        js.add("board_size", e.board_size);
        js.add("min_pairs", e.min_pairs);
        js.add("max_pairs", e.max_pairs);
        js.add("repeat_index", e.repeat_index);
        if (e.seed) js.add("seed", *e.seed);
        else js.add_null("seed");
    } else if (e.type == "run_update") {
        js.add_str("type", "run_update");
        js.add_str("run_id", e.run_id);
        js.add("games_played", e.games_played);
        js.add("wins", e.wins);
        js.add("losses", e.losses);
        js.add("draws", e.draws);
        js.add("wall_time_ms", e.wall_time_ms);
        js.add("arena_load", e.arena_load);
        js.add("p1_efficiency", e.p1_efficiency);
        js.add("p2_efficiency", e.p2_efficiency);
        js.add("p1_elo", e.p1_elo);
        js.add("p1_dqi", e.p1_dqi);
        js.add("p1_cma", e.p1_cma);
        js.add("p1_blunder", e.p1_blunder);
        js.add("p1_crashes", e.p1_crashes);
        js.add("p2_elo", e.p2_elo);
        js.add("p2_dqi", e.p2_dqi);
        js.add("p2_cma", e.p2_cma);
        js.add("p2_blunder", e.p2_blunder);
        js.add("p2_crashes", e.p2_crashes);
        js.add("is_done", e.is_done ? "true" : "false");
    } else {
        js.add_str("type", e.type);
        js.add_str("external_id", e.ext_id);
        if (e.type == "start") {
            js.add_str("run_id", e.run_id);
            js.add_str("p1n", e.p1_name);
            js.add_str("p1v", e.p1v);
            js.add_str("p2n", e.p2_name);
            js.add_str("p2v", e.p2v);
            js.add("black_is_p1", e.black_is_p1 ? "true" : "false");
        } else if (e.type == "move") {
            js.add("x", e.x);
            js.add("y", e.y);
            js.add("c", e.c);
        } else if (e.type == "result") {
            js.add("winner", e.winner);
            js.add_str("moves", e.moves);
        }
    }
    return js.str();
}

}
