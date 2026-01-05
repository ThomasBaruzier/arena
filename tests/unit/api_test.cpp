#include "../common/test_utils.h"
#include "../src/net/api_client.h"

using namespace Arena;

class ApiTest : public ::testing::Test {
protected:
    std::shared_ptr<Net::ApiManager> api;
    void SetUp() override {
        api = std::make_shared<Net::ApiManager>("http://url", "key", 0);
    }
};

TEST_F(ApiTest, EventJsonStructure) {
    Net::ApiManager::Event e;
    e.type = "move";
    e.x = 5;
    e.y = 10;
    e.c = 1;

    std::string json = api->build_event_json(e);
    EXPECT_NE(json.find("\"type\":\"move\""), std::string::npos);
    EXPECT_NE(json.find("\"x\":5"), std::string::npos);
    EXPECT_NE(json.find("\"y\":10"), std::string::npos);
    EXPECT_NE(json.find("\"c\":1"), std::string::npos);
}

TEST_F(ApiTest, ResultEvent) {
    Net::ApiManager::Event e;
    e.type = "result";
    e.winner = 1;
    e.moves = "a1b2";

    std::string json = api->build_event_json(e);
    EXPECT_NE(json.find("\"type\":\"result\""), std::string::npos);
    EXPECT_NE(json.find("\"winner\":1"), std::string::npos);
    EXPECT_NE(json.find("\"moves\":\"a1b2\""), std::string::npos);
}

TEST_F(ApiTest, InjectionProtection) {
    Net::ApiManager::Event e;
    e.type = "start";
    e.p1_name = "\", \"admin\": true";

    std::string json = api->build_event_json(e);
    EXPECT_NE(json.find("\\\""), std::string::npos);
    EXPECT_EQ(json.find("\", \"admin\""), std::string::npos);
}

TEST_F(ApiTest, BatchFormat) {
    std::vector<Net::ApiManager::Event> batch(2);
    batch[0].type = "a";
    batch[1].type = "b";

    std::string json = api->build_json_payload(batch);
    EXPECT_EQ(json.front(), '[');
    EXPECT_EQ(json.back(), ']');
    EXPECT_NE(json.find("},{"), std::string::npos);
}

TEST_F(ApiTest, RunStartEvent) {
    Net::ApiManager::Event e;
    e.type = "run_start";
    e.run_id = "run123";
    e.p1_name = "bot1"; e.p1v = "v1";
    e.p2_name = "bot2"; e.p2v = "v2";
    e.config_label = "test_conf";
    e.total_games = 100;
    e.p1_nodes = 1000;
    e.p2_nodes = 2000;
    e.eval_nodes = 500;
    e.board_size = 15;
    e.min_pairs = 1;
    e.max_pairs = 5;
    e.repeat_index = 0;
    e.seed = 12345ULL;

    std::string json = api->build_event_json(e);
    EXPECT_NE(json.find("\"type\":\"run_start\""), std::string::npos);
    EXPECT_NE(json.find("\"run_id\":\"run123\""), std::string::npos);
    EXPECT_NE(json.find("\"p1_nodes\":1000"), std::string::npos);
    EXPECT_NE(json.find("\"seed\":12345"), std::string::npos);
}

TEST_F(ApiTest, RunUpdateEvent) {
    Net::ApiManager::Event e;
    e.type = "run_update";
    e.run_id = "run123";
    e.games_played = 10;
    e.wins = 5; e.losses = 2; e.draws = 3;
    e.wall_time_ms = 5000;
    e.p1_elo = 1200; e.p2_elo = 1150;

    std::string json = api->build_event_json(e);
    EXPECT_NE(json.find("\"type\":\"run_update\""), std::string::npos);
    EXPECT_NE(json.find("\"games_played\":10"), std::string::npos);
    EXPECT_NE(json.find("\"p1_elo\":1200"), std::string::npos);
}

TEST_F(ApiTest, EmptyBatch) {
    std::vector<Net::ApiManager::Event> batch;
    std::string json = api->build_json_payload(batch);
    EXPECT_EQ(json, "[]");
}

TEST_F(ApiTest, NullSeedRendering) {
    Net::ApiManager::Event e;
    e.type = "run_start";
    e.run_id = "test";
    e.seed = std::nullopt;

    std::string json = api->build_event_json(e);
    EXPECT_NE(json.find("\"seed\":null"), std::string::npos);
}

TEST_F(ApiTest, SeedPresentRendering) {
    Net::ApiManager::Event e;
    e.type = "run_start";
    e.run_id = "test";
    e.seed = 42ULL;

    std::string json = api->build_event_json(e);
    EXPECT_NE(json.find("\"seed\":42"), std::string::npos);
}

TEST_F(ApiTest, LargeBatchFormat) {
    std::vector<Net::ApiManager::Event> batch(100);
    for (int i = 0; i < 100; ++i) {
        batch[i].type = "move";
        batch[i].x = i;
    }

    std::string json = api->build_json_payload(batch);
    EXPECT_EQ(json.front(), '[');
    EXPECT_EQ(json.back(), ']');

    int commas = 0;
    for (size_t i = 1; i < json.size() - 1; ++i) {
        if (json[i] == ',' && json[i-1] == '}') commas++;
    }
    EXPECT_EQ(commas, 99);
}

TEST_F(ApiTest, SpecialCharsInNames) {
    Net::ApiManager::Event e;
    e.type = "start";
    e.p1_name = "bot\twith\ttabs";
    e.p2_name = "bot\nwith\nnewlines";

    std::string json = api->build_event_json(e);
    EXPECT_NE(json.find("\\t"), std::string::npos);
    EXPECT_NE(json.find("\\n"), std::string::npos);
}

TEST_F(ApiTest, BooleanFieldRendering) {
    Net::ApiManager::Event e;
    e.type = "run_update";
    e.is_done = true;

    std::string json = api->build_event_json(e);
    EXPECT_NE(json.find("\"is_done\":true"), std::string::npos);
}

TEST_F(ApiTest, AllEventTypes) {
    Net::ApiManager::Event e1;
    e1.type = "start";
    e1.run_id = "r1";
    e1.p1_name = "p1";
    e1.p2_name = "p2";
    e1.black_is_p1 = false;
    std::string json1 = api->build_event_json(e1);
    EXPECT_NE(json1.find("\"black_is_p1\":false"), std::string::npos);

    Net::ApiManager::Event e2;
    e2.type = "move";
    e2.x = 7;
    e2.y = 8;
    e2.c = 1;
    std::string json2 = api->build_event_json(e2);
    EXPECT_NE(json2.find("\"x\":7"), std::string::npos);
    EXPECT_NE(json2.find("\"y\":8"), std::string::npos);

    Net::ApiManager::Event e3;
    e3.type = "result";
    e3.winner = 2;
    e3.moves = "0,0,1;1,1,2";
    std::string json3 = api->build_event_json(e3);
    EXPECT_NE(json3.find("\"winner\":2"), std::string::npos);
}
