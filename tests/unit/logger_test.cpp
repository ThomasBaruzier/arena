#include "../common/test_utils.h"
#include "../src/core/logger.h"

using namespace Arena;

class LoggerTest : public ::testing::Test {
protected:
    void SetUp() override {
        Core::Logger::set_level(Core::Logger::Level::ERROR);
    }
    void TearDown() override {
        Core::Logger::set_level(Core::Logger::Level::INFO);
    }
};

TEST_F(LoggerTest, SetLevel) {
    Core::Logger::set_level(Core::Logger::Level::DEBUG);
    Core::Logger::set_level(Core::Logger::Level::INFO);
    Core::Logger::set_level(Core::Logger::Level::WARN);
    Core::Logger::set_level(Core::Logger::Level::ERROR);
}

TEST_F(LoggerTest, LogTypes) {
    Core::Logger::set_level(Core::Logger::Level::DEBUG);
    Core::Logger::log(Core::Logger::Level::DEBUG, "String: ", std::string("test"));
    Core::Logger::log(Core::Logger::Level::DEBUG, "Int: ", 42);
    Core::Logger::log(Core::Logger::Level::DEBUG, "Double: ", 3.14);
    Core::Logger::log(Core::Logger::Level::DEBUG, "Long: ", 123456789L);
    Core::Logger::log(Core::Logger::Level::DEBUG, "Size_t: ", (size_t)999);
}

TEST_F(LoggerTest, LogFiltering) {
    Core::Logger::set_level(Core::Logger::Level::ERROR);
    Core::Logger::log(Core::Logger::Level::DEBUG, "Invisible");
    Core::Logger::log(Core::Logger::Level::WARN, "Invisible");
    Core::Logger::log(Core::Logger::Level::ERROR, "Visible");
}
