#include "../common/test_utils.h"
#include "../src/core/utils.h"
#include <limits>

using namespace Arena;

class UtilsTest : public ::testing::Test {};

TEST_F(UtilsTest, DurationParsing) {
    EXPECT_EQ(
        Core::Utils::parse_duration_ms("100ms"),
        100
    );
    EXPECT_EQ(
        Core::Utils::parse_duration_ms("1s"),
        1000
    );
    EXPECT_EQ(
        Core::Utils::parse_duration_ms("1.5s"),
        1500
    );
    EXPECT_EQ(
        Core::Utils::parse_duration_ms("1m"),
        60000
    );
    EXPECT_EQ(
        Core::Utils::parse_duration_ms("0.25h"),
        900000
    );
    EXPECT_EQ(
        Core::Utils::parse_duration_ms("1"),
        1000
    );
    EXPECT_EQ(
        Core::Utils::parse_duration_ms("0"),
        0
    );
}

TEST_F(UtilsTest, InvalidDurations) {
    for (
        const char* value :
        {
            "",
            "-1s",
            "1x",
            "1 s",
            "nan",
            "inf",
            "1ss"
        }
    ) {
        EXPECT_THROW(
            Core::Utils::parse_duration_ms(
                value
            ),
            std::exception
        ) << value;
    }

    EXPECT_THROW(
        Core::Utils::parse_duration_ms(
            "999999999h"
        ),
        std::out_of_range
    );
}

TEST_F(UtilsTest, MemoryParsing) {
    EXPECT_EQ(
        Core::Utils::parse_memory_bytes("1k"),
        1024
    );
    EXPECT_EQ(
        Core::Utils::parse_memory_bytes("100K"),
        102400
    );
    EXPECT_EQ(
        Core::Utils::parse_memory_bytes("1m"),
        1024 * 1024
    );
    EXPECT_EQ(
        Core::Utils::parse_memory_bytes("512M"),
        512LL * 1024 * 1024
    );
    EXPECT_EQ(
        Core::Utils::parse_memory_bytes("1g"),
        1024LL * 1024 * 1024
    );
    EXPECT_EQ(
        Core::Utils::parse_memory_bytes("1GB"),
        1024LL * 1024 * 1024
    );
    EXPECT_EQ(
        Core::Utils::parse_memory_bytes("512"),
        512LL * 1024 * 1024
    );
    EXPECT_EQ(
        Core::Utils::parse_memory_bytes(""),
        0
    );
}

TEST_F(UtilsTest, InvalidMemory) {
    for (
        const char* value :
        {
            "-1m",
            "1x",
            "1 m",
            "nan",
            "inf",
            "1mbb"
        }
    ) {
        EXPECT_THROW(
            Core::Utils::parse_memory_bytes(
                value
            ),
            std::exception
        ) << value;
    }

    EXPECT_THROW(
        Core::Utils::parse_memory_bytes(
            "999999999999999g"
        ),
        std::out_of_range
    );
}

TEST_F(UtilsTest, NodeCountParsing) {
    EXPECT_EQ(
        Core::Utils::parse_node_count("1000"),
        1000
    );
    EXPECT_EQ(
        Core::Utils::parse_node_count("1k"),
        1000
    );
    EXPECT_EQ(
        Core::Utils::parse_node_count("1.5k"),
        1500
    );
    EXPECT_EQ(
        Core::Utils::parse_node_count("1m"),
        1000000
    );
    EXPECT_EQ(
        Core::Utils::parse_node_count("1M"),
        1000000
    );
    EXPECT_EQ(
        Core::Utils::parse_node_count("1b"),
        1000000000
    );
    EXPECT_EQ(
        Core::Utils::parse_node_count("1g"),
        1000000000
    );
    EXPECT_EQ(
        Core::Utils::parse_node_count(""),
        0
    );
}

TEST_F(UtilsTest, InvalidNodeCounts) {
    for (
        const char* value :
        {
            "-1",
            "1x",
            "1 m",
            "nan",
            "inf",
            "1kk"
        }
    ) {
        EXPECT_THROW(
            Core::Utils::parse_node_count(
                value
            ),
            std::exception
        ) << value;
    }

    EXPECT_THROW(
        Core::Utils::parse_node_count(
            "999999999999999999999g"
        ),
        std::exception
    );
}

TEST_F(UtilsTest, CsvSplit) {
    EXPECT_EQ(
        Core::Utils::split_csv("a,b,c"),
        (
            std::vector<std::string>{
                "a",
                "b",
                "c"
            }
        )
    );

    EXPECT_EQ(
        Core::Utils::split_csv("a,,b"),
        (
            std::vector<std::string>{
                "a",
                "b"
            }
        )
    );

    EXPECT_TRUE(
        Core::Utils::split_csv("").empty()
    );
    EXPECT_TRUE(
        Core::Utils::split_csv(",,").empty()
    );
}

TEST_F(UtilsTest, JsonEscape) {
    EXPECT_EQ(
        Core::Utils::json_escape("abc"),
        "abc"
    );
    EXPECT_EQ(
        Core::Utils::json_escape("a\"b"),
        "a\\\"b"
    );
    EXPECT_EQ(
        Core::Utils::json_escape("line\n"),
        "line\\n"
    );
    EXPECT_EQ(
        Core::Utils::json_escape("path\\to"),
        "path\\\\to"
    );
    EXPECT_EQ(
        Core::Utils::json_escape("\b\f\r\t"),
        "\\b\\f\\r\\t"
    );
}

TEST_F(UtilsTest, FormatNodes) {
    EXPECT_EQ(
        Core::Utils::format_nodes(0),
        ""
    );
    EXPECT_EQ(
        Core::Utils::format_nodes(500),
        "500"
    );
    EXPECT_EQ(
        Core::Utils::format_nodes(1000),
        "1k"
    );
    EXPECT_EQ(
        Core::Utils::format_nodes(1500000),
        "1m"
    );
    EXPECT_EQ(
        Core::Utils::format_nodes(2000000000),
        "2g"
    );
}
