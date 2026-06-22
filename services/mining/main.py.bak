from fastapi import FastAPI, HTTPException, Depends
import subprocess
import os
import requests
import json

app = FastAPI(title="Mining Service", version="1.0.0")

WALLET = "9vXyKbMr85Yaus38RQnjLjfxPWbCJVESbTmRH6JCWVE2"
MINER_SCRIPT = os.getenv("MINER_SCRIPT", "~/start_miner.sh")

@app.get("/stats")
async def stats():
    try:
        resp = requests.get(f"https://supportxmr.com/api/miner/{WALLET}/stats")
        data = resp.json()
        return {
            "wallet": WALLET,
            "hashrate": data.get("hashrate", 0),
            "balance": data.get("amtDue", 0) / 1e12,
            "validShares": data.get("validShares", 0)
        }
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/start")
async def start_miner():
    try:
        subprocess.Popen([MINER_SCRIPT], shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"status": "started"}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/stop")
async def stop_miner():
    try:
        subprocess.run(["pkill", "-f", "xmrig"], check=False)
        return {"status": "stopped"}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/status")
async def status():
    try:
        result = subprocess.run(["pgrep", "-f", "xmrig"], capture_output=True)
        running = result.returncode == 0
        return {"running": running}
    except Exception as e:
        raise HTTPException(500, str(e))
