import urllib.request
import time

url = "http://localhost:8000/stream/capnut/measure"
print(f"Connecting to {url}...")

try:
    start_time = time.time()
    with urllib.request.urlopen(url, timeout=5) as response:
        print("Connected! Reading response...")
        content_type = response.headers.get("Content-Type")
        print(f"Content-Type: {content_type}")
        
        # Read first 500 KB of the stream
        data = response.read(500000)
        print(f"Successfully read {len(data)} bytes of stream.")
        print(f"Time taken: {time.time() - start_time:.2f} seconds")
        
        # Look for multipart frames
        frame_count = data.count(b"--frame")
        print(f"Found {frame_count} frame markers in the data block.")
        
except Exception as e:
    print(f"Failed to read stream: {e}")
