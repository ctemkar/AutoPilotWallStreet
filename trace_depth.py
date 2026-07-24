
content = open('/Users/chetantemkar/development/rmworkz-coder/DiffferentTradingStrategies/app/MarketTerminal.tsx').readlines()
depth = 0
for i, line in enumerate(content):
    line_num = i + 1
    if line_num < 3393: continue
    if line_num > 4652: break
    
    old_depth = depth
    depth += line.count('{')
    depth -= line.count('}')
    
    if line_num >= 4635 and line_num <= 4655:
        print(f"Line {line_num}: depth {depth} | {line.strip()}")
