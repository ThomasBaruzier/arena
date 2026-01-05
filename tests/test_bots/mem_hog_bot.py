#!/usr/bin/env python3
import sys
import time

def main():
    game_running = True
    hog = []

    while game_running:
        try:
            line = sys.stdin.readline()
            if not line: break
            line = line.strip()

            if line.startswith("START"):
                print("OK")
                sys.stdout.flush()
            elif line.startswith("INFO"):
                pass
            elif line == "ABOUT":
                print('name="MemHogBot", version="1.0", author="Test"')
                sys.stdout.flush()
            elif line == "BEGIN" or line.startswith("TURN") or line == "BOARD":
                if line == "BOARD":
                    while True:
                        l = sys.stdin.readline().strip()
                        if l == "DONE": break
                try:
                    hog.append(bytearray(200 * 1024 * 1024))
                except MemoryError:
                    pass

                print("9,9")
                sys.stdout.flush()
            elif line == "END":
                break
        except Exception:
            break

if __name__ == "__main__":
    main()
