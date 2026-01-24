"""
Additional routes for autonomous trading integration
Add these to your web_app.py
"""

@app.route('/api/emergency_stop', methods=['POST'])
def api_emergency_stop():
    """Emergency stop - close all positions and stop autonomous agent"""
    try:
        result = emergency_stop_autonomous()
        if result['status'] == 'success':
            return jsonify({
                'status': 'emergency_stopped',
                'message': 'Emergency stop executed - all positions closed'
            })
        else:
            return jsonify({'error': result['message']}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/autonomous_status')
def api_autonomous_status():
    """Get autonomous agent status"""
    try:
        status = autonomous_agent.get_agent_status()
        return jsonify(status)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/autonomous_performance')
def api_autonomous_performance():
    """Get autonomous agent performance metrics"""
    try:
        metrics = autonomous_agent.get_performance_metrics()
        return jsonify(metrics)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading_mode', methods=['POST'])
def api_set_trading_mode():
    """Set trading mode (autonomous vs assisted)"""
    try:
        data = request.get_json()
        mode = data.get('mode', 'autonomous')

        # Store in session for future requests
        session['trading_mode'] = mode

        return jsonify({
            'status': 'success',
            'mode': mode,
            'message': f'Trading mode set to {mode}'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
