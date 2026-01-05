#pragma once

#include <curl/curl.h>
#include <string>
#include <vector>
#include <functional>
#include <mutex>

namespace CurlMock {

struct MockConfig {
    CURLcode perform_result = CURLE_OK;
    long http_code = 200;
    std::string response_body;
    bool init_fails = false;
};

struct CallRecord {
    std::string url;
    std::string post_data;
    std::string method;
};

class State {
public:
    static State& instance();

    void reset();
    void set_config(const MockConfig& cfg);
    MockConfig get_config() const;

    void record_call(const CallRecord& record);
    std::vector<CallRecord> get_calls() const;
    size_t call_count() const;

    void set_perform_callback(std::function<CURLcode(const CallRecord&)> cb);
    std::function<CURLcode(const CallRecord&)> get_perform_callback() const;

private:
    State() = default;
    mutable std::mutex mtx_;
    MockConfig config_;
    std::vector<CallRecord> calls_;
    std::function<CURLcode(const CallRecord&)> perform_cb_;
};

inline void reset() { State::instance().reset(); }
inline void configure(const MockConfig& cfg) { State::instance().set_config(cfg); }
inline size_t call_count() { return State::instance().call_count(); }
inline std::vector<CallRecord> get_calls() { return State::instance().get_calls(); }

inline void on_perform(std::function<CURLcode(const CallRecord&)> cb) {
    State::instance().set_perform_callback(cb);
}

inline void fail_init() {
    MockConfig cfg;
    cfg.init_fails = true;
    configure(cfg);
}

inline void fail_perform(CURLcode code = CURLE_COULDNT_CONNECT) {
    MockConfig cfg;
    cfg.perform_result = code;
    configure(cfg);
}

inline void return_http_error(long code = 500) {
    MockConfig cfg;
    cfg.http_code = code;
    configure(cfg);
}

}
