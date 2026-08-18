import os
import shutil
import json
import argparse
import sys

# Default Hugging Face cache directory
# On Windows usually: C:\Users\User\.cache\huggingface\hub
CACHE_DIR = os.path.join(os.path.expanduser('~'), '.cache', 'huggingface', 'hub')

# Known models mapping for friendly names
KNOWN_MODELS = {
    "models--Systran--faster-whisper-tiny": "Tiny",
    "models--Systran--faster-whisper-base": "Base",
    "models--Systran--faster-whisper-small": "Small",
    "models--Systran--faster-whisper-medium": "Medium",
    "models--Systran--faster-whisper-large-v2": "Large-v2",
    "models--Systran--faster-whisper-large-v3": "Large-v3",
    "models--deepdml--faster-whisper-large-v3-turbo-ct2": "Large-v3 Turbo",
}

def get_folder_size(path):
    total = 0
    try:
        with os.scandir(path) as it:
            for entry in it:
                if entry.is_file():
                    total += entry.stat().st_size
                elif entry.is_dir():
                    total += get_folder_size(entry.path)
    except Exception:
        pass
    return total

def format_size(size):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"

def list_models():
    models = []
    
    if not os.path.exists(CACHE_DIR):
        print(json.dumps([]))
        return

    try:
        entries = os.listdir(CACHE_DIR)
        for entry in entries:
            path = os.path.join(CACHE_DIR, entry)
            if not os.path.isdir(path):
                continue
                
            # Filter for faster-whisper models
            if "faster-whisper" not in entry:
                continue

            friendly_name = KNOWN_MODELS.get(entry, entry.replace("models--", "").replace("--", "/"))
            
            size = get_folder_size(path)
            # Only list valid models (size > 0 eventually, but empty folders exist?)
            # Just list everything matching pattern.

            models.append({
                "id": entry,
                "name": friendly_name,
                "size": format_size(size),
                "raw_size": size,
                "path": path
            })
            
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return

    print(json.dumps(models))

def delete_model(folder_name):
    # Security check: folder_name must be a single directory name, not a path
    if os.sep in folder_name or ".." in folder_name:
         print(json.dumps({"success": False, "error": "Invalid model name"}))
         return

    path = os.path.join(CACHE_DIR, folder_name)
    
    if os.path.exists(path):
        try:
            shutil.rmtree(path)
            print(json.dumps({"success": True}))
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}))
    else:
        print(json.dumps({"success": False, "error": "Model not found"}))

def download_model_func(model_name):
    try:
        from faster_whisper import download_model 
        # Redirect stdout to stderr to avoid JSON corruption, or just trust faster_whisper prints to stderr
        # But we want to print JSON at the end.
        
        # Mapping for custom models if needed, though faster_whisper handles HF paths
        actual_name = model_name
        if model_name == "large-v3-turbo":
             actual_name = "deepdml/faster-whisper-large-v3-turbo-ct2"

        print(f"Downloading {actual_name}...", file=sys.stderr)
        path = download_model(actual_name)
        print(json.dumps({"success": True, "path": path}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["list", "delete", "download"])
    parser.add_argument("--model", help="Model folder name to delete or download")
    args = parser.parse_args()

    if args.action == "list":
        list_models()
    elif args.action == "delete":
        if not args.model:
            print(json.dumps({"success": False, "error": "No model specified"}))
        else:
            delete_model(args.model)
    elif args.action == "download":
        if not args.model:
             print(json.dumps({"success": False, "error": "No model specified"}))
        else:
             download_model_func(args.model)
