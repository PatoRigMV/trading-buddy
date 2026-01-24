#!/usr/bin/env python3
"""
Deep investigation of HTML structure to find spacing source
"""

import requests
from bs4 import BeautifulSoup
import re

def investigate_structure():
    try:
        response = requests.get('http://127.0.0.1:8000')
        if response.status_code != 200:
            print(f"❌ Failed to fetch page: {response.status_code}")
            return

        html = response.text
        soup = BeautifulSoup(html, 'html.parser')

        print("🔍 DEEP HTML STRUCTURE INVESTIGATION")
        print("=" * 60)

        # Find the tab container and everything around it
        tab_container = soup.find(class_='tab-container')
        if not tab_container:
            print("❌ No .tab-container found!")
            return

        print("\n📋 TAB CONTAINER AND SURROUNDING STRUCTURE:")
        print(f"Tab container: {tab_container.name}")
        print(f"Tab container classes: {tab_container.get('class', [])}")

        # Get all elements between tab container and tab content
        current = tab_container
        element_count = 0
        print(f"\n🔗 ELEMENTS BETWEEN TAB CONTAINER AND TAB CONTENT:")

        while current and element_count < 10:
            current = current.next_sibling
            element_count += 1

            if current:
                if hasattr(current, 'name') and current.name:
                    classes = current.get('class', [])
                    element_id = current.get('id', '')
                    print(f"  {element_count}. <{current.name}> id='{element_id}' classes={classes}")

                    # Check if this is tab content
                    if 'tab-content' in classes:
                        print(f"      ✅ FOUND TAB CONTENT!")
                        break

                    # Check for any inline styles that might cause spacing
                    style = current.get('style', '')
                    if style:
                        print(f"      📐 Inline style: {style}")

                    # Check for common spacing-causing elements
                    if current.name in ['br', 'hr', 'div', 'p']:
                        print(f"      ⚠️  Potential spacing element: {current.name}")

                elif current.string and current.string.strip():
                    print(f"  {element_count}. TEXT: '{current.string.strip()}'")
                else:
                    print(f"  {element_count}. (whitespace/newline)")

        # Look for any divs or elements that might be creating space
        print(f"\n🎯 SEARCHING FOR HIDDEN SPACING ELEMENTS:")

        # Find all divs between tab-container and first tab-content
        divs_between = []
        if tab_container:
            next_elem = tab_container.next_sibling
            while next_elem:
                if hasattr(next_elem, 'name') and next_elem.name:
                    if 'tab-content' in next_elem.get('class', []):
                        break
                    if next_elem.name == 'div':
                        divs_between.append(next_elem)
                next_elem = next_elem.next_sibling

        for i, div in enumerate(divs_between):
            print(f"  Hidden div {i+1}: classes={div.get('class', [])} id='{div.get('id', '')}' style='{div.get('style', '')}'")
            if div.string:
                print(f"    Content: '{div.string.strip()}'")

        # Check if there are any elements with large heights or margins
        print(f"\n🔍 CHECKING FOR ELEMENTS WITH LARGE DIMENSIONS:")

        # Look for any CSS that might be setting heights
        height_patterns = [
            r'height:\s*(\d+)px',
            r'min-height:\s*(\d+)px',
            r'margin:\s*(\d+)px',
            r'padding:\s*(\d+)px'
        ]

        for pattern in height_patterns:
            matches = re.findall(pattern, html, re.IGNORECASE)
            large_values = [m for m in matches if int(m) > 50]
            if large_values:
                print(f"  Large {pattern.split(':')[0]} values found: {large_values}")

        # Check the first tab content specifically
        first_tab_content = soup.find(class_='tab-content')
        if first_tab_content:
            print(f"\n📄 FIRST TAB CONTENT ANALYSIS:")
            print(f"  Element: <{first_tab_content.name}>")
            print(f"  Classes: {first_tab_content.get('class', [])}")
            print(f"  ID: {first_tab_content.get('id', '')}")
            print(f"  Style: {first_tab_content.get('style', '')}")

            # Check first child of tab content
            first_child = first_tab_content.find()
            if first_child:
                print(f"  First child: <{first_child.name}> classes={first_child.get('class', [])} id='{first_child.get('id', '')}' style='{first_child.get('style', '')}'")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    investigate_structure()
