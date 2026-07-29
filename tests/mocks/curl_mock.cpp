#include "curl_mock.h"
#include <cstdarg>
#include <cstdlib>
#include <cstring>
#include <map>

namespace CurlMock {

State& State::instance() {
    static State state;
    return state;
}

void State::reset() {
    std::lock_guard<std::mutex> lock(mtx_);
    config_ = MockConfig{};
    calls_.clear();
    perform_cb_ = nullptr;
}

void State::set_config(
    const MockConfig& config
) {
    std::lock_guard<std::mutex> lock(mtx_);
    config_ = config;
}

MockConfig State::get_config() const {
    std::lock_guard<std::mutex> lock(mtx_);
    return config_;
}

void State::record_call(
    const CallRecord& record
) {
    std::lock_guard<std::mutex> lock(mtx_);
    calls_.push_back(record);
}

std::vector<CallRecord>
State::get_calls() const {
    std::lock_guard<std::mutex> lock(mtx_);
    return calls_;
}

size_t State::call_count() const {
    std::lock_guard<std::mutex> lock(mtx_);
    return calls_.size();
}

void State::set_perform_callback(
    std::function<CURLcode(
        const CallRecord&
    )> callback
) {
    std::lock_guard<std::mutex> lock(mtx_);
    perform_cb_ = std::move(callback);
}

std::function<CURLcode(
    const CallRecord&
)> State::get_perform_callback() const {
    std::lock_guard<std::mutex> lock(mtx_);
    return perform_cb_;
}

}

struct MockCurlHandle {
    std::string url;
    std::string post_data;
    std::string method = "GET";
    long http_code = 200;
    void* write_data = nullptr;
    size_t (*write_func)(
        char*,
        size_t,
        size_t,
        void*
    ) = nullptr;
    void* header_data = nullptr;
    size_t (*header_func)(
        char*,
        size_t,
        size_t,
        void*
    ) = nullptr;
    struct curl_slist* headers = nullptr;
};

static std::map<CURL*, MockCurlHandle*>
    g_handles;
static std::mutex g_handle_mtx;

extern "C" {

CURL* curl_easy_init() {
    auto config =
        CurlMock::State::instance()
            .get_config();

    if (config.init_fails) return nullptr;

    auto* handle =
        new MockCurlHandle();
    auto* pointer =
        reinterpret_cast<CURL*>(handle);

    std::lock_guard<std::mutex> lock(
        g_handle_mtx
    );

    g_handles[pointer] = handle;
    return pointer;
}

void curl_easy_cleanup(CURL* curl) {
    std::lock_guard<std::mutex> lock(
        g_handle_mtx
    );

    auto iterator =
        g_handles.find(curl);

    if (iterator != g_handles.end()) {
        delete iterator->second;
        g_handles.erase(iterator);
    }
}

CURLcode curl_easy_setopt(
    CURL* curl,
    CURLoption option,
    ...
) {
    std::lock_guard<std::mutex> lock(
        g_handle_mtx
    );

    auto iterator =
        g_handles.find(curl);

    if (iterator == g_handles.end()) {
        return CURLE_BAD_FUNCTION_ARGUMENT;
    }

    MockCurlHandle* handle =
        iterator->second;

    va_list arguments;
    va_start(arguments, option);

    switch (option) {
        case CURLOPT_URL:
            handle->url =
                va_arg(
                    arguments,
                    const char*
                );
            break;
        case CURLOPT_POSTFIELDS:
            handle->post_data =
                va_arg(
                    arguments,
                    const char*
                );
            handle->method = "POST";
            break;
        case CURLOPT_CUSTOMREQUEST:
            handle->method =
                va_arg(
                    arguments,
                    const char*
                );
            break;
        case CURLOPT_WRITEDATA:
            handle->write_data =
                va_arg(
                    arguments,
                    void*
                );
            break;
        case CURLOPT_WRITEFUNCTION:
            handle->write_func =
                va_arg(
                    arguments,
                    size_t (*)(
                        char*,
                        size_t,
                        size_t,
                        void*
                    )
                );
            break;
        case CURLOPT_HEADERDATA:
            handle->header_data =
                va_arg(
                    arguments,
                    void*
                );
            break;
        case CURLOPT_HEADERFUNCTION:
            handle->header_func =
                va_arg(
                    arguments,
                    size_t (*)(
                        char*,
                        size_t,
                        size_t,
                        void*
                    )
                );
            break;
        case CURLOPT_HTTPHEADER:
            handle->headers =
                va_arg(
                    arguments,
                    struct curl_slist*
                );
            break;
        default:
            break;
    }

    va_end(arguments);
    return CURLE_OK;
}

CURLcode curl_easy_perform(CURL* curl) {
    MockCurlHandle* handle = nullptr;

    {
        std::lock_guard<std::mutex> lock(
            g_handle_mtx
        );

        auto iterator =
            g_handles.find(curl);

        if (iterator == g_handles.end()) {
            return CURLE_BAD_FUNCTION_ARGUMENT;
        }

        handle = iterator->second;
    }

    CurlMock::CallRecord record;
    record.url = handle->url;
    record.post_data =
        handle->post_data;
    record.method = handle->method;

    CurlMock::State::instance()
        .record_call(record);

    auto config =
        CurlMock::State::instance()
            .get_config();

    handle->http_code =
        config.http_code;

    auto callback =
        CurlMock::State::instance()
            .get_perform_callback();

    if (callback) {
        CURLcode result =
            callback(record);

        if (result != CURLE_OK) {
            return result;
        }

        config =
            CurlMock::State::instance()
                .get_config();

        handle->http_code =
            config.http_code;
    }

    if (
        handle->header_func &&
        handle->header_data &&
        !config.response_headers.empty()
    ) {
        handle->header_func(
            config.response_headers.data(),
            1,
            config.response_headers.size(),
            handle->header_data
        );
    }

    if (
        handle->write_func &&
        handle->write_data &&
        !config.response_body.empty()
    ) {
        handle->write_func(
            config.response_body.data(),
            1,
            config.response_body.size(),
            handle->write_data
        );
    }

    return config.perform_result;
}

CURLcode curl_easy_getinfo(
    CURL* curl,
    CURLINFO info,
    ...
) {
    std::lock_guard<std::mutex> lock(
        g_handle_mtx
    );

    auto iterator =
        g_handles.find(curl);

    if (iterator == g_handles.end()) {
        return CURLE_BAD_FUNCTION_ARGUMENT;
    }

    va_list arguments;
    va_start(arguments, info);

    if (
        info ==
        CURLINFO_RESPONSE_CODE
    ) {
        long* code =
            va_arg(arguments, long*);

        *code =
            iterator->second->http_code;
    }

    va_end(arguments);
    return CURLE_OK;
}

struct curl_slist* curl_slist_append(
    struct curl_slist* list,
    const char* string
) {
    auto* node = new curl_slist();
    node->data = strdup(string);
    node->next = nullptr;

    if (!list) return node;

    curl_slist* tail = list;

    while (tail->next) {
        tail = tail->next;
    }

    tail->next = node;
    return list;
}

void curl_slist_free_all(
    struct curl_slist* list
) {
    while (list) {
        auto* next = list->next;
        free(list->data);
        delete list;
        list = next;
    }
}

const char* curl_easy_strerror(
    CURLcode code
) {
    switch (code) {
        case CURLE_OK:
            return "No error";
        case CURLE_COULDNT_CONNECT:
            return "Couldn't connect";
        case CURLE_OPERATION_TIMEDOUT:
            return "Operation timed out";
        default:
            return "Unknown error";
    }
}

CURLcode curl_global_init(long) {
    return CURLE_OK;
}

void curl_global_cleanup() {}

}
