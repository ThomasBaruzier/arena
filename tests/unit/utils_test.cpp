#include "../common/test_utils.h"
#include "../src/core/utils.h"

using namespace Arena;

class UtilsTest : public ::testing::Test {};

TEST_F(UtilsTest, DurationParsing) {
    EXPECT_EQ(Core::Utils::parse_duration_ms("100ms"), 100);
    EXPECT_EQ(Core::Utils::parse_duration_ms("1ms"), 1);
    EXPECT_EQ(Core::Utils::parse_duration_ms("5000ms"), 5000);
    EXPECT_EQ(Core::Utils::parse_duration_ms("1s"), 1000);
    EXPECT_EQ(Core::Utils::parse_duration_ms("5s"), 5000);
    EXPECT_EQ(Core::Utils::parse_duration_ms("1.5s"), 1500);
    EXPECT_EQ(Core::Utils::parse_duration_ms("1.25s"), 1250);
    EXPECT_EQ(Core::Utils::parse_duration_ms("1m"), 60000);
    EXPECT_EQ(Core::Utils::parse_duration_ms("0.75m"), 45000);
    EXPECT_EQ(Core::Utils::parse_duration_ms("1h"), 3600000);
    EXPECT_EQ(Core::Utils::parse_duration_ms("0.25h"), 900000);
    EXPECT_EQ(Core::Utils::parse_duration_ms("1"), 1000);
}

TEST_F(UtilsTest, DurationParsingEdgeCases) {
    EXPECT_EQ(Core::Utils::parse_duration_ms("0"), 0);
    EXPECT_EQ(Core::Utils::parse_duration_ms("0s"), 0);
    EXPECT_EQ(Core::Utils::parse_duration_ms("0.001s"), 1);
    EXPECT_EQ(Core::Utils::parse_duration_ms("24h"), 86400000);
    EXPECT_THROW(Core::Utils::parse_duration_ms("5x"), std::invalid_argument);
}

TEST_F(UtilsTest, MemoryParsing) {
    EXPECT_EQ(Core::Utils::parse_memory_bytes("1k"), 1024);
    EXPECT_EQ(Core::Utils::parse_memory_bytes("100K"), 102400);
    EXPECT_EQ(Core::Utils::parse_memory_bytes("1m"), 1024 * 1024);
    EXPECT_EQ(Core::Utils::parse_memory_bytes("512M"), 512 * 1024 * 1024);
    EXPECT_EQ(Core::Utils::parse_memory_bytes("1g"), 1024LL * 1024 * 1024);
    EXPECT_EQ(Core::Utils::parse_memory_bytes("1.5g"), (long long)(1.5 * 1024 * 1024 * 1024));
    EXPECT_EQ(Core::Utils::parse_memory_bytes("512"), 512 * 1024 * 1024);
}

TEST_F(UtilsTest, MemoryParsingEdgeCases) {
    EXPECT_EQ(Core::Utils::parse_memory_bytes("0"), 0);
    EXPECT_EQ(Core::Utils::parse_memory_bytes(""), 0);
    EXPECT_EQ(Core::Utils::parse_memory_bytes("100g"), 100LL * 1024 * 1024 * 1024);
    EXPECT_THROW(Core::Utils::parse_memory_bytes("1x"), std::invalid_argument);
}

TEST_F(UtilsTest, NodeCountParsing) {
    EXPECT_EQ(Core::Utils::parse_node_count("1000"), 1000);
    EXPECT_EQ(Core::Utils::parse_node_count("1k"), 1000);
    EXPECT_EQ(Core::Utils::parse_node_count("1.5k"), 1500);
    EXPECT_EQ(Core::Utils::parse_node_count("1m"), 1000000);
    EXPECT_EQ(Core::Utils::parse_node_count("1.5m"), 1500000);
    EXPECT_EQ(Core::Utils::parse_node_count("1b"), 1000000000);
    EXPECT_EQ(Core::Utils::parse_node_count("0.25b"), 250000000);
}

TEST_F(UtilsTest, NodeCountEdgeCases) {
    EXPECT_EQ(Core::Utils::parse_node_count(""), 0);
    EXPECT_EQ(Core::Utils::parse_node_count("0"), 0);
    EXPECT_EQ(Core::Utils::parse_node_count("10b"), 10000000000ULL);
    EXPECT_EQ(Core::Utils::parse_node_count("1x"), 1);
}

TEST_F(UtilsTest, CsvSplit) {
    auto res = Core::Utils::split_csv("a,b,c");
    ASSERT_EQ(res.size(), 3);
    EXPECT_EQ(res[0], "a");
    EXPECT_EQ(res[1], "b");
    EXPECT_EQ(res[2], "c");

    auto empty = Core::Utils::split_csv(",,");
    EXPECT_TRUE(empty.empty());

    auto trailing = Core::Utils::split_csv("a,b,");
    ASSERT_EQ(trailing.size(), 2);
}

TEST_F(UtilsTest, JsonEscape) {
    EXPECT_EQ(Core::Utils::json_escape("abc"), "abc");
    EXPECT_EQ(Core::Utils::json_escape("a\"b"), "a\\\"b");
    EXPECT_EQ(Core::Utils::json_escape("line\n"), "line\\n");
    EXPECT_EQ(Core::Utils::json_escape("path\\to"), "path\\\\to");
    EXPECT_EQ(Core::Utils::json_escape("tab\t"), "tab\\t");
    EXPECT_EQ(Core::Utils::json_escape(""), "");
}

TEST_F(UtilsTest, FormatNodes) {
    EXPECT_EQ(Core::Utils::format_nodes(1000), "1k");
    EXPECT_EQ(Core::Utils::format_nodes(1500000), "1m");
    EXPECT_EQ(Core::Utils::format_nodes(2000000000), "2g");
    EXPECT_EQ(Core::Utils::format_nodes(500), "500");
}
TEST_F(UtilsTest, JsonEscapeAdvanced) {
    EXPECT_EQ(Core::Utils::json_escape("hello\nworld"), "hello\\nworld");
    EXPECT_EQ(Core::Utils::json_escape("a\"b"), "a\\\"b");
    EXPECT_EQ(Core::Utils::json_escape("\\"), "\\\\");
    EXPECT_EQ(Core::Utils::json_escape("\t"), "\\t");
    EXPECT_EQ(Core::Utils::json_escape("\b\f\r"), "\\b\\f\\r");
}

TEST_F(UtilsTest, SplitCsvEdgeCases) {
    auto res = Core::Utils::split_csv("");
    EXPECT_TRUE(res.empty());

    res = Core::Utils::split_csv("a,,b");
    ASSERT_EQ(res.size(), 2);
    EXPECT_EQ(res[1], "b");

    res = Core::Utils::split_csv(",");
    ASSERT_EQ(res.size(), 0);
}
