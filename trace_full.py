
content = open('/Users/chetantemkar/development/rmworkz-coder/DiffferentTradingStrategies/app/MarketTerminal.tsx').readlines()
depth = 0
for i, line in enumerate(content):
    line_num = i + 1
    depth += line.count('{')
    depth -= line.count('}')
    
    if depth < 0:
        print(f"Brace underflow at line {line_num}: depth {depth}")
        depth = 0
    
    if line_num >= 5820 and line_num <= 5860:
         print(f"Line {line_num}: depth {depth} | {line.strip()}")

print(f"Final depth: {depth}")
