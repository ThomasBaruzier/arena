#include "curl_mock.h"
#include <cstring>
#include <map>

namespace CurlMock {

State& State::instance() {
    static State s;
    return s;
}

void State::reset() {
    std::lock_guard<std::mutex> l(mtx_);
    config_ = MockConfig{};
    calls_.clear();
    perform_cb_ = nullptr;
}

void State::set_config(const MockConfig& cfg) {
    std::lock_guard<std::mutex> l(mtx_);
    config_ = cfg;
}

MockConfig State::get_config() const {
    std::lock_guard<std::mutex> l(mtx_);
    return config_;
}

void State::record_call(const CallRecord& record) {
    std::lock_guard<std::mutex> l(mtx_);
    calls_.push_back(record);
}

std::vector<CallRecord> State::get_calls() const {
    std::lock_guard<std::mutex> l(mtx_);
    return calls_;
}

size_t State::call_count() const {
    std::lock_guard<std::mutex> l(mtx_);
    return calls_.size();
}

void State::set_perform_callback(std::function<CURLcode(const CallRecord&)> cb) {
    std::lock_guard<std::mutex> l(mtx_);
    perform_cb_ = cb;
}

std::function<CURLcode(const CallRecord&)> State::get_perform_callback() const {
    std::lock_guard<std::mutex> l(mtx_);
    return perform_cb_;
}

}

struct MockCurlHandle {
    std::string url;
    std::string post_data;
    std::string method = "GET";
    long http_code = 200;
    void* write_data = nullptr;
    size_t (*write_func)(void*, size_t, size_t, void*) = nullptr;
    struct curl_slist* headers = nullptr;
};

static std::map<CURL*, MockCurlHandle*> g_handles;
static std::mutex g_handle_mtx;

extern "C" {

CURL* curl_easy_init() {
    auto cfg = CurlMock::State::instance().get_config();
    if (cfg.init_fails) return nullptr;

    auto* handle = new MockCurlHandle();
    auto* ptr = reinterpret_cast<CURL*>(handle);

    std::lock_guard<std::mutex> l(g_handle_mtx);
    g_handles[ptr] = handle;
    return ptr;
}

void curl_easy_cleanup(CURL* curl) {
    std::lock_guard<std::mutex> l(g_handle_mtx);
    auto it = g_handles.find(curl);
    if (it != g_handles.end()) {
        delete it->second;
        g_handles.erase(it);
    }
}

CURLcode curl_easy_setopt(CURL* curl, CURLoption option, ...) {
    std::lock_guard<std::mutex> l(g_handle_mtx);
    auto it = g_handles.find(curl);
    if (it == g_handles.end()) return CURLE_BAD_FUNCTION_ARGUMENT;

    MockCurlHandle* h = it->second;
    va_list args;
    va_start(args, option);

    switch (option) {
        case CURLOPT_URL:
            h->url = va_arg(args, const char*);
            break;
        case CURLOPT_POSTFIELDS:
            h->post_data = va_arg(args, const char*);
            h->method = "POST";
            break;
        case CURLOPT_CUSTOMREQUEST:
            h->method = va_arg(args, const char*);
            break;
        case CURLOPT_WRITEDATA:
            h->write_data = va_arg(args, void*);
            break;
        case CURLOPT_WRITEFUNCTION:
            h->write_func = va_arg(args, size_t(*)(void*, size_t, size_t, void*));
            break;
        case CURLOPT_HTTPHEADER:
            h->headers = va_arg(args, struct curl_slist*);
            break;
        default:
            break;
    }

    va_end(args);
    return CURLE_OK;
}

CURLcode curl_easy_perform(CURL* curl) {
    MockCurlHandle* h = nullptr;
    {
        std::lock_guard<std::mutex> l(g_handle_mtx);
        auto it = g_handles.find(curl);
        if (it == g_handles.end()) return CURLE_BAD_FUNCTION_ARGUMENT;
        h = it->second;
    }

    CurlMock::CallRecord record;
    record.url = h->url;
    record.post_data = h->post_data;
    record.method = h->method;
    CurlMock::State::instance().record_call(record);

    auto cfg = CurlMock::State::instance().get_config();
    h->http_code = cfg.http_code;

    auto cb = CurlMock::State::instance().get_perform_callback();
    if (cb) {
        return cb(record);
    }

    if (h->write_func && h->write_data && !cfg.response_body.empty()) {
        h->write_func(
            const_cast<char*>(cfg.response_body.data()),
            1, cfg.response_body.size(),
            h->write_data
        );
    }

    return cfg.perform_result;
}

CURLcode curl_easy_getinfo(CURL* curl, CURLINFO info, ...) {
    std::lock_guard<std::mutex> l(g_handle_mtx);
    auto it = g_handles.find(curl);
    if (it == g_handles.end()) return CURLE_BAD_FUNCTION_ARGUMENT;

    va_list args;
    va_start(args, info);

    if (info == CURLINFO_RESPONSE_CODE) {
        long* code = va_arg(args, long*);
        *code = it->second->http_code;
    }

    va_end(args);
    return CURLE_OK;
}

struct curl_slist* curl_slist_append(struct curl_slist* list, const char* string) {
    auto* node = new curl_slist();
    node->data = strdup(string);
    node->next = nullptr;

    if (!list) return node;

    curl_slist* tail = list;
    while (tail->next) tail = tail->next;
    tail->next = node;
    return list;
}

void curl_slist_free_all(struct curl_slist* list) {
    while (list) {
        auto* next = list->next;
        free(list->data);
        delete list;
        list = next;
    }
}

const char* curl_easy_strerror(CURLcode code) {
    switch (code) {
        case CURLE_OK: return "No error";
        case CURLE_COULDNT_CONNECT: return "Couldn't connect";
        case CURLE_OPERATION_TIMEDOUT: return "Operation timed out";
        default: return "Unknown error";
    }
}

CURLcode curl_global_init(long) { return CURLE_OK; }
void curl_global_cleanup() {}

}
