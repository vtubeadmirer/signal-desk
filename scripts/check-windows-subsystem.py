"""Reject release executables that open an unwanted Windows console."""
import struct
import sys
from pathlib import Path


def check_gui_binary(path: Path) -> None:
    data = path.read_bytes()
    if data[:2] != b"MZ":
        raise ValueError("Not a Windows executable")
    pe_offset = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe_offset:pe_offset + 4] != b"PE\0\0":
        raise ValueError("Missing PE signature")
    optional_header = pe_offset + 24
    magic = struct.unpack_from("<H", data, optional_header)[0]
    if magic not in (0x10B, 0x20B):
        raise ValueError("Unsupported PE optional header")
    subsystem = struct.unpack_from("<H", data, optional_header + 68)[0]
    if subsystem != 2:
        raise ValueError(f"Expected Windows GUI subsystem (2), got {subsystem}; this build may open a console")
    print(f"Windows GUI subsystem verified: {path.name}")


if __name__ == "__main__":
    check_gui_binary(Path(sys.argv[1]))
