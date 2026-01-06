
import asyncio
import socketio
import time

sio = socketio.AsyncClient()

@sio.event
async def connect():
    print("Tourist Simulator Connected")
    await sio.emit('join_room', {'role': 'tourist'})

@sio.event
async def disconnect():
    print("Disconnected")

@sio.event
async def transcript(data):
    print(f"RECEIVED TRANSCRIPT: {data}")

async def main():
    await sio.connect('http://localhost:3000')
    print("Waiting for events...")
    # Keep running to listen
    await asyncio.sleep(10)
    await sio.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
