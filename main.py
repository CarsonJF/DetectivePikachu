import os
import subprocess
import sys

def main():
    # Check if node environment already exists
    env_dir = os.path.join(os.getcwd(), "node_env")
    
    if not os.path.exists(env_dir):
        print("==> Node.js environment not found. Installing via nodeenv...")
        # Check if nodeenv is installed
        try:
            subprocess.run([sys.executable, "-m", "nodeenv", "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        except subprocess.CalledProcessError:
            print("ERROR: 'nodeenv' is not installed! Run: pip install nodeenv")
            sys.exit(1)
            
        # create Node.js environment
        subprocess.run([sys.executable, "-m", "nodeenv", env_dir], check=True)
    
    # Path to the nodeenv bin/Scripts directory
    if os.name == 'nt': # Windows
        node_bin = os.path.join(env_dir, "Scripts")
    else:               # Linux / Pterodactyl
        node_bin = os.path.join(env_dir, "bin")
    
    # Update PATH to include the nodeenv bin so tools like npm and node can be found
    os.environ["PATH"] = f"{node_bin}{os.pathsep}{os.environ.get('PATH', '')}"
    
    # Helper to resolve npm command path appropriately on Windows
    npm_cmd = "npm.cmd" if os.name == 'nt' else "npm"

    print("==> Installing / Updating npm dependencies...")
    # Always use npm install since npm ci will crash if the user modifies package.json without updating package-lock.json locally
    subprocess.run([npm_cmd, "install"], check=True)
    
    print("==> Rebuilding native modules (fixes better-sqlite3 errors)...")
    subprocess.run([npm_cmd, "rebuild"], check=True)
        
    print("==> Starting Detective Pikachu bot...")
    # Executing the npm start script
    sys.stdout.flush()
    if os.name == 'nt':
        # On Windows, os.execvp might not handle shell builtins cleanly, so we use subprocess
        subprocess.run([npm_cmd, "start"], check=True)
    else:
        # Replaces the current process with the node process for better signal handling
        os.execvp(npm_cmd, [npm_cmd, "start"])

if __name__ == "__main__":
    main()
