#!/bin/bash

MOVE_NUM=0
BOARD_SIZE=20

while read line; do
  cmd=$(echo "$line" | tr '[:lower:]' '[:upper:]' | awk '{print $1}')

  case "$cmd" in
    ABOUT)
      echo 'name="DeterministicBot", version="1.0", author="Test"'
      ;;
    START)
      SIZE=$(echo "$line" | awk '{print $2}')
      BOARD_SIZE=${SIZE:-20}
      MOVE_NUM=0
      echo "OK"
      ;;
    BEGIN)
      CENTER=$((BOARD_SIZE / 2))
      echo "${CENTER},${CENTER}"
      MOVE_NUM=$((MOVE_NUM + 1))
      ;;
    TURN)
      CENTER=$((BOARD_SIZE / 2))
      X=$((CENTER - MOVE_NUM))
      Y=$((CENTER - MOVE_NUM))
      if [ $X -lt 0 ]; then X=0; fi
      if [ $Y -lt 0 ]; then Y=0; fi
      echo "${X},${Y}"
      MOVE_NUM=$((MOVE_NUM + 1))
      ;;
    BOARD)
      while read boardline; do
        if [ "$boardline" = "DONE" ]; then
          break
        fi
      done
      CENTER=$((BOARD_SIZE / 2))
      X=$((CENTER - MOVE_NUM))
      Y=$((CENTER - MOVE_NUM))
      if [ $X -lt 0 ]; then X=0; fi
      if [ $Y -lt 0 ]; then Y=0; fi
      echo "${X},${Y}"
      MOVE_NUM=$((MOVE_NUM + 1))
      ;;
    END)
      exit 0
      ;;
  esac
done
