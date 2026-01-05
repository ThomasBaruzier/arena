#!/bin/bash

while read line; do
  cmd=$(echo "$line" | tr '[:lower:]' '[:upper:]' | awk '{print $1}')

  case "$cmd" in
    ABOUT)
      echo 'name="DummyBot", version="1.0", author="Test"'
      ;;
    START)
      echo "OK"
      SIZE=$(echo "$line" | awk '{print $2}')
      BOARD_SIZE=${SIZE:-20}
      ;;
    BEGIN)
      CENTER=$((BOARD_SIZE / 2))
      echo "${CENTER},${CENTER}"
      ;;
    TURN)
      X=$((RANDOM % BOARD_SIZE))
      Y=$((RANDOM % BOARD_SIZE))
      echo "${X},${Y}"
      ;;
    BOARD)
      while read boardline; do
        if [ "$boardline" = "DONE" ]; then
          break
        fi
      done
      X=$((RANDOM % BOARD_SIZE))
      Y=$((RANDOM % BOARD_SIZE))
      echo "${X},${Y}"
      ;;
    END)
      exit 0
      ;;
  esac
done
