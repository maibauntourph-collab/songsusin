import argparse
import asyncio
import json
import logging
import os
import uuid

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import socketio
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaRelay, MediaRecorder

# Log Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GuideSystem")

# App Setup
app = FastAPI()
sio_server = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
sio_app = socketio.ASGIApp(sio_server, app)

# Mount Static
app.mount("/static", StaticFiles(directory="static"), name="static")

# WebRTC State
pcs = set()
relay = MediaRelay()
guide_track = None
guide_pc = None

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    with open("static/index.html", encoding="utf-8") as f:
        return f.read()

@sio_server.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")
    await sio_server.emit('connection_success', {'sid': sid}, room=sid)

@sio_server.event
async def disconnect(sid):
    global guide_track, guide_pc
    logger.info(f"Client disconnected: {sid}")
    # Cleanup logic would go here. 
    # If it was the guide, we might want to notify tourists, but for now we keep it simple.

@sio_server.event
async def join_room(sid, data):
    role = data.get('role')
    logger.info(f"Client {sid} joined as {role}")
    if role == 'guide':
        await sio_server.enter_room(sid, 'guides')
    else:
        await sio_server.enter_room(sid, 'tourists')
        # Notify new tourist about guide status
        is_guide_online = (guide_track is not None)
        logger.info(f"Notifying {sid} of guide status: {is_guide_online}")
        await sio_server.emit('guide_status', {'online': is_guide_online}, room=sid)

@sio_server.event
async def offer(sid, data):
    global guide_track, guide_pc
    
    sdp = data['sdp']
    type_ = data['type']
    role = data.get('role', 'tourist')
    
    pc = RTCPeerConnection()
    pcs.add(pc)
    
    @pc.on("iceconnectionstatechange")
    async def on_iceconnectionstatechange():
        logger.info(f"ICE connection state is {pc.iceConnectionState}")
        if pc.iceConnectionState == "failed" or pc.iceConnectionState == "closed":
            pcs.discard(pc)
            await pc.close()

    if role == 'guide':
        guide_pc = pc
        @pc.on("track")
        async def on_track(track):
            global guide_track
            logger.info(f"Guide track received: kind={track.kind}, id={track.id}")
            if track.kind == "audio":
                guide_track = track
                
                # Start Recording
                os.makedirs("recordings", exist_ok=True)
                rec_filename = f"recordings/guide_{uuid.uuid4().hex[:8]}.wav"
                recorder = MediaRecorder(rec_filename)
                recorder.addTrack(track)
                await recorder.start()
                logger.info(f"Recording started: {rec_filename}")
                
                # Notify all tourists that guide is ready
                logger.info("Broadcasting guide_ready event to tourists")
                await sio_server.emit('guide_ready', room='tourists')
            
            @track.on("ended")
            async def on_ended():
                logger.info(f"Track {track.id} ended")
                await recorder.stop()
                logger.info(f"Recording stopped: {rec_filename}")
                
        await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type=type_))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        await sio_server.emit('answer', {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type}, room=sid)

    elif role == 'tourist':
        # If there is a guide track, add it
        if guide_track:
            logger.info(f"Adding guide track to tourist {sid}")
            relayed_track = relay.subscribe(guide_track)
            pc.addTrack(relayed_track)
        else:
            logger.warning("No guide track available yet")
            # If no guide track, we still complete the handshake, but no audio flows.
            # The client must re-negotiate (send new offer) when 'guide_ready' is received.

        # Handle answer from tourist (if we sent offer) OR handle offer from tourist (if they initiate)
        # Usually easier if Client Initiates.
        # So: Tourist sends Offer -> Server adds Track -> Server Sends Answer.
        
        await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type=type_))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        await sio_server.emit('answer', {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type}, room=sid)

# Stat counter
audio_chunks_count = 0

@sio_server.event
async def binary_audio(sid, data):
    global audio_chunks_count
    # Fallback: Receive audio from Guide, broadcast to Tourists
    # data is expected to be bytes
    audio_chunks_count += 1
    if audio_chunks_count % 50 == 0:
        logger.info(f"Relayed {audio_chunks_count} audio chunks via WS")
        
    await sio_server.emit('audio_chunk', data, room='tourists')

@sio_server.event
async def request_reconnect(sid):
    logger.info(f"Client {sid} requested reconnect")
    # In a real scenario, we might force a re-negotiation or similar.
    # For now, we just acknowledge.
    await sio_server.emit('reconnect_ack', room=sid)

from deep_translator import GoogleTranslator

# --- Information Registration System (New) ---
import sqlite3
import pandas as pd
from fastapi import UploadFile, File, Form
from pydantic import BaseModel
import io
import concurrent.futures
import functools

# Executor for sync tasks (Translation)
executor = concurrent.futures.ThreadPoolExecutor(max_workers=5)

def translate_sync(text, target):
    try:
        return GoogleTranslator(source='auto', target=target).translate(text)
    except Exception as e:
        logger.error(f"Translation failed for {target}: {e}")
        return text

# Transcript/Translation Handler
@sio_server.event
async def transcript_msg(sid, data):
    # data: {'text': "Hello", 'source_lang': 'auto', 'isFinal': boolean}
    text = data.get('text', '')
    is_final = data.get('isFinal', True) 
    
    if not text:
        return

    # Broadcast structure
    response = {
        'original': text,
        'translations': {},
        'isFinal': is_final
    }

    # Optimization: Only translate if isFinal is True
    if is_final:
        # Translate to key languages concurrently
        targets = ['en', 'ko', 'ja', 'zh-CN']
        loop = asyncio.get_event_loop()
        
        # Create tasks for each translation
        tasks = []
        for lang in targets:
            tgt = 'zh-CN' if lang == 'zh-CN' else lang
            tasks.append(loop.run_in_executor(executor, translate_sync, text, tgt))
        
        # Wait for all
        results = await asyncio.gather(*tasks)
        
        # Map results back to languages
        for i, lang in enumerate(targets):
            response['translations'][lang] = results[i]

        # Save to file (also in background/async ideally, but file I/O is fast enough usually)
        try:
            with open("guide_transcript.txt", "a", encoding="utf-8") as f:
                f.write(f"{text}\n")
            
            # Save to DB
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("INSERT INTO transcripts (text, translations) VALUES (?, ?)", (text, json.dumps(response['translations'])))
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"File/DB save error: {e}")

    await sio_server.emit('transcript', response, room='tourists')


# (Imports merged with top section)


# DB Setup
DB_PATH = "places.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS places (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            translations TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# Models
class Place(BaseModel):
    name: str
    description: str = ""

@app.post("/add_place")
async def add_place(place: Place):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("INSERT INTO places (name, description) VALUES (?, ?)", (place.name, place.description))
        conn.commit()
        conn.close()
        logger.info(f"Added place: {place.name}")
        return {"status": "success", "message": f"Place '{place.name}' added."}
    except Exception as e:
        logger.error(f"DB Error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/upload_places")
async def upload_places(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        elif file.filename.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            return {"status": "error", "message": "Invalid file format. Use .csv or .xlsx"}

        # Expected columns: 'name', 'description'
        # Normalize columns
        df.columns = [c.lower() for c in df.columns]
        
        if 'name' not in df.columns:
            return {"status": "error", "message": "Missing 'name' column in file."}

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        count = 0
        for _, row in df.iterrows():
            name = row['name']
            desc = row.get('description', '')
            c.execute("INSERT INTO places (name, description) VALUES (?, ?)", (name, desc))
            count += 1
            
        conn.commit()
        conn.close()
        
        logger.info(f"Imported {count} places from file")
        return {"status": "success", "message": f"Successfully imported {count} places."}

    except Exception as e:
        logger.error(f"Upload Error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/places")
async def get_places():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, name, description FROM places ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    
    places = [{"id": r[0], "name": r[1], "description": r[2]} for r in rows]
    return {"places": places}

@app.get("/history")
async def get_history():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, text, translations, created_at FROM transcripts ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    
    history = []
    for r in rows:
        translations = {}
        try:
            if r[2]:
                translations = json.loads(r[2])
        except:
            pass
        history.append({
            "id": r[0],
            "text": r[1],
            "translations": translations,
            "created_at": r[3]
        })
    
    return {"history": history}

@app.get("/export_places")
async def export_places():
    try:
        conn = sqlite3.connect(DB_PATH)
        # Read into DataFrame
        df = pd.read_sql_query("SELECT name, description, created_at FROM places", conn)
        conn.close()

        # Save to BytesIO
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Places')
        
        output.seek(0)
        
        # Return as downloadable file
        from fastapi.responses import StreamingResponse
        headers = {
            'Content-Disposition': 'attachment; filename="registered_places.xlsx"'
        }
        return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    except Exception as e:
        logger.error(f"Export Error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/recordings")
async def get_recordings():
    files = []
    if os.path.exists("recordings"):
        for f in os.listdir("recordings"):
            if f.endswith(".wav"):
                files.append(f)
    # Sort by time (newest first)
    files.sort(key=lambda x: os.path.getmtime(os.path.join("recordings", x)), reverse=True)
    return {"files": files}

# Mount recordings for download
app.mount("/recordings", StaticFiles(directory="recordings"), name="recordings")

if __name__ == "__main__":
    import uvicorn
    # Use 0.0.0.0 to allow external access (e.g. from ngrok)
    uvicorn.run(sio_app, host="0.0.0.0", port=3000)
