import os
import subprocess
import sys

PROJECT_ROOT = r"c:\Users\david\Downloads\agents farm"

def run():
    print(f"Changing directory to {PROJECT_ROOT}...")
    os.chdir(PROJECT_ROOT)
    
    # We already built the frontend manually, but let's make sure
    # build_app.py logic is followed. 
    # Actually, build_app.py builds the frontend AND the exe.
    
    print("Running build_app.py...")
    subprocess.run([sys.executable, "build_app.py"], check=True)
    print("Build complete!")

if __name__ == "__main__":
    run()
