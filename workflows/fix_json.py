import re
import os

file_path = r'c:\Users\Usuario\Desktop\REPOSITORIOS\CTT LAST MILE\ctt-sauk\workflows\main.json'

with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# We look for the start of the rupture
start_marker = "### REGLA MULTIBULTO (CRITICO)"
end_marker = '### SALIDA JSON (SOLO JSON)""'

start_idx = text.find(start_marker)
end_idx = text.find(end_marker)

if start_idx != -1 and end_idx != -1:
    # Capturamos la sección que tiene saltos de línea literales
    mid_section = text[start_idx : end_idx]
    
    # Escapamos los saltos de línea
    fixed_mid = mid_section.replace('\n', '\\n').replace('\r', '')
    
    # Unimos y arreglamos las comillas finales
    final_end = '### SALIDA JSON (SOLO JSON)"'
    
    new_text = text[:start_idx] + fixed_mid + final_end + text[end_idx + len(end_marker):]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_text)
    print("SUCCESS")
else:
    print(f"FAILED: markers not found. start={start_idx}, end={end_idx}")
