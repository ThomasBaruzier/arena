#include "api_client.h"
#include "json.h"
#include "../core/constants.h"
#include "../core/logger.h"
#include <algorithm>
#include <chrono>
#include <sstream>

namespace Arena::Net {

ApiManager::ApiManager(
    std::string url,
    std::string key,
    int debounce
) :
    url_(std::move(url)),
    key_(std::move(key)),
    debounce_(debounce)
{}

void ApiManager::start() {
    std::lock_guard<std::mutex> lock(mtx_);
    if (started_) return;

    accepting_ = true;
    stopping_ = false;
    disabled_ = false;
    dropped_ = 0;
    dropped_reported_ = false;
    started_ = true;
    worker_ = std::thread(&ApiManager::loop, this);
}

void ApiManager::stop() {
    bool join_worker = false;

    {
        std::lock_guard<std::mutex> lock(mtx_);
        accepting_ = false;

        if (started_) {
            stopping_ = true;
            join_worker = worker_.joinable();
            cv_.notify_all();
        } else if (!queue_.empty()) {
            discard_locked(0);
        }
    }

    if (join_worker) worker_.join();

    {
        std::lock_guard<std::mutex> lock(mtx_);
        started_ = false;
        stopping_ = false;
    }

    report_dropped();
}

bool ApiManager::is_progress_update(const Event& event) {
    return event.type == "run_update" && !event.is_done;
}

bool ApiManager::is_move(const Event& event) {
    return event.type == "move";
}

bool ApiManager::make_room_locked() {
    if (queue_.size() < Core::Constants::API_QUEUE_MAX) {
        return true;
    }

    auto discard = std::find_if(
        queue_.begin(),
        queue_.end(),
        is_progress_update
    );

    if (discard == queue_.end()) {
        discard = std::find_if(
            queue_.begin(),
            queue_.end(),
            is_move
        );
    }

    if (discard == queue_.end()) return false;

    queue_.erase(discard);
    ++dropped_;
    return true;
}

void ApiManager::enqueue(Event event) {
    std::lock_guard<std::mutex> lock(mtx_);

    if (!accepting_ || stopping_ || disabled_) {
        ++dropped_;
        return;
    }

    if (is_progress_update(event)) {
        auto previous = std::find_if(
            queue_.begin(),
            queue_.end(),
            [&](const Event& queued) {
                return is_progress_update(queued) &&
                    queued.run_id == event.run_id;
            }
        );

        if (previous != queue_.end()) {
            queue_.erase(previous);
            ++dropped_;
        }
    }

    if (!make_room_locked()) {
        ++dropped_;
        return;
    }

    queue_.push_back(std::move(event));
    cv_.notify_one();
}

std::vector<ApiManager::Event> ApiManager::take_batch_locked() {
    size_t count = std::min(
        queue_.size(),
        Core::Constants::API_BATCH_MAX
    );

    std::vector<Event> batch;
    batch.reserve(count);

    for (size_t i = 0; i < count; ++i) {
        batch.push_back(std::move(queue_.front()));
        queue_.pop_front();
    }

    return batch;
}

void ApiManager::discard_locked(size_t additional) {
    dropped_ += additional + queue_.size();
    queue_.clear();
}

void ApiManager::report_dropped() {
    size_t dropped = 0;

    {
        std::lock_guard<std::mutex> lock(mtx_);
        if (dropped_reported_ || dropped_ == 0) return;
        dropped_reported_ = true;
        dropped = dropped_;
    }

    Core::Logger::log(
        Core::Logger::Level::WARN,
        "API telemetry dropped ",
        dropped,
        " event(s)"
    );
}

void ApiManager::reset() {
    if (url_.empty()) return;

    CurlHandle curl;
    if (!curl) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "API reset failed: CURL initialization failed"
        );
        return;
    }

    struct curl_slist* headers = curl_slist_append(
        nullptr,
        ("X-API-KEY: " + key_).c_str()
    );

    curl_easy_setopt(
        curl.get(),
        CURLOPT_URL,
        (url_ + "/api/reset").c_str()
    );
    curl_easy_setopt(
        curl.get(),
        CURLOPT_CUSTOMREQUEST,
        "DELETE"
    );
    curl_easy_setopt(
        curl.get(),
        CURLOPT_TIMEOUT,
        static_cast<long>(Core::Constants::API_TIMEOUT_SEC)
    );
    curl_easy_setopt(curl.get(), CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(
        curl.get(),
        CURLOPT_HTTPHEADER,
        headers
    );

    std::string response;
    curl_easy_setopt(
        curl.get(),
        CURLOPT_WRITEDATA,
        &response
    );
    curl_easy_setopt(
        curl.get(),
        CURLOPT_WRITEFUNCTION,
        +[](void* data, size_t size, size_t count, void* target) {
            size_t bytes = size * count;
            static_cast<std::string*>(target)->append(
                static_cast<char*>(data),
                bytes
            );
            return bytes;
        }
    );

    Core::Logger::log(
        Core::Logger::Level::INFO,
        "Resetting API database..."
    );

    CURLcode result = curl_easy_perform(curl.get());
    long status = 0;
    curl_easy_getinfo(
        curl.get(),
        CURLINFO_RESPONSE_CODE,
        &status
    );

    if (
        result != CURLE_OK ||
        status < 200 ||
        status >= 300
    ) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "API reset failed. Code: ",
            status,
            " Error: ",
            curl_easy_strerror(result)
        );
    }

    curl_slist_free_all(headers);
}

void ApiManager::loop() {
    CurlHandle curl;

    if (!curl) {
        std::lock_guard<std::mutex> lock(mtx_);
        disabled_ = true;
        accepting_ = false;
        discard_locked(0);
        cv_.notify_all();
        return;
    }

    struct curl_slist* headers = curl_slist_append(
        nullptr,
        "Content-Type: application/json"
    );
    headers = curl_slist_append(
        headers,
        ("X-API-KEY: " + key_).c_str()
    );

    curl_easy_setopt(
        curl.get(),
        CURLOPT_HTTPHEADER,
        headers
    );
    curl_easy_setopt(
        curl.get(),
        CURLOPT_TIMEOUT,
        static_cast<long>(Core::Constants::API_TIMEOUT_SEC)
    );
    curl_easy_setopt(curl.get(), CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(
        curl.get(),
        CURLOPT_WRITEFUNCTION,
        +[](void* data, size_t size, size_t count, void* target) {
            size_t bytes = size * count;
            static_cast<std::string*>(target)->append(
                static_cast<char*>(data),
                bytes
            );
            return bytes;
        }
    );

    while (true) {
        std::vector<Event> batch;

        {
            std::unique_lock<std::mutex> lock(mtx_);
            cv_.wait(lock, [&]() {
                return stopping_ || !queue_.empty();
            });

            if (queue_.empty() && stopping_) break;

            if (
                !stopping_ &&
                debounce_ > 0 &&
                queue_.size() <
                    Core::Constants::API_BATCH_EAGER_SIZE
            ) {
                cv_.wait_for(
                    lock,
                    std::chrono::milliseconds(debounce_),
                    [&]() {
                        return stopping_ ||
                            queue_.size() >=
                                Core::Constants::API_BATCH_EAGER_SIZE;
                    }
                );
            }

            if (queue_.empty() && stopping_) break;
            if (queue_.empty()) continue;

            batch = take_batch_locked();
        }

        int backoff =
            Core::Constants::API_BACKOFF_MIN_SEC;
        int shutdown_failures = 0;

        while (!send_batch(curl.get(), batch)) {
            std::unique_lock<std::mutex> lock(mtx_);

            if (stopping_) {
                ++shutdown_failures;

                if (
                    shutdown_failures >=
                    Core::Constants::API_SHUTDOWN_MAX_RETRIES
                ) {
                    discard_locked(batch.size());
                    curl_slist_free_all(headers);
                    return;
                }

                lock.unlock();
                continue;
            }

            cv_.wait_for(
                lock,
                std::chrono::seconds(backoff),
                [&]() {
                    return stopping_;
                }
            );

            backoff = std::min(
                Core::Constants::API_BACKOFF_MAX_SEC,
                backoff + 2
            );
        }
    }

    curl_slist_free_all(headers);
}

bool ApiManager::send_batch(
    CURL* curl,
    const std::vector<Event>& batch
) {
    if (!curl || batch.empty()) return false;

    std::string body = build_json_payload(batch);
    curl_easy_setopt(
        curl,
        CURLOPT_URL,
        (url_ + "/api/batch").c_str()
    );
    curl_easy_setopt(
        curl,
        CURLOPT_POSTFIELDS,
        body.c_str()
    );
    curl_easy_setopt(
        curl,
        CURLOPT_POSTFIELDSIZE,
        static_cast<long>(body.size())
    );

    std::string response;
    curl_easy_setopt(
        curl,
        CURLOPT_WRITEDATA,
        &response
    );

    CURLcode result = curl_easy_perform(curl);

    curl_easy_setopt(
        curl,
        CURLOPT_WRITEDATA,
        nullptr
    );

    long status = 0;
    curl_easy_getinfo(
        curl,
        CURLINFO_RESPONSE_CODE,
        &status
    );

    if (
        result != CURLE_OK ||
        status < 200 ||
        status >= 300
    ) {
        Core::Logger::log(
            Core::Logger::Level::ERROR,
            "API request failed. Code: ",
            status,
            " Error: ",
            curl_easy_strerror(result)
        );
        return false;
    }

    return true;
}

std::string ApiManager::build_json_payload(
    const std::vector<Event>& batch
) {
    std::stringstream json;
    json << "[";

    for (size_t i = 0; i < batch.size(); ++i) {
        if (i > 0) json << ",";
        json << build_event_json(batch[i]);
    }

    json << "]";
    return json.str();
}

std::string ApiManager::build_event_json(
    const Event& event
) {
    JsonStream json;

    if (event.type == "run_start") {
        json.add_str("type", "run_start");
        json.add_str("run_id", event.run_id);

        JsonStream slot1;
        slot1.add("slot", 1);
        slot1.add_str("name", event.p1_name);
        slot1.add_str("version", event.p1v);
        slot1.add_str("cmd", event.p1_cmd);

        JsonStream slot2;
        slot2.add("slot", 2);
        slot2.add_str("name", event.p2_name);
        slot2.add_str("version", event.p2v);
        slot2.add_str("cmd", event.p2_cmd);

        json.add_raw(
            "slots",
            "[" + slot1.str() + "," + slot2.str() + "]"
        );
        json.add_str(
            "config_label",
            event.config_label
        );
        json.add("total_games", event.total_games);
        json.add("p1_nodes", event.p1_nodes);
        json.add("p2_nodes", event.p2_nodes);
        json.add("eval_nodes", event.eval_nodes);
        json.add("board_size", event.board_size);
        json.add("min_pairs", event.min_pairs);
        json.add("max_pairs", event.max_pairs);
        json.add(
            "repeat_index",
            event.repeat_index
        );

        if (event.seed) {
            json.add("seed", *event.seed);
        } else {
            json.add_null("seed");
        }
    } else if (event.type == "run_update") {
        json.add_str("type", "run_update");
        json.add_str("run_id", event.run_id);
        json.add(
            "games_played",
            event.games_played
        );
        json.add("wins", event.wins);
        json.add("losses", event.losses);
        json.add("draws", event.draws);
        json.add(
            "wall_time_ms",
            event.wall_time_ms
        );
        json.add("p1_elo", event.p1_elo);
        json.add("p1_erf", event.p1_erf);
        json.add("p1_time", event.p1_time);
        json.add(
            "p1_crashes",
            event.p1_crashes
        );
        json.add("p1_cma", event.p1_cma);
        json.add(
            "p1_blunder",
            event.p1_blunder
        );
        json.add("p2_elo", event.p2_elo);
        json.add("p2_erf", event.p2_erf);
        json.add("p2_time", event.p2_time);
        json.add(
            "p2_crashes",
            event.p2_crashes
        );
        json.add("p2_cma", event.p2_cma);
        json.add(
            "p2_blunder",
            event.p2_blunder
        );
        json.add(
            "is_done",
            event.is_done ? "true" : "false"
        );
        json.add(
            "timed_out",
            event.timed_out ? "true" : "false"
        );
    } else {
        json.add_str("type", event.type);
        json.add_str(
            "external_id",
            event.ext_id
        );

        if (!event.run_id.empty()) {
            json.add_str("run_id", event.run_id);
        }

        if (event.type == "start") {
            json.add(
                "black_slot",
                event.black_slot
            );
            json.add(
                "white_slot",
                event.white_slot
            );
            json.add("op_len", event.op_len);
        } else if (event.type == "move") {
            json.add("x", event.x);
            json.add("y", event.y);
            json.add("c", event.c);
        } else if (event.type == "result") {
            json.add("winner", event.winner);
            json.add_str("moves", event.moves);
            json.add("op_len", event.op_len);
            json.add(
                "duration",
                event.duration
            );
        }
    }

    return json.str();
}

}
