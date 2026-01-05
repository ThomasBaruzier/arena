#!/bin/bash

ARENA="./arena"
BOT="tests/test_bots/dummy_bot.sh"
PASS=0
FAIL=0
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

pass() { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

run_arena() {
    timeout 10 $ARENA "$@" 2>&1 || true
}

section() {
    echo ""
    echo "=== $1 ==="
}

# ============================================================
section "Parser: Basic Flags"
# ============================================================

$ARENA -h >/dev/null 2>&1 && pass "-h works" || fail "-h works"
$ARENA --help >/dev/null 2>&1 && pass "--help works" || fail "--help works"

OUT=$($ARENA 2>&1 || true)
echo "$OUT" | grep -q "Missing" && pass "Missing players error" || fail "Missing players error"

OUT=$($ARENA -1 $BOT 2>&1 || true)
echo "$OUT" | grep -q "Missing" && pass "Missing -2 error" || fail "Missing -2 error"

OUT=$($ARENA -2 $BOT 2>&1 || true)
echo "$OUT" | grep -q "Missing" && pass "Missing -1 error" || fail "Missing -1 error"

# ============================================================
section "Parser: Bundled Values Rejection"
# ============================================================

for FLAG in "-t10s" "-T5s" "-g30s" "-s20" "-M50" "-m5" "-j4" "-l512m" "-N1000"; do
    OUT=$($ARENA $FLAG -1 $BOT -2 $BOT 2>&1 || true)
    if echo "$OUT" | grep -q "Unknown argument"; then
        pass "Rejects bundled: $FLAG"
    else
        fail "Rejects bundled: $FLAG"
    fi
done

# ============================================================
section "Parser: Duration Parsing"
# ============================================================

OUT=$(run_arena -1 $BOT -2 $BOT -t 100ms -M 1)
echo "$OUT" | grep -q "Starting" && pass "-t 100ms" || fail "-t 100ms"

OUT=$(run_arena -1 $BOT -2 $BOT -t 5 -M 1)
echo "$OUT" | grep -q "Starting" && pass "-t 5 (seconds)" || fail "-t 5 (seconds)"

OUT=$(run_arena -1 $BOT -2 $BOT -t 5s -M 1)
echo "$OUT" | grep -q "Starting" && pass "-t 5s" || fail "-t 5s"

OUT=$(run_arena -1 $BOT -2 $BOT -t 1m -M 1)
echo "$OUT" | grep -q "Starting" && pass "-t 1m" || fail "-t 1m"

OUT=$(run_arena -1 $BOT -2 $BOT -t 1h -M 1)
echo "$OUT" | grep -q "Starting" && pass "-t 1h" || fail "-t 1h"

# ============================================================
section "Parser: Memory Parsing"
# ============================================================

OUT=$(run_arena -1 $BOT -2 $BOT -l 100k -M 1)
echo "$OUT" | grep -q "Starting" && pass "-l 100k" || fail "-l 100k"

OUT=$(run_arena -1 $BOT -2 $BOT -l 512m -M 1)
echo "$OUT" | grep -q "Starting" && pass "-l 512m" || fail "-l 512m"

OUT=$(run_arena -1 $BOT -2 $BOT -l 1g -M 1)
echo "$OUT" | grep -q "Starting" && pass "-l 1g" || fail "-l 1g"

OUT=$(run_arena -1 $BOT -2 $BOT -l 512M -M 1)
echo "$OUT" | grep -q "Starting" && pass "-l 512M (capital)" || fail "-l 512M (capital)"

OUT=$(run_arena -1 $BOT -2 $BOT -l 1G -M 1)
echo "$OUT" | grep -q "Starting" && pass "-l 1G (capital)" || fail "-l 1G (capital)"

# ============================================================
section "Parser: Node Count Parsing"
# ============================================================

OUT=$(run_arena -1 $BOT -2 $BOT -N 1000 -M 1)
echo "$OUT" | grep -q "N1=1000 N2=1000" && pass "-N 1000 (raw)" || fail "-N 1000 (raw)"

OUT=$(run_arena -1 $BOT -2 $BOT -N 100k -M 1)
echo "$OUT" | grep -q "N1=100000 N2=100000" && pass "-N 100k" || fail "-N 100k"

OUT=$(run_arena -1 $BOT -2 $BOT -N 1m -M 1)
echo "$OUT" | grep -q "N1=1000000 N2=1000000" && pass "-N 1m" || fail "-N 1m"

OUT=$(run_arena -1 $BOT -2 $BOT -N 1M -M 1)
echo "$OUT" | grep -q "N1=1000000 N2=1000000" && pass "-N 1M (capital)" || fail "-N 1M (capital)"

OUT=$(run_arena -1 $BOT -2 $BOT -N 1.5m -M 1)
echo "$OUT" | grep -q "N1=1500000 N2=1500000" && pass "-N 1.5m (decimal)" || fail "-N 1.5m (decimal)"

# ============================================================
section "Parser: Per-Player Flags"
# ============================================================

OUT=$(run_arena -1 $BOT -2 $BOT -t1 1s -t2 5s -M 1)
echo "$OUT" | grep -q "Starting" && pass "-t1/-t2" || fail "-t1/-t2"

OUT=$(run_arena -1 $BOT -2 $BOT -T1 2s -T2 10s -M 1)
echo "$OUT" | grep -q "Starting" && pass "-T1/-T2" || fail "-T1/-T2"

OUT=$(run_arena -1 $BOT -2 $BOT -g1 60s -g2 120s -M 1)
echo "$OUT" | grep -q "Starting" && pass "-g1/-g2" || fail "-g1/-g2"

OUT=$(run_arena -1 $BOT -2 $BOT -l1 256m -l2 512m -M 1)
echo "$OUT" | grep -q "Starting" && pass "-l1/-l2" || fail "-l1/-l2"

OUT=$(run_arena -1 $BOT -2 $BOT -N1 100000 -N2 200000 -M 1)
echo "$OUT" | grep -q "N1=100000 N2=200000" && pass "-N1/-N2" || fail "-N1/-N2"

OUT=$(run_arena -1 $BOT -2 $BOT -Ne 5000000 -M 1)
echo "$OUT" | grep -q "Starting" && pass "-Ne (eval nodes)" || fail "-Ne (eval nodes)"

# ============================================================
section "Parser: Long Form Flags"
# ============================================================

OUT=$(run_arena -1 $BOT -2 $BOT --p1-timeout-announce 1s --p2-timeout-announce 2s -M 1)
echo "$OUT" | grep -q "Starting" && pass "--p1/p2-timeout-announce" || fail "--p1/p2-timeout-announce"

OUT=$(run_arena -1 $BOT -2 $BOT --p1-max-nodes 50000 --p2-max-nodes 100000 -M 1)
echo "$OUT" | grep -q "N1=50000 N2=100000" && pass "--p1/p2-max-nodes" || fail "--p1/p2-max-nodes"

OUT=$(run_arena -1 $BOT -2 $BOT --p1-memory 256m --p2-memory 512m -M 1)
echo "$OUT" | grep -q "Starting" && pass "--p1/p2-memory" || fail "--p1/p2-memory"

# ============================================================
section "Parser: List Values (CSV)"
# ============================================================

OUT=$(run_arena -1 $BOT -2 $BOT -N 100k,200k,300k -M 1)
echo "$OUT" | grep -q "Starting 3 batch" && pass "-N with 3 values" || fail "-N with 3 values"

OUT=$(run_arena -1 $BOT -2 $BOT -M 10,25,50)
echo "$OUT" | grep -q "Starting 3 batch" && pass "-M with 3 values" || fail "-M with 3 values"

OUT=$(run_arena -1 $BOT -2 $BOT -m 5,10 -M 50)
echo "$OUT" | grep -q "Starting 2 batch" && pass "-m with 2 values" || fail "-m with 2 values"

OUT=$(run_arena -1 $BOT -2 $BOT --seed 111,222,333 -M 1 --repeat 3)
echo "$OUT" | grep -q "Starting 3 batch" && pass "--seed with 3 values" || fail "--seed with 3 values"

# ============================================================
section "Batch Expansion: Diagonal vs Cross Product"
# ============================================================

OUT=$(run_arena -1 $BOT -2 $BOT -N 100k,200k -M 1)
CONFIGS=$(echo "$OUT" | grep "Starting" | grep -oP '\d+(?= batch)')
[ "$CONFIGS" = "2" ] && pass "-N diagonal: 2 configs" || fail "-N diagonal: 2 configs (got $CONFIGS)"

OUT=$(run_arena -1 $BOT -2 $BOT -N1 100k,200k -N2 300k,400k -M 1)
CONFIGS=$(echo "$OUT" | grep "Starting" | grep -oP '\d+(?= batch)')
[ "$CONFIGS" = "4" ] && pass "-N1/-N2 cross: 4 configs" || fail "-N1/-N2 cross: 4 configs (got $CONFIGS)"

OUT=$(run_arena -1 $BOT -2 $BOT -N1 100k,200k,300k -N2 500k -M 1)
CONFIGS=$(echo "$OUT" | grep "Starting" | grep -oP '\d+(?= batch)')
[ "$CONFIGS" = "3" ] && pass "Asymmetric: 3×1=3 configs" || fail "Asymmetric: 3×1=3 configs (got $CONFIGS)"

OUT=$(run_arena -1 $BOT -2 $BOT -N 100k -M 1 --repeat 5)
CONFIGS=$(echo "$OUT" | grep "Starting" | grep -oP '\d+(?= batch)')
[ "$CONFIGS" = "5" ] && pass "--repeat 5: 5 configs" || fail "--repeat 5: 5 configs (got $CONFIGS)"

OUT=$(run_arena -1 $BOT -2 $BOT -N1 100k,200k -N2 300k,400k -M 5,10 --repeat 2)
CONFIGS=$(echo "$OUT" | grep "Starting" | grep -oP '\d+(?= batch)')
[ "$CONFIGS" = "16" ] && pass "Full: 2×2×2×2=16 configs" || fail "Full: 2×2×2×2=16 configs (got $CONFIGS)"

# ============================================================
section "NDJSON Export"
# ============================================================

EXPORT="$TEST_DIR/export.ndjson"
run_arena -1 $BOT -2 $BOT -N 100k,200k -M 1 --export-results "$EXPORT" >/dev/null

[ -f "$EXPORT" ] && pass "Creates export file" || fail "Creates export file"

if [ -f "$EXPORT" ]; then
    LINES=$(wc -l < "$EXPORT")
    [ "$LINES" = "2" ] && pass "2 NDJSON lines for 2 configs" || fail "2 NDJSON lines (got $LINES)"

    head -1 "$EXPORT" | grep -q '"p1_cmd"' && pass "Has p1_cmd field" || fail "Has p1_cmd field"
    head -1 "$EXPORT" | grep -q '"p1_nodes"' && pass "Has p1_nodes field" || fail "Has p1_nodes field"
    head -1 "$EXPORT" | grep -q '"p2_nodes"' && pass "Has p2_nodes field" || fail "Has p2_nodes field"
    head -1 "$EXPORT" | grep -q '"board_size"' && pass "Has board_size field" || fail "Has board_size field"
    head -1 "$EXPORT" | grep -q '"duration"' && pass "Has duration field" || fail "Has duration field"
    head -1 "$EXPORT" | grep -q '"wins"' && pass "Has wins field" || fail "Has wins field"
    head -1 "$EXPORT" | grep -q '"elo"' && pass "Has elo field" || fail "Has elo field"
    head -1 "$EXPORT" | grep -q '"sw_dqi"' && pass "Has sw_dqi field" || fail "Has sw_dqi field"
    head -1 "$EXPORT" | grep -q '"seed"' && pass "Has seed field" || fail "Has seed field"

    python3 -c "import json; [json.loads(l) for l in open('$EXPORT') if l.strip()]" 2>/dev/null && \
        pass "Valid JSON" || fail "Valid JSON"
fi

# ============================================================
section "Edge Cases & Validation"
# ============================================================

OUT=$($ARENA -1 $BOT -2 $BOT -s 4 -M 1 2>&1 || true)
echo "$OUT" | grep -qi "board size\|between" && pass "Rejects -s 4 (too small)" || fail "Rejects -s 4 (too small)"

OUT=$($ARENA -1 $BOT -2 $BOT -s 41 -M 1 2>&1 || true)
echo "$OUT" | grep -qi "board size\|between" && pass "Rejects -s 41 (too big)" || fail "Rejects -s 41 (too big)"

OUT=$(run_arena -1 $BOT -2 $BOT -s 5 -M 1)
echo "$OUT" | grep -q "Starting" && pass "Accepts -s 5 (min)" || fail "Accepts -s 5 (min)"

OUT=$(run_arena -1 $BOT -2 $BOT -s 40 -M 1)
echo "$OUT" | grep -q "Starting" && pass "Accepts -s 40 (max)" || fail "Accepts -s 40 (max)"

OUT=$($ARENA -1 $BOT -2 $BOT -r -0.1 -M 1 2>&1 || true)
echo "$OUT" | grep -qi "risk\|Unknown argument" && pass "Rejects -r -0.1 (negative)" || fail "Rejects -r -0.1 (negative)"

OUT=$($ARENA -1 $BOT -2 $BOT -r 1.5 -M 1 2>&1 || true)
echo "$OUT" | grep -qi "risk" && pass "Rejects -r 1.5 (>1)" || fail "Rejects -r 1.5 (>1)"

OUT=$(run_arena -1 $BOT -2 $BOT -r 0 -M 1)
echo "$OUT" | grep -q "Starting" && pass "Accepts -r 0" || fail "Accepts -r 0"

OUT=$(run_arena -1 $BOT -2 $BOT -r 1 -M 1)
echo "$OUT" | grep -q "Starting" && pass "Accepts -r 1" || fail "Accepts -r 1"

OUT=$($ARENA -1 $BOT -2 $BOT -M 0 2>&1 || true)
echo "$OUT" | grep -qi "max-pairs\|must be" && pass "Rejects -M 0" || fail "Rejects -M 0"

OUT=$($ARENA -1 $BOT -2 $BOT --fake-flag 2>&1 || true)
echo "$OUT" | grep -q "Unknown argument" && pass "Rejects --fake-flag" || fail "Rejects --fake-flag"

OUT=$($ARENA -1 $BOT -2 $BOT -Z 2>&1 || true)
echo "$OUT" | grep -q "Unknown argument" && pass "Rejects -Z" || fail "Rejects -Z"

# ============================================================
section "Boolean Flags"
# ============================================================

OUT=$(run_arena -1 $BOT -2 $BOT -b -M 1)
echo "$OUT" | grep -q "Starting" && pass "-b (show board)" || fail "-b (show board)"

OUT=$(run_arena -1 $BOT -2 $BOT -d -M 1)
echo "$OUT" | grep -q "Starting" && pass "-d (debug)" || fail "-d (debug)"

OUT=$(run_arena -1 $BOT -2 $BOT --cleanup -M 1)
echo "$OUT" | grep -q "Starting" && pass "--cleanup" || fail "--cleanup"

OUT=$(run_arena -1 $BOT -2 $BOT --exit-on-crash -M 1)
echo "$OUT" | grep -q "Starting" && pass "--exit-on-crash" || fail "--exit-on-crash"

OUT=$(run_arena -1 $BOT -2 $BOT --shuffle-openings -M 1)
echo "$OUT" | grep -q "Starting" && pass "--shuffle-openings" || fail "--shuffle-openings"

# ============================================================
section "API Flags (Validation Only)"
# ============================================================

OUT=$($ARENA -1 $BOT -2 $BOT --api-url http://localhost -M 1 2>&1 || true)
echo "$OUT" | grep -qi "api.*together\|key" && pass "Requires both --api-url and --api-key" || fail "Requires both --api-url and --api-key"

# ============================================================
section "Regression: Original Flag Compatibility"
# ============================================================

OUT=$(run_arena -1 $BOT -2 $BOT -s 15 -M 1)
echo "$OUT" | grep -q "Starting" && pass "-s works" || fail "-s works"

OUT=$(run_arena -1 $BOT -2 $BOT -j 2 -M 1)
echo "$OUT" | grep -q "Starting" && pass "-j works" || fail "-j works"

OUT=$(run_arena -1 $BOT -2 $BOT -r 0.1 -M 1)
echo "$OUT" | grep -q "Starting" && pass "-r works" || fail "-r works"

OUT=$(run_arena -1 $BOT -2 $BOT -e ./fake -M 1)
echo "$OUT" | grep -q "Starting" && pass "-e works" || fail "-e works"

OUT=$(run_arena -1 $BOT -2 $BOT --size 15 -M 1)
echo "$OUT" | grep -q "Starting" && pass "--size works" || fail "--size works"

OUT=$(run_arena -1 $BOT -2 $BOT --threads 2 -M 1)
echo "$OUT" | grep -q "Starting" && pass "--threads works" || fail "--threads works"

OUT=$(run_arena -1 $BOT -2 $BOT --min-pairs 1 --max-pairs 5)
echo "$OUT" | grep -q "Starting" && pass "--min-pairs/--max-pairs works" || fail "--min-pairs/--max-pairs works"

OUT=$(run_arena -1 $BOT -2 $BOT --timeout-announce 2s -M 1)
echo "$OUT" | grep -q "Starting" && pass "--timeout-announce works" || fail "--timeout-announce works"

OUT=$(run_arena -1 $BOT -2 $BOT --timeout-cutoff 5s -M 1)
echo "$OUT" | grep -q "Starting" && pass "--timeout-cutoff works" || fail "--timeout-cutoff works"

OUT=$(run_arena -1 $BOT -2 $BOT --max-nodes 100000 -M 1)
echo "$OUT" | grep -q "N1=100000 N2=100000" && pass "--max-nodes works" || fail "--max-nodes works"

# ============================================================
section "Summary"
# ============================================================

echo ""
TOTAL=$((PASS+FAIL))
echo "Passed: $PASS / $TOTAL"
echo "Failed: $FAIL"
COVERAGE=$((PASS * 100 / TOTAL))
echo "Coverage: ${COVERAGE}%"

if [ "$FAIL" -gt 0 ]; then exit 1; else exit 0; fi
