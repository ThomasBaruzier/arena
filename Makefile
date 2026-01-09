NAME            := arena
TEST_NAME       := arena_test
COV_NAME        := arena_test_cov
ENGINE_NAME     := pbrain-rapfi

SRC_DIR         := src
TEST_DIR        := tests
BUILD_DIR       := build
OBJ_DIR         := $(BUILD_DIR)/release
COV_OBJ_DIR     := $(BUILD_DIR)/coverage
COV_REPORT_DIR  := coverage
RAPFI_DIR       := rapfi/Rapfi
MISC_DIR        := misc

CXX             := g++

INC_FLAGS       := -I$(SRC_DIR)
DEP_FLAGS       := -MMD -MP
COMMON_FLAGS    := -std=c++17 -Wall -Wextra $(INC_FLAGS)

CXXFLAGS        := $(COMMON_FLAGS) -O3 -flto -march=native -DNDEBUG
LDFLAGS         := -lcurl -lpthread
TEST_LDFLAGS    := -lgtest -lgtest_main -lcurl -lpthread

COV_FLAGS       := $(COMMON_FLAGS) -g -O0 --coverage -fprofile-arcs -ftest-coverage
COV_LDFLAGS     := -lgtest -lgtest_main -lcurl -lpthread --coverage

SRCS            := $(shell find $(SRC_DIR) -name "*.cpp")
TEST_SRCS       := $(shell find $(TEST_DIR) -name "*.cpp")
MOCK_SRCS       := $(shell find $(TEST_DIR)/mocks -name "*.cpp" 2>/dev/null)

OBJS            := $(SRCS:%.cpp=$(OBJ_DIR)/%.o)
TEST_OBJS       := $(TEST_SRCS:%.cpp=$(OBJ_DIR)/%.o)

COV_OBJS        := $(SRCS:%.cpp=$(COV_OBJ_DIR)/%.o)
TEST_COV_OBJS   := $(TEST_SRCS:%.cpp=$(COV_OBJ_DIR)/%.o)

MAIN_OBJ        := $(OBJ_DIR)/src/app/main.o
MAIN_COV_OBJ    := $(COV_OBJ_DIR)/src/app/main.o

DEPS            := $(OBJS:.o=.d) $(TEST_OBJS:.o=.d) $(COV_OBJS:.o=.d)

.PHONY: all clean fclean re engine test cov coverage view-dev view-prod

all: $(NAME) engine

$(NAME): $(OBJS)
	$(CXX) $(CXXFLAGS) $(OBJS) -o $(NAME) $(LDFLAGS)

engine:
	mkdir -p $(RAPFI_DIR)/build
	cd $(RAPFI_DIR)/build && cmake .. -DNO_COMMAND_MODULES=ON && $(MAKE) -j$(nproc)
	cp $(RAPFI_DIR)/build/$(ENGINE_NAME) .

test: test-cpp test-sh
	@echo "All tests passed."

test-cpp: $(TEST_NAME)
	./$(TEST_NAME)

test-sh: $(NAME)
	bash tests/test_arena.sh

$(TEST_NAME): $(filter-out $(MAIN_OBJ), $(OBJS)) $(TEST_OBJS)
	$(CXX) $(CXXFLAGS) $^ -o $(TEST_NAME) $(TEST_LDFLAGS)

$(OBJ_DIR)/%.o: %.cpp
	mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $(DEP_FLAGS) -c $< -o $@

$(COV_OBJ_DIR)/%.o: %.cpp
	mkdir -p $(dir $@)
	$(CXX) $(COV_FLAGS) $(DEP_FLAGS) -c $< -o $@

$(COV_NAME): $(filter-out $(MAIN_COV_OBJ), $(COV_OBJS)) $(TEST_COV_OBJS)
	$(CXX) $(COV_FLAGS) $^ -o $(COV_NAME) $(COV_LDFLAGS)

cov: coverage

coverage: $(COV_NAME)
	rm -rf $(COV_REPORT_DIR)
	find $(COV_OBJ_DIR) -name "*.gcda" -delete
	./$(COV_NAME)
	mkdir -p $(COV_REPORT_DIR)
	for gcda in $$(find $(COV_OBJ_DIR) -name "*.gcda"); do \
		gcov -o $$(dirname $$gcda) $$gcda > /dev/null 2>&1; \
	done
	mv *.gcov $(COV_REPORT_DIR)/ 2>/dev/null || true
	bash $(MISC_DIR)/cov.sh $(COV_REPORT_DIR)

view-dev:
	cd view && docker-compose -f docker-compose.dev.yml up --build

view-prod:
	cd view && docker-compose up --build

clean:
	rm -rf $(BUILD_DIR) $(COV_REPORT_DIR)
	find . \( \
		-name '*.o' -o -name '*.gcov' -o -name '*.gcda' -o -name '*.gcno' \
	\) -print -delete

fclean: clean
	rm -f $(NAME) $(TEST_NAME) $(ENGINE_NAME) $(COV_NAME)
	rm -rf $(RAPFI_DIR)/build

re: fclean
	@$(MAKE) all

-include $(DEPS)
