#!/usr/bin/env python3
"""Generate original, public-domain ambient test fixtures using only the stdlib."""
from io import BytesIO
from math import pi, sin
from pathlib import Path
import struct
import sys
import wave

PADS = [
    ("c3", 48), ("d3", 50), ("e3", 52), ("g3", 55), ("a3", 57),
    ("c4", 60), ("d4", 62), ("e4", 64), ("g4", 67), ("a4", 69),
    ("c5", 72), ("d5", 74), ("e5", 76), ("g5", 79), ("a5", 81), ("c6", 84),
]
RATE = 24000
OUTPUT = Path(__file__).resolve().parents[1] / "public/audio/ambient-test"


def sample(midi):
    frequency = 440 * 2 ** ((midi - 69) / 12)
    pcm = bytearray()
    for frame in range(2 * RATE):
        time = frame / RATE
        envelope = min(1, time / 0.08, (2 - time) / 0.6)
        value = round(32767 * envelope * sin(2 * pi * frequency * time))
        pcm.extend(struct.pack("<h", value))
    output = BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm)
    return output.getvalue()


def main():
    if sys.argv[1:] not in ([], ["--check"]):
        raise SystemExit("Usage: python3 scripts/generate-ambient-samples.py [--check]")
    check = "--check" in sys.argv
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, midi in PADS:
        path = OUTPUT / f"{name}.wav"
        data = sample(midi)
        if check:
            if not path.exists() or path.read_bytes() != data:
                raise SystemExit(f"Fixture differs: {path}")
        else:
            path.write_bytes(data)
    print(f"{'Verified' if check else 'Generated'} {len(PADS)} original WAV fixtures")


if __name__ == "__main__":
    main()
