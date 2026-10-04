#!/usr/bin/env python3
"""Read-only probe for the wired RK R65 JP BeiYing HID interface."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

VID = 0x258A
PID = 0x01F7
USAGE_PAGE = 0xFF00
USAGE = 0x0001
REPORT_ID = 0x06
REPORT_LENGTH = 519
RESPONSE_LENGTH = 512


def request(command: str) -> bytes:
    report = bytearray(REPORT_LENGTH)
    if command == "identify":
        report[:7] = bytes([0x82, 0x01, 0x00, 0x01, 0x00, 0x0A, 0x00])
    elif command == "key-matrix":
        report[:7] = bytes([0x83, 0x00, 0x00, 0x01, 0x00, 0xF8, 0x01])
    else:
        raise ValueError(f"Unsupported read command: {command}")
    return bytes(report)


def receive(device, expected_command: int, expected_length: int, delay: float = 0.0) -> bytes:
    if delay:
        time.sleep(delay)
    # HIDAPI buffers include the report ID as byte 0; WebHID passes it separately.
    result = bytes(device.get_feature_report(REPORT_ID, REPORT_LENGTH + 1))
    if len(result) < expected_length or result[0] != REPORT_ID or result[1] != expected_command:
        preview = result[:20].hex(" ").upper()
        raise RuntimeError(
            f"Unexpected report 0x{expected_command:02X}: "
            f"length={len(result)}, prefix={preview}"
        )
    return result[:expected_length]


def send_read(
    device, command: str, expected_command: int, expected_length: int, delay: float = 0.0
) -> bytes:
    # HIDAPI requires the report ID in the first byte of the buffer.
    sent = device.send_feature_report(bytes([REPORT_ID]) + request(command))
    if sent < REPORT_LENGTH + 1:
        raise RuntimeError(f"Short feature report write: {sent} bytes")
    return receive(device, expected_command, expected_length, delay)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        help="backup JSON destination (default: timestamped file in current directory)",
    )
    args = parser.parse_args()

    try:
        import hid
    except ImportError:
        print("hidapi is missing. Install it with: python3 -m pip install hidapi", file=sys.stderr)
        return 2

    matches = [
        item
        for item in hid.enumerate(VID, PID)
        if item.get("usage_page") == USAGE_PAGE and item.get("usage") == USAGE
    ]
    if len(matches) != 1:
        print(
            f"Expected exactly one config HID interface; found {len(matches)}. "
            "Close RK software/browser tabs and reconnect the wired keyboard if needed.",
            file=sys.stderr,
        )
        for item in matches:
            print(
                "candidate: "
                f"VID=0x{item['vendor_id']:04X} PID=0x{item['product_id']:04X} "
                f"usagePage=0x{item['usage_page']:04X} usage=0x{item['usage']:04X} "
                f"interface={item.get('interface_number')}",
                file=sys.stderr,
            )
        return 3

    info = matches[0]
    device = hid.device()
    try:
        device.open_path(info["path"])
        print(
            "device-opened "
            f"product={info.get('product_string')!r} "
            f"VID=0x{VID:04X} PID=0x{PID:04X} "
            f"usagePage=0x{USAGE_PAGE:04X} usage=0x{USAGE:04X} "
            f"interface={info.get('interface_number')}"
        )

        identify = send_read(device, "identify", 0x82, 18, delay=0.5)
        if len(identify) < 18:
            raise RuntimeError(f"Identify response too short: {len(identify)} bytes")
        print(f"identify-response length={len(identify)} hex={identify.hex(' ').upper()}")

        matrix = send_read(device, "key-matrix", 0x83, RESPONSE_LENGTH)
        if len(matrix) != RESPONSE_LENGTH:
            raise RuntimeError(
                f"Key-matrix response must be {RESPONSE_LENGTH} bytes; received {len(matrix)}"
            )
        if matrix[:8] != bytes([0x06, 0x83, 0x00, 0x00, 0x01, 0x00, 0xF8, 0x01]):
            raise RuntimeError(f"Unexpected key-matrix header: {matrix[:8].hex(' ').upper()}")

        henkan_offset = 8 + 41 * 4
        henkan = matrix[henkan_offset : henkan_offset + 4]
        print(
            f"matrix-response length={len(matrix)} "
            f"Henkan(slot 41)={henkan.hex(' ').upper()} "
            f"F1(slot 7)={matrix[8 + 7 * 4 : 8 + 8 * 4].hex(' ').upper()}"
        )

        timestamp = dt.datetime.now(dt.timezone.utc).isoformat()
        output = args.output or Path.cwd() / (
            "rk65-r65-01f7-backup-" + dt.datetime.now().strftime("%Y%m%d-%H%M%S") + ".json"
        )
        backup = {
            "format": "rk65-beiying-matrix-backup-v1",
            "capturedAt": timestamp,
            "device": {
                "productName": info.get("product_string"),
                "vendorId": f"0x{VID:04X}",
                "productId": f"0x{PID:04X}",
                "usagePage": f"0x{USAGE_PAGE:04X}",
                "usage": f"0x{USAGE:04X}",
                "interfaceNumber": info.get("interface_number"),
            },
            "identifyResponse": list(identify),
            "responseBytes": list(matrix),
            "readOnly": True,
        }
        output.write_text(json.dumps(backup, indent=2) + "\n", encoding="utf-8")
        print(f"backup-saved path={output.resolve()} bytes={len(matrix)}")
        print("complete readOnly=true writeCommandsSent=0")
        return 0
    finally:
        device.close()


if __name__ == "__main__":
    raise SystemExit(main())
