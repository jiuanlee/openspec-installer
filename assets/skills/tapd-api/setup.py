#!/usr/bin/env python3
"""
TAPD API Token Setup - Interactive setup for TAPD API token.

Usage:
    python setup.py
"""

import json
import os
import sys
from pathlib import Path

# Ensure UTF-8 output on Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = Path(__file__).parent
CONFIG_FILE = SCRIPT_DIR / "config.json"


def setup_config():
    """Interactive setup for TAPD API token."""
    print("=" * 60)
    print("TAPD API Token Setup")
    print("=" * 60)

    # Check if config already exists
    if CONFIG_FILE.exists():
        print(f"\n[Info] Config file already exists: {CONFIG_FILE}")
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                existing = json.load(f)
                if 'api_token' in existing:
                    token_preview = existing['api_token'][:8] + "..." if len(existing['api_token']) > 8 else "***"
                    print(f"[Current token] {token_preview}")
        except:
            pass

        response = input("\nOverwrite existing config? (y/n): ").strip().lower()
        if response != 'y':
            print("[Cancelled] Keeping existing config.")
            return

    print("\n[Step 1] Get your API Token")
    print("-" * 40)
    print("Visit: https://www.tapd.cn/tapd_api_token/token")
    print("Login to TAPD and create a new API token")

    print("\n[Step 2] Enter your credentials")
    print("-" * 40)

    # Get API token
    api_token = input("API Token: ").strip()
    if not api_token:
        print("[Error] API token is required.")
        return

    # Create config
    config = {
        "api_token": api_token,
    }

    # Save config
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        print(f"\n[OK] Config saved to: {CONFIG_FILE}")
        print("\n[Next steps]")
        print("You can now use the TAPD API skill:")
        print("  /tapd-api <tapd_url>")
        print("Or run:")
        print(f"  python {SCRIPT_DIR}/tapd_api.py <tapd_url>")
        return True
    except Exception as e:
        print(f"\n[Error] Failed to save config: {e}")


if __name__ == "__main__":
    setup_config()
