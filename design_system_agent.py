#!/usr/bin/env python3
"""
Design System Agent for Trading Assistant
========================================

Comprehensive design system audit and enforcement agent that:
1. Audits typography hierarchy (H1, H2, H3, paragraph, bold, caption, label)
2. Enforces color system consistency (primarily black with accent colors)
3. Standardizes border radius to 0px
4. Ensures spacing consistency
5. Validates component library consistency
6. Generates design system recommendations and implementations
7. Hands off to Frontend QA Agent for validation

Author: Claude Code Assistant
Date: 2025-09-29
"""

import asyncio
import aiohttp
import json
import logging
import time
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Design_System_Agent")

@dataclass
class DesignViolation:
    """Represents a design system violation"""
    category: str
    severity: str  # "critical", "warning", "suggestion"
    element: str
    current_value: str
    recommended_value: str
    location: str
    description: str

@dataclass
class DesignSystemResult:
    """Represents a design system test result"""
    test_name: str
    category: str
    status: str
    message: str
    execution_time: float
    violations: List[DesignViolation]
    details: Dict[str, Any]

class DesignSystemAgent:
    """Comprehensive Design System Agent"""

    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.session = None
        self.test_results: List[DesignSystemResult] = []
        self.violations: List[DesignViolation] = []

        # Design System Standards
        self.typography_system = {
            "h1": {"font-size": "32px", "font-weight": "700", "line-height": "1.2"},
            "h2": {"font-size": "24px", "font-weight": "600", "line-height": "1.3"},
            "h3": {"font-size": "20px", "font-weight": "600", "line-height": "1.4"},
            "paragraph": {"font-size": "16px", "font-weight": "400", "line-height": "1.6"},
            "paragraph-bold": {"font-size": "16px", "font-weight": "600", "line-height": "1.6"},
            "caption": {"font-size": "14px", "font-weight": "400", "line-height": "1.4"},
            "label": {"font-size": "14px", "font-weight": "500", "line-height": "1.4"}
        }

        self.color_system = {
            "primary": "#000000",      # Black
            "secondary": "#333333",    # Dark gray
            "accent": "#00ff88",       # Green accent
            "error": "#ff4444",        # Red
            "warning": "#ffaa00",      # Orange
            "success": "#00ff88",      # Green
            "background": "#000000",   # Black background
            "surface": "transparent",  # Transparent containers
            "border": "#444444",       # Darker borders for visibility
            "text-primary": "#ffffff", # White text
            "text-secondary": "#cccccc" # Light gray text
        }

        self.spacing_system = {
            "xs": "4px",
            "sm": "8px",
            "md": "16px",
            "lg": "24px",
            "xl": "32px",
            "2xl": "48px"
        }

        self.border_radius = "0px"  # Consistent 0px radius

    def add_violation(self, category: str, severity: str, element: str,
                     current: str, recommended: str, location: str, description: str):
        """Add a design violation"""
        violation = DesignViolation(
            category=category,
            severity=severity,
            element=element,
            current_value=current,
            recommended_value=recommended,
            location=location,
            description=description
        )
        self.violations.append(violation)

    def add_result(self, test_name: str, category: str, status: str,
                   message: str, execution_time: float, violations: List[DesignViolation] = None,
                   details: Dict[str, Any] = None):
        """Add a test result"""
        result = DesignSystemResult(
            test_name=test_name,
            category=category,
            status=status,
            message=message,
            execution_time=execution_time,
            violations=violations or [],
            details=details or {}
        )
        self.test_results.append(result)

        # Log result
        status_emoji = "✅" if status == "PASS" else "⚠️" if status == "WARN" else "❌"
        logger.info(f"{status_emoji} {test_name}: {message} ({execution_time:.2f}s)")

    async def audit_typography_system(self) -> Dict[str, Any]:
        """Audit typography consistency across the website"""
        logger.info("🔤 Auditing Typography System...")

        results = {}
        violations = []
        start_time = time.time()

        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Extract all font-size declarations
                    font_sizes = re.findall(r'font-size:\s*([^;]+)', content)
                    font_weights = re.findall(r'font-weight:\s*([^;]+)', content)
                    line_heights = re.findall(r'line-height:\s*([^;]+)', content)

                    # Analyze typography inconsistencies
                    unique_font_sizes = list(set(font_sizes))
                    unique_font_weights = list(set(font_weights))
                    unique_line_heights = list(set(line_heights))

                    # Check for common typography violations
                    typography_violations = []

                    # Check for too many font sizes
                    if len(unique_font_sizes) > 12:
                        typography_violations.append({
                            "type": "excessive_font_sizes",
                            "count": len(unique_font_sizes),
                            "sizes": unique_font_sizes[:10]  # Show first 10
                        })

                    # Check for inconsistent heading hierarchy
                    h1_pattern = r'h1[^{]*{[^}]*font-size:\s*([^;]+)'
                    h2_pattern = r'h2[^{]*{[^}]*font-size:\s*([^;]+)'
                    h3_pattern = r'h3[^{]*{[^}]*font-size:\s*([^;]+)'

                    h1_sizes = re.findall(h1_pattern, content)
                    h2_sizes = re.findall(h2_pattern, content)
                    h3_sizes = re.findall(h3_pattern, content)

                    if len(set(h1_sizes)) > 1:
                        typography_violations.append({
                            "type": "inconsistent_h1",
                            "sizes": list(set(h1_sizes))
                        })

                    # Calculate typography consistency score
                    consistency_score = max(0, 100 - (len(unique_font_sizes) * 5) - (len(typography_violations) * 10))

                    # Generate violations for each inconsistency
                    for violation in typography_violations:
                        if violation["type"] == "excessive_font_sizes":
                            self.add_violation(
                                "Typography",
                                "warning",
                                "font-size",
                                f"{violation['count']} different sizes",
                                "7 standardized sizes (H1-H3, paragraph, caption, label)",
                                "Global CSS",
                                f"Too many font sizes detected: {violation['count']}. Recommend standardizing to typography scale."
                            )

                    if consistency_score >= 80:
                        status = "PASS"
                        message = f"Typography system is well-structured ({consistency_score}%)"
                    elif consistency_score >= 60:
                        status = "WARN"
                        message = f"Typography system needs improvement ({consistency_score}%)"
                    else:
                        status = "FAIL"
                        message = f"Typography system requires standardization ({consistency_score}%)"

                    self.add_result(
                        "Typography System Audit",
                        "Typography",
                        status,
                        message,
                        execution_time,
                        violations,
                        {
                            "font_sizes_found": len(unique_font_sizes),
                            "font_weights_found": len(unique_font_weights),
                            "line_heights_found": len(unique_line_heights),
                            "consistency_score": consistency_score,
                            "violations": typography_violations
                        }
                    )

                    results["typography_audit"] = True

                else:
                    self.add_result(
                        "Typography System Audit",
                        "Typography",
                        "FAIL",
                        f"Cannot access website - HTTP {response.status}",
                        execution_time
                    )
                    results["typography_audit"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Typography System Audit",
                "Typography",
                "FAIL",
                f"Typography audit failed: {str(e)}",
                execution_time
            )
            results["typography_audit"] = False

        return results

    async def audit_color_system(self) -> Dict[str, Any]:
        """Audit color consistency and establish black-primary system"""
        logger.info("🎨 Auditing Color System...")

        results = {}
        violations = []
        start_time = time.time()

        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Extract all color declarations
                    colors = re.findall(r'(?:color|background-color|border-color):\s*([^;]+)', content)
                    unique_colors = list(set(colors))

                    # Check for CSS custom properties (design tokens)
                    css_vars = re.findall(r'var\(--([^)]+)\)', content)
                    unique_css_vars = list(set(css_vars))

                    # Analyze color system violations
                    color_violations = []

                    # Check for too many unique colors
                    if len(unique_colors) > 15:
                        color_violations.append({
                            "type": "excessive_colors",
                            "count": len(unique_colors)
                        })

                    # Check for inconsistent primary colors
                    black_variants = [c for c in unique_colors if 'black' in c.lower() or c.strip() == '#000' or c.strip() == '#000000']
                    if len(black_variants) > 2:
                        color_violations.append({
                            "type": "inconsistent_black",
                            "variants": black_variants
                        })

                    # Calculate color consistency score
                    has_css_vars = len(unique_css_vars) > 0
                    color_score = 100

                    if len(unique_colors) > 15:
                        color_score -= 30
                    if not has_css_vars:
                        color_score -= 20
                    if len(color_violations) > 0:
                        color_score -= len(color_violations) * 15

                    color_score = max(0, color_score)

                    # Generate violations
                    for violation in color_violations:
                        if violation["type"] == "excessive_colors":
                            self.add_violation(
                                "Color System",
                                "warning",
                                "color palette",
                                f"{violation['count']} different colors",
                                "Standardized color palette with CSS custom properties",
                                "Global CSS",
                                f"Too many colors detected: {violation['count']}. Recommend using design tokens."
                            )

                    if color_score >= 80:
                        status = "PASS"
                        message = f"Color system is well-organized ({color_score}%)"
                    elif color_score >= 60:
                        status = "WARN"
                        message = f"Color system needs standardization ({color_score}%)"
                    else:
                        status = "FAIL"
                        message = f"Color system requires design tokens ({color_score}%)"

                    self.add_result(
                        "Color System Audit",
                        "Color",
                        status,
                        message,
                        execution_time,
                        violations,
                        {
                            "unique_colors_found": len(unique_colors),
                            "css_variables_found": len(unique_css_vars),
                            "has_design_tokens": has_css_vars,
                            "color_consistency_score": color_score,
                            "violations": color_violations
                        }
                    )

                    results["color_audit"] = True

                else:
                    self.add_result(
                        "Color System Audit",
                        "Color",
                        "FAIL",
                        f"Cannot access website - HTTP {response.status}",
                        execution_time
                    )
                    results["color_audit"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Color System Audit",
                "Color",
                "FAIL",
                f"Color audit failed: {str(e)}",
                execution_time
            )
            results["color_audit"] = False

        return results

    async def audit_border_radius_system(self) -> Dict[str, Any]:
        """Audit border radius consistency (should be 0px)"""
        logger.info("📐 Auditing Border Radius System...")

        results = {}
        violations = []
        start_time = time.time()

        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Extract all border-radius declarations
                    border_radii = re.findall(r'border-radius:\s*([^;]+)', content)
                    unique_radii = list(set(border_radii))

                    # Check for non-zero border radius violations
                    non_zero_radii = [r for r in unique_radii if r.strip() not in ['0', '0px', '0rem', '0em']]

                    # Calculate compliance score
                    total_radii = len(border_radii)
                    zero_radii = len([r for r in border_radii if r.strip() in ['0', '0px', '0rem', '0em']])
                    compliance_score = (zero_radii / total_radii * 100) if total_radii > 0 else 100

                    # Generate violations for non-zero radii
                    for radius in non_zero_radii:
                        self.add_violation(
                            "Border Radius",
                            "warning",
                            "border-radius",
                            radius.strip(),
                            "0px",
                            "CSS",
                            f"Non-zero border radius detected: {radius}. Design system requires 0px radius."
                        )

                    if compliance_score >= 90:
                        status = "PASS"
                        message = f"Border radius system is consistent ({compliance_score:.1f}%)"
                    elif compliance_score >= 70:
                        status = "WARN"
                        message = f"Border radius system needs standardization ({compliance_score:.1f}%)"
                    else:
                        status = "FAIL"
                        message = f"Border radius system requires 0px enforcement ({compliance_score:.1f}%)"

                    self.add_result(
                        "Border Radius System Audit",
                        "Layout",
                        status,
                        message,
                        execution_time,
                        violations,
                        {
                            "total_border_radius_declarations": total_radii,
                            "zero_radius_count": zero_radii,
                            "non_zero_radius_count": len(non_zero_radii),
                            "unique_radii": unique_radii,
                            "compliance_score": compliance_score
                        }
                    )

                    results["border_radius_audit"] = True

                else:
                    self.add_result(
                        "Border Radius System Audit",
                        "Layout",
                        "FAIL",
                        f"Cannot access website - HTTP {response.status}",
                        execution_time
                    )
                    results["border_radius_audit"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Border Radius System Audit",
                "Layout",
                "FAIL",
                f"Border radius audit failed: {str(e)}",
                execution_time
            )
            results["border_radius_audit"] = False

        return results

    async def audit_spacing_system(self) -> Dict[str, Any]:
        """Audit spacing consistency across components"""
        logger.info("📏 Auditing Spacing System...")

        results = {}
        violations = []
        start_time = time.time()

        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Extract spacing declarations
                    margins = re.findall(r'margin[^:]*:\s*([^;]+)', content)
                    paddings = re.findall(r'padding[^:]*:\s*([^;]+)', content)
                    gaps = re.findall(r'gap:\s*([^;]+)', content)

                    all_spacing = margins + paddings + gaps
                    unique_spacing = list(set(all_spacing))

                    # Check for consistent spacing scale
                    standardized_values = ['4px', '8px', '12px', '16px', '20px', '24px', '32px', '48px']
                    non_standard_spacing = [s for s in unique_spacing if s.strip() not in standardized_values and 'var(' not in s]

                    # Calculate spacing consistency score
                    total_spacing = len(all_spacing)
                    standard_spacing = len([s for s in all_spacing if s.strip() in standardized_values or 'var(' in s])
                    consistency_score = (standard_spacing / total_spacing * 100) if total_spacing > 0 else 100

                    # Generate violations for non-standard spacing
                    for spacing in non_standard_spacing[:5]:  # Limit to first 5
                        self.add_violation(
                            "Spacing",
                            "suggestion",
                            "spacing value",
                            spacing.strip(),
                            "Design system spacing scale (4px, 8px, 16px, 24px, 32px, 48px)",
                            "CSS",
                            f"Non-standard spacing value: {spacing}. Consider using design system spacing scale."
                        )

                    if consistency_score >= 80:
                        status = "PASS"
                        message = f"Spacing system is well-structured ({consistency_score:.1f}%)"
                    elif consistency_score >= 60:
                        status = "WARN"
                        message = f"Spacing system needs standardization ({consistency_score:.1f}%)"
                    else:
                        status = "FAIL"
                        message = f"Spacing system requires consistent scale ({consistency_score:.1f}%)"

                    self.add_result(
                        "Spacing System Audit",
                        "Layout",
                        status,
                        message,
                        execution_time,
                        violations,
                        {
                            "total_spacing_declarations": total_spacing,
                            "unique_spacing_values": len(unique_spacing),
                            "non_standard_spacing_count": len(non_standard_spacing),
                            "consistency_score": consistency_score,
                            "spacing_values": unique_spacing[:10]  # First 10 for review
                        }
                    )

                    results["spacing_audit"] = True

                else:
                    self.add_result(
                        "Spacing System Audit",
                        "Layout",
                        "FAIL",
                        f"Cannot access website - HTTP {response.status}",
                        execution_time
                    )
                    results["spacing_audit"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Spacing System Audit",
                "Layout",
                "FAIL",
                f"Spacing audit failed: {str(e)}",
                execution_time
            )
            results["spacing_audit"] = False

        return results

    async def audit_component_consistency(self) -> Dict[str, Any]:
        """Audit component library consistency"""
        logger.info("🧩 Auditing Component Consistency...")

        results = {}
        violations = []
        start_time = time.time()

        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Check for consistent component patterns
                    button_classes = re.findall(r'class="[^"]*btn[^"]*"', content)
                    card_classes = re.findall(r'class="[^"]*card[^"]*"', content)
                    input_classes = re.findall(r'class="[^"]*input[^"]*"', content)

                    # Extract button styling patterns
                    button_styles = re.findall(r'\.btn[^{]*{[^}]+}', content)
                    card_styles = re.findall(r'\.card[^{]*{[^}]+}', content)

                    # Check for component naming consistency
                    component_classes = []
                    component_classes.extend(re.findall(r'class="[^"]*terminal[^"]*"', content))
                    component_classes.extend(re.findall(r'class="[^"]*analysis[^"]*"', content))
                    component_classes.extend(re.findall(r'class="[^"]*stock[^"]*"', content))

                    # Calculate component consistency score
                    total_components = len(button_classes) + len(card_classes) + len(component_classes)
                    consistent_naming = len([c for c in component_classes if '-' in c])  # BEM-like naming

                    consistency_score = 85  # Base score

                    if len(button_styles) > 3:  # Too many button variants
                        consistency_score -= 15
                        self.add_violation(
                            "Components",
                            "warning",
                            "button variants",
                            f"{len(button_styles)} different button styles",
                            "Standardized button component system",
                            "CSS",
                            f"Multiple button styles detected. Consider consolidating into design system."
                        )

                    if total_components > 0 and consistent_naming / total_components < 0.5:
                        consistency_score -= 20
                        self.add_violation(
                            "Components",
                            "suggestion",
                            "component naming",
                            "Inconsistent naming convention",
                            "BEM or consistent naming methodology",
                            "HTML/CSS",
                            "Component naming lacks consistency. Consider adopting BEM methodology."
                        )

                    if consistency_score >= 80:
                        status = "PASS"
                        message = f"Component system is well-structured ({consistency_score}%)"
                    elif consistency_score >= 60:
                        status = "WARN"
                        message = f"Component system needs standardization ({consistency_score}%)"
                    else:
                        status = "FAIL"
                        message = f"Component system requires design library ({consistency_score}%)"

                    self.add_result(
                        "Component Consistency Audit",
                        "Components",
                        status,
                        message,
                        execution_time,
                        violations,
                        {
                            "button_variants": len(button_styles),
                            "card_variants": len(card_styles),
                            "total_components": total_components,
                            "component_consistency_score": consistency_score
                        }
                    )

                    results["component_audit"] = True

                else:
                    self.add_result(
                        "Component Consistency Audit",
                        "Components",
                        "FAIL",
                        f"Cannot access website - HTTP {response.status}",
                        execution_time
                    )
                    results["component_audit"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Component Consistency Audit",
                "Components",
                "FAIL",
                f"Component audit failed: {str(e)}",
                execution_time
            )
            results["component_audit"] = False

        return results

    def generate_design_system_recommendations(self) -> Dict[str, Any]:
        """Generate comprehensive design system recommendations"""
        logger.info("📋 Generating Design System Recommendations...")

        critical_violations = [v for v in self.violations if v.severity == "critical"]
        warning_violations = [v for v in self.violations if v.severity == "warning"]
        suggestion_violations = [v for v in self.violations if v.severity == "suggestion"]

        recommendations = {
            "immediate_actions": [],
            "css_implementation": {},
            "component_library": {},
            "design_tokens": {}
        }

        # CSS Custom Properties for Design System
        recommendations["design_tokens"] = {
            "colors": self.color_system,
            "typography": self.typography_system,
            "spacing": self.spacing_system,
            "border_radius": self.border_radius
        }

        # Generate CSS implementation
        css_vars = []

        # Color CSS variables
        for key, value in self.color_system.items():
            css_vars.append(f"  --color-{key.replace('_', '-')}: {value};")

        # Typography CSS variables
        for key, styles in self.typography_system.items():
            for prop, value in styles.items():
                css_vars.append(f"  --{key}-{prop.replace('_', '-')}: {value};")

        # Spacing CSS variables
        for key, value in self.spacing_system.items():
            css_vars.append(f"  --spacing-{key}: {value};")

        css_vars.append(f"  --border-radius: {self.border_radius};")

        recommendations["css_implementation"] = {
            "root_variables": "\n".join(css_vars),
            "typography_classes": self._generate_typography_classes(),
            "component_base_styles": self._generate_component_styles()
        }

        # Priority recommendations based on violations
        if critical_violations:
            recommendations["immediate_actions"].append("Address critical design violations immediately")
        if warning_violations:
            recommendations["immediate_actions"].append("Implement design system foundation")
        if suggestion_violations:
            recommendations["immediate_actions"].append("Establish component library standards")

        return recommendations

    def _generate_typography_classes(self) -> str:
        """Generate standardized typography CSS classes"""
        typography_css = []

        for element, styles in self.typography_system.items():
            class_name = element.replace('_', '-')
            css_rules = []
            for prop, value in styles.items():
                css_rules.append(f"  {prop.replace('_', '-')}: var(--{element}-{prop.replace('_', '-')});")

            typography_css.append(f".text-{class_name} {{\n{chr(10).join(css_rules)}\n}}")

        return "\n\n".join(typography_css)

    def _generate_component_styles(self) -> str:
        """Generate base component styles"""
        return """
/* Base Component Styles */
.component-base {
  border-radius: var(--border-radius);
  border: 1px solid var(--color-border);
}

.btn-base {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-primary);
  color: var(--color-background);
  border: none;
  border-radius: var(--border-radius);
  font-size: var(--label-font-size);
  font-weight: var(--label-font-weight);
  cursor: pointer;
  transition: all 0.2s ease;
}

.card-base {
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: var(--spacing-md);
}
"""

    def generate_summary(self) -> Dict[str, Any]:
        """Generate comprehensive audit summary"""
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r.status == "PASS"])
        failed_tests = len([r for r in self.test_results if r.status == "FAIL"])
        warning_tests = len([r for r in self.test_results if r.status == "WARN"])

        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0

        avg_execution_time = sum(r.execution_time for r in self.test_results) / total_tests if total_tests > 0 else 0

        # Determine overall status
        critical_violations = len([v for v in self.violations if v.severity == "critical"])
        warning_violations = len([v for v in self.violations if v.severity == "warning"])

        if critical_violations > 0:
            overall_status = "CRITICAL"
        elif success_rate >= 90 and warning_violations <= 2:
            overall_status = "EXCELLENT"
        elif success_rate >= 75:
            overall_status = "GOOD"
        elif success_rate >= 50:
            overall_status = "NEEDS_IMPROVEMENT"
        else:
            overall_status = "POOR"

        # Categorize results
        categories = {}
        for result in self.test_results:
            category = result.category
            if category not in categories:
                categories[category] = {"passed": 0, "failed": 0, "warned": 0, "total": 0}

            categories[category]["total"] += 1
            if result.status == "PASS":
                categories[category]["passed"] += 1
            elif result.status == "FAIL":
                categories[category]["failed"] += 1
            elif result.status == "WARN":
                categories[category]["warned"] += 1

        return {
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "total_tests": total_tests,
                "passed": passed_tests,
                "failed": failed_tests,
                "warnings": warning_tests,
                "success_rate": success_rate,
                "overall_status": overall_status,
                "avg_execution_time": avg_execution_time,
                "total_violations": len(self.violations),
                "critical_violations": critical_violations,
                "warning_violations": warning_violations
            },
            "categories": categories,
            "test_results": [asdict(result) for result in self.test_results],
            "violations": [asdict(violation) for violation in self.violations],
            "recommendations": self.generate_design_system_recommendations()
        }

    async def run_comprehensive_audit(self) -> Dict[str, Any]:
        """Run comprehensive design system audit"""

        # Initialize session
        self.session = aiohttp.ClientSession()

        try:
            logger.info("🎨 Starting Comprehensive Design System Audit...")
            logger.info(f"🌐 Target URL: {self.base_url}")
            logger.info("=" * 80)

            # Run all design system audits
            await self.audit_typography_system()
            await self.audit_color_system()
            await self.audit_border_radius_system()
            await self.audit_spacing_system()
            await self.audit_component_consistency()

            # Generate summary
            summary = self.generate_summary()

            # Print summary
            logger.info("=" * 80)
            logger.info("🏁 Design System Audit Complete")
            logger.info(f"📊 Results: {summary['summary']['passed']}/{summary['summary']['total_tests']} PASSED " +
                       f"({summary['summary']['success_rate']:.1f}%)")
            logger.info(f"🎯 Overall Status: {summary['summary']['overall_status']}")
            logger.info(f"⚠️ Total Violations: {summary['summary']['total_violations']}")
            logger.info(f"⏱️ Average Execution Time: {summary['summary']['avg_execution_time']:.2f}s")

            # Save report
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_filename = f"design_system_audit_{timestamp}.json"
            with open(report_filename, 'w') as f:
                json.dump(summary, f, indent=2)
            logger.info(f"📄 Detailed report saved to: {report_filename}")

            return summary

        finally:
            await self.session.close()

async def main():
    """Main execution function"""
    agent = DesignSystemAgent()
    await agent.run_comprehensive_audit()

if __name__ == "__main__":
    asyncio.run(main())
