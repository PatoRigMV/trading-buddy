#!/usr/bin/env python3
"""
JavaScript Syntax Checker for HTML Templates

This script checks for common JavaScript syntax errors in HTML template files,
specifically focusing on template string literals and their proper closing syntax.

Usage:
    python3 check_javascript_syntax.py [file_path]

If no file_path is provided, defaults to templates/index.html
"""

import re
import sys
from pathlib import Path


def check_template_syntax(file_path):
    """Check for JavaScript syntax errors in template file"""

    with open(file_path, 'r') as f:
        lines = f.readlines()

    errors = []
    warnings = []

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # Check 1: Lines ending with `);
        if stripped.endswith('`);'):
            # Get context (previous 20 lines)
            context_start = max(0, i - 21)
            context = ''.join(lines[context_start:i-1])

            # Pattern 1: return ` inside .map() or .filter() - should be just `
            if 'return `' in context and ('.map(' in context or '.filter(' in context):
                errors.append({
                    'line': i,
                    'type': 'SYNTAX_ERROR',
                    'message': f'Line {i}: Return statement in map/filter should end with ` not `);',
                    'pattern': stripped,
                    'suggestion': 'Change `); to just `'
                })

            # Pattern 2: html += ` should end with `;
            elif 'html += `' in context:
                # This is correct syntax for string concatenation
                pass

            # Pattern 3: safeSetHTML( calls should end with `);
            elif 'safeSetHTML(' in context:
                # This is correct syntax for function calls
                pass

            # Pattern 4: Unexpected `); without clear context
            else:
                warnings.append({
                    'line': i,
                    'type': 'WARNING',
                    'message': f'Line {i}: Unusual `); pattern - verify this is correct',
                    'pattern': stripped
                })

        # Check 2: Unclosed template literals
        if line.count('`') % 2 != 0 and not stripped.endswith('\\'):
            # Check if this is a multi-line template literal
            backtick_before = ''.join(lines[max(0, i-10):i-1]).count('`')
            if backtick_before % 2 != 0:
                # We're inside a multi-line template literal, this is OK
                pass

        # Check 3: Missing semicolons after function calls
        if re.match(r'^\s+\w+\(.*\)$', stripped) and not stripped.startswith('//'):
            warnings.append({
                'line': i,
                'type': 'STYLE_WARNING',
                'message': f'Line {i}: Function call missing semicolon',
                'pattern': stripped[:50]
            })

    return errors, warnings


def print_results(errors, warnings, file_path):
    """Print formatted results"""

    print(f"\n{'='*80}")
    print(f"JavaScript Syntax Check: {file_path}")
    print(f"{'='*80}\n")

    if not errors and not warnings:
        print("✅ No syntax errors or warnings found!")
        print(f"📄 File: {file_path}")
        return 0

    # Print errors
    if errors:
        print(f"❌ Found {len(errors)} SYNTAX ERROR(S):\n")
        for error in errors:
            print(f"  Line {error['line']}: {error['message']}")
            print(f"  Pattern: {error['pattern']}")
            if 'suggestion' in error:
                print(f"  Suggestion: {error['suggestion']}")
            print()

    # Print warnings
    if warnings:
        print(f"⚠️  Found {len(warnings)} WARNING(S):\n")
        for warning in warnings:
            print(f"  Line {warning['line']}: {warning['message']}")
            print(f"  Pattern: {warning['pattern'][:60]}")
            print()

    print(f"{'='*80}")
    print(f"Summary: {len(errors)} errors, {len(warnings)} warnings")
    print(f"{'='*80}\n")

    return 1 if errors else 0


def main():
    """Main entry point"""

    # Get file path from command line or use default
    if len(sys.argv) > 1:
        file_path = Path(sys.argv[1])
    else:
        file_path = Path(__file__).parent / 'templates' / 'index.html'

    if not file_path.exists():
        print(f"❌ Error: File not found: {file_path}")
        return 1

    # Run checks
    errors, warnings = check_template_syntax(file_path)

    # Print results
    exit_code = print_results(errors, warnings, file_path)

    return exit_code


if __name__ == '__main__':
    sys.exit(main())
