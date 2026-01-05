#pragma once

#include <string>
#include <vector>
#include <sstream>
#include <iomanip>
#include <stdexcept>
#include <algorithm>
#include <random>
#include <chrono>

namespace Arena::Core::Utils {

    inline std::string json_escape(const std::string& s) {
        std::stringstream ss;
        for (char c : s) {
            if (c == '"') ss << "\\\"";
            else if (c == '\\') ss << "\\\\";
            else if (c == '/') ss << "\\/";
            else if (c == '\b') ss << "\\b";
            else if (c == '\f') ss << "\\f";
            else if (c == '\n') ss << "\\n";
            else if (c == '\r') ss << "\\r";
            else if (c == '\t') ss << "\\t";
            else if ((unsigned char)c < 32)
                ss << "\\u" << std::setfill('0')
                   << std::setw(4) << std::hex << (int)c;
            else ss << c;
        }
        return ss.str();
    }

    inline std::vector<std::string> split_csv(const std::string& s) {
        std::vector<std::string> result;
        std::stringstream ss(s);
        std::string item;
        while (std::getline(ss, item, ',')) {
            if (!item.empty()) result.push_back(item);
        }
        return result;
    }

    inline int parse_duration_ms(const std::string& s) {
        size_t idx = 0;
        double val = std::stod(s, &idx);
        std::string unit = s.substr(idx);
        if (unit.empty() || unit == "s") return int(val * 1000);
        if (unit == "ms") return int(val);
        if (unit == "m") return int(val * 60000);
        if (unit == "h") return int(val * 3600000);
        throw std::invalid_argument("Unknown duration unit in: " + s);
    }

    inline long long parse_memory_bytes(const std::string& s) {
        if (s.empty()) return 0;
        size_t idx = 0;
        double val = std::stod(s, &idx);
        std::string unit = s.substr(idx);
        if (!unit.empty() && (unit.back() == 'b' || unit.back() == 'B')) {
            unit.pop_back();
        }

        long long mult = 1;
        if (unit.empty()) mult = 1024 * 1024;
        else if (unit == "k" || unit == "K") mult = 1024;
        else if (unit == "m" || unit == "M") mult = 1024 * 1024;
        else if (unit == "g" || unit == "G") mult = 1024 * 1024 * 1024;
        else throw std::invalid_argument("Unknown memory unit: " + s);

        return (long long)(val * static_cast<double>(mult));
    }

    inline uint64_t parse_node_count(const std::string& item) {
        if (item.empty()) return 0;
        size_t idx = 0;
        double val = std::stod(item, &idx);
        std::string suffix = item.substr(idx);
        for (auto& c : suffix) c = static_cast<char>(tolower(c));
        uint64_t m = 1;
        if (suffix == "k") m = 1000;
        else if (suffix == "m") m = 1000000;
        else if (suffix == "b" || suffix == "g") m = 1000000000;
        return (uint64_t)(val * static_cast<double>(m));
    }

    inline std::string generate_run_id() {
        auto now = std::chrono::system_clock::now();
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()
        ).count();

        thread_local std::mt19937 gen(std::random_device{}());
        std::uniform_int_distribution<uint32_t> dis(0, 0xFFFFFFFF);

        std::ostringstream ss;
        ss << std::hex << (ms & 0xFFFFFFFF) << "_" << dis(gen);
        return ss.str();
    }

    inline std::string format_nodes(uint64_t nodes) {
        if (nodes == 0) return "";
        if (nodes >= 1000000000) return std::to_string(nodes / 1000000000) + "g";
        if (nodes >= 1000000) return std::to_string(nodes / 1000000) + "m";
        if (nodes >= 1000) return std::to_string(nodes / 1000) + "k";
        return std::to_string(nodes);
    }
}
