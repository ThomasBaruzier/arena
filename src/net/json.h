#pragma once

#include <sstream>
#include <string>
#include "../core/utils.h"

namespace Arena::Net {

    class JsonStream {
    public:
        JsonStream() { ss << "{"; }

        void add_raw(const char* key, const std::string& val) {
            if (!first) ss << ",";
            ss << "\"" << key << "\":" << val;
            first = false;
        }

        void add_str(const char* key, const std::string& val) {
            if (!first) ss << ",";
            ss << "\"" << key << "\":\"" << Core::Utils::json_escape(val) << "\"";
            first = false;
        }

        template<typename T>
        void add(const char* key, T val) {
            if (!first) ss << ",";
            ss << "\"" << key << "\":" << val;
            first = false;
        }

        void add_null(const char* key) {
            if (!first) ss << ",";
            ss << "\"" << key << "\":null";
            first = false;
        }

        std::string str() {
            ss << "}";
            return ss.str();
        }

    private:
        std::stringstream ss;
        bool first = true;
    };
}
