#!/bin/bash

while read line; do
  cmd=$(echo "$line" | tr '[:lower:]' '[:upper:]' | awk '{print $1}')

  case "$cmd" in
    ABOUT)
      echo 'name="CrashBot", version="1.0"'
      ;;
    START)
      echo "OK"
      ;;
    BEGIN|TURN|BOARD)
      exit 1
      ;;
    END)
      exit 0
      ;;
  esac
done
