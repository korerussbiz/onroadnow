from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
import httpx
import os

app = FastAPI(title="Sovereign Gateway", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

SERVICES = {
    "auth": os.getenv("AUTH_SERVICE_URL", "http://auth:8001"),
    "trading": os.getenv("TRADING_SERVICE_URL", "http://trading:8002"),
    "mining": os.getenv("MINING_SERVICE_URL", "http://mining:8003"),
    "user": os.getenv("USER_SERVICE_URL", "http://user:8004"),
}

async def proxy_request(service: str, path: str, method: str, body: dict = None, token: str = None):
    url = f"{SERVICES[service]}/{path}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient() as client:
        if method == "GET":
            resp = await client.get(url, headers=headers)
        elif method == "POST":
            resp = await client.post(url, json=body, headers=headers)
        elif method == "PUT":
            resp = await client.put(url, json=body, headers=headers)
        elif method == "DELETE":
            resp = await client.delete(url, headers=headers)
        else:
            raise HTTPException(400, "Method not allowed")
        return resp.json(), resp.status_code

@app.get("/")
async def root():
    return {"status": "Sovereign Gateway Online"}

# Health check endpoint
@app.get("/health")
async def health():
    return {"status": "ok"}

# Proxy routes
@app.api_route("/{service}/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def route_proxy(service: str, path: str, request: Request, token: str = Depends(oauth2_scheme)):
    if service not in SERVICES:
        raise HTTPException(404, "Service not found")
    body = await request.json() if request.method in ["POST", "PUT"] else None
    result, status = await proxy_request(service, path, request.method, body, token)
    return JSONResponse(content=result, status_code=status)
