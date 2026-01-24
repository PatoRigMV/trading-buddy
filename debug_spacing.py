#!/usr/bin/env python3
"""
Debug spacing by fetching the HTML and analyzing the actual CSS
"""

import requests
import re
from bs4 import BeautifulSoup

def analyze_spacing():
    try:
        # Fetch the HTML
        response = requests.get('http://127.0.0.1:8000')
        if response.status_code != 200:
            print(f"❌ Failed to fetch page: {response.status_code}")
            return

        html = response.text
        soup = BeautifulSoup(html, 'html.parser')

        print("🔍 SPACING ANALYSIS")
        print("=" * 50)

        # Find all CSS custom property definitions
        print("\n📏 CSS SPACING VARIABLES:")
        space_vars = re.findall(r'--space-\w+:\s*(\d+px);', html)
        if space_vars:
            for i, var in enumerate(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']):
                if i < len(space_vars):
                    print(f"  --space-{var}: {space_vars[i]}")

        # Look for tab-container CSS rules
        print("\n🎯 TAB-CONTAINER CSS RULES:")
        tab_container_matches = re.findall(r'\.tab-container\s*\{([^}]+)\}', html, re.DOTALL)
        for match in tab_container_matches:
            print(f"  .tab-container {{{match.strip()}}}")

        # Look for tab-content CSS rules
        print("\n📋 TAB-CONTENT CSS RULES:")
        tab_content_matches = re.findall(r'\.tab-content[^{]*\{([^}]+)\}', html, re.DOTALL)
        for match in tab_content_matches:
            print(f"  .tab-content {{{match.strip()}}}")

        # Look for terminal-header CSS rules
        print("\n🖥️  TERMINAL-HEADER CSS RULES:")
        terminal_header_matches = re.findall(r'\.terminal-header[^{]*\{([^}]+)\}', html, re.DOTALL)
        for match in terminal_header_matches:
            print(f"  .terminal-header {{{match.strip()}}}")

        # Check for any margin-bottom or padding rules that might affect spacing
        print("\n⚡ ALL MARGIN-BOTTOM RULES WITH LARGE SPACING:")
        large_margin_matches = re.findall(r'([^{]+)\{[^}]*margin-bottom:\s*var\(--space-(lg|xl|2xl|3xl)\)[^}]*\}', html, re.DOTALL)
        for selector, space_size in large_margin_matches:
            selector_clean = selector.strip().split('\n')[-1].strip()
            print(f"  {selector_clean}: margin-bottom: var(--space-{space_size})")

        print("\n⚡ ALL PADDING RULES WITH LARGE SPACING:")
        large_padding_matches = re.findall(r'([^{]+)\{[^}]*padding[^:]*:\s*[^;]*var\(--space-(lg|xl|2xl|3xl)\)[^}]*\}', html, re.DOTALL)
        for selector, space_size in large_padding_matches:
            selector_clean = selector.strip().split('\n')[-1].strip()
            print(f"  {selector_clean}: contains var(--space-{space_size}) in padding")

        print("\n🏗️  HTML STRUCTURE AROUND TABS:")
        # Find the tab structure in HTML
        tab_container = soup.find(class_='tab-container')
        if tab_container:
            print("  ✅ Found .tab-container")
            # Find the next sibling that has tab-content
            next_sibs = tab_container.find_next_siblings()[:3]  # Check first 3 siblings
            for i, sib in enumerate(next_sibs):
                if sib.name:
                    classes = sib.get('class', [])
                    print(f"    Next sibling {i+1}: <{sib.name}> with classes: {classes}")
                    if 'tab-content' in classes:
                        print(f"      ✅ This is tab content!")
                        break
        else:
            print("  ❌ No .tab-container found in HTML")

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    analyze_spacing()
