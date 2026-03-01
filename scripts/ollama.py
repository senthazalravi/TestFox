import platform
import subprocess
import sys
import time
import requests

MODEL = "qwen3-coder:30b"   # change to glm4 if needed

# -----------------------------
# Helper to run shell commands
# -----------------------------
def run(cmd):
    print(f"\n➡️ Running: {cmd}")
    subprocess.run(cmd, shell=True, check=True)

# -----------------------------
# Install Ollama per OS
# -----------------------------
def install_ollama():
    os_name = platform.system()
    print(f"🖥 Detected OS: {os_name}")

    if os_name == "Darwin":  # macOS
        run("brew install ollama")

    elif os_name == "Linux":
        run("curl -fsSL https://ollama.com/install.sh | sh")

    elif os_name == "Windows":
        run("winget install Ollama.Ollama")

    else:
        print("❌ Unsupported OS")
        sys.exit(1)

# -----------------------------
# Start Ollama server
# -----------------------------
def start_server():
    print("\n🚀 Starting Ollama server...")

    os_name = platform.system()

    if os_name in ["Linux", "Darwin"]:
        # Run server in background
        subprocess.Popen(
            "ollama serve",
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

    elif os_name == "Windows":
        print("⚠ On Windows, Ollama server starts automatically after install.")
        print("If not, open Ollama app once.")

    time.sleep(4)

# -----------------------------
# Pull model
# -----------------------------
def pull_model():
    print(f"\n📥 Pulling model: {MODEL}")
    run(f"ollama pull {MODEL}")

# -----------------------------
# Test the running server
# -----------------------------
def test_model():
    print("\n🧪 Testing model via API...")

    url = "http://localhost:11434/api/generate"
    payload = {
        "model": MODEL,
        "prompt": "Say hello Ravi, Ollama is working!",
        "stream": False
    }

    try:
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            print("\n✅ Model Response:")
            print(response.json()["response"])
        else:
            print("❌ API Error:", response.text)

    except Exception as e:
        print("❌ Could not reach Ollama server.")
        print("Error:", e)

# -----------------------------
# Main
# -----------------------------
if __name__ == "__main__":
    install_ollama()
    start_server()
    pull_model()

    print("\n✅ Ollama is now serving the model!")
    print("Server running at: http://localhost:11434")

    test_model()

    print("\n🔥 Done. Ollama is running in the background.")
    print(f"You can now call the model anytime with:\n  ollama run {MODEL}")
