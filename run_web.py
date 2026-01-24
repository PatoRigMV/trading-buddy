#!/usr/bin/env python3
"""
Launch script for the Trading Assistant Web Interface
"""

import os
import sys
import subprocess
import logging

def check_requirements():
    """Check if required packages are installed"""
    required_packages = [
        'flask', 'flask_socketio', 'numpy', 'pandas',
        'jsonschema', 'asyncio_mqtt'
    ]

    missing_packages = []
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            missing_packages.append(package)

    if missing_packages:
        print("Missing required packages:")
        for package in missing_packages:
            print(f"  - {package}")
        print("\nInstall them with: pip install -r requirements.txt")
        return False

    return True

def setup_logging():
    """Setup logging configuration"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('trading_web.log'),
            logging.StreamHandler(sys.stdout)
        ]
    )

def main():
    """Main function to launch the web application"""
    print("🚀 LLM Trading Assistant Web Interface")
    print("=====================================")

    # Check requirements
    print("Checking requirements...")
    if not check_requirements():
        return 1
    print("✅ All requirements satisfied")

    # Setup logging
    setup_logging()

    # Set environment variables
    os.environ['FLASK_APP'] = 'web_app.py'
    os.environ['FLASK_ENV'] = 'development' if '--debug' in sys.argv else 'production'

    print("\n📊 Starting Trading Assistant Web Interface...")
    print("🌐 Web interface will be available at: http://localhost:5001")
    print("⚠️  IMPORTANT: This is for paper trading and testing only!")
    print("💡 Use Ctrl+C to stop the application")
    print("\n" + "="*50 + "\n")

    try:
        # Import and run the web app
        from web_app import app, socketio
        socketio.run(
            app,
            debug='--debug' in sys.argv,
            host='0.0.0.0',
            port=5001,
            use_reloader=False,  # Disable reloader to avoid issues with threading
            allow_unsafe_werkzeug=True  # Allow development server
        )
    except KeyboardInterrupt:
        print("\n\n🛑 Shutting down Trading Assistant...")
        print("👋 Thank you for using LLM Trading Assistant!")
        return 0
    except Exception as e:
        print(f"\n❌ Error starting web application: {e}")
        return 1

if __name__ == "__main__":
    exit(main())
