#!/usr/bin/env python3

import argparse
import multiprocessing as mp
import os
import subprocess
import sys
import threading
import time
from pathlib import Path


def parse_opening(opening: str) -> list[tuple[int, int]]:
    moves = []
    i = 0
    while i < len(opening):
        if not opening[i].isalpha():
            i += 1
            continue
        col = ord(opening[i].lower()) - ord('a')
        i += 1
        row_str = ''
        while i < len(opening) and opening[i].isdigit():
            row_str += opening[i]
            i += 1
        if not row_str:
            break
        row = int(row_str) - 1
        moves.append((col, row))
    return moves


def get_canonical(moves: list[tuple[int, int]], board_size: int) -> tuple[tuple[int, int], ...]:
    if not moves:
        return ()

    n = board_size - 1
    candidates = [
        tuple(sorted(moves)),
        tuple(sorted((n - y, x) for x, y in moves)),
        tuple(sorted((n - x, n - y) for x, y in moves)),
        tuple(sorted((y, n - x) for x, y in moves)),
        tuple(sorted((n - x, y) for x, y in moves)),
        tuple(sorted((x, n - y) for x, y in moves)),
        tuple(sorted((y, x) for x, y in moves)),
        tuple(sorted((n - y, n - x) for x, y in moves)),
    ]

    return min(candidates)


def evaluate_opening(args: tuple[str, str, int, int]) -> tuple[str, int | None]:
    opening, rapfi_path, board_size, eval_time = args

    try:
        moves = parse_opening(opening)
        if not moves:
            return (opening, None)

        board_lines = '\n'.join(
            f'{col},{row},{1 if i % 2 == 0 else 2}'
            for i, (col, row) in enumerate(moves)
        )
        input_data = f"""START {board_size}
INFO timeout_turn {eval_time}
BOARD
{board_lines}
DONE"""

        proc = subprocess.Popen(
            [rapfi_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True
        )

        timeout_sec = eval_time // 1000 + 5
        stdout, _ = proc.communicate(input=input_data, timeout=timeout_sec)

        for line in stdout.split('\n'):
            if 'Eval ' in line:
                parts = line.split('Eval ')
                if len(parts) > 1:
                    eval_str = parts[1].split()[0]
                    if 'M' in eval_str:
                        return (opening, None)
                    try:
                        return (opening, int(eval_str.replace('+', '')))
                    except ValueError:
                        pass

        return (opening, None)

    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        return (opening, None)
    except Exception:
        return (opening, None)


def worker(task_queue: mp.Queue, result_queue: mp.Queue, rapfi_path: str,
           board_size: int, eval_time: int):
    while True:
        try:
            opening = task_queue.get(timeout=1)
            if opening is None:
                break
            result = evaluate_opening((opening, rapfi_path, board_size, eval_time))
            result_queue.put(result)
        except Exception:
            continue
    result_queue.put(None)


def feeder(proc: subprocess.Popen, task_queue: mp.Queue, num_workers: int,
           stop_event: threading.Event):
    if proc.stdout:
        for line in proc.stdout:
            if stop_event.is_set():
                break
            line = line.strip()
            if not line:
                continue
            if line.startswith(('MESSAGE', 'ERROR', 'DEBUG')):
                print(line, file=sys.stderr)
                continue
            task_queue.put(line)

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()

    for _ in range(num_workers):
        task_queue.put(None)


def load_existing(filepath: str, board_size: int) -> tuple[list[str], set[tuple]]:
    openings = []
    canonicals = set()

    if not os.path.isfile(filepath):
        return openings, canonicals

    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if line:
                moves = parse_opening(line)
                canonical = get_canonical(moves, board_size)
                if canonical not in canonicals:
                    openings.append(line)
                    canonicals.add(canonical)

    return openings, canonicals


def save_openings(filepath: str, openings: list[str]):
    with open(filepath, 'w') as f:
        f.write('\n'.join(openings) + '\n')


def cleanup(workers: list[mp.Process], feeder_thread: threading.Thread, stop_event: threading.Event):
    stop_event.set()

    for p in workers:
        p.join(timeout=2)
        if p.is_alive():
            p.terminate()
            p.join(timeout=1)

    feeder_thread.join(timeout=2)


def main():
    parser = argparse.ArgumentParser(description='Generate balanced Gomoku openings')
    parser.add_argument('--count', '-n', type=int, default=200,
                        help='Target number of openings in output file')
    parser.add_argument('--output', '-o', type=str, default='openings.txt',
                        help='Output file path')
    parser.add_argument('--rapfi', type=str, default=None,
                        help='Path to pbrain-rapfi')
    parser.add_argument('--board-size', type=int, default=20,
                        help='Board size')
    parser.add_argument('--max-eval', type=int, default=25,
                        help='Maximum absolute evaluation for balanced openings')
    parser.add_argument('--eval-time', type=int, default=15000,
                        help='Evaluation time in ms per opening')
    parser.add_argument('--threads', type=int, default=None,
                        help='Number of worker threads')
    parser.add_argument('--save-interval', type=int, default=60,
                        help='Save progress interval in seconds')
    parser.add_argument('--min-moves', type=int, default=7,
                        help='Minimum moves in opening')
    parser.add_argument('--max-moves', type=int, default=11,
                        help='Maximum moves in opening')
    parser.add_argument('--balance-nodes', type=int, default=100000000,
                        help='Nodes for balancing')
    args = parser.parse_args()

    script_dir = Path(__file__).parent.resolve()
    rapfi_path = args.rapfi or str(script_dir / '../pbrain-rapfi')

    if not os.path.isfile(rapfi_path) or not os.access(rapfi_path, os.X_OK):
        print(f'[ERROR] Rapfi not found or not executable: {rapfi_path}')
        sys.exit(1)

    balanced, canonicals = load_existing(args.output, args.board_size)
    initial_count = len(balanced)

    if initial_count >= args.count:
        print(f'[DONE] Already have {initial_count} openings, target is {args.count}')
        sys.exit(0)

    num_workers = args.threads or mp.cpu_count()
    print(f'[INFO] Using {num_workers} workers')
    print(f'[INFO] Have {initial_count} openings, need {args.count - initial_count} more')

    opengen_cmd = [
        rapfi_path, 'opengen',
        '-n', '999999999',
        '--boardsize', str(args.board_size),
        '--rule', 'freestyle',
        '--min-move', str(args.min_moves),
        '--max-move', str(args.max_moves),
        '--balance1-node', str(args.balance_nodes),
        '--balance2-node', str(args.balance_nodes),
        '--balance-window', '15',
        '--balance1-fast-check-window', '40',
        '--thread', str(num_workers),
        '--hashsize', '8192',
        '-q'
    ]

    proc = subprocess.Popen(
        opengen_cmd,
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
        bufsize=1
    )

    task_queue: mp.Queue = mp.Queue()
    result_queue: mp.Queue = mp.Queue()
    stop_event = threading.Event()

    feeder_thread = threading.Thread(
        target=feeder,
        args=(proc, task_queue, num_workers, stop_event),
        daemon=True
    )
    feeder_thread.start()

    workers = []
    for _ in range(num_workers):
        p = mp.Process(target=worker, args=(
            task_queue, result_queue, rapfi_path, args.board_size, args.eval_time
        ))
        p.start()
        workers.append(p)

    finished_workers = 0
    last_save = time.time()
    processed = 0

    try:
        while finished_workers < num_workers and len(balanced) < args.count:
            try:
                res = result_queue.get(timeout=5)
            except Exception:
                if not any(p.is_alive() for p in workers) and not feeder_thread.is_alive():
                    break
                continue

            if res is None:
                finished_workers += 1
                continue

            opening, eval_score = res
            processed += 1

            if eval_score is None or abs(eval_score) >= args.max_eval:
                continue

            moves = parse_opening(opening)
            canonical = get_canonical(moves, args.board_size)

            if canonical in canonicals:
                continue

            canonicals.add(canonical)
            balanced.append(opening)
            print(f'[OK] [{len(balanced)}/{args.count}] {opening} (eval: {eval_score})')

            if len(balanced) >= args.count:
                break

            if time.time() - last_save > args.save_interval:
                save_openings(args.output, balanced)
                print(f'[SAVE] {len(balanced)} openings saved')
                last_save = time.time()

    except KeyboardInterrupt:
        print('\n[INT] Interrupted')

    cleanup(workers, feeder_thread, stop_event)

    if balanced:
        save_openings(args.output, balanced)

    print(f'[DONE] +{len(balanced) - initial_count} openings, {len(balanced)} total in {args.output}')


if __name__ == '__main__':
    main()
