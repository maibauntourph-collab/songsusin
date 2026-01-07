import http.client
import os

filename = "test_upload.xlsx"
boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"

# Basic Multipart construction
with open(filename, "rb") as f:
    file_content = f.read()

part_header = (
    f'--{boundary}\r\n'
    f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
    f'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'
)
part_footer = f'\r\n--{boundary}--\r\n'

body_bytes = part_header.encode('utf-8') + file_content + part_footer.encode('utf-8')

headers = {
    'Content-Type': f'multipart/form-data; boundary={boundary}',
    'Content-Length': str(len(body_bytes))
}

print(f"Attempting upload to localhost:5000 with {len(body_bytes)} bytes...")

try:
    conn = http.client.HTTPConnection("localhost", 5000, timeout=5)
    conn.request("POST", "/upload_places", body=body_bytes, headers=headers)
    response = conn.getresponse()
    print(f"Status: {response.status}")
    data = response.read().decode('utf-8', errors='replace')
    print("Response Body First 500 chars:")
    print(data[:500])
    conn.close()
except Exception as e:
    print(f"Connection Error: {e}")
