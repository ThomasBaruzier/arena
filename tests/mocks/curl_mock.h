#pragma once

#include <curl/curl.h>
#include <functional>
#include <mutex>
#include <string>
#include <vector>

namespace CurlMock {

struct MockConfig {
    CURLcode perform_result = CURLE_OK;
    long http_code = 200;
    std::string response_body;
    std::string response_headers =
        "HTTP/1.1 200 OK\r\n"
        "X-Arena-Generation: test-generation\r\n"
        "\r\n";
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

    void set_perform_callback(
        std::function<CURLcode(
            const CallRecord&
        )> callback
    );

    std::function<CURLcode(
        const CallRecord&
    )> get_perform_callback() const;

private:
    State() = default;
    mutable std::mutex mtx_;
    MockConfig config_;
    std::vector<CallRecord> calls_;
    std::function<CURLcode(
        const CallRecord&
    )> perform_cb_;
};

inline void reset() {
    State::instance().reset();
}

inline void configure(
    const MockConfig& config
) {
    State::instance().set_config(config);
}

inline size_t call_count() {
    return State::instance().call_count();
}

inline std::vector<CallRecord> get_calls() {
    return State::instance().get_calls();
}

inline void on_perform(
    std::function<CURLcode(
        const CallRecord&
    )> callback
) {
    State::instance().set_perform_callback(
        callback
    );
}

inline void fail_init() {
    MockConfig config;
    config.init_fails = true;
    configure(config);
}

inline void fail_perform(
    CURLcode code =
        CURLE_COULDNT_CONNECT
) {
    MockConfig config;
    config.perform_result = code;
    configure(config);
}

inline void return_http_error(
    long code = 500
) {
    MockConfig config;
    config.http_code = code;
    configure(config);
}

}
