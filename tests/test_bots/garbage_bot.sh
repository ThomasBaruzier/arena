#!/bin/bash

while read line; do
  if [[ "$line" == "BEGIN" || "$line" == "TURN"* || "$line" == "BOARD" ]]; then
    if [[ "$line" == "BOARD" ]]; then
      while read board_line; do
        [[ "$board_line" == "DONE" ]] && break
      done
    fi
    echo "GARBAGE_DATA_XYZ_123"
  elif [[ "$line" == "START"* ]]; then
    echo "OK"
  elif [[ "$line" == "INFO"* ]]; then
    continue
  elif [[ "$line" == "ABOUT" ]]; then
    echo "name=\"GarbageBot\", version=\"1.0\", author=\"Test\""
  elif [[ "$line" == "END" ]]; then
    exit 0
  fi
done
