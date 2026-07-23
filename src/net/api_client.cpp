#include "api_client.h"
#include "json.h"
#include "../core/constants.h"
#include "../core/logger.h"

namespace Arena::Net {

ApiManager::ApiManager(std::string url, std::string key, int debounce) :
    url_(std::move(url)), key_(std::move(key)), debounce_(debounce),
    buffer_(BUFFER_SIZE)
{}

void ApiManager::start() {
    worker_ = std::thread(&ApiManager::loop, this);
}

void ApiManager::stop() {
    enqueue_shutdown();
    if (worker_.joinable()) worker_.join();
}

void ApiManager::enqueue(Event e) {
    std::unique_lock<std::mutex> l(mtx_);
    while (count_ >= BUFFER_SIZE) {
        cv_produce_.wait(l);
    }

    buffer_[tail_] = std::move(e);
    tail_ = (tail_ + 1) % BUFFER_SIZE;
    count_++;
    cv_consume_.notify_one();
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

void ApiManager::enqueue_shutdown() {
    std::unique_lock<std::mutex> l(mtx_);
    while (count_ >= BUFFER_SIZE) {
        cv_produce_.wait(l);
    }
    Event e;
    e.shutdown = true;
    buffer_[tail_] = e;
    tail_ = (tail_ + 1) % BUFFER_SIZE;
    count_++;
    cv_consume_.notify_one();
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

    while (true) {
        auto [batch, is_shutdown_next] = peek_batch(last_send_time);

        if (is_shutdown_next && batch.empty()) {
            commit_batch(1);
            break;
        }

        if (batch.empty()) {
            continue;
        }

        if (send_batch(c.get(), batch)) {
            commit_batch(batch.size());
            backoff_sec = Core::Constants::API_BACKOFF_MIN_SEC;
            last_send_time = std::chrono::steady_clock::now();
        } else {
            std::this_thread::sleep_for(std::chrono::seconds(backoff_sec));
            backoff_sec = std::min(
                Core::Constants::API_BACKOFF_MAX_SEC, backoff_sec + 2
            );
        }
    }
    curl_slist_free_all(h);
}

std::pair<std::vector<ApiManager::Event>, bool> ApiManager::peek_batch(
    std::chrono::steady_clock::time_point& last_send_time
) {
    std::vector<Event> batch;
    std::unique_lock<std::mutex> l(mtx_);

    auto next_send_time = last_send_time + std::chrono::milliseconds(debounce_);

    while (true) {
        bool has_enough = count_ >= 50;
        bool time_up = std::chrono::steady_clock::now() >= next_send_time;
        bool has_shutdown = count_ > 0 && buffer_[head_].shutdown;

        if (has_enough || time_up || has_shutdown) break;

        cv_consume_.wait_until(l, next_send_time);
    }

    if (count_ == 0) return {batch, false};

    if (buffer_[head_].shutdown) {
        return {batch, true};
    }

    size_t idx = head_;
    size_t items = 0;

    while (items < count_ && items < 100) {
        if (buffer_[idx].shutdown) break;
        batch.push_back(buffer_[idx]);
        idx = (idx + 1) % BUFFER_SIZE;
        items++;
    }

    return {batch, false};
}

void ApiManager::commit_batch(size_t n) {
    std::lock_guard<std::mutex> l(mtx_);
    head_ = (head_ + n) % BUFFER_SIZE;
    count_ -= n;
    cv_produce_.notify_all();
}

bool ApiManager::send_batch(
    CURL* c, const std::vector<Event>& batch
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
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "API Request failed. Code: ", http_code, " Error: ",
            curl_easy_strerror(res)
        );
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
        JsonStream slot1;
        slot1.add("slot", 1);
        slot1.add_str("name", e.p1_name);
        slot1.add_str("version", e.p1v);
        slot1.add_str("cmd", e.p1_cmd);
        if (e.p1_mtime) slot1.add("mtime", *e.p1_mtime);
        else slot1.add_null("mtime");

        JsonStream slot2;
        slot2.add("slot", 2);
        slot2.add_str("name", e.p2_name);
        slot2.add_str("version", e.p2v);
        slot2.add_str("cmd", e.p2_cmd);
        if (e.p2_mtime) slot2.add("mtime", *e.p2_mtime);
        else slot2.add_null("mtime");

        js.add_raw("slots", "[" + slot1.str() + "," + slot2.str() + "]");
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
        js.add("p1_elo", e.p1_elo);
        js.add("p1_erf", e.p1_erf);
        js.add("p1_time", e.p1_time);
        js.add("p1_crashes", e.p1_crashes);
        js.add("p1_cma", e.p1_cma);
        js.add("p1_blunder", e.p1_blunder);
        js.add("p2_elo", e.p2_elo);
        js.add("p2_erf", e.p2_erf);
        js.add("p2_time", e.p2_time);
        js.add("p2_crashes", e.p2_crashes);
        js.add("p2_cma", e.p2_cma);
        js.add("p2_blunder", e.p2_blunder);
        js.add("is_done", e.is_done ? "true" : "false");
        js.add("timed_out", e.timed_out ? "true" : "false");
    } else {
        js.add_str("type", e.type);
        js.add_str("external_id", e.ext_id);
        if (!e.run_id.empty()) js.add_str("run_id", e.run_id);
        if (e.type == "start") {
            js.add("black_slot", e.black_slot);
            js.add("white_slot", e.white_slot);
            js.add("op_len", e.op_len);
        } else if (e.type == "move") {
            js.add("x", e.x);
            js.add("y", e.y);
            js.add("c", e.c);
        } else if (e.type == "result") {
            js.add("winner", e.winner);
            js.add_str("moves", e.moves);
            js.add("op_len", e.op_len);
            js.add("duration", e.duration);
        }
    }
    return js.str();
}

}
