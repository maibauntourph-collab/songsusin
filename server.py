import argparse
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import socketio
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaRelay, MediaRecorder
from openai import OpenAI

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

# Connected Users Tracking
connected_users = {}  # {sid: {'role': 'guide/tourist', 'language': 'en', 'connected_at': datetime, 'status': 'active'}}
guide_info = {'sid': None, 'broadcasting': False, 'started_at': None}

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
    global guide_track, guide_pc, guide_info
    logger.info(f"Client disconnected: {sid}")
    
    # Remove from connected users
    if sid in connected_users:
        user = connected_users.pop(sid)
        logger.info(f"Removed {user['role']} from tracking")
        
        # If guide disconnected, reset all guide state
        if user['role'] == 'guide':
            guide_track = None
            guide_pc = None
            guide_info = {'sid': None, 'broadcasting': False, 'started_at': None}
            logger.info("Guide disconnected - cleared guide_track and guide_info")
            await sio_server.emit('guide_status', {'online': False}, room='tourists')
        
        # Broadcast updated user count to monitors
        await broadcast_monitor_update()

@sio_server.event
async def join_room(sid, data):
    global guide_info
    role = data.get('role')
    language = data.get('language', 'en')
    logger.info(f"Client {sid} joined as {role} with language {language}")
    
    # Track user
    connected_users[sid] = {
        'role': role,
        'language': language,
        'connected_at': datetime.now().isoformat(),
        'status': 'active'
    }
    
    if role == 'guide':
        await sio_server.enter_room(sid, 'guides')
        guide_info['sid'] = sid
        guide_info['started_at'] = datetime.now().isoformat()
    elif role == 'monitor':
        await sio_server.enter_room(sid, 'monitors')
    else:
        await sio_server.enter_room(sid, 'tourists')
        # Notify new tourist about guide status (based on guide_info, not guide_track)
        is_guide_online = (guide_info['sid'] is not None)
        is_broadcasting = guide_info.get('broadcasting', False)
        logger.info(f"Notifying {sid} of guide status: online={is_guide_online}, broadcasting={is_broadcasting}")
        await sio_server.emit('guide_status', {'online': is_guide_online, 'broadcasting': is_broadcasting}, room=sid)
    
    # Broadcast updated user count to monitors
    await broadcast_monitor_update()

@sio_server.event
async def update_language(sid, data):
    """Update tourist's selected language"""
    language = data.get('language', 'en')
    if sid in connected_users:
        connected_users[sid]['language'] = language
        logger.info(f"Client {sid} changed language to {language}")
        await broadcast_monitor_update()

async def broadcast_monitor_update():
    """Send real-time updates to all monitor clients"""
    stats = get_connection_stats()
    await sio_server.emit('monitor_update', stats, room='monitors')

def get_connection_stats():
    """Get current connection statistics"""
    tourists = {sid: info for sid, info in connected_users.items() if info['role'] == 'tourist'}
    guides = {sid: info for sid, info in connected_users.items() if info['role'] == 'guide'}
    
    # Count by language
    lang_counts = {}
    for sid, info in tourists.items():
        lang = info.get('language', 'en')
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
    
    return {
        'guide_online': len(guides) > 0,
        'guide_broadcasting': guide_info.get('broadcasting', False),
        'guide_started_at': guide_info.get('started_at'),
        'total_tourists': len(tourists),
        'tourists_by_language': lang_counts,
        'tourist_list': [{'sid': sid[:8], 'language': info['language'], 'connected_at': info['connected_at']} for sid, info in tourists.items()],
        'timestamp': datetime.now().isoformat()
    }

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

# Stat counter and audio init segment cache
audio_chunks_count = 0
audio_init_segment = None
audio_session_active = False

@sio_server.event
async def binary_audio(sid, data):
    global audio_chunks_count, audio_init_segment, audio_session_active
    
    audio_chunks_count += 1
    
    if audio_chunks_count == 1:
        audio_init_segment = data
        audio_session_active = True
        logger.info("Cached audio initialization segment")
    
    if audio_chunks_count % 50 == 0:
        logger.info(f"Relayed {audio_chunks_count} audio chunks via WS")
        
    await sio_server.emit('audio_chunk', data, room='tourists')

@sio_server.event
async def reset_audio_session(sid):
    global audio_chunks_count, audio_init_segment, audio_session_active, guide_info
    audio_chunks_count = 0
    audio_init_segment = None
    audio_session_active = False
    guide_info['broadcasting'] = True
    logger.info("Audio session reset - Guide started broadcasting")
    await broadcast_monitor_update()

@sio_server.event
async def stop_broadcast(sid):
    global guide_info, guide_track
    guide_info['broadcasting'] = False
    guide_track = None
    logger.info("Guide stopped broadcasting")
    await sio_server.emit('guide_status', {'online': True, 'broadcasting': False}, room='tourists')
    await broadcast_monitor_update()

@sio_server.event
async def start_broadcast(sid):
    global guide_info
    guide_info['broadcasting'] = True
    guide_info['started_at'] = datetime.now().isoformat()
    logger.info("Guide started broadcasting")
    await sio_server.emit('guide_status', {'online': True, 'broadcasting': True}, room='tourists')
    await broadcast_monitor_update()

@sio_server.event
async def request_audio_init(sid):
    global audio_init_segment
    if audio_init_segment:
        logger.info(f"Sending init segment to {sid}")
        await sio_server.emit('audio_init', audio_init_segment, room=sid)

@sio_server.event
async def request_reconnect(sid):
    logger.info(f"Client {sid} requested reconnect")
    # In a real scenario, we might force a re-negotiation or similar.
    # For now, we just acknowledge.
    await sio_server.emit('reconnect_ack', room=sid)

from deep_translator import GoogleTranslator

# --- Information Registration System (New) ---
import sqlite3
try:
    import pandas as pd
except ImportError:
    pd = None
    logger.warning("Pandas not found. Excel/CSV features will be disabled.")

from fastapi import UploadFile, File, Form
from pydantic import BaseModel
import io
import concurrent.futures
import functools

# Executor for sync tasks (Translation)
# Increased workers to handle 100 concurrent translations comfortably
executor = concurrent.futures.ThreadPoolExecutor(max_workers=50)

def translate_sync(text, target):
    try:
        return GoogleTranslator(source='auto', target=target).translate(text)
    except Exception as e:
        logger.error(f"Translation failed for {target}: {e}")
        return text

# Transcript/Translation Handler
@sio_server.event
async def transcript_msg(sid, data):
    text = data.get('text', '')
    is_final = data.get('isFinal', True) 
    
    if not text:
        return

    response = {
        'original': text,
        'translations': {},
        'isFinal': is_final
    }

    if is_final:
        # Full list of supported languages (approx 100+)
        targets = [
            'af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs', 
            'bg', 'ca', 'ceb', 'ny', 'zh-CN', 'zh-TW', 'co', 'hr', 'cs', 'da', 
            'nl', 'en', 'eo', 'et', 'tl', 'fi', 'fr', 'fy', 'gl', 'ka', 
            'de', 'el', 'gu', 'ht', 'ha', 'haw', 'iw', 'hi', 'hmn', 'hu', 
            'is', 'ig', 'id', 'ga', 'it', 'ja', 'jw', 'kn', 'kk', 'km', 
            'ko', 'ku', 'ky', 'lo', 'la', 'lv', 'lt', 'lb', 'mk', 'mg', 
            'ms', 'ml', 'mt', 'mi', 'mr', 'mn', 'my', 'ne', 'no', 'ps', 
            'fa', 'pl', 'pt', 'pa', 'ro', 'ru', 'sm', 'gd', 'sr', 'st', 
            'sn', 'sd', 'si', 'sk', 'sl', 'so', 'es', 'su', 'sw', 'sv', 
            'tg', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'cy', 
            'xh', 'yi', 'yo', 'zu'
        ]
        loop = asyncio.get_event_loop()
        
        tasks = []
        for lang in targets:
            tgt = 'zh-CN' if lang == 'zh-CN' else lang
            tasks.append(loop.run_in_executor(executor, translate_sync, text, tgt))
        
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, lang in enumerate(targets):
                if isinstance(results[i], Exception):
                    response['translations'][lang] = text
                    logger.error(f"Translation error for {lang}: {results[i]}")
                else:
                    response['translations'][lang] = results[i] or text
        except Exception as e:
            logger.error(f"Translation gather error: {e}")
            for lang in targets:
                response['translations'][lang] = text

        try:
            with open("guide_transcript.txt", "a", encoding="utf-8") as f:
                f.write(f"{text}\n")
            
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("INSERT INTO transcripts (text, translations) VALUES (?, ?)", (text, json.dumps(response['translations'])))
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"File/DB save error: {e}")

    await sio_server.emit('transcript', response, room='tourists')
    await sio_server.emit('transcript', response, room='guides')


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
        if pd is None:
            return {"status": "error", "message": "Pandas library not installed on server. Cannot process files."}
            
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

@app.post("/summarize")
async def summarize_session():
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT text FROM transcripts ORDER BY id ASC")
        rows = c.fetchall()
        conn.close()
        
        if not rows:
            return {"status": "error", "message": "No transcripts to summarize"}
        
        all_text = "\n".join([r[0] for r in rows])
        
        if len(all_text) < 50:
            return {"status": "error", "message": "Not enough content to summarize"}
        
        client = OpenAI(
            api_key=os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY"),
            base_url=os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
        )
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that summarizes tour guide sessions. Provide a clear, concise summary of the key points discussed. Output in Korean if the content is primarily Korean, otherwise match the main language."},
                {"role": "user", "content": f"Please summarize this tour guide session transcript:\n\n{all_text[:8000]}"}
            ],
            max_tokens=1000
        )
        
        summary = response.choices[0].message.content
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        summary_file = f"session_summary_{timestamp}.txt"
        with open(summary_file, "w", encoding="utf-8") as f:
            f.write(f"Session Summary - {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
            f.write("=" * 50 + "\n\n")
            f.write(summary + "\n\n")
            f.write("=" * 50 + "\n")
            f.write("Full Transcript:\n\n")
            f.write(all_text)
        
        return {
            "status": "success",
            "summary": summary,
            "file": summary_file,
            "transcript_count": len(rows)
        }
        
    except Exception as e:
        logger.error(f"Summarization error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/download_transcript")
async def download_transcript():
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT text, translations, created_at FROM transcripts ORDER BY id ASC")
        rows = c.fetchall()
        conn.close()
        
        output = io.StringIO()
        output.write(f"Tour Guide Session Transcript\n")
        output.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        output.write("=" * 50 + "\n\n")
        
        for r in rows:
            output.write(f"[{r[2]}]\n")
            output.write(f"Original: {r[0]}\n")
            try:
                translations = json.loads(r[1]) if r[1] else {}
                for lang, text in translations.items():
                    output.write(f"{lang}: {text}\n")
            except:
                pass
            output.write("\n")
        
        content = output.getvalue()
        
        from fastapi.responses import Response
        return Response(
            content=content,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="transcript_{datetime.now().strftime("%Y%m%d_%H%M%S")}.txt"'}
        )
        
    except Exception as e:
        logger.error(f"Download error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/clear_session")
async def clear_session():
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM transcripts")
        conn.commit()
        conn.close()
        
        if os.path.exists("guide_transcript.txt"):
            os.remove("guide_transcript.txt")
        
        return {"status": "success", "message": "Session cleared"}
    except Exception as e:
        logger.error(f"Clear session error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/export_places")
async def export_places():
    try:
        if pd is None:
            return {"status": "error", "message": "Pandas library not installed. Cannot export."}
            
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

@app.get("/api/monitor")
async def get_monitor_stats():
    """API endpoint for monitoring dashboard"""
    return get_connection_stats()

@app.get("/monitor", response_class=HTMLResponse)
async def monitor_page(request: Request):
    """Monitoring dashboard page"""
    with open("static/monitor.html", encoding="utf-8") as f:
        return f.read()

# Ensure recordings directory exists before mounting
os.makedirs("recordings", exist_ok=True)

# Mount recordings for download
app.mount("/recordings", StaticFiles(directory="recordings"), name="recordings")

@app.post("/shutdown")
async def shutdown_server():
    logger.info("Shutdown requested")
    os.kill(os.getpid(), 9) # Force kill for immediate effect on Windows
    return {"status": "shutting_down"}

@app.post("/restart")
async def restart_server():
    logger.info("Restart requested")
    import sys
    # This replaces the current process with a new one
    os.execv(sys.executable, ['python'] + sys.argv)
    return {"status": "restarting"}

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*60)
    print("🚀 Mobile Guide Server Running on Port 5000")
    print("📊 Load Test Simulation: http://0.0.0.0:5000/static/simulation.html")
    print("="*60 + "\n")
    uvicorn.run(sio_app, host="0.0.0.0", port=5000)
