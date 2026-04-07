import re
import sys

with open('prisma/schema.prisma', 'r') as f:
    content = f.read()

# 1. Change provider to sqlite and url to file:./dev.db
content = re.sub(r'provider = "postgresql"', 'provider = "sqlite"', content)
content = re.sub(r'url      = env\("DATABASE_URL"\)', 'url      = "file:./dev.db"', content)

# 2. Find all enums to replace them in models
enum_names = re.findall(r'enum (\w+) \{', content)
print(f"Found enums: {enum_names}")

# 3. Comment out enum blocks
for enum_name in enum_names:
    pattern = rf'enum {enum_name} \{{[\s\S]*?\}}'
    content = re.sub(pattern, lambda m: f"// {m.group(0).replace('\n', '\n// ')}", content)

# 4. Replace enum types in models with String and update @default(...)
for enum_name in enum_names:
    # Match: fieldName  EnumName  @default(VALUE)
    # Group 1: whitespace before EnumName, Group 2: EnumName, Group 3: whitespace after, Group 4: @default(VALUE) or nothing
    # This is tricky due to Prisma's optional defaults and attributes.
    # We'll do a simpler replacement for now and fix if needed.
    content = re.sub(rf'\b{enum_name}\b', 'String', content)

# 5. Fix @db.Text (SQLite doesn't need it or use it as TEXT)
content = content.replace('@db.Text', '')

with open('prisma/schema.sqlite.prisma', 'w') as f:
    f.write(content)

print("Created prisma/schema.sqlite.prisma")
