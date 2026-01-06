
import asyncio
import socketio

sio = socketio.AsyncClient()

@sio.event
async def connect():
    print("Guide Simulator Connected")
    await sio.emit('join_room', {'role': 'guide'})
    # Send a transcript message
    print("Sending transcript...")
    await sio.emit('transcript_msg', {'text': '안녕하세요 테스트입니다.', 'isFinal': True})

async def main():
    await sio.connect('http://localhost:3000')
    await asyncio.sleep(2) # Give time to connect and send
    await sio.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
