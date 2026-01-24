"""
Natural Language Chat Agent for Agent Status Terminal
Handles conversational queries and delegates to specialized agents
"""

import json
import re
import time
from typing import Dict, List, Optional, Any
from datetime import datetime

class ChatAgent:
    """Natural language interface for the trading agent system"""

    def __init__(self):
        self.conversation_history = []
        self.context = {
            'current_symbols': [],
            'last_query_time': None,
            'user_preferences': {}
        }

    def process_message(self, message: str) -> Dict[str, Any]:
        """Process a natural language message and return appropriate response"""

        # Clean and normalize the message
        message = message.strip().lower()

        # Store message in conversation history
        self.conversation_history.append({
            'timestamp': datetime.now().isoformat(),
            'message': message,
            'type': 'user'
        })

        # Analyze message intent and extract entities
        intent, entities = self.analyze_intent(message)

        # Generate response based on intent
        response = self.generate_response(intent, entities, message)

        # Store response in conversation history
        self.conversation_history.append({
            'timestamp': datetime.now().isoformat(),
            'message': response['text'],
            'type': 'assistant',
            'intent': intent,
            'entities': entities
        })

        return response

    def extract_symbols(self, message: str) -> list:
        """Extract stock symbols from message"""
        # Enhanced symbol pattern that filters out common English words
        common_words = {
            'A', 'I', 'IS', 'THE', 'OF', 'FOR', 'AND', 'OR', 'BUT', 'IN', 'ON', 'AT', 'TO', 'AS',
            'BY', 'UP', 'SO', 'NO', 'MY', 'IT', 'WE', 'HE', 'IF', 'DO', 'GO', 'AM', 'AN', 'ME',
            'US', 'BE', 'OR', 'CAN', 'GET', 'HAS', 'HAD', 'HIM', 'HER', 'HIS', 'HOW', 'ITS', 'LET',
            'MAY', 'NEW', 'NOW', 'OLD', 'OUR', 'OUT', 'PUT', 'SAY', 'SEE', 'SHE', 'TOO', 'TWO',
            'USE', 'WAS', 'WAY', 'WHO', 'WIN', 'YES', 'YET', 'YOU', 'YOUR', 'MAKE', 'TAKE', 'GIVE',
            'WHAT', 'WHEN', 'WHERE', 'WHICH', 'WILL', 'WITH', 'WORK', 'YEAR', 'GOOD', 'GREAT',
            'FROM', 'HAVE', 'THEY', 'BEEN', 'WERE', 'SAID', 'EACH', 'WOULD', 'THERE', 'THEIR',
            'OTHER', 'AFTER', 'FIRST', 'WELL', 'JUST', 'ONLY', 'VERY', 'BACK', 'OVER', 'THINK',
            'ALSO', 'YOUR', 'WORK', 'LIFE', 'ONLY', 'NEW', 'KNOW', 'WANT', 'LOOK', 'TIME',
            'HIGH', 'LOW', 'OPEN', 'CLOSE', 'STOCK', 'STOCKS', 'PRICE', 'PRICES', 'MARKET',
            'BUY', 'SELL', 'TRADE', 'ADD', 'REMOVE', 'SHOW', 'TELL', 'FIND', 'HELP'
        }

        # Convert message to uppercase for consistent processing
        upper_message = message.upper()

        # Find potential symbols (1-5 letters, case insensitive)
        symbol_pattern = r'\b[A-Z]{1,5}\b'
        all_symbols = re.findall(symbol_pattern, upper_message)

        # Filter out common words and ensure minimum length
        symbols = [s for s in all_symbols if s not in common_words and len(s) >= 2]

        return symbols

    def analyze_intent(self, message: str) -> tuple:
        """Analyze message to determine intent and extract entities"""

        # Extract stock symbols using the new method
        symbols = self.extract_symbols(message)

        # Intent patterns
        intents = {
            'price_check': [
                'price', 'cost', 'trading at', 'current price', 'quote',
                'what is', 'how much', 'value of'
            ],
            'analysis': [
                'analyze', 'analysis', 'research', 'study', 'look at',
                'investigate', 'examine', 'tell me about'
            ],
            'watchlist': [
                'watchlist', 'watch', 'monitor', 'track', 'add', 'remove',
                'watching', 'stocks are on', 'on my watchlist'
            ],
            'buy_sell': [
                'buy', 'sell', 'purchase', 'trade', 'execute',
                'place order', 'should i buy', 'should i sell'
            ],
            'portfolio': [
                'portfolio', 'positions', 'holdings', 'my stocks',
                'what do i own', 'performance'
            ],
            'market_status': [
                'market', 'hours', 'open', 'closed', 'status',
                'trading hours'
            ],
            'help': [
                'help', 'commands', 'what can you do', 'how to',
                'guide', 'instructions'
            ],
            'greeting': [
                'hello', 'hi', 'hey', 'good morning', 'good afternoon',
                'good evening'
            ]
        }

        # Determine intent based on keyword matching
        detected_intent = 'general'
        confidence = 0.0

        for intent, keywords in intents.items():
            for keyword in keywords:
                if keyword in message:
                    detected_intent = intent
                    confidence = 1.0
                    break
            if confidence > 0:
                break

        entities = {
            'symbols': symbols,
            'confidence': confidence
        }

        return detected_intent, entities

    def generate_response(self, intent: str, entities: Dict, original_message: str) -> Dict[str, Any]:
        """Generate appropriate response based on intent and entities"""

        current_time = datetime.now().strftime('%H:%M:%S')

        response = {
            'text': '',
            'action': None,
            'data': {},
            'timestamp': current_time
        }

        if intent == 'greeting':
            response['text'] = f"🤖 Hello! I'm your trading assistant. I can help you with stock analysis, watchlist management, portfolio queries, and market information. What would you like to know?"

        elif intent == 'price_check':
            symbols = entities.get('symbols', [])
            if symbols:
                response['text'] = f"📊 Looking up current prices for {', '.join(symbols)}..."
                response['action'] = 'fetch_prices'
                response['data'] = {'symbols': symbols}
            else:
                response['text'] = "💡 I can help you check stock prices! Please specify which stock symbols you'd like to see (e.g., 'What's the price of AAPL?')"

        elif intent == 'analysis':
            symbols = entities.get('symbols', [])
            if symbols:
                response['text'] = f"🔍 Starting comprehensive analysis for {', '.join(symbols)}. This includes technical indicators, fundamentals, and market sentiment..."
                response['action'] = 'start_analysis'
                response['data'] = {'symbols': symbols, 'type': 'comprehensive'}
            else:
                response['text'] = "🔬 I can perform detailed stock analysis! Which stocks would you like me to analyze? (e.g., 'Analyze TSLA and AAPL')"

        elif intent == 'watchlist':
            symbols = entities.get('symbols', [])

            # More specific pattern matching for watchlist operations
            if 'add' in original_message or 'to watchlist' in original_message or 'to my watchlist' in original_message:
                if symbols:
                    response['text'] = f"👁️ Adding {', '.join(symbols)} to your watchlist for monitoring..."
                    response['action'] = 'add_to_watchlist'
                    response['data'] = {'symbols': symbols, 'reason': 'User requested via chat'}
                else:
                    response['text'] = "📝 Which stocks would you like me to add to your watchlist?"
            elif 'remove' in original_message or 'delete' in original_message:
                if symbols:
                    response['text'] = f"🗑️ Removing {', '.join(symbols)} from your watchlist..."
                    response['action'] = 'remove_from_watchlist'
                    response['data'] = {'symbols': symbols}
                else:
                    response['text'] = "Which stocks would you like me to remove from your watchlist?"
            elif ('show' in original_message or 'list' in original_message or
                  'what stocks' in original_message or 'on my watchlist' in original_message):
                response['text'] = "📋 Fetching your current watchlist..."
                response['action'] = 'show_watchlist'
            else:
                # Default to showing watchlist if unclear
                response['text'] = "📋 Fetching your current watchlist..."
                response['action'] = 'show_watchlist'

        elif intent == 'buy_sell':
            symbols = entities.get('symbols', [])
            if any(word in original_message for word in ['buy', 'purchase']):
                if symbols:
                    response['text'] = f"💼 I can help you evaluate buying {', '.join(symbols)}. Let me check current market conditions and provide recommendations..."
                    response['action'] = 'evaluate_buy'
                    response['data'] = {'symbols': symbols}
                else:
                    response['text'] = "💰 Which stocks are you considering buying? I can analyze them for you."
            elif any(word in original_message for word in ['sell']):
                if symbols:
                    response['text'] = f"📈 Analyzing sell opportunities for {', '.join(symbols)}..."
                    response['action'] = 'evaluate_sell'
                    response['data'] = {'symbols': symbols}
                else:
                    response['text'] = "📊 Which positions are you considering selling? I can help evaluate the timing."
            else:
                response['text'] = "💼 I can help you with trading decisions! Are you looking to buy or sell specific stocks?"

        elif intent == 'portfolio':
            response['text'] = "💼 Fetching your current portfolio performance and positions..."
            response['action'] = 'show_portfolio'

        elif intent == 'market_status':
            response['text'] = "🕐 Checking current market status and trading hours..."
            response['action'] = 'check_market_status'

        elif intent == 'help':
            response['text'] = self.get_help_text()

        else:  # general
            response['text'] = f"🤔 I understand you're asking about: '{original_message}'. I can help with stock prices, analysis, watchlists, portfolio management, and trading decisions. Could you be more specific about what you'd like to know?"

        return response

    def get_help_text(self) -> str:
        """Return comprehensive help text"""
        return """🤖 **Trading Assistant Commands & Capabilities:**

**📊 Stock Information:**
• "What's the price of AAPL?" - Get current stock prices
• "Analyze TSLA" - Comprehensive stock analysis
• "Research Microsoft" - Detailed company research

**📋 Watchlist Management:**
• "Add AAPL to watchlist" - Monitor stocks
• "Remove TSLA from watchlist" - Stop monitoring
• "Show my watchlist" - View current watchlist

**💼 Trading & Portfolio:**
• "Should I buy NVDA?" - Get buy recommendations
• "Evaluate selling AAPL" - Sell timing analysis
• "Show my portfolio" - Current positions & performance

**🕐 Market Information:**
• "Is the market open?" - Market hours & status
• "Market status" - Current trading session

**💡 Tips:**
• You can mention multiple stocks: "Compare AAPL and GOOGL"
• Ask conversational questions: "What do you think about Tesla?"
• I'll remember our conversation context for follow-ups

Just type naturally - I understand conversational language!"""

    def get_conversation_summary(self) -> Dict[str, Any]:
        """Get summary of recent conversation"""
        recent_messages = self.conversation_history[-10:]  # Last 10 messages

        return {
            'total_messages': len(self.conversation_history),
            'recent_messages': recent_messages,
            'context': self.context
        }

    def clear_conversation(self):
        """Clear conversation history"""
        self.conversation_history = []
        self.context = {
            'current_symbols': [],
            'last_query_time': None,
            'user_preferences': {}
        }

# Example usage and testing
if __name__ == "__main__":
    chat_agent = ChatAgent()

    # Test various message types
    test_messages = [
        "Hello there!",
        "What's the price of AAPL?",
        "Analyze TSLA and NVDA",
        "Add MSFT to my watchlist",
        "Should I buy Google stock?",
        "Show my portfolio",
        "Is the market open?",
        "Help me understand what you can do"
    ]

    print("🤖 Chat Agent Test Results:")
    print("=" * 50)

    for message in test_messages:
        print(f"\n👤 User: {message}")
        response = chat_agent.process_message(message)
        print(f"🤖 Assistant: {response['text']}")
        if response['action']:
            print(f"🔧 Action: {response['action']}")
            if response['data']:
                print(f"📊 Data: {response['data']}")
