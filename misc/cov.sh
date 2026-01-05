#!/bin/bash

COV_DIR="${1:-coverage}"
total_lines=0
covered_lines=0

for gcov in "$COV_DIR"/*.cpp.gcov; do
  if [ -f "$gcov" ]; then
    if [[ "$gcov" == *"_test.cpp.gcov" ]] || [[ "$gcov" == *"_mock.cpp.gcov" ]] ||
      [[ "$gcov" == *"curl_mock.cpp.gcov" ]]; then
      continue
    fi

    file_exec=$(grep -cE '^[[:space:]]*[0-9]+:' "$gcov" 2>/dev/null) || file_exec=0
    file_noexec=$(grep -cE '^[[:space:]]*#####:' "$gcov" 2>/dev/null) || file_noexec=0
    file_total=$((file_exec + file_noexec))
    total_lines=$((total_lines + file_total))
    covered_lines=$((covered_lines + file_exec))
  fi
done

if [ $total_lines -gt 0 ]; then
  pct=$((covered_lines * 100 / total_lines))
  echo "Total: $covered_lines / $total_lines lines ($pct%)"
else
  echo "No coverage data found"
fi
