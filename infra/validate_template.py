"""Static validation for the AETHER PITCH ARM template.

Checks JSON validity, ARM expression symbol resolution, dependsOn integrity
and resource-shape basics. Does not require an Azure subscription.
"""
import json
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
path = root / "infra" / "main.json"
raw = path.read_text(encoding="utf-8")

failures = []


def check(name, cond, detail=""):
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" - {detail}" if detail else ""))
    if not cond:
        failures.append(name)


try:
    tpl = json.loads(raw)
except json.JSONDecodeError as exc:
    print(f"[FAIL] template JSON parses - {exc}")
    sys.exit(1)

check("template JSON parses", True)
check("schema + contentVersion present",
      "$schema" in tpl and "contentVersion" in tpl)

resources = tpl.get("resources", [])
check("resources declared", len(resources) > 0, f"{len(resources)} resources")
check("outputs declared", len(tpl.get("outputs", {})) > 0,
      ", ".join(tpl.get("outputs", {}).keys()))

# --- ARM expression symbol resolution -------------------------------------
# Only variables()/parameters() reference a bare named symbol. The other
# functions take a resource type, a resource name or a literal.
symbol_re = re.compile(r"\b(?:variables|parameters)\('([A-Za-z0-9_\-]+)'\)")
resource_ref_re = re.compile(
    r"\b(?:resourceId|reference|subscriptionResourceId)\('([^']+)',\s*'?([A-Za-z0-9_\-]+)'?\)"
)
used = set()
for match in symbol_re.finditer(raw):
    used.add(match.group(1))

defined = set(tpl.get("variables", {})) | set(tpl.get("parameters", {}))
defined |= {r["name"] for r in resources}
undefined = sorted(s for s in used if s not in defined)
check("every ARM expression symbol is defined", not undefined, str(undefined))

# --- dependsOn integrity -------------------------------------------------
names = {r["name"] for r in resources}
dangling = []
dep_re = re.compile(r"resourceId\('([^']+)',\s*'?([A-Za-z0-9_\-]+)'?\)")
for r in resources:
    for dep in r.get("dependsOn", []):
        m = dep_re.search(dep)
        if m and m.group(2) not in names:
            dangling.append((r["name"], dep))
check("every dependsOn targets a real resource", not dangling, str(dangling))

# resourceId()/reference() inside any expression must also resolve
unresolved_refs = []
for m in resource_ref_re.finditer(raw):
    rtype, rname = m.group(1), m.group(2)
    if rtype.startswith("Microsoft.") and rname not in names:
        unresolved_refs.append(f"{rtype}/{rname}")
check("every resourceId()/reference() resolves to a real resource",
      not unresolved_refs, str(sorted(set(unresolved_refs))))

# --- resource shape basics ------------------------------------------------
# Extension resources (e.g. Microsoft.Authorization/roleAssignments) are
# scoped to their parent and must NOT declare a location.
EXTENSION_TYPES = {
    "Microsoft.Authorization/roleAssignments",
    "Microsoft.Authorization/policyAssignments",
    "Microsoft.Insights/diagnosticSettings",
}
shape_ok = True
seen = set()
for r in resources:
    for key in ("type", "apiVersion", "name"):
        if key not in r:
            shape_ok = False
            print(f"       missing {key} on {r.get('name')}")
    if r["type"] not in EXTENSION_TYPES and "location" not in r:
        shape_ok = False
        print(f"       missing location on {r.get('name')}")
    if r["type"] in EXTENSION_TYPES and "location" in r:
        shape_ok = False
        print(f"       extension resource must not set location: {r.get('name')}")
    key = (r["type"], r["name"])
    if key in seen:
        shape_ok = False
        print(f"       duplicate resource {key}")
    seen.add(key)
check("every resource has type/apiVersion/name, unique, and a location unless it is an extension resource", shape_ok)

# --- container apps shape -------------------------------------------------
ca = [r for r in resources if r["type"] == "Microsoft.App/containerApps"]
check("two Container Apps (engine + studio)", len(ca) == 2, f"{len(ca)} found")
ca_ok = True
for app in ca:
    props = app.get("properties", {})
    cfg = props.get("configuration", {})
    tpl_block = props.get("template", {})
    if "managedEnvironmentId" not in props:
        ca_ok = False
    if "ingress" not in cfg:
        ca_ok = False
    containers = tpl_block.get("containers", [])
    if not containers:
        ca_ok = False
    for c in containers:
        for key in ("name", "image", "env", "resources"):
            if key not in c:
                ca_ok = False
                print(f"       container missing {key}")
    if "scale" not in tpl_block:
        ca_ok = False
check("Container Apps have ingress, env, scale and a container", ca_ok)

# --- secrets never land in plain parameters ------------------------------
secret_params = [
    n for n, p in tpl.get("parameters", {}).items()
    if p.get("type") == "securestring"
]
check("API keys use secureString parameters",
      "openAiApiKey" in secret_params and "translatorKey" in secret_params,
      ", ".join(secret_params))

# --- every engine env var the app reads is provisioned -------------------
engine = next((a for a in ca if "engine" in a["name"]), None)
if engine:
    env_names = {e["name"] for e in engine["properties"]["template"]["containers"][0]["env"]}
    required = {
        "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_API_VERSION",
        "AZURE_OPENAI_TRIAGE_DEPLOYMENT", "AZURE_OPENAI_NARRATIVE_DEPLOYMENT",
        "AZURE_TRANSLATOR_ENDPOINT", "AZURE_TRANSLATOR_KEY", "AZURE_TRANSLATOR_REGION",
    }
    check("engine provisions every Azure env var the app reads",
          required.issubset(env_names), str(sorted(required - env_names)))
else:
    check("engine container app found", False)

print()
if failures:
    print(f"RESULT: {len(failures)} FAILED -> {failures}")
    sys.exit(1)
print("RESULT: ARM TEMPLATE VALIDATION PASSED")
