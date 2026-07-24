import sys
import json
import argparse
import os
from pathlib import Path

# Try to import rembg and PIL
try:
    from rembg import remove, new_session
    from PIL import Image
except ImportError:
    print(json.dumps({"success": False, "error": "Required modules not found. Please run: pip install rembg pillow"}), file=sys.stdout)
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="MediaFlow Image Background Removal Service")
    parser.add_argument("--input", required=True, help="Input image file path")
    parser.add_argument("--output", required=True, help="Output image file path")
    parser.add_argument("--model", default="u2net", help="Model to use (u2net, u2netp, u2net_human_seg, etc.)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(json.dumps({"success": False, "error": f"Input file not found: {args.input}"}), file=sys.stdout)
        sys.exit(1)

    try:
        # Load the input image
        input_image = Image.open(args.input)
        
        # Create a session with the specified model (rembg 2.0+ API)
        session = new_session(args.model)
        
        # Remove the background using the session
        output_image = remove(input_image, session=session)
        
        # Save the result
        # Ensure output is PNG to support transparency
        output_path = Path(args.output)
        if output_path.suffix.lower() != '.png':
            output_path = output_path.with_suffix('.png')
            
        output_image.save(output_path)
        
        print(json.dumps({
            "success": True, 
            "output": str(output_path),
            "original_input": args.input
        }), file=sys.stdout)

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stdout)
        sys.exit(1)

if __name__ == "__main__":
    main()

