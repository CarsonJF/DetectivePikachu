import os
import subprocess
import sys

def main():
    # Check if node environment already exists
    env_dir = os.path.join(os.getcwd(), "node_env")
    
    if not os.path.exists(env_dir):
        print("==> Node.js environment not found. Installing via nodeenv...")
        # create Node.js environment
        subprocess.run([sys.executable, "-m", "nodeenv", env_dir], check=True)
    
    # Path to the nodeenv bin directory
    node_bin = os.path.join(env_dir, "bin")
    
    # Update PATH to include the nodeenv bin so tools like npm and node can be found
    os.environ["PATH"] = f"{node_bin}:{os.environ.get('PATH', '')}"
    
    print("==> Installing / Updating npm dependencies...")
    # Using npm ci if package-lock is present, else npm i
    if os.path.exists("package-lock.json"):
        subprocess.run(["npm", "ci"], check=True)
    else:
        subprocess.run(["npm", "install"], check=True)
        
    print("==> Starting Detective Pikachu bot...")
    # Executing the npm start script
    # Replaces the current process with the node process for better signal handling
    sys.stdout.flush()
    os.execvp("npm", ["npm", "start"])

if __name__ == "__main__":
    main()
