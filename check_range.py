import sys

content = open('/Users/chetantemkar/development/rmworkz-coder/DiffferentTradingStrategies/app/MarketTerminal.tsx').readlines()
def check(start, end):
    subset = "".join(content[start-1:end])
    o = subset.count('{')
    c = subset.count('}')
    print(f"{start}-{end}: Open {o}, Close {c}, Diff {o-c}")

check(4556, 4642)
