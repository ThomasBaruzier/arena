#!/bin/bash

ARENA="./arena"
BOT="tests/test_bots/dummy_bot.sh"
CRASH_BOT="tests/test_bots/crash_bot.sh"
TIMEOUT_BOT="tests/test_bots/timeout_bot.sh"
PASS=0
FAIL=0
TEST_DIR=$(mktemp -d)
LEGAL_BOT="$TEST_DIR/legal_bot.sh"

trap 'rm -rf "$TEST_DIR"' EXIT

cat > "$LEGAL_BOT" <<'BOT'
#!/bin/bash

BOARD_SIZE=5

while IFS= read -r line; do
  command=${line%% *}
  command=${command^^}

  case "$command" in
    ABOUT)
      printf '%s\n' 'name="LegalBot", version="1.0"'
      ;;
    START)
      BOARD_SIZE=${line#* }
      printf '%s\n' "OK"
      ;;
    BEGIN)
      printf '%s\n' "0,0"
      ;;
    BOARD)
      occupied=" "

      while IFS= read -r board_line; do
        if [ "$board_line" = "DONE" ]; then
          break
        fi

        IFS=',' read -r x y stone <<< "$board_line"
        occupied+="$x,$y "
      done

      selected=""

      for ((y = 0; y < BOARD_SIZE; y++)); do
        for ((x = 0; x < BOARD_SIZE; x++)); do
          if [[ "$occupied" != *" $x,$y "* ]]; then
            selected="$x,$y"
            break
          fi
        done

        if [ -n "$selected" ]; then
          break
        fi
      done

      if [ -z "$selected" ]; then
        exit 1
      fi

      printf '%s\n' "$selected"
      ;;
    TURN)
      printf '%s\n' "0,0"
      ;;
    END)
      exit 0
      ;;
  esac
done
BOT

chmod +x "$LEGAL_BOT"

pass() {
    PASS=$((PASS + 1))
    echo "  ✓ $1"
}

fail() {
    FAIL=$((FAIL + 1))
    echo "  ✗ $1"
}

run_arena() {
    timeout 10 "$ARENA" "$@" 2>&1 || true
}

expect_output() {
    local label="$1"
    local pattern="$2"
    shift 2

    local output
    output=$(run_arena "$@")

    if echo "$output" | grep -Eq "$pattern"; then
        pass "$label"
    else
        fail "$label"
    fi
}

expect_error() {
    local label="$1"
    local pattern="$2"
    shift 2

    local output
    output=$("$ARENA" "$@" 2>&1 || true)

    if echo "$output" | grep -Eqi "$pattern"; then
        pass "$label"
    else
        fail "$label"
    fi
}

section() {
    echo ""
    echo "=== $1 ==="
}

section "Parser Basics"

"$ARENA" -h >/dev/null 2>&1 &&
    pass "-h works" ||
    fail "-h works"

"$ARENA" --help >/dev/null 2>&1 &&
    pass "--help works" ||
    fail "--help works"

expect_error \
    "Missing players error" \
    "Missing"

expect_error \
    "Missing -2 error" \
    "Missing" \
    -1 "$BOT"

expect_error \
    "Missing -1 error" \
    "Missing" \
    -2 "$BOT"

section "Bundled Values"

for flag in \
    "-t10s" \
    "-T5s" \
    "-g30s" \
    "-s20" \
    "-M50" \
    "-m5" \
    "-j4" \
    "-l512m" \
    "-N1000"
do
    expect_error \
        "Rejects bundled: $flag" \
        "Unknown argument" \
        "$flag" \
        -1 "$BOT" \
        -2 "$BOT"
done

section "Durations"

for value in 100ms 5 5s 1m 1h
do
    expect_output \
        "-t $value" \
        "Starting" \
        -1 "$BOT" \
        -2 "$BOT" \
        -t "$value" \
        -M 1
done

section "Memory"

for value in 100k 512m 1g 512M 1G
do
    expect_output \
        "-l $value" \
        "Starting" \
        -1 "$BOT" \
        -2 "$BOT" \
        -l "$value" \
        -M 1
done

section "Nodes"

expect_output \
    "-N raw" \
    "N1=1000 N2=1000" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N 1000 \
    -M 1

expect_output \
    "-N 100k" \
    "N1=100000 N2=100000" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N 100k \
    -M 1

expect_output \
    "-N 1m" \
    "N1=1000000 N2=1000000" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N 1m \
    -M 1

expect_output \
    "-N 1M" \
    "N1=1000000 N2=1000000" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N 1M \
    -M 1

expect_output \
    "-N decimal" \
    "N1=1500000 N2=1500000" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N 1.5m \
    -M 1

section "Per Player"

expect_output \
    "-t1/-t2" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -t1 1s \
    -t2 5s \
    -M 1

expect_output \
    "-T1/-T2" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -T1 2s \
    -T2 10s \
    -M 1

expect_output \
    "-g1/-g2" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -g1 60s \
    -g2 120s \
    -M 1

expect_output \
    "-l1/-l2" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -l1 256m \
    -l2 512m \
    -M 1

expect_output \
    "-N1/-N2" \
    "N1=100000 N2=200000" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N1 100000 \
    -N2 200000 \
    -M 1

expect_output \
    "-Ne" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -Ne 5000000 \
    -M 1

section "Long Forms"

expect_output \
    "Long timeout forms" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    --p1-timeout-announce 1s \
    --p2-timeout-announce 2s \
    -M 1

expect_output \
    "Long node forms" \
    "N1=50000 N2=100000" \
    -1 "$BOT" \
    -2 "$BOT" \
    --p1-max-nodes 50000 \
    --p2-max-nodes 100000 \
    -M 1

expect_output \
    "Long memory forms" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    --p1-memory 256m \
    --p2-memory 512m \
    -M 1

section "Batch Expansion"

expect_output \
    "Common node list" \
    "Starting 3 batch" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N 100k,200k,300k \
    -M 1

expect_output \
    "Maximum pair list" \
    "Starting 3 batch" \
    -1 "$BOT" \
    -2 "$BOT" \
    -M 10,25,50

expect_output \
    "Minimum pair list" \
    "Starting 2 batch" \
    -1 "$BOT" \
    -2 "$BOT" \
    -m 5,10 \
    -M 50

expect_output \
    "Seed repeat list" \
    "Starting 3 batch" \
    -1 "$BOT" \
    -2 "$BOT" \
    --seed 111,222,333 \
    --repeat 3 \
    -M 1

expect_output \
    "Diagonal expansion" \
    "Starting 2 batch" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N 100k,200k \
    -M 1

expect_output \
    "Cartesian expansion" \
    "Starting 4 batch" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N1 100k,200k \
    -N2 300k,400k \
    -M 1

expect_output \
    "Asymmetric expansion" \
    "Starting 3 batch" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N1 100k,200k,300k \
    -N2 500k \
    -M 1

expect_output \
    "Repeat expansion" \
    "Starting 5 batch" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N 100k \
    -M 1 \
    --repeat 5

expect_output \
    "Full product" \
    "Starting 16 batch" \
    -1 "$BOT" \
    -2 "$BOT" \
    -N1 100k,200k \
    -N2 300k,400k \
    -M 5,10 \
    --repeat 2

section "NDJSON Export"

EXPORT="$TEST_DIR/export.ndjson"

run_arena \
    -1 "$BOT" \
    -2 "$BOT" \
    -N 100k,200k \
    -M 1 \
    --export-results "$EXPORT" \
    >/dev/null

if [ -f "$EXPORT" ]; then
    pass "Creates export file"
else
    fail "Creates export file"
fi

if [ -f "$EXPORT" ]; then
    LINES=$(wc -l < "$EXPORT")

    if [ "$LINES" = "2" ]; then
        pass "Two export lines"
    else
        fail "Two export lines"
    fi

    if python3 - "$EXPORT" <<'PY'
import json
import sys

path = sys.argv[1]
rows = [json.loads(line) for line in open(path) if line.strip()]
assert rows

for row in rows:
    assert row["status"] in {"ended", "stopped"}
    assert "is_done" not in row
    assert "timed_out" not in row

    for side in ("p1", "p2"):
        player = row[side]
        assert isinstance(player["time"], int)
        assert isinstance(player["cpu_time"], int)
        assert isinstance(player["cpu_wall_time"], int)
        assert player["eff"] is None or isinstance(player["eff"], (int, float))
        assert isinstance(player["moves_analyzed"], int)
        assert isinstance(player["critical_total"], int)
PY
    then
        pass "Current telemetry contract"
    else
        fail "Current telemetry contract"
    fi

    if python3 - "$EXPORT" <<'PY'
import json
import sys

for line in open(sys.argv[1]):
    if line.strip():
        json.loads(line)
PY
    then
        pass "Valid JSON"
    else
        fail "Valid JSON"
    fi
fi

section "Validation"

expect_error \
    "Rejects small board" \
    "board size|between" \
    -1 "$BOT" \
    -2 "$BOT" \
    -s 4 \
    -M 1

expect_error \
    "Rejects large board" \
    "board size|between" \
    -1 "$BOT" \
    -2 "$BOT" \
    -s 41 \
    -M 1

expect_output \
    "Accepts minimum board" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -s 5 \
    -M 1

expect_output \
    "Accepts maximum board" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -s 40 \
    -M 1

expect_error \
    "Rejects negative risk" \
    "risk|Unknown argument" \
    -1 "$BOT" \
    -2 "$BOT" \
    -r -0.1 \
    -M 1

expect_error \
    "Rejects excessive risk" \
    "risk" \
    -1 "$BOT" \
    -2 "$BOT" \
    -r 1.5 \
    -M 1

expect_output \
    "Accepts zero risk" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -r 0 \
    -M 1

expect_output \
    "Accepts unit risk" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -r 1 \
    -M 1

expect_error \
    "Rejects zero pairs" \
    "max-pairs|must be" \
    -1 "$BOT" \
    -2 "$BOT" \
    -M 0

expect_error \
    "Rejects unknown long flag" \
    "Unknown argument" \
    -1 "$BOT" \
    -2 "$BOT" \
    --fake-flag

expect_error \
    "Rejects unknown short flag" \
    "Unknown argument" \
    -1 "$BOT" \
    -2 "$BOT" \
    -Z

section "Boolean Flags"

for flag in \
    -b \
    -d \
    --cleanup \
    --exit-on-crash \
    --shuffle-openings
do
    expect_output \
        "$flag" \
        "Starting" \
        -1 "$BOT" \
        -2 "$BOT" \
        "$flag" \
        -M 1
done

section "API Validation"

expect_error \
    "Requires API pair" \
    "api.*together|key" \
    -1 "$BOT" \
    -2 "$BOT" \
    --api-url http://localhost \
    -M 1

section "Compatibility"

expect_output \
    "-s works" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -s 15 \
    -M 1

expect_output \
    "-j works" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -j 2 \
    -M 1

expect_output \
    "-r works" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -r 0.1 \
    -M 1

expect_output \
    "-e works" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    -e ./fake \
    -M 1

expect_output \
    "--size works" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    --size 15 \
    -M 1

expect_output \
    "--threads works" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    --threads 2 \
    -M 1

expect_output \
    "Pair long forms" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    --min-pairs 1 \
    --max-pairs 5

expect_output \
    "--timeout-announce works" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    --timeout-announce 2s \
    -M 1

expect_output \
    "--timeout-cutoff works" \
    "Starting" \
    -1 "$BOT" \
    -2 "$BOT" \
    --timeout-cutoff 5s \
    -M 1

expect_output \
    "--max-nodes works" \
    "N1=100000 N2=100000" \
    -1 "$BOT" \
    -2 "$BOT" \
    --max-nodes 100000 \
    -M 1

section "Exit Status"

NORMAL_EXPORT="$TEST_DIR/normal.ndjson"

"$ARENA" \
    -1 "$LEGAL_BOT" \
    -2 "$LEGAL_BOT" \
    -s 5 \
    -B \
    -j 1 \
    -T 1s \
    -M 1 \
    --export-results "$NORMAL_EXPORT" \
    >"$TEST_DIR/normal.log" 2>&1

NORMAL_STATUS=$?

if [ "$NORMAL_STATUS" -eq 0 ]; then
    pass "Normal completion exits zero"
else
    fail "Normal completion exits zero"
    printf '    exit status: %s\n' "$NORMAL_STATUS"
    sed 's/^/    /' "$TEST_DIR/normal.log"
fi

if python3 - "$NORMAL_EXPORT" <<'PY'
import json
import sys

rows = [json.loads(line) for line in open(sys.argv[1]) if line.strip()]
assert len(rows) == 1
assert rows[0]["status"] == "ended"
PY
then
    pass "Normal completion exports ended"
else
    fail "Normal completion exports ended"
fi

STRICT_EXPORT="$TEST_DIR/strict.ndjson"

"$ARENA" \
    -1 "$CRASH_BOT" \
    -2 "$LEGAL_BOT" \
    -s 5 \
    -B \
    -j 1 \
    -T 1s \
    -M 1 \
    --exit-on-crash \
    --export-results "$STRICT_EXPORT" \
    >"$TEST_DIR/strict.log" 2>&1

STRICT_STATUS=$?

if [ "$STRICT_STATUS" -eq 2 ]; then
    pass "Strict bot crash exits with bot failure"
else
    fail "Strict bot crash exits with bot failure"
fi

INTERRUPT_EXPORT="$TEST_DIR/interrupted.ndjson"

"$ARENA" \
    -1 "$TIMEOUT_BOT" \
    -2 "$TIMEOUT_BOT" \
    -s 5 \
    -j 1 \
    -T 60s \
    -M 1 \
    --export-results "$INTERRUPT_EXPORT" \
    >"$TEST_DIR/interrupted.log" 2>&1 &

ARENA_PID=$!
CHILDREN=""

for _ in $(seq 1 200); do
    if ! kill -0 "$ARENA_PID" 2>/dev/null; then
        break
    fi

    CHILDREN=$(
        ps -o pid= --ppid "$ARENA_PID" 2>/dev/null |
            awk '{$1=$1; if ($1) print $1}' |
            tr '\n' ' '
    )

    if [ -n "$CHILDREN" ]; then
        break
    fi

    sleep 0.01
done

if [ -n "$CHILDREN" ]; then
    pass "Interrupt test captured bot children"
else
    fail "Interrupt test captured bot children"
fi

kill -INT "$ARENA_PID" 2>/dev/null
wait "$ARENA_PID"
INTERRUPT_STATUS=$?

if [ "$INTERRUPT_STATUS" -eq 130 ]; then
    pass "SIGINT exits 130"
else
    fail "SIGINT exits 130"
fi

if python3 - "$INTERRUPT_EXPORT" <<'PY'
import json
import sys

rows = [json.loads(line) for line in open(sys.argv[1]) if line.strip()]
assert len(rows) == 1
assert rows[0]["status"] == "stopped"
PY
then
    pass "SIGINT exports stopped"
else
    fail "SIGINT exports stopped"
fi

CHILDREN_GONE=1

for child in $CHILDREN; do
    for _ in $(seq 1 100); do
        if ! kill -0 "$child" 2>/dev/null &&
           ! kill -0 -- "-$child" 2>/dev/null; then
            break
        fi

        sleep 0.01
    done

    if kill -0 "$child" 2>/dev/null ||
       kill -0 -- "-$child" 2>/dev/null; then
        CHILDREN_GONE=0
    fi
done

if [ "$CHILDREN_GONE" -eq 1 ]; then
    pass "SIGINT cleans bot process groups"
else
    fail "SIGINT cleans bot process groups"
fi

section "Summary"

TOTAL=$((PASS + FAIL))

echo ""
echo "Passed: $PASS / $TOTAL"
echo "Failed: $FAIL"

if [ "$TOTAL" -gt 0 ]; then
    COVERAGE=$((PASS * 100 / TOTAL))
else
    COVERAGE=0
fi

echo "Coverage: ${COVERAGE}%"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi

exit 0
