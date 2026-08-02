#pragma once

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cctype>
#include <cstdint>
#include <iomanip>
#include <limits>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Arena::Core::Utils {

inline std::string truncate(
    const std::string& value,
    size_t max_length = 64
) {
    return value.length() <= max_length
        ? value
        : value.substr(0, max_length) + "...";
}

inline std::string json_escape(const std::string& value) {
    std::stringstream output;

    for (unsigned char character : value) {
        switch (character) {
            case '"':
                output << "\\\"";
                break;
            case '\\':
                output << "\\\\";
                break;
            case '/':
                output << "\\/";
                break;
            case '\b':
                output << "\\b";
                break;
            case '\f':
                output << "\\f";
                break;
            case '\n':
                output << "\\n";
                break;
            case '\r':
                output << "\\r";
                break;
            case '\t':
                output << "\\t";
                break;
            default:
                if (character < 32) {
                    output
                        << "\\u"
                        << std::setfill('0')
                        << std::setw(4)
                        << std::hex
                        << static_cast<int>(character);
                } else {
                    output << character;
                }
        }
    }

    return output.str();
}

inline std::vector<std::string> split_csv(const std::string& value) {
    std::vector<std::string> result;
    std::stringstream stream(value);
    std::string item;

    while (std::getline(stream, item, ',')) {
        if (!item.empty()) {
            result.push_back(item);
        }
    }

    return result;
}

inline double parse_nonnegative_number(
    const std::string& value,
    size_t& consumed
) {
    if (
        value.empty() ||
        std::any_of(
            value.begin(),
            value.end(),
            [](unsigned char character) {
                return std::isspace(character);
            }
        )
    ) {
        throw std::invalid_argument("Invalid numeric value: " + value);
    }

    double number = std::stod(value, &consumed);

    if (
        consumed == 0 ||
        !std::isfinite(number) ||
        number < 0.0
    ) {
        throw std::invalid_argument("Invalid numeric value: " + value);
    }

    return number;
}

inline int parse_duration_ms(const std::string& value) {
    size_t consumed = 0;
    double number = parse_nonnegative_number(value, consumed);
    std::string unit = value.substr(consumed);
    long double multiplier = 0;

    if (unit.empty() || unit == "s") {
        multiplier = 1000.0L;
    } else if (unit == "ms") {
        multiplier = 1.0L;
    } else if (unit == "m") {
        multiplier = 60000.0L;
    } else if (unit == "h") {
        multiplier = 3600000.0L;
    } else {
        throw std::invalid_argument("Unknown duration unit in: " + value);
    }

    long double result = static_cast<long double>(number) * multiplier;

    if (
        result >
        static_cast<long double>(std::numeric_limits<int>::max())
    ) {
        throw std::out_of_range("Duration is too large: " + value);
    }

    return static_cast<int>(result);
}

inline long long parse_memory_bytes(const std::string& value) {
    if (value.empty()) {
        return 0;
    }

    size_t consumed = 0;
    double number = parse_nonnegative_number(value, consumed);
    std::string unit = value.substr(consumed);

    if (!unit.empty() && (unit.back() == 'b' || unit.back() == 'B')) {
        unit.pop_back();
    }

    long double multiplier = 0;

    if (unit.empty() || unit == "m" || unit == "M") {
        multiplier = 1024.0L * 1024.0L;
    } else if (unit == "k" || unit == "K") {
        multiplier = 1024.0L;
    } else if (unit == "g" || unit == "G") {
        multiplier = 1024.0L * 1024.0L * 1024.0L;
    } else {
        throw std::invalid_argument("Unknown memory unit in: " + value);
    }

    long double result = static_cast<long double>(number) * multiplier;

    if (
        result >
        static_cast<long double>(std::numeric_limits<long long>::max())
    ) {
        throw std::out_of_range("Memory value is too large: " + value);
    }

    return static_cast<long long>(result);
}

inline uint64_t parse_node_count(const std::string& value) {
    if (value.empty()) {
        return 0;
    }

    size_t consumed = 0;
    double number = parse_nonnegative_number(value, consumed);
    std::string suffix = value.substr(consumed);

    std::transform(
        suffix.begin(),
        suffix.end(),
        suffix.begin(),
        [](unsigned char character) {
            return static_cast<char>(std::tolower(character));
        }
    );

    long double multiplier = 0;

    if (suffix.empty()) {
        multiplier = 1.0L;
    } else if (suffix == "k") {
        multiplier = 1000.0L;
    } else if (suffix == "m") {
        multiplier = 1000000.0L;
    } else if (suffix == "b" || suffix == "g") {
        multiplier = 1000000000.0L;
    } else {
        throw std::invalid_argument(
            "Unknown node count suffix in: " + value
        );
    }

    long double result = static_cast<long double>(number) * multiplier;

    if (
        result >
        static_cast<long double>(std::numeric_limits<uint64_t>::max())
    ) {
        throw std::out_of_range("Node count is too large: " + value);
    }

    return static_cast<uint64_t>(result);
}

inline std::string generate_run_id() {
    auto now = std::chrono::system_clock::now();
    auto milliseconds =
        std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()
        ).count();

    thread_local std::mt19937 generator(std::random_device{}());

    std::uniform_int_distribution<uint32_t> distribution(
        0,
        std::numeric_limits<uint32_t>::max()
    );

    std::ostringstream result;
    result
        << std::hex
        << (milliseconds & 0xFFFFFFFF)
        << "_"
        << distribution(generator);

    return result.str();
}

inline std::string format_nodes(uint64_t nodes) {
    if (nodes == 0) {
        return "";
    }

    if (nodes >= 1000000000) {
        return std::to_string(nodes / 1000000000) + "g";
    }

    if (nodes >= 1000000) {
        return std::to_string(nodes / 1000000) + "m";
    }

    if (nodes >= 1000) {
        return std::to_string(nodes / 1000) + "k";
    }

    return std::to_string(nodes);
}

}
