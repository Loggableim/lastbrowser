"""Examine the structure of a Python venv launcher .exe file."""
import os
import re
import sys

path = sys.argv[1]
size = os.path.getsize(path)
print(f"File size: {size} bytes")

with open(path, 'rb') as f:
    # Read last 800 bytes
    f.seek(-800, 2)
    data = f.read()

print(f"\nLast 800 bytes analyzed:")
print(f"Total chunk size: {len(data)} bytes")

# Find magic numbers
for magic in [b'UVSC', b'UVPY']:
    idx = data.find(magic)
    if idx >= 0:
        print(f"\nFound magic '{magic.decode()}' at offset {idx} from end ({size - 800 + idx} absolute)")
        # Show context around it
        start = max(0, idx - 200)
        end = min(len(data), idx + 20)
        chunk = data[start:end]
        strings = re.findall(b'[\\x20-\\x7e]{4,}', chunk)
        for s in strings:
            print(f"  string: {s.decode('utf-8', errors='replace')}")
    else:
        print(f"Magic '{magic.decode()}' not found in last 800 bytes")

# Also look for the old path anywhere in the file
print(f"\nLooking for old path pattern...")
with open(path, 'rb') as f:
    all_data = f.read()
    
old_path = b'C:\\Users\\logga\\AppData\\Local\\hermes'
idx = all_data.find(old_path)
if idx >= 0:
    print(f"Found old path at offset {idx}")
    # Show 100 bytes before and after
    start = max(0, idx - 20)
    end = min(len(all_data), idx + len(old_path) + 20)
    print(f"Context: {all_data[start:end]}")
    
    # How many times?
    count = all_data.count(old_path)
    print(f"Occurrences of old path: {count}")
    
    # Also check for the venv Scripts path
    scripts_path = b'C:\\Users\\logga\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\python.exe'
    count2 = all_data.count(scripts_path)
    print(f"Occurrences of full python.exe path: {count2}")
    idx2 = all_data.find(scripts_path)
    if idx2 >= 0:
        start = max(0, idx2 - 20)
        end = min(len(all_data), idx2 + len(scripts_path) + 30)
        print(f"Context around python.exe path: {all_data[start:end]}")
