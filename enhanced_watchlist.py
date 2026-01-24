"""
Enhanced Watchlist Manager for Python Flask App
Integrates with the TypeScript agent's watchlist system
"""

import sqlite3
import json
import time
import random
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any, Tuple

class AgentNaming:
    """Agent naming system mirroring the TypeScript implementation"""

    AGENT_NAMES = [
        # Trading Legends
        {"name": "Investing Agent", "emoji": "", "specialty": "Value Investing", "personality": "Patient and analytical"},
        {"name": "Deep Value Agent", "emoji": "", "specialty": "Deep Value", "personality": "Methodical and thorough"},
        {"name": "Growth Agent", "emoji": "", "specialty": "Growth Investing", "personality": "Aggressive and opportunistic"},
        {"name": "Ray", "emoji": "", "specialty": "Market Cycles", "personality": "Strategic and macro-focused"},
        {"name": "Jesse", "emoji": "", "specialty": "Momentum Trading", "personality": "Quick and intuitive"},

        # Modern Traders
        {"name": "Algorithmic Agent", "emoji": "", "specialty": "Algorithmic Trading", "personality": "Precise and systematic"},
        {"name": "Sigma", "emoji": "", "specialty": "Statistical Arbitrage", "personality": "Data-driven and logical"},
        {"name": "Delta", "emoji": "", "specialty": "Options Trading", "personality": "Risk-aware and adaptive"},
        {"name": "Gamma", "emoji": "", "specialty": "Portfolio Balancing", "personality": "Balanced and diversified"},
        {"name": "Theta", "emoji": "", "specialty": "Time Decay", "personality": "Patient and time-conscious"},

        # Market Personalities
        {"name": "Bull", "emoji": "", "specialty": "Long Positions", "personality": "Optimistic and aggressive"},
        {"name": "Bear", "emoji": "", "specialty": "Short Positions", "personality": "Cautious and contrarian"},
        {"name": "Eagle", "emoji": "", "specialty": "Market Overview", "personality": "Sharp-eyed and strategic"},
        {"name": "Wolf", "emoji": "", "specialty": "Pack Hunting", "personality": "Social and coordinated"},
        {"name": "Shark", "emoji": "", "specialty": "Predatory Trading", "personality": "Ruthless and efficient"},

        # Technical Traders
        {"name": "Fibonacci", "emoji": "", "specialty": "Technical Analysis", "personality": "Pattern-focused and mathematical"},
        {"name": "Bollinger", "emoji": "", "specialty": "Volatility Trading", "personality": "Band-focused and adaptive"},
        {"name": "Stochastic", "emoji": "", "specialty": "Oscillator Trading", "personality": "Rhythm-focused and cyclical"},
        {"name": "MACD", "emoji": "", "specialty": "Trend Following", "personality": "Signal-focused and reactive"},
        {"name": "RSI", "emoji": "", "specialty": "Momentum Analysis", "personality": "Boundary-focused and precise"},

        # Creative Names
        {"name": "Nova", "emoji": "", "specialty": "Breakout Trading", "personality": "Explosive and opportunistic"},
        {"name": "Vortex", "emoji": "", "specialty": "Volatility Surfing", "personality": "Dynamic and adaptive"},
        {"name": "Phoenix", "emoji": "", "specialty": "Recovery Plays", "personality": "Resilient and transformative"},
        {"name": "Quantum", "emoji": "", "specialty": "Multi-dimensional Analysis", "personality": "Complex and innovative"},
        {"name": "Nexus", "emoji": "", "specialty": "Market Connections", "personality": "Networked and insightful"}
    ]

    @classmethod
    def create_display_name(cls, submitter: str) -> str:
        """Create display name for agent submitter"""
        if submitter.startswith('agent-'):
            agent_name = submitter.replace('agent-', '')
            # Handle legacy agent names
            if agent_name.lower() == 'warren':
                return "Investing Agent"
            elif agent_name.lower() == 'alpha':
                return "Algorithmic Agent"
            elif agent_name.lower() == 'benjamin':
                return "Deep Value Agent"
            elif agent_name.lower() == 'peter':
                return "Growth Agent"
            # Find the agent by name (case insensitive)
            for agent in cls.AGENT_NAMES:
                if agent['name'].lower() == agent_name.lower():
                    return agent['name']
        elif submitter == 'user':
            return "User"
        elif submitter == 'system':
            return "System"
        elif submitter == 'chat_agent':
            return "Chat Terminal"

        return submitter

    @classmethod
    def get_agent_by_submitter(cls, submitter: str) -> Optional[Dict]:
        """Get agent info by submitter name"""
        if submitter.startswith('agent-'):
            agent_name = submitter.replace('agent-', '')
            for agent in cls.AGENT_NAMES:
                if agent['name'].lower() == agent_name.lower():
                    return agent
        return None

class EnhancedWatchlistManager:
    """Python equivalent of the TypeScript WatchlistManager"""

    def __init__(self, db_path: str = "trading-agent/prisma/trading-agent.db"):
        self.db_path = db_path

    def get_connection(self):
        """Get database connection"""
        return sqlite3.connect(self.db_path)

    def get_watchlist_entries(self,
                            submitter_type: Optional[str] = None,
                            entry_type: Optional[str] = None,
                            status: str = 'active',
                            min_confidence: Optional[float] = None,
                            limit: int = 50) -> List[Dict]:
        """Get watchlist entries with filters"""

        conn = self.get_connection()
        cursor = conn.cursor()

        # Build query with filters
        where_clauses = ["status = ?"]
        params = [status]

        if submitter_type:
            where_clauses.append("submitterType = ?")
            params.append(submitter_type)

        if entry_type:
            where_clauses.append("entryType = ?")
            params.append(entry_type)

        if min_confidence:
            where_clauses.append("confidence >= ?")
            params.append(min_confidence)

        where_clause = " AND ".join(where_clauses)

        query = f"""
        SELECT id, symbol, submitter, submitterType, reason, entryType,
               targetEntry, currentPrice, confidence, signals, reEngagementScore,
               priority, status, notes, expiresAt, createdAt, updatedAt
        FROM watchlist_entries
        WHERE {where_clause}
        ORDER BY priority DESC, createdAt DESC
        LIMIT ?
        """

        params.append(limit)

        try:
            cursor.execute(query, params)
            rows = cursor.fetchall()

            # Convert to dictionaries with enhanced display
            entries = []
            for row in rows:
                entry = {
                    'id': row[0],
                    'symbol': row[1],
                    'submitter': row[2],
                    'submitterType': row[3],
                    'reason': row[4],
                    'entryType': row[5],
                    'targetEntry': row[6],
                    'currentPrice': row[7],
                    'confidence': row[8],
                    'signals': json.loads(row[9]) if row[9] else None,
                    'reEngagementScore': row[10],
                    'priority': row[11],
                    'status': row[12],
                    'notes': row[13],
                    'expiresAt': row[14],
                    'createdAt': row[15],
                    'updatedAt': row[16],
                    'submitterDisplayName': AgentNaming.create_display_name(row[2]),
                    'agentInfo': AgentNaming.get_agent_by_submitter(row[2])
                }
                entries.append(entry)

            return entries

        except sqlite3.Error as e:
            print(f"Database error: {e}")
            return []
        finally:
            conn.close()

    def add_watchlist_entry(self,
                          symbol: str,
                          reason: str,
                          entry_type: str,
                          submitter: str = 'user',
                          submitter_type: str = 'user',
                          target_entry: Optional[float] = None,
                          current_price: Optional[float] = None,
                          confidence: Optional[float] = None,
                          signals: Optional[Dict] = None,
                          re_engagement_score: Optional[float] = None,
                          priority: Optional[int] = None,
                          notes: Optional[str] = None,
                          expires_at: Optional[str] = None) -> bool:
        """Add entry to watchlist"""

        conn = self.get_connection()
        cursor = conn.cursor()

        # Calculate priority if not provided
        if priority is None and confidence:
            priority = int(confidence * 100)
            if entry_type == 're_engagement':
                priority += 20
            elif entry_type == 'technical_breakout':
                priority += 15

        # Generate ID
        entry_id = f"clwl_{int(time.time())}_{random.randint(1000, 9999)}"

        try:
            # Upsert logic - update if exists, insert if not
            cursor.execute("""
                INSERT OR REPLACE INTO watchlist_entries
                (id, symbol, submitter, submitterType, reason, entryType,
                 targetEntry, currentPrice, confidence, signals, reEngagementScore,
                 priority, status, notes, expiresAt, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry_id, symbol, submitter, submitter_type, reason, entry_type,
                target_entry, current_price, confidence,
                json.dumps(signals) if signals else None,
                re_engagement_score, priority or 0, 'active', notes, expires_at,
                datetime.now().isoformat(), datetime.now().isoformat()
            ))

            conn.commit()
            return True

        except sqlite3.Error as e:
            print(f"Error adding watchlist entry: {e}")
            return False
        finally:
            conn.close()

    def remove_watchlist_entry(self, symbol: str, submitter: str) -> bool:
        """Remove entry from watchlist"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("""
                UPDATE watchlist_entries
                SET status = 'removed', updatedAt = ?
                WHERE symbol = ? AND submitter = ? AND status = 'active'
            """, (datetime.now().isoformat(), symbol, submitter))

            conn.commit()
            return cursor.rowcount > 0

        except sqlite3.Error as e:
            print(f"Error removing watchlist entry: {e}")
            return False
        finally:
            conn.close()

    def cleanup_expired_entries(self) -> int:
        """Clean up expired entries"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("""
                UPDATE watchlist_entries
                SET status = 'expired', updatedAt = ?
                WHERE expiresAt <= ? AND status = 'active'
            """, (datetime.now().isoformat(), datetime.now().isoformat()))

            conn.commit()
            return cursor.rowcount

        except sqlite3.Error as e:
            print(f"Error cleaning up expired entries: {e}")
            return 0
        finally:
            conn.close()

    def get_watchlist_summary(self) -> Dict:
        """Get summary statistics of watchlist"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # Get counts by submitter type
            cursor.execute("""
                SELECT submitterType, COUNT(*) as count
                FROM watchlist_entries
                WHERE status = 'active'
                GROUP BY submitterType
            """)
            submitter_counts = dict(cursor.fetchall())

            # Get counts by entry type
            cursor.execute("""
                SELECT entryType, COUNT(*) as count
                FROM watchlist_entries
                WHERE status = 'active'
                GROUP BY entryType
            """)
            entry_type_counts = dict(cursor.fetchall())

            # Get high confidence entries
            cursor.execute("""
                SELECT COUNT(*)
                FROM watchlist_entries
                WHERE status = 'active' AND confidence >= 0.7
            """)
            high_confidence_count = cursor.fetchone()[0]

            # Get re-engagement opportunities
            cursor.execute("""
                SELECT COUNT(*)
                FROM watchlist_entries
                WHERE status = 'active' AND entryType = 're_engagement'
            """)
            re_engagement_count = cursor.fetchone()[0]

            return {
                'total_active': sum(submitter_counts.values()),
                'by_submitter_type': submitter_counts,
                'by_entry_type': entry_type_counts,
                'high_confidence_count': high_confidence_count,
                're_engagement_count': re_engagement_count
            }

        except sqlite3.Error as e:
            print(f"Error getting watchlist summary: {e}")
            return {}
        finally:
            conn.close()
