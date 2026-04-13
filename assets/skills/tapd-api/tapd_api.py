#!/usr/bin/env python3
"""
TAPD API Client - Fetch requirement/story/bug details using API Token.

Usage:
    python tapd_api.py "<tapd_url>"

Example:
    python tapd_api.py "https://www.tapd.cn/tapd_fe/37748852/story/detail/1137748852001368717"

This script:
1. Loads API token from config.json
2. Calls TAPD Open Platform API
3. Returns structured requirement data
"""

import json
import os
import re
import sys
import html
from pathlib import Path
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse, parse_qs
import http.client
import ssl

# Ensure UTF-8 output on Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Script directory
SCRIPT_DIR = Path(__file__).parent
CONFIG_FILE = SCRIPT_DIR / "config.json"

# TAPD API endpoints
TAPD_API_BASE = "https://api.tapd.cn"

# Resource type mappings
RESOURCE_TYPES = {
    'story': {'endpoint': 'stories', 'name_field': 'name', 'id_field': 'id'},
    'requirement': {'endpoint': 'requirements', 'name_field': 'name', 'id_field': 'id'},
    'bug': {'endpoint': 'bugs', 'name_field': 'title', 'id_field': 'id'},
    'task': {'endpoint': 'tasks', 'name_field': 'name', 'id_field': 'id'},
}


def strip_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    if not text:
        return ''
    # Remove HTML tags
    clean = re.sub(r'<[^>]+>', '', text)
    # Decode HTML entities
    clean = html.unescape(clean)
    # Clean up whitespace
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean


def load_config() -> Optional[Dict[str, str]]:
    """Load API token from config file."""
    if not CONFIG_FILE.exists():
        return None

    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
            if 'api_token' in config:
                return config
            else:
                print("[Error] 'api_token' not found in config.json")
                return None
    except json.JSONDecodeError as e:
        print(f"[Error] Invalid config.json: {e}")
        return None
    except Exception as e:
        print(f"[Error] Failed to load config: {e}")
        return None


def tapd_api_request(endpoint: str, params: Dict[str, str], config: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """
    Make request to TAPD API.

    Args:
        endpoint: API endpoint (e.g., 'stories', 'bugs')
        params: Query parameters
        config: Configuration with api_token

    Returns:
        JSON response data or None
    """
    api_token = config['api_token']

    # Build query string
    query_string = '&'.join(f"{k}={v}" for k, v in params.items())
    url_path = f"/{endpoint}?{query_string}"

    # Use Bearer Token authentication
    headers = {
        'Authorization': f'Bearer {api_token}',
        'Accept': 'application/json',
        'User-Agent': 'TAPD-API-Client/1.0'
    }

    try:
        # Create SSL context that doesn't verify certificates (for compatibility)
        # In production, you should verify certificates
        ssl_context = ssl.create_default_context()

        conn = http.client.HTTPSConnection(TAPD_API_BASE.replace('https://', ''), timeout=30)
        conn.request('GET', url_path, headers=headers)

        response = conn.getresponse()
        body = response.read().decode('utf-8')

        if response.status != 200:
            print(f"[Error] API request failed: {response.status} {response.reason}")
            print(f"[Response] {body}")
            return None

        conn.close()

        # Parse JSON response
        data = json.loads(body)
        return data

    except http.client.HTTPException as e:
        print(f"[Error] HTTP error: {e}")
        return None
    except ssl.SSLError as e:
        print(f"[Error] SSL error: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"[Error] JSON decode error: {e}")
        print(f"[Raw response] {body[:500]}")
        return None
    except Exception as e:
        print(f"[Error] Request failed: {e}")
        return None


def parse_tapd_url(url: str) -> Optional[Dict[str, str]]:
    """
    Parse TAPD URL to extract resource type and ID.

    Supported formats:
    - https://www.tapd.cn/tapd_fe/{workspace_id}/story/detail/{id}
    - https://www.tapd.cn/tapd_fe/{workspace_id}/requirement/detail/{id}
    - https://www.tapd.cn/tapd_fe/{workspace_id}/bug/view/{id}
    - https://www.tapd.cn/{workspace_id}/prong/stories/view/{id}
    """
    patterns = [
        # Modern TAPD URL format
        r'tapd\.cn/tapd_fe/(\d+)/(\w+)/detail/(\d+)',
        r'tapd\.cn/tapd_fe/(\d+)/(\w+)/view/(\d+)',
        # Legacy format
        r'tapd\.cn/(\d+)/prong/(\w+)/view/(\d+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, url, re.IGNORECASE)
        if match:
            workspace_id = match.group(1)
            resource_type = match.group(2).lower()
            resource_id = match.group(3)

            # Normalize resource type
            if resource_type in ['story', 'stories']:
                resource_type = 'story'
            elif resource_type in ['requirement', 'requirements']:
                resource_type = 'requirement'
            elif resource_type in ['bug', 'bugs']:
                resource_type = 'bug'
            elif resource_type in ['task', 'tasks']:
                resource_type = 'task'

            return {
                'workspace_id': workspace_id,
                'resource_type': resource_type,
                'resource_id': resource_id,
                'full_url': url
            }

    return None


def fetch_resource_details(url: str) -> Optional[str]:
    """
    Fetch resource details from TAPD API.

    Args:
        url: TAPD URL

    Returns:
        Formatted output string or None
    """
    # Parse URL
    url_info = parse_tapd_url(url)
    if not url_info:
        print(f"[Error] Invalid TAPD URL format: {url}")
        print("[Hint] Expected format: https://www.tapd.cn/tapd_fe/{workspace_id}/{type}/detail/{id}")
        return None

    resource_type = url_info['resource_type']
    workspace_id = url_info['workspace_id']
    resource_id = url_info['resource_id']

    # Check if resource type is supported
    if resource_type not in RESOURCE_TYPES:
        print(f"[Error] Unsupported resource type: {resource_type}")
        print(f"[Supported types]: {', '.join(RESOURCE_TYPES.keys())}")
        return None

    # Load config
    config = load_config()
    if not config:
        print("\n[Error] No API token configured.")
        print("\n[Setup] Please configure your TAPD API token:")
        print(f"  1. Create {CONFIG_FILE} with content:")
        print('     {"api_token": "your_token_here", "username": "your_username"}')
        print("  2. Or run: python setup.py")
        print("\n[Get Token] Visit: https://www.tapd.cn/tapd_api_token/token")
        return None

    # Build API request
    endpoint = RESOURCE_TYPES[resource_type]['endpoint']
    params = {
        'workspace_id': workspace_id,
        'id': resource_id,
        'limit': '1',
        'return': 'all'  # Return all fields
    }

    print(f"\n[Fetching] {url_info['full_url']}")
    print(f"[Type] {resource_type.capitalize()}")
    print(f"[Workspace] {workspace_id}")
    print(f"[ID] {resource_id}")

    # Make API request
    response_data = tapd_api_request(endpoint, params, config)

    if not response_data:
        print("[Error] API request failed")
        return None

    # Check for API errors in response
    if 'error' in response_data:
        error_msg = response_data.get('error', {}).get('message', 'Unknown error')
        print(f"[API Error] {error_msg}")
        if 'auth' in error_msg.lower() or 'token' in error_msg.lower():
            print("\n[Hint] Please check your API token in config.json")
            print("  Get new token: https://www.tapd.cn/tapd_api_token/token")
        return None

    # TAPD API returns format: {"status": 1, "data": [{"Story": {...}}]}
    # Extract data from response
    if response_data.get('status') == 1 and 'data' in response_data:
        items = response_data.get('data', [])
    else:
        # Try legacy format: {"stories": [...]}
        data_key = endpoint
        if data_key not in response_data:
            print(f"[Error] Unexpected API response format: missing 'data'")
            print(f"[Response] {json.dumps(response_data, ensure_ascii=False)[:500]}")
            return None
        items = response_data.get(data_key, [])

    if not items:
        print("[Error] No data found (resource may not exist or no permission)")
        return None

    # TAPD returns nested format: [{"Story": {...}}], extract inner data
    resource = items[0]
    if isinstance(resource, dict) and resource_type.capitalize() in resource:
        resource = resource[resource_type.capitalize()]
    elif isinstance(resource, dict) and 'Story' in resource:
        # Fallback for story type
        resource = resource['Story']

    # Format output
    return format_output(url_info, resource, resource_type)


def format_output(url_info: Dict, data: Dict, resource_type: str) -> str:
    """Format resource data as structured output."""
    output = []
    output.append("=" * 60)
    output.append("TAPD Requirement Details")
    output.append("=" * 60)
    output.append(f"\n**URL**: {url_info['full_url']}")
    output.append(f"**Type**: {resource_type.capitalize()}")
    output.append(f"**ID**: {data.get('id', 'N/A')}")

    # Get title/name field based on resource type
    name_field = RESOURCE_TYPES[resource_type]['name_field']
    title = data.get(name_field, 'N/A')
    output.append(f"\n**Title**: {title}")

    # Basic info
    output.append("\n## Basic Info")

    # Status
    if 'status' in data:
        status = data['status']
        # Translate status if it's a number
        status_map = {
            '1': '待规划', '2': '待评审', '3': '评审通过', '4': '开发中',
            '5': '测试中', '6': '已完成', '7': '已关闭', '8': '已拒绝'
        }
        status_name = status_map.get(str(status), status)
        output.append(f"**Status**: {status_name}")

    # Priority
    if 'priority' in data:
        output.append(f"**Priority**: {data['priority']}")

    # Category
    if 'category_id' in data:
        output.append(f"**Category ID**: {data['category_id']}")

    # Iteration
    if 'iteration_id' in data:
        output.append(f"**Iteration ID**: {data['iteration_id']}")
    if 'iteration_name' in data:
        output.append(f"**Iteration**: {data['iteration_name']}")

    # People
    output.append("\n## People")
    if 'creator' in data:
        output.append(f"**Creator**: {data['creator']}")
    if 'owner' in data:
        output.append(f"**Owner**: {data['owner']}")
    if 'handler' in data:
        output.append(f"**Handler**: {data['handler']}")

    # Timeline
    output.append("\n## Timeline")
    if 'created' in data:
        output.append(f"**Created**: {data['created']}")
    if 'modified' in data:
        output.append(f"**Modified**: {data['modified']}")
    if 'plan_begin' in data:
        output.append(f"**Plan Begin**: {data['plan_begin']}")
    if 'plan_end' in data:
        output.append(f"**Plan End**: {data['plan_end']}")
    if 'deadline' in data:
        output.append(f"**Deadline**: {data['deadline']}")

    # Description
    desc_field = 'description' if 'description' in data else 'content'
    if desc_field in data and data[desc_field]:
        output.append("\n## Description")
        desc = data[desc_field]
        # Strip HTML tags
        desc = strip_html(desc)
        # Truncate if too long
        if len(desc) > 2000:
            desc = desc[:2000] + "\n\n... (truncated)"
        output.append(desc)

    # Additional fields for bugs
    if resource_type == 'bug':
        output.append("\n## Bug Info")
        if 'severity' in data:
            output.append(f"**Severity**: {data['severity']}")
        if 'bug_type' in data:
            output.append(f"**Type**: {data['bug_type']}")
        if 'foundin' in data:
            output.append(f"**Found In**: {data['foundin']}")

    output.append("\n" + "=" * 60)

    return '\n'.join(output)


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("\nTAPD API Client - Fetch requirement details using API token")
        print("\nUsage: python tapd_api.py <tapd_url>")
        print("\nExample:")
        print("  python tapd_api.py 'https://www.tapd.cn/tapd_fe/37748852/story/detail/1137748852001368717'")
        print("\nSetup:")
        print("  1. Get API token from: https://www.tapd.cn/tapd_api_token/token")
        print(f"  2. Create config.json with: {{'api_token': 'your_token', 'username': 'your_username'}}")
        print(f"  3. Or run: python setup.py")
        sys.exit(1)

    url = sys.argv[1]
    result = fetch_resource_details(url)

    if result:
        print(result)
    else:
        print("\n[Failed] Could not fetch requirement details.")
        sys.exit(1)


if __name__ == "__main__":
    main()
