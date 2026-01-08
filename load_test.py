import asyncio
import socketio
import time

# Number of tourists to simulate
NUM_TOURISTS = 60
SERVER_URL = "http://localhost:5000"

async def start_tourist(idx):
    sio = socketio.AsyncClient()
    
    @sio.event
    async def connect():
        # print(f"[Tourist #{idx}] Connected")
        await sio.emit('join_room', {'role': 'tourist'})

    @sio.event
    async def guide_status(data):
        status = "Online" if data['online'] else "Offline"
        print(f"[Tourist #{idx}] Guide Status: {status}")

    @sio.event
    async def transcript(data):
        print(f"[Tourist #{idx}] Received Transcript: {data['original'][:20]}...")

    try:
        await sio.connect(SERVER_URL)
        await sio.wait()
    except Exception as e:
        print(f"[Tourist #{idx}] Connection Error: {e}")

async def main():
    print(f"Starting Load Test with {NUM_TOURISTS} Tourists...")
    tasks = []
    for i in range(1, NUM_TOURISTS + 1):
        tasks.append(start_tourist(i))
        # Stagger slightly
        await asyncio.sleep(0.1)
    
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Test Stopped")
