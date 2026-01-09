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
        # started_at should only be set when broadcast actually starts
    elif role == 'monitor':
        await sio_server.enter_room(sid, 'monitors')
    else:
        await sio_server.enter_room(sid, 'tourists')
        # Notify new tourist about guide status
        is_guide_online = (guide_info['sid'] is not None)
        is_broadcasting = guide_info.get('broadcasting', False)
        logger.info(f"Notifying {sid} of guide status: online={is_guide_online}, broadcasting={is_broadcasting}")
        await sio_server.emit('guide_status', {'online': is_guide_online, 'broadcasting': is_broadcasting}, room=sid)
    
    # BROADCAST STATUS TO ALL TOURISTS when ANYONE joins/changes
    is_guide_online = (guide_info['sid'] is not None)
    is_broadcasting = guide_info.get('broadcasting', False)
    logger.info(f"Broadcast guide_status to all: online={is_guide_online}, broadcasting={is_broadcasting}")
    await sio_server.emit('guide_status', {'online': is_guide_online, 'broadcasting': is_broadcasting}, room='tourists')
    
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
        rec_filename = f"recordings/guide_{uuid.uuid4().hex[:8]}.wav"
        recorder = MediaRecorder(rec_filename)
        @pc.on("track")
        async def on_track(track):
            global guide_track
            logger.info(f"Guide track received: kind={track.kind}, id={track.id}")
            if track.kind == "audio":
                guide_track = track
                
                # Start Recording
                os.makedirs("recordings", exist_ok=True)
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
async def request_guide_status(sid):
    is_guide_online = (guide_info['sid'] is not None)
    is_broadcasting = guide_info.get('broadcasting', False)
    logger.info(f"Manual status request from {sid}: online={is_guide_online}, broadcasting={is_broadcasting}")
    await sio_server.emit('guide_status', {'online': is_guide_online, 'broadcasting': is_broadcasting}, room=sid)

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

# Transcript/Translation Handler
@sio_server.event
async def transcript_msg(sid, data):
    # logger.info(f"[TRANSCRIPT] RAW data received from {sid}: {data}")
    
    text = data.get('text', '')
    is_final = data.get('isFinal', True) 
    source_lang = data.get('source_lang', 'ko')

    # Validate and clean text
    if text:
        text = str(text).strip()
    
    if not text:
        return

    # Create simplified response structure
    # Server NO LONGER translates. It just broadcasts the original.
    response = {
        'original': text,
        'source_lang': source_lang,
        'translations': {}, # Clients will fill this themselves found
        'isFinal': is_final
    }

    # Save to DB/File (Original Only)
    if is_final:
        try:
            with open("guide_transcript.txt", "a", encoding="utf-8") as f:
                f.write(f"{text}\n")
            
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            # We save empty translations JSON for compatibility
            c.execute("INSERT INTO transcripts (text, translations) VALUES (?, ?)", (text, "{}"))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"File/DB save error: {e}")

    # Broadcast to all
    await sio_server.emit('transcript', response, room='tourists')
    await sio_server.emit('transcript', response, room='guides')
    
    if is_final:
        logger.info(f"[TRANSCRIPT] Broadcasted: '{text[:20]}...' (No server-side translation)")


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
        filename = file.filename or "uploaded_file"
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        elif filename.endswith(('.xls', '.xlsx')):
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
        df.to_excel(output, index=False, sheet_name='Places', engine='openpyxl')
        
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
    python_exe = sys.executable or "python"
    os.execv(python_exe, [python_exe] + sys.argv)
    return {"status": "restarting"}

@app.get("/qr")
async def get_qr_image():
    """Returns the QR code of the server's mobile access URL as a PNG image"""
    try:
        import qrcode
        import socket
        import io
        from fastapi.responses import Response
        
        # Robust IP Detection
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            # Doesn't actually connect to 8.8.8.8, just determines the route
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except:
            local_ip = "127.0.0.1"
            
        mobile_url = f"https://{local_ip}:5000"
        
        # Generate QR
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(mobile_url)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save to BytesIO
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        return Response(content=img_byte_arr.getvalue(), media_type="image/png")
        
    except ImportError as e:
        logger.error(f"QR Gen Error (Missing Libraries): {e}")
        # Return a 1x1 pixel or explicit error text image if possible, 
        # but for now just JSON error so console shows it.
        return {"status": "error", "message": "Missing 'pillow' library. Run: pip install pillow"}
        
    except Exception as e:
        logger.error(f"QR Gen Error: {e}")
        return {"status": "error", "message": "Could not generate QR"}

# --- Automatic SSL Certificate Generation ---
def generate_self_signed_cert(cert_file="cert.pem", key_file="key.pem"):
    """
    Generates a self-signed SSL certificate and key if they don't exist.
    Requires: pip install cryptography
    """
    if os.path.exists(cert_file) and os.path.exists(key_file):
        print(f"✅ Found existing SSL certificate: {cert_file}, {key_file}")
        return

    print("⚠️  SSL certificate not found. Generating self-signed certificate...")
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        import datetime

        # Generate private key
        key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )

        # Generate certificate
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, u"KR"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, u"Seoul"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, u"Seoul"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"Mobile Guide System"),
            x509.NameAttribute(NameOID.COMMON_NAME, u"localhost"),
        ])

        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.utcnow()
        ).not_valid_after(
            # Valid for 10 years
            datetime.datetime.utcnow() + datetime.timedelta(days=3650)
        ).add_extension(
            x509.SubjectAlternativeName([x509.DNSName(u"localhost")]),
            critical=False,
        ).sign(key, hashes.SHA256())

        # Write key to file
        with open(key_file, "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            ))

        # Write cert to file
        with open(cert_file, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        print(f"✅ Generated new self-signed SSL certificate: {cert_file}, {key_file}")

    except ImportError:
        print("❌ 'cryptography' library not found. Cannot generate SSL cert.")
        print("   Please run: pip install cryptography")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error generating SSL cert: {e}")
        sys.exit(1)

if __name__ == "__main__":
    import uvicorn
    import socket
    
    # Generate SSL certs for HTTPS
    generate_self_signed_cert()

    # Get Local IP (Robust Method)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except:
        local_ip = "127.0.0.1"

    print("\n" + "="*50)
    print(f"🚀 Mobile Guide Server Running (HTTPS Mode)")
    print(f"💻 Local Access: https://localhost:5000")
    print(f"📱 Mobile Access: https://{local_ip}:5000")
    print("-" * 50)
    print("⚠️  IMPORTANT: Because this is a self-signed certificate:")
    print("   1. You will see a 'Not Secure' or 'Connection is not private' warning.")
    print("   2. Click 'Advanced' -> 'Proceed to...' (unsafe) to connect.")
    print("   3. Microphone permissions will now work on iOS and Android without flags!")
    print("="*50 + "\n")
    
    # QR Code Generation
    try:
        import qrcode
        import io
        
        # URL for mobile
        mobile_url = f"https://{local_ip}:5000"
        
        # Generate QR
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(mobile_url)
        qr.make(fit=True)
        
        print(f"📱 Scan this QR Code to connect ({mobile_url}):")
        print("")
        # 'invert=True' is usually better for dark terminals (white on black)
        qr.print_ascii(invert=True)
        print("")
        print("="*50)
        
    except ImportError:
        print("ℹ️  Install 'qrcode' library to see QR code here: pip install qrcode")
    except Exception as e:
        print(f"⚠️  Could not generate QR code: {e}")

    # Run with SSL
    uvicorn.run(
        sio_app, 
        host="0.0.0.0", 
        port=5000,
        ssl_keyfile="key.pem",
        ssl_certfile="cert.pem"
    )
