#!/usr/bin/env python3

import argparse
import multiprocessing as mp
import os
import queue
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path


_active_evaluator: subprocess.Popen | None = None


def parse_opening(
    opening: str
) -> list[tuple[int, int]]:
    moves = []
    index = 0

    while index < len(opening):
        if not opening[index].isalpha():
            index += 1
            continue

        column = (
            ord(opening[index].lower()) -
            ord('a')
        )
        index += 1
        row_text = ''

        while (
            index < len(opening) and
            opening[index].isdigit()
        ):
            row_text += opening[index]
            index += 1

        if not row_text:
            break

        moves.append(
            (
                column,
                int(row_text) - 1
            )
        )

    return moves


def get_canonical(
    moves: list[tuple[int, int]],
    board_size: int
) -> tuple[tuple[int, int], ...]:
    if not moves:
        return ()

    limit = board_size - 1

    candidates = [
        tuple(sorted(moves)),
        tuple(
            sorted(
                (limit - y, x)
                for x, y in moves
            )
        ),
        tuple(
            sorted(
                (
                    limit - x,
                    limit - y
                )
                for x, y in moves
            )
        ),
        tuple(
            sorted(
                (y, limit - x)
                for x, y in moves
            )
        ),
        tuple(
            sorted(
                (limit - x, y)
                for x, y in moves
            )
        ),
        tuple(
            sorted(
                (x, limit - y)
                for x, y in moves
            )
        ),
        tuple(
            sorted(
                (y, x)
                for x, y in moves
            )
        ),
        tuple(
            sorted(
                (
                    limit - y,
                    limit - x
                )
                for x, y in moves
            )
        )
    ]

    return min(candidates)


def stop_process(
    process: subprocess.Popen | None,
    timeout: float = 5.0
) -> None:
    if (
        process is None or
        process.poll() is not None
    ):
        return

    try:
        os.killpg(
            process.pid,
            signal.SIGTERM
        )
    except ProcessLookupError:
        pass

    try:
        process.wait(timeout=timeout)
        return
    except (
        subprocess.TimeoutExpired,
        ChildProcessError
    ):
        pass

    try:
        os.killpg(
            process.pid,
            signal.SIGKILL
        )
    except ProcessLookupError:
        pass

    try:
        process.wait(timeout=timeout)
    except (
        subprocess.TimeoutExpired,
        ChildProcessError
    ):
        pass


def stop_worker(
    _signal_number: int,
    _frame
) -> None:
    stop_process(
        _active_evaluator,
        1.0
    )
    raise SystemExit(0)


def evaluate_opening(
    args: tuple[
        str,
        str,
        int,
        int
    ]
) -> tuple[str, int | None]:
    global _active_evaluator

    (
        opening,
        rapfi_path,
        board_size,
        eval_time
    ) = args

    process = None

    try:
        moves = parse_opening(opening)

        if not moves:
            return opening, None

        board_lines = '\n'.join(
            (
                f'{column},{row},'
                f'{1 if index % 2 == 0 else 2}'
            )
            for index, (
                column,
                row
            ) in enumerate(moves)
        )

        input_data = (
            f'START {board_size}\n'
            f'INFO timeout_turn {eval_time}\n'
            'BOARD\n'
            f'{board_lines}\n'
            'DONE'
        )

        process = subprocess.Popen(
            [rapfi_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            start_new_session=True
        )

        _active_evaluator = process

        stdout, _ = process.communicate(
            input=input_data,
            timeout=
                eval_time / 1000 + 5
        )

        for line in stdout.splitlines():
            if 'Eval ' not in line:
                continue

            parts = line.split(
                'Eval ',
                1
            )

            if len(parts) != 2:
                continue

            value = parts[1].split()[0]

            if 'M' in value:
                return opening, None

            try:
                return (
                    opening,
                    int(
                        value.replace(
                            '+',
                            ''
                        )
                    )
                )
            except ValueError:
                continue

        return opening, None
    except subprocess.TimeoutExpired:
        stop_process(process, 1.0)
        return opening, None
    except Exception:
        stop_process(process, 1.0)
        return opening, None
    finally:
        if (
            process is not None and
            process.poll() is None
        ):
            stop_process(process, 1.0)

        _active_evaluator = None


def put_task(
    task_queue: mp.Queue,
    value,
    stop_event: threading.Event
) -> bool:
    while not stop_event.is_set():
        try:
            task_queue.put(
                value,
                timeout=0.2
            )
            return True
        except queue.Full:
            continue
        except (
            EOFError,
            OSError
        ):
            return False

    return False


def send_sentinels(
    task_queue: mp.Queue,
    count: int
) -> None:
    for _ in range(count):
        for _attempt in range(20):
            try:
                task_queue.put(
                    None,
                    timeout=0.1
                )
                break
            except queue.Full:
                continue
            except (
                EOFError,
                OSError
            ):
                return


def worker(
    task_queue: mp.Queue,
    result_queue: mp.Queue,
    rapfi_path: str,
    board_size: int,
    eval_time: int
) -> None:
    signal.signal(
        signal.SIGTERM,
        stop_worker
    )

    try:
        while True:
            try:
                opening = task_queue.get(
                    timeout=1
                )
            except queue.Empty:
                continue
            except (
                EOFError,
                OSError
            ):
                break

            if opening is None:
                break

            result = evaluate_opening(
                (
                    opening,
                    rapfi_path,
                    board_size,
                    eval_time
                )
            )

            try:
                result_queue.put(result)
            except (
                EOFError,
                OSError
            ):
                break
    finally:
        stop_process(
            _active_evaluator,
            1.0
        )

        try:
            result_queue.put(None)
        except (
            EOFError,
            OSError
        ):
            pass


def feeder(
    process: subprocess.Popen,
    task_queue: mp.Queue,
    num_workers: int,
    stop_event: threading.Event
) -> None:
    try:
        if process.stdout:
            for raw_line in process.stdout:
                if stop_event.is_set():
                    break

                line = raw_line.strip()

                if not line:
                    continue

                if line.startswith(
                    (
                        'MESSAGE',
                        'ERROR',
                        'DEBUG'
                    )
                ):
                    print(
                        line,
                        file=sys.stderr
                    )
                    continue

                if not put_task(
                    task_queue,
                    line,
                    stop_event
                ):
                    break
    finally:
        stop_process(process)
        send_sentinels(
            task_queue,
            num_workers
        )


def load_existing(
    filepath: str,
    board_size: int
) -> tuple[
    list[str],
    set[
        tuple[
            tuple[int, int],
            ...
        ]
    ]
]:
    openings = []
    canonicals = set()

    if not os.path.isfile(filepath):
        return openings, canonicals

    with open(
        filepath,
        'r',
        encoding='utf-8'
    ) as source:
        for raw_line in source:
            line = raw_line.strip()

            if not line:
                continue

            canonical = get_canonical(
                parse_opening(line),
                board_size
            )

            if canonical in canonicals:
                continue

            openings.append(line)
            canonicals.add(canonical)

    return openings, canonicals


def save_openings(
    filepath: str,
    openings: list[str]
) -> None:
    with open(
        filepath,
        'w',
        encoding='utf-8'
    ) as output:
        output.write(
            '\n'.join(openings) +
            '\n'
        )


def cleanup(
    workers: list[mp.Process],
    feeder_thread: threading.Thread,
    generator: subprocess.Popen,
    task_queue: mp.Queue,
    stop_event: threading.Event
) -> None:
    stop_event.set()
    stop_process(generator)
    feeder_thread.join(timeout=5)

    send_sentinels(
        task_queue,
        len(workers)
    )

    for process in workers:
        process.join(timeout=2)

    for process in workers:
        if not process.is_alive():
            continue

        process.terminate()
        process.join(timeout=2)

        if process.is_alive():
            process.kill()
            process.join(timeout=2)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=
            'Generate balanced Gomoku openings'
    )

    parser.add_argument(
        '--count',
        '-n',
        type=int,
        default=200,
        help=
            'Target number of openings in output file'
    )

    parser.add_argument(
        '--output',
        '-o',
        type=str,
        default='openings.txt',
        help='Output file path'
    )

    parser.add_argument(
        '--rapfi',
        type=str,
        default=None,
        help='Path to pbrain-rapfi'
    )

    parser.add_argument(
        '--board-size',
        type=int,
        default=20,
        help='Board size'
    )

    parser.add_argument(
        '--max-eval',
        type=int,
        default=25,
        help=
            'Maximum absolute evaluation for balanced openings'
    )

    parser.add_argument(
        '--eval-time',
        type=int,
        default=15000,
        help=
            'Evaluation time in ms per opening'
    )

    parser.add_argument(
        '--threads',
        type=int,
        default=None,
        help='Number of worker processes'
    )

    parser.add_argument(
        '--save-interval',
        type=int,
        default=60,
        help=
            'Save progress interval in seconds'
    )

    parser.add_argument(
        '--min-moves',
        type=int,
        default=7,
        help=
            'Minimum moves in opening'
    )

    parser.add_argument(
        '--max-moves',
        type=int,
        default=11,
        help=
            'Maximum moves in opening'
    )

    parser.add_argument(
        '--balance-nodes',
        type=int,
        default=100000000,
        help='Nodes for balancing'
    )

    args = parser.parse_args()

    if args.count < 1:
        parser.error(
            '--count must be positive'
        )

    if args.board_size < 5:
        parser.error(
            '--board-size must be at least 5'
        )

    if args.eval_time < 1:
        parser.error(
            '--eval-time must be positive'
        )

    if (
        args.threads is not None and
        args.threads < 1
    ):
        parser.error(
            '--threads must be positive'
        )

    script_dir = (
        Path(__file__)
        .parent
        .resolve()
    )

    rapfi_path = (
        args.rapfi or
        str(
            script_dir /
            '../pbrain-rapfi'
        )
    )

    if (
        not os.path.isfile(
            rapfi_path
        ) or
        not os.access(
            rapfi_path,
            os.X_OK
        )
    ):
        print(
            '[ERROR] Rapfi not found '
            f'or not executable: {rapfi_path}'
        )
        return 1

    balanced, canonicals = load_existing(
        args.output,
        args.board_size
    )

    initial_count = len(balanced)

    if initial_count >= args.count:
        print(
            '[DONE] Already have '
            f'{initial_count} openings, '
            f'target is {args.count}'
        )
        return 0

    num_workers = (
        args.threads or
        mp.cpu_count()
    )

    print(
        f'[INFO] Using {num_workers} workers'
    )

    print(
        f'[INFO] Have {initial_count} '
        'openings, need '
        f'{args.count - initial_count} more'
    )

    opengen_command = [
        rapfi_path,
        'opengen',
        '-n',
        '999999999',
        '--boardsize',
        str(args.board_size),
        '--rule',
        'freestyle',
        '--min-move',
        str(args.min_moves),
        '--max-move',
        str(args.max_moves),
        '--balance1-node',
        str(args.balance_nodes),
        '--balance2-node',
        str(args.balance_nodes),
        '--balance-window',
        '15',
        '--balance1-fast-check-window',
        '40',
        '--thread',
        str(num_workers),
        '--hashsize',
        '8192',
        '-q'
    ]

    generator = subprocess.Popen(
        opengen_command,
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
        bufsize=1,
        start_new_session=True
    )

    task_queue: mp.Queue = mp.Queue()
    result_queue: mp.Queue = mp.Queue()
    stop_event = threading.Event()

    feeder_thread = threading.Thread(
        target=feeder,
        args=(
            generator,
            task_queue,
            num_workers,
            stop_event
        ),
        daemon=True
    )

    feeder_thread.start()

    workers = []

    for _ in range(num_workers):
        process = mp.Process(
            target=worker,
            args=(
                task_queue,
                result_queue,
                rapfi_path,
                args.board_size,
                args.eval_time
            )
        )

        process.start()
        workers.append(process)

    finished_workers = 0
    last_save = time.monotonic()
    interrupted = False

    try:
        while (
            finished_workers <
                num_workers and
            len(balanced) <
                args.count
        ):
            try:
                result = result_queue.get(
                    timeout=1
                )
            except queue.Empty:
                if (
                    not any(
                        process.is_alive()
                        for process in workers
                    ) and
                    not feeder_thread.is_alive()
                ):
                    break

                continue
            except (
                EOFError,
                OSError
            ):
                break

            if result is None:
                finished_workers += 1
                continue

            opening, evaluation = result

            if (
                evaluation is None or
                abs(evaluation) >=
                    args.max_eval
            ):
                continue

            canonical = get_canonical(
                parse_opening(opening),
                args.board_size
            )

            if canonical in canonicals:
                continue

            canonicals.add(canonical)
            balanced.append(opening)

            print(
                f'[OK] [{len(balanced)}/'
                f'{args.count}] {opening} '
                f'(eval: {evaluation})'
            )

            now = time.monotonic()

            if (
                now - last_save >
                args.save_interval
            ):
                save_openings(
                    args.output,
                    balanced
                )

                print(
                    f'[SAVE] {len(balanced)} '
                    'openings saved'
                )

                last_save = now
    except KeyboardInterrupt:
        interrupted = True
        print('\n[INT] Interrupted')
    finally:
        cleanup(
            workers,
            feeder_thread,
            generator,
            task_queue,
            stop_event
        )

        if balanced:
            save_openings(
                args.output,
                balanced
            )

    print(
        '[DONE] +'
        f'{len(balanced) - initial_count} '
        'openings, '
        f'{len(balanced)} total in '
        f'{args.output}'
    )

    return 130 if interrupted else 0


if __name__ == '__main__':
    raise SystemExit(main())
