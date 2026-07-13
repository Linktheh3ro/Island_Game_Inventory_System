from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent

# Setup persistent data directories depending on frozen state
import sys
if getattr(sys, 'frozen', False):
    USER_DATA_DIR = Path(sys.executable).parent.resolve()
else:
    USER_DATA_DIR = ROOT_DIR.parent.resolve()

# Load from project root .env (parent) first, then fallback to backend .env
root_env = ROOT_DIR.parent / '.env'
backend_env = ROOT_DIR / '.env'

if root_env.exists():
    load_dotenv(root_env, override=True)
if backend_env.exists():
    load_dotenv(backend_env, override=True)

# Configure logging early
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_user = os.environ.get('MONGO_USER')
mongo_password = os.environ.get('MONGO_PASSWORD')

# Automatically replace placeholder credentials in the connection string
if mongo_user and mongo_password:
    if "<db_username>" in mongo_url:
        mongo_url = mongo_url.replace("<db_username>", mongo_user)
    if "<db_password>" in mongo_url:
        mongo_url = mongo_url.replace("<db_password>", mongo_password)

client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
db = client[os.environ.get('DB_NAME', 'charlock')]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {
        "message": "Hello World",
        "database": "MongoDB (Atlas)" if use_mongodb else "SQLite (Local Fallback)"
    }

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# Share endpoints for short share links/codes with MongoDB / SQLite dual-mode fallback
import random
import string
import json
import sqlite3

SQLITE_DB_FILE = USER_DATA_DIR / "shares.db"

def init_sqlite_db():
    conn = sqlite3.connect(str(SQLITE_DB_FILE))
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shares (
            id TEXT PRIMARY KEY,
            state TEXT NOT NULL,
            createdAt TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

init_sqlite_db()

# Track connection state
use_mongodb = False

async def check_mongodb():
    global use_mongodb
    try:
        await client.admin.command('ping')
        use_mongodb = True
        logger.info("Successfully connected to MongoDB. Using MongoDB for shares.")
    except Exception as e:
        use_mongodb = False
        logger.warning(f"MongoDB connection failed: {e}. Falling back to SQLite for shares.")

@app.on_event("startup")
async def startup_event():
    await check_mongodb()

def generate_short_id(length=6):
    chars = string.ascii_lowercase + string.digits
    return ''.join(random.choices(chars, k=length))

class ShareCreate(BaseModel):
    state: dict

@api_router.post("/shares")
async def create_share(input: ShareCreate):
    global use_mongodb
    
    # Try to reconnect dynamically if connection failed previously
    if not use_mongodb:
        await check_mongodb()
    
    if use_mongodb:
        try:
            for _ in range(15):
                share_id = generate_short_id()
                existing = await db.shares.find_one({"id": share_id})
                if not existing:
                    doc = {
                        "id": share_id,
                        "state": input.state,
                        "createdAt": datetime.now(timezone.utc).isoformat()
                    }
                    await db.shares.insert_one(doc)
                    return {"id": share_id, "is_fallback": False}
            raise HTTPException(status_code=500, detail="Failed to generate unique share ID")
        except Exception as e:
            logger.error(f"MongoDB write failed: {e}. Falling back to SQLite.")
            use_mongodb = False

    # SQLite backup
    state_json = json.dumps(input.state)
    conn = sqlite3.connect(str(SQLITE_DB_FILE))
    cursor = conn.cursor()
    for _ in range(15):
        share_id = generate_short_id()
        cursor.execute("SELECT 1 FROM shares WHERE id = ?", (share_id,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO shares (id, state, createdAt) VALUES (?, ?, ?)",
                (share_id, state_json, datetime.now(timezone.utc).isoformat())
            )
            conn.commit()
            conn.close()
            return {"id": share_id, "is_fallback": True}
    conn.close()
    raise HTTPException(status_code=500, detail="Failed to generate unique share ID")

@api_router.get("/shares/{share_id}")
async def get_share(share_id: str):
    global use_mongodb
    
    # Try to reconnect dynamically if connection failed previously
    if not use_mongodb:
        await check_mongodb()
    
    if use_mongodb:
        try:
            doc = await db.shares.find_one({"id": share_id}, {"_id": 0})
            if doc:
                return doc
        except Exception as e:
            logger.error(f"MongoDB read failed: {e}. Falling back to SQLite.")
            use_mongodb = False

    # SQLite backup
    conn = sqlite3.connect(str(SQLITE_DB_FILE))
    cursor = conn.cursor()
    cursor.execute("SELECT state FROM shares WHERE id = ?", (share_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Share code not found")
        
    state_dict = json.loads(row[0])
    return {"id": share_id, "state": state_dict}

# Setup saves directory
import re
SAVES_DIR = USER_DATA_DIR / "saves"
SAVES_DIR.mkdir(exist_ok=True)

class AutosaveCreate(BaseModel):
    state: dict

@api_router.post("/autosave")
def autosave_inventory(input: AutosaveCreate):
    try:
        state = input.state
        active_char_id = state.get("activeCharacterId")
        char_name = "Unknown_Character"
        if active_char_id and "characters" in state:
            char_obj = state["characters"].get(active_char_id)
            if char_obj and "name" in char_obj:
                char_name = char_obj["name"]
        
        # Clean character name for filename safety
        char_name_clean = re.sub(r'[^a-zA-Z0-9_-]', '_', char_name)
        char_name_clean = re.sub(r'_+', '_', char_name_clean).strip('_')
        if not char_name_clean:
            char_name_clean = "Unknown_Character"

        # Format date and time
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H-%M-%S")
        
        filename = f"autosave_{date_str}-{time_str}_{char_name_clean}.tti"
        filepath = SAVES_DIR / filename
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
            
        logger.info(f"Autosave created: {filename}")
        
        # Keep only the two most recent autosave files
        autosave_files = list(SAVES_DIR.glob("autosave_*.tti"))
        autosave_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        
        if len(autosave_files) > 2:
            for old_file in autosave_files[2:]:
                try:
                    old_file.unlink()
                    logger.info(f"Deleted old autosave: {old_file.name}")
                except Exception as e:
                    logger.error(f"Failed to delete old autosave {old_file.name}: {e}")
                    
        return {"ok": True, "filename": filename}
    except Exception as e:
        logger.error(f"Autosave failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ManualSaveCreate(BaseModel):
    state: dict

@api_router.post("/manual_save")
def manual_save_inventory(input: ManualSaveCreate):
    try:
        state = input.state
        active_char_id = state.get("activeCharacterId")
        char_name = "Unknown_Character"
        if active_char_id and "characters" in state:
            char_obj = state["characters"].get(active_char_id)
            if char_obj and "name" in char_obj:
                char_name = char_obj["name"]
        
        # Clean character name for filename safety
        char_name_clean = re.sub(r'[^a-zA-Z0-9_-]', '_', char_name)
        char_name_clean = re.sub(r'_+', '_', char_name_clean).strip('_')
        if not char_name_clean:
            char_name_clean = "Unknown_Character"

        # Format date and time
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H-%M-%S")
        
        filename = f"inventory_{date_str}-{time_str}_{char_name_clean}.tti"
        filepath = SAVES_DIR / filename
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
            
        logger.info(f"Manual save copy created: {filename}")

        # Keep only the four most recent manual save files
        manual_files = list(SAVES_DIR.glob("inventory_*.tti"))
        manual_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

        if len(manual_files) > 4:
            for old_file in manual_files[4:]:
                try:
                    old_file.unlink()
                    logger.info(f"Deleted old manual save: {old_file.name}")
                except Exception as e:
                    logger.error(f"Failed to delete old manual save {old_file.name}: {e}")

        return {"ok": True, "filename": filename}
    except Exception as e:
        logger.error(f"Manual save failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/load_latest")
def load_latest_save():
    try:
        save_files = list(SAVES_DIR.glob("*.tti"))
        if not save_files:
            return {"ok": False, "message": "No saves found"}
        # Find the most recently modified file
        latest_file = max(save_files, key=lambda x: x.stat().st_mtime)
        with open(latest_file, "r", encoding="utf-8") as f:
            state = json.load(f)
        return {"ok": True, "filename": latest_file.name, "state": state}
    except Exception as e:
        logger.error(f"Failed to load latest save: {e}")
        return {"ok": False, "message": str(e)}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static assets & catch-all index.html for client routing
if getattr(sys, 'frozen', False):
    frontend_build_dir = Path(sys._MEIPASS) / "frontend" / "build"
else:
    frontend_build_dir = USER_DATA_DIR / "frontend" / "build"

if frontend_build_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_build_dir / "static")), name="static")

    @app.get("/{rest_of_path:path}")
    async def serve_frontend(rest_of_path: str):
        if rest_of_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        
        file_path = frontend_build_dir / rest_of_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_build_dir / "index.html"))

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()