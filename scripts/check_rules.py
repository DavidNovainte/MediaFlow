import os
import re

def check_file_rules(directory):
    violations = []
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if '.git' in dirs:
            dirs.remove('.git')
        
        for file in files:
            if file.endswith(('.js', '.html')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                        # Check file length
                        if len(lines) > 300:
                            violations.append(f"[文件过长] {filepath}: {len(lines)} 行")
                        
                        # Simple function length check for JS
                        if file.endswith('.js'):
                            content = "".join(lines)
                            # Basic regex to find function blocks
                            # This is a simplification but helps identify major issues
                            functions = re.finditer(r'(function\s+\w*|async\s+function\w*|\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>)\s*\{', content)
                            for match in functions:
                                start_pos = match.start()
                                brace_count = 0
                                function_content = ""
                                found_start = False
                                for i in range(start_pos, len(content)):
                                    char = content[i]
                                    function_content += char
                                    if char == '{':
                                        brace_count += 1
                                        found_start = True
                                    elif char == '}':
                                        brace_count -= 1
                                    
                                    if found_start and brace_count == 0:
                                        break
                                
                                func_lines = function_content.count('\n') + 1
                                if func_lines > 50:
                                    # Get function name/preview
                                    line_num = content[:start_pos].count('\n') + 1
                                    func_preview = match.group(0).strip()
                                    violations.append(f"[函数过长] {filepath}:{line_num} ({func_preview}): {func_lines} 行")
                except Exception as e:
                    violations.append(f"[错误] 无法读取 {filepath}: {str(e)}")
    return violations

if __name__ == "__main__":
    src_dir = r"f:\Codage\VideoDownloader\MediaFlow\src"
    services_dir = r"f:\Codage\VideoDownloader\MediaFlow\services"
    
    all_violations = []
    all_violations.extend(check_file_rules(src_dir))
    all_violations.extend(check_file_rules(services_dir))
    
    if not all_violations:
        print("未发现违反 300/50 规则的文件。")
    else:
        for v in all_violations:
            print(v)
