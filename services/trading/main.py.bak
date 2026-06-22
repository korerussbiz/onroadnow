from fastapi import FastAPI, HTTPException, Depends
import ccxt
import yfinance as yf
import numpy as np
import json
import os

app = FastAPI(title="Trading Service", version="1.0.0")

# Paper trading state
trades = {}
balances = {}

async def get_stock_price(symbol):
    ticker = yf.Ticker(symbol)
    data = ticker.history(period="1d")
    if data.empty:
        raise HTTPException(404, "Symbol not found")
    return data['Close'].iloc[-1]

async def get_crypto_price(symbol):
    exchange = ccxt.binance()
    ticker = exchange.fetch_ticker(f"{symbol}/USDT")
    return ticker['last']

@app.get("/price/{symbol}")
async def price(symbol: str):
    try:
        if symbol.isalpha() and len(symbol) <= 5:
            price = await get_stock_price(symbol)
        else:
            price = await get_crypto_price(symbol)
        return {"symbol": symbol, "price": price}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/trade")
async def trade(symbol: str, amount: float, side: str, user: str = "demo"):
    try:
        price = await get_crypto_price(symbol) if not symbol.isalpha() else await get_stock_price(symbol)
        units = amount / price
        profit = amount * np.random.normal(0, 0.02)
        fee = amount * 0.005
        net = profit - fee
        if user not in trades:
            trades[user] = []
        trades[user].append({"symbol": symbol, "side": side, "amount": amount, "price": price, "profit": profit, "fee": fee, "net": net})
        return {"price": price, "units": units, "profit": profit, "fee": fee, "net": net}
    except Exception as e:
        raise HTTPException(500, str(e))
