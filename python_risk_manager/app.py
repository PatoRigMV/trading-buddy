# app.py
from flask import Flask, request, jsonify
from options_risk_manager import (
    call_itm_prob, approve_options_trade, Playbook, Contract, Quote
)

app = Flask(__name__)

@app.route('/prob/call_itm', methods=['POST'])
def prob_call_itm():
    j = request.get_json(force=True)
    p = call_itm_prob(j['S'], j['K'], j['DTE'], j['iv'], j.get('r', 0.0), j.get('q', 0.0))
    return jsonify({'prob': p})

@app.route('/approve', methods=['POST'])
def approve():
    j = request.get_json(force=True)
    # Expect: { "args": {...}, "playbook": {...} }
    pb = Playbook(**j['playbook'])
    # Coerce objects
    args = j['args']
    args['contract'] = Contract(**args['contract'])
    args['quote'] = Quote(**args['quote'])
    ok, reasons = approve_options_trade(args, pb)
    return jsonify({'approved': ok, 'reasons': reasons})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5055, debug=True)
