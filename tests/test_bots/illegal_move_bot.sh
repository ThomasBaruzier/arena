#!/bin/bash

BOARD_SIZE=20

while read line; do
  cmd=$(echo "$line" | tr '[:lower:]' '[:upper:]' | awk '{print $1}')

  case "$cmd" in
    ABOUT)
      echo 'name="IllegalMoveBot", version="1.0"'
      ;;
    START)
      SIZE=$(echo "$line" | awk '{print $2}')
      BOARD_SIZE=${SIZE:-20}
      echo "OK"
      ;;
    BEGIN|TURN)
      echo "$BOARD_SIZE,$BOARD_SIZE"
      ;;
    BOARD)
      while read boardline; do
        if [ "$boardline" = "DONE" ]; then
          break
        fi
      done
      echo "$BOARD_SIZE,$BOARD_SIZE"
      ;;
    END)
      exit 0
      ;;
  esac
done
