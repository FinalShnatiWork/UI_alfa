import os
import shutil
import subprocess
import time

PROJECT_ROOT = r"c:\Users\david\Downloads\agents farm"
EXE_NAME = "AgentGreenhouse.exe"
SRC = os.path.join(PROJECT_ROOT, "dist", EXE_NAME)
DST = os.path.join(PROJECT_ROOT, EXE_NAME)

def deploy():
    print(f"Deploying {EXE_NAME}...")
    
    # 1. Kill the process if running
    print("Attempting to close the running application...")
    try:
        subprocess.run(["taskkill", "/F", "/IM", EXE_NAME], capture_output=True)
        time.sleep(1) # Wait for file lock to release
    except:
        pass
        
    # 2. Move the file
    if os.path.exists(SRC):
        try:
            print(f"Moving {SRC} to {DST}...")
            shutil.move(SRC, DST)
            print("Deployment successful!")
        except Exception as e:
            print(f"Deployment failed: {e}")
    else:
        print(f"Error: {SRC} not found. Did the build finish?")

if __name__ == "__main__":
    deploy()
